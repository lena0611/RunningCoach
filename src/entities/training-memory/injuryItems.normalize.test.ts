import { describe, expect, it } from 'vitest'
import { normalizeTrainingMemory } from './model'

// #303: 부상 삭제 영속 — normalizeInjuryItems가 명시적 빈 배열을 존중하고,
// 자동 복원/기본 시드는 injuryItems 키 부재(최초/레거시)에만 1회 적용하는지 검증한다.
describe('normalizeTrainingMemory injuryItems (#303)', () => {
  it('명시적 빈 injuryItems는 빈 목록으로 존중한다(삭제 영속)', () => {
    expect(normalizeTrainingMemory({ injuryItems: [] }).injuryItems).toEqual([])
  })

  // knownIssues 는 2026-09-07에 제거된 레거시 필드다 — 저장된 옛 JSON 을 흉내내려 as never 로 넣는다.
  it('빈 injuryItems면 knownIssues에 부상 텍스트가 있어도 재합성하지 않는다(삭제 우선)', () => {
    const result = normalizeTrainingMemory({ injuryItems: [], knownIssues: ['좌측 근위부 햄스트링 이슈'] } as never)
    expect(result.injuryItems).toEqual([])
  })

  it('명시적 injuryItems는 그대로 정규화해 보존한다', () => {
    const result = normalizeTrainingMemory({ injuryItems: [{ title: '우측 무릎', status: 'active' }] as never })
    expect(result.injuryItems).toHaveLength(1)
    expect(result.injuryItems[0].title).toBe('우측 무릎')
  })

  it('injuryItems 키 부재 + knownIssues 부상 텍스트 → 레거시 1회 동기화', () => {
    const result = normalizeTrainingMemory({ knownIssues: ['좌측 근위부 햄스트링 이슈'] } as never)
    expect(result.injuryItems.length).toBeGreaterThan(0)
    expect(result.injuryItems[0].title).toContain('햄스트링')
  })

  // #878 A6: 예전엔 개발자 예시 부상(좌측 햄스트링)을 시드했다 — 신규 유저에게 없는 부상이 생겼다.
  it('injuryItems·knownIssues 모두 부재 → 부상 없음(예시 부상을 시드하지 않는다)', () => {
    expect(normalizeTrainingMemory({}).injuryItems).toEqual([])
    expect(normalizeTrainingMemory({}).activeInjuryItemId).toBeNull()
  })
})

// #878 A6: 빈 칸은 중립값으로 — 개발자 예시(10km 60분·햄스트링·더위 심박·코칭 메모)로 채우지 않는다.
describe('normalizeTrainingMemory 빈 칸 기본값 (#878 A6)', () => {
  it('메모리가 통째로 비어도 개발자 예시가 새지 않는다', () => {
    const result = normalizeTrainingMemory({})
    expect(result.goals).toHaveLength(1)
    expect(result.goals[0]).toMatchObject({ title: '목표 미설정', category: 'health', distanceKm: null, targetDurationSec: null })
    expect(result.runnerIdentity).toEqual({ strengths: [], weaknesses: [], riskFactors: [], coachingStyle: [] })
    expect(result.aiNotes).toEqual([])
    expect(JSON.stringify(result)).not.toMatch(/햄스트링|10km 60분/)
  })

  it('coach-run 이 patch 만 upsert 한 메모리(aiNotes 만 있음)도 예시로 채우지 않는다', () => {
    const result = normalizeTrainingMemory({ aiNotes: ['주 3회 꾸준히'] })
    expect(result.aiNotes).toEqual(['주 3회 꾸준히'])
    expect(result.injuryItems).toEqual([])
    expect(result.goals[0].title).toBe('목표 미설정')
  })

  it('옛 목표 문자열만 있으면 제목만 살리고 거리·기록은 지어내지 않는다', () => {
    const goal = normalizeTrainingMemory({ goal: '하프 완주' }).goals[0]
    expect(goal).toMatchObject({ title: '하프 완주', category: 'health', distanceKm: null, targetDurationSec: null, successCriteria: '' })
  })

  it('목표 제목을 모두 비우면 중립 목표로 — 10km 60분 레이스 목표가 생기지 않는다', () => {
    const goal = normalizeTrainingMemory({ goals: [{ title: '  ' }] as never }).goals[0]
    expect(goal.title).toBe('목표 미설정')
    expect(goal.distanceKm).toBeNull()
  })
})

// §5 Phase C: grill 프로브 답변 누적 필드(probeAnswers/subtypeResolved) carry-through(비파괴).
describe('normalizeTrainingMemory injuryItems probeAnswers/subtypeResolved (§5 Phase C)', () => {
  it('probeAnswers·subtypeResolved가 없으면 안전 기본값(미설정/null)', () => {
    const item = normalizeTrainingMemory({ injuryItems: [{ title: '우측 아킬레스', status: 'active' }] as never }).injuryItems[0]
    expect(item.probeAnswers).toBeUndefined()
    expect(item.subtypeResolved).toBeNull()
  })

  it('유효한 probeAnswers·subtypeResolved는 보존한다', () => {
    const item = normalizeTrainingMemory({
      injuryItems: [{
        title: '우측 아킬레스', status: 'active',
        probeAnswers: { achilles: 'insertional' }, subtypeResolved: 'insertional'
      }] as never
    }).injuryItems[0]
    expect(item.probeAnswers).toEqual({ achilles: 'insertional' })
    expect(item.subtypeResolved).toBe('insertional')
  })

  it('깨진 probeAnswers(비문자 값·빈 객체)·공백 subtypeResolved는 정리한다', () => {
    const item = normalizeTrainingMemory({
      injuryItems: [{
        title: '정강이', status: 'active',
        probeAnswers: { shin: 123, '': 'x', knee: '  ' } as never, subtypeResolved: '   '
      }] as never
    }).injuryItems[0]
    expect(item.probeAnswers).toBeUndefined() // 유효 항목 0개 → 미설정
    expect(item.subtypeResolved).toBeNull()
  })
})
