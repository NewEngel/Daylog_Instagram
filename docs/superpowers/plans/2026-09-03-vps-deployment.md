# 데이로그 신청폼 VPS 배포 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vercel 서버리스 전제로 만들어진 데이로그 신청폼을 개인 VPS(`115.71.239.106`)에 정적 프론트 + 동작하는 API로 배포한다.

**Architecture:** 의존성 없는 초경량 Node HTTP 어댑터(`server.mjs`)가 `dist/` 정적 파일을 서빙하고 `/api/daylog/*` 요청을 컴파일된 Vercel 스타일 핸들러로 라우팅한다. Docker multi-stage로 빌드하고, VPS의 호스트 nginx가 `daylog.hannah-log.site`(certbot TLS) → `127.0.0.1:3016` 컨테이너로 리버스 프록시한다.

**Tech Stack:** Node 20, TypeScript(기존), Vite 8, `node:http`(런타임 의존성 0), Docker + docker-compose, nginx + certbot.

**Spec:** `docs/superpowers/specs/2026-09-03-vps-deployment-design.md`

## Global Constraints

- 런타임 이미지에 **신규 npm 런타임 의존성 추가 금지** — 핸들러/어댑터는 Node 내장 모듈과 글로벌 `fetch`만 사용.
- Node **20** 기준(글로벌 `fetch`, `AbortController` 사용).
- 앱 소스(`src/`, `api/`) **동작 변경 금지** — 배포 인프라만 추가. `api/_shared.ts`, `api/daylog/*.ts`는 읽기만.
- 기존 `package.json` 스크립트는 불변, `build:server`만 추가. `.github/workflows/deploy-pages.yml` 건드리지 않음.
- 스키마 버전 문자열은 정확히 `daylog-life-session-v3`.
- 컨테이너 내부 포트 **3000**, VPS 바인딩 **`127.0.0.1:3016:3000`**.
- 도메인 **`daylog.hannah-log.site`**.
- 시크릿(`.env`)은 커밋 금지(`.gitignore`가 이미 `.env`/`.env.*` 제외).
- 임시 파일은 `/tmp`가 아닌 프로젝트 내부 `.claude/tmp/` 사용(EDR 정책).
- 검증된 사실(로컬 확인 완료): `tsconfig.api.build.json`(module/moduleResolution `NodeNext`, `rootDir:./api`, `outDir:./server-dist`)로 `api/*.ts` emit 시 `server-dist/_shared.js`, `server-dist/daylog/application.js`, `server-dist/daylog/track.js`가 생성되고, 각 핸들러는 `../_shared.js`를 import하며 Node ESM으로 로드된다(default export = function).

---

## File Structure

생성:
- `tsconfig.api.build.json` — API emit 전용 tsconfig
- `server.mjs` — HTTP 어댑터(정적 서빙 + `/api/*` 라우팅), 테스트를 위해 `createApp()` export
- `tests/fixtures/dist/index.html`, `tests/fixtures/dist/asset.txt` — 어댑터 테스트용 정적 픽스처
- `tests/server.test.mjs` — 어댑터 단위 테스트(가짜 핸들러)
- `tests/api-integration.test.mjs` — 실제 컴파일 핸들러 + fetch 모킹 통합 테스트
- `Dockerfile`, `.dockerignore`
- `docker-compose.yml`
- `docs/deploy/vps.md` — 배포/갱신 절차 + nginx conf + certbot

수정:
- `package.json` — `build:server` 스크립트 추가, `test` 스크립트를 빌드 선행하도록 변경

---

## Task 1: API emit 설정 + build 스크립트

**Files:**
- Create: `tsconfig.api.build.json`
- Modify: `package.json`(scripts)

**Interfaces:**
- Produces: `npm run build:server` → `server-dist/_shared.js`, `server-dist/daylog/application.js`, `server-dist/daylog/track.js`. 이후 Task들이 이 경로를 import.

