import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'

describe('BottomSheetSelect', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.body.className = ''
  })

  it('opens options in a teleported bottom sheet and emits the selected value', async () => {
    const wrapper = mount(BottomSheetSelect, {
      attachTo: document.body,
      props: {
        modelValue: 'Easy',
        label: '세션 타입',
        options: [
          { value: 'Easy', label: 'Easy' },
          { value: 'Tempo', label: 'Tempo' }
        ]
      }
    })

    await wrapper.get('button.bottom-sheet-trigger').trigger('click')

    expect(document.body.classList.contains('sheet-open')).toBe(true)
    expect(document.body.querySelector('.bottom-sheet-layer')).not.toBeNull()
    expect(document.body.textContent).toContain('Tempo')

    const tempoButton = [...document.body.querySelectorAll<HTMLButtonElement>('.bottom-sheet-option')]
      .find((button) => button.textContent?.includes('Tempo'))
    expect(tempoButton).toBeTruthy()
    tempoButton?.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Tempo'])
    expect(document.body.querySelector('.bottom-sheet-layer')).toBeNull()
    expect(document.body.classList.contains('sheet-open')).toBe(false)
  })
})
