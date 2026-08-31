import { describe, expect, it } from 'vitest'
import type { TrainingGoal, TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'
import { defaultScheduledSessionPrescription, type ScheduledSession } from '@/entities/training-schedule/model'
import { buildSessionBriefing } from '@/shared/lib/coaching/sessionBriefing'

function session(overrides: Partial<ScheduledSession>): ScheduledSession {
  return {
    id: 's1', userId: 'u1', goalId: 'g1', date: '2026-02-10',
    phase: overrides.phase ?? 'Base',
    sessionType: overrides.sessionType ?? 'Easy + Strides',
    slot: overrides.slot ?? null,
    keySession: overrides.keySession ?? false,
    prescription: { ...defaultScheduledSessionPrescription(), distanceKm: 6, durationMin: 35, paceRange: '6:10~6:40/km', ...(overrides.prescription ?? {}) },
    status: 'planned', source: 'generator', runId: null,
    createdAt: '', updatedAt: ''
  }
}

const goal: TrainingGoal = {
  id: 'g1', title: '10K 서브50', category: 'race', startDate: null, targetDate: '2026-04-10',
  distanceKm: 10, targetDurationSec: 3000, priority: 1, status: 'active',
  successCriteria: '', strategyNotes: '', notes: '', createdAt: '', updatedAt: ''
}

function injury(overrides: Partial<TrainingInjuryItem>): TrainingInjuryItem {
  return {
    id: 'i1', title: '무릎', area: '무릎', normalizedAreas: [], status: 'active', severity: 2,
    onsetDate: null, lastFlareDate: null, lastCheckedAt: null, resolvedAt: null, checkInHistory: [],
    notes: '', managementPlan: '', triggers: [], restrictions: [], returnToRunCriteria: '',
    strengthPlan: [], strengthPlanDetails: [], createdAt: '', updatedAt: '', ...overrides
  }
}

const noChronic: ChronicLoadTrend = { status: 'stable', increasePct: 5, last30Km: 100, prev30Km: 95, spikeThreshold: 50, risingThreshold: 30 }

// execution 은 라이프사이클 BriefingStep[]. 텍스트 매칭/스트라이드 반복수 추출 헬퍼.
type Briefing = ReturnType<typeof buildSessionBriefing>
const execText = (b: Briefing) => b.execution.map((s) => `${s.label} ${s.detail}`).join(' ')
const strideDetail = (b: Briefing) => b.execution.find((s) => s.label === '스트라이드')?.detail ?? ''
const strideReps = (b: Briefing) => Number(strideDetail(b).match(/× (\d+)회/)?.[1] ?? 0)

describe('buildSessionBriefing', () => {
  it('Easy + Strides: 4요소(목표·효과·이행지침·근거) 채워짐', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), { goal, injury: null, chronic: noChronic })
    expect(b.goalLine).toContain('10K 서브50')
    expect(b.goalLine).toContain('기초기')
    expect(b.effect).toBeTruthy()
    expect(b.execution.length).toBeGreaterThanOrEqual(2)
    expect(b.execution.some((s) => s.label === '웜업')).toBe(true) // 라이프사이클: 웜업 단계 포함
    expect(b.execution.some((s) => s.label === '쿨다운')).toBe(true) // 쿨다운 단계 포함
    expect(b.execution.some((s) => s.label === '스트라이드')).toBe(true)
    expect(execText(b)).toContain('6:10~6:40/km')
    expect(b.evidence.length).toBeGreaterThan(0)
    expect(b.cautions).toEqual([])
  })

  it('세션 타입마다 효과·지침이 다르다(고정 문장 아님)', () => {
    const easy = buildSessionBriefing(session({ sessionType: 'Easy + Strides' }), { goal, injury: null, chronic: noChronic })
    const tempo = buildSessionBriefing(session({ sessionType: 'Tempo', keySession: true }), { goal, injury: null, chronic: noChronic })
    expect(easy.effect).not.toBe(tempo.effect)
    expect(easy.execution).not.toEqual(tempo.execution)
  })

  it('부상 severity 가 스트라이드 반복수를 산출 단계에서 감축(무릎 등 비전족)', () => {
    const reps = (inj: ReturnType<typeof injury> | null) =>
      strideReps(buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), { goal, injury: inj, chronic: noChronic }))
    const healthy = reps(null)
    const hurt = reps(injury({ severity: 3, area: '무릎' }))
    expect(hurt).toBeGreaterThan(0)
    expect(hurt).toBeLessThan(healthy) // 부상으로 반복수 감축
  })

  it('전족 부상(족저)이면 스트라이드를 보류로 산출', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), { goal, injury: injury({ severity: 2, area: '족저근막' }), chronic: noChronic })
    expect(b.execution.some((s) => s.detail.includes('보류'))).toBe(true)
    expect(b.execution.some((s) => /× \d+회/.test(s.detail))).toBe(false) // 반복수 처방 없음(보류)
  })

  it('적응 프로필 수행 게이트(ready)면 스트라이드 반복수 상향(blocked면 보수)', () => {
    const reps = (status: 'ready' | 'watch' | 'blocked') => {
      const profile = {
        progressionCriteria: [{ id: 'easy-hr-stability', label: '', status, evidence: '', action: '' }],
        tempoCeiling: { adoptedBpm: null, baseBpm: null, adoptedAt: null }
      } as unknown as import('@/entities/training-memory/model').AdaptiveTrainingProfile
      return strideReps(buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), { goal, injury: null, chronic: noChronic, adaptiveProfile: profile }))
    }
    expect(reps('ready')).toBeGreaterThan(reps('watch'))
    expect(reps('blocked')).toBeLessThan(reps('watch'))
  })

  it('라이브 수행 게이트(#336)를 우선 반영하고 그 근거를 노출(누적 수행 이력)', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), {
      goal,
      injury: null,
      chronic: noChronic,
      progression: [{ id: 'easy-hr-stability', status: 'ready', evidence: '최근 Easy 3회 모두 상한 이하 — 안정.' }]
    })
    // ready → 스트라이드 상향
    expect(strideReps(b)).toBeGreaterThan(0)
    // 근거(누적 수행 이력) 노출
    expect(b.execution.some((s) => s.label === '최근 수행' && s.detail.includes('Easy 3회'))).toBe(true)
  })

  it('라이브 progression 이 저장 프로필보다 우선', () => {
    const profile = {
      progressionCriteria: [{ id: 'easy-hr-stability', label: '', status: 'blocked', evidence: '', action: '' }],
      tempoCeiling: { adoptedBpm: null, baseBpm: null, adoptedAt: null }
    } as unknown as import('@/entities/training-memory/model').AdaptiveTrainingProfile
    const reps = (live: 'ready' | 'blocked') =>
      strideReps(
        buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), {
          goal, injury: null, chronic: noChronic, adaptiveProfile: profile,
          progression: [{ id: 'easy-hr-stability', status: live, evidence: 'x' }]
        })
      )
    expect(reps('ready')).toBeGreaterThan(reps('blocked')) // 저장은 blocked지만 라이브 ready가 우선
  })

  it('단계가 레이스에 가까울수록 스트라이드 반복수가 많다(산출)', () => {
    const reps = (phase: 'Base' | 'Race Specific') =>
      strideReps(buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase }), { goal, injury: null, chronic: noChronic }))
    expect(reps('Race Specific')).toBeGreaterThan(reps('Base'))
  })

  it('부하 급증이 조심할 점에 반영', () => {
    const spike: ChronicLoadTrend = { status: 'spike', increasePct: 55, last30Km: 150, prev30Km: 97, spikeThreshold: 50, risingThreshold: 30 }
    const b = buildSessionBriefing(session({ sessionType: 'Easy' }), { goal, injury: null, chronic: spike })
    expect(b.cautions.some((c) => c.includes('55%'))).toBe(true)
  })

  it('#354 정렬: Easy/Recovery 는 RPE 우선 프레임 + 근거', () => {
    for (const t of ['Easy', 'Recovery', 'Easy + Strides'] as const) {
      const b = buildSessionBriefing(session({ sessionType: t }), { goal, injury: null, chronic: noChronic })
      expect(b.execution.some((s) => s.detail.includes('RPE'))).toBe(true)
      expect(b.evidence.some((e) => e.method.includes('RPE'))).toBe(true)
    }
  })

  it('모든 세션 타입에 "오늘의 핵심"(keyPoint)이 상시 채워진다 (의도 없어도)', () => {
    const types = ['Easy', 'Recovery', 'Easy + Strides', 'Tempo', 'LSD', 'Steady Long', 'Race'] as const
    for (const t of types) {
      const b = buildSessionBriefing(session({ sessionType: t }), { goal, injury: null, chronic: noChronic })
      expect(b.keyPoint.length).toBeGreaterThan(5)
    }
    // 타입마다 핵심이 다르다(고정 문장 아님)
    const easy = buildSessionBriefing(session({ sessionType: 'Easy' }), { goal, injury: null, chronic: noChronic })
    const tempo = buildSessionBriefing(session({ sessionType: 'Tempo' }), { goal, injury: null, chronic: noChronic })
    expect(easy.keyPoint).not.toBe(tempo.keyPoint)
  })

  it('모든 세션 타입에 웜업→본(런/훈련)→쿨다운 라이프사이클이 기본 제공된다', () => {
    const types = ['Easy', 'Recovery', 'Easy + Strides', 'Tempo', 'LSD', 'Steady Long', 'Race'] as const
    for (const t of types) {
      const b = buildSessionBriefing(session({ sessionType: t, keySession: t === 'Tempo' || t === 'Race' }), { goal, injury: null, chronic: noChronic })
      const labels = b.execution.map((s) => s.label)
      expect(labels).toContain('웜업')
      expect(labels.some((l) => l === '본런' || l === '본훈련')).toBe(true)
      expect(labels).toContain('쿨다운')
    }
  })

  it('품질/한계시험 세션은 정식 웜업(조깅+드릴+스트라이드)을 처방한다', () => {
    for (const t of ['Tempo', 'Race'] as const) {
      const b = buildSessionBriefing(session({ sessionType: t, keySession: true }), { goal, injury: null, chronic: noChronic })
      const warmup = b.execution.find((s) => s.label === '웜업')?.detail ?? ''
      expect(warmup).toContain('드릴')
      expect(warmup).toContain('스트라이드')
    }
  })

  it('#354 정렬: LSD 세분화(Standard/Recovery/Progressive), Steady Long 효율·네거티브 보정', () => {
    const lsd = buildSessionBriefing(session({ sessionType: 'LSD', keySession: true }), { goal, injury: null, chronic: noChronic })
    expect(execText(lsd)).toContain('Standard LSD')
    expect(execText(lsd)).toContain('Progressive')
    const steady = buildSessionBriefing(session({ sessionType: 'Steady Long', keySession: true }), { goal, injury: null, chronic: noChronic })
    expect(execText(steady)).toContain('네거티브')
  })

  it('저강도 지문: 시간 우선 + 거리=가이드 + 페이스=결과(다중 타깃 혼란 방지)', () => {
    // 처방 distanceKm:6, durationMin:35, paceRange '6:10~6:40/km'
    const lsd = buildSessionBriefing(session({ sessionType: 'LSD', phase: 'Base' }), { goal, injury: null, chronic: noChronic })
    const main = lsd.execution.find((s) => s.label === '본훈련')?.detail ?? ''
    expect(main).toContain('35분 동안') // 시간(dose) 우선
    expect(main).toContain('거리는 약 6km 기준') // 거리는 가이드
    expect(main).toContain('목표가 아니라 결과') // 페이스 디엠퍼사이즈
    expect(main).toContain('숨·심박이 편한지를 먼저') // 강도(심박/RPE) 우선
    // Easy/Recovery 도 동일 프레이밍
    const easy = buildSessionBriefing(session({ sessionType: 'Easy' }), { goal, injury: null, chronic: noChronic })
    expect(easy.execution.find((s) => s.label === '본런')?.detail ?? '').toContain('35분 동안')
  })

  it('SessionIntent 흡수: 의도(why)·성공기준·타겟 한 카드로 (수락 결정 지원)', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy + Strides' }), {
      goal,
      injury: null,
      chronic: noChronic,
      intent: {
        why: '유산소 베이스가 약해 오늘 회복·기반을 다집니다.',
        successCriteria: ['평균심박 138~148', 'RPE 3~4'],
        targets: { hrCeilingBpm: 152, hrRange: [138, 148], rpeRange: [3, 4], paceHold: '일정 유지' }
      }
    })
    expect(b.why).toContain('유산소 베이스')
    expect(b.successCriteria).toContain('RPE 3~4')
    expect(b.targetsLine).toContain('심박 138~148')
    expect(b.targetsLine).toContain('RPE 3~4')
  })

  it('의도 없으면 why/성공기준 비고 카드가 깨지지 않는다(미래 슬라이드)', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Tempo', keySession: true }), { goal, injury: null, chronic: noChronic })
    expect(b.why).toBe('')
    expect(b.successCriteria).toEqual([])
    expect(b.targetsLine).toBe('')
  })

  it('Tempo 는 Daniels 근거가 붙는다', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Tempo', keySession: true }), { goal, injury: null, chronic: noChronic })
    expect(b.evidence.some((e) => e.method.includes('Daniels'))).toBe(true)
  })

  it('paceBasis(#405): Easy 계열만 페이스 근거 노출, 비-Easy(Tempo)는 빈값', () => {
    const easy = buildSessionBriefing(session({ sessionType: 'Easy' }), { goal, injury: null, chronic: noChronic, easyPaceBasis: '내 Easy 런 5건 기준' })
    expect(easy.paceBasis).toBe('내 Easy 런 5건 기준')
    const tempo = buildSessionBriefing(session({ sessionType: 'Tempo', keySession: true }), { goal, injury: null, chronic: noChronic, easyPaceBasis: '내 Easy 런 5건 기준' })
    expect(tempo.paceBasis).toBe('')
  })
})