- [ ] **Step 1: `tsconfig.api.build.json` 생성**

```json
{
  "extends": "./tsconfig.api.json",
  "compilerOptions": {
    "noEmit": false,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "outDir": "./server-dist",
    "rootDir": "./api",
    "declaration": false,
    "sourceMap": false
  }
}
```

- [ ] **Step 2: `package.json`에 스크립트 추가/수정**

`scripts`에서 `build:server` 추가, `test`를 빌드 선행으로 변경(나머지 스크립트 불변):

```json
    "build": "tsc -b && tsc -p tsconfig.api.json && vite build",
    "build:server": "tsc -p tsconfig.api.build.json",
    "test": "npm run build:server && node --test tests/*.test.mjs",
```

- [ ] **Step 3: emit 실행 및 산출물 확인**

Run:
```bash
npm ci
npm run build:server
find server-dist -name '*.js'
```
Expected: 정확히 `server-dist/_shared.js`, `server-dist/daylog/application.js`, `server-dist/daylog/track.js` 출력.

- [ ] **Step 4: 핸들러 로드 스모크**

Run:
```bash
node --input-type=module -e "import a from './server-dist/daylog/application.js'; import t from './server-dist/daylog/track.js'; console.log(typeof a, typeof t)"
```
Expected: `function function`

- [ ] **Step 5: `.gitignore`에 `server-dist` 추가 확인**

`server-dist/`는 빌드 산출물이므로 커밋하지 않는다. `.gitignore`에 이미 `dist`는 있으나 `server-dist`는 없다. 한 줄 추가:

