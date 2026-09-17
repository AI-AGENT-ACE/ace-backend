# Database와 초기 Migration 검토

초기 Migration: `prisma/migrations/202609170001_initial/migration.sql`.

Prisma Schema에서 아래 명령으로 SQL을 생성한 후 검토했습니다. 빈 PostgreSQL 데이터베이스에만 새 테이블·Enum·Index·Foreign Key를 생성하며 기존 테이블을 Drop하거나 데이터를 복사하지 않습니다.

```powershell
node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/202609170001_initial/migration.sql
npm run db:migrate:deploy
```

## 모델

| 모델             | 책임                                  | 삭제 관계                         |
| ---------------- | ------------------------------------- | --------------------------------- |
| User             | 이메일·표시 이름·비밀번호 해시        | 계정 하위 데이터 Cascade          |
| AuthSession      | Account 단위 Refresh Digest·만료·폐기 | User 삭제 시 Cascade              |
| Conversation     | 제목·고정·활동 시각·Soft Delete       | User 삭제 시 Cascade              |
| Message          | Enum Role·내용·생성 시각              | Conversation 영구 삭제 시 Cascade |
| AgentSettings    | 응답 언어·TTS 선호도                  | User 삭제 시 Cascade              |
| Permission       | 사용자별 Tool 선호 정책               | User 삭제 시 Cascade              |
| ToolExecutionLog | 최소 실행 메타데이터                  | User 삭제 시 userId SetNull       |

`AuthSession`은 요구사항의 Refresh Token 관리 목적입니다. OS/Platform/Device 데이터는 저장하지 않습니다. `isPinned`는 기존 ACE 화면의 대화 고정 연동을 위한 Account 대화 필드입니다.

로그 상태와 메시지 Role, Permission Policy는 Prisma Enum입니다. 사용자 이메일은 입력 단계에서 소문자로 정규화합니다. 일반 사용자 ID와 데이터 ID는 CUID, 인증 세션 ID는 UUID입니다.

## Index와 Query

대화 목록은 `userId + deletedAt + updatedAt + id`, 메시지는 `conversationId + createdAt + id` Index를 사용합니다. 시각이 같은 레코드에도 `id`를 두 번째 정렬 기준으로 사용해 커서 페이지 조회가 안정적으로 동작합니다.

휴지통 만료 정리를 위해 `deletedAt` Index를 추가했습니다. Session은 사용자별 폐기 상태·만료 조회, Permission은 `(userId, toolName)` Unique, 로그는 사용자별 시각과 Tool별 시각 Index를 사용합니다. 불필요한 PC 환경 Index나 Device Relation은 없습니다.

메시지 응답은 최신순이며 기본 30개, 최대 100개입니다. Query는 `limit + 1`개만 읽어 다음 페이지 여부를 계산합니다. 대화 활동 시각이 변경되면 일반 목록 순서도 최신 활동순으로 바뀝니다. 목록 페이지 요청 도중 활동이 발생하면 새로고침으로 목록을 다시 동기화합니다.

## Soft Delete와 동시성

일반 대화·메시지 API는 `deletedAt = null`만 처리합니다. 휴지통 API는 `deletedAt != null`만 반환하며 만료 시각·남은 일수·복구 가능 여부를 제공합니다. 정확히 30일이 지난 대화부터 복구를 거부합니다. 만료된 데이터는 정리 작업 실행 전까지 휴지통에 보일 수 있지만 복구할 수는 없습니다.

복구와 영구 삭제는 조회 후 최종 Write에도 사용자와 삭제 상태 조건을 다시 적용합니다. 영구 삭제는 휴지통에 있는 대화에만 허용합니다. 만료 정리도 최종 Delete에 만료 조건을 다시 적용하므로 동시에 복구된 대화를 삭제하지 않습니다.

메시지 저장 트랜잭션은 사용자 소유의 활성 부모 대화를 조건부 Update한 뒤 Message를 생성합니다. Soft Delete와 동일 Row Lock을 사용해 삭제 이후 메시지 저장을 막고 활동 시각 변경과 Message 생성의 원자성을 유지합니다.

## 운영 적용

Schema 수정 → `migrate dev --create-only` → SQL 검토 → 개발/테스트 DB 적용 → 운영 `migrate deploy` 순서를 사용합니다. 검토된 SQL과 `migration_lock.toml`은 버전 관리하며 `.env`와 `.local` 데이터는 제외합니다.

운영에서 `db push`나 서버 시작 시 자동 Migration을 실행하지 않습니다. 배포 단계에서 Migration을 한 번 실행한 뒤 애플리케이션 인스턴스를 시작하세요.
