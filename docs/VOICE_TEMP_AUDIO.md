# Voice Command Temporary Audio

`POST /voice/commands`는 인증된 Desktop이 전송한 임시 WAV 음성 명령을 처리합니다.

- WAV MIME, RIFF/WAVE/fmt/data 시그니처, 선언 크기와 최대 크기 검증
- 일반 Attachment 저장소와 분리된 `VOICE_TEMP_DIR` 사용
- AI 서버의 `/v1/voice/commands`로 파일 Binary를 multipart 전달
- AI 서버에 로컬 경로를 전달하지 않음
- 처리 성공과 실패 모두 `finally`에서 서버 임시 파일 삭제
- 서버 시작 시 TTL 정리 후 독립 주기로 고아 파일 재정리
- Docker의 `/tmp/ace/voice`는 영구 Attachment Volume에 포함하지 않음
- PostgreSQL과 Object Storage에 Raw Audio를 저장하지 않음

필요한 환경변수는 `.env.example`의 `VOICE_*` 항목을 사용합니다. AI 서버가 구성되지 않았거나 처리에 실패하면 음성 전용 오류 코드를 반환합니다.
