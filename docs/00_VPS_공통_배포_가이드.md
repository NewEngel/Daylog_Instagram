# 같은 VPS에 프로젝트 추가 배포하기

이 Markdown 파일을 각 프로젝트의 `docs/VPS_DEPLOY.md`로 복사해 사용한다. **현재 프로젝트와 같은 서버에, 같은 Docker·GitHub Actions·nginx 방식으로 새 프로젝트를 추가**하는 문서다. 서버 설정은 아래 고정값을 유지하고 프로젝트별 이름·저장소·포트·도메인만 바꾼다. 앱의 빌드·실행 방식과 내부 포트는 해당 프로젝트에 맞춘다. 별도 자동 설정 스크립트 없이도 이 문서의 수동 절차로 설정할 수 있다.

대상 구성: **GitHub Actions → Docker → 호스트 nginx → 도메인·HTTPS**

작성 기준: 2026-09-07. 현재 저장소의 `scripts/setup-vps-deploy.sh`, `docker-compose.yml`, `.github/workflows/deploy.yml`을 기준으로 작성했다. 서버에 직접 접속해 재검증한 문서는 아니므로 새 프로젝트의 이름·포트 충돌과 최종 응답은 아래 절차로 확인한다.

## 0. 그대로 유지할 서버 설정

| 항목 | 고정값 |
| --- | --- |
| VPS IP | `115.71.239.106` |
| SSH 계정 / 포트 | `root` / `22` |
| 배포 경로 규칙 | `/root/<NAME>` |
| 컨테이너 네트워크 | `network_mode: bridge` |
| 호스트 포트 바인딩 | `127.0.0.1:<PORT>:<APP_PORT>` |
| 호스트 nginx 경로 | `/etc/nginx/conf.d/<DOMAIN>.conf` |
| 인증서 | 기존 Certbot의 nginx 플러그인 사용 |
| 배포 | main push → GitHub Actions 소스 복사 → VPS에서 Docker 빌드·재시작 |

기존 서버의 Docker·nginx·방화벽을 새로 구성하는 작업이 아니다. 기존 서비스를 유지하면서 프로젝트별 컨테이너와 도메인 설정을 추가한다. 서버 IP는 현재 자동 설정 스크립트에 기록된 값이다.

## 1. 프로젝트별로 채울 설정값

문서를 복사한 뒤 아래 표를 실제 값으로 작성한다. 코드 블록의 `<…>`도 같은 값으로 치환한다. 치환 전 코드를 그대로 실행하지 않는다.

| 자리표시자 | 의미 | 작성 예시 |
| --- | --- | --- |
| `<NAME>` | 프로젝트 식별자. 소문자 영문·숫자·하이픈 사용, 다른 프로젝트와 중복 금지 | `my-project` |
| `<OWNER>` | GitHub 사용자 또는 조직 | 기존 프로젝트는 `NewEngel` |
| `<REPO>` | GitHub 저장소명 | `my-project` |
| `<PORT>` | 호스트에서 앱으로 연결할 미사용 포트 | `3105` — 사용 가능 여부는 직접 확인 |
| `<APP_PORT>` | 컨테이너 내부 앱 포트 | 정적 사이트 `80`, 서버 앱 예시 `3000` |
| `<DOMAIN>` | 프로젝트의 전체 도메인 | `app.example.com` |
| `<HEALTH_PATH>` | 인증 없이 HTTP 200을 반환하는 상태 확인 경로 | 정적 사이트 `/`, 서버 앱 `/api/health` |

SSH 계정·포트·서버 IP는 0장의 값을 그대로 사용한다. 정적 사이트가 현재 프로젝트와 같은 Vite SPA라면 `<APP_PORT>`는 `80`, `<HEALTH_PATH>`는 `/`로 둔다.

```text
example-a.com → VPS nginx :443 → 127.0.0.1:3105 → 프로젝트 A
example-b.com → VPS nginx :443 → 127.0.0.1:3106 → 프로젝트 B
```

프로젝트마다 저장소, 배포 경로, 컨테이너명, 호스트 포트, nginx 도메인 설정을 분리한다. 앱 내부 포트는 여러 프로젝트에서 같은 값을 써도 된다.

## 2. 준비 사항과 포트 확인

### 로컬 PC

Git, 프로젝트의 빌드 도구, SSH, `ssh-copy-id`, GitHub CLI(`gh`), `dig`를 준비한다. GitHub 저장소의 Actions·Secrets 관리 권한, VPS 접속 수단, DNS 관리 권한이 필요하다.

```bash
gh auth status
ssh root@115.71.239.106
```