Run:
```bash
grep -qx 'server-dist' .gitignore || printf '\nserver-dist\n' >> .gitignore
grep -n 'server-dist' .gitignore
```
Expected: `server-dist` 라인 존재.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.api.build.json package.json .gitignore
git commit -m "build: add API emit config (tsconfig.api.build.json) and build:server script"
```

---

## Task 2: `server.mjs` 어댑터 + 단위 테스트 (TDD)

**Files:**
- Create: `server.mjs`
- Create: `tests/fixtures/dist/index.html`, `tests/fixtures/dist/asset.txt`
- Test: `tests/server.test.mjs`

**Interfaces:**
- Produces: `export function createApp({ distDir, routes })` → `http.Server`. `routes`는 `{ [pathname: string]: (apiReq, apiRes) => Promise<void>|void }`. `apiReq = { method, headers, body }`(body는 raw 문자열), `apiRes = { status(code):apiRes, setHeader(name,value), json(obj) }`. 서버는 `/healthz`→200 `ok`, `/api/*`→routes(없으면 404 JSON), 그 외→`distDir` 정적 서빙(+ SPA fallback). API 바디 1MB 초과 시 413.
- Consumes: (Task 3에서) 이 `createApp`을 실제 핸들러로 wiring.

- [ ] **Step 1: 정적 픽스처 생성**

`tests/fixtures/dist/index.html`:
```html
<!doctype html><html><body><div id="root">INDEX_FIXTURE</div></body></html>
```
`tests/fixtures/dist/asset.txt`:
```
ASSET_FIXTURE
```

- [ ] **Step 2: 실패하는 어댑터 테스트 작성 (`tests/server.test.mjs`)**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createApp } from '../server.mjs'

const distDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'dist')

async function echoHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'method' })
    return
  }
  res.status(200).json({
    ok: true,
    method: req.method,
    contentType: req.headers['content-type'] ?? null,
    body: req.body,
  })
}

function startServer() {
  const server = createApp({ distDir, routes: { '/api/echo': echoHandler } })
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address()
      resolve({ server, base: `http://127.0.0.1:${port}` })
    })
  })
}

test('normal: POST /api/echo 는 raw body/헤더를 핸들러에 전달하고 200 JSON을 반환', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    })
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.ok, true)
    assert.equal(json.method, 'POST')
    assert.equal(json.contentType, 'application/json')
    assert.equal(json.body, '{"hello":"world"}')
  } finally {
    server.close()
  }
})

test('error: 미정의 /api 경로는 404 JSON', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/api/nope`, { method: 'POST', body: '{}' })
    assert.equal(res.status, 404)
    const json = await res.json()
    assert.equal(json.ok, false)
  } finally {
    server.close()
  }
})

test('error: 핸들러의 status/setHeader 위임 확인 (GET /api/echo → 405 + Allow)', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/api/echo`, { method: 'GET' })
    assert.equal(res.status, 405)
    assert.equal(res.headers.get('allow'), 'POST')
  } finally {
    server.close()
  }
})

test('boundary: 1MB 초과 바디는 413', async () => {
  const { server, base } = await startServer()
  try {
    const big = 'x'.repeat(1_000_001)
    const res = await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: big,
    })
    assert.equal(res.status, 413)
  } finally {
    server.close()
  }
})

test('boundary/security: 경로 트래버설은 소스 파일을 노출하지 않고 SPA fallback', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/../../server.mjs`)
    const text = await res.text()
    assert.ok(!text.includes('createApp'), 'server.mjs 내용이 노출되면 안 됨')
    assert.ok(text.includes('INDEX_FIXTURE'), 'index.html fallback 이어야 함')
  } finally {
    server.close()
  }
})

test('static: 존재하는 파일은 그대로 서빙', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/asset.txt`)
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('ASSET_FIXTURE'))
  } finally {
    server.close()
  }
})

test('spa: 미존재 비-API 경로는 index.html', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/some/client/route`)
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('INDEX_FIXTURE'))
  } finally {
    server.close()
  }
})

test('health: /healthz → 200 ok', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/healthz`)
    assert.equal(res.status, 200)
    assert.equal((await res.text()).trim(), 'ok')
  } finally {
    server.close()
  }
})
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `node --test tests/server.test.mjs`
Expected: FAIL — `Cannot find module '../server.mjs'` (아직 미작성).

- [ ] **Step 4: `server.mjs` 구현**

```javascript
import { createServer as createHttpServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv, env } from 'node:process'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const MAX_BODY_BYTES = 1_000_000

function makeApiResponse(res) {
  let statusCode = 200
  const api = {
    status(code) {
      statusCode = code
      return api
    },
    setHeader(name, value) {
      res.setHeader(name, value)
    },
    json(body) {
      res.statusCode = statusCode
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
      }
      res.end(JSON.stringify(body))
    },
  }
  return api
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        const err = new Error('payload_too_large')
        err.code = 'TOO_LARGE'
        reject(err)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

async function serveStatic(distDir, pathname, res) {
  const safe = normalize(decodeURIComponent(pathname))
  let filePath = join(distDir, safe)
  if (filePath !== distDir && !filePath.startsWith(distDir + '/')) {
    filePath = distDir // 트래버설 시도 → 루트로 강제
  }
  try {
    let s = await stat(filePath)
    if (s.isDirectory()) filePath = join(filePath, 'index.html')
    const data = await readFile(filePath)
    res.statusCode = 200
    res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream')
    res.end(data)
    return
  } catch {
    // fall through to SPA fallback
  }
  try {
    const html = await readFile(join(distDir, 'index.html'))
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(html)
  } catch {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('not found')
  }
}

export function createApp({ distDir, routes }) {
  return createHttpServer(async (req, res) => {
    let pathname
    try {
      pathname = new URL(req.url, 'http://localhost').pathname
    } catch {
      sendJson(res, 400, { ok: false, error: 'bad_request' })
      return
    }

    if (pathname === '/healthz') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('ok')
      return
    }

    if (pathname.startsWith('/api/')) {
      const handler = routes[pathname]
      if (!handler) {
        sendJson(res, 404, { ok: false, error: 'not_found' })
        return
      }
      let body
      try {
        body = await readBody(req)
      } catch (err) {
        const status = err && err.code === 'TOO_LARGE' ? 413 : 400
        sendJson(res, status, {
          ok: false,
          error: '신청 내용이 너무 길어요. 입력한 내용을 줄인 뒤 다시 시도해 주세요.',
        })
        return
      }
      try {
        await handler({ method: req.method, headers: req.headers, body }, makeApiResponse(res))
      } catch {
        if (!res.writableEnded) {
          sendJson(res, 500, {
            ok: false,
            error: '신청 내용을 보내지 못했어요. 입력한 내용을 확인한 뒤 다시 시도해 주세요.',
          })
        }
      }
      return
    }

    await serveStatic(distDir, pathname, res)
  })
}

const thisFile = fileURLToPath(import.meta.url)
if (argv[1] === thisFile) {
  const rootDir = dirname(thisFile)
  const distDir = join(rootDir, 'dist')
  const { default: applicationHandler } = await import('./server-dist/daylog/application.js')
  const { default: trackHandler } = await import('./server-dist/daylog/track.js')
  const routes = {
    '/api/daylog/application': applicationHandler,
    '/api/daylog/track': trackHandler,
  }
  const port = Number(env.PORT) || 3000
  createApp({ distDir, routes }).listen(port, () => {
    console.log(`daylog listening on ${port}`)
  })
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `node --test tests/server.test.mjs`
Expected: 8개 테스트 PASS.

- [ ] **Step 6: Commit**

```bash
git add server.mjs tests/server.test.mjs tests/fixtures/dist/index.html tests/fixtures/dist/asset.txt
git commit -m "feat: add dependency-free HTTP adapter (server.mjs) with unit tests"
```

---

## Task 3: 실제 핸들러 통합 테스트 (fetch 모킹, TDD)

**Files:**
- Test: `tests/api-integration.test.mjs`

**Interfaces:**
- Consumes: `createApp`(Task 2), 컴파일된 `server-dist/daylog/application.js`·`track.js`(Task 1). 실행 전 `npm run build:server` 필요(=`npm test`가 선행 실행).

- [ ] **Step 1: 통합 테스트 작성 (`tests/api-integration.test.mjs`)**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../server.mjs'

// forwardToAppsScript 가 통과할 수 있는 env (script.google.com/.../exec 검증 충족)
process.env.GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKtest/exec'
process.env.GOOGLE_APPS_SCRIPT_SHARED_SECRET = 'test-secret'
process.env.DAYLOG_FORM_TYPE = 'daylog_life_session'

const { default: applicationHandler } = await import('../server-dist/daylog/application.js')
const { default: trackHandler } = await import('../server-dist/daylog/track.js')

function startServer() {
  const server = createApp({
    distDir: '/nonexistent-dist',
    routes: {
      '/api/daylog/application': applicationHandler,
      '/api/daylog/track': trackHandler,
    },
  })
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }))
  })
}

test('error: GET /api/daylog/track → 405 Allow POST', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/api/daylog/track`, { method: 'GET' })
    assert.equal(res.status, 405)
    assert.equal(res.headers.get('allow'), 'POST')
  } finally {
    server.close()
  }
})

test('error: 잘못된 content-type → 415', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/api/daylog/track`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    })
    assert.equal(res.status, 415)
  } finally {
    server.close()
  }
})

test('boundary: 유효 JSON이나 잘못된 페이로드 → 400', async () => {
  const { server, base } = await startServer()
  try {
    const res = await fetch(`${base}/api/daylog/track`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 400)
    const json = await res.json()
    assert.equal(json.ok, false)
  } finally {
    server.close()
  }
})

test('normal: 유효 track 페이로드 + fetch 모킹 → 200', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, schemaVersion: 'daylog-life-session-v3' }),
  })
  const { server, base } = await startServer()
  try {
    const sessionId = 'DAYLOG-S-12345678-1234-4123-8123-123456789012'
    const stage = 'started'
    const res = await fetch(`${base}/api/daylog/track`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'track',
        sessionId,
        stage,
        eventId: `${sessionId}:${stage}`,
        source: 'web',
        formVersion: 'v1',
        schemaVersion: 'daylog-life-session-v3',
      }),
    })
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.ok, true)
    assert.equal(json.eventId, `${sessionId}:${stage}`)
    assert.equal(json.schemaVersion, 'daylog-life-session-v3')
  } finally {
    server.close()
    globalThis.fetch = originalFetch
  }
})
```

- [ ] **Step 2: 빌드 후 테스트 실행 → 통과 확인**

Run: `npm run build:server && node --test tests/api-integration.test.mjs`
Expected: 4개 테스트 PASS. (참고: sessionId 는 `DAYLOG-S-` + UUIDv4 대문자 = 총 45자, 패턴 `/^DAYLOG-S-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/` 충족.)

- [ ] **Step 3: 전체 테스트 스위트 실행**

Run: `npm test`
Expected: `server.test.mjs`(8) + `api-integration.test.mjs`(4) + 기존 `tests/*.test.mjs` 모두 PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/api-integration.test.mjs
git commit -m "test: add API integration tests (real handlers, mocked fetch)"
```

---

## Task 4: Docker 이미지 + compose + 로컬 스모크

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`

**Interfaces:**
- Produces: `daylog-web` 이미지(런타임 `node:20-alpine`, `CMD node server.mjs`, `EXPOSE 3000`), `docker compose up -d --build`로 `127.0.0.1:3016:3000` 기동.

- [ ] **Step 1: `Dockerfile` 작성**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20 AS builder
ARG INSECURE_NPM=0
WORKDIR /app
COPY package.json package-lock.json ./
RUN if [ "$INSECURE_NPM" = "1" ]; then npm config set strict-ssl false; fi && npm ci
COPY . .
RUN npm run build && npm run build:server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server-dist ./server-dist
COPY --from=builder /app/server.mjs ./server.mjs
EXPOSE 3000
CMD ["node", "server.mjs"]
```

- [ ] **Step 2: `.dockerignore` 작성**

```
node_modules
dist
server-dist
.git
.github
docs
예시본
tests
*.log
.env
.env.*
.claude
```

- [ ] **Step 3: `docker-compose.yml` 작성**

```yaml
services:
  app:
    build:
      context: .
    image: daylog-web:latest
    container_name: daylog-app
    restart: unless-stopped
    env_file: .env
    environment:
      PORT: 3000
    ports:
      - "127.0.0.1:3016:3000"
```

- [ ] **Step 4: 로컬 이미지 빌드**

Run: `docker build -t daylog-web:test .`
Expected: 빌드 성공, 최종 스테이지에 `node_modules` 없음.

- [ ] **Step 5: 스모크 실행 (env 없이 정적/헬스/검증 경로 확인)**

Run:
```bash
docker run -d --name daylog-smoke -e PORT=3000 -p 127.0.0.1:3399:3000 daylog-web:test
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3399/            # 200 (index.html)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3399/healthz     # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:3399/api/daylog/track  # 400
docker rm -f daylog-smoke
```
Expected: `200`, `200`, `400`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml
git commit -m "feat: add Docker multi-stage build and compose for VPS deployment"
```

---

## Task 5: 배포 문서 (nginx + certbot + 절차)

**Files:**
- Create: `docs/deploy/vps.md`

**Interfaces:**
- Produces: VPS 배포/갱신 절차 문서(사람이 실행). 자동 실행 스크립트를 임시 경로에 만들지 않는다.

- [ ] **Step 1: `docs/deploy/vps.md` 작성**

````markdown
# 데이로그 신청폼 — VPS 배포 절차

대상: `115.71.239.106`, 도메인 `daylog.hannah-log.site`, 컨테이너 포트 `127.0.0.1:3016:3000`.

## 0. 사전 조건 (사용자)

Cloudflare DNS에 A 레코드 추가: `daylog` → `115.71.239.106`.
- certbot 발급 시 프록시(orange)에서 HTTP-01 이 실패하면 일시적으로 DNS only(grey)로 내렸다가 발급 후 다시 orange 로 전환한다.

확인:
```bash
dig +short daylog.hannah-log.site A
```

## 1. 코드 배치

```bash
# 최초
cd /root && git clone https://github.com/DoguDogu43/Daylog_Instagram.git daylog
# 갱신
cd /root/daylog && git pull
```

## 2. 시크릿 (`/root/daylog/.env`, 커밋 금지)

```
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec
GOOGLE_APPS_SCRIPT_SHARED_SECRET=<shared-secret>
DAYLOG_FORM_TYPE=daylog_life_session
APPS_SCRIPT_TIMEOUT_MS=9000
```

## 3. 컨테이너 빌드/기동

```bash
cd /root/daylog
docker compose up -d --build
docker compose ps
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3016/healthz   # 200
```

## 4. nginx 서버블록 (`/etc/nginx/conf.d/daylog.conf`)

먼저 80 전용 블록으로 시작한다:

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
```

## 5. TLS 발급 (certbot --nginx)

```bash
certbot --nginx -d daylog.hannah-log.site
```
certbot 이 443 ssl 블록과 80→443 리다이렉트를 자동 삽입한다. 발급 후 `/etc/nginx/conf.d/daylog.conf` 의 **443 `location /`** 블록에 아래 헤더가 포함돼 있는지 확인(없으면 추가):

```nginx
        proxy_pass http://127.0.0.1:3016;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
```
> `X-Forwarded-For` 는 API 의 rate limit 이 클라이언트 IP 를 식별하는 데 사용하므로 반드시 전달.

```bash
nginx -t && systemctl reload nginx
```

## 6. 최종 검증

```bash
curl -I https://daylog.hannah-log.site            # 200
# 화면에서 신청 1건 제출 → Apps Script 스프레드시트 수신 확인
```

## 7. 갱신 배포

```bash
cd /root/daylog && git pull && docker compose up -d --build
```
````

- [ ] **Step 2: Commit**

```bash
git add docs/deploy/vps.md
git commit -m "docs: add VPS deployment runbook (nginx, certbot, procedure)"
```

---

## 실행(VPS 적용) 참고

Task 1~5 는 로컬에서 완결·검증되는 코드/문서 작업이다. 실제 VPS 반영(Task 5 문서의 1~6단계)은 다음을 수반하므로 **사용자 확인 후** 진행한다:
- GitHub `main` push (VPS `git pull` 대상)
- Cloudflare DNS 추가(사용자 직접)
- VPS 상의 nginx 편집·`systemctl reload nginx`·certbot 발급(운영 nginx 변경 → 승인 필요)

## Self-Review (spec 대비)

- 3.1 어댑터 → Task 2 (정적/라우팅/413/트래버설/SPA/healthz) ✅
- 3.2 API 컴파일 → Task 1 ✅
- 3.3 Dockerfile → Task 4 ✅
- 3.4 compose → Task 4 ✅
- 3.5 배포 방식(VPS 직접 빌드) → Task 5 문서 ✅
- 3.6 시크릿 → Task 5 §2 ✅
- 3.7 nginx+TLS(X-Forwarded-For, certbot fallback) → Task 5 §4~5 ✅
- 3.8 파일 목록 → File Structure ✅
- 5 테스트(정상/에러/경계/빌드/스모크) → Task 2·3·4 ✅
- 플레이스홀더 없음, 타입/이름 일관(`createApp({distDir,routes})`, `apiReq{method,headers,body}`, `apiRes.status().json()`) 확인.
