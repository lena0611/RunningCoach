import { describe, expect, it } from 'vitest'
import {
  evaluateCoachScheduleProposal,
  extractSoleWeekday,
  normalizeCoachScheduleProposal,
  REST_PRESET_MAX_DAYS,
  type ScheduleProposalGate
} from '../supabase/functions/coach-run/scheduleProposal'

const TODAY = '2026-07-30'

function gate(overrides: Partial<ScheduleProposalGate> = {}): ScheduleProposalGate {
  return {
    responseMode: 'conversational',
    upcomingSchedule: [
      { date: '2026-07-31', type: 'Easy + Strides', canIntensify: false },
      { date: '2026-08-02', type: 'LSD', canIntensify: true }
    ],
    restActive: false,
    injuryActive: false,
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
  easeAxis: 'distance',
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

  /**
   * G9 — 활성 부상 중의 부상성 휴식 제안은 떨군다.
   * 2026-08-05 실사고: 족저근막 부상선언 후 쉬는 중 "11월 목표가 걱정된다" 발화에 쉬어가기 카드가 떴다.
   * activeRest 레코드가 없어 G4 를 통과했고, 사용자는 휴식이 이중 시스템에 걸려 어찌할 바를 몰랐다.
   * 부상 휴식은 부상 관리(전략적 휴식·체크인·복귀 게이트)가 소유한다.
   */
  it('G9: 활성 부상 중에는 부상성/모호한 휴식 제안을 떨군다', () => {
    const injuryRest = { ...REST, restReason: 'injury' }
    const vagueRest = { ...REST, restReason: 'other' }
    expect(normalizeCoachScheduleProposal(injuryRest, gate({ injuryActive: true }))).toBeNull()
    expect(normalizeCoachScheduleProposal(vagueRest, gate({ injuryActive: true }))).toBeNull()
    // 알 수 없는 restReason 은 'other' 로 떨어지므로 함께 차단된다.
    expect(normalizeCoachScheduleProposal({ ...REST, restReason: 'ㅁㅁ' }, gate({ injuryActive: true }))).toBeNull()
  })

  it('G9: 부상과 무관한 명시 사유(개인·날씨)는 활성 부상 중에도 통과시킨다', () => {
    expect(normalizeCoachScheduleProposal(REST, gate({ injuryActive: true }))?.restReason).toBe('personal')
    expect(
      normalizeCoachScheduleProposal({ ...REST, restReason: 'weather' }, gate({ injuryActive: true }))?.restReason
    ).toBe('weather')
  })

  it('G9: 세션 액션(하향·조정)은 활성 부상 중에도 막지 않는다 — 회복은 훈련의 일부', () => {
    expect(normalizeCoachScheduleProposal(EASE, gate({ injuryActive: true }))).not.toBeNull()
  })

  it('G9: 부상이 없으면 부상성 휴식 제안도 통과시킨다(과발동 가드)', () => {
    expect(normalizeCoachScheduleProposal({ ...REST, restReason: 'injury' }, gate())?.restReason).toBe('injury')
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

  // G10 — 의도 보존 관용 매트릭스(#703). 상향 G7 과 대칭인 하향 게이트.
  describe('G10: ease_session 은 의도를 보존하는 축에서만 (#703)', () => {
    it('관용 축은 통과하고 easeAxis 를 남긴다', () => {
      // Easy + Strides: 스트라이드가 1순위 관용 축(신경근 곁가지).
      const strides = normalizeCoachScheduleProposal({ ...EASE, easeAxis: 'strides' }, gate())
      expect(strides?.easeAxis).toBe('strides')
      // LSD: 페이스 늦추기는 관용(발 위 시간 보존).
      const pace = normalizeCoachScheduleProposal({ ...EASE, targetDate: '2026-08-02', easeAxis: 'pace' }, gate())
      expect(pace?.easeAxis).toBe('pace')
    })

    it('핵심 축을 깎는 제안을 떨군다', () => {
      // LSD 의 본체는 발 위 시간 — duration 단축은 훼손.
      expect(normalizeCoachScheduleProposal({ ...EASE, targetDate: '2026-08-02', easeAxis: 'duration' }, gate())).toBeNull()
      // 강도 하향은 어느 세션에서든 정체성 훼손.
      expect(normalizeCoachScheduleProposal({ ...EASE, easeAxis: 'intensity' }, gate())).toBeNull()
    })

    it('Easy 계열은 duration 도 관용이다 — 거리와 시간은 같은 dose 손잡이 (2026-08-24 라이브 QA 교정)', () => {
      // 실측: "훈련 좀 그런데"에 모델이 duration 을 골랐다가 게이트에 죽어 카드가 안 떴다.
      // 시간이 본체인 LSD·Tempo 만 막는다(위 테스트).
      expect(normalizeCoachScheduleProposal({ ...EASE, easeAxis: 'duration' }, gate())?.easeAxis).toBe('duration')
      const easyGate = gate({ upcomingSchedule: [{ date: '2026-07-31', type: 'Easy', canIntensify: false }] })
      expect(normalizeCoachScheduleProposal({ ...EASE, easeAxis: 'duration' }, easyGate)?.easeAxis).toBe('duration')
    })

    it('Tempo 는 지속시간이 본체다 — 웜업/쿨다운·거리는 관용, duration 은 훼손', () => {
      const tempoGate = gate({ upcomingSchedule: [{ date: '2026-07-31', type: 'Tempo', canIntensify: false }] })
      expect(normalizeCoachScheduleProposal({ ...EASE, easeAxis: 'warmup_cooldown' }, tempoGate)?.easeAxis).toBe('warmup_cooldown')
      expect(normalizeCoachScheduleProposal({ ...EASE, easeAxis: 'duration' }, tempoGate)).toBeNull()
    })

    it('축 미표기 ease 는 떨군다 — 무엇을 깎는지 모르는 조정은 판정 불가', () => {
      expect(normalizeCoachScheduleProposal({ ...EASE, easeAxis: null }, gate())).toBeNull()
      expect(normalizeCoachScheduleProposal({ ...EASE, easeAxis: 'everything' }, gate())).toBeNull()
    })

    it('타입을 모르면 보수 통과 — duration·intensity 만 막는다', () => {
      const unknownGate = gate({ upcomingSchedule: [{ date: '2026-07-31', canIntensify: false }] })
      expect(normalizeCoachScheduleProposal({ ...EASE, easeAxis: 'distance' }, unknownGate)?.easeAxis).toBe('distance')
      expect(normalizeCoachScheduleProposal({ ...EASE, easeAxis: 'duration' }, unknownGate)).toBeNull()
    })

    it('다른 액션의 easeAxis 는 null 로 강제된다', () => {
      const skip = normalizeCoachScheduleProposal({ ...EASE, actionType: 'skip_session', easeAxis: 'distance' }, gate())
      expect(skip?.actionType).toBe('skip_session')
      expect(skip?.easeAxis).toBeNull()
    })
  })

  // 관측(#703 후속) — "카드 안 뜸"이 모델 미출력인지 게이트 폐기인지 사유로 구분된다.
  describe('evaluateCoachScheduleProposal 는 폐기 사유를 돌려준다', () => {
    it('미출력(null)은 drop 도 null — 게이트 폐기와 구분된다', () => {
      expect(evaluateCoachScheduleProposal(null, gate())).toEqual({ proposal: null, drop: null })
    })
    it('게이트 폐기는 게이트 이름을 남긴다', () => {
      expect(evaluateCoachScheduleProposal({ ...EASE, easeAxis: null }, gate()).drop).toBe('G10_axis_missing')
      expect(evaluateCoachScheduleProposal({ ...EASE, targetDate: '2099-01-01' }, gate()).drop).toBe('G3_date_not_in_schedule')
      expect(evaluateCoachScheduleProposal({ ...EASE, targetDate: '2026-08-02', easeAxis: 'duration' }, gate()).drop).toBe('G10_axis_violates_intent')
    })
    it('통과하면 drop 이 null 이고 proposal 이 있다', () => {
      const verdict = evaluateCoachScheduleProposal(EASE, gate())
      expect(verdict.drop).toBeNull()
      expect(verdict.proposal?.easeAxis).toBe('distance')
    })
  })

  // G11(#703) — 지목 요일과 다른 날짜의 카드는 떨군다(스레드 앵커링 오발사).
  describe('G11: 사용자가 지목한 요일과 카드 날짜가 일치해야 한다', () => {
    it('요일 하나를 지목하면 다른 요일 카드를 떨군다', () => {
      // 2026-07-31 은 금요일 — "목요일 훈련 좀 그런데" 발화의 목(4)과 불일치.
      const verdict = evaluateCoachScheduleProposal(EASE, gate({ mentionedWeekday: 4 }))
      expect(verdict.drop).toBe('G11_weekday_mismatch')
      // 금요일(5) 지목이면 통과.
      expect(evaluateCoachScheduleProposal(EASE, gate({ mentionedWeekday: 5 })).drop).toBeNull()
    })
    it('요일 미지목(null)이면 기존 동작 그대로', () => {
      expect(evaluateCoachScheduleProposal(EASE, gate({ mentionedWeekday: null })).drop).toBeNull()
    })
  })

  describe('extractSoleWeekday — 정확히 하나 지목했을 때만', () => {
    it('단일 지목을 요일 인덱스로 돌려준다', () => {
      expect(extractSoleWeekday('목요일 훈련 좀 그런데')).toBe(4)
      expect(extractSoleWeekday('화요일 본런이 너무 길게 느껴져')).toBe(2)
    })
    it('둘 이상 지목·미지목은 null — 재배치 발화에 요일을 강제하면 오히려 틀린다', () => {
      expect(extractSoleWeekday('화요일 말고 목요일로 옮길래')).toBeNull()
      expect(extractSoleWeekday('훈련이 너무 힘들어')).toBeNull()
      // 같은 요일 반복은 하나로 본다.
      expect(extractSoleWeekday('토요일, 그러니까 이번 토요일 말인데')).toBe(6)
    })
    it('한 글자 요일 표기는 받지 않는다 (#643 우연 통과 방지)', () => {
      expect(extractSoleWeekday('화, 목 이틀 뛰어')).toBeNull()
    })
  })
})
