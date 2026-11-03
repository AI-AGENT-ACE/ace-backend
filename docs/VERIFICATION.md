# 구현 검증 기록

2026-10-23 [검색·사본 생성 계약 및 사용자 결과](../../ace-desktop/docs/NATIVE_USABILITY_2026-10-23.md). 위치 없는 이름 검색/검색 전용 drive_c, 목적지 없는 file.copy 계약 추가. 문장 기반 AI 우회는 사용자 요청으로 철회. 기존 실제 DB 검증 유지, 이번 계약 단위 검증을 운영·음성 통과로 간주하지 않음.

2026-10-22 [로컬 DB 백업·별도 DB 복원](LOCAL_RESTORE_VERIFICATION.md), [배포 전 점검](PREDEPLOY_REVIEW_2026-10-22.md). 운영 Neon 변경/검증 아님.

2026-10-22 후속: [clipboard.read 직접 실행](../../ace-desktop/docs/CLIPBOARD_READ_VERIFICATION.md). 실제 개발 앱 승인 후 테스트 문장 표시, 취소/차단 읽기 미실행, 해당 로컬 실행 DB 성공 2건·취소 2건 및 원문 미포함 확인. AI 채팅 문제 해결·운영 검증과 구분.

2026-10-26: [클립보드 채팅 결과 전달·기본 권한](../../ace-desktop/docs/CLIPBOARD_CHAT_RESULT_2026-10-26.md). 채팅 성공 결과의 text 검증 후 AI로 전달. 읽기 기본 허용·쓰기 필수 확인, 기존 사용자 차단 유지. 관련 백엔드 단위/모의 13개·Rust 위험도 1개·Chrome 모의 API/IPC 2개 및 양쪽 빌드 통과. 실제 클립보드·AI 종단 검증과 운영 검증은 이번에 미실행.

## 최신 분류 안내 — 2026-10-18

- 2026-10-21 [음성·Native 연결 오류 조사](../../ace-desktop/docs/VOICE_NATIVE_CONTRACT_INVESTIGATION.md): 실제 AI 텍스트 응답에서 위치 없는 file.search와 query 기반 file.open, 잘못된 볼륨 app.close 응답 확인. 계약·음성 로그 DTO 수정과 관련 자동 테스트 15개 통과. 새로운 음성·Windows 캡처 UI 종단 성공은 대기이며 기존 검증을 대체하지 않음.

