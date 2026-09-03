import { describe, expect, it } from 'vitest'
import {
  computeDataCardFromRuns,
  formatDataCardValue,
  toQueryRunsRow,
  type DataCardRunInput,
  type DataCardSpec
} from '@/shared/lib/coaching/dataCardAdapter'

function run(over: Partial<DataCardRunInput> = {}): DataCardRunInput {
  return { date: '2026-08-01', type: 'LSD', distanceKm: 15, durationSec: 5400, ...over }
}

/**
 * #767 — 웹이 **Edge 와 같은 계산 파일**을 쓰는지 잠근다. 여기서 새 계산기를 만들면(미러 두 벌)
 * 코치 답변과 카드가 다른 숫자를 말하게 된다. 이 저장소가 실제로 겪은 실패 유형이다.
 */
describe('dataCardAdapter (#767)', () => {
  it('웹 RunLog 를 코어 입력 행으로 옮긴다 — 없는 값은 0 이 아니라 null', () => {
    const row = toQueryRunsRow(run({ avgHeartRate: undefined, distanceKm: 15 }))
    expect(row.distance_km).toBe(15)
    expect(row.avg_heart_rate).toBeNull()
    expect(row.date).toBe('2026-08-01')
  })

  it('웹 러닝으로 카드 값을 낸다 — 코어와 같은 결과', () => {
    const runs = [run({ date: '2026-08-01', distanceKm: 15 }), run({ date: '2026-08-08', distanceKm: 20 })]
    const spec: DataCardSpec = {
      kind: 'single',
      title: '토요일 LSD 누적',
      metric: 'distanceKm',
      query: { filters: [{ field: 'weekday', op: 'eq', value: '토' }], groupBy: 'none', metrics: ['distanceKm'], limit: 24 }
    }
    expect(computeDataCardFromRuns(spec, runs).value).toBe(35)
  })

  it('값이 없으면 0 이 아니라 — 로 낸다', () => {
    expect(formatDataCardValue({ value: null, unit: '%', matchedRuns: 0, failureKind: 'no_matching_runs' })).toBe('—')
    expect(formatDataCardValue({ value: 70, unit: '%', matchedRuns: 4, failureKind: null })).toBe('70%')
  })
})
