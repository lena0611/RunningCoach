import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'
import { collectCoachMoments, type CoachMomentContext } from '@/shared/lib/coaching/coachMoments'

const today = new Date('2026-06-17T00:00:00')
const stable: ChronicLoadTrend = { status: 'stable', increasePct: 5, last30Km: 100, prev30Km: 95, spikeThreshold: 50, risingThreshold: 30 }
const spike: ChronicLoadTrend = { status: 'spike', increasePct: 55, last30Km: 150, prev30Km: 97, spikeThreshold: 50, risingThreshold: 30 }

function run(id: string, date: string, km: number): RunLog {
  return { id, date, distanceKm: km } as unknown as RunLog
}
function injury(o: Partial<TrainingInjuryItem>): TrainingInjuryItem {
  return { id: 'i', ...o, area: o.area ?? '무릎', status: o.status ?? 'active', severity: o.severity ?? 3 } as unknown as TrainingInjuryItem
}
function ctx(over: Partial<CoachMomentContext>): CoachMomentContext {
  return { runs: [], attributedRunIds: new Set(), chronic: stable, injury: null, today, scheduleExists: true, ...over }
}

const extraRuns = [run('e1', '2026-06-16', 6), run('e2', '2026-06-12', 7), run('e3', '2026-06-08', 6)]

