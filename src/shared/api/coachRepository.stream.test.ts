import { describe, expect, it, vi } from 'vitest'
import { consumeCoachStreamEvents, drainSseBuffer } from './coachRepository'

describe('coachRepository streaming SSE helpers', () => {
  it('keeps a final done event that arrives without a trailing SSE terminator', () => {
    const raw = [
      'event: done',
      'data: {"report":{"id":"r1","selectedRunId":null,"userNote":"질문","report":"답변","createdAt":"2026-07-02T10:00:00Z"}}'
    ].join('\n')

    expect(drainSseBuffer(raw).events).toEqual([])

    const parsed = drainSseBuffer(`${raw}\n\n`)
    const report = consumeCoachStreamEvents(parsed.events, vi.fn())

    expect(parsed.rest).toBe('')
    expect(report?.id).toBe('r1')
    expect(report?.report).toBe('답변')
  })

  // #650: 진행 단계 표시. 서버 신호를 그대로 올려야 화면이 "지금 무슨 작업 중"을 정직하게 보여준다.
  it('reports known progress stages and keeps streaming', () => {
    const onStage = vi.fn()
    const onDelta = vi.fn()
    const report = consumeCoachStreamEvents([
      { event: 'stage', data: { stage: 'generating' } },
      { event: 'delta', data: { delta: '답' } },
      { event: 'stage', data: { stage: 'saving' } }
    ], onDelta, onStage)

    expect(report).toBeNull()
    expect(onDelta).toHaveBeenCalledWith('답')
    expect(onStage.mock.calls.map((call) => call[0])).toEqual(['generating', 'saving'])
  })

  // #652: 조회 단계는 조건 문구(detail)를 함께 올린다 — 진행 표시가 신뢰 장치를 겸한다.
  it('passes the querying stage detail through', () => {
    const onStage = vi.fn()
    consumeCoachStreamEvents(
      [{ event: 'stage', data: { stage: 'querying', detail: 'date gte 2026-06-01 · date lte 2026-06-30' } }],
      vi.fn(),
      onStage
    )
    expect(onStage).toHaveBeenCalledWith('querying', 'date gte 2026-06-01 · date lte 2026-06-30')
  })

  // 구·신 버전이 섞여도 깨지지 않아야 한다(모르는 단계는 무시하고 계속 읽는다).
  it('ignores unknown stages and stage events without a handler', () => {
    const onStage = vi.fn()
    expect(() => {
      consumeCoachStreamEvents([{ event: 'stage', data: { stage: 'compressing' } }], vi.fn(), onStage)
      consumeCoachStreamEvents([{ event: 'stage', data: { stage: 'generating' } }], vi.fn())
    }).not.toThrow()
    expect(onStage).not.toHaveBeenCalled()
  })

  it('includes the server stage when a stream error carries one', () => {
    expect(() => {
      consumeCoachStreamEvents([
        { event: 'error', data: { error: 'duplicate key value violates unique constraint', stage: 'coach_memory_items.insert' } }
      ], vi.fn())
    }).toThrow('duplicate key value violates unique constraint [coach_memory_items.insert]')
  })
})
