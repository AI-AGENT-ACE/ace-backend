# 로컬 개발 DB 백업·복원 — 2026-10-22

이번 결과는 로컬 PostgreSQL 복원이며 운영 Neon 백업·복원 결과가 아니다. 기존 Native·음성·덮어쓰기 시험은 재실행하지 않음.

## 실제 실행

- `scripts/verify-local-restore.mjs` 실행. localDatabases 정책으로 개발/테스트 URL이 로컬이며 서로 다른 DB인지 검증. 비밀값 출력 없음.
- PostgreSQL/pg_dump 18.6. 개발 DB에서 REPEATABLE READ READ ONLY 트랜잭션과 exported snapshot을 생성하여 같은 시점의 행 수·구조·migration과 custom-format pg_dump를 비교.
- 새 DB `ace_restore_525089a9b54c4bc59eadc2d2bf70dcc2`를 template0로 생성. 기존 개발 ace 및 테스트 ace_test 초기화·덮어쓰기 없음.
- pg_restore --exit-on-error --single-transaction 사용. 앱 연결 없음: startup/cron 휴지통·첨부 정리가 복원 데이터에 실행되지 않음.
- 생성 완료: 2026-10-22T07:53:32.249Z. 별도 읽기 전용 Prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code도 종료 코드 0.

## 비교 결과

| 테이블                   | 개발 스냅샷 = 복원 행 수 |
| ------------------------ | -----------------------: |
| AgentSettings            |                        7 |
| AiConversation           |                        9 |
| Attachment               |                        1 |
| AuthSession              |                       20 |
| Conversation             |                       12 |
| FileDeletionJob          |                        0 |
| Message                  |                      148 |
| NativeExecution          |                      120 |
| NativeExecutionEvent     |                      532 |
| Permission               |                        4 |
| ToolExecutionLog         |                       29 |
| User                     |                        7 |
| VoiceCommandExecutionLog |                        6 |
| _prisma_migrations       |                        9 |

- 14개 테이블 행 수·컬럼 정의·NULL/default 속성 일치.
- 제약조건 103개, 외래키 12개, 인덱스 36개 정의 일치. 제약조건 모두 validated, 복원 과정의 FK/unique 생성 성공.
- migration 이름·checksum·완료/rollback·적용 단계 기록 일치. 저장소 9개 migration SQL checksum과도 일치, 미완료 이력 없음.
- 작업 후 개발 DB 행 수도 동일. 기존 테스트 DB는 비교/변경 대상이 아님.
- 행 수와 제약/스키마 비교이며 모든 셀의 내용 해시 비교·모든 API 시나리오 재실행은 아님.

## 백업 보안과 한계

- 파일: `.local/backups/ace_restore_525089a9b54c4bc59eadc2d2bf70dcc2/development.dump`, 73,555 bytes.
- SHA-256: c6895e0660ef314a73f75d90d86a98da73dbc9b3d00cdfb713b0e74b0aabc846.
- report.json/schema-check.json도 같은 디렉터리. ACL 상속 제거, 현재 사용자와 SYSTEM 허용 2개 규칙/상속 규칙 0 확인. Git check-ignore로 dump/report 제외 확인. 제한 ACL로 sandbox 쓰기가 거부돼 승인된 실행에서 결과 저장; ACL을 풀지 않음.
- .dockerignore에도 .local/artifacts/백업/비밀 파일 확장자 제외 추가. Git 제외만으로 Docker 컨텍스트가 보호되는 것으로 간주하지 않음.
- no-owner/no-privileges 사용: 원래 역할/소유권/권한의 복제 시험이 아님. 새 복원 DB의 PUBLIC CONNECT는 제거. OS 관리자·PostgreSQL 관리자에 대한 격리/암호화 백업을 의미하지 않음.
- Attachment 메타데이터 1행은 복원됐으나 외부/로컬 저장 파일 바이트는 백업 대상 아님. 운영 장기 보존 첨부 없음이라는 기존 합의를 뒤집지 않음.
- 백업과 복원 DB는 검토용으로 보존. 삭제를 실행하지 않음. 복원 DB를 개발/운영 DATABASE_URL로 설정하지 않음.

## 판정

로컬 백업·별도 DB 복원·행 수/관계/제약/migration/Prisma 스키마 대조 통과. 운영 Neon 복원, 역할 복원, 첨부 파일 복원, 운영 API 성공은 미검증.
