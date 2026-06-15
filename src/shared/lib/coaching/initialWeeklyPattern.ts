import { defaultPrescriptionTemplates, type PrescriptionTemplate } from '@/entities/training-memory/model'

/**
 * 온보딩 초기 weeklyPattern 룰 엔진 (#329).
 *
 * 주간 가용 횟수 × 목표 거리 × 러너 레벨(+선호 롱런 요일·부상)으로 초기 주간 루틴 슬롯을 추천한다.
 * 결과 슬롯은 사용자가 인라인 편집(요일 이동/처방 교체/추가·삭제)한 뒤 weekly_patterns(#328)에 저장한다.
 * 처방은 defaultPrescriptionTemplates(#327) id로 매핑한다.
 */

export type RoutineGoalKey = '5k' | '10k' | 'half' | 'full' | 'health'
export type RunnerLevelKey = 'beginner' | 'novice' | 'intermediate' | 'advanced'
export type WeekDay = '월' | '화' | '수' | '목' | '금' | '토' | '일'

export const WEEK_DAYS: WeekDay[] = ['월', '화', '수', '목', '금', '토', '일']

export type RoutineSlot = {
  day: WeekDay
  /** defaultPrescriptionTemplates의 id. */
  templateId: string
  /** 표시용 세션 타입(템플릿 sessionType). */
  sessionType: string
}

const TEMPLATE_BY_ID = new Map(defaultPrescriptionTemplates.map((template) => [template.id, template]))

export function prescriptionTemplateById(id: string): PrescriptionTemplate | null {
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

/** RoutineSlot[] → weeklyPattern 문자열 배열(기존 TrainingMemory.weeklyPattern 포맷). */
export function slotsToWeeklyPattern(slots: RoutineSlot[]): string[] {
  return slots.map((slot) => {
    const template = TEMPLATE_BY_ID.get(slot.templateId)
    return `${slot.day}요일: ${template?.name ?? slot.sessionType}`
  })
}
