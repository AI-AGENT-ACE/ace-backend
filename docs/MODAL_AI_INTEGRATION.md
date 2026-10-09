# Modal AI 연동 및 실제 테스트 (2026-10-08)

## 주소와 설정 위치

| 용도                              | 주소 / 설정                                                                 |
| --------------------------------- | --------------------------------------------------------------------------- |
| AI Swagger                        | https://seogjiwon149--ace-ai-fastapi-app.modal.run/docs                     |
| AI OpenAPI                        | https://seogjiwon149--ace-ai-fastapi-app.modal.run/openapi.json             |
| 백엔드 `AI_SERVER_URL`            | `https://seogjiwon149--ace-ai-fastapi-app.modal.run` (`/docs`, `/api` 없이) |
| 운영 데스크톱 `VITE_API_BASE_URL` | `https://ace-backend-cd8i.onrender.com`                                     |
| 개발 데스크톱                     | 기존 로컬 백엔드 주소 유지                                                  |
| 로컬 음성 모드                    | `ace-desktop/.env.local`의 `VITE_VOICE_MODE=cloud`                          |
| 운영 음성 모드                    | `ace-desktop/.env.production`의 `VITE_VOICE_MODE=cloud`                     |

`ace-backend/.env`의 AI 주소와 `AI_REQUEST_TIMEOUT_MS=120000`을 반영했습니다. 다른 DB/인증 설정은 유지했습니다. 현재 로컬 DB URL은 loopback임을 값 출력 없이 확인했습니다. `.env`는 Git에서 무시되며 실제 비밀값은 이 문서나 데스크톱에 넣지 않았습니다.

데스크톱은 NestJS에만 요청합니다. AI 서버 키가 필요해지면 백엔드 `AI_SERVER_API_KEY`에만 설정합니다. 실제 공개 AI 테스트는 키 없이 성공했습니다. 키를 환경변수에 넣는 것만으로 AI 서버의 인증이 생기는 것은 아닙니다.

## 연결한 경로

| 사용자 기능         | 데스크톱 → NestJS               | NestJS → Modal                                     | 처리                                              |
| ------------------- | ------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| 채팅                | `POST /agent/turns`             | `POST /conversations` 최초 1회, `POST /agent/text` | 메시지·도구 응답 변환, 대화 저장                  |
| 채팅 도구 실행 결과 | `POST /agent/tool-results`      | `POST /agent/tool-result`                          | SUCCEEDED → success, FAILED/DENIED → failure      |
| 음성 명령           | Rust에서 `POST /voice/commands` | multipart `POST /agent/voice`                      | WAV 전달, transcript·response를 Orb 형식으로 변환 |
| 채팅 답변 읽어주기  | `POST /voice/tts`               | JSON `POST /tts`                                   | 설정의 `ttsEnabled`가 켜져 있을 때 WAV 재생       |
| AI 연결 상태        | `GET /health/ready`             | `GET /health`                                      | AI 연결 상태 표시                                 |
| 서버 생존 확인      | `GET /health/live`              | 호출 없음                                          | Render health check 유지                          |

`/ai/process`는 호환 API라 사용하지 않습니다. `/stt`도 개발용 단독 인식 API라 실제 Orb에서는 호출하지 않습니다. AI의 전체 대화 목록을 읽거나 다른 대화를 가져오지 않습니다. 사용자의 대화 목록/휴지통/메시지 API는 기존 NestJS가 담당합니다.

## 중요한 수정

