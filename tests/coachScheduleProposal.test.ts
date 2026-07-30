import { describe, expect, it } from 'vitest'
import {
  normalizeCoachScheduleProposal,
  REST_PRESET_MAX_DAYS,
  type ScheduleProposalGate
} from '../supabase/functions/coach-run/scheduleProposal'

const TODAY = '2026-07-30'

function gate(overrides: Partial<ScheduleProposalGate> = {}): ScheduleProposalGate {
  return {
    responseMode: 'conversational',
    upcomingSchedule: [
      { date: '2026-07-31', canIntensify: false },
      { date: '2026-08-02', canIntensify: true }
    ],
    restActive: false,
    injuryBlocksIntensify: false,
    today: TODAY,
    ...overrides
  }
}

const REST = {
  actionType: 'declare_rest',
  targetDate: null,
  suggestedRestUntil: null,
  restReason: 'personal',
  rationale: '사용자가 일정 때문에 당분간 쉬고 싶다고 말했다.',
  userApprovalPrompt: '휴식 기간을 정해볼까요?'
}

const EASE = {
  actionType: 'ease_session',
  targetDate: '2026-07-31',
  suggestedRestUntil: null,
  restReason: null,
  rationale: '내일 세션이 버겁다고 했다.',
  userApprovalPrompt: '내일 훈련을 조금 가볍게 바꿀까요?'
}

