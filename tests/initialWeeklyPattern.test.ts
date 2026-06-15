import { describe, expect, it } from 'vitest'
import {
  buildInitialWeeklyPattern,
  prescriptionTemplateById,
  slotsToWeeklyPattern
} from '@/shared/lib/coaching/initialWeeklyPattern'

describe('buildInitialWeeklyPattern (#329)', () => {
  it('가용 횟수만큼 슬롯을 만든다', () => {
    expect(buildInitialWeeklyPattern({ weeklyDays: 2, goal: '5k', level: 'beginner' })).toHaveLength(2)
    expect(buildInitialWeeklyPattern({ weeklyDays: 4, goal: '10k', level: 'intermediate' })).toHaveLength(4)
    expect(buildInitialWeeklyPattern({ weeklyDays: 5, goal: 'half', level: 'advanced' })).toHaveLength(5)
  })

  it('항상 롱런 세션을 1개 이상 포함하고 선호 요일에 배치한다', () => {
    const slots = buildInitialWeeklyPattern({ weeklyDays: 3, goal: '10k', level: 'intermediate', preferredLongRunDay: '일' })
    const long = slots.find((s) => s.templateId === 'lsd-easy-long' || s.templateId === 'steady-long')
    expect(long).toBeDefined()
    expect(long?.day).toBe('일')
  })

  it('입문자는 Tempo 대신 Easy 기반/Strides로 시작한다', () => {
    const slots = buildInitialWeeklyPattern({ weeklyDays: 4, goal: '10k', level: 'beginner' })
    expect(slots.some((s) => s.templateId === 'tempo-ceiling-165')).toBe(false)
    expect(slots.some((s) => s.templateId === 'easy-base')).toBe(true)
  })

  it('중급 이상 + 기록 목표는 Tempo를 포함한다', () => {
    const slots = buildInitialWeeklyPattern({ weeklyDays: 4, goal: '10k', level: 'intermediate' })
    expect(slots.some((s) => s.templateId === 'tempo-ceiling-165')).toBe(true)
  })

  it('하프/풀 중급↑ 롱런은 Steady Long을 쓴다', () => {
    const slots = buildInitialWeeklyPattern({ weeklyDays: 5, goal: 'half', level: 'intermediate' })
    expect(slots.some((s) => s.templateId === 'steady-long')).toBe(true)
  })

  it('부상 active면 고강도 처방을 안전 대체로 낮춘다', () => {
    const slots = buildInitialWeeklyPattern({ weeklyDays: 5, goal: '10k', level: 'advanced', hasActiveInjury: true })
    expect(slots.some((s) => s.templateId === 'cruise-interval' || s.templateId === '5k-check')).toBe(false)
    expect(slots.some((s) => s.templateId === 'easy-strides-8x')).toBe(false)
  })

  it('모든 슬롯의 templateId가 실제 처방 템플릿과 매핑된다', () => {
    const slots = buildInitialWeeklyPattern({ weeklyDays: 7, goal: 'full', level: 'advanced' })
    for (const slot of slots) {
      expect(prescriptionTemplateById(slot.templateId)).not.toBeNull()
    }
  })

  it('slotsToWeeklyPattern은 요일+처방명 문자열을 만든다', () => {
    const slots = buildInitialWeeklyPattern({ weeklyDays: 3, goal: '5k', level: 'novice' })
    const lines = slotsToWeeklyPattern(slots)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/요일:/)
  })
})
