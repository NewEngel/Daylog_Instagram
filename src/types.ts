export type DailyRhythm =
  | 'morning_active'
  | 'daytime_focus'
  | 'evening_important'
  | 'irregular_daily'

export type PastPattern =
  | 'solo_focus'
  | 'together_commitment'
  | 'fixed_time_place'
  | 'meaning_or_fun'
  | 'unknown'

export type ChangeArea =
  | 'sleep'
  | 'meal'
  | 'exercise'
  | 'smartphone'
  | 'study'
  | 'work'
  | 'hobby'
  | 'relationship'
  | 'rest'

export type PreferredDay =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun'
  | 'flexible'

export type PreferredPeriod = 'morning' | 'afternoon' | 'evening' | 'flexible'

export type EnergyTimeSlot =
  | 'dawn'
  | 'morning'
  | 'late_morning'
  | 'lunch'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'commute'
  | 'varies'

export type ApplicationAnswers = {
  dailyRhythm?: DailyRhythm
  comfortableTime?: string
  difficultTime?: string
  pastPattern?: PastPattern
  changeAreas: ChangeArea[]
}

export type ContactDetails = {
  displayName: string
  age: string
  phoneNumber: string
  nearbyStation: string
  preferredDays: PreferredDay[]
  preferredPeriods: PreferredPeriod[]
  privacyConsent: boolean
  website: string
}

export type View =
  | { kind: 'intro' }
  | { kind: 'question'; index: number }
  | { kind: 'session-info' }
  | { kind: 'contact'; step: 1 | 2 | 3 }
  | { kind: 'success'; requestId: string }

export type ChoiceOption<T extends string> = {
  id: T
  marker: string
  title: string
  description?: string
}

export type ApiResult = {
  ok: boolean
  requestId?: string
  duplicate?: boolean
  error?: string
}
