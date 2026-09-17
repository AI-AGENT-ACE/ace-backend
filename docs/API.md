# ACE Backend API 계약

기본 주소: `http://127.0.0.1:3001`. 전역 `/api` Prefix는 사용하지 않습니다. `/health`, 인증 시작 API를 제외한 기능은 `Authorization: Bearer <accessToken>`이 필요합니다.

사용자 ID를 Body/Query로 지정하지 않습니다. 모든 소유 데이터는 Guard가 인증한 사용자 기준으로 처리합니다. 알 수 없는 Body 필드, null이 허용되지 않는 필드의 null, 범위를 벗어난 값은 400입니다.

## 인증과 프로필

| Method | 경로             | Body                                    | 응답                         |
| ------ | ---------------- | --------------------------------------- | ---------------------------- |
| POST   | `/auth/register` | `email`, `password`, 선택 `displayName` | 201 사용자 프로필·Token Pair |
| POST   | `/auth/login`    | `email`, `password`                     | 200 사용자 프로필·Token Pair |
| POST   | `/auth/refresh`  | `refreshToken`                          | 200 새 Token Pair            |
| POST   | `/auth/logout`   | 없음                                    | 204, 현재 세션 폐기          |
| GET    | `/users/me`      | 없음                                    | 내 프로필                    |
| PATCH  | `/users/me`      | `displayName`                           | 변경 프로필                  |

비밀번호는 12~128자, 표시 이름은 1~80자입니다. 이메일은 Trim 후 소문자로 정규화합니다. 프로필에 passwordHash는 반환하지 않습니다.

Token Pair는 다음 필드를 제공합니다.

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresAt": "2026-10-17T00:00:00.000Z"
}
```

Refresh 성공 시 이전 Refresh Token은 더 이상 사용할 수 없습니다. 이전 Token을 재사용하면 해당 세션을 폐기합니다. Refresh 요청을 동시에 여러 번 보내지 말고 클라이언트에서 하나의 요청을 공유하세요. 재발급 네트워크 실패 후 이전 Token을 반복 전송하지 말고 재로그인하세요.

## 대화와 휴지통

| Method | 경로                           | 설명                                |
| ------ | ------------------------------ | ----------------------------------- |
| POST   | `/conversations`               | 선택 `title`로 생성, 기본 `새 대화` |
| GET    | `/conversations`               | 활성 대화 최신 활동순, 기본 20개    |
| GET    | `/conversations/trash`         | 삭제 시각 최신순, 복구 정보 포함    |
| GET    | `/conversations/:id`           | 자신의 활성 대화 상세               |
| PATCH  | `/conversations/:id`           | 선택 `title`, `isPinned` 수정       |
| DELETE | `/conversations/:id`           | Soft Delete, 204                    |
| PATCH  | `/conversations/:id/restore`   | 30일 이내 복구                      |
| DELETE | `/conversations/:id/permanent` | 휴지통 대화 영구 삭제, 204          |

제목은 1~200자입니다. 영구 삭제 전에는 휴지통으로 옮겨야 합니다. 타인/존재하지 않는 대화는 404, 활성 대화의 영구 삭제는 409, 30일이 지난 대화 복구는 410입니다.

휴지통 항목에는 `expiresAt`, `remainingDays`, `isRestorable`이 추가됩니다. 만료 항목은 정리 작업 전까지 표시될 수 있으나 복구할 수 없습니다.

## 메시지와 페이지 조회

```http
GET /conversations/:id/messages?limit=30
GET /conversations/:id/messages?limit=30&cursor=<messageId>
POST /conversations/:id/messages
Content-Type: application/json

{"content":"안녕하세요","role":"USER"}
```

Role은 생략 가능하며 일반 입력 API는 USER만 허용합니다. content는 1~20000자입니다. ASSISTANT/TOOL/SYSTEM은 내부 서비스만 생성합니다. 삭제된 대화의 메시지 조회·생성은 404입니다.

메시지는 **최신순**으로 반환합니다. UI는 표시할 때 각 페이지의 방향을 조정하세요. 시각이 같은 메시지는 ID를 두 번째 정렬 기준으로 사용합니다. 이전 페이지 Cursor는 마지막 항목 ID입니다.

대화/메시지/로그 페이지 응답은 동일합니다.

```json
{
  "items": [],
  "nextCursor": null,
  "hasMore": false
}
```

limit은 1~100입니다. 다른 사용자/다른 대화/다른 목록의 Cursor는 400입니다. 대화 목록은 20개, 메시지·로그는 30개가 기본입니다.

## Cloud 설정과 Permission

```http
GET /settings
PATCH /settings

