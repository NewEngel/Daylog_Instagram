import type {
  ChangeArea,
  ChoiceOption,
  DailyRhythm,
  EnergyTimeSlot,
  PastPattern,
  PreferredDay,
  PreferredPeriod,
} from './types'

export const energyTimeOptions: Array<{ id: EnergyTimeSlot; label: string }> = [
  { id: 'morning', label: '아침' },
  { id: 'lunch', label: '점심' },
  { id: 'evening', label: '저녁' },
  { id: 'varies', label: '매일 달라요' },
]

export const dailyRhythmOptions: ChoiceOption<DailyRhythm>[] = [
  {
    id: 'morning_active',
    marker: '06',
    title: '아침에 힘이 나요',
    description: '일찍 시작할수록 활력이 생겨요.',
  },
  {
    id: 'daytime_focus',
    marker: '12',
    title: '낮에 집중이 잘돼요',
    description: '오전부터 오후 사이에 일이 잘돼요.',
  },
  {
    id: 'evening_important',
    marker: '19',
    title: '저녁에 여유가 생겨요',
    description: '할 일을 마친 뒤 내 시간을 보내기 좋아요.',
  },
  {
    id: 'irregular_daily',
    marker: '≈',
    title: '날마다 달라요',
    description: '정해진 시간보다 상황에 따라 움직여요.',
  },
]

export const pastPatternOptions: ChoiceOption<PastPattern>[] = [
  { id: 'solo_focus', marker: '01', title: '혼자 있을 때' },
  { id: 'together_commitment', marker: '02', title: '함께할 때' },
  { id: 'fixed_time_place', marker: '03', title: '시간·장소를 정했을 때' },
  { id: 'meaning_or_fun', marker: '04', title: '재미있거나 의미 있을 때' },
  { id: 'unknown', marker: '···', title: '잘 모르겠어요' },
]

export const changeAreaOptions: ChoiceOption<ChangeArea>[] = [
  { id: 'sleep', marker: 'Z', title: '수면' },
  { id: 'meal', marker: 'M', title: '식사' },
  { id: 'exercise', marker: 'E', title: '운동' },
  { id: 'smartphone', marker: 'P', title: '스마트폰' },
  { id: 'study', marker: 'S', title: '배움' },
  { id: 'work', marker: 'W', title: '일' },
  { id: 'hobby', marker: 'H', title: '취미' },
  { id: 'relationship', marker: 'R', title: '관계' },
  { id: 'rest', marker: 'O', title: '휴식' },
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
