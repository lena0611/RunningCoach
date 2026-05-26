import { describe, expect, it } from 'vitest'
import { createSessionTitle } from './createSessionTitle'

describe('createSessionTitle', () => {
  it('marks a weekly routine match as scheduled', () => {
    expect(
      createSessionTitle({
        date: '2026-05-26',
        startAt: '2026-05-26T21:30:00+09:00',
        type: 'Easy + Strides',
        weeklyPattern: ['화요일: Easy + Strides']
      })
    ).toBe('[스케줄] [밤] Easy + Strides')
  })

  it('marks non-routine runs as extra', () => {
    expect(
      createSessionTitle({
        date: '2026-05-25',
        startAt: '2026-05-25T07:30:00+09:00',
        type: 'Easy',
        weeklyPattern: ['화요일: Easy + Strides']
      })
    ).toBe('[추가] [아침] Easy')
  })
})
