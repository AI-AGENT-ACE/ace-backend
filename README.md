# ACE Cloud Backend

`D:/ACE/ACE_BACKEND_CODEX_REQUIREMENTS.md`에 맞춰 작성한 NestJS + TypeScript + PostgreSQL + Prisma 백엔드입니다. 프로젝트 위치는 `D:/ACE/ace-backend`입니다.

## 실행

Node.js 22.12 이상이 필요합니다. 현재 환경에서 NestJS 11.2 계열과 Prisma 7.10을 사용하고 버전은 `package-lock.json`으로 고정합니다.

```powershell
cd D:\ACE\ace-backend
npm install
npm run setup:dev
npm run db:local
```

`db:local` 터미널은 유지합니다. 별도 터미널에서 실행하세요.

```powershell
cd D:\ACE\ace-backend
npm run db:migrate:deploy
npm run start:dev
```

- API: http://127.0.0.1:3001
- DB 연결 확인: http://127.0.0.1:3001/health
- Swagger: http://127.0.0.1:3001/docs
- OpenAPI JSON: http://127.0.0.1:3001/docs-json

`setup:dev`는 기존 `.env`를 보존하며 처음 실행할 때만 랜덤 DB 비밀번호와 서로 다른 JWT Secret을 생성합니다. Secret은 콘솔에 출력하지 않습니다. `.env`와 DB 데이터 `.local/`은 Git에서 제외합니다.

`db:local`은 Windows에 PostgreSQL 서비스를 설치하지 않고 이 프로젝트의 `.local/postgres`에 개발 DB를 만듭니다. 포트는 `55432`, 바인딩 주소는 `127.0.0.1`입니다. Ctrl+C로 종료해도 데이터는 유지됩니다. 개발 전용 `embedded-postgres` 패키지를 사용하며 운영에서는 일반 PostgreSQL 연결 문자열을 설정합니다.

## 구현 기능

- 회원가입, 로그인, Access/Refresh Token, Refresh 회전·재사용 감지, 로그아웃
- 내 프로필 조회·수정
- 대화 생성·조회·제목 수정·고정·Soft Delete
- 휴지통 조회, 30일 내 복구, 영구 삭제, 만료된 휴지통 정리 서비스·CLI
- 메시지 저장, 최신 30개와 이전 메시지 커서 페이지 조회
- 응답 언어·TTS 선호도, Account 기준 Tool Permission
- Weather Cloud Tool과 OpenWeather 어댑터
- AI Server 요청·응답 연동, LOCAL/CLOUD Tool 구분, 서명된 결과 전달 티켓
- 최소 정보만 저장하는 Tool 실행 로그
- DTO 검증, 소유권 검증, 공통 오류, CORS, Helmet, 요청 크기 제한, 메모리 기반 요청 제한

백엔드에 Device 모델과 API, 로컬 PC 실행 기능은 없습니다. React/Tauri API 연결은 [ACE Desktop](https://github.com/AI-AGENT-ACE/ace-desktop)에 구현되어 있습니다. `POST/GET /logs/voice`는 음성 원문 없이 최소 실행 메타데이터만 저장·조회합니다.

## 구조

```text
src/
├── auth/              인증·세션·토큰·비밀번호 해시
├── users/             계정 프로필
├── conversations/     대화·휴지통·보존 기간
├── messages/          메시지·페이지 조회
├── settings/          Cloud 설정·권한 선호도
├── weather/           WeatherProvider와 실제 외부 API 어댑터
├── integrations/      CloudToolHandler와 확장 Registry
├── tools/             Tool 목록·인자 스키마·Cloud 실행
├── agent/             AI Client·대화 문맥·Tool 결과 전달
├── logs/              민감정보 제외 로그
├── common/            Config·Prisma·HTTP·Validation·오류
├── scripts/           서버 측 휴지통 정리 CLI
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma
└── migrations/202609170001_initial/migration.sql
test/                  실제 PostgreSQL 기반 API 테스트
scripts/               개발 설정·개발 PostgreSQL·E2E 실행
docs/                  아키텍처·API·Migration 기록
```

Controller는 HTTP 입출력, Service는 업무 규칙, Repository는 Prisma 쿼리를 담당합니다. AI와 Weather는 추상 클래스를 DI 토큰으로 사용해 실제 어댑터를 교체할 수 있습니다.

## 외부 서비스 설정

`.env`에 `WEATHER_API_KEY`를 넣으면 OpenWeather의 현재 날씨 API를 호출합니다. `AI_SERVER_URL`과 필요한 경우 `AI_SERVER_API_KEY`를 설정하면 AI Server의 `POST /v1/turns`를 호출합니다. 키나 서버 URL이 없으면 해당 기능은 `503`으로 명확하게 응답하고 가짜 결과를 반환하지 않습니다.

AI 요청·응답 계약은 [API 문서](docs/API.md)에 정의했습니다. 실제 AI Server가 다른 계약을 사용하면 `HttpAiServerClient` 어댑터에서 변환합니다. API 테스트는 외부 AI와 Weather만 대체 어댑터로 교체하며 PostgreSQL, Prisma, 인증, Guard, Controller, Service는 실제 구현을 사용합니다.

## 검증

개발 PostgreSQL이 실행 중인 상태에서 아래 명령을 사용합니다.

```powershell
npm run lint
npm run format:check
npm run build
npm test
npm run test:e2e
npm run db:migrate:status
```

E2E는 `.env`의 `TEST_DATABASE_URL`에 Migration을 적용합니다. DB 이름이 `_test`로 끝나야 실행되며 `ace` 개발 데이터와 분리합니다. 테스트로 만든 사용자 데이터만 정리합니다.

## Migration과 휴지통 정리

```powershell
# 개발 Schema 수정 후 검토용 Migration 생성
npm run db:migrate:dev -- --name describe_change --create-only
# SQL 검토 후 개발 DB 적용
npm run db:migrate:dev
# 운영: 검토된 Migration만 적용
npm run db:migrate:deploy

# 빌드 후 30일 지난 휴지통 영구 정리
npm run trash:purge
```

운영 시작 과정에서 자동 Schema 동기화나 `db push`를 실행하지 않습니다. 휴지통 정리는 CLI를 외부 Cron에 연결하거나 `TrashRetentionService`를 Scheduler/Worker에서 호출할 수 있습니다.

## 운영 시 설정

운영에서는 `NODE_ENV=production`, 실제 `DATABASE_URL`, 별도 JWT Secret, 허용할 `CORS_ORIGINS`를 설정하고 필요에 따라 `HOST=0.0.0.0`을 지정합니다. Swagger는 `SWAGGER_ENABLED=false`로 비활성화할 수 있습니다. `npm run build` 후 `npm start`로 실행합니다.

초기 Rate Limit은 단일 프로세스 메모리 기반입니다. 다중 인스턴스 배포 시 공유 저장소와 신뢰할 Proxy 구성을 별도로 추가해야 합니다. Redis는 이번 MVP에 도입하지 않았습니다. Tool 티켓은 15분 유효한 호출 상관관계 확인 수단이며 로컬 실행 완료 자체를 서버가 증명하는 수단은 아닙니다.

상세 기록: [아키텍처](docs/ARCHITECTURE.md), [API 계약](docs/API.md), [DB·Migration 검토](docs/DATABASE.md).
