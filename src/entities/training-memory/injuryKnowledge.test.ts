import { describe, expect, it } from 'vitest'
import {
  evaluateRedFlags,
  injuryAreaBase,
  injuryKnowledgeBase,
  rankInjuryHypotheses,
  redFlagHypothesesForAreas,
  type InjuryDataSignals
} from './injuryKnowledge'

describe('injuryAreaBase', () => {
  it('좌우 prefix를 떼어 부위 base를 만든다', () => {
    expect(injuryAreaBase('left-plantar-fascia')).toBe('plantar-fascia')
    expect(injuryAreaBase('right-it-band')).toBe('it-band')
    expect(injuryAreaBase('right-achilles')).toBe('achilles')
  })
  it('prefix 없는 area는 그대로', () => {
    expect(injuryAreaBase('lower-back')).toBe('lower-back')
  })
})

describe('injuryKnowledgeBase (do-not 가드)', () => {
  const ALLOWED_SIGNALS = new Set<keyof InjuryDataSignals>([
    'acwrSpike', 'chronicRising', 'highWeeklyVolume', 'weeklyIncreaseHigh', 'cadenceLow', 'groundUphill', 'groundDownhill', 'paceSpike', 'recurrence'
  ])
  it('dataWeights에 do-not 신호(성별·BMI·strike·생체역학·근력)가 없다 — 허용 신호만', () => {
    for (const h of injuryKnowledgeBase) {
      for (const key of Object.keys(h.dataWeights)) {
        expect(ALLOWED_SIGNALS.has(key as keyof InjuryDataSignals)).toBe(true)
      }
    }
  })
  it('케이던스는 보조라 가중이 항상 ≤0.5(주신호보다 낮음)', () => {
    for (const h of injuryKnowledgeBase) {
      if (typeof h.dataWeights.cadenceLow === 'number') expect(h.dataWeights.cadenceLow).toBeLessThanOrEqual(0.5)
    }
  })
  it('overuse 가설은 prevention 레버를 갖고, red-flag 후보는 비어 있다(의뢰 경로)', () => {
    for (const h of injuryKnowledgeBase) {
      if (h.classification === 'overuse') expect(h.prevention.length).toBeGreaterThan(0)
      else expect(h.prevention.length).toBe(0)
    }
  })
})

describe('rankInjuryHypotheses', () => {
  it('단일 부위면 그 부위 overuse 가설이 top (red-flag 제외)', () => {
    const ranked = rankInjuryHypotheses(['left-knee'])
    expect(ranked[0].hypothesis.id).toBe('pfps')
    expect(ranked.every((r) => r.hypothesis.classification === 'overuse')).toBe(true)
  })

  it('데이터 신호가 매칭 가설을 가중한다 — ITBS는 주간 급증에 강하게 반응', () => {
    const base = rankInjuryHypotheses(['right-it-band'])[0].score
    const boosted = rankInjuryHypotheses(['right-it-band'], { weeklyIncreaseHigh: true })[0].score
    expect(boosted).toBeGreaterThan(base)
    expect(boosted - base).toBeCloseTo(1.0, 5) // ITBS weeklyIncreaseHigh 가중 1.0
  })

  it('기여 신호를 보고하고, 가설 dataWeights에 없는 신호는 점수에 안 들어간다', () => {
    const ranked = rankInjuryHypotheses(['left-shin'], { acwrSpike: true, groundDownhill: true })
    const mtss = ranked.find((r) => r.hypothesis.id === 'mtss')!
    expect(mtss.contributingSignals).toContain('acwrSpike')
    expect(mtss.contributingSignals).not.toContain('groundDownhill') // MTSS dataWeights에 groundDownhill 없음
  })

  it('매칭 부위 없으면 빈 배열(fallback) — ankle/quad/lower-back은 스코프 밖', () => {
    expect(rankInjuryHypotheses(['lower-back'])).toEqual([])
    expect(rankInjuryHypotheses(['left-ankle'])).toEqual([])
  })

  it('햄스트링 좌상은 overuse라 rank에 들어간다(PHT가 top, 좌상 동반) — 좌상을 red-flag로 묻지 않음', () => {
    const ids = rankInjuryHypotheses(['left-hamstring']).map((r) => r.hypothesis.id)
    expect(ids).toContain('pht')
    expect(ids).toContain('hamstring-strain')
    expect(ids[0]).toBe('pht') // priorRank 1
  })

  it('결정론 — 같은 입력은 같은 순위', () => {
    const a = rankInjuryHypotheses(['left-calf'], { weeklyIncreaseHigh: true }).map((r) => r.hypothesis.id)
    const b = rankInjuryHypotheses(['left-calf'], { weeklyIncreaseHigh: true }).map((r) => r.hypothesis.id)
    expect(a).toEqual(b)
  })
})

