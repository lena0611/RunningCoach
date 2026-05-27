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

  it('supports multiple selection with explicit confirmation', async () => {
    const wrapper = mount(BottomSheetSelect, {
      attachTo: document.body,
      props: {
        modelValue: ['Easy'],
        label: '세션 타입',
        multiple: true,
        allLabel: '모든 세션 유형',
        confirmLabel: '선택 적용',
        options: [
          { value: 'Easy', label: 'Easy' },
          { value: 'Tempo', label: 'Tempo' },
          { value: 'LSD', label: 'LSD' }
        ]
      }
    })

    expect(wrapper.text()).toContain('Easy')
    await wrapper.get('button.bottom-sheet-trigger').trigger('click')

    const tempoButton = [...document.body.querySelectorAll<HTMLButtonElement>('.bottom-sheet-option')]
      .find((button) => button.textContent?.includes('Tempo'))
    expect(tempoButton).toBeTruthy()
    tempoButton?.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    const confirmButton = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('선택 적용'))
    expect(confirmButton).toBeTruthy()
    confirmButton?.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['Easy', 'Tempo']])
    expect(document.body.querySelector('.bottom-sheet-layer')).toBeNull()
  })

  it('renders the all label when every option is selected', () => {
    const wrapper = mount(BottomSheetSelect, {
      props: {
        modelValue: ['Easy', 'Tempo'],
        label: '세션 타입',
        multiple: true,
        allLabel: '모든 세션 유형',
        options: [
          { value: 'Easy', label: 'Easy' },
          { value: 'Tempo', label: 'Tempo' }
        ]
      }
    })

    expect(wrapper.text()).toContain('모든 세션 유형')
  })
})
