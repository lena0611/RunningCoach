import { describe, expect, it } from 'vitest'
import { detectRepeatedDowngrade, type AdjustmentSession } from '@/shared/lib/coaching/adjustmentHistory'

const TODAY = '2026-08-28'

function s(over: Partial<AdjustmentSession> & { date: string; sessionType: AdjustmentSession['sessionType'] }): AdjustmentSession {
  return {
    id: Math.random().toString(36).slice(2),
    status: 'planned',
    source: 'generator',
    goalId: 'g1',
    createdAt: '2026-08-20T00:00:00Z',
    prescription: { distanceKm: 5 },
    ...over
  }
}

/** 한 날짜의 (코치 원본 superseded, 사용자 manual 대체) 쌍. */
function adjustedDay(date: string, from: AdjustmentSession['sessionType'], to: AdjustmentSession['sessionType']) {
  return [
    s({ date, sessionType: from, status: 'superseded', source: 'generator', createdAt: `${date}T01:00:00Z` }),
    s({ date, sessionType: to, status: 'planned', source: 'manual', createdAt: `${date}T02:00:00Z` })
  ]
}

describe('detectRepeatedDowngrade (#703 ①)', () => {
  it('조정이 없으면 신호가 없다', () => {
    const r = detectRepeatedDowngrade([s({ date: '2026-08-25', sessionType: 'Tempo' })], TODAY)
    expect(r.count).toBe(0)
    expect(r.shouldPromoteToRoutine).toBe(false)
  })

  it('한 번 하향은 국소 조정이다 — 루틴 승격 아님', () => {
    const r = detectRepeatedDowngrade(adjustedDay('2026-08-27', 'Tempo', 'Easy'), TODAY)
    expect(r.count).toBe(1)
    expect(r.shouldPromoteToRoutine).toBe(false)
  })

  it('같은 주 안의 반복은 루틴 문제가 아니다 — 한 주의 혼잡 ≠ 루틴 변경(§주말 트리아지)', () => {
    const r = detectRepeatedDowngrade(
      [...adjustedDay('2026-08-25', 'Tempo', 'Easy'), ...adjustedDay('2026-08-27', 'LSD', 'Easy')],
      TODAY
    )
    expect(r.count).toBe(2)
    expect(r.shouldPromoteToRoutine).toBe(false)
  })

  it('서로 다른 주에 걸쳐 반복되면 루틴 변경 기준으로 승격한다', () => {
    const r = detectRepeatedDowngrade(
      [...adjustedDay('2026-08-19', 'Tempo', 'Easy'), ...adjustedDay('2026-08-27', 'Tempo', 'Easy')],
      TODAY
    )
    expect(r.count).toBe(2)
    expect(r.dates).toEqual(['2026-08-19', '2026-08-27'])
    expect(r.shouldPromoteToRoutine).toBe(true)
  })

  it('상향은 하향으로 세지 않는다', () => {
    const r = detectRepeatedDowngrade(
      [...adjustedDay('2026-08-19', 'Easy', 'Tempo'), ...adjustedDay('2026-08-27', 'Easy', 'Tempo')],
      TODAY
    )
    expect(r.count).toBe(0)
  })

  it('롱런 → Easy 는 하향으로 본다 (볼륨 축)', () => {
    const r = detectRepeatedDowngrade(adjustedDay('2026-08-27', 'LSD', 'Easy'), TODAY)
    expect(r.count).toBe(1)
  })

  it('창(14일) 밖의 조정은 세지 않는다', () => {
    const r = detectRepeatedDowngrade(
      [...adjustedDay('2026-07-01', 'Tempo', 'Easy'), ...adjustedDay('2026-08-27', 'Tempo', 'Easy')],
      TODAY
    )
    expect(r.count).toBe(1)
    expect(r.shouldPromoteToRoutine).toBe(false)
  })

  it('다른 목표의 조정은 섞지 않는다', () => {
    const other = adjustedDay('2026-08-19', 'Tempo', 'Easy').map((x) => ({ ...x, goalId: 'other' }))
    const r = detectRepeatedDowngrade([...other, ...adjustedDay('2026-08-27', 'Tempo', 'Easy')], TODAY, 'g1')
    expect(r.count).toBe(1)
    expect(r.shouldPromoteToRoutine).toBe(false)
  })

  it('원본 없이 manual 만 있으면(직접 추가) 조정으로 보지 않는다', () => {
    const r = detectRepeatedDowngrade([s({ date: '2026-08-27', sessionType: 'Easy', source: 'manual' })], TODAY)
    expect(r.count).toBe(0)
  })
})
