/**
 * 사용자가 정한 휴식 계획을 컨텍스트 JSON **뒤에** 세우는 꼬리표 (#856).
 *
 * 2026-10-14 실사고: 사용자가 코치와 "2주 완전 휴식"을 정하고 휴식 모드를 켰다(복귀 10/28). 30분 뒤
 * 같은 스레드에서 "그럼 언제부터 다시 뛰어도 돼?"에 코치가 "러닝은 아주 짧고 편한 조깅부터 시작"이라고
 * 답하고 휴식 계획을 한 마디도 짚지 않았다. restState 는 실려 있었다 — 다만 84KB JSON 한가운데였고,
 * 바로 뒤에 선 처치 꼬리표(#850)가 "walk-run 점진"을 말하고 있었다. 읽는 순서상 마지막이 이긴다(#795).
 *
 * 그래서 처치 꼬리표 **뒤에** 휴식 계획을 세운다. 휴식이 아니면 빈 문자열.
 * 기간은 사용자가 정한다(SSOT §휴식과 복귀) — 줄이거나 늘리자고 설득하지 않는다. 단 SSOT 의
 * "완전 휴식을 존중하되 가벼운 회복주 대안 1회 제시"는 막지 않는다(instructionForRest 가 소유).
 */

export type RestPlanInput = {
  active: boolean
  reason: string | null
  returnDate: string | null
  daysUntilReturn: number | null
}

const REASON_LABELS: Record<string, string> = {
  injury: '부상',
  weather: '날씨',
  personal: '개인 일정',
  other: '기타'
}

function shortDate(iso: string): string {
  return iso.slice(5).replace('-', '/')
}

export function buildRestPlanTail(rest: RestPlanInput | null | undefined): string {
  if (!rest?.active || !rest.returnDate) return ''
  const reason = rest.reason ? REASON_LABELS[rest.reason] ?? null : null
  const returnLabel = shortDate(rest.returnDate)
  const dDay = rest.daysUntilReturn !== null && rest.daysUntilReturn > 0 ? ` (D-${rest.daysUntilReturn})` : ''
  return [
    '',
    '',
    '[사용자가 정한 휴식 — 사용자가 직접 선언, 앱 휴식 모드 켜짐]',
    `- 지금 쉬는 중${reason ? ` · 이유: ${reason}` : ''} · 복귀일 ${returnLabel}${dDay}`,
    `- 복귀 시점·다시 뛰기·훈련 재개를 물으면 **이 계획부터 짚는다**: "정해두신 대로 ${returnLabel} 복귀까지는 쉬는 계획이에요." 그다음에 복귀할 때의 기준(처치 후 주의사항·walk-run 점진·통증 기준)을 말한다.`,
    '- 복귀 기준은 "복귀일부터 이렇게 시작한다"로 말한다. 지금 당장 뛰어도 되는 것처럼 들리게 말하지 않는다.',
    '- 기간은 사용자가 정했다. 줄이거나 늘리자고 설득하지 않는다(가벼운 대안 제시는 instructionForRest 의 1회 규칙만 따른다).',
    '- 사용자가 일찍(또는 늦게) 돌아오고 싶어 하면 "권하지 않아요/안 돼요"로 막지 않는다 — 복귀일은 코치가 허락하는 게 아니라 사용자가 바꾸는 것이다. ① 주의할 점을 근거와 함께 정직하게 한 번 말하고(예: 주사는 통증을 가릴 수 있다) ② 병원 안내가 있었는지 확인하고 ③ 바꾸려면 쉬는 중 화면의 "복귀일 조정"에서 바꿀 수 있다고 알려주고 ④ 그때도 같은 복귀 기준(walk-run 점진·통증 기준)으로 시작한다고 말한다. 위험 신호가 있으면 이 순서보다 진료 권유가 먼저다.',
    '- 복귀를 묻지 않은 턴엔 이 계획을 매번 되풀이하지 않는다.'
  ].join('\n')
}
