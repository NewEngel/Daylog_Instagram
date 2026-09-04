import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  changeAreaOptions,
  dailyRhythmOptions,
  energyTimeOptions,
  pastPatternOptions,
  preferredDayOptions,
  preferredPeriodOptions,
} from './data'
import type {
  ApiResult,
  ApplicationAnswers,
  ChangeArea,
  ChoiceOption,
  ContactDetails,
  DailyRhythm,
  PastPattern,
  PreferredDay,
  PreferredPeriod,
  View,
} from './types'
import './App.css'

const FORM_VERSION = '2026.09.2'
const SCHEMA_VERSION = 'daylog-life-session-v3'
const ANSWERS_STORAGE_KEY = 'daylog-life-session-answers-v8'

const initialAnswers: ApplicationAnswers = {
  changeAreas: [],
}

const initialContact: ContactDetails = {
  displayName: '',
  age: '',
  phoneNumber: '',
  nearbyStation: '',
  preferredDays: [],
  preferredPeriods: [],
  privacyConsent: false,
  website: '',
}

type QuestionMeta = {
  title: string
  highlight: string
  caption: string
  description: string
  stage?: string
}

const questionMeta: QuestionMeta[] = [
  {
    title: '요즘 하루는 언제 가장 잘 움직이나요?',
    highlight: '하루',
    caption: '오늘의 리듬',
    description: '평소와 가장 가까운 하루를 1개 골라주세요.',
    stage: 'daily_rhythm_selected',
  },
  {
    title: '언제 가장 힘이 나나요?',
    highlight: '힘이 나나요',
    caption: '활력의 순간',
    description: '가장 가까운 시간대를 하나 골라주세요.',
  },
  {
    title: '언제 가장 지치나요?',
    highlight: '지치나요',
    caption: '지치는 순간',
    description: '가장 가까운 시간대를 하나 골라주세요.',
    stage: 'energy_selected',
  },
  {
    title: '집중이 가장 잘되었던 때는?',
    highlight: '집중',
    caption: '지속의 조건',
    description: '가장 잘 맞았던 방법 하나를 골라주세요.',
    stage: 'past_pattern_selected',
  },
  {
    title: '지금 가장 변화되고 싶은 습관은?',
    highlight: '습관',
    caption: '변화할 습관',
    description: '중요한 순서로 1~3개를 눌러주세요. 누른 순서가 우선순위예요.',
    stage: 'change_area_selected',
  },
]

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().toUpperCase()}`
}

function loadAnswers(): ApplicationAnswers {
  try {
    const stored = sessionStorage.getItem(ANSWERS_STORAGE_KEY)
    return stored ? { ...initialAnswers, ...(JSON.parse(stored) as Partial<ApplicationAnswers>) } : initialAnswers
  } catch {
    return initialAnswers
  }
}

function toggleExclusive<T extends string>(current: T[], value: T, flexible: T) {
  if (value === flexible) return current.includes(value) ? [] : [value]
  const withoutFlexible = current.filter((item) => item !== flexible)
  return withoutFlexible.includes(value)
    ? withoutFlexible.filter((item) => item !== value)
    : [...withoutFlexible, value]
}

type ContactErrorField = 'displayName' | 'age' | 'phoneNumber' | 'nearbyStation' | 'preferredDays' | 'preferredPeriods' | 'privacyConsent'

type ContactValidationError = {
  field: ContactErrorField
  message: string
}

function validateBasicInfo(contact: ContactDetails): ContactValidationError | null {
  if (!contact.displayName.trim()) {
    return { field: 'displayName', message: '이름을 입력해 주세요.' }
  }
  const age = Number(contact.age)
  if (!/^\d{1,3}$/.test(contact.age) || !Number.isInteger(age) || age < 1 || age > 120) {
    return { field: 'age', message: '나이를 1~120 사이 숫자로 입력해 주세요.' }
  }
  if (!/^010-\d{4}-\d{4}$/.test(contact.phoneNumber)) {
    return { field: 'phoneNumber', message: '전화번호를 010-0000-0000 형식으로 입력해 주세요.' }
  }
  if (!contact.nearbyStation.trim()) {
    return { field: 'nearbyStation', message: '만나기 편한 지하철역을 입력해 주세요.' }
  }
  return null
}

function validateSchedule(contact: ContactDetails): ContactValidationError | null {
  if (contact.preferredDays.length === 0) {
    return { field: 'preferredDays', message: '가능한 요일을 1개 이상 골라주세요.' }
  }
  if (contact.preferredPeriods.length === 0) {
    return { field: 'preferredPeriods', message: '가능한 시간대를 1개 이상 골라주세요.' }
  }
  return null
}

function validateConsent(contact: ContactDetails): ContactValidationError | null {
  if (!contact.privacyConsent) {
    return { field: 'privacyConsent', message: '개인정보 수집·이용 내용을 확인하고 필수 동의에 체크해 주세요.' }
  }
  return null
}

function validateContact(contact: ContactDetails): ContactValidationError | null {
  return validateBasicInfo(contact) ?? validateSchedule(contact) ?? validateConsent(contact)
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function App() {
  const [view, setView] = useState<View>({ kind: 'intro' })
  const [answers, setAnswers] = useState<ApplicationAnswers>(loadAnswers)
  const [contact, setContact] = useState<ContactDetails>(initialContact)
  const [error, setError] = useState('')
  const [contactErrorField, setContactErrorField] = useState<ContactErrorField | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [sessionId, setSessionId] = useState(() => createId('DAYLOG-S'))
  const [requestId, setRequestId] = useState(() => createId('DAYLOG'))

  const headingRef = useRef<HTMLHeadingElement>(null)
  const displayNameRef = useRef<HTMLInputElement>(null)
  const ageRef = useRef<HTMLInputElement>(null)
  const phoneNumberRef = useRef<HTMLInputElement>(null)
  const nearbyStationRef = useRef<HTMLInputElement>(null)
  const preferredDaysRef = useRef<HTMLInputElement>(null)
  const preferredPeriodsRef = useRef<HTMLInputElement>(null)
  const consentRef = useRef<HTMLInputElement>(null)
  const questionErrorRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    sessionStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answers))
  }, [answers])

  useEffect(() => {
    headingRef.current?.focus()
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [view])

  const questionIndex = view.kind === 'question' ? view.index : -1
  function goToView(nextView: View, _direction: 'forward' | 'backward' = 'forward') {
    void _direction
    setError('')
    setView(nextView)
  }

  function updateContact(patch: Partial<ContactDetails>) {
    setContact((current) => ({ ...current, ...patch }))
    setContactErrorField(null)
    setError('')
  }

  function track(stage: string) {
    const payload = {
      action: 'track',
      eventId: `${sessionId}:${stage}`,
      sessionId,
      stage,
      source: 'daylog_web',
      formVersion: FORM_VERSION,
      schemaVersion: SCHEMA_VERSION,
    }

    void fetch('/api/daylog/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => undefined)
  }

  function startExperience() {
    goToView({ kind: 'question', index: 0 }, 'forward')
    track('started')
  }

  function validateQuestion(index: number) {
    if (index === 0 && !answers.dailyRhythm) return '평소와 가장 가까운 하루를 1개 골라주세요.'
    if (index === 1 && !answers.comfortableTime?.trim()) return '힘이 나는 때를 하나 골라주세요.'
    if (index === 2 && !answers.difficultTime?.trim()) return '지치는 때를 하나 골라주세요.'
    if (index === 3 && !answers.pastPattern) return '가장 잘 맞았던 방법을 1개 골라주세요.'
    if (index === 4 && answers.changeAreas.length === 0) return '바꾸고 싶은 습관을 1개 이상 골라주세요.'
    return ''
  }

  function goNext() {
    if (view.kind !== 'question') return
    const validationError = validateQuestion(view.index)
    if (validationError) {
      setError(validationError)
      requestAnimationFrame(() => questionErrorRef.current?.focus())
      return
    }

    setError('')
    const stage = questionMeta[view.index].stage
    if (stage) track(stage)
    if (view.index === questionMeta.length - 1) {
      goToView({ kind: 'session-info' }, 'forward')
      track('session_info_viewed')
      return
    }
    goToView({ kind: 'question', index: view.index + 1 }, 'forward')
  }

  function goBack() {
    if (view.kind === 'contact') {
      if (view.step > 1) return goToView({ kind: 'contact', step: (view.step - 1) as 1 | 2 | 3 }, 'backward')
      return goToView({ kind: 'session-info' }, 'backward')
    }
    if (view.kind === 'session-info') return goToView({ kind: 'question', index: questionMeta.length - 1 }, 'backward')
    if (view.kind === 'question' && view.index > 0) {
      return goToView({ kind: 'question', index: view.index - 1 }, 'backward')
    }
    goToView({ kind: 'intro' }, 'backward')
  }

  function beginApplication() {
    goToView({ kind: 'contact', step: 1 }, 'forward')
    track('application_started')
  }

  function goContactNext() {
    if (view.kind !== 'contact') return
    if (view.step === 1) {
      const validationError = validateBasicInfo(contact)
      if (validationError) {
        setContactErrorField(validationError.field)
        setError(validationError.message)
        requestAnimationFrame(() => {
          if (validationError.field === 'displayName') displayNameRef.current?.focus()
          if (validationError.field === 'age') ageRef.current?.focus()
          if (validationError.field === 'phoneNumber') phoneNumberRef.current?.focus()
          if (validationError.field === 'nearbyStation') nearbyStationRef.current?.focus()
        })
        return
      }
      setError('')
      setContactErrorField(null)
      goToView({ kind: 'contact', step: 2 }, 'forward')
      return
    }
    if (view.step === 2) {
      const validationError = validateSchedule(contact)
      if (validationError) {
        setContactErrorField(validationError.field)
        setError(validationError.message)
        requestAnimationFrame(() => {
          if (validationError.field === 'preferredDays') preferredDaysRef.current?.focus()
          if (validationError.field === 'preferredPeriods') preferredPeriodsRef.current?.focus()
        })
        return
      }
      setError('')
      setContactErrorField(null)
      goToView({ kind: 'contact', step: 3 }, 'forward')
    }
  }

  function selectEnergyTime(field: 'comfortableTime' | 'difficultTime', label: string) {
    chooseSingle(field, label)
  }

  function chooseSingle<K extends keyof ApplicationAnswers>(key: K, value: ApplicationAnswers[K]) {
    setAnswers((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function toggleChangeArea(area: ChangeArea) {
    setAnswers((current) => {
      const exists = current.changeAreas.includes(area)
      if (!exists && current.changeAreas.length >= 3) {
        setError('습관은 3개까지 고를 수 있어요. 하나를 취소한 뒤 다시 골라주세요.')
        return current
      }
      const next = exists
        ? current.changeAreas.filter((item) => item !== area)
        : [...current.changeAreas, area]
      return { ...current, changeAreas: next }
    })
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateContact(contact)
    if (validationError) {
      setContactErrorField(validationError.field)
      setError(validationError.message)
      requestAnimationFrame(() => {
        if (validationError.field === 'displayName') displayNameRef.current?.focus()
        if (validationError.field === 'age') ageRef.current?.focus()
        if (validationError.field === 'phoneNumber') phoneNumberRef.current?.focus()
        if (validationError.field === 'nearbyStation') nearbyStationRef.current?.focus()
        if (validationError.field === 'preferredDays') preferredDaysRef.current?.focus()
        if (validationError.field === 'preferredPeriods') preferredPeriodsRef.current?.focus()
        if (validationError.field === 'privacyConsent') consentRef.current?.focus()
      })
      return
    }

    setSubmitting(true)
    setError('')
    track('consent_accepted')

    const search = new URLSearchParams(window.location.search)
    const payload = {
      action: 'submit',
      requestId,
      sessionId,
      ...answers,
      ...contact,
      displayName: contact.displayName.trim(),
      age: Number(contact.age),
      nearbyStation: contact.nearbyStation.trim(),
      source: 'daylog_web',
      utmSource: search.get('utm_source') ?? '',
      utmMedium: search.get('utm_medium') ?? '',
      utmCampaign: search.get('utm_campaign') ?? '',
      formVersion: FORM_VERSION,
      schemaVersion: SCHEMA_VERSION,
    }

    try {
      const response = await fetch('/api/daylog/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => null) as ApiResult | null
      if (!result) throw new Error('신청 내용을 보내지 못했어요. 입력한 내용은 화면에 남아 있어요. 잠시 후 다시 신청해 주세요.')
      if (!response.ok || !result.ok) throw new Error(result.error)
      sessionStorage.removeItem(ANSWERS_STORAGE_KEY)
      goToView({ kind: 'success', requestId: result.requestId ?? requestId }, 'forward')
      track('submitted')
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : '신청 내용을 보내지 못했어요. 입력한 내용은 화면에 남아 있어요. 잠시 후 다시 신청해 주세요.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function restart() {
    sessionStorage.removeItem(ANSWERS_STORAGE_KEY)
    setAnswers({ ...initialAnswers })
    setContact({ ...initialContact })
    setSessionId(createId('DAYLOG-S'))
    setRequestId(createId('DAYLOG'))
    setContactErrorField(null)
    setError('')
    setCopyStatus('')
    goToView({ kind: 'intro' }, 'backward')
  }

  async function copyApplicationNumber() {
    if (view.kind !== 'success') return
    if (!navigator.clipboard) {
      setCopyStatus('신청 번호를 길게 눌러 복사해 주세요.')
      return
    }
    try {
      await navigator.clipboard.writeText(view.requestId)
      setCopyStatus('신청 번호를 복사했어요.')
    } catch {
      setCopyStatus('복사하지 못했어요. 신청 번호를 길게 눌러 복사해 주세요.')
    }
  }

  function goToCover() {
    goToView({ kind: 'intro' }, 'backward')
  }

  function renderQuestionTitle(title: string, highlight: string): ReactNode {
    const start = title.indexOf(highlight)
    if (start === -1) return title
    return (
      <>
        {title.slice(0, start)}
        <mark className="heading-accent">{highlight}</mark>
        {title.slice(start + highlight.length)}
      </>
    )
  }

  function renderEnergyChoice(field: 'comfortableTime' | 'difficultTime', legend: string) {
    const value = answers[field]

    return (
      <fieldset className="question-fieldset" aria-describedby={error ? 'question-description question-error' : 'question-description'}>
        <legend className="sr-only">{legend}을 하나 골라주세요.</legend>
        <div className="energy-time-grid">
          {energyTimeOptions.map((option) => {
            const selected = value === option.label
            return (
              <label className={`choice-chip-btn ${selected ? 'is-selected' : ''}`} key={option.id}>
                <input
                  checked={selected}
                  name={`energy-${field}`}
                  onChange={() => selectEnergyTime(field, option.label)}
                  type="radio"
                  value={option.id}
                />
                <span>{option.label}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }

  function renderChoiceCards<T extends string>(
    options: ChoiceOption<T>[],
    selected: T | undefined,
    onSelect: (value: T) => void,
    legend: string,
  ) {
    return (
      <fieldset className="question-fieldset spiral-choice-list" aria-describedby={error ? 'question-description question-error' : 'question-description'}>
        <legend className="sr-only">{legend}</legend>
        {options.map((option) => {
          const isSelected = selected === option.id
          return (
            <label className={`spiral-choice-card ${isSelected ? 'is-selected' : ''}`} key={option.id}>
              <input
                checked={isSelected}
                name={`choice-${questionIndex}`}
                onChange={() => onSelect(option.id)}
                type="radio"
                value={option.id}
              />
              <div className="spiral-radio-circle" aria-hidden="true">
                <span className="spiral-radio-dot" />
              </div>
              <div className="spiral-choice-content">
                <strong className="spiral-choice-title">{option.title}</strong>
                {option.description && <span className="spiral-choice-desc">{option.description}</span>}
              </div>
              <span className="spiral-choice-tag" aria-hidden="true">{option.marker}</span>
            </label>
          )
        })}
      </fieldset>
    )
  }

  function renderQuestion(index: number) {
    if (index === 0) {
      return renderChoiceCards<DailyRhythm>(
        dailyRhythmOptions,
        answers.dailyRhythm,
        (value) => chooseSingle('dailyRhythm', value),
        '평소와 가장 가까운 하루를 1개 골라주세요.',
      )
    }

    if (index === 1) {
      return renderEnergyChoice('comfortableTime', '힘이 나는 때')
    }

    if (index === 2) {
      return renderEnergyChoice('difficultTime', '지치는 때')
    }

    if (index === 3) {
      return renderChoiceCards<PastPattern>(
        pastPatternOptions,
        answers.pastPattern,
        (value) => chooseSingle('pastPattern', value),
        '가장 잘 맞았던 방법을 1개 골라주세요.',
      )
    }

    if (index === 4) {
      return (
        <div className="spiral-habit-section">
          <fieldset className="question-fieldset habit-area-fieldset" aria-describedby={error ? 'habit-selection-status question-error' : 'habit-selection-status'}>
            <legend className="sr-only">바꾸고 싶은 생활 습관을 1개에서 3개까지 골라주세요.</legend>
            <div className="habit-header-bar" id="habit-selection-status">
              <span className="habit-count-tag">
                선택한 영역 <strong>{answers.changeAreas.length} / 3</strong>
              </span>
              <span className="habit-count-help">1~3개 선택</span>
            </div>

            <div className="habit-cards-grid">
              {changeAreaOptions.map((option) => {
                const selected = answers.changeAreas.includes(option.id)
                const rank = answers.changeAreas.indexOf(option.id) + 1
                return (
                  <label className={`habit-grid-card ${selected ? 'is-selected' : ''}`} key={option.id}>
                    <input
                      checked={selected}
                      onChange={() => toggleChangeArea(option.id)}
                      type="checkbox"
                      value={option.id}
                    />
                    <div className="habit-grid-top">
                      <span className="habit-marker-badge" aria-hidden="true">{option.marker}</span>
                      <div className="habit-checkbox-indicator" aria-hidden="true">
                        <span>{selected ? rank : ''}</span>
                      </div>
                    </div>
                    <div className="habit-grid-body">
                      <strong className="habit-grid-title">{option.title}</strong>
                      {option.description && <span className="habit-grid-desc">{option.description}</span>}
                    </div>
                    {selected && <span className="habit-primary-flag">{rank}순위</span>}
                  </label>
                )
              })}
            </div>
          </fieldset>
          <p className="ranking-help-note" aria-live="polite">
            {answers.changeAreas.length === 0
              ? '가장 먼저 바꾸고 싶은 습관부터 눌러주세요.'
              : `${answers.changeAreas.length}개를 골랐어요. 선택을 취소하면 다음 항목의 순서가 앞으로 당겨져요.`}
          </p>
        </div>
      )
    }

  }

  const stageLabel = view.kind === 'question'
    ? `${view.index + 1} / ${questionMeta.length}`
    : view.kind === 'session-info'
      ? '프로그램 안내'
      : view.kind === 'contact'
        ? `신청 ${view.step} / 3`
        : view.kind === 'success'
          ? '신청 완료'
          : '나만의 하루 설계'

  const progressTotal = view.kind === 'question' ? questionMeta.length : view.kind === 'contact' ? 3 : 0
  const progressCurrent = view.kind === 'question' ? view.index : view.kind === 'contact' ? view.step - 1 : -1

  return (
    <div className="app-canvas">
      <header className="app-header">
        <div className="desk-brand-group">
          <button className="desk-brand-btn" onClick={goToCover} type="button" aria-label="작성 내용을 유지하고 시작 화면으로 이동">
            DAYLOG
          </button>
          <span className="desk-brand-sep" aria-hidden="true">/</span>
          <span className="desk-brand-title">LIFE NOTE</span>
        </div>
        <span className="app-stage-label">{stageLabel}</span>
      </header>

      {(view.kind === 'question' || view.kind === 'contact') && (
        <div
          className="question-progress"
          style={{ '--progress-steps': progressTotal } as CSSProperties}
          role="progressbar"
          aria-label={
            view.kind === 'question'
              ? `현재 ${view.index + 1}번째 질문, 전체 ${questionMeta.length}개`
              : `신청 정보 입력 ${view.step}번째, 전체 3개`
          }
          aria-valuemin={1}
          aria-valuemax={progressTotal}
          aria-valuenow={progressCurrent + 1}
        >
          {Array.from({ length: progressTotal }, (_, step) => (
            <span
              className={`progress-segment ${step < progressCurrent ? 'is-complete' : step === progressCurrent ? 'is-current' : ''}`}
              key={step}
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      <main className={`app-panel view-${view.kind}`}>

          {/* =========================================================================
              VIEW: INTRO (Cover & Introduction Page)
             ========================================================================= */}
          {view.kind === 'intro' && (
            <div className="notebook-page-content intro-page">
              <div className="intro-header-badge">
                <span aria-hidden="true">✦</span>
                <span>나만의 하루 설계</span>
              </div>

              <div className="intro-headline-section">
                <h1 id="intro-title" ref={headingRef} tabIndex={-1} className="intro-main-title">
                  내 생활에 맞는 습관을<br />
                  함께 찾아봐요.
                </h1>
                <p className="intro-sub-lead">
                  데이로그는 60분 동안 직접 만나 요즘 생활을 듣고, 지금 시작할 행동 1~3개를 함께 정합니다.
                </p>
              </div>

              <div className="intro-purpose-card">
                <span className="purpose-card-icon" aria-hidden="true">◎</span>
                <p>정답을 찾는 설문이 아니에요. 지금의 생활을 짧게 정리하고, 나에게 맞는 시작을 함께 찾아요.</p>
              </div>

              <ul className="intro-info-grid" aria-label="LIFE NOTE 진행 정보">
                <li><span aria-hidden="true">▣</span><strong>{questionMeta.length}개 질문</strong><small>내 생활 돌아보기</small></li>
                <li><span aria-hidden="true">◷</span><strong>약 3분</strong><small>부담 없이 시작</small></li>
                <li><span aria-hidden="true">⌂</span><strong>대면 체험</strong><small>60분 1:1 대화</small></li>
              </ul>

              <div className="intro-cta-section">
                <button className="notebook-primary-btn" type="button" onClick={startExperience}>
                  <span className="btn-label-text">내 하루 기록 시작하기</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW: QUESTIONS 01 ~ 04 (One Step, One Focus Page)
             ========================================================================= */}
          {view.kind === 'question' && (
            <div className="notebook-page-content question-page">
              {/* Question Heading Group */}
              <div className="question-title-wrap">
                <p className="question-kicker">{questionMeta[view.index].caption}</p>
                <h1 id="question-title" ref={headingRef} tabIndex={-1} className="question-heading">
                  {renderQuestionTitle(questionMeta[view.index].title, questionMeta[view.index].highlight)}
                </h1>
                <p className="question-sub-desc" id="question-description">{questionMeta[view.index].description}</p>
              </div>

              {/* Interactive Form Component */}
              <div className="question-body-section">
                {renderQuestion(view.index)}
              </div>

              {error && (
                <p
                  className="notebook-error-msg"
                  id="question-error"
                  ref={questionErrorRef}
                  role="alert"
                  tabIndex={-1}
                >
                  ⚠️ {error}
                </p>
              )}

              {/* Bottom Navigation Buttons */}
              <div className="question-actions-bar">
                <button className="notebook-secondary-btn" onClick={goBack} type="button">
                  ← {view.index === 0 ? '시작 화면으로 돌아가기' : '이전 질문 보기'}
                </button>
                <button
                  className="notebook-primary-btn notebook-primary-btn--compact"
                  onClick={goNext}
                  type="button"
                >
                  <span className="btn-label-text">
                    {view.index === questionMeta.length - 1 ? '프로그램 안내 보기' : '다음 질문 보기'}
                  </span>
                  <span className="btn-circle-arrow" aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW: SESSION INFO (Program Description)
             ========================================================================= */}
          {view.kind === 'session-info' && (
            <div className="notebook-page-content session-info-page">
              <div className="session-info-header">
                <span className="contact-step-tag">05 · 프로그램 안내</span>
                <p className="session-info-kicker">60분 체험 프로그램</p>
                <h1 id="session-info-title" ref={headingRef} tabIndex={-1} className="session-info-title">
                  60분 동안 내 하루를 함께 살펴봐요.
                </h1>
                <p className="session-info-summary">직접 만나 1:1로 진행합니다.</p>
                <p className="session-info-principle">정해진 행동을 권하지 않습니다.<br />요즘 생활을 먼저 듣고, 지금 시작할 행동을 함께 찾습니다.</p>
              </div>

              <ol className="session-timeline" aria-label="60분 체험 프로그램 진행 순서">
                {[
                  ['10분', '현재 하루 살펴보기', '요즘 하루를 어떻게 보내는지 이야기해요.'],
                  ['15분', '내 이야기 나누기', '좋아하는 것, 싫어하는 것과 중요하게 생각하는 것을 이야기해요.'],
                  ['15분', '바꾸고 싶은 점 정하기', '지금 바꾸고 싶은 생활을 정해요.'],
                  ['10분', '반복되는 습관 찾기', '자주 반복되는 행동과 방해되는 것을 찾아요.'],
                  ['10분', '첫 행동 정하기', '오늘부터 시작할 행동 1~3개를 함께 정해요.'],
                ].map(([time, title, description]) => (
                  <li className="session-timeline-item" key={title}>
                    <div>
                      <strong>{title}</strong>
                      <p>{description}</p>
                    </div>
                    <span className="session-time-badge">{time}</span>
                  </li>
                ))}
              </ol>

              <p className="session-followup-note">첫 만남 7일 뒤, 해본 내용을 함께 확인합니다.</p>

              <div className="question-actions-bar">
                <button className="notebook-secondary-btn" onClick={goBack} type="button">← 습관 선택으로 돌아가기</button>
                <button className="notebook-primary-btn notebook-primary-btn--compact" onClick={beginApplication} type="button">
                  <span className="btn-label-text">신청 정보 입력하기</span>
                  <span className="btn-circle-arrow" aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW: CONTACT (Required application details)
             ========================================================================= */}
          {view.kind === 'contact' && (
            <div className="notebook-page-content contact-page">
              <div className="contact-page-header">
                <span className="contact-step-tag">06 · 신청 {view.step} / 3</span>
                <h1 id="contact-title" ref={headingRef} tabIndex={-1} className="contact-main-heading">
                  {view.step === 1 && '기본 정보를 알려주세요.'}
                  {view.step === 2 && '가능한 일정을 골라주세요.'}
                  {view.step === 3 && '개인정보 동의 후 신청을 마쳐주세요.'}
                </h1>
                <p className="contact-lead-text">
                  {view.step === 1 && '연락과 만남 장소를 정하는 데 필요한 정보예요.'}
                  {view.step === 2 && '가능한 요일과 시간대를 모두 골라주세요. ‘상관없음’을 고르면 다른 항목은 선택할 수 없습니다.'}
                  {view.step === 3 && '신청 내용을 확인한 뒤 전화 또는 문자로 가능한 날짜와 시간을 함께 정합니다.'}
                </p>
              </div>

              {error && (
                <p className="notebook-error-msg contact-error-summary" id="contact-error" role="alert">
                  ⚠️ {error}
                </p>
              )}

              {view.step === 1 && (
                <form className="contact-form-sheet" onSubmit={(event) => { event.preventDefault(); goContactNext() }} noValidate>
                  <fieldset className={`form-group-card basic-info-card ${['displayName', 'age', 'phoneNumber', 'nearbyStation'].includes(contactErrorField ?? '') ? 'has-error' : ''}`}>
                    <legend className="sr-only">기본 정보</legend>
                    <div className="group-card-header">
                      <span className="group-num-pill">01</span>
                      <div>
                        <strong className="group-title">기본 정보 <em className="star-required">*</em></strong>
                        <p className="group-sub">연락과 만남 장소를 정하는 데 필요한 정보예요.</p>
                      </div>
                    </div>

                    <div className="contact-fields-grid">
                      <div className="field-block">
                        <label className="field-label" htmlFor="display-name">이름</label>
                        <input
                          id="display-name"
                          autoComplete="name"
                          maxLength={50}
                          aria-describedby={contactErrorField === 'displayName' ? 'contact-display-name-error' : undefined}
                          aria-invalid={contactErrorField === 'displayName'}
                          className={`notebook-text-input ${contactErrorField === 'displayName' ? 'has-error' : ''}`}
                          onChange={(event) => updateContact({ displayName: event.target.value })}
                          placeholder="예: 김데이"
                          ref={displayNameRef}
                          required
                          value={contact.displayName}
                        />
                        {contactErrorField === 'displayName' && <p className="field-error" id="contact-display-name-error">{error}</p>}
                      </div>

                      <div className="field-block">
                        <label className="field-label" htmlFor="age">나이</label>
                        <input
                          id="age"
                          aria-describedby={contactErrorField === 'age' ? 'contact-age-error' : undefined}
                          aria-invalid={contactErrorField === 'age'}
                          className={`notebook-text-input ${contactErrorField === 'age' ? 'has-error' : ''}`}
                          inputMode="numeric"
                          maxLength={3}
                          onChange={(event) => updateContact({ age: event.target.value.replace(/\D/g, '').slice(0, 3) })}
                          placeholder="예: 29"
                          ref={ageRef}
                          required
                          value={contact.age}
                        />
                        {contactErrorField === 'age' && <p className="field-error" id="contact-age-error">{error}</p>}
                      </div>

                      <div className="field-block">
                        <label className="field-label" htmlFor="phone-number">전화번호</label>
                        <input
                          id="phone-number"
                          autoComplete="tel"
                          aria-describedby={contactErrorField === 'phoneNumber' ? 'phone-format-help contact-phone-error' : 'phone-format-help'}
                          aria-invalid={contactErrorField === 'phoneNumber'}
                          className={`notebook-text-input ${contactErrorField === 'phoneNumber' ? 'has-error' : ''}`}
                          inputMode="tel"
                          maxLength={13}
                          onChange={(event) => updateContact({ phoneNumber: formatPhoneNumber(event.target.value) })}
                          placeholder="010-0000-0000"
                          ref={phoneNumberRef}
                          required
                          value={contact.phoneNumber}
                        />
                        <small className="field-format-help" id="phone-format-help">숫자를 입력하면 하이픈이 자동으로 들어갑니다.</small>
                        {contactErrorField === 'phoneNumber' && <p className="field-error" id="contact-phone-error">{error}</p>}
                      </div>

                      <div className="field-block">
                        <label className="field-label" htmlFor="nearby-station">만나기 편한 역</label>
                        <input
                          id="nearby-station"
                          maxLength={50}
                          aria-describedby={contactErrorField === 'nearbyStation' ? 'contact-station-error' : undefined}
                          aria-invalid={contactErrorField === 'nearbyStation'}
                          className={`notebook-text-input ${contactErrorField === 'nearbyStation' ? 'has-error' : ''}`}
                          onChange={(event) => updateContact({ nearbyStation: event.target.value })}
                          placeholder="예: 2호선 성수역"
                          ref={nearbyStationRef}
                          required
                          value={contact.nearbyStation}
                        />
                        {contactErrorField === 'nearbyStation' && <p className="field-error" id="contact-station-error">{error}</p>}
                      </div>
                    </div>
                  </fieldset>

                  <label className="honeypot" aria-hidden="true">
                    웹사이트
                    <input
                      autoComplete="off"
                      name="website"
                      onChange={(event) => updateContact({ website: event.target.value })}
                      tabIndex={-1}
                      value={contact.website}
                    />
                  </label>

                  <div className="contact-actions-bar">
                    <button className="notebook-secondary-btn" onClick={goBack} type="button">
                      ← 프로그램 안내로 돌아가기
                    </button>
                    <button className="notebook-primary-btn" type="submit">
                      <span className="btn-label-text">다음</span>
                      <span className="btn-circle-arrow" aria-hidden="true">→</span>
                    </button>
                  </div>
                </form>
              )}

              {view.step === 2 && (
                <form className="contact-form-sheet" onSubmit={(event) => { event.preventDefault(); goContactNext() }} noValidate>
                  <fieldset className={`form-group-card schedule-group ${contactErrorField === 'preferredDays' || contactErrorField === 'preferredPeriods' ? 'has-error' : ''}`}>
                    <legend className="sr-only">가능한 요일과 시간대</legend>
                    <div className="group-card-header">
                      <span className="group-num-pill">02</span>
                      <div>
                      <strong className="group-title">가능한 일정 <em className="star-required">*</em></strong>
                        <p className="group-sub">가능한 항목을 모두 골라주세요. ‘상관없음’ 항목을 고르면 다른 항목은 선택할 수 없습니다.</p>
                      </div>
                    </div>

                    <div className="schedule-picker-section">
                      <strong className="sub-field-label">가능 요일</strong>
                      <div className="chips-picker-row">
                        {preferredDayOptions.map((option, index) => {
                          const isSelected = contact.preferredDays.includes(option.id)
                          return (
                            <label className={`choice-chip-btn ${isSelected ? 'is-selected' : ''}`} key={option.id}>
                              <input
                                checked={isSelected}
                                aria-describedby={contactErrorField === 'preferredDays' ? 'contact-days-error' : undefined}
                                aria-invalid={contactErrorField === 'preferredDays'}
                                onChange={() => updateContact({
                                  preferredDays: toggleExclusive<PreferredDay>(contact.preferredDays, option.id, 'flexible'),
                                })}
                                ref={index === 0 ? preferredDaysRef : undefined}
                                type="checkbox"
                              />
                              <span>{option.label}</span>
                            </label>
                          )
                        })}
                      </div>
                      {contactErrorField === 'preferredDays' && <p className="field-error" id="contact-days-error">{error}</p>}
                    </div>

                    <div className="schedule-picker-section">
                      <strong className="sub-field-label">가능 시간대</strong>
                      <div className="chips-picker-row">
                        {preferredPeriodOptions.map((option, index) => {
                          const isSelected = contact.preferredPeriods.includes(option.id)
                          return (
                            <label className={`choice-chip-btn ${isSelected ? 'is-selected' : ''}`} key={option.id}>
                              <input
                                checked={isSelected}
                                aria-describedby={contactErrorField === 'preferredPeriods' ? 'contact-periods-error' : undefined}
                                aria-invalid={contactErrorField === 'preferredPeriods'}
                                onChange={() => updateContact({
                                  preferredPeriods: toggleExclusive<PreferredPeriod>(contact.preferredPeriods, option.id, 'flexible'),
                                })}
                                ref={index === 0 ? preferredPeriodsRef : undefined}
                                type="checkbox"
                              />
                              <span>{option.label}</span>
                            </label>
                          )
                        })}
                      </div>
                      {contactErrorField === 'preferredPeriods' && <p className="field-error" id="contact-periods-error">{error}</p>}
                    </div>
                  </fieldset>

                  <div className="contact-actions-bar">
                    <button className="notebook-secondary-btn" onClick={goBack} type="button">
                      ← 기본 정보로 돌아가기
                    </button>
                    <button className="notebook-primary-btn" type="submit">
                      <span className="btn-label-text">다음</span>
                      <span className="btn-circle-arrow" aria-hidden="true">→</span>
                    </button>
                  </div>
                </form>
              )}

              {view.step === 3 && (
                <form className="contact-form-sheet" onSubmit={submitApplication} noValidate>
                  <div className={`privacy-consent-card ${contactErrorField === 'privacyConsent' ? 'has-error' : ''}`}>
                    <div className="group-card-header">
                      <span className="group-num-pill">03</span>
                      <div>
                        <strong className="group-title">개인정보 동의 <em className="star-required">*</em></strong>
                        <p className="group-sub">수집 내용과 보유 기간을 확인해 주세요.</p>
                      </div>
                    </div>
                    <div className="privacy-policy-copy">
                      <strong className="consent-title">개인정보 수집 및 이용 안내</strong>
                      <dl className="privacy-policy-list">
                        <div>
                          <dt>수집 항목</dt>
                          <dd>이름, 나이, 전화번호, 만나기 편한 역, 가능한 요일과 시간, 생활 질문 답변</dd>
                        </div>
                        <div>
                          <dt>수집 목적</dt>
                          <dd>신청 확인, 일정 연락과 60분 대화 준비에 사용합니다.</dd>
                        </div>
                        <div>
                          <dt>보유 기간</dt>
                          <dd>신청일부터 3개월 뒤 삭제합니다.</dd>
                        </div>
                      </dl>
                    </div>
                    <label className="consent-checkbox-label consent-checkbox-label--boxed">
                      <input
                        checked={contact.privacyConsent}
                        aria-describedby={contactErrorField === 'privacyConsent' ? 'contact-privacy-error' : undefined}
                        aria-invalid={contactErrorField === 'privacyConsent'}
                        onChange={(event) => updateContact({ privacyConsent: event.target.checked })}
                        ref={consentRef}
                        required
                        type="checkbox"
                      />
                      <span className="consent-title">[필수] 개인정보 수집과 이용에 동의합니다.</span>
                    </label>
                    {contactErrorField === 'privacyConsent' && <p className="field-error" id="contact-privacy-error">{error}</p>}
                  </div>

                  <div className="contact-actions-bar">
                    <button className="notebook-secondary-btn" onClick={goBack} type="button">
                      ← 가능한 일정으로 돌아가기
                    </button>
                    <button className="notebook-primary-btn" disabled={submitting} type="submit">
                      <span className="btn-label-text">{submitting ? '신청 내용을 보내고 있어요. 다시 누르지 마세요.' : '이 내용으로 신청하기'}</span>
                      {!submitting && <span className="btn-circle-arrow" aria-hidden="true">→</span>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* =========================================================================
              VIEW: SUCCESS (Completed Invitation Receipt)
             ========================================================================= */}
          {view.kind === 'success' && (
            <div className="notebook-page-content success-page">
              <div className="success-stamp-seal" aria-hidden="true">
                <span className="success-check">✓</span>
              </div>

              <div className="success-headline-wrap">
                <span className="success-badge">신청 완료</span>
                <h1 id="success-title" ref={headingRef} tabIndex={-1} className="success-title">
                  신청이 완료됐어요.
                </h1>
                <p className="success-sub">
                  신청 번호를 저장해 주세요. 전화 또는 문자로 가능한 날짜와 시간을 함께 정합니다.
                </p>
              </div>

              <div className="success-receipt-card">
                <div className="receipt-row-item">
                  <span className="receipt-item-label">신청 번호</span>
                  <div className="receipt-code-group">
                    <strong className="receipt-item-val receipt-code">{view.requestId}</strong>
                    <button className="receipt-copy-btn" type="button" onClick={copyApplicationNumber}>신청 번호 복사</button>
                  </div>
                </div>
                <div className="receipt-row-item">
                  <span className="receipt-item-label">이름</span>
                  <strong className="receipt-item-val">{contact.displayName || '신청자'}님</strong>
                </div>
                <div className="receipt-row-item">
                  <span className="receipt-item-label">프로그램</span>
                  <strong className="receipt-item-val">60분 1:1 생활 세션</strong>
                </div>
                <div className="receipt-row-item">
                  <span className="receipt-item-label">진행 장소</span>
                  <strong className="receipt-item-val">연락할 때 장소를 함께 정해요.</strong>
                </div>
                <div className="receipt-row-item">
                  <span className="receipt-item-label">준비물</span>
                  <strong className="receipt-item-val">준비물 없음</strong>
                </div>
              </div>

              <p className="copy-status" aria-live="polite">{copyStatus}</p>

              <div className="success-bottom-bar">
                <button className="notebook-secondary-btn" onClick={restart} type="button">
                  처음으로 돌아가기
                </button>
              </div>
            </div>
          )}
      </main>
    </div>
  )
}

export default App
