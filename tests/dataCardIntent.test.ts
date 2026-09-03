import { describe, expect, it } from 'vitest'
import { mentionsDataCardIntent } from '../supabase/functions/_shared/dataCardProposal'

/**
 * #767 — 2026-09-03 실측 실패에서 온 테스트.
 * 사용자가 네 번 말하는 동안 모델은 도구를 **한 번도** 부르지 않고 컨텍스트 숫자로 어림했다.
 * 지침은 이미 있었다. 그래서 의도 판정을 코드로 내리고 도구를 강제한다 — 이 표가 그 경계다.
 */
describe('mentionsDataCardIntent', () => {
  it('/카드생성 명령은 의심의 여지 없이 강제 대상 — 화면이 앞에 박아 보낸다', () => {
    expect(mentionsDataCardIntent('/카드생성 최근 4주 주간볼륨 대비 LSD 비중')).toBe(true)
    expect(mentionsDataCardIntent('/카드생성')).toBe(true)
  })

  it('카드로 만들어 달라는 발화는 강제 대상', () => {
    // 실제 사용자 발화(2026-09-03 15:05)
    expect(mentionsDataCardIntent('카드로 만들어준다며')).toBe(true)
    expect(mentionsDataCardIntent('이거 카드로 추가해줘')).toBe(true)
    expect(mentionsDataCardIntent('LSD 비중 카드 만들어줘')).toBe(true)
  })

  it('요약/홈에 띄워 달라는 발화도 강제 대상', () => {
    expect(mentionsDataCardIntent('요약에 주간 LSD 비중 띄워줘')).toBe(true)
    expect(mentionsDataCardIntent('홈에서 늘 보이게 해줘')).toBe(true)
    expect(mentionsDataCardIntent('요약 화면에 상시로 추가해줘')).toBe(true)
  })

  it('단순 질문은 강제하지 않는다 — 매번 카드 제안으로 끌려가면 대화가 망가진다', () => {
    // 이 발화들도 실제로 있었다(13:34, 15:05). 답은 대화로 해야 한다.
    expect(mentionsDataCardIntent('최근 주간볼륨 대비 LSD 비중')).toBe(false)
    expect(mentionsDataCardIntent('최근 4주를 대상으로 주간볼륨 대비 lsd비중')).toBe(false)
    expect(mentionsDataCardIntent('오늘 뭐 뛰면 돼?')).toBe(false)
    expect(mentionsDataCardIntent('')).toBe(false)
  })
})
