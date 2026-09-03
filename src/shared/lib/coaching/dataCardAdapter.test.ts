import { describe, expect, it } from 'vitest'
import {
  computeDataCardFromRuns,
  describeDataCardBasis,
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
    expect(formatDataCardValue({ value: null, unit: '%', matchedRuns: 0, groupCount: 0, groupBy: 'none', windowDays: null, failureKind: 'no_matching_runs' })).toBe('—')
    expect(formatDataCardValue({ value: 70, unit: '%', matchedRuns: 4, groupCount: 0, groupBy: 'none', windowDays: null, failureKind: null })).toBe('70%')
  })

  it('묶어서 평균한 값은 기간으로 기준을 밝힌다 — "러닝 N건"만으론 몇 주를 평균했는지 모른다', () => {
    // 요청한 창(4주)과 실제 평균한 묶음(4주)이 같으면 요청대로 말한다.
    expect(describeDataCardBasis({ value: 24, unit: '%', matchedRuns: 13, groupCount: 4, groupBy: 'week', windowDays: 28, failureKind: null })).toBe('최근 4주 기준')
    // 안 뛴 주가 있어 3주만 평균했으면 **둘 다** 밝힌다 — "최근 3주"만 쓰면 창이 바뀐 줄 안다.
    expect(describeDataCardBasis({ value: 24, unit: '%', matchedRuns: 9, groupCount: 3, groupBy: 'week', windowDays: 28, failureKind: null })).toBe('최근 4주 중 3주 기준')
    expect(describeDataCardBasis({ value: 30, unit: 'km', matchedRuns: 5, groupCount: 0, groupBy: 'none', windowDays: null, failureKind: null })).toBe('러닝 5건 기준')
    expect(describeDataCardBasis({ value: null, unit: '%', matchedRuns: 0, groupCount: 0, groupBy: 'week', windowDays: 28, failureKind: 'no_matching_runs' })).toBe('해당 기록 없음')
  })
})
