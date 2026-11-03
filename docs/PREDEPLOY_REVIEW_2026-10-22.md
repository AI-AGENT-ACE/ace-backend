# 백엔드 배포 전 점검 — 2026-10-22

운영 조회·migration·배포 없음. 로컬 저장소 기준 문서이며 Render/Neon 현재 상태를 추정하지 않는다.

## 배포 대상과 변경

- 백엔드 main HEAD 82afdac, 데스크톱 main HEAD 4abe00d. 원격 fetch/대조는 이번 범위에 포함하지 않음.
- 백엔드 기존 tracked 변경 35개와 다수 untracked 코드/문서/시험. 최종 파일 수에는 이번 점검 문서/스크립트가 추가됨. 로컬 main이라는 이유로 원격·운영에 반영됐다고 판단하지 않음.
- 아직 untracked인 migration 3개: 202610130001_native_execution_receipt, 202610130002_file_deletion_jobs, 202610130003_native_execution_trace. 기존 6개와 함께 총 9개.
- receipt: ToolExecutionLog.executionId nullable + unique. deletion_jobs: 실패한 파일 삭제 재시도 테이블·인덱스. trace: NativeExecution/Event와 외래키·중복 상태 unique, ToolExecutionLog requestId/attemptId 추가. DROP/reset 등 파괴적 SQL 없음. 운영 적용 가능 여부는 실 DB 스키마/이력 확인 후 판단.

## 최신 데스크톱 요구사항

- POST /agent/executions, POST /agent/executions/events, GET /agent/executions/:id: Native 티켓/동일 실행·시도 ID 추적, 소유권·중복 결과 처리.
- /tools 및 /settings/permissions: 24개 도구 계약과 DENY/ASK/ALWAYS_ALLOW. 파일 intent·캡처 방식·설정 페이지 등 최신 엄격한 인자 계약 필요.
- /agent/tool-results: 실행 ID/attemptId 처리 및 영속 중복 방지. DB migration을 빼고 새 서버만 실행하면 안 됨.
- /logs/voice: 24개 명령 허용 및 음성 오류 분류. /voice/commands 응답·AI 연결 오류 분류 보완.
- 대화 휴지통 시작 시/배치 정리, 복구와 영구 삭제 경합 보호, 첨부 삭제 재시도/임시 파일 정리.
- clipboard.read는 Native 로컬 UI 원문 표시, 서버에는 상태 요약. AI 호출 누락 의심은 별도 미해결. voice.activate/음소거 실기기 시험은 보류.

## 실제 점검 결과와 배포 차단 조건

- [로컬 복원](LOCAL_RESTORE_VERIFICATION.md) 통과. 기존 실제 Native/DB 통과 시험은 반복하지 않음.
- format:check 초기 6개 실패 → 해당 파일을 Prettier로 정리(동작 변경 없음). 이후 작업 범위가 변경되어 저장소 전체 최종 format:check는 재실행하지 않음. 변경 문서별 Prettier 실행과 최종 CI 통과는 구분.
- lint 실패 10개: tool-ticket.service.spec.ts any 5개, ai-tool-contract.spec.ts 미사용 _directory 1개, local-postgres.e2e-spec.ts any 4개. 실제 CI가 lint를 실행하므로 반드시 해결 후 CI 통과 필요. 이번에는 테스트 타입/동작을 광범위하게 바꾸지 않음.
- 배포 대상 코드·3개 migration이 아직 미커밋/untracked. 나중에 사용자 승인된 Git 작업에서 빠짐없이 포함한 배포 커밋을 확정해야 함. 이번에 커밋/스테이징하지 않음.
- 운영 backup/복원 가능성, migration 적용/실패 이력, 실제 배포 커밋·환경변수·빌드/실행 명령 확인 전에는 운영 배포 준비 완료로 판정하지 않음.
- CI Node 22.12.0/Docker node:22, .node-version 24.21.0 차이 존재. 요구 범위에는 들어가지만 배포 타깃에서 최종 CI/build 확인 필요. 이번에 주요 버전 변경 없음.
- 기존 4-migration 배포 문서 수치는 역사적 기록. 이번 기준은 9개이며 운영에 몇 개 적용됐는지는 미조회.

