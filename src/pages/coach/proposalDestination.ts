/**
 * 코치 제안 카드 → **도착지에 실제로 있는 버튼 이름**(#741).
 *
 * 왜 필요한가(2026-09-01 실사고): 사용자가 제안 카드의 "이번엔 놓아주기"를 눌렀는데 홈에 가보니
 * 오늘 처방이 그대로였다. 카드 버튼은 설계상 **이동만** 하고(#639 — 카드가 직접 변이하지 않는다),
 * 확정은 그날 세션 카드에서 해야 하는데 **아무도 그 말을 안 해줬다.**
 *
 * 게다가 버튼 이름이 카드와 도착지가 다르고, 도착지 안에서도 날짜 상태마다 갈린다:
 * - 오늘·미래 → 브리핑 카드의 **'건너뛰기'**
 * - 지난 날(open/missed/skipped) → 안 뛴 날 카드의 **'놓아주기'**
 *
 * 이름을 안 맞추면 안내가 오히려 사용자를 헤매게 한다.
 */
export function destinationActionLabel(action: string | null | undefined, state: string | undefined): string | null {
  if (!action) return null
  switch (action) {
    case 'skip_session':
      return state === 'today' || state === 'future' ? '건너뛰기' : '놓아주기'
    case 'ease_session':
      return '더 쉽게'
    case 'intensify_session':
      return '더 강하게'
    case 'reschedule_session':
      return '다른 날로'
    default:
      // declare_rest 는 이 경로를 타지 않는다(휴식 선언 시트가 바로 열린다).
      return null
  }
}
