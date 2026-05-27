import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StatCard from '@/shared/ui/StatCard.vue'

describe('StatCard', () => {
  it('renders metric values through UnitValue', () => {
    const wrapper = mount(StatCard, {
      props: {
        label: '이번 달',
        value: '5km'
      }
    })

    expect(wrapper.text()).toContain('5.00')
    expect(wrapper.text()).toContain('km')
  })

  it('keeps text values unparsed when valueKind is text', () => {
    const wrapper = mount(StatCard, {
      props: {
        label: '활성 목표',
        value: '10km 60분 달성',
        valueKind: 'text'
      }
    })

    expect(wrapper.text()).toContain('10km 60분 달성')
  })
})
