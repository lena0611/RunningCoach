import { describe, expect, it } from 'vitest'
import type { TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'
import { buildRestGuidance, evaluateExtraRun } from '@/shared/lib/coaching/restGuidance'

const stable: ChronicLoadTrend = { status: 'stable', increasePct: 5, last30Km: 100, prev30Km: 95, spikeThreshold: 50, risingThreshold: 30 }

function injury(o: Partial<TrainingInjuryItem>): TrainingInjuryItem {
  return {
    id: 'i', title: '', area: o.area ?? '족저근막', normalizedAreas: [], status: o.status ?? 'active', severity: o.severity ?? 2,
    onsetDate: null, lastFlareDate: null, lastCheckedAt: null, resolvedAt: null, checkInHistory: [], notes: '',
    managementPlan: '', triggers: [], restrictions: [], returnToRunCriteria: o.returnToRunCriteria ?? '다음날 통증 없으면 복귀',
    strengthPlan: o.strengthPlan ?? ['종아리 레이즈 15회 x2', '발바닥 마사지'], strengthPlanDetails: [], createdAt: '', updatedAt: ''
  }
}

describe('buildRestGuidance', () => {
  it('휴식도 전략 — purpose·항목·근거 항상 제공(아무것도 안 함이 기본 아님)', () => {
    const g = buildRestGuidance(null, stable)
    expect(g.purpose).toBeTruthy()
    expect(g.items.length).toBeGreaterThan(0)
    expect(g.items.some((i) => i.includes('근력'))).toBe(true)
    expect(g.evidence.length).toBeGreaterThan(0)
  })

  it('활성 부상이면 재활/강화 + 복귀 기준 우선', () => {
    const g = buildRestGuidance(injury({ area: '족저근막', severity: 2 }), stable)
    expect(g.purpose).toContain('족저근막')
    expect(g.items.some((i) => i.includes('재활') || i.includes('강화'))).toBe(true)
    expect(g.items.some((i) => i.includes('복귀 기준'))).toBe(true)
  })

  it('부하 급증이면 완전 휴식 권장', () => {
    const spike: ChronicLoadTrend = { status: 'spike', increasePct: 55, last30Km: 150, prev30Km: 97, spikeThreshold: 50, risingThreshold: 30 }
    const g = buildRestGuidance(null, spike)
    expect(g.items.some((i) => i.includes('완전 휴식'))).toBe(true)
    expect(g.purpose).toContain('55%')
  })
})

describe('evaluateExtraRun (예정에 없던 추가 런 평가)', () => {
  it('가벼운 추가(Easy)+부하 안정+부상 없음 → 인정 톤(주의 아님)', () => {
    const e = evaluateExtraRun({ type: 'Easy' }, null, stable)
    expect(e.caution).toBe(false)
    expect(e.headline).toContain('추가 런')
  })

  it('고강도 추가(Tempo) → 회복 건너뜀 주의', () => {
    const e = evaluateExtraRun({ type: 'Tempo' }, null, stable)
    expect(e.caution).toBe(true)
    expect(e.note).toContain('회복')
  })

  it('부상 중 추가 런 → 통증 주의', () => {
    const e = evaluateExtraRun({ type: 'Easy' }, injury({ area: '족저근막', severity: 2 }), stable)
    expect(e.caution).toBe(true)
    expect(e.note).toContain('족저근막')
  })

  it('부하 급증 중 가벼운 추가도 주의', () => {
    const spike: ChronicLoadTrend = { status: 'spike', increasePct: 55, last30Km: 150, prev30Km: 97, spikeThreshold: 50, risingThreshold: 30 }
    expect(evaluateExtraRun({ type: 'Easy' }, null, spike).caution).toBe(true)
  })
})
