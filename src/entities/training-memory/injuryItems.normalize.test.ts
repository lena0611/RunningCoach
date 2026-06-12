import { describe, expect, it } from 'vitest'
import { initialTrainingMemory, normalizeTrainingMemory } from './model'

// #303: 부상 삭제 영속 — normalizeInjuryItems가 명시적 빈 배열을 존중하고,
// 자동 복원/기본 시드는 injuryItems 키 부재(최초/레거시)에만 1회 적용하는지 검증한다.
describe('normalizeTrainingMemory injuryItems (#303)', () => {
  it('명시적 빈 injuryItems는 빈 목록으로 존중한다(삭제 영속)', () => {
    expect(normalizeTrainingMemory({ injuryItems: [] }).injuryItems).toEqual([])
  })

  it('빈 injuryItems면 knownIssues에 부상 텍스트가 있어도 재합성하지 않는다(삭제 우선)', () => {
    const result = normalizeTrainingMemory({ injuryItems: [], knownIssues: ['좌측 근위부 햄스트링 이슈'] })
    expect(result.injuryItems).toEqual([])
  })

  it('명시적 injuryItems는 그대로 정규화해 보존한다', () => {
    const result = normalizeTrainingMemory({ injuryItems: [{ title: '우측 무릎', status: 'active' }] as never })
    expect(result.injuryItems).toHaveLength(1)
    expect(result.injuryItems[0].title).toBe('우측 무릎')
  })

  it('injuryItems 키 부재 + knownIssues 부상 텍스트 → 레거시 1회 동기화', () => {
    const result = normalizeTrainingMemory({ knownIssues: ['좌측 근위부 햄스트링 이슈'] })
    expect(result.injuryItems.length).toBeGreaterThan(0)
    expect(result.injuryItems[0].title).toContain('햄스트링')
  })

  it('injuryItems·knownIssues 모두 부재 → 기본 시드 1회(최초 사용자)', () => {
    const result = normalizeTrainingMemory({})
    expect(result.injuryItems.length).toBe(initialTrainingMemory.injuryItems.length)
    expect(result.injuryItems.length).toBeGreaterThan(0)
  })
})