## 운영 적용 계획 (이번에는 실행하지 않음)

1. 배포 커밋/lockfile/9개 SQL을 확정하고 포맷·lint·필요한 변경 범위 시험·빌드를 통과. 기존 통과 시험을 무조건 반복하지 않되 최종 CI 결과 확보.
2. 별도 승인 후 운영의 실제 커밋, DB 대상, Prisma migration status/이력·checksum·실패 유무를 읽기 전용 확인. 비밀 URL·비밀번호는 화면/로그에 출력하지 않음. Render 자동 배포 설정도 확인하고 계획 전 배포가 실행되지 않도록 변경 관리.
3. 운영 백업을 접근 제한된 장소에 생성하고 시점/대상/해시/복구 절차 기록. 별도 운영 복원 대상에서 복원 가능성 확인. 이번 로컬 성공을 Neon 성공으로 대체하지 않음. 보존 파일이 생겼다면 DB와 별도 저장소도 포함.
4. 운영 writes/자동 정리와 동시 migration 배포를 조율. 코드가 startup에서 만료 휴지통 정리를 실행하므로 첫 배포 시 TRASH_CLEANUP_ENABLED=false를 고려하고 검증 후 재활성화. 삭제 재시도 등 다른 job까지 모두 멈춘다고 가정하지 않음.
5. Render 빌드: npm ci --include=dev && npm run build. Native Node 실행: npm run start:render = prisma migrate deploy && npm run start:prod, 실제 출력 dist/main.js. Node 24.21.0 설정 여부 확인. Docker CMD는 migration을 자동 적용하지 않으므로 Docker 배포라면 별도 승인된 migrate deploy 단계 필요.
6. migration을 오름차순으로 적용, 이미 적용된 SQL은 수정하지 않음. reset/db push/운영 migrate dev 금지. DATABASE_URL은 운영 직접 연결·기존 SSL 검증 유지. 개발 start:dev는 로컬 전용이므로 운영에서 사용하지 않음.
7. /health/live, 인증된 /tools 및 실행 추적 API, 실패/성공 상태 연결을 승인된 운영 테스트 계정으로 확인. liveness 200은 DB migration/API·AI 정상의 증거가 아님. 데스크톱 새 버전보다 호환 백엔드/스키마를 먼저 배포.

## 실패 대응

- migration 실패 시 start:render의 &&로 서버 시작 중단. 오류 단계/적용 이력을 확인하고 반복 재시작만으로 해결하지 않음. 이번 SQL은 명시적 전체 트랜잭션이 없으므로 부분 적용 가능성을 고려.
- prisma migrate resolve는 실제 스키마와 이력을 확인해 복구 방안을 확정한 경우에만 사용. 임의로 applied 처리하거나 migration 테이블을 직접 삭제하지 않음.
- 앱만 실패했다면 추가형 스키마를 유지한 채 이전 앱 버전과의 호환성을 검토해 rollback. 새 테이블/컬럼을 자동 삭제하지 않음. 이전 앱이 새 데스크톱 API를 제공하지 못하는 경우 제한 사항 안내.
- 데이터 복구가 필요하면 백업을 새 별도 DB로 복원해 확인 후 승인된 연결 전환. 원 DB 즉시 덮어쓰기 금지. 백업 이후 쓰기 손실 범위와 인증 세션/실행 기록 영향을 확인.

## 후속 작업

AI 도구 오분류·호출 누락, 음성/음소거·설치/업데이트 검증은 별도. 첨부 보존 대상 없음에 따른 객체 저장소 보류와 Windows 코드 서명 비용 보류는 이번 백엔드 결함으로 분류하지 않음. 원격 운영·배포 검증은 다음 승인 범위에서 수행.
