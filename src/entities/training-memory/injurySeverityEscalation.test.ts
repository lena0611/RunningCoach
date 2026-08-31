import { describe, expect, it } from 'vitest'
import type { TrainingInjuryItem } from './model'
import { normalizeTrainingMemory, stampInjurySeverityEscalation } from './model'

// (#727) 부상 악화 도장. 메모리엔 **현재 심각도만** 남아서 "나빠졌다"를 알 방법이 없었다 —
// 라이터가 셋(메모리 편집·부상 체크인·코치 승인)이라 각자 찍게 하면 드리프트가 나므로,
// 셋이 모두 지나가는 수렴점에서 직전 값과 대조해 한 번만 찍는다.

const NOW = '2026-06-20T01:00:00.000Z'

function item(over: Partial<TrainingInjuryItem> = {}): TrainingInjuryItem {
  return { id: 'i1', title: '발바닥', status: 'active', severity: 2, ...over } as TrainingInjuryItem
}

describe('stampInjurySeverityEscalation (#727)', () => {
  it('심각도가 오르면 도장을 찍고 직전 값을 남긴다', () => {
    const [out] = stampInjurySeverityEscalation([item({ severity: 2 })], [item({ severity: 4 })], NOW)
    expect(out.severityRaisedAt).toBe(NOW)
    expect(out.severityRaisedFrom).toBe(2)
  })

  it('내려가면 도장을 지운다 — 낡은 도장이 "다시 쉬자" 카드를 붙잡으면 나아진 사람을 계속 말리게 된다', () => {
    const prev = [item({ severity: 4 })]
    const next = [item({ severity: 1, severityRaisedAt: NOW, severityRaisedFrom: 2 })]
    const [out] = stampInjurySeverityEscalation(prev, next, '2026-06-21T00:00:00.000Z')
    expect(out.severityRaisedAt).toBeNull()
    expect(out.severityRaisedFrom).toBeNull()
  })

  it('해소(resolved)되면 심각도가 그대로여도 도장을 지운다', () => {
    const prev = [item({ severity: 4 })]
    const next = [item({ severity: 4, status: 'resolved', severityRaisedAt: NOW, severityRaisedFrom: 2 })]
    const [out] = stampInjurySeverityEscalation(prev, next, '2026-06-21T00:00:00.000Z')
    expect(out.severityRaisedAt).toBeNull()
  })

  it('같은 심각도로 다른 필드만 저장하면 도장을 유지한다 — 안 그러면 카드가 깜빡인다', () => {
    const prev = [item({ severity: 4, severityRaisedAt: NOW, severityRaisedFrom: 2 })]
    const next = [item({ severity: 4, notes: '메모 수정', severityRaisedAt: NOW, severityRaisedFrom: 2 })]
    const [out] = stampInjurySeverityEscalation(prev, next, '2026-06-22T00:00:00.000Z')
    expect(out.severityRaisedAt).toBe(NOW)
    expect(out.severityRaisedFrom).toBe(2)
  })

  it('신규 부상(직전 값 없음)은 악화가 아니다 — 처음 등록을 악화로 오인하지 않는다', () => {
    const [out] = stampInjurySeverityEscalation([], [item({ severity: 5 })], NOW)
    expect(out.severityRaisedAt).toBeUndefined()
  })

  it('여러 항목 중 오른 것만 찍는다', () => {
    const prev = [item({ id: 'a', severity: 2 }), item({ id: 'b', severity: 3 })]
    const next = [item({ id: 'a', severity: 4 }), item({ id: 'b', severity: 3 })]
    const out = stampInjurySeverityEscalation(prev, next, NOW)
    expect(out.find((i) => i.id === 'a')?.severityRaisedAt).toBe(NOW)
    expect(out.find((i) => i.id === 'b')?.severityRaisedAt).toBeUndefined()
  })

  it('정규화가 도장을 보존한다 — 재구성 whitelist 라 빠뜨리면 저장 즉시 유실된다', () => {
    const memory = normalizeTrainingMemory({
      injuryItems: [{ title: '발바닥', status: 'active', severityRaisedAt: NOW, severityRaisedFrom: 2 }]
    } as never)
    expect(memory.injuryItems[0].severityRaisedAt).toBe(NOW)
    expect(memory.injuryItems[0].severityRaisedFrom).toBe(2)
  })
})
