import { describe, expect, it } from 'vitest'
import {
  collapseNearDuplicateFacts,
  isKnownFact,
  isNearDuplicateFact
} from '../supabase/functions/_shared/memoryDedupe'

/*
  실측 데이터(#796): coach_memory_items 203건 중 기존 키로는 201건이 "서로 다른" 것으로 계산됐다.
  아래 문장들은 그 DB 에서 그대로 가져온 것이다 — 상위 12칸에 실제 사실은 8개뿐이었고
  두 사실이 각각 3칸을 차지해 다른 기억을 밀어냈다.
*/
const STRIDE_VARIANTS = [
  '사용자는 발바닥이 조용할 때만 가속과 스트라이드를 다시 넣는 쪽을 선호한다.',
  '사용자는 발바닥이 조용할 때만 스트라이드와 빠른 가속을 다시 넣는 쪽을 선호한다.',
  '사용자는 우측 발바닥이 조용할 때만 스트라이드를 다시 넣는 쪽을 선호한다.'
]
const HEAT_VARIANTS = [
  '사용자는 더위·습도에서는 심박보다 편안한 호흡과 발바닥 반응을 더 믿는 쪽이다.',
  '사용자는 더위·습도에서는 심박보다 편안한 호흡과 발바닥 반응을 더 믿는 쪽이 맞다.',
  '사용자는 더위·습도에서는 심박보다 편안한 호흡과 발바닥 반응을 더 믿는 쪽이 맞는다.'
]

describe('memoryDedupe — 실측 중복 (#796)', () => {
  it('어미만 다른 변형을 같은 사실로 본다', () => {
    expect(isNearDuplicateFact(HEAT_VARIANTS[1], HEAT_VARIANTS[2])).toBe(true)
    expect(isNearDuplicateFact(HEAT_VARIANTS[0], HEAT_VARIANTS[1])).toBe(true)
  })

  it('좌우 수식어와 어순 차이를 흡수한다', () => {
    expect(isNearDuplicateFact(STRIDE_VARIANTS[0], STRIDE_VARIANTS[2])).toBe(true)
    expect(isNearDuplicateFact(STRIDE_VARIANTS[0], STRIDE_VARIANTS[1])).toBe(true)
  })

  it('활성 6칸을 되찾는다 — 12개 변형 목록이 실제 사실 수로 접힌다', () => {
    const rows = [...STRIDE_VARIANTS, ...HEAT_VARIANTS, '사용자는 10km 60분 목표를 향해 베이스를 조용히 쌓는 단계다.']
    const collapsed = collapseNearDuplicateFacts(rows, (row) => row)
    expect(collapsed).toEqual([STRIDE_VARIANTS[0], HEAT_VARIANTS[0], rows[6]])
  })

  it('앞에 오는 것이 남는다 — 호출부 우선순위를 존중한다', () => {
    const collapsed = collapseNearDuplicateFacts([...STRIDE_VARIANTS].reverse(), (row) => row)
    expect(collapsed).toEqual([STRIDE_VARIANTS[2]])
  })
})

describe('memoryDedupe — 활용형 누수 (라이브에서 통과했던 케이스)', () => {
  /*
    배포 후 실측: 코치가 이 문장을 새로 저장했고 필터가 못 막았다.
    "더울"이 "더위"와 다른 토큰이라 공유 토큰이 2개로 떨어졌다 — 활용형 정규화로 막는다.
  */
  it('"더울 때" 재서술을 "더위·습도" 원본과 같은 사실로 본다', () => {
    expect(
      isNearDuplicateFact(
        '사용자는 더울 때 심박 숫자보다 호흡이 편한지를 더 신뢰하고 싶어한다.',
        '사용자는 더위·습도에서는 심박보다 편안한 호흡과 발바닥 반응을 더 믿는 쪽이다.'
      )
    ).toBe(true)
  })

  it('조건이 하나 붙은 재서술도 같은 사실이다', () => {
    expect(
      isNearDuplicateFact(
        '사용자는 발바닥이 조용할 때만 가속과 스트라이드를 다시 넣는 쪽을 선호한다.',
        '사용자는 발바닥이 조용하고 Easy가 안정적일 때만 스트라이드를 다시 넣는 쪽을 선호한다.'
      )
    ).toBe(true)
  })
})

describe('memoryDedupe — 뜻이 다른 것을 합치지 않는다', () => {
  it('부정 표현이 한쪽에만 있으면 다른 사실이다', () => {
    expect(
      isNearDuplicateFact(
        '사용자는 발바닥이 조용할 때만 스트라이드를 다시 넣는 쪽을 선호한다.',
        '우측 발바닥이 조용하지 않을 때는 LSD나 스트라이드보다 조용한 반복을 우선한다.'
      )
    ).toBe(false)
  })

  it('주제가 다르면 합치지 않는다', () => {
    expect(
      isNearDuplicateFact(
        '사용자는 10km 60분 목표를 향해 베이스를 조용히 쌓는 단계다.',
        '사용자는 더위·습도에서는 심박보다 편안한 호흡을 더 믿는 쪽이다.'
      )
    ).toBe(false)
  })

  it('짧은 문장이 우연히 겹쳐도 합치지 않는다 — 공유 토큰 하한', () => {
    expect(isNearDuplicateFact('발바닥이 아프다', '발바닥이 편하다')).toBe(false)
  })

  it('같은 부위를 말해도 다른 사실이면 남긴다 — 임계값을 더 내리면 이게 깨진다', () => {
    expect(
      isNearDuplicateFact(
        '사용자는 발바닥 통증이 0으로 내려가면 해제 업데이트를 원한다.',
        '사용자는 발바닥이 조용할 때만 스트라이드를 다시 넣는 쪽을 선호한다.'
      )
    ).toBe(false)
  })
})

describe('isKnownFact', () => {
  it('기존 코퍼스에 변형이 있으면 이미 아는 사실이다', () => {
    expect(isKnownFact(STRIDE_VARIANTS[2], [STRIDE_VARIANTS[0]])).toBe(true)
    expect(isKnownFact('사용자는 아침 러닝을 선호한다.', STRIDE_VARIANTS)).toBe(false)
  })
})