{"responseLanguage":"ko","ttsEnabled":false}
```

`responseLanguage`는 `ko`, `en`, `en-US` 같은 언어 태그이며 최대 35자입니다. TTS는 계정 선호도만 저장합니다. Microphone/Speaker를 제어하지 않습니다. Wake Word, Theme, Shortcut, Overlay, Autostart는 받지 않습니다.

```http
GET /settings/permissions
PUT /settings/permissions/file.delete

{"policy":"ALWAYS_ALLOW"}
```

Policy: `ALWAYS_ALLOW`, `ASK`, `ALWAYS_ASK`. 변경 응답에 `requiresConfirmation`, `systemConfirmation`을 포함합니다. 사용자 선호가 ALWAYS_ALLOW여도 파괴적 Tool의 System Confirmation은 true입니다.

## Tool 목록과 Cloud 실행

`GET /tools`는 이름·설명·실행 위치·인자 JSON Schema·기본 Policy·System Confirmation을 반환합니다.

| Tool            | 위치  | 인자                | System Confirmation |
| --------------- | ----- | ------------------- | ------------------- |
| weather.current | CLOUD | latitude, longitude | false               |
| app.open        | LOCAL | appName             | false               |
| app.close       | LOCAL | appName             | true                |
| file.open       | LOCAL | path                | false               |
| file.rename     | LOCAL | path, newName       | true                |
| file.delete     | LOCAL | path                | true                |

LOCAL 항목은 데이터 정의이며 서버가 파일이나 앱에 접근하지 않습니다.

```http
POST /tools/execute

{"toolName":"weather.current","arguments":{"latitude":37.5665,"longitude":126.978},"confirmed":true}
```

Weather 기본 선호는 ALWAYS_ALLOW라 confirmed를 생략할 수 있습니다. ASK로 변경하면 confirmed=true가 필요합니다. LOCAL Tool을 실행 API에 보내면 400입니다. Latitude 범위 -90~90, Longitude 범위 -180~180입니다.

Weather 응답:

```json
{
  "toolName": "weather.current",
  "result": {
    "location": "Seoul",
    "temperatureCelsius": 23,
    "feelsLikeCelsius": 22,
    "humidityPercent": 50,
    "description": "clear sky",
    "observedAt": "2026-09-17T00:00:00.000Z"
  }
}
```

## Agent와 AI Server 계약

```http
POST /agent/turns

{"conversationId":"<conversationId>","content":"메모장 열어줘"}
```

사용자 메시지를 저장하고 최근 30개 문맥과 Cloud 언어 설정, Tool Catalog를 AI Server로 보냅니다. AI 응답의 Tool 이름과 인자를 검증하고 assistant 텍스트만 저장합니다. Tool Arguments는 반환할 뿐 자동 저장하지 않습니다.

응답에는 `conversationId`, 저장된 `message` 또는 null, `toolCalls`를 제공합니다. 각 Tool Call은 `id`, `tool`, `arguments`, `executionLocation`, `policy`, `requiresConfirmation`, `systemConfirmation`, `ticket`을 포함합니다.

AI 장애 시 사용자 메시지는 남아 있을 수 있습니다. 클라이언트는 같은 turn을 무조건 자동 재시도하지 말고 저장 상태를 확인하세요.

### AI Server의 POST /v1/turns

요청:

```json
{
  "messages": [{ "role": "USER", "content": "메모장 열어줘" }],
  "responseLanguage": "ko",
  "tools": [
    {
      "name": "app.open",
      "description": "...",
      "executionLocation": "LOCAL",
      "argumentsSchema": {},
      "requiresConfirmation": true
    }
  ]
}
```

응답:

```json
{
  "content": "메모장을 열겠습니다.",
  "toolCalls": [{ "id": "call_1", "tool": "app.open", "arguments": { "appName": "Notepad" } }]
}
```

content는 선택 사항이며 최대 20000자입니다. toolCalls는 최대 8개, 호출 ID는 중복되지 않아야 합니다. content와 toolCalls를 둘 다 비울 수 없습니다. 예상하지 않은 Tool 이름이나 인자는 502입니다.

### LOCAL 결과 전달

Desktop이 로컬 정책을 검증하고 실행한 후 보고합니다. 실제 IPC와 로컬 실행 코드는 이 프로젝트에 없습니다.

```http
POST /agent/tool-results