첫 SSH 연결 시 업체 콘솔 등 신뢰할 수 있는 경로에서 서버 지문을 확인한 뒤 수락한다.

### VPS

기존 VPS에 설치되어 있는 Docker·Compose, nginx, Certbot을 그대로 사용한다. 다음은 재설치 명령이 아니라 상태와 포트 충돌을 확인하는 명령이다.

```bash
cat /etc/os-release
docker version
docker compose version
nginx -v
certbot --version
docker ps -a --format '{{.Names}}\t{{.Ports}}'
ss -ltnp 'sport = :<PORT>'
nginx -t
```

`docker compose`가 없다면 `docker-compose version`도 확인한다. 뒤의 워크플로는 두 명령을 지원한다. 중지된 컨테이너까지 확인해 이름이 겹치지 않게 한다. `ss` 결과가 없어도 기존 프로젝트 설정에 예약된 포트가 아닌지 운영 기록을 확인한다.

기존 서버의 웹용 TCP 80·443과 SSH 22 설정을 유지한다. 컨테이너의 새 호스트 포트는 `127.0.0.1`에만 연결한다. 연결이 실패할 때 기존 방화벽을 확인한다.

호스트 nginx는 기존과 같이 `/etc/nginx/conf.d/<DOMAIN>.conf`에 프로젝트별 설정을 추가한다. 현재 프로젝트의 `3015`는 사용 중인 설정값이므로 새 프로젝트에 재사용하지 않는다. 예시의 `3105`도 비어 있다고 가정하지 말고 실행 직전에 확인한다.

## 3. 저장소에 배포 파일 추가

프로젝트 루트에 다음 파일을 준비한다. 기존 파일이 있으면 앱의 실행 방식을 보존하면서 필요한 부분을 수정한다.

```text
프로젝트/
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── nginx.conf                 # 정적 SPA 예시에 필요
└── .github/workflows/deploy.yml
```

### 3.1 Dockerfile: 정적 SPA 예시

Vite 등 `npm run build` 결과가 `dist/`에 생성되는 프로젝트용이다. Node 버전·패키지 관리자·출력 경로는 프로젝트에 맞게 조정한다. `npm ci`에는 커밋된 `package-lock.json`이 필요하다.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

컨테이너 내부 `nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

이 fallback은 브라우저 라우팅을 사용하는 SPA용이다. 일반 정적 문서 사이트에서 없는 주소를 실제 404로 처리하려면 마지막 항목을 `=404`로 바꾼다.

### 3.2 Dockerfile: Node 서버 앱 예시

위 정적 Dockerfile 대신 선택한다. 이 예시는 `npm run build`가 존재하고 `npm start`가 운영 서버를 실행하는 프로젝트를 전제로 한다. 빌드가 없는 앱은 빌드 행을 제거한다. Python·Go 등 다른 런타임은 해당 앱의 Dockerfile을 사용하며 이후 Compose·배포·도메인 절차는 동일하다.

```dockerfile
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

앱은 컨테이너 안에서 `0.0.0.0:<APP_PORT>`로 요청을 받아야 한다. `EXPOSE`만으로 앱의 실제 포트나 바인딩 주소가 바뀌지는 않는다. `npm start`가 개발 서버나 미리보기 명령이면 운영 서버 명령으로 변경한다. Next.js standalone 등 별도 출력 방식은 그 방식에 맞는 Dockerfile을 사용한다.

### 3.3 docker-compose.yml

```yaml
services:
  app:
    build:
      context: .
    image: <NAME>:latest
    container_name: <NAME>
    restart: unless-stopped
    # 기존 VPS와 동일한 네트워크 설정
    network_mode: bridge
    ports:
      - "127.0.0.1:<PORT>:<APP_PORT>"
```

**이 서버에서는 `network_mode: bridge`를 유지한다.** 현재 프로젝트에 기록된 Compose 네트워크의 외부 통신 문제를 피하기 위한 동일 설정이다. 새 프로젝트에서 이 행을 생략하지 않는다. DB 등 여러 컨테이너를 사용하는 앱은 기본 bridge에서 Compose 서비스명으로 자동 연결된다고 가정하지 말고 연결 주소를 별도로 구성한다.

