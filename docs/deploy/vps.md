# 데이로그 신청폼 — VPS 배포 (GitHub Actions)

`docs/00_VPS_공통_배포_가이드.md`의 절차를 이 프로젝트 값으로 채운 문서다.
main push → GitHub Actions → VPS에서 `git pull` → Docker 빌드·재시작 → 호스트 nginx → HTTPS.

## 1. 이 프로젝트의 설정값

| 자리표시자 | 값 |
| --- | --- |
| `<NAME>` | `daylog` |
| `<OWNER>/<REPO>` | `NewEngel/Daylog_Instagram` |
| `<PORT>` (호스트) | `3016` |
| `<APP_PORT>` (컨테이너) | `3000` |
| `<DOMAIN>` | `apply.day-log.co.kr` |
| `<HEALTH_PATH>` | `/healthz` |
| VPS / SSH | `115.71.239.106` / `root:22` |
| 배포 경로 | `/root/daylog` |
| 컨테이너명 | `daylog-app` (기존 유지) |
| 시크릿 | GitHub Actions secrets → 배포 시 `/root/daylog/.env` 생성 |
| nginx 설정 | `/etc/nginx/conf.d/apply.day-log.co.kr.conf` |

저장소에 이미 반영된 파일: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/deploy-vps.yml`.

## 2. VPS 사전 확인

```bash
ssh root@115.71.239.106
docker ps -a --format '{{.Names}}\t{{.Ports}}'
ss -ltnp 'sport = :3016'
nginx -t
```

`daylog-app` 외의 컨테이너가 `3016`을 쓰고 있지 않은지 확인한다.

## 3. 시크릿 — GitHub Actions secrets

`deploy-vps.yml`이 배포할 때마다 Actions secrets를 읽어 `/root/daylog/.env`를 새로 만든다.
서버에서 직접 `.env`를 편집하면 다음 배포에 덮어써지므로, 값은 반드시 Actions secrets에 넣는다.

| 시크릿 | 용도 |
| --- | --- |
| `VPS_HOST` | `115.71.239.106` |
| `VPS_SSH_KEY` | 배포용 SSH 개인키 전문 |
| `GOOGLE_APPS_SCRIPT_URL` | Apps Script 배포 URL |
| `GOOGLE_APPS_SCRIPT_SHARED_SECRET` | Apps Script 공유 시크릿 |

`DAYLOG_FORM_TYPE`, `APPS_SCRIPT_TIMEOUT_MS`는 워크플로에 고정값으로 들어 있다.
Apps Script 두 값이 비면 페이지는 뜨지만 신청 제출이 503이 된다 (`api/_shared.ts`).

```bash
gh secret set GOOGLE_APPS_SCRIPT_URL --repo NewEngel/Daylog_Instagram
gh secret set GOOGLE_APPS_SCRIPT_SHARED_SECRET --repo NewEngel/Daylog_Instagram
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
`docs/**`와 Markdown만 바뀐 push는 제외된다. 로그의 `health: 200`은 컨테이너 내부 응답 확인이다.

## 6. 도메인과 HTTPS

`day-log.co.kr` DNS에 A 레코드 `apply` → `115.71.239.106`을 등록합니다.

```bash
dig +short A apply.day-log.co.kr
```

