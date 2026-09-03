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

  it('프리뷰(요약)는 오늘 원을 채우고, 선택 모드(코치)는 고른 날을 채운다', () => {
    const preview = mount(WeekStrip, { props: { days, today: days[0].date } })
    const previewDiscs = preview.findAll('.week-strip-disc')
    expect(previewDiscs[0].classes()).toContain('is-filled')
    expect(previewDiscs[1].classes()).not.toContain('is-filled')

    const selecting = mount(WeekStrip, { props: { days, today: days[0].date, active: days[1].date } })
    const discs = selecting.findAll('.week-strip-disc')
    // 오늘이라도 고른 날이 아니면 안 채운다 — 채움은 '지금 보고 있는 날'을 뜻한다.
    expect(discs[0].classes()).not.toContain('is-filled')
    expect(discs[1].classes()).toContain('is-filled')
  })

  it('상태를 원 안팎에 싣는다 — 예정=타입 채움, 완료=링, 휴식=중립 채움(별도 마커 줄 없음)', () => {
    const w = mount(WeekStrip, {
      props: {
        days: [
          day({ date: '2026-09-01', label: '월 1', state: 'done', type: 'Easy' }),
          day({ date: '2026-09-02', label: '화 2', state: 'planned', type: 'Tempo' }),
          day({ date: '2026-09-03', label: '수 3', state: 'rested', type: null })
        ],
        today: '2026-09-04'
      }
    })
    const discs = w.findAll('.week-strip-disc')
    expect(discs[0].classes()).toContain('is-done')
    expect(discs[0].classes()).toContain('run-type-easy')
    expect(discs[1].classes()).toContain('has-session')
    expect(discs[2].classes()).toContain('is-rested')
    expect(discs[2].classes()).not.toContain('has-session')
    expect(w.find('.week-strip-mark').exists()).toBe(false)
    // 색/링만 남기면 스크린리더에서 상태가 사라진다.
    expect(w.findAll('.week-strip-day')[0].attributes('aria-label')).toContain('완료')
    expect(w.findAll('.week-strip-day')[2].attributes('aria-label')).toContain('휴식')
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
