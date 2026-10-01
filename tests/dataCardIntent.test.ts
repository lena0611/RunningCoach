import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dataCardUnsupportedConcept, mentionsDataCardIntent } from '../supabase/functions/_shared/dataCardProposal'
import { reorderVisibleCards } from '../src/pages/dashboard/summaryBlocks'

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

/**
 * 카드 어휘 밖 개념(2026-09-04 실사용 2건).
 * "10km 예상시간" 은 매칭 0건으로 떨어져 "기록이 하나도 없어서"라는 **틀린 이유**로 거절됐고
 * (기록은 14건 있었다), "나의 vo2Max" 는 둘 다 못 만드는 선택지를 두고 되물었다.
 */
describe('dataCardUnsupportedConcept', () => {
  it('추정값은 이유를 정확히 말하고 거절한다 — "기록이 없어서"가 아니다', () => {
    const reason = dataCardUnsupportedConcept('/카드생성 10km 예상시간')
    expect(reason).toContain('계산해 내는 값')
    expect(reason).not.toContain('기록이 하나도')
    expect(dataCardUnsupportedConcept('/카드생성 나의 vo2Max')).toBeTruthy()
    expect(dataCardUnsupportedConcept('VDOT 카드로 보여줘')).toBeTruthy()
  })

  it('나이대·순위·체중처럼 없는 데이터도 이유를 밝힌다', () => {
    expect(dataCardUnsupportedConcept('나이대 평균이랑 비교해서 카드로')).toContain('연령 정보가 없어서')
    expect(dataCardUnsupportedConcept('상위 몇 % 인지 카드로')).toContain('순위')
    expect(dataCardUnsupportedConcept('몸무게 추이 카드')).toContain('체중')
  })

  it('기록으로 만들 수 있는 요청은 통과시킨다', () => {
    expect(dataCardUnsupportedConcept('/카드생성 최근 4주 평균 페이스')).toBeNull()
    expect(dataCardUnsupportedConcept('/카드생성 최근4주간 주간볼륨 대비 lsd볼륨 비중')).toBeNull()
    expect(dataCardUnsupportedConcept('이번 달 총 거리')).toBeNull()
  })
})

/**
 * 요약 카드 끌어 옮기기(2026-09-04). 보이는 카드만 옮겨도 **숨긴 카드의 자리는 그대로**여야 한다 —
 * 숨긴 것을 뒤로 밀어내면 다시 켰을 때 엉뚱한 곳에서 나타난다.
 */
describe('reorderVisibleCards', () => {
  it('숨긴 카드 자리는 두고 보이는 것만 다시 배치한다', () => {
    // 전체: [a, hidden, b, c] / 보이는 것 [a, b, c] → [c, a, b] 로 끌어 옮김
    expect(reorderVisibleCards(['a', 'hidden', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'hidden', 'a', 'b'])
  })

  it('전부 보이면 그대로 새 순서가 된다', () => {
    expect(reorderVisibleCards(['a', 'b', 'c'], ['b', 'c', 'a'])).toEqual(['b', 'c', 'a'])
  })
})

/**
 * #835 — 카드 되묻기 정책이 "첫 시도엔 묻지 않는다"로 바뀌었다(2026-10-02).
 *
 * 2026-10-01 실사용: 카드 2개를 만들려다 **5턴 걸려 1개만** 됐다.
 *   `/카드생성 연간 총마일리지` → 되물음("'총 거리(km)' 카드로 만들면 될까요?")
 *   `응`                        → **card_rejected** ("조회 조건을 이해하지 못했습니다")
 *   `/카드생성 토요일 누적거리 km` → clarify 가 차단됐는데도 **답할 수 없는 질문**이 나갔다
 *
 * 원인이 어휘였다 — 되묻기를 막던 `dataCardRequestIsSpecific` 의 목록에 "연간"도 "마일리지"도
 * 없었다. 어휘를 더 넣는 처방은 네 번 실패했으므로(#642·#643·#701·#821) 판정 자체를 없애고
 * 기본값을 "묻지 말고 해석해서 만들기"로 바꿨다.
 *
 * 프롬프트·게이트 문자열은 타입도 테스트도 안 잡으므로 소스 가드로 잠근다.
 */
describe('카드 되묻기 정책 (#835)', () => {
  const EDGE = readFileSync(resolve(__dirname, '../supabase/functions/coach-run/index.ts'), 'utf-8')
  const SHARED = readFileSync(resolve(__dirname, '../supabase/functions/_shared/dataCardProposal.ts'), 'utf-8')

  it('어휘 기반 되묻기 게이트가 사라졌다', () => {
    // 되살아나면 "연간"·"마일리지" 같은 미등록 어휘에서 같은 핑퐁이 재발한다.
    expect(SHARED).not.toContain('export function dataCardRequestIsSpecific')
    expect(EDGE).not.toContain('dataCardRequestIsSpecific(userNote)')
  })

  it('첫 시도에는 되묻지 않는다', () => {
    expect(EDGE).toContain('if (attempt === 0)')
    expect(EDGE).toContain('첫 시도에는 되묻지 않습니다')
  })

  it('되묻기를 막으면 라운드 2 에서 도구를 강제한다 — guidance 만으로는 무시된다', () => {
    // 2026-10-01 실사용에서 정확히 이게 무시돼 사용자가 답할 수 없는 질문을 받았다.
    expect(EDGE).toContain('forceCardRetry: true')
    expect(EDGE).toContain("requestForceTool.name = 'proposeDataCard'")
  })

  it('강제는 한 번만 — 소비하고 비운다(무한 재호출 방지)', () => {
    expect(EDGE).toContain('if (toolSupport.requestForceTool) toolSupport.requestForceTool.name = null')
  })

  it('재시도에서도 못 만들면 그때는 되묻기를 허용한다', () => {
    // attempt > 0 경로가 남아 있어야 진짜 애매한 요청("요즘 얼마나 뛰는지")을 물을 수 있다.
    expect(EDGE).toContain('countRecentDataCardClarifications')
  })
})
