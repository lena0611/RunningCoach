import { describe, expect, it } from 'vitest'
import { dataCardRequestIsSpecific, dataCardUnsupportedConcept, mentionsDataCardIntent } from '../supabase/functions/_shared/dataCardProposal'

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
 * 되묻기 게이트(2026-09-04). 상한 2회는 핑퐁의 **길이**만 줄인다 —
 * "물어볼 게 없는데 묻는 첫 질문"은 못 막아서, 지표+기간이 다 있으면 코드가 되묻기를 거절한다.
 */
describe('dataCardRequestIsSpecific', () => {
  it('지표와 기간을 둘 다 말했으면 되물을 게 없다', () => {
    expect(dataCardRequestIsSpecific('/카드생성 최근4주간 주간볼륨 대비 lsd볼륨 비중')).toBe(true)
    expect(dataCardRequestIsSpecific('최근 4주 평균 케이던스를 카드로 만들어줘')).toBe(true)
    expect(dataCardRequestIsSpecific('이번 달 총 거리 보여줘')).toBe(true)
    expect(dataCardRequestIsSpecific('8월 심박 평균')).toBe(true)
  })

  it('한쪽이 비면 되묻기를 허용한다 — 실제로 애매했던 발화', () => {
    // 기간(요즘)은 있는데 거리·시간·횟수 중 무엇인지가 없다. 이때는 묻는 게 맞다.
    expect(dataCardRequestIsSpecific('/카드생성 요즘 얼마나 뛰는지 하나 보여줘')).toBe(false)
    // 지표는 있는데 기간이 없다.
    expect(dataCardRequestIsSpecific('LSD 비중 카드 만들어줘')).toBe(false)
    expect(dataCardRequestIsSpecific('')).toBe(false)
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
