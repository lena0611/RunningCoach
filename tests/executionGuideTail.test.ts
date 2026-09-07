import { describe, expect, it } from 'vitest'
import { buildExecutionGuideTail } from '../supabase/functions/_shared/executionGuideTail'

const strideStep = {
  label: '스트라이드',
  detail: "본런 끝에 15~20초(70~100m) × 4회 — 사이 60~90초 완전 걷기 회복"
}

describe('buildExecutionGuideTail (#795)', () => {
  it('실행 지침을 세션별로 옮기고 "이전 숫자는 폐기"를 못박는다', () => {
    const tail = buildExecutionGuideTail([
      { date: '2026-09-08', type: 'Easy + Strides', execution: [strideStep] }
    ])
    expect(tail).toContain('2026-09-08 Easy + Strides')
    expect(tail).toContain('스트라이드: 본런 끝에 15~20초')
    // 스레드 기억을 이기려면 폐기 선언이 같이 있어야 한다(지침만으로는 안 잡혔다).
    expect(tail).toContain('폐기된 값')
    expect(tail).toContain('여기 없는 세션은 실행 수치를 말하지 않는다')
  })

  it('지침이 없으면 붙이지 않는다 — 빈 꼬리표로 프롬프트를 늘리지 않는다', () => {
    expect(buildExecutionGuideTail(null)).toBe('')
    expect(buildExecutionGuideTail([])).toBe('')
    expect(buildExecutionGuideTail([{ date: '2026-09-08', type: 'Easy', execution: null }])).toBe('')
    expect(buildExecutionGuideTail([{ date: '2026-09-08', type: 'Easy', execution: [] }])).toBe('')
  })

  it('지침 있는 세션만 싣는다 — 먼 미래 세션은 숫자 없이 남는다', () => {
    const tail = buildExecutionGuideTail([
      { date: '2026-09-08', type: 'Easy + Strides', execution: [strideStep] },
      { date: '2026-09-20', type: 'LSD', execution: null }
    ])
    expect(tail).toContain('2026-09-08')
    expect(tail).not.toContain('2026-09-20')
  })

  it('망가진 항목을 건너뛴다', () => {
    const tail = buildExecutionGuideTail([
      null,
      { date: 1, type: {}, execution: [{ label: '본런', detail: '' }] },
      { date: '2026-09-08', type: 'Easy', execution: [{ label: '본런', detail: '40분 편한 강도' }] }
    ])
    expect(tail).toContain('본런: 40분 편한 강도')
    expect(tail.split('\n').filter((line) => line.startsWith('- ')).length).toBe(1)
  })
})
