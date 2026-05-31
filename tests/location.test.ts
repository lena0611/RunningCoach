import { describe, expect, it } from 'vitest'
import { formatLocationAddress } from '@/shared/lib/location'

describe('formatLocationAddress', () => {
  it('keeps borough level for special and metropolitan cities', () => {
    expect(formatLocationAddress({
      province: '서울특별시',
      borough: '강남구'
    })).toBe('서울특별시 강남구')

    expect(formatLocationAddress({
      province: '부산광역시',
      city: '부산광역시',
      borough: '수영구'
    })).toBe('부산광역시 수영구')

    expect(formatLocationAddress({
      city: '대전광역시',
      city_district: '유성구'
    })).toBe('대전광역시 유성구')

    expect(formatLocationAddress({
      province: '부산광역시',
      city: '수영구',
      suburb: '민락동'
    })).toBe('부산광역시 수영구')
  })

  it('keeps city level for provinces without forcing a district', () => {
    expect(formatLocationAddress({
      province: '경기도',
      city: '성남시',
      suburb: '분당구'
    })).toBe('경기도 성남시')
  })
})
