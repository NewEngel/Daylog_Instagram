# 데이로그 Life Session 신청폼 — VPS 배포 설계

- 작성일: 2026-09-03
- 대상 앱: `Daylog_Instagram` (React 19 + Vite 8 SPA + Vercel 스타일 서버리스 API 2종)
- 배포 대상: 개인 VPS `115.71.239.106` (x86_64, mimo-web 등이 이미 구동 중)
- 사이트 도메인: `daylog.hannah-log.site`

## 1. 배경 / 문제

앱은 Vercel Serverless Function을 전제로 설계되어 있다.

- 프론트: `vite build` → 정적 `dist/`
- API: `api/daylog/application.ts`, `api/daylog/track.ts` — `export default async function handler(request, response)` 시그니처(Vercel 파일 라우팅 컨벤션). 두 핸들러는 `api/_shared.ts`를 공유하며, 입력을 검증한 뒤 Google Apps Script(`process.env.GOOGLE_APPS_SCRIPT_URL`)로 shared secret과 함께 전달한다.
- 런타임 의존성 없음: 글로벌 `fetch`, `Buffer`, `node:*`만 사용. `dependencies`는 react/react-dom뿐(프론트 전용).
- 현재 CI는 `.github/workflows/deploy-pages.yml`(GitHub Pages, 정적 전용)뿐 → API가 동작하지 않는다.

목표: 이 앱을 VPS에서 **정적 프론트 + 동작하는 API**로 서비스한다.

## 2. VPS 현황 (SSH 확인 결과, 2026-09-03)

