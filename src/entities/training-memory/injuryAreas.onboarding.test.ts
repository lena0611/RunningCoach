import { describe, expect, it } from 'vitest'
import { injuryAreaSelectionsFor, normalizeInjuryAreaSelections } from './injuryAreas'

// #878 A3: 온보딩 부상이 부위 카탈로그에 연결돼야 부위별 제한·보강운동·감별 질문이 붙는다.
describe('injuryAreaSelectionsFor (#878 A3)', () => {
  it.each([
    ['hamstring', 'left', ['left-hamstring']],
    ['knee', 'right', ['right-knee']],
    ['plantar-fascia', 'left', ['left-plantar-fascia']],
    ['achilles', 'both', ['left-achilles', 'right-achilles']],
    ['calf', 'right', ['right-calf']],
    ['it-band', 'left', ['left-it-band']],
    ['shin', 'both', ['left-shin', 'right-shin']],
    ['ankle', 'right', ['right-ankle']],
    ['hip', 'left', ['left-hip']]
  ] as const)('%s + %s → %j', (base, side, ids) => {
    expect(injuryAreaSelectionsFor(base, side, 2).map((s) => s.areaId)).toEqual(ids)
  })

  it('좌우 없는 부위(허리)는 side 를 보지 않는다', () => {
    expect(injuryAreaSelectionsFor('lower-back', null, 3)).toEqual([{ areaId: 'lower-back', painLevel: 3 }])
  })

  it('좌우를 안 골랐거나 카탈로그에 없으면 지어내지 않는다', () => {
    expect(injuryAreaSelectionsFor('hamstring', null, 2)).toEqual([])
    expect(injuryAreaSelectionsFor('elbow', 'left', 2)).toEqual([])
  })

  it('온보딩 심각도를 painLevel 로 싣는다', () => {
    expect(injuryAreaSelectionsFor('knee', 'left', 4)).toEqual([{ areaId: 'left-knee', painLevel: 4 }])
  })
})

describe('부위 텍스트 추론 — 장경인대 오매핑 (#878 A3)', () => {
  it('장경인대는 발목으로 새지 않는다', () => {
    const ids = normalizeInjuryAreaSelections([], '장경인대(IT밴드)').map((s) => s.areaId)
    expect(ids).toEqual(['left-it-band', 'right-it-band'])
  })

  it('발목 인대는 여전히 발목', () => {
    const ids = normalizeInjuryAreaSelections([], '왼쪽 발목 인대').map((s) => s.areaId)
    expect(ids).toContain('left-ankle')
  })
})
