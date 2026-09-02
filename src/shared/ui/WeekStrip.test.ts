import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WeekStrip, { type WeekStripDay } from './WeekStrip.vue'

// (#745) 요약·코치가 같은 "한 주"를 서로 다른 모양으로 보여줘 다른 것으로 읽혔다.
// 이제 한 컴포넌트가 두 모드를 낸다 — 프리뷰(요약)와 선택(코치).

function day(over: Partial<WeekStripDay> = {}): WeekStripDay {
  return { date: '2026-09-02', label: '수 2', state: 'today', chip: '이지', type: 'Easy', ...over }
}
const days = [day({ date: '2026-09-02', label: '수 2' }), day({ date: '2026-09-05', label: '토 5', state: 'future', type: 'LSD' })]

describe('WeekStrip (#745)', () => {
  it('고른 **날짜**를 실어 보낸다 — 예전엔 payload 가 없어 고른 날이 사라졌다', async () => {
    const w = mount(WeekStrip, { props: { days, today: '2026-09-02' } })
    await w.findAll('button')[1].trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['2026-09-05'])
  })

  it('active 없으면 프리뷰 — group 이고 탭 의미를 붙이지 않는다', () => {
    const w = mount(WeekStrip, { props: { days, today: '2026-09-02' } })
    expect(w.find('.week-strip').attributes('role')).toBe('group')
    expect(w.findAll('button')[0].attributes('role')).toBeUndefined()
    expect(w.find('.is-active').exists()).toBe(false)
  })

  it('active 를 주면 선택 위젯 — tablist/tab/aria-selected 를 낸다', () => {
    const w = mount(WeekStrip, { props: { days, today: '2026-09-02', active: '2026-09-05' } })
    expect(w.find('.week-strip').attributes('role')).toBe('tablist')
    const buttons = w.findAll('button')
    expect(buttons[1].attributes('role')).toBe('tab')
    expect(buttons[1].attributes('aria-selected')).toBe('true')
    expect(buttons[0].attributes('aria-selected')).toBe('false')
  })

  it('오늘과 선택은 다른 축이라 함께 표시된다', () => {
    const w = mount(WeekStrip, { props: { days, today: '2026-09-02', active: '2026-09-02' } })
    const first = w.findAll('button')[0]
    expect(first.classes()).toContain('is-today')
    expect(first.classes()).toContain('is-active')
  })

  it('같은 날 더블이면 ×2 배지를 단다', () => {
    const w = mount(WeekStrip, { props: { days: [day({ double: true })], today: '2026-09-02' } })
    expect(w.find('.week-strip-double').text()).toBe('×2')
    expect(w.find('button').attributes('aria-label')).toContain('같은 날 2세션')
  })

  it('프리뷰에서만 "코치 탭에서 보기"라고 말한다 — 선택 모드에선 이미 그 탭이다', () => {
    const preview = mount(WeekStrip, { props: { days, today: '2026-09-02' } })
    const picker = mount(WeekStrip, { props: { days, today: '2026-09-02', active: '2026-09-02' } })
    expect(preview.find('button').attributes('aria-label')).toContain('코치 탭에서 보기')
    expect(picker.find('button').attributes('aria-label')).not.toContain('코치 탭에서 보기')
  })
})