- 호스트 nginx(비컨테이너)가 80/443 종단. 서브도메인별 `/etc/nginx/conf.d/*.conf` 또는 `/etc/nginx/sites-available/*`(+ sites-enabled 심링크) 사용.
- TLS: **certbot(Let's Encrypt)**, 서브도메인별 인증서(`/etc/letsencrypt/live/<sub>/`). `certbot` 설치됨.
- 컨테이너는 `127.0.0.1:PORT`에 바인딩 → nginx가 `proxy_pass`로 연결(mimo: 3000, choseong: 3200 등).
- **포트 3016은 미사용** → daylog가 사용.
- DNS: `mimo.hannah-log.site`는 Cloudflare 프록시(orange, 104.21.x / 172.67.x)로 응답. `daylog.hannah-log.site`는 미등록, 와일드카드 없음.

## 3. 설계

### 3.1 API 실행 어댑터 (`server.mjs`)

의존성 없는 초경량 Node HTTP 서버(`node:http`)를 신규 작성한다. 역할:

1. 정적 서빙: `dist/`의 파일 응답, 존재하지 않는 경로는 `index.html`로 SPA fallback(단 `/api/*`는 제외).
2. API 라우팅:
   - `POST /api/daylog/application` → 컴파일된 `application.js` 핸들러
   - `POST /api/daylog/track` → 컴파일된 `track.js` 핸들러
3. 어댑트: Node `IncomingMessage`/`ServerResponse`를 핸들러가 기대하는 형태로 변환.
   - `ApiRequest = { method, headers, body }` — `body`는 수신 raw 문자열(핸들러의 `parseBody`가 문자열/객체 모두 처리하므로 raw 문자열 전달).
   - `ApiResponse = { status(code), json(obj), setHeader(name,value) }` — 내부에서 Node res로 위임. `status().json()` 체이닝 지원.
4. 헬스체크: `GET /healthz` → 200 `ok` (compose 헬스체크/디버깅용).
5. 리슨 포트: `process.env.PORT || 3000`.

경계/에러 처리:

- `body` 크기 상한은 핸들러 내부(`MAX_BODY_BYTES=20000`)에서 처리하되, 어댑터는 과도한 스트림을 막기 위해 수신 바이트가 1MB를 넘으면 소켓을 파기하고 413 응답.
- 알 수 없는 라우트/메서드: 정적 fallback 또는 404. `/api/*`의 미정의 경로는 404 JSON.
- 정적 파일 경로 정규화로 디렉토리 트래버설(`..`) 차단.

### 3.2 API 컴파일

현재 `tsconfig.api.json`은 `noEmit: true`(타입체크 전용). 이를 건드리지 않고 **emit 전용 설정을 신규 추가**한다: `tsconfig.api.build.json`.

- `extends: ./tsconfig.api.json`
- `compilerOptions`: `noEmit: false`, `outDir: "./server-dist"`, `module: "ESNext"`, `moduleResolution: "Bundler"`(상속), `target: "ES2022"`.
- 산출물: `server-dist/_shared.js`, `server-dist/daylog/application.js`, `server-dist/daylog/track.js`. 소스가 이미 `../_shared.js`로 import하므로 ESM 출력과 정합.

빌드 스크립트(package.json에 추가): `"build:server": "tsc -p tsconfig.api.build.json"`.

### 3.3 Dockerfile (multi-stage)

- **builder** (`node:20`): `npm ci` → `npm run build`(기존: tsc 체크 + vite build) → `npm run build:server`(신규 emit).
- **runtime** (`node:20-alpine`): builder에서 `dist/`, `server-dist/`, `server.mjs`만 복사. 런타임 의존성 없음 → `node_modules` 미포함. `CMD ["node","server.mjs"]`, `EXPOSE 3000`.
- 회사망 SSL 프록시 대응은 **불필요**(빌드를 VPS에서 수행, 3.5 참조). 필요 시 `--build-arg INSECURE_NPM=1`로 `npm config set strict-ssl false`를 켜는 분기만 옵션으로 둔다.

### 3.4 docker-compose.yml

단일 서비스:

```yaml
services:
  app:
    build: .
    image: daylog-web:latest
    container_name: daylog-app
    restart: unless-stopped
    env_file: .env
    environment:
      PORT: 3000
    ports:
      - "127.0.0.1:3016:3000"
```

postgres 등 부가 서비스 없음(앱은 Apps Script로만 통신). `.env`는 VPS에만 두고 커밋하지 않는다.

### 3.5 배포 방식

레포가 public이므로 **VPS에서 직접 빌드**한다(로컬 amd64 크로스빌드·레지스트리 푸시·회사망 SSL 이슈 회피).

1. VPS `/root/daylog/`에 `git clone`(최초) 또는 `git pull`(갱신).
2. `/root/daylog/.env` 작성(3.6).
3. `docker compose up -d --build`.

로컬(Mac)에서는 개발·검증만 수행(`npm run dev`, `npm run build`, `docker build` 스모크). 배포 커맨드는 문서/`docs/deploy/`에 절차로 남긴다(자동 실행 스크립트를 임시 경로에 만들지 않는다 — 보안 정책).

### 3.6 시크릿 (`/root/daylog/.env`, 커밋 금지)

```
GOOGLE_APPS_SCRIPT_URL=<script.google.com/.../exec>
GOOGLE_APPS_SCRIPT_SHARED_SECRET=<secret>
DAYLOG_FORM_TYPE=daylog_life_session
APPS_SCRIPT_TIMEOUT_MS=9000
```

`_shared.ts`의 `forwardToAppsScript`는 URL이 `https://script.google.com/.../exec`가 아니거나 secret이 없으면 503을 반환하므로, 값이 정확해야 신청이 성공한다.

### 3.7 노출 (nginx + TLS)

1. Cloudflare DNS: `daylog A 115.71.239.106` 추가(**사용자가 직접**). 프록시(orange)/DNS-only(grey)는 사용자 선택.
2. nginx 서버블록 `/etc/nginx/conf.d/daylog.conf`(기존 서브도메인과 동일 패턴):
   - 80: certbot 챌린지 + 443 리다이렉트
   - 443 ssl: `proxy_pass http://127.0.0.1:3016;`, `proxy_set_header Host/X-Forwarded-For/X-Forwarded-Proto`.
     - **주의**: 핸들러의 rate limit이 `x-forwarded-for` 첫 IP를 사용하므로 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`를 반드시 설정.
3. certbot 발급: `certbot --nginx -d daylog.hannah-log.site`.
   - Cloudflare 프록시(orange) 상태에서 HTTP-01이 실패하면, DNS를 잠시 grey(DNS only)로 내려 발급 후 다시 orange로 전환(fallback).
4. `nginx -t && systemctl reload nginx`.

### 3.8 레포에 추가/수정할 파일 (surgical)

추가:

- `server.mjs` — HTTP 어댑터
- `tsconfig.api.build.json` — API emit 전용
- `Dockerfile`, `.dockerignore`
- `docker-compose.yml`
- `docs/deploy/vps.md` — 배포/갱신 절차 + nginx conf 템플릿 + certbot 절차

수정:

- `package.json` — `build:server` 스크립트 추가(기존 스크립트 불변)

건드리지 않음:

- `.github/workflows/deploy-pages.yml`(정적 미리보기 용도로 유지)
- 앱 소스(`src/`, `api/`) — 배포만 추가, 동작 변경 없음

## 4. 데이터 흐름

```
브라우저 → https://daylog.hannah-log.site (Cloudflare) → VPS nginx :443
  → (정적)  127.0.0.1:3016 daylog-app → dist/ 파일
  → (/api/*) 127.0.0.1:3016 daylog-app → server.mjs → handler → fetch → script.google.com/exec
```

## 5. 테스트 / 검증

- **어댑터 단위 테스트**(신규, 기존 `tests/*.test.mjs` + `node --test` 패턴 준수): `server.mjs`의 요청 어댑트/라우팅을 대상으로,
  - 정상: `/api/daylog/track` 유효 페이로드에 핸들러가 200 JSON(단, `forwardToAppsScript`는 fetch를 모킹하거나, Apps Script 호출 이전 검증 실패 경로로 검증)
  - 에러: 잘못된 메서드(GET) → 405, 잘못된 content-type → 415
  - 경계값: 1MB 초과 바디 → 413, `..` 트래버설 경로 → 정적으로 노출 안 됨(404/차단)
  - fetch는 주입/모킹으로 외부 호출 없이 실행 가능해야 함.
- **빌드 검증**: `npm run build` + `npm run build:server` 성공, `docker build` 성공.
- **스모크(로컬)**: 컨테이너 기동 후 `GET /` 200, `GET /healthz` 200, `POST /api/daylog/application`(빈/잘못 바디) → 4xx JSON.
- **배포 후(VPS)**: `curl -I https://daylog.hannah-log.site` 200, 신청 1건 제출 → Apps Script 수신 확인.

## 6. 리스크 / 열린 항목

- certbot 발급이 Cloudflare 프록시와 충돌할 수 있음 → grey 전환 fallback으로 대응.
- rate limit이 인메모리(단일 인스턴스 전제) — 현재 단일 컨테이너라 문제 없음.
- Apps Script 측 `Main.gs`에 `daylog_life_session` 수신 분기가 이미 있어야 신청이 최종 성공(사용자: URL+secret 준비됨으로 확인). 스키마 버전은 `daylog-life-session-v3`로 일치해야 함.
