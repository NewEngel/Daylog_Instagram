import test from 'node:test'
import assert from 'node:assert/strict'
import { forwardToAppsScript } from '../server-dist/_shared.js'

function setup(t) {
  const previous = { ...process.env }
  process.env.GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/test/exec'
  process.env.GOOGLE_APPS_SCRIPT_SHARED_SECRET = 'private-test-secret'
  process.env.DAYLOG_FORM_TYPE = 'daylog_life_session'
  delete process.env.APPS_SCRIPT_TIMEOUT_MS
  t.after(() => { process.env = previous })
  const logs = []
  t.mock.method(console, 'error', (...args) => logs.push(args))
  return logs
}

test('Apps Script taking longer than nine seconds can still confirm storage', async (t) => {
  setup(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    await new Promise((resolve, reject) => {
      setTimeout(resolve, 12000)
      options.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })
    return Response.json({ ok: true, schemaVersion: 'daylog-life-session-v3' })
  })
  const pending = forwardToAppsScript({ action: 'track' })
  t.mock.timers.tick(12000)
  assert.equal((await pending).ok, true)
})

test('a stalled upstream times out at thirty seconds without retrying storage', async (t) => {
  const logs = setup(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fetchMock = t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('private-test-secret')))
  }))
  const pending = assert.rejects(forwardToAppsScript({ action: 'submit' }), { status: 502 })
  t.mock.timers.tick(30000)
  await pending
  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(logs[0][1].reason, 'upstream_timeout')
  assert.equal(logs[0][1].timeoutMs, 30000)
  assert.doesNotMatch(JSON.stringify(logs), /private-test-secret/)
})

test('rejections retain safe diagnostic codes and redact arbitrary upstream messages', async (t) => {
  const logs = setup(t)
  let upstreamError = 'unauthorized'
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: false, error: upstreamError }))
  await assert.rejects(forwardToAppsScript({ action: 'submit' }), { status: 502 })
  assert.equal(logs[0][1].reason, 'upstream_rejected_unauthorized')
  upstreamError = 'private-test-secret user@example.com'
  await assert.rejects(forwardToAppsScript({ action: 'track' }), { status: 502 })
  assert.equal(logs[1][1].reason, 'upstream_rejected')
  assert.doesNotMatch(JSON.stringify(logs), /private-test-secret|user@example.com/)
})

test('schema mismatches and non-JSON responses remain failures', async (t) => {
  const logs = setup(t)
  let upstreamResponse = Response.json({ ok: true, schemaVersion: 'old-schema' })
  t.mock.method(globalThis, 'fetch', async () => upstreamResponse)
  await assert.rejects(forwardToAppsScript({ action: 'submit' }), { status: 502 })
  assert.equal(logs[0][1].reason, 'upstream_schema_mismatch')
  upstreamResponse = new Response('<html>private-test-secret</html>')
  await assert.rejects(forwardToAppsScript({ action: 'submit' }), { status: 502 })
  assert.equal(logs[1][1].reason, 'invalid_upstream_response')
  assert.doesNotMatch(JSON.stringify(logs), /private-test-secret/)
})
