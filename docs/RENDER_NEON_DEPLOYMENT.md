# Render Free Web Service + Neon 배포 준비

기준: 2026-10-07. 이 문서는 배포 설정과 로컬 검증을 다룬다. 원격 DB 접속·migration 적용·커밋·push·Render 배포는 수행하지 않았다. 로컬 `.env`, 개발 DB와 기존 테스트 DB도 변경하지 않았다.

## 저장소 확인

저장소 및 상위 경로에서 적용할 `AGENTS.md`는 발견하지 못했다. 기존 Nest 모듈·ConfigService·전역 인증 Guard·공개 API 구조를 유지한다.

| 항목                | 확인 결과                                                         |
| ------------------- | ----------------------------------------------------------------- |
| 패키지 매니저       | npm, `package-lock.json` lockfileVersion 3                        |
| 기존 Node 요구사항  | `package.json`: `>=22.12.0`                                       |
| 배포 Node           | `.node-version`의 `24.21.0`; 로컬 검증 런타임과 일치              |
| Prisma              | lockfile 기준 CLI·Client·adapter-pg 모두 `7.10.0`                 |
| PostgreSQL 드라이버 | `pg 8.23.0`                                                       |
| Prisma schema       | `prisma/schema.prisma`, PostgreSQL, `prisma-client`, CJS 출력     |
| Client 생성         | `src/generated/prisma`, 생성 코드는 Git 제외                      |
| Prisma CLI 설정     | `prisma.config.ts`: schema·migration 경로·`DATABASE_URL`          |
| Runtime DB 설정     | `src/common/prisma/prisma.service.ts`: `PrismaPg`에 같은 URL 전달 |
| migration           | 기존 4개 SQL, PostgreSQL migration lock                           |
| 빌드                | `prisma generate && nest build`                                   |
| 실행 파일           | `dist/main.js`; `dist/src/main.js`가 아님                         |

패키지 버전·lockfile·스키마·migration SQL은 변경하지 않았다. Prisma CLI와 dotenv는 이미 production dependencies이므로 운영 설치에서도 사용할 수 있다. 빌드에는 Nest CLI·TypeScript가 필요하므로 devDependencies를 포함해 설치한다.

## Render 설정

Render에서 **Node 런타임의 Free Web Service**로 `AI-AGENT-ACE/ace-backend` 저장소를 연결한다. 아래 명령은 Native Node 서비스용이며 Docker runtime을 선택하면 적용 방식이 다르다.

| 설정              | 값                                              |
| ----------------- | ----------------------------------------------- |
| Root Directory    | 별도 ace-backend 저장소를 연결하므로 비워 둠    |
| Node Version      | `24.21.0` (`.node-version` 또는 `NODE_VERSION`) |
| Build Command     | `npm ci --include=dev && npm run build`         |
| Start Command     | `npm run start:render`                          |
| Health Check Path | `/health/live`                                  |
| Instance Type     | Free                                            |

