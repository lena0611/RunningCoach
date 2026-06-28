import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'

function pointerEvent(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent
  Object.defineProperties(event, {
    button: { value: 0 },
    clientY: { value: clientY },
    pointerId: { value: 1 },
    pointerType: { value: 'touch' }
  })
  return event
}

describe('BottomSheetSelect', () => {
  afterEach(() => {
    vi.useRealTimers()
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

  it('animates drag dismissal and reopens without a stale drag transform', async () => {
    vi.useFakeTimers()
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

    const sheet = document.body.querySelector<HTMLElement>('.bottom-sheet')
    const handle = document.body.querySelector<HTMLElement>('.bottom-sheet-handle')
    expect(sheet).not.toBeNull()
    expect(handle).not.toBeNull()
    sheet!.getBoundingClientRect = () => ({
      bottom: 320,
      height: 320,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })

    handle!.dispatchEvent(pointerEvent('pointerdown', 0))
    window.dispatchEvent(pointerEvent('pointermove', 22))
    vi.advanceTimersByTime(160)
    window.dispatchEvent(pointerEvent('pointerup', 22))
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('.bottom-sheet-layer')).not.toBeNull()
    expect(sheet!.classList.contains('bottom-sheet-dragging')).toBe(false)
    expect(sheet!.getAttribute('style')).toContain('translate3d(0, 0px, 0)')

    vi.advanceTimersByTime(180)
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('.bottom-sheet-layer')).not.toBeNull()
    expect(sheet!.getAttribute('style') ?? '').not.toContain('translate3d')

    handle!.dispatchEvent(pointerEvent('pointerdown', 0))
    window.dispatchEvent(pointerEvent('pointermove', 120))
    await wrapper.vm.$nextTick()

    expect(sheet!.getAttribute('style')).toContain('translate3d(0, 120px, 0)')

    window.dispatchEvent(pointerEvent('pointerup', 120))
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('.bottom-sheet-layer')).not.toBeNull()
    expect(sheet!.getAttribute('style')).toContain('translate3d(0, 320px, 0)')

    vi.advanceTimersByTime(180)
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('.bottom-sheet-layer')).toBeNull()

    await wrapper.get('button.bottom-sheet-trigger').trigger('click')
    const reopenedSheet = document.body.querySelector<HTMLElement>('.bottom-sheet')
    expect(reopenedSheet).not.toBeNull()
    expect(reopenedSheet!.getAttribute('style') ?? '').not.toContain('translate3d')
  })
})