`/etc/nginx/conf.d/apply.day-log.co.kr.conf`가 없으면 80 전용 블록으로 시작한다.
기존 HTTPS 설정이 있으면 덮어쓰지 말고 확인만 한다.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name apply.day-log.co.kr;

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
certbot --nginx -d apply.day-log.co.kr --redirect
```

certbot이 443 블록과 리다이렉트를 삽입한 뒤, **443 `location /`에도 위 proxy 헤더가 그대로 있는지 확인한다.**
`X-Forwarded-For`는 API의 rate limit이 클라이언트 IP를 식별하는 데 사용하므로 반드시 전달해야 한다.

```bash
certbot certificates
certbot renew --cert-name apply.day-log.co.kr --dry-run
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
curl -I https://apply.day-log.co.kr/healthz   # 200
curl -I http://apply.day-log.co.kr/           # 301 또는 308
```

브라우저에서 신청 1건을 제출해 Apps Script 스프레드시트 수신까지 확인한다.

- [ ] Actions secrets 4개 등록 완료
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
| 도메인 / 호스트 포트 / 앱 포트 | daylog.hyukrecord.com / 3016 / 3000 |
| 배포 경로 / 컨테이너명 | /root/daylog / daylog-app |
| 시크릿 관리 | GitHub Actions secrets |
| nginx 설정 / 인증서 이름 | /etc/nginx/conf.d/daylog.hyukrecord.com.conf / (certbot certificates 확인) |
| 정상 배포 커밋 / 확인 일자 | `f433bf61400e9a0de0ce92d7b515ed4882f884a3` / 2026-09-08 |

## 9. 수동 배포 (Actions를 쓰지 않을 때)

```bash
cd /root/daylog && git pull && docker compose up -d --build
```

## 10. 문제 해결

| 증상 | 조치 |
| --- | --- |
| 신청 제출이 503 | Apps Script 시크릿 2개가 Actions secrets에 있는지 확인 후 재배포 |
| `502 Bad Gateway` | `docker ps`, 내부 `curl 127.0.0.1:3016/healthz`, proxy_pass 포트 확인 |
| 컨테이너의 외부 요청(Apps Script) 실패 | `network_mode: bridge` 누락 여부 → 서버·컨테이너 DNS·방화벽 |
| Actions SSH 인증 실패 | 개인키 전체 내용으로 `VPS_SSH_KEY` 재등록 |
| 서버에서 고친 `.env`가 되돌아감 | 정상 동작. 값은 Actions secrets에서 관리한다 |


## 2026-09-08 도메인 연결 확인

- 가비아 권한 DNS와 공용 DNS에서 `daylog.hyukrecord.com` → `115.71.239.106` 확인.
- `/etc/nginx/conf.d/daylog.hyukrecord.com.conf`를 추가해 기존 앱 `127.0.0.1:3016`에 연결.
- nginx 문법 검사 통과, Let’s Encrypt 인증서 발급 및 HTTPS 적용 완료. 인증서 만료일은 2026-12-07입니다.
- 외부 HTTPS `/` 200, `/healthz` 응답 `ok`, HTTP → HTTPS 301 확인.
- 서버의 인증서 자동 갱신 타이머 활성 상태 확인. 갱신 dry-run은 아직 수행하지 않았습니다.
- 초기 HTTP 설정 원본은 [nginx 설정](../../deploy/nginx/daylog.hyukrecord.com.conf)입니다. 운영 서버 파일에는 Certbot이 HTTPS 및 리다이렉트를 추가했습니다. 운영 파일을 초기 설정으로 덮어쓰지 않습니다.


## SSH 개인키 파싱 오류

`ssh.ParsePrivateKey: ssh: no key found`는 서버 명령 실행 전에 발생합니다. `VPS_SSH_KEY`에는 파일 경로·공개키가 아닌 배포용 개인키 파일 전체가 줄바꿈을 유지한 상태로 등록되어야 합니다.

2026-09-08 사용자가 맥의 `~/.ssh/daylog_deploy`를 `VPS_SSH_KEY`에 직접 재등록했습니다. 실패했던 [배포 실행 34195726212](https://github.com/NewEngel/Daylog_Instagram/actions/runs/34195726212)을 재실행해 SSH 접속과 배포 성공을 확인했습니다. 배포 커밋은 `f433bf61400e9a0de0ce92d7b515ed4882f884a3`입니다. 배포 후 외부 HTTPS 200, `/healthz`의 `ok`, HTTP → HTTPS 301을 확인했습니다. 실제 신청 제출·Sheets 수신은 이번 검수에 포함하지 않았습니다. 키의 실제 내용은 문서·로그·채팅에 출력하지 않습니다.
