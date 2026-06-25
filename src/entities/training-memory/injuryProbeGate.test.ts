import { describe, expect, it } from 'vitest'
import type { TrainingInjuryCheckIn, TrainingInjuryItem } from './model'
import { isInjuryProbeEligible, isInjuryReflaring } from './model'

const today = new Date('2026-06-25T00:00:00')

function daysAgo(n: number): string {
  const d = new Date(today.getTime() - n * 24 * 60 * 60 * 1000)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function checkIn(p: Partial<TrainingInjuryCheckIn>): TrainingInjuryCheckIn {
  return {
    id: 'ci', checkedAt: today.toISOString(), painLevel: null, areaPainLevels: [],
    worsenedDuringOrAfterRun: null, dailyActivityPain: null, readyForQualitySession: null,
    note: '', source: 'user_check_in', ...p
  }
}

// 게이트 함수는 status·lastFlareDate·checkInHistory 만 읽으므로 그 필드만 의미 있게 채운다(나머지 기본값).
function injury(p: Partial<TrainingInjuryItem>): TrainingInjuryItem {
  return {
    id: 'inj-1', title: '테스트 부상', area: '무릎', normalizedAreas: [],
    status: 'active', severity: 2, onsetDate: null, lastFlareDate: null, lastCheckedAt: null, resolvedAt: null,
    checkInHistory: [], notes: '', managementPlan: '', triggers: [], restrictions: [], returnToRunCriteria: '',
    strengthPlan: [], strengthPlanDetails: [], probeAnswers: undefined, subtypeResolved: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...p
  }
}

describe('isInjuryProbeEligible (#3 monitoring 프로브 게이트)', () => {
  it('active = 항상 자격 있음(급성기 감별 도구)', () => {
    expect(isInjuryProbeEligible(injury({ status: 'active' }), today)).toBe(true)
    // 재발 신호 없어도 active 면 띄운다.
    expect(isInjuryProbeEligible(injury({ status: 'active', lastFlareDate: null, checkInHistory: [] }), today)).toBe(true)
  })

  it('monitoring + 재발 신호 없음 = 자격 없음(좋아지는 중엔 노이즈라 멈춤)', () => {
    expect(isInjuryProbeEligible(injury({ status: 'monitoring' }), today)).toBe(false)
  })

  it('resolved / archived = 자격 없음', () => {
    expect(isInjuryProbeEligible(injury({ status: 'resolved' }), today)).toBe(false)
    expect(isInjuryProbeEligible(injury({ status: 'archived' }), today)).toBe(false)
  })

  it('monitoring + 최근 flare(≤14일) = 재발로 보고 재개', () => {
    expect(isInjuryProbeEligible(injury({ status: 'monitoring', lastFlareDate: daysAgo(5) }), today)).toBe(true)
  })

  it('monitoring + 오래된 flare(>14일) = 자격 없음', () => {
    expect(isInjuryProbeEligible(injury({ status: 'monitoring', lastFlareDate: daysAgo(40) }), today)).toBe(false)
  })

  it('monitoring + 최근 체크인 악화(worsenedDuringOrAfterRun) = 재개', () => {
    const inj = injury({ status: 'monitoring', checkInHistory: [checkIn({ worsenedDuringOrAfterRun: true })] })
    expect(isInjuryProbeEligible(inj, today)).toBe(true)
  })

  it('monitoring + 통증 반등(최근 > 직전) = 재개', () => {
    // checkInHistory[0]=최신. 최신 통증 4 > 직전 2 → 반등.
    const inj = injury({ status: 'monitoring', checkInHistory: [checkIn({ painLevel: 4 }), checkIn({ painLevel: 2 })] })
    expect(isInjuryProbeEligible(inj, today)).toBe(true)
  })

  it('monitoring + 통증 가라앉는 중(최근 ≤ 직전) = 자격 없음', () => {
    const inj = injury({ status: 'monitoring', checkInHistory: [checkIn({ painLevel: 2 }), checkIn({ painLevel: 4 })] })
    expect(isInjuryProbeEligible(inj, today)).toBe(false)
    expect(isInjuryReflaring(inj, today)).toBe(false)
  })
})

describe('isInjuryReflaring (#3 재발 신호)', () => {
  it('flare 가 미래 날짜면 무시(음수 daysAgo)', () => {
    expect(isInjuryReflaring(injury({ status: 'monitoring', lastFlareDate: daysAgo(-3) }), today)).toBe(false)
  })
  it('체크인 1건뿐이고 악화 표시 없으면 반등 아님(직전 비교 불가)', () => {
    expect(isInjuryReflaring(injury({ checkInHistory: [checkIn({ painLevel: 5 })] }), today)).toBe(false)
  })
})
