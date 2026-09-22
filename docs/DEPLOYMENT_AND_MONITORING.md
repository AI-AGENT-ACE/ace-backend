# 운영 배포와 모니터링

## 배포 단위

Backend와 AI는 별도 저장소와 이미지로 배포한다. Backend workflow는 `backend`만 갱신하고 `--no-deps`를 사용하므로 AI·PostgreSQL·Redis를 재시작하지 않는다. AI 저장소에서도 `AI_IMAGE`를 지정해 `docker compose --profile ai pull ai`와 `up -d --no-deps ai`만 실행한다. 친구가 관리하는 AI 저장소에는 `deploy/templates/ai-repository-deploy.yml`을 복사한 뒤 AI Dockerfile과 health endpoint에 맞게 조정한다.

운영 이미지는 다음 두 태그를 함께 만든다.

- `ghcr.io/ai-agent-ace/ace-backend:<commit SHA>`: 배포 및 rollback 기준
- `ghcr.io/ai-agent-ace/ace-backend:latest`: 현재 main 확인용

Rollback은 서버에서 `BACKEND_IMAGE`를 이전 SHA 이미지로 지정한 뒤 `docker compose -f compose.production.yaml up -d --no-deps backend`로 수행한다.

## GitHub 설정

Production Environment에 다음 값을 등록한다. 비밀값을 저장소 파일이나 workflow 본문에 넣지 않는다.

| 종류     | 이름              | 용도                    |
| -------- | ----------------- | ----------------------- |
| Secret   | `AWS_HOST`        | Linux 서버 주소         |
| Secret   | `AWS_USER`        | SSH 사용자              |
| Secret   | `AWS_SSH_KEY`     | 배포 전용 개인 키       |
| Secret   | `AWS_KNOWN_HOSTS` | 검증된 서버 host key    |
| Variable | `DEPLOY_PATH`     | 서버의 Compose 디렉터리 |

서버의 `DEPLOY_PATH`에는 `compose.production.yaml`과 Backend `.env`를 둔다. `.env`에는 JWT·DB·외부 API 비밀값과 `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`를 저장하고 권한을 제한한다. `DATABASE_URL`의 DB host는 Compose 서비스명인 `postgres`를 사용하고 비밀번호는 URL encoding한다. GHCR가 private이면 서버에서 읽기 권한 토큰으로 한 번 `docker login ghcr.io`를 수행한다.

## Migration 정책

운영 컨테이너 시작 명령은 `node dist/main.js`뿐이다. 배포 workflow가 먼저 일회성 `backend-migrate` 서비스로 `prisma migrate deploy`를 실행한다. 실패하면 `set -e`로 배포가 중단되어 기존 Backend 컨테이너를 유지한다. 운영에서 `prisma db push`를 사용하지 않는다.

## 상태와 로그

- `/health/live`: 프로세스 생존 상태. DB·AI를 조회하지 않는다.
- `/health` 및 `/health/ready`: DB 연결과 필수 테이블을 확인한다. DB 실패는 HTTP 503이다.
- AI가 설정됐지만 `/health` 호출에 실패하면 HTTP 200의 `degraded`와 `ai: unavailable`을 반환한다.
- AI 상태 확인은 2초 안에 끝내 Docker readiness가 외부 의존성 때문에 장시간 멈추지 않게 한다.
- Redis는 실제 Store를 연결하기 전까지 `not_configured`로 표시한다.
- Compose healthcheck는 `/health/ready`를 사용한다.

HTTP 완료 로그는 한 줄 JSON으로 표준 출력 또는 표준 오류에 기록한다. `timestamp`, `level`, `service`, `requestId`, `method`, `route`, `status`, `duration`, `errorCode`만 포함하며 query, body, message, password, JWT, 업로드 파일과 음성 원문은 기록하지 않는다.

```bash
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs --since=30m backend
docker stats --no-stream
df -h
```

이 단계에서는 Docker 로그·healthcheck·서버 자원 확인을 기본으로 한다. 심각한 오류 수집이 필요해지면 Sentry를 2단계로 추가하고, 장기 지표가 필요해진 뒤 Prometheus/Grafana 또는 OpenTelemetry를 추가한다.

## 운영 체크

- 서버 방화벽과 Reverse Proxy에서 Backend 포트를 외부에 직접 노출하지 않는다.
- Proxy hop 수를 확인한 경우에만 `TRUST_PROXY_HOPS`를 설정한다.
- PostgreSQL Volume과 별도로 정기 `pg_dump`를 암호화된 별도 위치에 보관한다.
- 배포 뒤 `/health/ready`, 5xx 로그, 응답 시간, CPU, Memory, Disk와 컨테이너 상태를 확인한다.
- AI 실패가 `degraded`로 보이는지 확인한다.
