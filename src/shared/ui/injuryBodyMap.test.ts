import { describe, expect, it } from 'vitest'
import { injuryAreaCatalog } from '@/entities/training-memory/injuryAreas'
import { bodyMapViews } from './injuryBodyMap'

const mappedAreaIds = new Set(bodyMapViews.flatMap((view) => view.regions.map((region) => region.areaId)))

describe('injuryBodyMap', () => {
  it('카탈로그의 모든 부상 부위를 바디맵에서 고를 수 있다', () => {
    const unreachable = injuryAreaCatalog.filter((area) => !mappedAreaIds.has(area.id)).map((area) => area.id)
    expect(unreachable).toEqual([])
  })

  it('바디맵이 카탈로그에 없는 부위를 가리키지 않는다', () => {
    const known = new Set(injuryAreaCatalog.map((area) => area.id))
    const unknown = [...mappedAreaIds].filter((areaId) => !known.has(areaId))
    expect(unknown).toEqual([])
  })

  it('같은 뷰 안에서 부위가 중복 등장하지 않는다', () => {
    for (const view of bodyMapViews) {
      const ids = view.regions.map((region) => region.areaId)
      expect(new Set(ids).size, `${view.id} 뷰 중복`).toBe(ids.length)
    }
  })

  it('좌우 한 쌍인 부위는 한 뷰 안에서 양쪽 모두 고를 수 있다', () => {
    for (const view of bodyMapViews) {
      const ids = new Set(view.regions.map((region) => region.areaId))
      for (const areaId of ids) {
        if (!areaId.startsWith('left-') && !areaId.startsWith('right-')) continue
        const twin = areaId.startsWith('left-')
          ? areaId.replace(/^left-/, 'right-')
          : areaId.replace(/^right-/, 'left-')
        expect(ids.has(twin), `${view.id} 뷰에 ${twin} 없음`).toBe(true)
      }
    }
  })
})
