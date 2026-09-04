import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const files = {
  app: new URL('../src/App.tsx', import.meta.url),
  sharedApi: new URL('../api/_shared.ts', import.meta.url),
  applicationApi: new URL('../api/daylog/application.ts', import.meta.url),
  trackApi: new URL('../api/daylog/track.ts', import.meta.url),
  appsScript: new URL('../google-apps-script/DaylogLifeSession.gs', import.meta.url),
}

async function source(name) {
  return readFile(files[name], 'utf8')
}

function quotedValues(block) {
  return [...block.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
}

test('all runtime layers use the v3 application schema', async () => {
  const [app, sharedApi, applicationApi, trackApi, appsScript] = await Promise.all([
    source('app'),
    source('sharedApi'),
    source('applicationApi'),
    source('trackApi'),
    source('appsScript'),
  ])

  for (const runtimeSource of [app, sharedApi, appsScript]) {
    assert.match(runtimeSource, /daylog-life-session-v3/)
    assert.doesNotMatch(runtimeSource, /daylog-life-session-v[12]/)
  }

  assert.match(applicationApi, /DAYLOG_LIFE_SESSION_SCHEMA_VERSION/)
  assert.match(trackApi, /DAYLOG_LIFE_SESSION_SCHEMA_VERSION/)
})

test('energy moments remain text through the API and Apps Script boundary', async () => {
  const [applicationApi, appsScript] = await Promise.all([
    source('applicationApi'),
    source('appsScript'),
  ])

  assert.match(applicationApi, /text\(payload\.comfortableTime,\s*['"]편안한 시간['"],\s*1,\s*100\)/)
  assert.match(applicationApi, /text\(payload\.difficultTime,\s*['"]힘든 시간['"],\s*1,\s*100\)/)
  assert.match(appsScript, /daylogLifeSessionText_\(payload\.comfortableTime,\s*100,\s*true\)/)
  assert.match(appsScript, /daylogLifeSessionText_\(payload\.difficultTime,\s*100,\s*true\)/)
  assert.doesNotMatch(appsScript, /Number\(payload\.(comfortableTime|difficultTime)\)/)
})

test('energy "other" draft state is stripped before the submit payload is built', async () => {
  const app = await source('app')

  assert.match(
    app,
    /const \{ comfortableTimeOther: _comfortableTimeOther, difficultTimeOther: _difficultTimeOther, \.\.\.submittableAnswers \} = answers/,
  )
  assert.match(app, /\.\.\.submittableAnswers,\n\s*\.\.\.contact,/)
})

test('removed question and summary stages cannot reappear in the runtime funnel', async () => {
  const [app, trackApi, appsScript] = await Promise.all([
    source('app'),
    source('trackApi'),
    source('appsScript'),
  ])

  for (const runtimeSource of [app, trackApi, appsScript]) {
    assert.doesNotMatch(runtimeSource, /together_style_selected/)
    assert.doesNotMatch(runtimeSource, /life_note_viewed/)
  }

  assert.doesNotMatch(app, /나의 하루 초안 확인하기|다이어리 요약/)
})

test('client, API and Apps Script share the same nine-stage funnel', async () => {
  const [app, trackApi, appsScript] = await Promise.all([
    source('app'),
    source('trackApi'),
    source('appsScript'),
  ])
  const expected = [
    'started',
    'daily_rhythm_selected',
    'energy_selected',
    'past_pattern_selected',
    'change_area_selected',
    'session_info_viewed',
    'application_started',
    'consent_accepted',
    'submitted',
  ]

  const clientQuestionStages = [...app.matchAll(/stage:\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
  const apiStagesBlock = trackApi.match(/const STAGES = \[([\s\S]*?)\]\s+as const/)?.[1] ?? ''
  const appsScriptStagesBlock = appsScript.match(/const DAYLOG_LIFE_SESSION_FUNNEL_STAGES = \[([\s\S]*?)\];/)?.[1] ?? ''
  const clientStages = ['started', ...clientQuestionStages, 'session_info_viewed', 'application_started', 'consent_accepted', 'submitted']
  const apiStages = quotedValues(apiStagesBlock)
  const appsScriptStages = [...appsScriptStagesBlock.matchAll(/key:\s*['"]([^'"]+)['"]/g)].map((match) => match[1])

  assert.deepEqual(clientStages, expected)
  assert.deepEqual(apiStages, expected)
  assert.deepEqual(appsScriptStages, expected)
})

test('removed togetherStyle field is absent from the submission pipeline', async () => {
  const [app, applicationApi, appsScript] = await Promise.all([
    source('app'),
    source('applicationApi'),
    source('appsScript'),
  ])

  for (const runtimeSource of [app, applicationApi, appsScript]) {
    assert.doesNotMatch(runtimeSource, /togetherStyle/)
  }
})

test('ranked change areas and required interview fields stay aligned across boundaries', async () => {
  const [app, applicationApi, appsScript] = await Promise.all([
    source('app'),
    source('applicationApi'),
    source('appsScript'),
  ])

  for (const runtimeSource of [app, applicationApi, appsScript]) {
    assert.doesNotMatch(runtimeSource, /primaryChangeArea|contactMethod|contactValue|additionalNote/)
    for (const field of ['age', 'phoneNumber', 'nearbyStation', 'preferredDays', 'preferredPeriods']) {
      assert.match(runtimeSource, new RegExp(field))
    }
  }

  assert.match(app, /indexOf\(option\.id\) \+ 1/)
  assert.match(applicationApi, /\^010-\\d\{4\}-\\d\{4\}\$/)
  assert.match(appsScript, /\(index \+ 1\) \+ '순위 '/)
})

test('starting over rotates both idempotency identifiers', async () => {
  const app = await source('app')
  const restartBody = app.match(/function restart\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''

  assert.match(restartBody, /setSessionId\(createId\(['"]DAYLOG-S['"]\)\)/)
  assert.match(restartBody, /setRequestId\(createId\(['"]DAYLOG['"]\)\)/)
})
