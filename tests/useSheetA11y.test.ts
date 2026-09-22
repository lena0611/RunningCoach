import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useSheetA11y } from '../src/shared/lib/useSheetA11y'

/**
 * #828 — 시트 접근성 동작 계약.
 *
 * 특히 **중첩 시트**를 잠근다. CoachSessionOverlay 안에서 BottomSheetSelect 가 열리는데,
 * 인스턴스별로 독립 처리하면 안쪽을 닫을 때 배경 inert 가 풀려 바깥 시트가 열린 채
 * 배경이 살아나고, Escape 한 번에 둘 다 닫힌다.
 */
function makeSheet(label: string) {
  const open = ref(false)
  const closed = ref(0)
  const Comp = defineComponent({
    setup() {
      const sheetRef = ref<HTMLElement | null>(null)
      useSheetA11y(open, sheetRef, () => {
        closed.value += 1
        open.value = false
      })
      return () =>
        open.value
          ? h('section', { ref: sheetRef, tabindex: -1, role: 'dialog' }, [
              h('button', { id: `${label}-first` }, '첫'),
              h('button', { id: `${label}-last` }, '끝')
            ])
          : null
    }
  })
  return { open, closed, Comp }
}

function press(key: string, shiftKey = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
}

let appRoot: HTMLElement
/** 열린 시트 스택은 모듈 전역이라 테스트마다 반드시 반납한다 — 안 하면 다음 테스트가 오염된다. */
const mounted: Array<{ unmount: () => void }> = []

beforeEach(() => {
  appRoot = document.createElement('div')
  appRoot.id = 'app'
  document.body.appendChild(appRoot)
})

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  appRoot.remove()
})

