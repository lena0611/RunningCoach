import { describe, expect, it } from 'vitest'
import { buildShortsMeta } from './shortsMeta'

describe('buildShortsMeta (쇼츠 프로필 줄·설명)', () => {
  const base = { date: '2026-11-06', title: '이지', distanceKm: 8, metaLine: '6:10~6:40/km' }

  it('대회 목표: D-day 알약 · 거리·페이스 설명 · 훈련·목표 해시태그(띄어쓰기 없이)', () => {
    expect(buildShortsMeta({ ...base, goal: { title: '가을 하프 마라톤', targetDate: '2026-11-29' } })).toEqual({
      dDay: 'D-23',
      caption: '8km · 6:10~6:40/km',
      tags: ['#이지', '#가을하프마라톤']
    })
  })

  it('대회 당일은 D-DAY, 지난 목표·날짜 없는 목표는 알약 없음', () => {
    expect(buildShortsMeta({ ...base, goal: { title: '하프', targetDate: '2026-11-06' } }).dDay).toBe('D-DAY')
    expect(buildShortsMeta({ ...base, goal: { title: '하프', targetDate: '2026-11-01' } }).dDay).toBe('')
    expect(buildShortsMeta({ ...base, goal: { title: '꾸준히 달리기', targetDate: null } }).dDay).toBe('')
  })

  it('목표 없음·거리 없음(걷기·뛰기 시간 처방)', () => {
    expect(buildShortsMeta({ ...base, title: '걷기·뛰기', distanceKm: null, metaLine: '약 30분', goal: null })).toEqual({
      dDay: '',
      caption: '약 30분',
      tags: ['#걷기·뛰기']
    })
  })
})