Docker 28 미만은 같은 L2 네트워크에서 localhost 공개 포트에 접근할 수 있는 예외가 있다. 구버전 서버라면 Docker 버전과 방화벽도 확인한다. [Docker 포트 공개 안내](https://docs.docker.com/engine/network/port-publishing/)

### 3.4 .dockerignore

```text
node_modules
.git
.github
dist
.next
docs
.env
.env.*
*.pem
*.key
```

비밀 파일은 `.gitignore`에도 등록하고 Git에 커밋하지 않는다. `.dockerignore`는 Docker 빌드 컨텍스트만 제한한다. 이미 커밋한 비밀 파일을 Git 기록이나 전송 소스에서 제거해 주지는 않는다.

### 3.5 환경변수와 영속 데이터

**서버 앱:** VPS의 배포 폴더 바깥에 `/etc/<NAME>/app.env`를 만들고 권한을 `600`으로 설정한다. 앱에 필요한 `KEY=value`를 입력한 뒤 Compose의 `app` 아래 다음을 추가한다.

```yaml
    env_file:
      - /etc/<NAME>/app.env
```

Compose의 `.env` 자동 로딩은 주로 설정 치환용이며, 파일을 만들었다고 모든 값이 컨테이너에 전달되는 것은 아니다. 위처럼 `env_file` 또는 `environment`를 지정한다. [Compose 환경변수 파일](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)

**정적 사이트:** 환경값은 빌드 시 결과물에 들어간다. 예를 들어 Vite의 공개 API 주소가 필요하면 빌드용 Dockerfile의 `RUN npm run build` 앞에 다음을 추가한다.

```dockerfile
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
```

Compose의 `build`에는 다음처럼 공개 값을 전달한다.

```yaml
    build:
      context: .
      args:
        VITE_API_URL: "https://api.example.com"
```

브라우저에 들어갈 값에 비밀키를 넣지 않는다. DB·업로드가 필요한 앱은 별도의 영속 볼륨이나 배포 경로 밖의 디렉터리와 백업 정책을 마련한다. 아래 워크플로는 `/root/<NAME>`을 비우므로 그 안에 운영 데이터를 저장하면 안 된다.

## 4. SSH 키와 GitHub Secrets 설정 — 로컬 PC

프로젝트별 배포 키를 사용한다. 아래 키 파일이 이미 있으면 생성 명령을 건너뛰고 검증부터 진행한다. 기존 키를 덮어쓰지 않는다.

```bash
ssh-keygen -t ed25519 -C 'github-actions-<NAME>' -f ~/.ssh/<NAME>_deploy -N ''
ssh-copy-id -i ~/.ssh/<NAME>_deploy.pub root@115.71.239.106
ssh -i ~/.ssh/<NAME>_deploy -o IdentitiesOnly=yes root@115.71.239.106 'echo connected'
```

접속 성공 후 등록한다.

```bash
gh secret set VPS_SSH_KEY --repo <OWNER>/<REPO> < ~/.ssh/<NAME>_deploy
gh secret set VPS_HOST --repo <OWNER>/<REPO> --body '115.71.239.106'
```

| 시크릿 | 넣을 값 |
| --- | --- |
| `VPS_HOST` | 모든 프로젝트에서 동일한 `115.71.239.106` |
| `VPS_SSH_KEY` | `.pub`가 아닌 개인키 파일 전체 내용 |

GitHub의 **Settings → Secrets and variables → Actions**에서도 등록할 수 있다. 개인키는 문서·코드·채팅에 붙여넣지 않는다. 키를 프로젝트별로 나누더라도 모두 root로 접속하면 권한까지 프로젝트별로 격리되는 것은 아니다. [GitHub Secrets 안내](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

## 5. GitHub Actions 자동 배포

`.github/workflows/deploy.yml`에 작성한다. 아래는 현재 프로젝트의 워크플로에서 프로젝트명·포트·상태 확인 경로만 치환한 템플릿이다. 액션 버전, SSH 계정, 소스 복사 방식과 실행 순서도 현재와 동일하게 유지한다.

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]
    paths-ignore:
      - '**/*.md'
  workflow_dispatch:

concurrency:
  group: deploy-<NAME>
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Copy source to VPS
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          source: "."
          target: /root/<NAME>
          rm: true

      - name: Build and start on VPS
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          command_timeout: 15m
          script: |
            set -euo pipefail
            cd /root/<NAME>

            if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
            $DC up -d --build
            sleep 3
            code=$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:<PORT><HEALTH_PATH> || true)
            echo "health: $code"
            test "$code" = "200"
