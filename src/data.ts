import type {
  ChangeArea,
  ChoiceOption,
  DailyRhythm,
  EnergyBoostMoment,
  EnergyDrainMoment,
  PastPattern,
  PreferredDay,
  PreferredPeriod,
} from './types'

export const energyBoostOptions: Array<{ id: EnergyBoostMoment; label: string }> = [
  { id: 'slept_well', label: '푹 자고 일어난 뒤' },
  { id: 'solo_focus', label: '혼자 집중할 때' },
  { id: 'with_people', label: '사람들과 함께할 때' },
  { id: 'moving_body', label: '몸을 움직일 때' },
  { id: 'favorite_activity', label: '좋아하는 일을 할 때' },
  { id: 'finished_task', label: '할 일을 마친 뒤' },
  { id: 'varies', label: '날마다 달라요' },
]

export const energyDrainOptions: Array<{ id: EnergyDrainMoment; label: string }> = [
  { id: 'lack_of_sleep', label: '잠이 부족할 때' },
  { id: 'task_overload', label: '할 일이 몰릴 때' },
  { id: 'long_focus', label: '오래 집중한 뒤' },
  { id: 'many_people', label: '사람을 많이 만난 뒤' },
  { id: 'long_commute', label: '이동 시간이 길 때' },
  { id: 'no_rest', label: '쉬지 못할 때' },
  { id: 'varies', label: '날마다 달라요' },
]

export const dailyRhythmOptions: ChoiceOption<DailyRhythm>[] = [
  {
    id: 'morning_active',
    title: '아침에 힘이 나요',
    description: '일찍 시작할수록 활력이 생겨요.',
  },
  {
    id: 'daytime_focus',
    title: '낮에 집중이 잘돼요',
    description: '오전부터 오후 사이에 일이 잘돼요.',
  },
  {
    id: 'evening_important',
    title: '저녁에 여유가 생겨요',
    description: '할 일을 마친 뒤 내 시간을 보내기 좋아요.',
  },
  {
    id: 'irregular_daily',
    title: '날마다 달라요',
    description: '정해진 시간보다 상황에 따라 움직여요.',
  },
]

export const pastPatternOptions: ChoiceOption<PastPattern>[] = [
  { id: 'solo_focus', title: '혼자 있을 때' },
  { id: 'together_commitment', title: '함께할 때' },
  { id: 'fixed_time_place', title: '시간·장소를 정했을 때' },
  { id: 'meaning_or_fun', title: '재미있거나 의미 있을 때' },
  { id: 'unknown', title: '잘 모르겠어요' },
]

export const changeAreaOptions: ChoiceOption<ChangeArea>[] = [
  { id: 'sleep', title: '수면' },
  { id: 'meal', title: '식사' },
  { id: 'exercise', title: '운동' },
  { id: 'smartphone', title: '스마트폰' },
  { id: 'study', title: '배움' },
  { id: 'work', title: '일' },
  { id: 'hobby', title: '취미' },
  { id: 'relationship', title: '관계' },
  { id: 'rest', title: '휴식' },
]

export const preferredDayOptions: Array<{ id: PreferredDay; label: string }> = [
  { id: 'mon', label: '월' },
  { id: 'tue', label: '화' },
  { id: 'wed', label: '수' },
  { id: 'thu', label: '목' },
  { id: 'fri', label: '금' },
  { id: 'sat', label: '토' },
  { id: 'sun', label: '일' },
  { id: 'flexible', label: '요일 상관없음' },
]

export const preferredPeriodOptions: Array<{ id: PreferredPeriod; label: string }> = [
  { id: 'morning', label: '오전 9시~12시' },
  { id: 'afternoon', label: '오후 12시~6시' },
  { id: 'evening', label: '저녁 6시~9시' },
  { id: 'flexible', label: '시간 상관없음' },
]

export const labels = {
  changeArea: Object.fromEntries(changeAreaOptions.map((option) => [option.id, option.title])),
} as {
  changeArea: Record<ChangeArea, string>
}