- 네 범주의 통합 현황과 비음성 우선순위는 [개발 앱 검증 현황](../../ace-desktop/docs/NATIVE_MANUAL_TEST_WITHOUT_AI.md#검증-현황-갱신--2026-10-18)에 기록함. 사용자 시험의 정확한 일시·검증 당시 커밋은 미기록. 기존 문서에 날짜가 있는 CLI 결과는 그 날짜만 유지하고 정확한 시각·커밋을 추정하지 않음.

### 사용자 수동 검증 통과

- 여러 메모장 창 중 선택한 창 최소화·포커스·정상 종료 요청, 종료 전 앞으로 가져오기, 대상 소멸 시 다른 창 실행 없이 재조회 안내 통과.
- 후속 사용자 확인: 단일 창 선택 생략, 정확한 대상 승인, 포커스 전환, 저장 확인창에서 취소 후 같은 창·문장 보존 통과. 정확한 시험 일시·커밋 미기록. CLI 자동화의 과거 포커스 실패와 별도 근거.
- 파일 휴지통 이동 및 Windows 휴지통 복원 후 원위치·내용 확인, 복사 충돌 취소 시 보존·덮어쓰기, 다른 이름·생략 확장자 자동 추가, 이동 덮어쓰기 통과.
- 이동 덮어쓰기는 당시 “다음”이 완료 기준인 원본 이동·대상 내용 교체 확인이었다고 이번에 명시함. 사용자 환경 통과이며 다른 드라이브·모든 형식 지원을 의미하지 않음.
- 덮어쓰기 승인 중 대상 변경·승인 만료 시 실행 차단과 재요청 안내 통과.
- 권한 차단 안내·설정 이동·변경 후 새 요청 성공, 기존 차단 요청의 자동 실행 없음 통과.
- 로컬 백엔드 중단 안내·재시작 후 데스크톱 재시작 없이 새 요청 복구, 실패 요청의 자동 실행 없음 통과.
- 전체/영역 캡처·결과 확인·사용자 저장, 프로필 이름 변경·앱 재실행 후 유지 통과.
- 대화 삭제 시 목록·본문 함께 갱신, 휴지통 복구, 영구 삭제 취소·확정 통과. 일반 목록 깜빡임은 수정 후 사용자가 직접 재확인하여 통과. 과거 오류는 수정 이력이며 현재 미해결 항목이 아님.

### CLI가 실제 Windows·DB에서 검증한 결과

- 2026-10-21 [파일 작업 실패 실앱 통합](../../ace-desktop/docs/OVERWRITE_LOCAL_DB_VERIFICATION.md): 실제 Native 패널→권한·티켓·승인→Rust 잠금 거부→PostgreSQL FAILED 기록 확인. 복사/이동의 Native executionId·attemptId와 DB 이벤트 일치, SUCCEEDED 오기록 없음, 잠금 해제 후 별도 요청 성공 확인. 승인 준비 실패는 execute 호출이 없으므로 구분. 모두 쓰기 전 실패이며 모의 API/IPC가 아님.

- 2026-10-19 [덮어쓰기 실패 보존](../../ace-desktop/docs/OVERWRITE_FAILURE_VERIFICATION.md): 실제 Windows 잠금/ADS 거부 및 SHA-256 보존, 실제 TxF에 합성 실패 주입 후 보존·핸들 해제·재시도 통과. Chrome 모의 API·IPC의 FAILED 제출 2개와 구분. 이번 실패를 실제 PostgreSQL까지 저장·조회한 종단 시험은 미실행.

- 최신 실제 로컬 DB 근거는 [2026-10-15 PostgreSQL 검증](LOCAL_POSTGRES_VERIFICATION.md): 삭제·복구·만료/경합·실행 추적·중복 결과 방지 7개 통과. 실제 DB·HTTP·인증·티켓 계층을 사용하되 외부 AI는 대체 응답 사용.
- Windows 공통 Rust 휴지통 이동, 실제 개발 앱 시작, 전체 캡처·Esc 취소는 데스크톱 통합 현황의 원문 기록 참조. 사용자 수동 결과로 해당 CLI 시험의 범위를 소급 확대하지 않음.
- 2026-10-19 [캡처 수명 검증](../../ace-desktop/docs/CAPTURE_LIFECYCLE_VERIFICATION.md): 격리 ACE 프로세스 강제 종료·재시작 및 주기 정리로 만료 PNG/JSON 삭제, 만료 전 파일·사용자 저장 사본 바이트 보존 확인. 실제 Windows 파일/앱 초기화 근거이며 운영 백엔드·설치 앱 검증 아님. 활성 lease 보호는 별도 Rust 자동 테스트 근거.

### 모의 API·IPC 및 자동 테스트 결과

- 최신 대화 삭제 6개와 휴지통 취소/영구 삭제 2개 UI 테스트는 모의 API 기반. 운영 DB 또는 실제 설치 앱 검증으로 분류하지 않음.
- 권한·오류 코드·확장자·캡처 UI 등 기존 브라우저 결과와 빌드/단위 결과는 데스크톱 통합 현황에 유지. 일회성 승인 재사용·다른 호출 창·인자/대상 스냅샷·만료 차단은 기존 승인 단위 테스트 근거이며 설치 앱 전체 흐름 통과 아님.

### 미검증·대기 또는 의도적 보류

- 운영 migration 적용 상태·백업 복원·Render 배포 검증은 대기. 현재 대화 화면 정리 수정으로 DB 메시지를 삭제하지 않았으며 실제 로컬 삭제/복구 메시지 보존은 위 7개 시험의 기존 근거로 유지.
- 메모장 저장 확인창 취소 후 같은 문서·창 보존은 사용자 수동 통과. 다른 앱·자동 저장/세션 복원 설정별 검증은 대기.
- 합성 실패 TxF 보존·실제 잠금/ADS 거부와 잠금 실패의 실제 앱→로컬 DB 추적은 통과. 실제 장치 쓰기/커밋 오류 및 해당 오류의 DB 흐름·다른 파일 시스템은 미검증. 기존 지원 제한 유지.
- 음성·Wake Word·USB 마이크 해제/재선택, 공용 모델·다화자 평가, 실제 다중 모니터/배율/해제, 실제 장시간 미리보기의 캡처 lease 유지 시험은 대기. 격리 앱 강제 종료 후 임시 캡처 정리·사용자 사본 보존은 위 CLI 결과로 확인.
- 최신 Render·Neon 운영, 새 PC 설치/실행/삭제, 실제 설치 업데이트·서명 검증·설정 유지, Native 24개 전체 검증은 대기.
- Windows 코드 서명은 비용 방침상 의도적 보류. 객체 저장소는 보존할 첨부 없음에 따른 합의된 보류이며 필수 미완료 결함으로 분류하지 않음.
- 후속 비음성 검증은 캡처 수명 관리와 파일 실패 안전성부터 진행. 통과한 메모장 취소·문서 보존 등 로컬 시나리오는 관련 변경 등 구체적 이유 없이 반복하지 않음.
- 아래 2026-09-17 기록은 당시 코드의 과거 결과이며 최신 전체 회귀·운영 통과 선언이 아님. 2026-10-18 문서 정리에서는 테스트 재실행·커밋·배포 없음.

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

# 2026-10-22 Native 명령별 후속

추가: [Windows 설정 검증](../../ace-desktop/docs/SYSTEM_SETTINGS_VERIFICATION.md). 실제 앱에서 기본/display 표시, DENY, ASK 취소·새 승인 확인. 설정 허용 목록 계약 테스트는 별도 단위 근거. 운영·DB 직접 조회 재시험 없음.

[24개 명령 현황](../../ace-desktop/docs/NATIVE_24_VERIFICATION_STATUS.md)에 실제 개발 앱의 추가 8개 정상 실행과 기존 수동/CLI/자동 근거를 구분함. 이번에는 로컬 HTTP 이벤트를 확인했으며 DB 직접 조회를 새로 실행하지 않음. OVERWRITE_LOCAL_DB_VERIFICATION.md의 기존 실제 DB 통과는 재실행 없이 유지. 운영 변경 없음.
