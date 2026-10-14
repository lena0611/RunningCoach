import { describe, expect, it } from 'vitest'
import { buildTreatmentGuideTail, mergeRecentTreatments, treatmentRecordNote } from '../supabase/functions/_shared/treatmentGuide'

const today = '2026-10-14'

describe('mergeRecentTreatments (#850)', () => {
  it('저장분과 이번 턴 감지분을 합치고 같은 처치는 하나로', () => {
    const merged = mergeRecentTreatments(
      [{ kind: 'corticosteroid', treatedOn: '2026-10-13' }, { kind: 'eswt', treatedOn: '2026-09-07' }],
      [{ kind: 'corticosteroid', treatedOn: '2026-10-13' }],
      today
    )
    expect(merged).toEqual([
      { kind: 'corticosteroid', treatedOn: '2026-10-13', daysSince: 1 },
      { kind: 'eswt', treatedOn: '2026-09-07', daysSince: 37 }
    ])
  })

  it('6주가 지난 처치와 미래 날짜는 뺀다', () => {
    expect(mergeRecentTreatments([{ kind: 'pdrn', treatedOn: '2026-08-01' }, { kind: 'prp', treatedOn: '2026-10-20' }], [], today)).toEqual([])
  })
})

describe('buildTreatmentGuideTail', () => {
  it('처치가 없으면 빈 문자열', () => {
    expect(buildTreatmentGuideTail([], [])).toBe('')
  })

  it('실사례: 주사 다음날 — 스테로이드 주의사항 전체를 싣는다', () => {
    const tail = buildTreatmentGuideTail([{ kind: 'corticosteroid', treatedOn: '2026-10-13', daysSince: 1 }], [])
    expect(tail).toContain('스테로이드 주사 · 2026-10-13 (1일 전)')
    expect(tail).toContain('통증이 줄어도 근막이 나은 것은 아니다')
    expect(tail).toContain('파열')
    expect(tail).toContain('감염 신호')
    expect(tail).toContain('병원·의사의 안내가 최우선')
  })

  it('기간을 단정하지 말라는 규칙이 항상 함께 간다(권위 수치 없음)', () => {
    const tail = buildTreatmentGuideTail([{ kind: 'eswt', treatedOn: '2026-10-12', daysSince: 2 }], [])
    expect(tail).toContain('기간을 단정하지 않는다')
    expect(tail).not.toContain('스테로이드')
  })

  it('7일이 지나면 사실 한 줄만 — 이번 턴에 다시 말하면 전체', () => {
    const old = { kind: 'corticosteroid' as const, treatedOn: '2026-10-01', daysSince: 13 }
    expect(buildTreatmentGuideTail([old], [])).not.toContain('감염 신호')
    expect(buildTreatmentGuideTail([old], [{ kind: 'corticosteroid', treatedOn: '2026-10-01' }])).toContain('감염 신호')
  })
})

describe('treatmentRecordNote', () => {
  it('새로 남긴 처치만 알린다', () => {
    expect(treatmentRecordNote([])).toBeNull()
    expect(treatmentRecordNote([{ kind: 'corticosteroid', treatedOn: '2026-10-13' }])).toBe(
      '🩹 10/13 스테로이드 주사 — 처치 기록에 남겨뒀어요. 앞으로 회복 안내에 반영할게요.'
    )
  })
})