describe('intent.why 부상 심각도 라이브 정합 (2026-07-04)', () => {
  it('스냅샷 문구의 통증 N/5 를 현재 severity 로 치환한다', () => {
    const b = buildSessionBriefing(session({ sessionType: 'LSD', keySession: true }), {
      goal,
      injury: injury({ severity: 1, status: 'active' }),
      chronic: noChronic,
      intent: {
        why: '우측 족저근막/발바닥 통증 2/5입니다. 강훈련 전 체크포인트로 통증 변화를 먼저 확인하세요. 활성 부상 2/5라 체크포인트를 권합니다.',
        successCriteria: [],
        targets: { hrCeilingBpm: null, hrRange: null, rpeRange: null, paceHold: '' }
      }
    })
    expect(b.why).toContain('통증 1/5')
    expect(b.why).toContain('부상 1/5')
    expect(b.why).not.toContain('2/5')
  })

  it('부상이 없거나 해소 상태면 문구를 건드리지 않는다', () => {
    const text = '통증 2/5 스냅샷 문구'
    const none = buildSessionBriefing(session({}), { goal, injury: null, chronic: noChronic, intent: { why: text, successCriteria: [], targets: { hrCeilingBpm: null, hrRange: null, rpeRange: null, paceHold: '' } } })
    expect(none.why).toBe(text)
    const resolved = buildSessionBriefing(session({}), {
      goal, injury: injury({ severity: 0, status: 'resolved' }), chronic: noChronic,
      intent: { why: text, successCriteria: [], targets: { hrCeilingBpm: null, hrRange: null, rpeRange: null, paceHold: '' } }
    })
    expect(resolved.why).toBe(text)
  })
})