- 기존 잘못된 upstream `/v1/turns`, `/v1/voice/commands`를 실제 Modal API로 교체했습니다.
- AI의 대화 ID는 NestJS ID와 다릅니다. 새로운 `AiConversation` 테이블이 `(백엔드 대화 ID, AI 서버 주소)`별 원격 ID를 저장합니다. 대화 소유권을 검사한 뒤 조회하므로 클라이언트가 임의의 AI 대화 ID를 지정할 수 없습니다. 재시작 후에도 같은 AI 대화를 사용합니다.
- migration `202610080001_ai_conversations`는 매핑 테이블을 추가합니다. 기존 테이블/메시지를 삭제하지 않습니다. 원격 Neon 및 기존 로컬 개발 DB에는 이번 작업에서 적용하지 않았습니다.
- `app.open`/`app.close`의 `canonicalId`/`original` 응답을 기존 백엔드 `appName` 계약으로 변환합니다. 기존 도구 인자 검증, 권한 정책, 확인 요구, 서명 티켓을 유지합니다.
- 데스크톱은 `configured`뿐 아니라 `connected` 상태도 AI 활성화로 처리합니다. `unavailable`은 짧은 health timeout일 수 있어 실제 요청을 시도하며, 실패하면 기존 오류 처리를 합니다. `not_configured`만 저장 전용으로 처리합니다.
- 기존 `local-portfolio` 모드는 외부 AI를 호출하지 않는 데모였습니다. 이번 테스트용 로컬 설정과 운영 설정을 `cloud`로 바꿨습니다. 기존 로컬 백엔드 주소는 유지합니다.
- AI 요청 timeout은 120초, 데스크톱 채팅 timeout은 150초입니다. 일반 API timeout은 변경하지 않았습니다. 음성은 기존 서버/Rust 제한을 유지합니다.
- TTS는 인증과 rate limit을 적용합니다. 응답 크기 8 MiB, WAV MIME/signature, timeout을 검증합니다. 데스크톱은 `media-src 'self' blob:`만 추가하고 생성한 Object URL을 정리합니다. CSP나 TLS 검증을 해제하지 않았습니다.

## 로컬에서 직접 테스트

ACE 폴더에서 터미널 2개를 사용합니다. 로컬 PostgreSQL이 실행 중이어야 합니다. DB가 꺼져 있다면 기존 `npm --prefix .\ace-backend run db:local` 실행 방법을 사용하세요.

터미널 1:

```powershell
npm --prefix .\ace-backend run start:dev
```

기존 `prestart:dev`가 Prisma generate와 **migrate deploy**를 실행하므로 새 매핑 테이블이 로컬 DB에 생성됩니다. `.env`의 DATABASE_URL을 변경했다면 명령 실행 전에 반드시 대상이 본인의 로컬 DB인지 확인하세요. reset/db push/migrate dev는 필요하지 않습니다.

터미널 2:

```powershell
npm --prefix .\ace-desktop run tauri dev
```

1. 로그인하고 새 대화에서 “안녕하세요”를 보냅니다. 사용자 메시지만 저장되는 것이 아니라 AI 응답이 보여야 합니다.
2. “메모장 열어줘”를 보냅니다. 2026-10-09 변경부터 앱/파일 열기는 기본 허용입니다. 거절 흐름을 시험하려면 먼저 설정에서 앱 실행을 ‘항상 확인’으로 바꾸고 Orb에서 ‘아니오’를 선택합니다. 기존에 저장한 권한은 유지합니다.
3. 설정에서 답변 읽어주기를 켜고 짧은 질문을 보냅니다. `/voice/tts`의 WAV가 재생됩니다. 브라우저가 재생을 차단하면 오류 안내가 표시되며 텍스트 응답은 유지됩니다.
4. 마이크 버튼 또는 wake word로 Orb를 열고 “메모장 열어줘”를 말합니다. 흐름은 녹음 → Rust 업로드 → NestJS → Modal STT/Agent → Orb → 기존 네이티브 실행 정책입니다. 이 작업에서는 사람의 마이크나 실제 Windows 도구 실행을 자동으로 테스트하지 않았습니다.
5. AI 서비스가 잠든 경우 첫 요청이 느릴 수 있습니다. 오류가 나면 다시 시도하세요. 인증이나 보안 설정을 끄거나 자기 서버를 주기적으로 호출할 필요는 없습니다.

설치용 운영 실행 파일은 Render를 사용하므로 로컬 `.env`만 고쳐서는 운영 앱에 반영되지 않습니다. 로컬 테스트는 위 개발 실행을 사용하세요.

## 자동 실제 통합 테스트 재실행

```powershell
npm --prefix .\ace-backend run build
node .\ace-backend\scripts\test-modal-integration.mjs
```

이 테스트는 실제 Modal에 요청합니다. 별도의 임시 로컬 PostgreSQL·임의 포트·테스트 계정을 사용하며, 기존 `.env`의 DB나 Neon에는 접속하지 않습니다. AI에 보내는 데이터는 테스트 문장과 합성 음성입니다. 테스트에서 만든 매핑의 원격 대화만 끝에서 삭제하며 PostgreSQL/백엔드 프로세스를 종료합니다. 진단용 임시 DB 파일은 `.local/modal-smoke-*`에 남습니다. 실제 OS 도구 실행은 하지 않고 거절 결과를 전달합니다.

2026-10-08 통과 항목:

- migration 5개를 새 PostgreSQL에 적용.
- 실제 로그인/인증을 거쳐 텍스트 AI 응답과 백엔드 메시지 저장.
- 실제 `app.open` 응답의 인자 변환, 확인 정책, 서명 티켓 발급.
- 실제 DENIED → failure 결과 전달과 AI 후속 응답.
- TTS WAV 138,284 bytes 반환.
- 위 한국어 합성 WAV로 음성 인식/Agent 응답 및 recordingId 유지.
- 백엔드 재시작 뒤 원격 대화 매핑 재사용.
- 미인증 TTS 요청 401.

별도 검증: 백엔드 빌드·lint, 단위 테스트 70개와 오디오 전송 테스트 2개, 데스크톱 빌드, 인증/AI 상태 Playwright 12개, Orb 회귀 8개 통과. 번들 크기 경고는 있지만 프런트엔드 빌드는 성공했습니다.

Windows `npm run tauri build -- --no-bundle`도 성공했습니다. 결과는 `ace-desktop/src-tauri/target/release/ace-desktop.exe`이며, 설치 패키지는 생성하지 않았습니다. 이 운영 실행 파일은 Render에 연결하므로 아래 운영 적용 절차가 먼저 필요합니다.

## Render에서 실제 운영 연결하려면

2026-10-08 운영 서버는 `/health/live` 200, Windows Origin의 CORS 허용 정상, `/health/ready`의 `ai`는 **`not_configured`**였습니다. 로컬 파일 수정은 Render 설정을 바꾸지 않습니다.

Render Environment에 다음을 넣습니다:

```dotenv
AI_SERVER_URL=https://seogjiwon149--ace-ai-fastapi-app.modal.run
AI_REQUEST_TIMEOUT_MS=120000
```

기존 `CORS_ORIGINS`의 `http://tauri.localhost`는 유지합니다. AI_SERVER_API_KEY는 AI 서버가 실제로 요구하는 키가 있는 경우에만 넣습니다. 이번 변경 코드를 배포해야 하며, 기존 Start Command `npm run start:render`가 migration 성공 후 서버를 시작합니다. **주소만 넣고 이전 백엔드 코드를 그대로 쓰면 `/v1/...` 경로 때문에 연결되지 않습니다.** 데스크톱도 이번 코드로 다시 빌드해야 상태 판정·TTS·cloud 음성 모드가 반영됩니다.

이번 작업에서는 커밋·push·Render 배포·Neon migration·Release 게시를 하지 않았습니다.

## 현재 지원 범위와 남은 제한

2026-10-09 채팅 UX 변경으로 `Conversation.titleSource` migration이 추가되어 전체 migration은 6개입니다. 위의 실서버 검증 기록은 10월 8일 당시 결과입니다. 이번 변경의 검증·취소·제목 계약은 `../../docs/2026-10-09-chat-voice-update.md`를 참고하세요.

- 채팅 도구는 기존 NestJS 카탈로그 범위로 제한합니다. AI가 더 많은 도구를 반환하더라도 임의로 권한을 확대하지 않습니다. 미지원 도구는 안내 메시지를 반환합니다. 기존 file 도구와 AI의 인자 형태가 다르면 검증 오류가 날 수 있습니다.
- `tool_sequence`의 참조/순차 실행 계약은 아직 데스크톱 채팅/Orb와 연결하지 않았습니다. 하나씩 요청하라는 안내를 반환하고 일부만 실행하지 않습니다.
- Orb의 로컬 도구 결과는 기존 main↔Orb 흐름으로 표시합니다. 이번에 AI `/agent/tool-result`까지 전달하는 경로는 **채팅의 서명 티켓 도구 실행 결과**입니다. Orb 결과의 AI 후속 대화 및 Orb 자체 TTS 재생은 별도 확장이 필요합니다.
- 채팅 TTS는 설정이 켜진 경우에만 동작하며 한 번에 최대 3,000자를 읽습니다. AI는 첨부파일 분석 계약을 제공하지 않으므로 첨부파일 저장과 AI 분석은 별개입니다. 기존 AI로 옮기기 전의 백엔드 과거 대화는 원격 AI에 자동 재생하지 않습니다.
- AI 서버에도 대화가 저장됩니다. NestJS 휴지통/영구 삭제가 원격 AI 기록 삭제까지 동기화되지는 않습니다. 실사용 데이터 보관 정책 및 원격 인증/접근 제어는 AI 서버와 함께 정해야 합니다. 공개 명세에는 인증 요구가 없고 키 없는 테스트 요청이 성공했으므로, 다중 사용자 운영 전에 AI 서버 접근 제어를 확인해야 합니다.
