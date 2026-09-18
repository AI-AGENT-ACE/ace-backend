# ACE Backend — NestJS·PostgreSQL 기반 AI 에이전트 API

**ACE(Auto Computer Executor) Backend**는 [ACE Desktop](https://github.com/AI-AGENT-ACE/ace-desktop)의 인증·대화·설정·Agent 요청을 처리하는 API 서버입니다. NestJS와 Prisma로 PostgreSQL 데이터를 관리하고 외부 AI·날씨 서비스와 연결하며 로컬 PC 명령은 Tauri·Rust 클라이언트가 실행합니다.

## 주요 기능

- 회원가입·로그인·프로필 조회/수정, Access/Refresh Token
- Refresh Token 회전·재사용 감지, 로그아웃과 세션 폐기
- 영문·숫자·ASCII 기호를 포함하는 8~128자 가입 비밀번호 검증
- 대화 생성·제목 변경·고정·삭제, 메시지 저장과 커서 페이지 조회
- 휴지통 조회·30일 내 복구·영구 삭제·만료 데이터 정리 CLI
- 계정별 응답 언어·TTS 선호·도구 권한 설정
- OpenWeather 현재 날씨 Cloud Tool과 AI 서버 연동 어댑터
- LOCAL/CLOUD Tool 구분과 서명된 결과 전달 티켓
- 음성 원문·도구 인자를 제외한 최소 실행 로그
- DTO·소유권 검증, 공통 오류, CORS·Helmet·요청 크기·빈도 제한
- DB 스키마 준비 상태 검사와 Swagger 문서

## 사용 기술

| 영역      | 기술                                                       |
| --------- | ---------------------------------------------------------- |
| 서버      | NestJS 11, TypeScript 5.9, Node.js                         |
| DB        | PostgreSQL, Prisma 7, PostgreSQL 드라이버 어댑터           |
| 인증      | JWT Access/Refresh, 비밀번호 해시, 세션 관리               |
| 검증·보안 | class-validator, class-transformer, Zod, Helmet, Throttler |
| API 문서  | Swagger / OpenAPI                                          |
| 테스트    | Jest, Supertest, 실제 PostgreSQL 기반 E2E                  |
| 개발 도구 | ESLint, Prettier, 개발용 embedded-postgres 18.4            |

정확한 의존성 버전은 `package-lock.json`으로 관리합니다. Redis와 Device 모델은 도입하지 않았습니다.

## 실행 환경

- Node.js **22.12 이상**과 npm
- 실행 중인 PostgreSQL과 앱용 DB·접속 계정
- 현재 Windows와 PostgreSQL 18.4에서 검증
- API 기본 주소 `http://127.0.0.1:3001`; 전역 `/api` Prefix 없음
- 테스트용 별도 DB: 이름이 `_test`로 끝나야 함
- AI·날씨 응답에는 각각 외부 서비스 설정 필요

## 설치 및 실행 방법

### 1. 설치와 로컬 설정 생성

```powershell
git clone https://github.com/AI-AGENT-ACE/ace-backend.git
cd ace-backend
npm ci
npm run setup:dev
```

`setup:dev`는 처음에만 `.env.example`을 기반으로 랜덤 개발 DB 비밀번호와 서로 다른 JWT Secret을 생성합니다. 기존 `.env`는 보존하고 Secret은 출력하지 않습니다. Windows PowerShell 실행 정책 오류가 나면 `npm.cmd`를 사용합니다.

### 2. PostgreSQL 준비

**설치한 PostgreSQL을 사용하는 경우:** 서비스를 실행하고 관리자 계정으로 psql에 접속합니다. 처음 설정하는 DB라면 다음과 같이 계정과 개발·테스트 DB를 생성합니다. 이미 있는 계정과 DB는 재생성하지 않습니다.

```powershell
psql -U postgres -h 127.0.0.1 -p 5432
```

psql 안에서 실행합니다. `\password ace`가 비밀번호를 입력받습니다.

```sql
CREATE ROLE ace LOGIN;
\password ace
CREATE DATABASE ace OWNER ace;
CREATE DATABASE ace_test OWNER ace;
\q
```

`.env`의 두 URL을 실제 계정·비밀번호·포트에 맞춥니다. 비밀번호에 `@`, `:`, `/` 등 특수문자가 있으면 URL 인코딩이 필요합니다.

```dotenv
DATABASE_URL=postgresql://ace:YOUR_PASSWORD@127.0.0.1:5432/ace?schema=public
TEST_DATABASE_URL=postgresql://ace:YOUR_PASSWORD@127.0.0.1:5432/ace_test?schema=public
```

**개발용 내장 DB를 사용하는 경우:** `setup:dev`가 생성한 기본 URL은 포트 `55432`입니다. 아래 명령을 실행한 터미널을 유지하고 서버는 별도 터미널에서 실행합니다.

```powershell
npm run db:local
```

내장 DB는 `.local/postgres`에 저장하며 Ctrl+C로 종료해도 데이터는 유지합니다. 운영용이 아닙니다. 이미 같은 포트에서 PostgreSQL이 실행 중이면 내장 DB를 함께 시작하지 않습니다.

### 3. 서버 시작

```powershell
npm run start:dev
```

시작 전에 Prisma Client 생성과 `prisma migrate deploy`를 실행합니다. DB 연결·마이그레이션이 성공해야 서버를 시작하며 데이터를 초기화하는 reset은 실행하지 않습니다.

| 주소                              | 용도                              |
| --------------------------------- | --------------------------------- |
| `http://127.0.0.1:3001/health`    | 연결·사용자/세션 테이블 준비 상태 |
| `http://127.0.0.1:3001/docs`      | Swagger UI                        |
| `http://127.0.0.1:3001/docs-json` | OpenAPI JSON                      |

`EADDRINUSE`가 발생하면 해당 주소·포트에 이미 서버가 실행 중인지 확인합니다. 다른 포트를 선택할 때는 데스크톱의 `VITE_API_BASE_URL`도 맞춥니다.

### 4. 운영 빌드·시작

운영에서는 실제 DB URL·서로 다른 JWT Secret·허용 CORS Origin을 설정합니다. 외부 요청을 받을 때는 배포 환경에 맞게 HOST를 설정하고 Swagger 공개 여부를 선택합니다.

```powershell
npm run build
npm run db:migrate:deploy
npm start
```

운영 `npm start`는 마이그레이션을 자동 적용하지 않습니다. 검토한 마이그레이션을 배포 단계에서 먼저 적용합니다.

## 환경변수

| 항목                                              | 역할·기본 예시                                            |
| ------------------------------------------------- | --------------------------------------------------------- |
| `NODE_ENV`, `HOST`, `PORT`                        | 환경 구분, 바인딩 주소, 기본 3001                         |
| `DATABASE_URL`                                    | 실제 앱 데이터 DB 접속 문자열                             |
| `TEST_DATABASE_URL`                               | `_test` DB; 개발 데이터와 분리                            |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`         | 서로 다른 32자 이상의 Secret                              |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | 기본 15m / 30d                                            |
| `CORS_ORIGINS`                                    | 허용 브라우저·Tauri Origin을 쉼표로 구분; 와일드카드 제외 |
| `SWAGGER_ENABLED`                                 | Swagger 활성화 true / false                               |
| `AI_SERVER_URL`                                   | AI 서버 기본 주소; `POST /v1/turns` 호출                  |
| `AI_SERVER_API_KEY`                               | AI 서버가 인증을 요구할 때 설정                           |
| `WEATHER_API_KEY`                                 | OpenWeather 현재 날씨 API Key                             |
| `EXTERNAL_API_TIMEOUT_MS`                         | 외부 요청 제한 시간; 기본 10000ms                         |
| `REQUEST_BODY_LIMIT`                              | 요청 본문 제한; 기본 128kb                                |

AI URL·날씨 Key가 비어 있으면 해당 기능은 사용 불가 오류를 반환하고 가짜 결과로 대체하지 않습니다. `/health`의 외부 서비스 설정 표시는 실시간 가용성을 보장하지 않습니다.

## API 사용 방법

Swagger의 `POST /auth/register` 또는 `POST /auth/login`으로 토큰을 발급받습니다. 인증이 필요한 API는 `Authorization: Bearer <accessToken>`을 사용하고 사용자 ID를 Body에 지정하지 않습니다. Swagger의 Authorize에 Access Token을 입력해 보호된 API를 호출할 수 있습니다.

| 기능                      | 주요 경로                                                        |
| ------------------------- | ---------------------------------------------------------------- |
| 가입·로그인·갱신·로그아웃 | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` |
| 내 프로필                 | `/users/me`                                                      |
| 대화·휴지통               | `/conversations`, `/conversations/trash`                         |
| 메시지                    | `/conversations/:id/messages`                                    |
| 계정 설정·권한            | `/settings`, `/settings/permissions`                             |
| Agent 대화                | `/agent/turns`                                                   |
| 도구 결과 전달            | `/agent/cloud-tools`, `/agent/tool-results`                      |
| 음성 실행 로그            | `/logs/voice`                                                    |

가입 비밀번호는 영문·숫자·ASCII 기호를 각각 포함해야 합니다. 로그인에는 조합 조건을 새로 강제하지 않습니다. Refresh Token은 재발급 요청 Body로만 보내며 클라이언트는 동시 갱신 요청을 하나로 공유해야 합니다.

정확한 Method·Body·응답·오류 코드는 [API 계약](docs/API.md)을 참고합니다.

## 프로젝트 구조

```text
src/
├── auth/               인증·세션·토큰·비밀번호 해시
├── users/              사용자 프로필
├── conversations/      대화·휴지통·보존 기간
├── messages/           메시지·커서 페이지
├── settings/           계정 설정·권한 선호
├── weather/            외부 날씨 API 어댑터
├── integrations/       Cloud Tool 확장 Registry
├── tools/              도구 목록·인자 스키마·Cloud 실행
├── agent/              AI Client·문맥·결과 전달 티켓
├── logs/               최소 실행 로그
├── common/             설정·Prisma·인증 Guard·HTTP·오류
├── scripts/            휴지통 정리 CLI
├── app.module.ts       모듈 조합
└── main.ts             서버 시작
prisma/
├── schema.prisma       DB 모델
└── migrations/         검토한 SQL 마이그레이션
scripts/                개발 환경·내장 DB·테스트 서버
test/                   실제 PostgreSQL API E2E
docs/                   설계·API·DB·오류 분석
```

## 화면과 구현 의도

백엔드는 별도 사용자 화면이 없는 API 서비스입니다. `/docs`에서 API 목록과 스키마를 확인하고 실행할 수 있습니다. 사용자 화면은 [데스크톱 README](https://github.com/AI-AGENT-ACE/ace-desktop#readme)의 스크린샷을 참고합니다.

- Controller는 HTTP 입출력, Service는 업무 규칙, Repository는 DB 쿼리를 담당합니다.
- AI·Weather를 DI 어댑터로 분리해 서비스 교체와 테스트 대체를 쉽게 합니다.
- 데이터는 인증된 사용자 기준으로 조회하고 커서와 도구 티켓에도 소유권을 검사합니다.
- 로컬 PC 실행은 클라이언트 책임으로 유지하고 서버에는 최소 메타데이터만 저장합니다.

## 검증과 DB 관리

```powershell
npm run build
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run db:migrate:status
```

E2E는 `TEST_DATABASE_URL`의 `_test` DB에 마이그레이션을 적용하고 테스트가 만든 계정만 정리합니다. PostgreSQL·Prisma·인증·Controller·Service는 실제 구현을 사용하고 외부 AI·Weather만 테스트 어댑터로 대체합니다.

최근 검증: 빌드·ESLint, 단위 테스트 **38개**, API E2E **30개** 통과.

```powershell
# 개발 Schema 수정 후 검토용 SQL 생성
npm run db:migrate:dev -- --name describe_change --create-only
# SQL 검토 후 개발 DB 적용
npm run db:migrate:dev
# 운영에는 검토한 Migration만 적용
npm run db:migrate:deploy
# 빌드 후 30일 지난 휴지통 정리
npm run trash:purge
```

## 현재 상태와 남은 작업

인증·대화·메시지·휴지통·설정·도구 티켓·로그 API와 React/Tauri 연결은 구현했습니다.

- 실제 AI·OpenWeather 설정과 운영 연결 검증이 필요합니다. AI 계약이 다르면 `HttpAiServerClient`에서 변환합니다.
- 휴지통 만료 정리는 CLI를 외부 Cron에 연결하거나 보존 서비스에 Scheduler를 연결해야 합니다.
- 요청 빈도 제한은 단일 프로세스 메모리 기반입니다. 다중 인스턴스 배포 시 공유 정책·Proxy 구성이 필요합니다.
- STT·TTS·Wake Word 감지는 이 백엔드에 구현하지 않았습니다.
- 도구 티켓은 호출 상관관계와 인자를 검증하며 로컬 실행 완료를 서버가 증명하는 수단은 아닙니다.
- 배포 자동화와 운영 모니터링은 별도 작업입니다.

## 관련 문서

- [아키텍처와 책임 분리](docs/ARCHITECTURE.md)
- [API 계약](docs/API.md)
- [DB·마이그레이션](docs/DATABASE.md)
- [검증 기록](docs/VERIFICATION.md)
- [회원가입 500 원인과 DB 초기화 해결](docs/REGISTRATION_500_FIX.md)

`.env`, node_modules, 생성된 Prisma 코드, 빌드 결과, 테스트 출력, 로컬 DB와 개인 키는 Git에서 제외합니다. `.env.example`과 lock 파일은 포함합니다.

## 라이선스

현재 저장소에는 별도 라이선스가 선언되어 있지 않습니다. 재사용·배포 범위는 프로젝트 소유자에게 확인해 주세요.