`start:render`는 **`prisma migrate deploy && npm run start:prod`**다. `start:prod`는 `node dist/main.js`다. migration이 실패하면 `&&` 뒤 서버 실행은 진행하지 않는다. build 단계에서는 DB에 migration을 적용하지 않는다. Free에서는 유료 서비스의 Pre-deploy Command에 의존하지 않고 시작 명령에서 migration을 수행한다. [Render 배포 절차](https://render.com/docs/deploys)

프로세스 재시작 때에도 deploy 명령을 실행하지만 이미 적용된 migration은 다시 적용하지 않는다. startup이 migration과 DB 준비를 기다리는 시간은 liveness 요청 처리 시간과 별개다. 동시 배포·장시간 migration·이미 실패한 migration 기록이 있으면 배포 로그를 확인하고, 임의 reset이나 db push로 우회하지 않는다.

## 포트·인증·상태 확인

기존 `main.ts`는 ConfigService의 `PORT`와 `HOST`로 listen한다. production에서 HOST 미지정 시 기본값을 `0.0.0.0`으로 변경했다. 개발·테스트 기본값은 `127.0.0.1`이고 명시한 HOST는 존중한다. Render에는 HOST를 명시하고 PORT는 플랫폼 주입값을 사용한다. [Render 포트 바인딩](https://render.com/docs/web-services#port-binding)

- 실제 liveness: **`GET /health/live` → HTTP 200, `{"status":"ok"}`**.
- 전역 prefix는 없다. `/api/health/live`가 아니다.
- DB·Redis·AI 요청, uptime 계산이나 환경 조회 없이 응답한다.
- 기존 HealthController의 `@Public()`을 유지하므로 AccessTokenGuard가 이 공개 경로에서 인증 DB를 조회하지 않는다. 기존 health/ready 공개 범위도 변경하지 않았다.
- `@SkipThrottle()`은 live 메서드에만 적용했다. 보호 API의 인증과 다른 경로의 요청 제한은 유지한다.
- `/health`·`/health/ready`는 DB/필수 테이블·AI 상태 확인용으로 그대로 남긴다. Render liveness에 사용하지 않는다.
- ValidationPipe, Swagger 활성화 조건, CORS 및 JWT 검증은 변경하지 않았다.
- 자기 서버 keep-alive 요청 타이머는 추가하지 않았다.

서버 시작 경로에는 migration과 Prisma 초기화가 있다. DB가 준비되지 않아 아직 서버가 시작하지 못한 상황까지 live API로 숨기는 구조는 아니다.

## Neon DATABASE_URL과 SSL

Neon Console에서 **직접 연결(unpooled)** 주소를 복사해 Render의 `DATABASE_URL`에 저장한다. 주소의 사용자·비밀번호·호스트·DB 이름과 `sslmode=require` 등 제공된 SSL 옵션을 유지한다. URL 인코딩된 비밀번호를 임의로 풀거나 query를 잘라내지 않는다.

현재 앱과 CLI가 모두 `DATABASE_URL`을 읽으므로 **`DIRECT_URL`·`DATABASE_URL_UNPOOLED`는 필요하지 않다.** 이번에는 직접 연결 하나를 두 용도로 사용한다. Neon 가이드의 pooled runtime / direct CLI 분리 예제를 그대로 복사해 환경변수만 추가해도 현재 코드가 읽는 것은 아니다. 향후 pooling을 도입할 때 Prisma config와 adapter를 함께 변경해야 한다. [Neon 공식 Prisma 가이드](https://github.com/neondatabase/website/blob/main/content/docs/guides/prisma.md)

기존 `@prisma/adapter-pg`를 유지하고 Neon 전용 adapter로 교체하지 않았다. 연결 문자열을 변경하지 않고 전달한다. `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `sslmode=no-verify` 같은 인증서 검증 해제 설정은 추가하지 않았다. 현재 드라이버의 SSL 의미를 바꾸는 `uselibpqcompat=true`도 임의로 붙이지 않는다.

앱 연결 풀은 기존대로 최대 10개, 연결 timeout 5초, statement timeout 10초다. Neon의 유휴 상태 복귀나 연결 수 제한에서 timeout이 생기면 원인을 확인해 조정할 수 있지만, 이번 로컬 검증으로 실제 Neon 네트워크·인증서·콜드 스타트가 검증된 것은 아니다.

## migration 검토

| 적용 순서 | 폴더                                  | 역할                                                                                          |
| --------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1         | `202609170001_initial`                | public schema, 기본 enum·User/AuthSession/Conversation/Message/설정/권한/로그와 인덱스·외래키 |
| 2         | `202609170002_voice_logs`             | 음성 실행 최소 로그와 enum                                                                    |
| 3         | `202609210001_attachments`            | 첨부 메타데이터와 관계                                                                        |
| 4         | `202609300001_permission_policy_deny` | 기존 권한 enum을 DENY/ASK/ALWAYS_ALLOW로 전환                                                 |

초기 SQL부터 필요한 테이블과 enum을 생성하며, 뒤 migration은 선행 구조를 참조한다. 빈 DB에 필요한 애플리케이션 seed는 없다. 기존 사용자 생성은 회원가입 API를 통해 수행한다. DB 계정은 대상 DB의 schema/table/type 생성·변경 권한이 필요하다. 별도 확장 설치나 superuser 전용 SQL은 이 migration들에서 사용하지 않는다.

별도 임시 PostgreSQL에서 `migrate deploy` 4개 적용, 반복 deploy 시 중복 없음, schema diff 차이 없음과 서버 기동을 확인했다. 기존 개발 DB/테스트 DB의 주소와 저장 디렉터리는 사용하지 않았다. 원격에서는 사용자가 배포를 진행할 때 Start Command가 처음 적용하게 된다.

## 필수 환경변수

앱 검증상 기본값 없이 필요한 비밀 설정은 `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`이다. 운영 의도를 명확히 하도록 다음 표 전체를 Render에서 확인한다.

| 이름                 | Render 값·종류                            | 필수성                                                          |
| -------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `NODE_VERSION`       | `24.21.0`                                 | `.node-version` 사용 시 생략 가능. Dashboard 값이 파일보다 우선 |
| `NODE_ENV`           | `production`                              | 운영 설정으로 명시                                              |
| `HOST`               | `0.0.0.0`                                 | 운영 기본값도 같지만 명시 권장                                  |
| `PORT`               | Render가 주입한 정수 포트                 | 자동 제공, 로컬 3001을 복사하지 않음                            |
| `DATABASE_URL`       | Neon direct PostgreSQL URL, SSL 옵션 포함 | 필수 비밀값                                                     |
| `JWT_ACCESS_SECRET`  | 32자 이상 충분히 무작위인 문자열          | 필수 비밀값                                                     |
| `JWT_REFRESH_SECRET` | Access와 다른 32자 이상 무작위 문자열     | 필수 비밀값                                                     |
| `CORS_ORIGINS`       | 실제 클라이언트 Origin들을 쉼표로 연결    | 운영에서 명시. `*` 금지, URL 경로 제외                          |
| `SWAGGER_ENABLED`    | `false` 또는 의도적으로 선택한 `true`     | 기본 false, 기존 조건 유지                                      |

데스크톱에 필요한 Origin은 `tauri://localhost,http://tauri.localhost,https://tauri.localhost`이고, 브라우저 프런트엔드를 함께 쓰면 해당 HTTPS Origin을 추가한다. 개발용 localhost Origin은 운영 요구에 맞게 포함 여부를 결정한다. CORS는 인증을 대신하지 않는다.

### 기본값이 있거나 기능별로 필요한 환경변수 전체

| 이름                             | 기본값 / 값의 종류                                    |
| -------------------------------- | ----------------------------------------------------- |
| `JWT_ACCESS_EXPIRES_IN`          | `15m`, 허용 60~3600초                                 |
| `JWT_REFRESH_EXPIRES_IN`         | `30d`, Access보다 길어야 하며 최대 90일               |
| `AI_SERVER_URL`                  | 선택. 인증정보·query·fragment 없는 HTTP(S) 서비스 URL |
| `AI_SERVER_API_KEY`              | 선택. AI 서버가 요구하는 인증 비밀값                  |
| `WEATHER_API_KEY`                | 선택. 실제 날씨 도구 사용 시 OpenWeather 키           |
| `EXTERNAL_API_TIMEOUT_MS`        | `10000`                                               |
| `REQUEST_BODY_LIMIT`             | `128kb`; 허용 `128kb`, `256kb`, `1mb`                 |
| `UPLOAD_DIR`                     | `./uploads`; 일반 첨부 저장 디렉터리                  |
| `MAX_UPLOAD_SIZE`                | `26214400` bytes                                      |
| `MAX_FILES_PER_MESSAGE`          | `5`                                                   |
| `VOICE_TEMP_DIR`                 | `./tmp/voice`; 임시 음성 디렉터리                     |
| `VOICE_TEMP_TTL_SECONDS`         | `3600`                                                |
| `VOICE_CLEANUP_INTERVAL_SECONDS` | `900`                                                 |
| `VOICE_MAX_FILE_SIZE`            | `20971520` bytes                                      |
| `VOICE_UPLOAD_TIMEOUT_MS`        | `15000`                                               |
| `VOICE_PROCESSING_TIMEOUT_MS`    | `60000`                                               |
| `TRASH_RETENTION_DAYS`           | `30`                                                  |
| `TRASH_CLEANUP_CRON`             | `0 3 * * *`                                           |
| `TRASH_CLEANUP_TIME_ZONE`        | `Asia/Seoul`                                          |
| `TRASH_CLEANUP_BATCH_SIZE`       | `250`                                                 |
| `TRASH_CLEANUP_ENABLED`          | `true`; 테스트는 별도 비활성 처리                     |
| `RATE_LIMIT_TTL`                 | `60000` ms                                            |
| `RATE_LIMIT_MAX`                 | `120`                                                 |
| `TRUST_PROXY_HOPS`               | `0`; 프록시 경계를 확인한 경우에만 정확한 hop 수 지정 |

`TEST_DATABASE_URL`은 Render 운영에 넣지 않는다. `.env.example` 끝의 `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BACKEND_PORT`는 기존 Compose 인프라용이며 Neon을 사용하는 Native Render 서비스의 앱 필수 설정이 아니다. `BACKEND_IMAGE` 등 기존 Docker 배포 값도 이 서비스 시작에 필요하지 않다.

AI URL과 키 없이 서버 시작이 가능하다. 해당 AI 기능을 요청하면 기존 사용 불가 오류를 반환하며 가짜 성공으로 대체하지 않는다. Redis 연결도 현재 시작 조건이 아니다.

## Redis / Render Key Value 실태

**현재 사용되는 Redis 환경변수는 없다.** `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`를 읽는 코드와 Redis client dependency가 없다. 캐시·세션·티켓 소비·작업 큐·분산 락에 Redis를 사용하지 않는다. readiness의 `redis: not_configured`는 실제 Redis 연결 검사의 성공/실패 결과가 아닌 현재 미구현 상태 표시다.

| 상태                      | 현재 보관·검증 위치                          | Redis 소실 영향                                |
| ------------------------- | -------------------------------------------- | ---------------------------------------------- |
| 인증 세션·Refresh 회전    | PostgreSQL AuthSession, JWT 서명             | 현재는 직접 영향 없음                          |
| 사용자 권한·소유권        | PostgreSQL 조회                              | 현재는 직접 영향 없음                          |
| 실행 티켓                 | JWT, 15분 만료, 사용자·도구·인자 digest 검증 | Redis와 무관. 별도의 일회성 소비 저장소는 없음 |
| 서버 요청 제한            | Nest Throttler 기본 프로세스 메모리          | Redis와 무관하지만 앱 재시작 시 카운터 초기화  |
| 휴지통 스케줄러 중복 방지 | 프로세스 내 running flag / waitForCompletion | 분산 락이 아님                                 |
| 작업 큐·캐시              | Redis 기반 구현 없음                         | Key Value를 생성해도 자동 연결되지 않음        |

실행 티켓은 서명·소유자·만료·인자를 검증하지만 **`callId`를 한 번만 소비하는 서버 측 영속 기록/unique 제약은 없다.** 유효기간 내 같은 요청 재전송에 대해 exactly-once를 보장하지 않는다. 특히 향후 부작용이 있는 Cloud 도구를 추가하기 전에는 PostgreSQL의 고유 키와 원자적 상태 변경 등으로 멱등성을 설계해야 한다. 프런트엔드/네이티브의 중복 방지와 서버 티켓 소비 보장은 별개다.

사용자가 Key Value를 미리 생성한다면 같은 workspace·region의 **Internal URL**을 선택한다. 제공 URL은 `redis://…` 또는 TLS용 `rediss://…` 형식이며 인증정보가 있으면 그대로 사용한다. 향후 클라이언트 도입 시 `REDIS_URL` 같은 변수명을 코드·환경 검증과 함께 정의해야 한다. 지금 이 이름을 환경변수로 넣는 것만으로는 연결되지 않는다. [Render Key Value 연결](https://render.com/docs/key-value)

Free Key Value는 재시작 시 데이터를 잃는다. 재생성 가능한 캐시는 cache miss로 처리할 수 있지만, 권한·일회성 티켓·중복 실행 방지·중요 작업 큐의 유일한 근거로 사용하면 안 된다. 인증이나 TLS를 끄거나 오류를 성공으로 처리해 연결 문제를 숨기는 변경은 하지 않았다. [Free Key Value 제한](https://render.com/docs/free#free-key-value)

## Free 배포 전 해결·확인할 문제

1. **첨부파일 영속성:** 현재 일반 첨부는 로컬 파일이고 DB에는 경로/메타데이터만 있다. Free Web Service의 임시 파일 시스템에서 재시작·재배포하면 원본이 사라질 수 있다. 첨부를 보존해야 한다면 Object Storage로 이전하거나 영속 디스크가 가능한 배포 방식을 선택해야 한다. 임시 음성은 영구 첨부와 구분한다.
2. **유휴 중단과 cron:** Free 서비스는 유휴 상태에서 중단될 수 있어 콜드 스타트가 생기고, 프로세스 내 휴지통 cron의 정시 실행도 보장되지 않는다. 보존 기한 집행을 보장하려면 별도의 실행 수단이 필요하다. 자기 호출 타이머는 추가하지 않는다. [Render Free 제약](https://render.com/docs/free)
3. **Redis 사용 목적:** 현재 미구현이다. 필요 기능을 정하고 연결·장애 처리·데이터 소실 정책을 구현해야 실제로 사용할 수 있다. 이번에는 새 의존성이나 Redis 기능을 추측해서 추가하지 않았다.
4. **재전송/멱등성:** 서버 티켓의 단일 소비 기록이 없는 기존 한계를 인지해야 한다. 이는 Redis 연결 오류를 우회해서 생긴 변경이 아니다.
5. **프록시와 요청 제한:** 실제 Render 프록시 경계와 `request.ip`를 확인해야 한다. 무조건 trust proxy를 켜거나 제한을 끄지 않았다. 기본 0에서는 IP 기반 제한이 프록시 주소에 묶일 수 있다.
6. **원격 확인은 다음 단계:** Neon DDL 권한·TLS·콜드 스타트와 Render Linux 실제 빌드/기동은 아직 실행하지 않았다. 이 검증 없이 실서비스 배포 완료로 표현하지 않는다.

## 검증 기록

2026-10-07, Windows / Node 24.21.0에서 확인했다. 실제 `.env` 대신 접속하지 않는 placeholder 또는 새로 만든 loopback 임시 DB를 사용했다. `migrate reset`, `db push`, 운영 DB 대상 `migrate dev`는 실행하지 않았다.

| 검사                                 | 결과                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Prisma generate + Nest build         | 통과, `dist/main.js` 생성                                                    |
| Prisma validate                      | 통과                                                                         |
| Jest                                 | 19 suites / 62 tests 통과                                                    |
| ESLint                               | 통과                                                                         |
| 변경 파일 Prettier / diff whitespace | 통과                                                                         |
| HTTP liveness                        | 무인증 200 + 정확한 JSON, 외부 dependency 호출 0, 반복 호출 시 throttle 제외 |
| 보호 API 인증                        | 무인증 요청 401 유지                                                         |
| 새 임시 PostgreSQL migration         | 4개 적용 성공, 재실행 시 4개 유지                                            |
| migration 결과와 Prisma schema 비교  | 차이 없음 (`migrate diff --exit-code`: 0)                                    |
| 실제 production entrypoint           | AI/Redis 없이 기동, live 200, ready DB connected                             |
| `npm run start:render` 실패 차단     | 연결 불가능한 loopback DB의 P1001 후 비정상 종료, start:prod 미실행          |
| Prisma CLI production 설치 범위      | `npm ls --omit=dev`에서 Prisma 7.10.0·dotenv 확인                            |
| 민감 파일 Git 추적                   | env 계열은 `.env.example`만 추적; `.env`·`.env.local` ignored                |
| 기존 구조 보존                       | package-lock, schema, Prisma config, migration SQL 변경 없음                 |

이번 재검증의 임시 DB 및 검증 스크립트는 저장소 내부의 Git 제외 경로 `.local/render-check-*`, `.local/verify-render.cjs`에 분리했다. 로컬 검증은 실제 Neon SSL 연결이나 Render Linux 배포 성공을 대신하지 않는다.

배포 관련 코드·테스트·Node 버전 파일은 이번 작업 시작 시 이미 미커밋 변경으로 존재했다. 해당 변경을 보존하고 코드 검토와 검증을 다시 수행했다. 실제 `.env`를 사용하지 않도록 Prisma 명령에는 별도 dotenv 경로를, 서버 기동 검증에는 dotenv 로딩을 생략하는 검증용 래퍼를 사용했다. 앱의 설정 로딩 코드는 변경하지 않았다.

`npm ci`는 Render Build Command에서 lockfile로 실행하도록 지정했다. 이번 로컬 작업에서는 기존 설치된 의존성으로 빌드·테스트하며 패키지/lockfile 버전을 변경하지 않는다.

참고: [Render Node 버전 선택](https://render.com/docs/node-version), [Render Health Checks](https://render.com/docs/health-checks).