describe('collectCoachMoments', () => {
  it('아무 신호 없으면 빈 배열', () => {
    expect(collectCoachMoments(ctx({}))).toEqual([])
  })

  it('추가런 패턴이면 extra-run 모먼트(의도 질문 포함)', () => {
    const moments = collectCoachMoments(ctx({ runs: extraRuns }))
    const extra = moments.find((m) => m.kind === 'extra-run')
    expect(extra).toBeTruthy()
    expect(extra!.options?.length).toBeGreaterThan(0)
    expect(extra!.options!.some((o) => o.sentiment === 'positive')).toBe(true)
  })

  it('부하>추가런 우선순위로 정렬 — 정적 부상 고지는 카드와 중복이라 모먼트 제외', () => {
    const moments = collectCoachMoments(
      ctx({ runs: extraRuns, chronic: spike, injury: injury({ severity: 4 }) })
    )
    expect(moments.map((m) => m.kind)).toEqual(['load-spike', 'extra-run'])
    expect(moments.some((m) => m.kind === 'injury')).toBe(false)
  })

  it('이탈(놓침)이면 deviation 모먼트', () => {
    const moments = collectCoachMoments(ctx({ deviation: { shouldRealign: true, reason: '핵심 세션 2개를 놓쳤어요.', missedCount: 2 } }))
    expect(moments.some((m) => m.kind === 'deviation')).toBe(true)
  })

  it('최근 한계 시험(TT)이면 time-trial 모먼트 + 승급 연결(#411)', () => {
    const eligible = collectCoachMoments(ctx({ timeTrialResult: { daysAgo: 1, nextClassLabel: '골드', gatePercent: 100, eligible: true } }))
    const m = eligible.find((x) => x.kind === 'time-trial')
    expect(m).toBeTruthy()
    expect(m!.message).toContain('골드 승급 도전 자격')
    // 오래된 TT(3일 초과)는 노출 안 함
    expect(collectCoachMoments(ctx({ timeTrialResult: { daysAgo: 5, nextClassLabel: '골드', gatePercent: 90, eligible: false } })).some((x) => x.kind === 'time-trial')).toBe(false)
  })

  it('목표가 무리면 goal-feasibility 경고(#395), feasible이면 없음', () => {
    const warn = collectCoachMoments(ctx({ goalFeasibility: { feasible: false, message: '매주 약 40%씩 늘려야 해요 — 목표일을 미루는 걸 권해요.' } }))
    expect(warn.some((m) => m.kind === 'goal-feasibility')).toBe(true)
    const ok = collectCoachMoments(ctx({ goalFeasibility: { feasible: true, message: null } }))
    expect(ok.some((m) => m.kind === 'goal-feasibility')).toBe(false)
  })

  it('준비도 충분이면 긍정 격려(goal-progress)', () => {
    const moments = collectCoachMoments(ctx({ goalProgress: { readinessScore: 82, readinessLevel: '충분', dDayText: 'D-30' } }))
    const g = moments.find((m) => m.kind === 'goal-progress')
    expect(g).toBeTruthy()
    expect(g!.message).toContain('82%')
  })

  it('준비도 부족/보통이면 격려 안 함(부상·부하 감지기가 담당)', () => {
    expect(collectCoachMoments(ctx({ goalProgress: { readinessScore: 40, readinessLevel: '부족', dDayText: '' } }))).toEqual([])
  })

  it('스케줄이 없으면 추가런 분류 안 함(무계획이면 비교 대상 없음)', () => {
    const moments = collectCoachMoments(ctx({ runs: extraRuns, scheduleExists: false }))
    expect(moments.some((m) => m.kind === 'extra-run')).toBe(false)
  })

  it('전체 우선순위: 부하>이탈>추가런>목표진척 (정적 부상 고지 모먼트 제외)', () => {
    const moments = collectCoachMoments(
      ctx({
        runs: extraRuns,
        chronic: spike,
        injury: injury({ severity: 4 }),
        deviation: { shouldRealign: true, reason: 'x', missedCount: 3 },
        goalProgress: { readinessScore: 80, readinessLevel: '충분', dDayText: '' }
      })
    )
    expect(moments.map((m) => m.kind)).toEqual(['load-spike', 'deviation', 'extra-run', 'goal-progress'])
  })

  it('러닝부하 부위(발/다리) 통증이 최근 런에 있고 활성부상 없으면 부상 체크인 제안', () => {
    const runs = [{ id: 'p', date: '2026-06-16', distanceKm: 6, painNote: '통증 보통 · 다리' } as unknown as RunLog]
    const m = collectCoachMoments(ctx({ runs })).find((x) => x.kind === 'pain-followup')
    expect(m).toBeTruthy()
    expect(m!.action?.kind).toBe('open-injury-screening')
  })

  it('상체 통증은 러닝 플랜 비차단 — 부상 제안 안 함', () => {
    const runs = [{ id: 'u', date: '2026-06-16', distanceKm: 6, painNote: '통증 경미 · 상체' } as unknown as RunLog]
    expect(collectCoachMoments(ctx({ runs })).some((x) => x.kind === 'pain-followup')).toBe(false)
  })

  it('이미 활성 부상이 있으면 pain-followup 안 함(전용 체크인이 담당)', () => {
    const runs = [{ id: 'p', date: '2026-06-16', distanceKm: 6, painNote: '통증 보통 · 발' } as unknown as RunLog]
    expect(collectCoachMoments(ctx({ runs, injury: injury({ severity: 2 }) })).some((x) => x.kind === 'pain-followup')).toBe(false)
  })

  // === RRI 운영 정의: 지속 통증 = "진짜 부상" 패턴(3.4) ===
  const painRun = (id: string, date: string) =>
    ({ id, date, distanceKm: 6, painNote: '통증 보통 · 발' }) as unknown as RunLog

  it('단발 통증은 "뻐근함" 톤(priority 65, 진단 문구 없음)', () => {
    const m = collectCoachMoments(ctx({ runs: [painRun('p', '2026-06-16')] })).find((x) => x.kind === 'pain-followup')
    expect(m).toBeTruthy()
    expect(m!.priority).toBe(65)
    expect(m!.message).not.toContain('진단이 아니라')
  })

  it('≥3연속 세션 통증이면 "진짜 부상" 패턴으로 escalate(priority 78·등록+보수화·진단 아님 단서)', () => {
    const runs = [painRun('p1', '2026-06-16'), painRun('p2', '2026-06-14'), painRun('p3', '2026-06-12')]
    const m = collectCoachMoments(ctx({ runs })).find((x) => x.kind === 'pain-followup')
    expect(m).toBeTruthy()
    expect(m!.priority).toBe(78)
    expect(m!.message).toContain('연속 3회')
    expect(m!.message).toContain('진단이 아니라')
    expect(m!.action?.kind).toBe('open-injury-screening')
  })

  it('≥7일 지속(2세션, 8일 간격)도 persistent로 escalate', () => {
    const runs = [painRun('p1', '2026-06-16'), painRun('p2', '2026-06-08')]
    const m = collectCoachMoments(ctx({ runs })).find((x) => x.kind === 'pain-followup')
    expect(m!.priority).toBe(78)
    expect(m!.message).toContain('8일째')
  })

  it('중간에 통증 없는 러닝이 끼면 스트릭이 끊겨 단발로 본다(회복 신호)', () => {
    const runs = [
      painRun('p1', '2026-06-16'),
      { id: 'ok', date: '2026-06-14', distanceKm: 6, painNote: null } as unknown as RunLog,
      painRun('p3', '2026-06-10')
    ]
    const m = collectCoachMoments(ctx({ runs })).find((x) => x.kind === 'pain-followup')
    expect(m!.priority).toBe(65)
  })

  it('통증 런이 트리거 창(3일) 밖이면 모먼트 미발동(스테일)', () => {
    const runs = [painRun('p1', '2026-06-10'), painRun('p2', '2026-06-08')]
    expect(collectCoachMoments(ctx({ runs })).some((x) => x.kind === 'pain-followup')).toBe(false)
  })

  // === 장기 부상 escalation(3.5) ===
  it('활성 부상이 >10주(70일) 이어지면 전문가 평가 권유(injury-escalation)', () => {
    const m = collectCoachMoments(ctx({ injury: injury({ status: 'active', onsetDate: '2026-03-01' }) })).find(
      (x) => x.kind === 'injury-escalation'
    )
    expect(m).toBeTruthy()
    expect(m!.message).toContain('전문가')
    expect(m!.message).toContain('진단이 아니라')
  })

  it('부상 지속이 10주 미만이면 escalation 안 함', () => {
    expect(
      collectCoachMoments(ctx({ injury: injury({ status: 'active', onsetDate: '2026-06-01' }) })).some(
        (x) => x.kind === 'injury-escalation'
      )
    ).toBe(false)
  })

  it('onsetDate 없으면 createdAt(등록일)로 지속 기간을 보수 추정', () => {
    const m = collectCoachMoments(
      ctx({ injury: injury({ status: 'monitoring', onsetDate: null, createdAt: '2026-03-01T09:00:00.000Z' }) })
    ).find((x) => x.kind === 'injury-escalation')
    expect(m).toBeTruthy()
  })

  it('재발(resolved 이력+재활성)이면 옛 onset이 아니라 resolvedAt 기준 — 과대 의뢰 방지(§3.5 연속 지속)', () => {
    // 최초 발병은 ~7개월 전이지만 한 번 해소(2주 전)됐다가 최근 재발 → 현재 에피소드는 짧다 → escalation 미발동.
    const reflare = injury({ status: 'active', onsetDate: '2025-11-20', resolvedAt: '2026-06-03' })
    expect(collectCoachMoments(ctx({ injury: reflare })).some((x) => x.kind === 'injury-escalation')).toBe(false)
    // resolvedAt 자체가 70일을 넘으면(=재발 후에도 오래 지속) escalation 발동.
    const longReflare = injury({ status: 'active', onsetDate: '2025-11-20', resolvedAt: '2026-02-01' })
    expect(collectCoachMoments(ctx({ injury: longReflare })).some((x) => x.kind === 'injury-escalation')).toBe(true)
  })

  it('escalation은 휴식 중에도 억제되지 않는다(안전 신호)', () => {
    const moments = collectCoachMoments(
      ctx({ injury: injury({ status: 'active', onsetDate: '2026-03-01' }), rest: restActive({ reason: 'injury' }) })
    )
    expect(moments.some((m) => m.kind === 'injury-escalation')).toBe(true)
  })

  it('dismissed 키는 제외', () => {
    const moments = collectCoachMoments(ctx({ runs: extraRuns, chronic: spike }), new Set(['load-spike']))
    expect(moments.some((m) => m.kind === 'load-spike')).toBe(false)
    expect(moments.some((m) => m.kind === 'extra-run')).toBe(true)
  })

  it('더블 제안 신호가 주입되면 double-suggest 모먼트(추가 행동 포함, #455)', () => {
    const m = collectCoachMoments(ctx({ doubleSuggestion: { backlogLabel: '월요일 Easy', amDayLabel: '오늘 Tempo' } })).find((x) => x.kind === 'double-suggest')
    expect(m).toBeTruthy()
    expect(m!.message).toContain('월요일 Easy')
    expect(m!.message).toContain('오늘 Tempo')
    expect(m!.action?.kind).toBe('open-doubles-add')
  })

  it('더블 제안 신호가 없으면 double-suggest 비노출', () => {
    expect(collectCoachMoments(ctx({})).some((m) => m.kind === 'double-suggest')).toBe(false)
  })

  // === 휴식/복귀 코치 보이스(#473 PR3) ===
  const restActive = (over: Partial<NonNullable<CoachMomentContext['rest']>> = {}) => ({
    active: true,
    reason: 'weather' as const,
    daysUntilReturn: 5,
    justDeclared: false,
    offerRecoveryRun: false,
    isOver: false,
    durationDays: 7,
    windowKey: '2026-06-20',
    ...over
  })
  /** 자연만료 복귀 창(#725): active=false + isOver — 메타는 복귀일+2일까지 살아 있다. */
  const restReturned = (over: Partial<NonNullable<CoachMomentContext['rest']>> = {}) =>
    restActive({ active: false, isOver: true, daysUntilReturn: 0, ...over })

  it('휴식 중이면 닦달성 모먼트(이탈·트리아지·부하·추가런) 전면 억제 — 지속 휴식 응원은 "쉬는 중" 배너가 담당하므로 상단 모먼트는 없음', () => {
    const moments = collectCoachMoments(
      ctx({
        runs: extraRuns,
        chronic: spike,
        deviation: { shouldRealign: true, reason: '놓침', missedCount: 3 },
        weekendTriage: { saveLabel: 'Long Run', releaseCount: 2 },
        rest: restActive()
      })
    )
    expect(moments).toEqual([])
  })

  it('휴식 중(선언 직후·회복주 미제시) 중증 부상이어도 상단 모먼트는 안 띄운다 — 부상 안전은 "부상 기준" 카드, 휴식 응원은 배너가 담당(중복 제거)', () => {
    const moments = collectCoachMoments(
      ctx({ injury: injury({ severity: 4 }), rest: restActive({ reason: 'weather', justDeclared: true, offerRecoveryRun: false }) })
    )
    // 정적 부상 고지·지속 휴식 응원은 전용 카드/배너가 담당 → 모먼트로 중복 노출하지 않는다(안전 정보는 카드에 그대로).
    expect(moments).toEqual([])
  })

  it('rest-support: 선언 직후 + 회복주 제시 적격이면 "가벼운 회복주" 1회 제시(옵션)', () => {
    const m = collectCoachMoments(ctx({ rest: restActive({ reason: 'weather', justDeclared: true, offerRecoveryRun: true }) }))[0]
    expect(m.kind).toBe('rest-support')
    expect(m.options?.length).toBe(2)
    expect(m.options!.some((o) => o.label.includes('회복주'))).toBe(true)
    expect(m.options!.some((o) => o.sentiment === 'neutral')).toBe(true) // "완전히 쉴래요" 존중
  })

  it('rest-support: 회복주 미제시면 선언 직후라도 모먼트 없음 — 지속 응원은 "쉬는 중" 배너가 담당', () => {
    const moments = collectCoachMoments(ctx({ rest: restActive({ justDeclared: true, offerRecoveryRun: false }) }))
    expect(moments.some((m) => m.kind === 'rest-support')).toBe(false)
  })

  it('rest-support: 부상 회복주 응답은 walk-run(걷기-뛰기) 톤(SSOT §3-B)', () => {
    const m = collectCoachMoments(
      ctx({ injury: injury({ severity: 2 }), rest: restActive({ reason: 'injury', justDeclared: true, offerRecoveryRun: true }) })
    ).find((x) => x.kind === 'rest-support')
    expect(m!.options?.length).toBe(2)
    const accept = m!.options!.find((o) => o.sentiment === 'positive')
    expect(accept!.response).toContain('걷기')
  })

  it('rest-support: 통제 휴식(날씨/개인) 회복주 응답은 연속 회복주(걷기-뛰기 아님)', () => {
    const m = collectCoachMoments(ctx({ rest: restActive({ reason: 'weather', justDeclared: true, offerRecoveryRun: true }) })).find(
      (x) => x.kind === 'rest-support'
    )
    const accept = m!.options!.find((o) => o.sentiment === 'positive')
    expect(accept!.response).toContain('20~30분')
    expect(accept!.response).not.toContain('걷기-뛰기')
  })

  it('rest-support: 선언 직후가 아니면(지속 휴식) 상단 모먼트 없음 — 배너가 담당', () => {
    const moments = collectCoachMoments(ctx({ rest: restActive({ justDeclared: false }) }))
    expect(moments.some((m) => m.kind === 'rest-support')).toBe(false)
  })

  // === 자연만료 복귀 인사 + 복귀 확인(#725) ===
  // 지금까지 자연만료 복귀는 사용자에게 아무 말도 안 했다(환영 토스트는 명시 '지금 복귀' 전용,
  // '쉬는 중' 배너는 만료 즉시 사라짐) — 어느 날 그냥 훈련이 다시 깔려 있었다.

  it('휴식이 끝나면 환영 + 복귀 확인 모먼트를 띄운다', () => {
    const m = collectCoachMoments(ctx({ rest: restReturned() })).find((x) => x.kind === 'rest-return')
    expect(m).toBeTruthy()
    expect(m!.message).toContain('돌아온 걸 환영')
    expect(m!.options?.[0]?.label).toContain('다시 시작')
    expect(m!.action?.kind).toBe('open-rest-extend')
  })

  it('놓침 프레이밍 금지(SSOT §휴식과 복귀) — 결손 어휘를 쓰지 않는다', () => {
    const m = collectCoachMoments(ctx({ rest: restReturned() })).find((x) => x.kind === 'rest-return')!
    for (const banned of ['놓친', '놓쳐', '밀린', '결손', '못 한 훈련']) {
      expect(m.message).not.toContain(banned)
    }
    expect(m.message).toContain('일정은 정리해뒀어요')
  })

  it('휴식 중(active)엔 복귀 모먼트가 안 뜬다 — 아직 쉬는 중이다', () => {
    const moments = collectCoachMoments(ctx({ rest: restActive() }))
    expect(moments.some((m) => m.kind === 'rest-return')).toBe(false)
  })

  it('4주 초과 공백이면 목표 재점검을 덧붙인다(SSOT §85 디트레이닝 경계)', () => {
    const long = collectCoachMoments(ctx({ rest: restReturned({ durationDays: 35 }) })).find((x) => x.kind === 'rest-return')!
    expect(long.message).toContain('목표 일정도 한 번 같이 점검')
    const short = collectCoachMoments(ctx({ rest: restReturned({ durationDays: 10 }) })).find((x) => x.kind === 'rest-return')!
    expect(short.message).not.toContain('목표 일정도')
  })

  it('모먼트 키가 휴식 창마다 달라진다 — 고정 키면 dismiss 쿨다운(7일)에 다음 복귀 인사가 먹힌다', () => {
    const first = collectCoachMoments(ctx({ rest: restReturned({ windowKey: '2026-06-20' }) })).find((x) => x.kind === 'rest-return')!
    const second = collectCoachMoments(ctx({ rest: restReturned({ windowKey: '2026-07-30' }) })).find((x) => x.kind === 'rest-return')!
    expect(first.key).not.toBe(second.key)
    // 이전 창을 닫아둬도 새 창의 인사는 살아 있다.
    const after = collectCoachMoments(ctx({ rest: restReturned({ windowKey: '2026-07-30' }) }), new Set([first.key]))
    expect(after.some((m) => m.kind === 'rest-return')).toBe(true)
  })

  // === 복귀 중 볼륨 급증 경고 억제(#743) ===
  // 2026-09-02 실사고: 부상으로 쉬고 복귀 중인데 "최근 30일 누적 182% 급증, 회복 주간을 넣으세요"가
  // 떴다. 기준선(직전 30일)이 공백에 눌린 **비율 인공물**인데 그걸 급증으로 읽은 것 —
  // 부상으로 쉬고 돌아온 사람에게 다시 쉬라는 말이 된다. SSOT §휴식과 복귀가 명시적으로 경계한다.

  it('공백 뒤 복귀 중이면 볼륨 급증 경고를 띄우지 않는다', () => {
    const moments = collectCoachMoments(ctx({ chronic: spike, chronicBaselineAfterLayoff: true }))
    expect(moments.some((m) => m.kind === 'load-spike')).toBe(false)
  })

  it('공백이 없으면 급증 경고는 그대로 뜬다 — 진짜 과부하까지 덮지 않는다', () => {
    const moments = collectCoachMoments(ctx({ chronic: spike }))
    expect(moments.some((m) => m.kind === 'load-spike')).toBe(true)
    const withFlagFalse = collectCoachMoments(ctx({ chronic: spike, chronicBaselineAfterLayoff: false }))
    expect(withFlagFalse.some((m) => m.kind === 'load-spike')).toBe(true)
  })

  it('억제는 급증 경고 한정 — 다른 모먼트는 공백과 무관하게 판정된다', () => {
    const moments = collectCoachMoments(ctx({ runs: extraRuns, chronic: spike, chronicBaselineAfterLayoff: true }))
    expect(moments.some((m) => m.kind === 'load-spike')).toBe(false)
    expect(moments.some((m) => m.kind === 'extra-run')).toBe(true)
  })

  // === 부상 악화 → 휴식 재권유(#727) ===
  // 사용자가 심각도를 올린 건 "본인이 악화를 보고한 것"인데, 지금까진 처방만 조용히 낮아지고
  // 코치는 아무 말도 안 했다. 특히 복귀 직후 다시 아파진 경우에 "좀 더 쉬자"를 말할 입이 없었다.
  const worsened = (over: Partial<NonNullable<CoachMomentContext['injuryWorsened']>> = {}) => ({
    severity: 4,
    from: 2,
    areaLabel: '발바닥',
    daysSinceRaised: 0,
    stampKey: '2026-06-20T01:00:00.000Z',
    ...over
  })

  it('심각도가 4로 오르면 휴식 재권유 모먼트를 띄운다(SSOT §91 통증 4~5 경계)', () => {
    const m = collectCoachMoments(ctx({ injuryWorsened: worsened() })).find((x) => x.kind === 'injury-worsened')
    expect(m).toBeTruthy()
    expect(m!.message).toContain('발바닥')
    expect(m!.message).toContain('2 → 4/5')
    expect(m!.action?.kind).toBe('open-rest-for-injury')
  })

  it('3 이하는 휴식까지 권하지 않는다 — 처방 게이트(강도 하향)가 이미 다루는 구간', () => {
    const moments = collectCoachMoments(ctx({ injuryWorsened: worsened({ severity: 3, from: 2 }) }))
    expect(moments.some((m) => m.kind === 'injury-worsened')).toBe(false)
  })

  it('5/5 면 전문가 평가도 함께 권한다(부상 KB §4 의뢰 구간)', () => {
    const m = collectCoachMoments(ctx({ injuryWorsened: worsened({ severity: 5 }) })).find((x) => x.kind === 'injury-worsened')!
    expect(m.message).toContain('전문가 평가')
  })

  it('이미 쉬는 중이면 발동하지 않는다 — 쉬는 사람에게 쉬라는 건 조언이 아니다', () => {
    const moments = collectCoachMoments(ctx({ injuryWorsened: worsened(), rest: restActive() }))
    expect(moments.some((m) => m.kind === 'injury-worsened')).toBe(false)
  })

  it('오래된 악화(3일 초과)는 발동하지 않는다 — 신선한 신호만', () => {
    const moments = collectCoachMoments(ctx({ injuryWorsened: worsened({ daysSinceRaised: 5 }) }))
    expect(moments.some((m) => m.kind === 'injury-worsened')).toBe(false)
  })

  it('악화할 때마다 다시 묻는다 — 도장이 다르면 키가 다르다(쿨다운 회피)', () => {
    const a = collectCoachMoments(ctx({ injuryWorsened: worsened({ stampKey: 'A' }) })).find((x) => x.kind === 'injury-worsened')!
    const b = collectCoachMoments(ctx({ injuryWorsened: worsened({ stampKey: 'B' }) }), new Set([a.key])).find(
      (x) => x.kind === 'injury-worsened'
    )
    expect(b).toBeTruthy()
    expect(b!.key).not.toBe(a.key)
  })

  // === 부상 감별 grill 프로브(§5 Phase C) ===
  const painProbe = (): NonNullable<CoachMomentContext['painProbe']> => ({
    injuryItemId: 'i',
    probeId: 'achilles',
    question: '아킬레스 통증, 어디에 가장 가까워요?',
    options: [
      { label: '힘줄 가운데', response: '중간부 패턴 가능성', sentiment: 'neutral', value: 'mid-portion', subtype: 'mid-portion' },
      { label: "'뚝' 뒤로 못 섬", response: '응급 — 평가 권유', sentiment: 'caution', value: 'pop-cannot-stand' }
    ]
  })

  it('활성 부상 + 미답 프로브면 pain-probe 모먼트(의도 질문)를 띄운다', () => {
    const m = collectCoachMoments(ctx({ injury: injury({ status: 'active' }), painProbe: painProbe() })).find((x) => x.kind === 'pain-probe')
    expect(m).toBeTruthy()
    expect(m!.message).toContain('아킬레스')
    expect(m!.options?.length).toBe(2)
  })

  it('프로브 옵션은 영속 페이로드(injuryItemId·probeId·value·subtype)를 싣는다', () => {
    const m = collectCoachMoments(ctx({ injury: injury({ status: 'active' }), painProbe: painProbe() })).find((x) => x.kind === 'pain-probe')!
    const mid = m.options!.find((o) => o.probe?.value === 'mid-portion')!
    expect(mid.probe).toEqual({ injuryItemId: 'i', probeId: 'achilles', value: 'mid-portion', subtype: 'mid-portion' })
    const pop = m.options!.find((o) => o.probe?.value === 'pop-cannot-stand')!
    expect(pop.probe!.subtype).toBeUndefined() // 아형 없는 red-flag 옵션
  })

  it('painProbe가 없으면 pain-probe 모먼트 없음', () => {
    expect(collectCoachMoments(ctx({ injury: injury({ status: 'active' }) })).some((x) => x.kind === 'pain-probe')).toBe(false)
  })

  it('부하 경고(load-spike 70)가 pain-probe(68)보다 우선 정렬', () => {
    const moments = collectCoachMoments(ctx({ injury: injury({ status: 'active' }), chronic: spike, painProbe: painProbe() }))
    const kinds = moments.map((m) => m.kind)
    expect(kinds.indexOf('load-spike')).toBeLessThan(kinds.indexOf('pain-probe'))
  })

  it('휴식 중에도 pain-probe는 억제되지 않는다(닦달 아니라 "왜 아픈지" 이해)', () => {
    const moments = collectCoachMoments(
      ctx({ injury: injury({ status: 'active' }), painProbe: painProbe(), rest: restActive() })
    )
    expect(moments.some((m) => m.kind === 'pain-probe')).toBe(true)
  })
})
