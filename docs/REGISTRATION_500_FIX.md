# 회원가입 204 → 500 진단 및 수정

## 확인한 원인

2026-09-18 현재 개발 설정의 연결 대상은 `127.0.0.1:5432/ace?schema=public`이었다. 이 DB에 애플리케이션 테이블이 없었고, 서버와 동일한 Nest 설정으로 UsersRepository 조회 시 Prisma `P2021`(User 테이블 없음)을 확인했다. 실제 3001 서버의 `POST /auth/register`도 500으로 재현했다. 테스트 DB `ace_test`의 마이그레이션 적용 여부와 개발 DB `ace`의 적용 여부는 별개다.

앞선 204는 `OPTIONS /auth/register`의 CORS 사전 요청 응답이다. 브라우저가 JSON POST를 보내기 전에 확인하는 정상 응답이며 회원가입 성공이나 로그아웃 응답이 아니다. 실제 가입 성공은 POST 201이다.

진단 시점의 현재 DB에서는 User 테이블 자체가 없었으므로 이 요청으로 회원 데이터가 저장된 것은 확인되지 않았다. 기존에 확인한 데이터와 실제 서버 연결 대상이 같은지는 별개로 구분해야 한다.

## 수정

- 개발 DB에 `202609170001_initial`, `202609170002_voice_logs`를 `prisma migrate deploy`로 적용했다. DB 초기화나 기존 데이터 삭제는 하지 않았다.
- `prestart:dev`에서 Client 생성 후 migrate deploy를 실행한다. 연결 대상을 새 DB로 바꿔도 서버 시작 전 스키마를 준비하고, 적용이 실패하면 서버를 시작하지 않는다.
- `/health`의 SELECT 1만으로는 빈 DB도 정상 처리되므로 User/AuthSession 테이블의 조회 가능 여부도 검사한다. 계정이 없는 초기 DB는 정상이다.
- Prisma P2021/P2022는 503 DATABASE_UNAVAILABLE로 처리하고, 서버 로그에는 비밀정보 없이 Prisma 오류 코드와 요청 ID를 남긴다.

## 검증 및 실행

실제 개발 DB를 사용하는 임시 3003 서버에서 health 200, 가입 201, `/users/me` 200, 로그인 200을 확인했다. 임시 계정을 삭제하고 서버를 종료했다. 테이블 누락 상태 검사 3개, 실제 PostgreSQL API 테스트 30개, 빌드와 변경 소스 ESLint가 통과했다.

백엔드를 `npm run start:dev`로 다시 실행하고 기존 Tauri 창에서 가입하면 된다. DB 주소·비밀번호·JWT 비밀키는 변경하지 않았다.