```

`rm: true`는 **대상 폴더의 기존 내용을 삭제**하므로 `target`은 반드시 해당 프로젝트만의 경로여야 한다. `/root` 또는 다른 서비스의 경로를 넣지 않는다. 로그에 앱의 비밀값을 출력하지 않도록 앱 로깅도 확인한다.

배포할 코드와 파일을 검토해 `main`에 반영한다. 로컬 미커밋 변경은 배포되지 않는다. GitHub **Actions → Deploy to VPS → Run workflow → main**에서 최초 배포를 실행한다. 이후 코드 push 시 자동 배포되며 Markdown만 바뀐 push는 제외된다.

Actions는 현재 프로젝트와 동일하게 시작 후 3초에 상태 경로를 확인한다. 기동 시간이 긴 앱은 이 대기 시간을 조정한다. `health: 200`은 내부 컨테이너 응답을 확인한 것이다. 다음 도메인·HTTPS 검증까지 진행한다. 이 예시는 DB 마이그레이션, 무중단 배포, 자동 롤백을 포함하지 않는다.

## 6. 도메인과 HTTPS 연결

### 6.1 DNS 관리 화면

새 서비스 도메인의 A 레코드를 `115.71.239.106`로 설정한다. 동일 이름의 CNAME 충돌과 잘못된 AAAA 레코드를 확인한다. Cloudflare를 쓴다면 최초 직접 연결 검증은 DNS only로 진행하면 확인하기 쉽다.

```bash
# 로컬 PC에서 실행
dig +short A <DOMAIN>
dig +short AAAA <DOMAIN>
```

이미 서비스 중인 주소를 이전한다면 9장의 이전 절차를 먼저 읽는다.

### 6.2 호스트 nginx — VPS

`/etc/nginx/conf.d/<DOMAIN>.conf`가 없을 때 아래 내용으로 새로 만든다. 기존 파일이 있으면 내용을 확인하고 백업한 뒤 필요한 부분만 편집한다. 기존 HTTPS 설정을 이 HTTP 예시로 덮어쓰지 않는다.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <DOMAIN>;

    location / {
        proxy_pass http://127.0.0.1:<PORT>;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

IPv6를 비활성화한 서버에서는 IPv6 `listen` 행을 제외한다. WebSocket·SSE·대용량 업로드를 쓰는 앱은 연결 헤더·버퍼링·제한값 등 해당 기능의 프록시 설정을 추가해야 한다.

```bash
nginx -t && systemctl reload nginx
```

대상 도메인의 `conflicting server name` 경고는 해결한다. 문법 검사 성공만으로 원하는 server 블록이 선택된다고 단정하지 않는다. [nginx 설정 적용 안내](https://nginx.org/en/docs/beginners_guide.html)

### 6.3 HTTPS — VPS

DNS가 서버를 가리키고 외부에서 80번 포트에 접근할 수 있는 상태에서 실행한다.

```bash
certbot --nginx -d <DOMAIN> --redirect
```

최초 계정의 이메일·약관 안내를 완료한다. 발급 후 확인한다.

```bash
certbot certificates
certbot renew --cert-name <DOMAIN> --dry-run
systemctl list-timers --all | grep -i certbot
```

실제 인증서 이름이 도메인과 다르면 `certificates` 출력의 이름으로 바꾼다. timer가 없다면 설치 방식에 따른 cron 등 자동 갱신 스케줄을 확인한다. 인증서 폴더 존재만으로 HTTPS 적용과 갱신이 정상이라고 판단하지 않는다. [Certbot 갱신 안내](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)

## 7. 최종 검증과 운영 기록

VPS에서 실행한다.

```bash
docker ps --filter name=<NAME>
docker logs --tail 100 <NAME>
curl -I http://127.0.0.1:<PORT><HEALTH_PATH>
nginx -t
```

로컬 PC에서 실행한다.

```bash
curl -I https://<DOMAIN><HEALTH_PATH>
curl -I http://<DOMAIN>/
```

상태 확인 경로는 HTTPS에서 200, HTTP 주소는 HTTPS로 301 또는 308 리다이렉트가 나와야 한다. API가 HEAD를 지원하지 않으면 `curl -i`로 GET 요청을 보낸다. 브라우저에서 실제 화면·주요 기능을 확인하고 SPA라면 하위 경로 새로고침도 검사한다.

- [ ] 서버 IP `115.71.239.106`, SSH `root:22`, `network_mode: bridge`가 기존과 동일하다.
- [ ] 프로젝트명·컨테이너명·경로·호스트 포트가 다른 프로젝트와 충돌하지 않는다.
- [ ] 배포할 main 코드와 로컬 빌드·검사가 정상이다.
- [ ] SSH와 시크릿 등록이 완료되었다.
- [ ] Actions와 외부 HTTPS 확인이 성공했다.
- [ ] 인증서 갱신 테스트와 스케줄을 확인했다.
- [ ] 환경변수·DB·업로드가 소스 배포 시 삭제되지 않는 위치에 있다.

프로젝트마다 다음 운영 기록을 남긴다. 비밀키·비밀번호는 적지 않는다.

| 기록 | 값 |
| --- | --- |
| 프로젝트 / 저장소 | |
| 서버 / 배포 계정 / SSH 포트 | |
| 도메인 / 호스트 포트 / 앱 포트 | |
| 배포 경로 / 컨테이너명 | |
| 환경변수 파일 / 데이터 저장 위치 | |
| nginx 설정 경로 / 인증서 이름 | |
| 정상 배포 커밋 / 확인 일자 | |

## 8. 문제 해결과 복구

| 증상 | 확인 및 조치 |
| --- | --- |
| `ssh: no key found` | 공개키·잘린 개인키 여부 확인 후 개인키 파일에서 시크릿 재등록 |
| `no such host` | VPS_HOST의 IP·공백·접두사 확인 |
| `unable to authenticate` | 공개키 등록 및 같은 개인키의 로컬 SSH 접속 확인 |
| SSH timeout | 실제 IP·SSH 포트·서버/업체 방화벽 확인 |
| 컨테이너명·포트 충돌 | `docker ps -a`, `ss`로 확인하고 해당 프로젝트 설정값 변경 |
| 빌드 실패 | Dockerfile의 런타임·빌드 명령·잠금 파일·필수 빌드 변수 확인 |
| 환경변수가 없음 | 런타임 `env_file`과 빌드 시 변수 전달을 구분해 확인 |
| `502 Bad Gateway` | 컨테이너 실행 상태·내부 응답·앱 바인딩 주소·proxy_pass 포트 확인 |
| nginx 기본 페이지 | DNS·도메인 server_name·설정 include·reload 확인 |
| 인증서 발급 실패 | A·AAAA, 외부 80번 포트, nginx 도메인 설정 확인 |
| 컨테이너의 외부 요청 실패 | 먼저 `network_mode: bridge` 누락 여부를 확인하고 서버·컨테이너 DNS 및 방화벽 확인 |
| 앱 재배포 후 데이터 사라짐 | 소스 디렉터리에 데이터가 있었는지 확인하고 백업 복원·영속 경로 수정 |

문제를 수정한 뒤 Actions를 다시 실행한다. 코드 문제라면 정상 커밋 이후의 문제 변경을 revert해 main에 반영하고 재배포한다. 이 예시는 이전 이미지를 자동 보관·복원하지 않으므로 즉시 롤백이 필요한 앱은 별도 이미지 태그와 복구 절차를 마련한다. DB 스키마 변경은 코드 복구만으로 되돌릴 수 있다고 가정하지 않는다.

## 9. 기존 도메인을 다른 서버에서 옮길 때

HTTPS 사용자가 있는 기존 주소는 DNS를 바꾸기 전에 새 서버의 앱·nginx·인증서를 준비한다. DNS-01로 인증서를 선발급하고 새 nginx의 443 설정에 연결한 뒤, 로컬에서 실제 주소와 새 서버 IP를 조합해 검사할 수 있다.

```bash
curl --resolve <DOMAIN>:443:115.71.239.106 -I https://<DOMAIN><HEALTH_PATH>
```

정상 응답 확인 후 DNS를 변경하고 전파 동안 이전 서비스를 유지한다. 수동 DNS-01은 TXT 레코드 수정이 필요하며 자동 훅 없는 수동 인증서는 자동 갱신되지 않는다. 반복 운영에는 DNS 제공자용 Certbot 플러그인 등 갱신 방식을 별도로 구성한다. [Certbot 수동 검증 안내](https://eff-certbot.readthedocs.io/en/stable/using.html#manual)

## 10. 자동 설정 스크립트가 있는 경우

이미 `scripts/setup-vps-deploy.sh`를 함께 제공받았다면 SSH 키·시크릿·nginx·인증서 설정에 사용할 수 있다. 이 MD만 복사했다면 스크립트가 없어도 4·6장의 수동 절차로 진행하면 된다.

```bash
bash scripts/setup-vps-deploy.sh \
  --repo <OWNER>/<REPO> \
  --name <NAME> \
  --port <PORT> \
  --domain <DOMAIN> \
  --host 115.71.239.106 \
  --dry-run
```

설정 대상을 확인한 뒤 `--dry-run`을 빼고 실행한다. 해당 스크립트의 현재 구현을 먼저 읽는다. 함께 사용하던 스크립트는 dry-run에서 값만 출력하고 연결을 검증하지 않으며, 기존 nginx 파일과 인증서 디렉터리를 건너뛴다. 시크릿은 재등록하고 Docker 파일 생성·앱 배포는 하지 않는다. 실제 실행 뒤에는 5·7장의 배포와 최종 확인까지 완료한다.
