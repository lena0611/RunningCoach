import { describe, expect, it } from 'vitest'
import { beginnerWalkRunStage, beginnerWalkRunSteps, C25K_TOTAL_RUNS } from '@/shared/lib/coaching/beginnerWalkRun'

const runs = (n: number, km = 2.5) => Array.from({ length: n }, () => ({ distanceKm: km }))

describe('beginnerWalkRunStage — Couch to 5K 단계 (#870)', () => {
  it('처음 뛰는 사람은 1주차 1회차(뛰기 1분 · 걷기 1분 30초)', () => {
    const stage = beginnerWalkRunStage(null, [])
    expect(stage).toMatchObject({ week: 1, run: 1, totalMin: 28.5 })
    expect(stage?.mainSet).toContain('뛰기 1분 → 걷기 1분 30초')
  })

  it('완료한 런 3회마다 다음 주차 — 5주차는 회차마다 다르다(3회차 = 연속 20분)', () => {
    expect(beginnerWalkRunStage(null, runs(3))).toMatchObject({ week: 2, run: 1 })
    expect(beginnerWalkRunStage(null, runs(14))).toMatchObject({ week: 5, run: 3, mainSet: '쉬지 않고 20분 뛰기' })
    expect(beginnerWalkRunStage(null, runs(26))).toMatchObject({ week: 9, run: 3, mainSet: '쉬지 않고 30분 뛰기' })
  })

  it('27회를 마치면 졸업 — 일반 이지 지침으로', () => {
    expect(beginnerWalkRunStage(null, runs(C25K_TOTAL_RUNS))).toBeNull()
  })

  it('5K 를 완주해 본 사람은 대상이 아니다 — 자기보고든 실제 런이든', () => {
    expect(beginnerWalkRunStage(5000, [])).toBeNull()
    expect(beginnerWalkRunStage(null, [{ distanceKm: 5.2 }])).toBeNull()
  })

  it('지침은 걷기 5분으로 시작·마무리하고, 기준은 시간·거리는 참고, 반복해도 된다고 말한다', () => {
    const steps = beginnerWalkRunSteps(beginnerWalkRunStage(null, [])!, 2.3)
    const text = steps.map((s) => `${s.label} ${s.detail}`).join(' ')
    expect(steps[0]).toEqual({ label: '웜업', detail: '빠르게 걷기 5분' })
    expect(steps[2]).toEqual({ label: '쿨다운', detail: '걷기 5분으로 마무리' })
    expect(text).toContain('약 29분')
    expect(text).toContain('거리(약 2.3km)는 참고만')
    expect(text).toContain('한 번 더 해도 괜찮아요')
  })
})
