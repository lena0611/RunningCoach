import { describe, expect, it } from 'vitest'
import { memoryIntakeNote, type MemoryIntake } from '../supabase/functions/_shared/memoryIntake'

const intake = (over: Partial<MemoryIntake> = {}): MemoryIntake => ({ stored: [], skipped: [], ...over })

/*
  2026-09-08: "기억해줘"에 코치가 "기억해둘게요"라고 답하면서 실제로는 아무것도 안 남는 경우가 있었다.
  코치는 저장 결과를 모르는 채 답을 쓰므로(insert 는 그 뒤) 코드가 알린다.
*/
describe('memoryIntakeNote', () => {
  it('요청 턴에 저장이 됐으면 아무 말도 붙이지 않는다', () => {
    expect(memoryIntakeNote(intake({ stored: ['사용자는 12월에 제주도에서 달릴 계획이 있다.'] }), true)).toBeNull()
  })

  it('요청이 아닌 턴은 저장이 0이어도 붙이지 않는다', () => {
    expect(memoryIntakeNote(intake(), false)).toBeNull()
    expect(memoryIntakeNote(intake({ skipped: [{ content: 'x', reason: 'not-durable' }] }), false)).toBeNull()
  })

  it('이미 아는 내용이면 그렇다고 알린다 — 실패가 아니라 중복', () => {
    const note = memoryIntakeNote(intake({ skipped: [{ content: 'x', reason: 'already-known' }] }), true) ?? ''
    expect(note).toContain('이미 기억하고 있어서')
    expect(note).not.toContain('남기지 못했어요')
  })

  it('너무 짧으면 이유를 말하고 다시 말해달라고 한다', () => {
    const note = memoryIntakeNote(intake({ skipped: [{ content: '제주', reason: 'too-short' }] }), true) ?? ''
    expect(note).toContain('짧아서')
    expect(note).toContain('한 문장으로')
  })

  it('요청했는데 코치가 아무것도 안 담았으면 그 사실을 알린다 (조용한 실패 금지)', () => {
    const note = memoryIntakeNote(intake(), true) ?? ''
    expect(note).toContain('남기지 못했어요')
  })

  it('이미 아는 것과 짧은 것이 섞이면 중복 안내를 우선한다 (사용자에겐 실패가 아니다)', () => {
    const note = memoryIntakeNote(
      intake({ skipped: [{ content: 'a', reason: 'too-short' }, { content: 'b', reason: 'already-known' }] }),
      true
    ) ?? ''
    expect(note).toContain('이미 기억하고 있어서')
  })
})
