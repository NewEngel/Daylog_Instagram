# 데이로그 신청폼 — VPS 배포 (GitHub Actions)

`docs/00_VPS_공통_배포_가이드.md`의 절차를 이 프로젝트 값으로 채운 문서다.
main push → GitHub Actions → 소스 복사 → VPS에서 Docker 빌드·재시작 → 호스트 nginx → HTTPS.

## 1. 이 프로젝트의 설정값

| 자리표시자 | 값 |
| --- | --- |
| `<NAME>` | `daylog` |
| `<OWNER>/<REPO>` | `NewEngel/Daylog_Instagram` |
| `<PORT>` (호스트) | `3016` |
| `<APP_PORT>` (컨테이너) | `3000` |
| `<DOMAIN>` | `daylog.hannah-log.site` |
| `<HEALTH_PATH>` | `/healthz` |
| VPS / SSH | `115.71.239.106` / `root:22` |
| 배포 경로 | `/root/daylog` |
| 컨테이너명 | `daylog-app` (기존 유지) |
| 환경변수 파일 | `/etc/daylog/app.env` |
| nginx 설정 | `/etc/nginx/conf.d/daylog.hannah-log.site.conf` |

저장소에 이미 반영된 파일: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/deploy.yml`.

## 2. VPS 사전 확인

```bash
ssh root@115.71.239.106
docker ps -a --format '{{.Names}}\t{{.Ports}}'
ss -ltnp 'sport = :3016'
nginx -t
```

`daylog-app` 외의 컨테이너가 `3016`을 쓰고 있지 않은지 확인한다.

## 3. 환경변수 파일 — Actions 첫 실행 전에 필수

워크플로는 `rm: true`로 `/root/daylog`를 비운다. 기존에 `/root/daylog/.env`에 두던 시크릿은
배포 경로 밖으로 옮긴다. 이 파일이 없으면 `docker compose up`이 실패한다.

```bash
# VPS에서 실행
mkdir -p /etc/daylog
cp /root/daylog/.env /etc/daylog/app.env   # 기존 파일이 있으면 이동, 없으면 새로 작성
chmod 600 /etc/daylog/app.env
cat /etc/daylog/app.env
```

내용:

```
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec
GOOGLE_APPS_SCRIPT_SHARED_SECRET=<shared-secret>
DAYLOG_FORM_TYPE=daylog_life_session
APPS_SCRIPT_TIMEOUT_MS=9000
```

## 4. SSH 키와 GitHub Secrets — 로컬 PC

```bash
ssh-keygen -t ed25519 -C 'github-actions-daylog' -f ~/.ssh/daylog_deploy -N ''
ssh-copy-id -i ~/.ssh/daylog_deploy.pub root@115.71.239.106
ssh -i ~/.ssh/daylog_deploy -o IdentitiesOnly=yes root@115.71.239.106 'echo connected'
```

기존 키가 있으면 생성 명령을 건너뛰고 접속 확인부터 한다. 접속 성공 후 등록한다.

```bash
gh secret set VPS_SSH_KEY --repo NewEngel/Daylog_Instagram < ~/.ssh/daylog_deploy
gh secret set VPS_HOST --repo NewEngel/Daylog_Instagram --body '115.71.239.106'
```

개인키는 문서·채팅에 붙여넣지 않는다.

## 5. 배포 실행

GitHub **Actions → Deploy to VPS → Run workflow → main**. 이후 main push 시 자동 배포되며
Markdown만 바뀐 push는 제외된다. 로그의 `health: 200`은 컨테이너 내부 응답 확인이다.

## 6. 도메인과 HTTPS

Cloudflare DNS: A 레코드 `daylog` → `115.71.239.106`. 최초 발급은 DNS only(grey)로 두는 편이 확인하기 쉽다.

```bash
dig +short A daylog.hannah-log.site
```

`/etc/nginx/conf.d/daylog.hannah-log.site.conf`가 없으면 80 전용 블록으로 시작한다.
기존 HTTPS 설정이 있으면 덮어쓰지 말고 확인만 한다.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name daylog.hannah-log.site;

    location / {
        proxy_pass http://127.0.0.1:3016;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
nginx -t && systemctl reload nginx
certbot --nginx -d daylog.hannah-log.site --redirect
```

certbot이 443 블록과 리다이렉트를 삽입한 뒤, **443 `location /`에도 위 proxy 헤더가 그대로 있는지 확인한다.**
`X-Forwarded-For`는 API의 rate limit이 클라이언트 IP를 식별하는 데 사용하므로 반드시 전달해야 한다.

```bash
certbot certificates
certbot renew --cert-name daylog.hannah-log.site --dry-run
systemctl list-timers --all | grep -i certbot
nginx -t && systemctl reload nginx
```

## 7. 최종 검증

```bash
# VPS
docker ps --filter name=daylog-app
docker logs --tail 100 daylog-app
curl -I http://127.0.0.1:3016/healthz

# 로컬 PC
curl -I https://daylog.hannah-log.site/healthz   # 200
curl -I http://daylog.hannah-log.site/           # 301 또는 308
```

브라우저에서 신청 1건을 제출해 Apps Script 스프레드시트 수신까지 확인한다.

- [ ] `/etc/daylog/app.env` 존재·권한 600
- [ ] `3016` 포트가 이 프로젝트 전용
- [ ] `VPS_HOST`, `VPS_SSH_KEY` 등록 완료
- [ ] Actions `health: 200`
- [ ] 외부 HTTPS 200, HTTP 리다이렉트
- [ ] 인증서 갱신 dry-run·timer 확인

## 8. 운영 기록

| 기록 | 값 |
| --- | --- |
| 프로젝트 / 저장소 | daylog / NewEngel/Daylog_Instagram |
| 서버 / 계정 / SSH 포트 | 115.71.239.106 / root / 22 |
| 도메인 / 호스트 포트 / 앱 포트 | daylog.hannah-log.site / 3016 / 3000 |
| 배포 경로 / 컨테이너명 | /root/daylog / daylog-app |
| 환경변수 파일 | /etc/daylog/app.env |
| nginx 설정 / 인증서 이름 | /etc/nginx/conf.d/daylog.hannah-log.site.conf / (certbot certificates 확인) |
| 정상 배포 커밋 / 확인 일자 | |

## 9. 수동 배포 (Actions를 쓰지 않을 때)

```bash
cd /root/daylog && git pull && docker compose up -d --build
```

## 10. 문제 해결

| 증상 | 조치 |
| --- | --- |
| `env file /etc/daylog/app.env not found` | 3장의 파일 생성 |
| `502 Bad Gateway` | `docker ps`, 내부 `curl 127.0.0.1:3016/healthz`, proxy_pass 포트 확인 |
| 컨테이너의 외부 요청(Apps Script) 실패 | `network_mode: bridge` 누락 여부 → 서버·컨테이너 DNS·방화벽 |
| Actions SSH 인증 실패 | 개인키 전체 내용으로 `VPS_SSH_KEY` 재등록 |
| 배포 후 환경변수 사라짐 | `/root/daylog` 안에 `.env`를 두지 않았는지 확인 |
