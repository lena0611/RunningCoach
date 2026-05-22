export type TrainingMemory = {
  goal: string
  athleteProfile: AthleteProfile
  weeklyPattern: string[]
  longRunStrategy: string
  currentVolumeNote: string
  knownIssues: string[]
  runningStyle: string[]
  heatStrategy: string[]
  aiNotes: string[]
}

export type AthleteProfile = {
  birthYear: number | null
  sex: 'male' | 'female' | 'other' | 'unknown'
  runningExperienceMonths: number | null
  weeklyRunDaysTarget: number | null
  preferredLongRunDay: string
  personalBests: PersonalBest[]
}

export type PersonalBest = {
  distanceKm: number
  durationSec: number
  date: string
  source: 'race' | 'time_trial' | 'estimated'
}

export const initialTrainingMemory: TrainingMemory = {
  goal: '10km 60분 달성',
  athleteProfile: {
    birthYear: null,
    sex: 'unknown',
    runningExperienceMonths: null,
    weeklyRunDaysTarget: 4,
    preferredLongRunDay: '토요일',
    personalBests: []
  },
  weeklyPattern: [
    '화요일: Easy + Strides',
    '목요일: Tempo',
    '토요일: LSD 또는 Steady Long',
    '필요 시 5km Easy 추가'
  ],
  longRunStrategy: '토요일 롱런은 격주로 Easy LSD와 Steady Long을 번갈아 수행한다.',
  currentVolumeNote: '최근 반달 114km 누적. 대부분 5km Easy.',
  knownIssues: [
    '과거 좌측 근위부 햄스트링 이슈',
    '더위에서 심박 상승',
    '30도 이상 낮 러닝은 위험도가 높음'
  ],
  runningStyle: [
    '케이던스를 억지로 맞추면 호흡이 불편함',
    '케이던스 신경을 줄이면 복식호흡이 편함',
    '느린 페이스에서는 165~170spm 정도',
    '5분 초반 페이스에서는 180spm이 자연스럽게 나옴',
    '스트라이드형 성향 가능성'
  ],
  heatStrategy: [
    '30도 이상 낮 러닝은 피한다',
    '여름에는 페이스보다 체감강도와 심박 상한을 우선한다',
    '여름은 기록 시즌이 아니라 버티기와 기반 유지 시즌으로 본다'
  ],
  aiNotes: [
    '코칭은 단일 기록보다 최근 훈련 흐름과 격주 롱런 패턴을 함께 봐야 한다',
    '다음 훈련 추천은 피로도, 최근 14일 기록, 장거리 주차 여부를 함께 반영한다'
  ]
}