function mountSheet(Comp: Parameters<typeof mount>[0]) {
  const wrapper = mount(Comp, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

describe('단일 시트', () => {
  it('열면 배경이 inert 가 되고 닫으면 풀린다', async () => {
    const { open, Comp } = makeSheet('a')
    mountSheet(Comp)

    expect(appRoot.hasAttribute('inert')).toBe(false)
    open.value = true
    await nextTick()
    await nextTick()
    expect(appRoot.hasAttribute('inert')).toBe(true)

    open.value = false
    await nextTick()
    expect(appRoot.hasAttribute('inert')).toBe(false)
  })

  it('Escape 로 닫는다', async () => {
    const { open, closed, Comp } = makeSheet('a')
    mountSheet(Comp)
    open.value = true
    await nextTick()
    await nextTick()

    press('Escape')
    expect(closed.value).toBe(1)
  })

  it('닫히면 열기 전 포커스로 돌아간다', async () => {
    const trigger = document.createElement('button')
    trigger.id = 'trigger'
    appRoot.appendChild(trigger)
    trigger.focus()

    const { open, Comp } = makeSheet('a')
    mountSheet(Comp)
    open.value = true
    await nextTick()
    await nextTick()
    expect(document.activeElement?.id).toBe('a-first')

    open.value = false
    await nextTick()
    expect(document.activeElement?.id).toBe('trigger')
  })

  it('Tab 이 시트 밖으로 나가지 않는다 (마지막 → 처음)', async () => {
    const { open, Comp } = makeSheet('a')
    mountSheet(Comp)
    open.value = true
    await nextTick()
    await nextTick()

    document.getElementById('a-last')?.focus()
    press('Tab')
    expect(document.activeElement?.id).toBe('a-first')
  })

  it('Shift+Tab 이 처음에서 마지막으로 돈다', async () => {
    const { open, Comp } = makeSheet('a')
    mountSheet(Comp)
    open.value = true
    await nextTick()
    await nextTick()

    document.getElementById('a-first')?.focus()
    press('Tab', true)
    expect(document.activeElement?.id).toBe('a-last')
  })
})

describe('중첩 시트 (CoachSessionOverlay 안의 BottomSheetSelect)', () => {
  it('Escape 는 최상단 하나만 닫는다', async () => {
    const outer = makeSheet('outer')
    const inner = makeSheet('inner')
    mountSheet(outer.Comp)
    mountSheet(inner.Comp)

    outer.open.value = true
    await nextTick(); await nextTick()
    inner.open.value = true
    await nextTick(); await nextTick()

    press('Escape')
    expect(inner.closed.value).toBe(1)
    expect(outer.closed.value).toBe(0)
    expect(outer.open.value).toBe(true)
  })

  it('안쪽을 닫아도 바깥이 열려 있으면 배경은 계속 inert 다', async () => {
    const outer = makeSheet('outer')
    const inner = makeSheet('inner')
    mountSheet(outer.Comp)
    mountSheet(inner.Comp)

    outer.open.value = true
    await nextTick(); await nextTick()
    inner.open.value = true
    await nextTick(); await nextTick()
    expect(appRoot.hasAttribute('inert')).toBe(true)

    inner.open.value = false
    await nextTick()
    // 여기서 풀리면 바깥 시트가 열린 채 배경이 살아난다 — 이 테스트가 그 회귀를 막는다.
    expect(appRoot.hasAttribute('inert')).toBe(true)

    outer.open.value = false
    await nextTick()
    expect(appRoot.hasAttribute('inert')).toBe(false)
  })

  it('언마운트되면 스택에서 빠져 배경이 영영 잠기지 않는다', async () => {
    const { open, Comp } = makeSheet('a')
    const wrapper = mountSheet(Comp)
    open.value = true
    await nextTick(); await nextTick()
    expect(appRoot.hasAttribute('inert')).toBe(true)

    wrapper.unmount()
    expect(appRoot.hasAttribute('inert')).toBe(false)
  })
})

/**
 * 2026-09-22 실기기 사고 — **앱 전체가 먹통**이 됐다.
 *
 * 러닝 임포트 직후 뜬 부상 체크인 시트에서 닫기도 안 되고 아무것도 눌리지 않았다. 원인은
 * `#app` 에 건 `inert` 였다 — `Teleport` 없이 `#app` 안에 렌더되는 시트가 5개 있었는데
 * 거기에도 inert 를 걸어 **시트 자신까지 꺼졌다.**
 *
 * 배경 비활성은 시트가 `#app` 밖에 있을 때만 성립한다. 안에 있으면 걸지 않는다 —
 * 배경 비활성을 잃는 것이 앱이 잠기는 것보다 낫다.
 */
describe('시트가 #app 안에 있으면 배경을 잠그지 않는다 (2026-09-22 먹통 사고)', () => {
  /** Teleport 없이 #app 안에 렌더되는 시트. */
  function makeInAppSheet(label: string) {
    const open = ref(false)
    const closed = ref(0)
    const Comp = defineComponent({
      setup() {
        const sheetRef = ref<HTMLElement | null>(null)
        useSheetA11y(open, sheetRef, () => {
          closed.value += 1
          open.value = false
        })
        return () =>
          open.value
            ? h('section', { ref: sheetRef, tabindex: -1, role: 'dialog' }, [h('button', { id: `${label}-btn` }, '닫기')])
            : null
      }
    })
    return { open, closed, Comp }
  }

  it('#app 안에 렌더된 시트는 inert 를 걸지 않는다 — 걸면 시트가 죽는다', async () => {
    const { open, Comp } = makeInAppSheet('inapp')
    const wrapper = mount(Comp, { attachTo: appRoot })
    mounted.push(wrapper)

    open.value = true
    await nextTick()
    await nextTick()

    const sheet = appRoot.querySelector('[role="dialog"]')
    expect(sheet, '시트가 #app 안에 있어야 이 케이스다').toBeTruthy()
    expect(appRoot.hasAttribute('inert'), '시트가 #app 안인데 inert 를 걸면 앱 전체가 잠긴다').toBe(false)
  })

  it('그래도 Escape 는 동작한다 — 접근성의 나머지는 유지된다', async () => {
    const { open, closed, Comp } = makeInAppSheet('inapp2')
    const wrapper = mount(Comp, { attachTo: appRoot })
    mounted.push(wrapper)
    open.value = true
    await nextTick(); await nextTick()

    press('Escape')
    expect(closed.value).toBe(1)
  })

  it('#app 안 시트가 하나라도 열려 있으면 바깥 시트가 있어도 잠그지 않는다', async () => {
    const outside = makeSheet('outside')
    const inside = makeInAppSheet('inside')
    mountSheet(outside.Comp)
    const innerWrapper = mount(inside.Comp, { attachTo: appRoot })
    mounted.push(innerWrapper)

    outside.open.value = true
    await nextTick(); await nextTick()
    expect(appRoot.hasAttribute('inert'), '바깥 시트만 열렸을 때는 잠근다').toBe(true)

    inside.open.value = true
    await nextTick(); await nextTick()
    expect(appRoot.hasAttribute('inert'), '#app 안 시트가 열리면 풀어야 한다').toBe(false)
  })
})
