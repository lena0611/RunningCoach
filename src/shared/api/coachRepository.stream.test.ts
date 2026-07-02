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

  it('includes the server stage when a stream error carries one', () => {
    expect(() => {
      consumeCoachStreamEvents([
        { event: 'error', data: { error: 'duplicate key value violates unique constraint', stage: 'coach_memory_items.insert' } }
      ], vi.fn())
    }).toThrow('duplicate key value violates unique constraint [coach_memory_items.insert]')
  })
})
