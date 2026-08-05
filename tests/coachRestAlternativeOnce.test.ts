import { describe, expect, it } from 'vitest'

/**
 * "가벼운 회복주 대안은 대화당 1회만"(2026-08-05 사용자 지적) 판정 로직.
 *
 * 프롬프트의 "1회만"은 **한 답변 안**으로 읽혀 매 턴 반복됐다. 이미 쉬기로 정한 사람에게 되풀이하면
 * 안내가 아니라 설득이 된다. 그래서 반복 판정을 코드가 한다 — 이 테스트가 그 판정의 계약이다.
 *
 * index.ts 는 Deno 전용 import 가 섞여 vitest 에서 그대로 불러올 수 없어 판정식을 여기 미러한다.
 * 원본을 바꾸면 이 미러도 함께 바꿔야 한다(양쪽 주석에 서로를 적어둔다).
 */
const LOOKBACK_TURNS = 6

function hasOfferedRestAlternative(rows: Array<{ report: string; created_at: string }>): boolean {
  return rows
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, LOOKBACK_TURNS)
    .some((row) => {
      const text = row.report ?? ''
      if (!/회복주|가벼운\s*조깅|가벼운\s*회복/.test(text)) return false
      return /대신|선택지|대체/.test(text)
    })
}

function turn(report: string, day: number) {
  return { report, created_at: `2026-08-${String(day).padStart(2, '0')}T00:00:00Z` }
}

const OFFERED = '완전 휴식만이 답은 아니고, 통제 가능한 범위의 가벼운 회복주로 대신하는 선택지도 있어요.'

describe('가벼운 회복주 대안은 대화당 1회만', () => {
  it('실제 반복 문구를 이미 말했으면 true (2026-08-05 실측 문장)', () => {
    expect(hasOfferedRestAlternative([turn(OFFERED, 5)])).toBe(true)
  })

  it('회복주 얘기가 없으면 false', () => {
    expect(hasOfferedRestAlternative([turn('발바닥이 조용해질 때까지 Easy를 진짜 Easy로 두세요.', 5)])).toBe(false)
    expect(hasOfferedRestAlternative([])).toBe(false)
  })

  it('회복주를 훈련 처방으로 말한 것은 대안 제시가 아니다 (대신/선택지 없음)', () => {
    expect(hasOfferedRestAlternative([turn('내일은 회복주 4km로 가볍게 갑시다.', 5)])).toBe(false)
  })

  it('"가벼운 조깅으로 대체"처럼 표현이 달라도 잡는다', () => {
    expect(hasOfferedRestAlternative([turn('완전히 멈추기보다 가벼운 조깅으로 대체해도 됩니다.', 5)])).toBe(true)
  })

  // 옛 대화에서 한 번 말했다고 영구 봉인하면, 새 휴식 국면에서 필요한 안내가 막힌다.
  it('되돌아보는 창(6턴)을 넘어간 옛 턴은 다시 말할 수 있다', () => {
    const rows = [turn(OFFERED, 1), ...Array.from({ length: 6 }, (_, i) => turn('평범한 답변', i + 2))]
    expect(hasOfferedRestAlternative(rows)).toBe(false)
  })

  it('창 안(최근 6턴)에 있으면 반복을 막는다', () => {
    const rows = [turn(OFFERED, 2), ...Array.from({ length: 4 }, (_, i) => turn('평범한 답변', i + 3))]
    expect(hasOfferedRestAlternative(rows)).toBe(true)
  })
})