{"ticket":"<issuedTicket>","status":"SUCCEEDED","confirmed":true,"duration":120,"result":{"summary":"Application opened"}}
```

status: `SUCCEEDED`, `FAILED`, `DENIED`. duration은 0~86400000ms입니다. 오류 코드는 정의된 Enum만 허용합니다. result는 선택 JSON Object이고 AI에만 일시적으로 전달하며 DB에 원문 저장하지 않습니다. TOOL 메시지에는 `app.open: SUCCEEDED`만 저장합니다. 최종 assistant 응답은 일반 대화 텍스트로 저장합니다.

티켓은 호출 사용자·대화·Tool을 검증하는 15분 유효한 서명 토큰입니다. 타인 티켓이나 만료·변조 티켓은 401입니다. 클라이언트가 보고한 LOCAL 성공은 서버가 실행을 증명한 결과가 아닙니다. AI에 재전달하는 `toolResults`는 `callId`, `tool`, `status`, 선택 `result` 배열입니다.

### CLOUD 호출 실행·대화 계속

```http
POST /agent/cloud-tools

{"ticket":"<issuedTicket>","arguments":{"latitude":37.5665,"longitude":126.978},"confirmed":true}
```

AI가 발급한 Tool Arguments와 Digest가 일치해야 합니다. 서버가 직접 Cloud Tool을 실행하고 실제 결과를 AI에 전달합니다. 클라이언트가 `/agent/tool-results`에 Cloud 성공을 직접 보고하는 방식은 거부합니다.

## 로그·오류·Health

음성 최소 로그는 `POST /logs/voice`로 생성하고 `GET /logs/voice?limit=30&cursor=<id>`로 자신의 기록만 조회합니다. Body는 `commandType`, `status`, `duration`, 선택 `errorCode`입니다. commandType은 `system.status`, `app.open`, `app.close`, `unsupported`만 허용하고 status는 `SUCCESS`, `FAILED`, `CANCELLED`입니다. errorCode는 `BLOCKED`, `EXECUTION_FAILED`, `DESKTOP_REQUIRED`, `CANCELLED`, `CONFIRMATION_REQUIRED`, `INVALID_ARGUMENTS`만 허용합니다. duration은 0~86400000ms입니다. 생성은 201이며 계정 ID는 인증 정보에서 가져옵니다. transcript/audio/arguments 같은 원문 필드는 400입니다. 생성은 분당 30회 제한입니다. 클라이언트 실행 보고이며 서버의 OS 실행 증명은 아닙니다.

`GET /logs/tools?limit=30&cursor=<logId>`는 자신의 Tool 로그만 반환합니다. Body로 임의의 로그를 생성하는 API는 제공하지 않습니다.

공통 오류:

```json
{
  "statusCode": 404,
  "code": "CONVERSATION_NOT_FOUND",
  "message": "Conversation not found",
  "requestId": "<uuid>"
}
```

Validation은 message 배열일 수 있습니다. `X-Request-ID`가 응답 헤더에도 포함됩니다. 원본 Prisma/SQL/외부 API 오류나 Secret은 노출하지 않습니다.

`GET /health`는 PostgreSQL 연결과 외부 서비스 설정 여부만 반환합니다. AI/Weather의 실시간 가용성을 보장하지 않습니다. 실제 키나 AI URL이 없으면 해당 기능은 503입니다. 외부 장애는 502, 인증 실패는 401, Conflict는 409, 요청 제한은 429입니다.

기본 요청 크기는 128KB, 외부 요청 Timeout은 10초, 외부 응답 최대 크기는 512KB입니다. MVP 요청 제한은 전체 120회/분, 회원가입·로그인 각각 10회/분, Refresh 30회/분이며 단일 프로세스 메모리 기준입니다.