describe('evaluateRedFlags (§4 게이트)', () => {
  it('신호 없으면 미발동(보수적)', () => {
    expect(evaluateRedFlags(null).tripped).toBe(false)
    expect(evaluateRedFlags({}).tripped).toBe(false)
  })
  it('야간/휴식통이면 발동', () => {
    const r = evaluateRedFlags({ nightOrRestPain: true })
    expect(r.tripped).toBe(true)
    expect(r.reasons.join(' ')).toContain('야간')
  })
  it('점통+hop·보행통·신경증상·부종·무호전 각각 발동', () => {
    expect(evaluateRedFlags({ pointTenderOrHopPositive: true }).tripped).toBe(true)
    expect(evaluateRedFlags({ dailyActivityPain: true }).tripped).toBe(true)
    expect(evaluateRedFlags({ numbnessRadiatingWeakness: true }).tripped).toBe(true)
    expect(evaluateRedFlags({ swellingRednessHeat: true }).tripped).toBe(true)
    expect(evaluateRedFlags({ noImprovementWeeks: 6 }).tripped).toBe(true)
    expect(evaluateRedFlags({ noImprovementWeeks: 4 }).tripped).toBe(false)
  })
  it('활동성 악화 + 체중부하 통증 조합이면 피로골절 경계 발동(야간통 없이도 — 위음성 축소)', () => {
    const r = evaluateRedFlags({ worseningOverTime: true, dailyActivityPain: true })
    expect(r.tripped).toBe(true)
    expect(r.reasons.join(' ')).toContain('피로골절')
  })
  it('고위험 골부위 의심이면 즉시 의뢰(§4)', () => {
    expect(evaluateRedFlags({ highRiskBoneSiteSuspected: true }).reasons.join(' ')).toContain('고위험 골부위')
  })
  it('RED-S 경계는 의뢰 경로(성별 위험가중 아님)', () => {
    expect(evaluateRedFlags({ redSConcern: true }).reasons.join(' ')).toContain('RED-S')
  })
})

describe('redFlagHypothesesForAreas (§1 부위별 의뢰 후보 — 코치리뷰 누락 보강)', () => {
  it('발바닥은 종골 피로골절·Baxter를 의뢰 후보로 반환', () => {
    const rf = redFlagHypothesesForAreas(['left-plantar-fascia']).map((h) => h.id)
    expect(rf).toContain('calcaneal-stress-fracture')
    expect(rf).toContain('baxter-nerve')
  })
  it('아킬레스는 파열 + 종골 피로골절을 의뢰 후보로 반환(§1 아킬레스 ③피로골절 누락 보강)', () => {
    const rf = redFlagHypothesesForAreas(['right-achilles']).map((h) => h.id)
    expect(rf).toContain('achilles-rupture')
    expect(rf).toContain('calcaneal-stress-fracture')
  })
  it('종아리는 DVT + 구획증후군(5P 응급)을 의뢰 후보로 반환(§1 종아리 ③구획 누락 보강)', () => {
    const rf = redFlagHypothesesForAreas(['left-calf']).map((h) => h.id)
    expect(rf).toContain('dvt')
    expect(rf).toContain('compartment-syndrome')
  })
  it('햄스트링은 근위 파열 + 좌골 응력골절·신경을 의뢰 후보로 반환(좌상은 제외 — overuse)', () => {
    const rf = redFlagHypothesesForAreas(['left-hamstring']).map((h) => h.id)
    expect(rf).toContain('proximal-hamstring-avulsion')
    expect(rf).toContain('ischial-stress-fracture-nerve')
    expect(rf).not.toContain('hamstring-strain')
  })
  it('고관절은 대퇴경부 피로골절 + OA, IT밴드는 외측 병리를 의뢰 후보로 반환(§1 누락 보강)', () => {
    expect(redFlagHypothesesForAreas(['left-hip']).map((h) => h.id)).toEqual(expect.arrayContaining(['femoral-neck-stress-fracture', 'hip-oa']))
    expect(redFlagHypothesesForAreas(['right-it-band']).map((h) => h.id)).toContain('lateral-knee-pathology')
  })
})
