# 로컬 PostgreSQL 수정 및 통합 검증 — 2026-10-15

## 원인과 수정

- Windows의 기존 PostgreSQL 18.6 서비스는 정상 실행 중이며 개발 DB 접속 성공.
- `.env`의 `TEST_DATABASE_URL` 사용자 이름이 개발 연결과 달랐고, PostgreSQL에 해당 역할이 존재하지 않아 `28P01` 인증 실패.
- 테스트 DB `ace_test`도 존재하지 않았음. 정상 로컬 자격 증명으로 확인했을 때 `3D000`으로 별도 확인.
- 기존 서비스·클러스터·역할 암호·개발 URL은 변경하지 않음. `ace_test` 생성 후 `.env`의 `TEST_DATABASE_URL` 한 항목만 정상 로컬 계정으로 수정.
- `ace`와 `ace_test`는 같은 로컬 인스턴스의 별도 DB. 현재 접속 계정은 공유하므로 역할 권한까지 분리한 구성은 아님.
- 테스트 실행기에 공통 보호 조건 추가: production 거부, loopback PostgreSQL만 허용, 개발/테스트 DB 이름 동일하면 거부, 테스트 DB `_test` 접미사 확인.
- 운영 Render·Neon에 접속하거나 변경하지 않음. 비밀번호·토큰·전체 접속 URL을 출력하지 않음.

## Migration 및 보존

- 개발 DB: 기존 7개 적용 상태 확인 후 `202610130002_file_deletion_jobs`, `202610130003_native_execution_trace` 적용.
- 테스트 DB: 빈 별도 DB에 저장소의 9개 migration을 `prisma migrate deploy`로 적용.
- 두 DB 모두 9개 성공 기록 확인. 미완료·롤백 상태 없음.
- 개발 DB 기존 10개 테이블의 migration 전후 행 수 일치 확인. 데이터 내용 자체를 출력하지 않음.
- `migrate reset`, `db push`, `DROP DATABASE`, `TRUNCATE`, 기존 데이터 전체 삭제를 사용하지 않음.
- 테스트 종료 시 이번 실행이 생성한 무작위 계정 ID에 속하는 테스트 자료만 정리.

## 실제 PostgreSQL 통합 테스트: 7개 통과

1. HTTP로 대화 삭제·휴지통 조회·복구, 메시지 보존 확인.
2. 만료 대화만 삭제, 메시지 연쇄 정리, 최근 휴지통·정상 대화 보존, 반복 정리 멱등성 확인.
3. 복구 트랜잭션이 먼저 행을 잠근 상태에서 정리 시작 → PostgreSQL lock wait 관찰 → 복구 커밋 후 정리 대상 재검사·보존 확인.
4. 시작 시 백그라운드 정리 훅으로 101개 만료 대화를 두 묶음 이상 처리, 정상·복구 대화 보존 확인.
5. 삭제 트랜잭션이 먼저 행을 잠근 상태에서 복구 시작 → 실제 lock wait 관찰 → 삭제 커밋 후 복구 count 0 확인.
6. HTTP 실행 추적 생성·저장·조회, 타 사용자 차단, 동시 동일 이벤트 단일 저장, 종료 상태 변경 거부 확인.
7. 최종 결과 동시 두 번 제출 → 201 하나·409 하나, 실행 로그·도구 메시지·AI 후속 호출 각각 한 번 확인.

DB와 NestJS HTTP·인증·티켓·저장 계층은 실제 구현 사용. 외부 AI만 테스트 응답으로 대체했으며 원격 AI에 요청하지 않음. 만료 경합 시험은 복구 요청이 유효 기간 안에 시작한 후 정리 시점에 경계를 넘는 상황을 서로 다른 기준 시각으로 재현함.
시작 정리는 실제 서비스의 bootstrap 훅을 호출한 시험이며 PostgreSQL 서비스 자체를 종료/재시작한 시험은 아님.

## 다시 실행

`ace-backend` 폴더에서:

```powershell
npm run test:e2e -- --runTestsByPath test/local-postgres.e2e-spec.ts
node --test scripts/local-database-policy.test.mjs
```

첫 명령은 개발 DB가 아닌 `TEST_DATABASE_URL`의 로컬 테스트 DB에 필요한 migration만 적용하고 지정한 7개 시험을 실행함. 이번에는 기존 전체 `backend.e2e-spec.ts`를 실행하지 않았음.
Prisma 실행 파일이 샌드박스에서 EPERM으로 차단돼 정식 실행 승인을 받아 실행함.

## 사용자 설정 및 남은 범위

- 현재 PC는 추가 비밀값 설정 필요 없음. PostgreSQL Windows 서비스가 실행 중이어야 함.
- 향후 계정이나 포트를 바꿀 때 `ace-backend/.env`의 `DATABASE_URL`과 `TEST_DATABASE_URL`을 확인. 같은 로컬 서버를 사용하되 DB 이름은 각각 `ace`와 `ace_test`처럼 분리.
- `scripts/prepare-local-databases.mjs`는 개발 연결이 정상일 때 테스트 DB를 생성하고 테스트 URL의 계정을 개발 계정에 맞추는 **명시적 복구 도구**. 평상시 테스트에서는 실행하지 않음. 이미 별도 테스트 계정을 운영하는 다른 PC에서 무조건 실행하지 말 것.
- 공유 로컬 계정을 별도 최소 권한 테스트 역할로 분리하는 것은 이번 범위에서 수행하지 않음.
- 운영 migration·백업 복원·설치 앱·음성 검증은 수행하지 않음. 기존 문서의 로컬 DB 인증 실패 상태는 이번 기록으로 해소됨.