describe('coachScheduleProposal 게이트 (#639)', () => {
  it('정상 휴식 제안을 통과시킨다', () => {
    const result = normalizeCoachScheduleProposal(REST, gate())
    expect(result?.actionType).toBe('declare_rest')
    expect(result?.restReason).toBe('personal')
    expect(result?.targetDate).toBeNull()
  })

  it('정상 세션 제안을 통과시킨다', () => {
    expect(normalizeCoachScheduleProposal(EASE, gate())?.targetDate).toBe('2026-07-31')
  })

  // G1 — 어휘 밖 액션(특히 전체 재정렬)은 존재하지 않는다.
  it('G1: enum 밖 actionType 을 떨군다', () => {
    expect(normalizeCoachScheduleProposal({ ...EASE, actionType: 'realign_plan' }, gate())).toBeNull()
    expect(normalizeCoachScheduleProposal({ ...EASE, actionType: '' }, gate())).toBeNull()
  })

  // G2 — 1 응답 1 제안. 배열로 여러 건을 밀어넣지 못한다.
  it('G2: 배열/비객체를 떨군다', () => {
    expect(normalizeCoachScheduleProposal([REST], gate())).toBeNull()
    expect(normalizeCoachScheduleProposal(null, gate())).toBeNull()
    expect(normalizeCoachScheduleProposal('declare_rest', gate())).toBeNull()
  })

  // G3 — 대상 세션은 웹이 보낸 실제 예정 세션이어야 한다.
  it('G3: upcomingSchedule 에 없는 targetDate 를 떨군다', () => {
    expect(normalizeCoachScheduleProposal({ ...EASE, targetDate: '2026-09-09' }, gate())).toBeNull()
    expect(normalizeCoachScheduleProposal({ ...EASE, targetDate: '내일' }, gate())).toBeNull()
    expect(normalizeCoachScheduleProposal(EASE, gate({ upcomingSchedule: null }))).toBeNull()
  })

  // G4 — 이미 쉬는 중이면 재제안하지 않는다(세션 액션은 영향 없음).
  it('G4: 휴식 중이면 declare_rest 만 떨군다', () => {
    expect(normalizeCoachScheduleProposal(REST, gate({ restActive: true }))).toBeNull()
    expect(normalizeCoachScheduleProposal(EASE, gate({ restActive: true }))).not.toBeNull()
  })

  // G5 — redFlag/고통증이면 상향하지 않는다(하향은 계속 허용 — 회복은 훈련의 일부).
  it('G5: 부상 차단 시 intensify 만 떨구고 ease 는 통과시킨다', () => {
    const intensify = { ...EASE, actionType: 'intensify_session', targetDate: '2026-08-02' }
    expect(normalizeCoachScheduleProposal(intensify, gate({ injuryBlocksIntensify: true }))).toBeNull()
    expect(normalizeCoachScheduleProposal(EASE, gate({ injuryBlocksIntensify: true }))).not.toBeNull()
  })

  // G6 — 빈 노트 자동 디브리핑에서는 어떤 제안도 하지 않는다(닦달 방지).
  it('G6: report 모드에서는 전부 떨군다', () => {
    expect(normalizeCoachScheduleProposal(REST, gate({ responseMode: 'report' }))).toBeNull()
    expect(normalizeCoachScheduleProposal(EASE, gate({ responseMode: 'report' }))).toBeNull()
  })

  // G7 — 상향은 웹이 품질 게이트로 판정한 canIntensify 가 true 일 때만.
  it('G7: canIntensify 가 아니면 intensify 를 떨군다', () => {
    const onIneligible = { ...EASE, actionType: 'intensify_session', targetDate: '2026-07-31' }
    const onEligible = { ...EASE, actionType: 'intensify_session', targetDate: '2026-08-02' }
    expect(normalizeCoachScheduleProposal(onIneligible, gate())).toBeNull()
    expect(normalizeCoachScheduleProposal(onEligible, gate())).not.toBeNull()
  })

  it('G7: canIntensify 필드가 없으면 부적격으로 본다(fail-safe deny)', () => {
    const proposal = { ...EASE, actionType: 'intensify_session', targetDate: '2026-08-05' }
    const withoutFlag = gate({ upcomingSchedule: [{ date: '2026-08-05' }] })
    expect(normalizeCoachScheduleProposal(proposal, withoutFlag)).toBeNull()
  })

  // G8 — 휴식 프리셋은 앵커라 보수적으로. 제안 자체는 살리고 프리셋만 버린다.
  it('G8: 4주 이내 프리셋만 통과시키고 나머지는 null 로 비운다', () => {
    const withPreset = (until: string) =>
      normalizeCoachScheduleProposal({ ...REST, suggestedRestUntil: until }, gate())

    expect(withPreset('2026-08-13')?.suggestedRestUntil).toBe('2026-08-13')
    expect(withPreset(`2026-08-27`)?.suggestedRestUntil).toBe('2026-08-27') // 오늘+28일 경계 포함
    expect(withPreset('2026-08-28')).not.toBeNull() // 상한 초과여도 제안은 살아남는다
    expect(withPreset('2026-08-28')?.suggestedRestUntil).toBeNull()
    expect(withPreset('2026-07-29')?.suggestedRestUntil).toBeNull() // 과거
    expect(withPreset(TODAY)?.suggestedRestUntil).toBeNull() // 오늘(0일)
    expect(withPreset('내년까지')?.suggestedRestUntil).toBeNull()
  })

  it('G8: 상한 상수가 4주(SSOT §84 디트레이닝 경계)와 일치한다', () => {
    expect(REST_PRESET_MAX_DAYS).toBe(28)
  })

  it('rationale/userApprovalPrompt 가 비면 떨군다', () => {
    expect(normalizeCoachScheduleProposal({ ...REST, rationale: '   ' }, gate())).toBeNull()
    expect(normalizeCoachScheduleProposal({ ...REST, userApprovalPrompt: '' }, gate())).toBeNull()
  })

  it('알 수 없는 restReason 은 other 로 떨어뜨린다', () => {
    expect(normalizeCoachScheduleProposal({ ...REST, restReason: 'burnout' }, gate())?.restReason).toBe('other')
  })

  it('세션 액션에는 휴식 필드를 남기지 않는다', () => {
    const noisy = { ...EASE, suggestedRestUntil: '2026-08-10', restReason: 'injury' }
    const result = normalizeCoachScheduleProposal(noisy, gate())
    expect(result?.suggestedRestUntil).toBeNull()
    expect(result?.restReason).toBeNull()
  })
})
