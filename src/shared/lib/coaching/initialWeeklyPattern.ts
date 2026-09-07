/**
 * 온보딩 초기 루틴 슬롯 룰 엔진 (#329).
 *
 * 주간 가용 횟수 × 목표 거리 × 러너 레벨(+선호 롱런 요일·부상)으로 초기 주간 슬롯을 추천한다.
 * 슬롯은 온보딩에서 **"이런 주로 시작해요" 미리보기**에만 쓴다 — 메모리에 저장하지 않는다.
 * 실제 주간 루틴은 목표에서 생성되는 주기화 플랜(training_schedule)이, 세션별 실행 지침은
 * sessionBriefing 이 갖는다. 여기 카탈로그는 세션의 **이름과 목적**까지만 안다 —
 * 워밍업·반복수·쿨다운 같은 실행 수치를 여기 적으면 그 두 곳과 어긋나는 두 번째 진실이 된다
 * (2026-09-07: 옛 처방 템플릿이 실제로 그렇게 어긋나 제거됨).
 */

export type RoutineGoalKey = '5k' | '10k' | 'half' | 'full' | 'health'
export type RunnerLevelKey = 'beginner' | 'novice' | 'intermediate' | 'advanced'
export type WeekDay = '월' | '화' | '수' | '목' | '금' | '토' | '일'

export const WEEK_DAYS: WeekDay[] = ['월', '화', '수', '목', '금', '토', '일']

export type RoutineSlot = {
  day: WeekDay
  /** RoutineTemplate의 id. */
  templateId: string
  /** 표시용 세션 타입(템플릿 sessionType). */
  sessionType: string
}

/** 온보딩 루틴 미리보기용 세션 카탈로그. 실행 수치는 담지 않는다(위 주석). */
export type RoutineTemplate = {
  id: string
  name: string
  sessionType: string
  purpose: string
}

/**
 * canonical slug 집합이기도 하다 — DB 시드(`training_prescription_rules.template_slug`)와 같은 값이라
 * **id를 바꾸면 안 된다.** `easy-strides-8x`·`tempo-ceiling-165`의 숫자는 옛 고정값의 흔적일 뿐
 * 현재 처방과 무관하다(반복수·심박 상한은 단계·VDOT·부상·heartRateModel로 산출).
 */
export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  { id: 'easy-base', name: 'Easy 기반주', sessionType: 'Easy', purpose: '유산소 기반 유지와 회복 가능한 볼륨 확보' },
  { id: 'recovery-reset', name: 'Recovery 회복주', sessionType: 'Recovery', purpose: '롱런/템포 다음날 혈류 회복과 피로 확인' },
  { id: 'easy-strides-8x', name: 'Easy + Strides', sessionType: 'Easy + Strides', purpose: '이지 기반에 짧은 신경근 자극 추가' },
  { id: 'tempo-ceiling-165', name: 'Tempo', sessionType: 'Tempo', purpose: '목표 거리를 위한 역치 지속력 확보' },
  { id: 'lsd-easy-long', name: 'Easy LSD', sessionType: 'LSD', purpose: '발 위 시간으로 지속력 쌓기' },
  { id: 'steady-long', name: 'Steady Long', sessionType: 'Steady Long', purpose: '롱런 후반 목표 페이스 구간으로 특이성 확보' },
  { id: '5k-check', name: '5km 체크', sessionType: 'TT', purpose: '현재 체력 확인과 목표 재추정' },
  { id: 'cruise-interval', name: 'Cruise Interval', sessionType: 'Interval', purpose: '역치 자극을 나눠 담아 품질 확보' }
]

const TEMPLATE_BY_ID = new Map(ROUTINE_TEMPLATES.map((template) => [template.id, template]))

export function routineTemplateById(id: string): RoutineTemplate | null {
  return TEMPLATE_BY_ID.get(id) ?? null
}

// 부상 active 시 피하는 고부하 처방(템플릿 avoidWhen의 active_injury 류).
const INJURY_CONTRAINDICATED = new Set(['cruise-interval', '5k-check', 'easy-strides-8x'])

/** 부상 active일 때 고강도 처방을 안전 대체로 낮춘다. */
function softenForInjury(templateId: string): string {
  if (!INJURY_CONTRAINDICATED.has(templateId)) return templateId
  if (templateId === 'easy-strides-8x') return 'easy-base'
  if (templateId === 'cruise-interval') return 'tempo-ceiling-165'
  if (templateId === '5k-check') return 'tempo-ceiling-165'
  return templateId
}

