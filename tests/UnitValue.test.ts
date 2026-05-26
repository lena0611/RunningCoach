import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UnitValue from '@/shared/ui/UnitValue.vue'

describe('UnitValue', () => {
  it('renders km distances with two decimals', () => {
    const wrapper = mount(UnitValue, {
      props: {
        amount: 5,
        unit: 'km'
      }
    })

    expect(wrapper.text()).toContain('5.00')
    expect(wrapper.text()).toContain('km')
  })

  it('formats parsed km value strings with two decimals', () => {
    const wrapper = mount(UnitValue, {
      props: {
        value: '5km'
      }
    })

    expect(wrapper.text()).toContain('5.00')
    expect(wrapper.text()).toContain('km')
  })

  it('keeps non-distance units unchanged', () => {
    const wrapper = mount(UnitValue, {
      props: {
        amount: 100,
        unit: '%'
      }
    })

    expect(wrapper.text()).toContain('100')
    expect(wrapper.text()).not.toContain('100.00')
  })
})
