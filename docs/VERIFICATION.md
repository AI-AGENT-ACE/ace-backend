# 구현 검증 기록

검증일: 2026-09-17.

| 검증                        | 결과                                                 |
| --------------------------- | ---------------------------------------------------- |
| `npm run build`             | Prisma Client 생성·NestJS 컴파일·실행 파일 출력 통과 |
| `npm run lint`              | 오류 0                                               |
| `npm run format:check`      | 통과                                                 |
| `npm test`                  | 9개 Suite, 단위 테스트 35개 통과                     |
| `npm run test:e2e`          | 실제 PostgreSQL에서 API 테스트 29개 통과             |
| `npm run db:migrate:status` | 개발 DB 최신 Migration 적용 상태                     |
| Prisma DB/Schema Diff       | 차이 없음                                            |
| `npm start`                 | 빌드된 서버 정상 시작                                |
| `GET /health`               | 200, PostgreSQL connected                            |
| `GET /docs`                 | 200, Swagger UI                                      |
| `GET /docs-json`            | OpenAPI 생성, 인증 DTO 필드 포함                     |
| 최종 의존성 설치 Audit      | 알려진 취약점 0                                      |

Authentication, 대화 소유권, 휴지통 분리·복구 기간·Cascade Delete, 동일 시각 메시지 Cursor, Cloud 설정, System Confirmation 우선, LOCAL 실행 거부, 서명된 Tool 결과 연결, 로그의 민감정보 제외를 검증했습니다.

React API 연결 후 음성 최소 로그의 인증·소유권·원문 필드 거부·Message 미생성을 추가 검증했습니다. 형제 Desktop 프로젝트의 실제 HTTP 브라우저 테스트는 13개이며 AI만 테스트 어댑터로 교체합니다. 추가 Migration `202609170002_voice_logs`는 개발/테스트 DB에 적용했고 Prisma DB/Schema Diff는 차이가 없습니다.

개발 DB는 `ace`, 테스트 DB는 `ace_test`로 분리합니다. 외부 AI Server와 Weather API는 테스트에서만 교체 가능한 Provider로 대체했습니다. 실제 외부 서비스 호출은 URL/API Key를 설정한 뒤 확인해야 합니다. 설정이 없는 실제 서버는 Health에서 `not_configured`를 표시하고 해당 기능에서 503을 반환합니다.

NestJS Build Cache는 `dist/tsconfig.build.tsbuildinfo`에 둡니다. 출력 폴더 정리 시 캐시도 함께 정리해 재빌드 후 JavaScript 파일이 누락되지 않도록 구성했습니다.