/**
 * 목표·레벨별 우선순위 세션 시퀀스(가용 횟수만큼 앞에서 채운다).
 * 입문/초급은 Tempo 대신 Easy+Strides로 신경근 자극을 먼저 쌓고, 중급↑은 Tempo/품질을 포함한다.
 */
function sessionSequence(goal: RoutineGoalKey, level: RunnerLevelKey): string[] {
  const beginnerish = level === 'beginner' || level === 'novice'
  const longTemplate = goal === 'half' || goal === 'full' ? 'lsd-easy-long' : 'lsd-easy-long'

  if (goal === 'health') {
    return ['easy-base', 'easy-base', 'lsd-easy-long', 'easy-base', 'recovery-reset']
  }
  if (beginnerish) {
    // 기반 우선: Easy 다수 + Long + (여유 있으면) Easy+Strides
    return ['easy-base', longTemplate, 'easy-strides-8x', 'easy-base', 'recovery-reset']
  }
  // 중급 이상: 품질 세션 포함
  const steady = goal === 'half' || goal === 'full' ? 'steady-long' : longTemplate
  return ['easy-strides-8x', 'tempo-ceiling-165', steady, 'easy-base', 'recovery-reset']
}

/**
 * 가용 횟수만큼 세션을 요일에 배치한다. 롱런은 선호 요일(기본 토)에, 나머지는 간격을 두고 분산.
 */
function assignDays(count: number, preferredLongRunDay: WeekDay): WeekDay[] {
  // 가용 횟수별 권장 요일 분포(회복 간격 고려).
  const layouts: Record<number, WeekDay[]> = {
    1: ['토'],
    2: ['화', '토'],
    3: ['화', '목', '토'],
    4: ['화', '목', '토', '일'],
    5: ['월', '화', '목', '토', '일'],
    6: ['월', '화', '수', '목', '토', '일'],
    7: ['월', '화', '수', '목', '금', '토', '일']
  }
  const base = layouts[Math.min(Math.max(count, 1), 7)] ?? layouts[4]
  // 선호 롱런 요일이 분포에 없으면 마지막 슬롯을 선호 요일로 치환.
  if (!base.includes(preferredLongRunDay)) {
    return [...base.slice(0, -1), preferredLongRunDay]
  }
  return base
}

export type BuildWeeklyPatternInput = {
  weeklyDays: number
  goal: RoutineGoalKey
  level: RunnerLevelKey
  preferredLongRunDay?: WeekDay
  hasActiveInjury?: boolean
}

export function buildInitialWeeklyPattern(input: BuildWeeklyPatternInput): RoutineSlot[] {
  const count = Math.min(Math.max(Math.round(input.weeklyDays || 3), 1), 7)
  const longRunDay = input.preferredLongRunDay ?? '토'
  const sequence = sessionSequence(input.goal, input.level)
  const days = assignDays(count, longRunDay)

  // 시퀀스에서 가용 횟수만큼 템플릿을 고른다(롱런 1개는 보장).
  const picked: string[] = []
  for (let i = 0; i < count; i += 1) picked.push(sequence[Math.min(i, sequence.length - 1)])
  const hasLong = picked.some((id) => id === 'lsd-easy-long' || id === 'steady-long')
  if (!hasLong && count >= 1) picked[picked.length - 1] = input.goal === 'half' || input.goal === 'full' ? 'steady-long' : 'lsd-easy-long'

  // 롱런을 선호 요일 슬롯에 정렬: 롱런 템플릿을 마지막(=longRunDay) 위치로 보낸다.
  const longIdx = picked.findIndex((id) => id === 'lsd-easy-long' || id === 'steady-long')
  if (longIdx >= 0 && longIdx !== picked.length - 1) {
    const [longId] = picked.splice(longIdx, 1)
    picked.push(longId)
  }

  return picked.map((rawId, index) => {
    const templateId = input.hasActiveInjury ? softenForInjury(rawId) : rawId
    const template = TEMPLATE_BY_ID.get(templateId)
    return {
      day: days[index] ?? WEEK_DAYS[index % 7],
      templateId,
      sessionType: template?.sessionType ?? 'Easy'
    }
  })
}

