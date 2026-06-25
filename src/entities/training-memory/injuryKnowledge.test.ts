import { describe, expect, it } from 'vitest'
import {
  evaluateRedFlags,
  injuryAreaBase,
  injuryKnowledgeBase,
  injuryProbes,
  rankInjuryHypotheses,
  redFlagHypothesesForAreas,
  selectNextProbe,
  type InjuryDataSignals,
  type RedFlagSignals
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

  it('grill 답변(§2-B)이 사전순위를 역전한다 — 햄스트링 sprint-pop(좌상)이 PHT를 제침', () => {
    const noAnswer = rankInjuryHypotheses(['left-hamstring'])
    expect(noAnswer[0].hypothesis.id).toBe('pht') // 답 없으면 사전순위 1위 PHT
    const answered = rankInjuryHypotheses(['left-hamstring'], {}, { hamstring: 'sprint-pop' })
    expect(answered[0].hypothesis.id).toBe('hamstring-strain') // 답이 좌상을 상위로
    expect(answered[0].probeFavored).toBe(true)
  })

  it('이미 사전순위 1위를 지지하는 답은 그대로 top + probeFavored 표시', () => {
    const answered = rankInjuryHypotheses(['left-hamstring'], {}, { hamstring: 'ischial-sitting-uphill' })
    expect(answered[0].hypothesis.id).toBe('pht')
    expect(answered[0].probeFavored).toBe(true)
  })

  it('redFlag 자가검사 답(favors 없음)은 가중하지 않는다 — 순위 불변', () => {
    const base = rankInjuryHypotheses(['left-hamstring']).map((r) => r.hypothesis.id)
    const withRf = rankInjuryHypotheses(['left-hamstring'], {}, { hamstring: 'night-radiating' })
    expect(withRf.map((r) => r.hypothesis.id)).toEqual(base) // night-radiating 은 favors 없음 → 부스트 없음
    expect(withRf.every((r) => r.probeFavored === false)).toBe(true)
  })

  it('답변은 사전순위 1위를 지지하는 데이터가 있어도 상위로 올린다(답을 무시하지 않음)', () => {
    // groundUphill 은 PHT 전용 신호(좌상엔 없음): PHT = prior 1.0 + 0.6 = 1.6. 그래도 sprint-pop 좌상(0.5 + 1.5×0.9 = 1.85)이 상위.
    const ranked = rankInjuryHypotheses(['left-hamstring'], { groundUphill: true }, { hamstring: 'sprint-pop' })
    expect(ranked[0].hypothesis.id).toBe('hamstring-strain')
    // 비지지 PHT도 상위 1~2 동반 표시엔 남는다(점수 보존 — 동반 가능성).
    expect(ranked.map((r) => r.hypothesis.id)).toContain('pht')
  })
})