// (#729) 뛸 시간대 기준 더위 안내. 핵심은 "숫자 한 줄"이 아니라 SSOT §외부 조건이 요구하는
// 세 가지를 지키는 것 — 심박 상한 불변 · 페이스는 낮춘다 · 품질 세션은 강등이 아니라 이동/연기.
describe('더위 조건 안내 (#729)', () => {
  const hot = { hour: 13, feltC: 33, humidity: 80, hot: true, better: { hour: 20, feltC: 27 }, allDayHot: false }
  const mild = { hour: 7, feltC: 24, humidity: 60, hot: false, better: null, allDayHot: false }
  const base = { goal, injury: null, chronic: noChronic }
  const cautions = (b: Briefing) => b.cautions.join(' ')

  it('안 더우면 아무 말도 안 붙는다(평상시 브리핑 오염 금지)', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy' }), { ...base, heat: mild })
    expect(cautions(b)).not.toContain('체감')
    const none = buildSessionBriefing(session({ sessionType: 'Easy' }), base)
    expect(cautions(none)).not.toContain('체감')
  })

  it('더우면 시각을 명시한다 — 하루 대푯값이 아니라 뛸 시간대 값이다', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy' }), { ...base, heat: hot })
    expect(cautions(b)).toContain('13시 기준 체감 33도')
    expect(cautions(b)).toContain('습도 80%')
  })

  it('Easy 계열: 페이스를 낮추라고 하고 판정 기준을 대화 가능 여부로 옮긴다(SSOT §154·§153)', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy' }), { ...base, heat: hot })
    expect(cautions(b)).toContain('페이스가 느려지는 건 정상')
    expect(cautions(b)).toContain('대화 가능 여부')
  })

  it('심박 상한을 올리라는 말은 절대 하지 않는다(SSOT §152)', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy' }), { ...base, heat: hot })
    for (const banned of ['상한을 올', '상한 상향', '상한을 높']) {
      expect(cautions(b)).not.toContain(banned)
    }
  })

  it('품질 세션(Tempo)은 Easy 로 둔갑시키지 않고 이동·연기를 명시한다(SSOT §157)', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Tempo', keySession: true }), { ...base, heat: hot })
    expect(cautions(b)).toContain('옮기거나 하루 미루')
    expect(cautions(b)).toContain('20시')
    // 처방 자체는 그대로 — 카드가 세션을 바꾸지 않는다.
    expect(b.keyPoint).toContain('편하게 힘든')
  })

  it('서늘한 대안이 없으면 시간대를 특정하지 않고 말한다', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Tempo' }), { ...base, heat: { ...hot, better: null } })
    expect(cautions(b)).toContain('서늘한 시간대로 옮기거나')
  })

  it('종일 더우면 시간 단축·실내를 제안한다 — 시간 이동으로 풀 문제가 아니다', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy' }), { ...base, heat: { ...hot, better: null, allDayHot: true } })
    expect(cautions(b)).toContain('시간을 줄이거나 실내')
  })

  it('안전 판정은 숫자가 아니라 증상이 한다 — 중단 신호를 항상 남긴다', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy' }), { ...base, heat: hot })
    expect(cautions(b)).toContain('어지럼')
  })

  it('부상 주의가 더위 안내보다 앞에 온다(안전 게이트 우선)', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy' }), {
      ...base,
      injury: injury({ severity: 3, status: 'active' }),
      heat: hot
    })
    const heatIndex = b.cautions.findIndex((line) => line.includes('체감'))
    expect(heatIndex).toBeGreaterThan(0)
  })
})
