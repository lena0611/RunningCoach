import { describe, expect, it } from 'vitest'
import { filterInjuryItemsForRunDate, getActiveInjuryItemForRunDate } from '../supabase/functions/coach-run/injuryTemporalFilter'

describe('injuryTemporalFilter', () => {
  const injuries = [
    {
      id: 'old-hamstring',
      title: '과거 햄스트링',
      status: 'monitoring',
      onsetDate: '2026-05-01'
    },
    {
      id: 'new-foot',
      title: '오른발 발바닥 통증',
      status: 'active',
      onsetDate: '2026-05-24'
    }
  ]

  it('excludes injuries that started after the selected run date', () => {
    expect(filterInjuryItemsForRunDate(injuries, '2026-05-23').map((item) => (item as { id: string }).id)).toEqual(['old-hamstring'])
  })

  it('keeps injuries that existed on the selected run date', () => {
    expect(filterInjuryItemsForRunDate(injuries, '2026-05-24').map((item) => (item as { id: string }).id)).toEqual(['old-hamstring', 'new-foot'])
  })

  it('falls back to an available temporal injury when active injury belongs to the future', () => {
    const active = getActiveInjuryItemForRunDate({ activeInjuryItemId: 'new-foot' }, injuries, '2026-05-23')
    expect((active as { id: string }).id).toBe('old-hamstring')
  })
})