describe('rankInjuryHypotheses — 답변 likelihood 그라데이션(#522)', () => {
  // 답 부스트만 분리: 같은 부위면 priorScore·dataScore 가 동일하므로 (답변 점수 − 무답 점수) = PROBE_FAVOR_BOOST × favorWeight.
  const boost = (areaId: string, probeId: string, value: string, hypId: string) => {
    const base = rankInjuryHypotheses([areaId]).find((r) => r.hypothesis.id === hypId)!.score
    const answered = rankInjuryHypotheses([areaId], {}, { [probeId]: value }).find((r) => r.hypothesis.id === hypId)!.score
    return answered - base
  }

  it('favors 옵션은 모두 favorWeight 를 (0,1] 로 저작했다(완전성 — flat 가중 회귀 방지)', () => {
    for (const p of injuryProbes) {
      for (const o of p.options) {
        if (o.favors) {
          expect(typeof o.favorWeight).toBe('number')
          expect(o.favorWeight as number).toBeGreaterThan(0)
          expect(o.favorWeight as number).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('부스트 크기 = 최대부스트 × favorWeight — pathognomonic 답일수록 가설을 더 크게 올린다', () => {
    // ITBS '늘 같은 거리에서 켜짐'(favorWeight 0.9, pathognomonic) > 가자미근 '깊은 뻐근'(0.75, 덜 특이적).
    const itbs = boost('right-it-band', 'it-band', 'lateral-same-distance', 'itbs')
    const soleus = boost('left-calf', 'calf', 'soleus-deep', 'calf-strain')
    expect(itbs).toBeGreaterThan(0)
    expect(soleus).toBeGreaterThan(0)
    expect(itbs).toBeGreaterThan(soleus)
    // PROBE_FAVOR_BOOST 상수에 안 묶이게 favorWeight 비율로 검증(0.9 : 0.75).
    expect(itbs / soleus).toBeCloseTo(0.9 / 0.75, 5)
  })

  it('강한 답이라도 비지지 overuse 가설은 점수 보존으로 top-2 동반(단정 아님)', () => {
    // 햄스트링 sprint-pop(좌상, 0.9)을 골라도 PHT(비지지)는 사라지지 않고 동반된다.
    const ranked = rankInjuryHypotheses(['left-hamstring'], {}, { hamstring: 'sprint-pop' })
    expect(ranked[0].hypothesis.id).toBe('hamstring-strain')
    expect(ranked.map((r) => r.hypothesis.id)).toContain('pht')
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
  it('체중부하 곤란·관절 잠김/불안정은 단독으로 발동(아킬레스 파열·반월·근위파열 자가검사 경로)', () => {
    const r = evaluateRedFlags({ weightBearingFailureOrInstability: true })
    expect(r.tripped).toBe(true)
    expect(r.reasons.join(' ')).toContain('체중부하 곤란')
  })
})

describe('injuryProbes (§5 Phase C grill — §1 결정적 지문)', () => {
  // overuse 가설들이 다루는 8개 부위 base. 모든 프로브는 이 중 하나에 속해야 한다(고아 프로브 금지).
  const overuseBases = new Set(injuryKnowledgeBase.filter((h) => h.classification === 'overuse').flatMap((h) => h.areaBases))
  // evaluateRedFlags 가 처리하는 RedFlagSignals 키만 redFlagSelfTest 로 허용(게이트 정합).
  const RED_FLAG_KEYS = new Set<keyof RedFlagSignals>([
    'dailyActivityPain', 'nightOrRestPain', 'worseningOverTime', 'pointTenderOrHopPositive',
    'numbnessRadiatingWeakness', 'swellingRednessHeat', 'weightBearingFailureOrInstability',
    'redSConcern', 'highRiskBoneSiteSuspected', 'noImprovementWeeks'
  ])

  it('부위당 정확히 1 프로브, 8개 부위 base를 모두 덮는다', () => {
    expect(injuryProbes).toHaveLength(8)
    const ids = injuryProbes.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length) // 부위당 1개(중복 없음)
    for (const p of injuryProbes) expect(overuseBases.has(p.id)).toBe(true) // 고아 프로브 없음
  })

  it('모든 옵션은 label·value·response를 갖고, value는 프로브 안에서 유일', () => {
    for (const p of injuryProbes) {
      const values = p.options.map((o) => o.value)
      expect(new Set(values).size).toBe(values.length)
      for (const o of p.options) {
        expect(o.label.length).toBeGreaterThan(0)
        expect(o.value.length).toBeGreaterThan(0)
        expect(o.response.length).toBeGreaterThan(0)
      }
    }
  })

  it('subtype 옵션은 그 부위 가설의 subtypeSplit에 존재하는 아형이다', () => {
    for (const p of injuryProbes) {
      const subtypeIds = new Set(
        injuryKnowledgeBase
          .filter((h) => h.areaBases.includes(p.id))
          .flatMap((h) => h.subtypeSplit?.map((s) => s.id) ?? [])
      )
      for (const o of p.options) {
        if (o.subtype) expect(subtypeIds.has(o.subtype)).toBe(true)
      }
    }
  })

  it('favors 옵션은 그 부위의 과사용 가설을 가리킨다(red-flag 가설 아님)', () => {
    const overuseIds = new Set(injuryKnowledgeBase.filter((h) => h.classification === 'overuse').map((h) => h.id))
    for (const p of injuryProbes) {
      for (const o of p.options) {
        if (o.favors) expect(overuseIds.has(o.favors)).toBe(true)
      }
    }
  })

  it('redFlagSelfTest 키는 모두 evaluateRedFlags가 아는 키이고, worseningOverTime 외엔 단독으로 게이트를 켠다', () => {
    for (const p of injuryProbes) {
      for (const o of p.options) {
        for (const key of o.redFlagSelfTest ?? []) {
          expect(RED_FLAG_KEYS.has(key)).toBe(true)
          // worseningOverTime 은 의도적으로 단독 비발동(조합 신호) — 그 외 자가검사는 단독으로 의뢰 경로를 켜야 한다.
          if (key !== 'worseningOverTime') {
            expect(evaluateRedFlags({ [key]: true }).tripped).toBe(true)
          }
        }
      }
    }
  })

  it('정강이 프로브가 §1 4후보(MTSS·피로골절·고위험골·구획증후군)를 모두 가른다', () => {
    const shin = injuryProbes.find((p) => p.id === 'shin')!
    const values = shin.options.map((o) => o.value)
    expect(values).toContain('medial-diffuse') // MTSS
    expect(values).toContain('focal-hop-positive') // 피로골절
    expect(values).toContain('anterior-tibia') // 고위험 골부위
    expect(values).toContain('exertional-tightness-numbness') // 구획증후군(§1 ③)
  })

  it("햄스트링 야간·방사는 신경 + 골(야간통) 두 경로를 함께 escalate", () => {
    const hs = injuryProbes.find((p) => p.id === 'hamstring')!
    const night = hs.options.find((o) => o.value === 'night-radiating')!
    expect(night.redFlagSelfTest).toEqual(expect.arrayContaining(['numbnessRadiatingWeakness', 'nightOrRestPain']))
  })
})

describe('selectNextProbe (§5 한 세션 1문항)', () => {
  it('선택 부위의 미답 프로브를 반환한다', () => {
    expect(selectNextProbe(['left-knee'])?.id).toBe('knee')
    expect(selectNextProbe(['right-plantar-fascia'])?.id).toBe('plantar-fascia')
  })
  it('이미 답한 프로브는 건너뛴다 → 모두 답했으면 null', () => {
    expect(selectNextProbe(['left-knee'], ['knee'])).toBeNull()
  })
  it('여러 부위면 첫 미답 부위 프로브, 그걸 답하면 다음 부위로', () => {
    // injuryProbes 순서상 shin 이 it-band 보다 앞 → 둘 다 미답이면 shin.
    const first = selectNextProbe(['left-it-band', 'right-shin'])
    expect(first?.id).toBe('shin')
    const next = selectNextProbe(['left-it-band', 'right-shin'], ['shin'])
    expect(next?.id).toBe('it-band')
  })
  it('스코프 밖 부위(ankle/lower-back)는 프로브 없음 → null', () => {
    expect(selectNextProbe(['left-ankle'])).toBeNull()
    expect(selectNextProbe(['lower-back'])).toBeNull()
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
