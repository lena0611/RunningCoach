import { describe, expect, it } from 'vitest'
import { createSessionTitle } from './createSessionTitle'

describe('createSessionTitle', () => {
  it('uses weekday, day period, and running as the default title', () => {
    expect(
      createSessionTitle({
        date: '2026-05-26',
        startAt: '2026-05-26T21:30:00+09:00',
        type: 'Easy + Strides',
        weeklyPattern: ['화요일: Easy + Strides']
      })
    ).toBe('화요일 밤 러닝')
  })

  it('does not expose schedule scope or inferred type in the default title', () => {
    expect(
      createSessionTitle({
        date: '2026-05-25',
        startAt: '2026-05-25T07:30:00+09:00',
        type: 'Easy',
        weeklyPattern: ['화요일: Easy + Strides']
      })
    ).toBe('월요일 아침 러닝')
  })
})
