import { describe, expect, it } from 'vitest'

/**
 * 컨텍스트 캐시 정렬 계약(#661 원가 절감).
 *
 * 핵심 불변식: **키·값 집합이 완전히 동일**해야 한다. 이 최적화는 "값은 그대로, 순서만" 이라서
 * 하나라도 빠지면 코치가 그 정보를 잃는다(품질 회귀). 그래서 정렬 함수의 계약을 테스트로 못박는다.
 *
 * index.ts 는 Deno 전용 import 가 섞여 vitest 에서 직접 불러올 수 없어 함수를 여기 미러한다.
 * 원본(`orderContextForCache`)을 바꾸면 이 미러도 함께 바꾼다.
 */
const CACHE_STABLE_CONTEXT_KEYS = [
  'trainingMethodology',
  'adaptiveAlgorithmPolicy',
  'memorySelectionPolicy',
  'coachResponseModePolicy',
  'nextTrainingAdvicePolicy',
  'instructionForDateHandling',
  'instructionForWeatherHandling',
  'instructionForAchievements',
  'instructionForTempoCoaching',
  'upcomingSchedulePolicy',
  'instructionForRest',
  'instructionForInjuryHistory',
  'instructionForMarathonGoal',
  'instructionForInjurySignals',
  'sessionEvidencePolicy',
  'richAnalysisPolicy',
  'runningAnalysisEngineInstruction',
  'chronicLoadTrendInstruction',
  'coreMemoryItemsInstruction',
  'prescriptionMemoryInstruction',
  'runnerLevelGuide'
] as const

function orderContextForCache(context: unknown): unknown {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return context
  const source = context as Record<string, unknown>
  const ordered: Record<string, unknown> = {}
  for (const key of CACHE_STABLE_CONTEXT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) ordered[key] = source[key]
  }
  for (const [key, value] of Object.entries(source)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) ordered[key] = value
  }
  return ordered
}

const CONTEXT = {
  userNote: '오늘 어땠어?',
  hasUserNote: true,
  instructionForRest: '휴식 지침',
  selectedRun: { id: 'r1', distanceKm: 5 },
  trainingMethodology: { algorithm: 'static' },
  coachThread: [{ userNote: 'q', coachAnswer: 'a' }],
  runnerLevelGuide: { termDepth: 'deep' },
  recent14: [1, 2, 3]
}

describe('orderContextForCache — 값 보존이 최우선', () => {
  it('키 집합이 완전히 같다 (정보 누락 0 = 품질 회귀 0)', () => {
    const ordered = orderContextForCache(CONTEXT) as Record<string, unknown>
    expect(Object.keys(ordered).sort()).toEqual(Object.keys(CONTEXT).sort())
  })

  it('모든 값이 참조까지 그대로다 (깊은 복사·변형 없음)', () => {
    const ordered = orderContextForCache(CONTEXT) as Record<string, unknown>
    for (const [key, value] of Object.entries(CONTEXT)) {
      expect(ordered[key]).toBe(value)
    }
  })

  it('안정 키가 앞으로 오고, 매 턴 바뀌는 userNote 는 그 뒤로 밀린다', () => {
    const keys = Object.keys(orderContextForCache(CONTEXT) as Record<string, unknown>)
    expect(keys.slice(0, 3)).toEqual(['trainingMethodology', 'instructionForRest', 'runnerLevelGuide'])
    expect(keys.indexOf('userNote')).toBeGreaterThan(keys.indexOf('runnerLevelGuide'))
  })

  it('안정 키가 아닌 나머지는 원래 순서를 유지한다', () => {
    const keys = Object.keys(orderContextForCache(CONTEXT) as Record<string, unknown>)
    const rest = keys.filter((key) => !CACHE_STABLE_CONTEXT_KEYS.includes(key as never))
    expect(rest).toEqual(['userNote', 'hasUserNote', 'selectedRun', 'coachThread', 'recent14'])
  })

  it('없는 안정 키는 만들어내지 않는다 (undefined 주입 금지)', () => {
    const ordered = orderContextForCache({ userNote: 'x' }) as Record<string, unknown>
    expect(Object.keys(ordered)).toEqual(['userNote'])
    expect('instructionForRest' in ordered).toBe(false)
  })

  it('객체가 아니면 그대로 돌려준다', () => {
    expect(orderContextForCache(null)).toBeNull()
    expect(orderContextForCache('str')).toBe('str')
    const arr = [1, 2]
    expect(orderContextForCache(arr)).toBe(arr)
  })

  it('직렬화 결과의 정보량이 동일하다 (파싱하면 같은 객체)', () => {
    const before = JSON.parse(JSON.stringify(CONTEXT))
    const after = JSON.parse(JSON.stringify(orderContextForCache(CONTEXT)))
    expect(after).toEqual(before)
  })
})
