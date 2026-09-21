import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * 시트/오버레이의 접근성 동작(#828).
 *
 * 2026-09-21 실측: `bottom-sheet-layer` 를 쓰는 시트 20개에 **Escape·포커스 트랩·포커스 복귀·
 * 배경 비활성이 전부 없었다.** `role="dialog"`·`aria-modal`·스크롤 잠금은 이미 있으므로 없는 것만 채운다.
 *
 * reka-ui 로도 같은 값을 얻을 수 있지만 스파이크에서 화면이 깨졌다 — 우리 CSS 는
 * `.bottom-sheet-layer`(fixed·grid·align-items:end)가 시트를 **자식으로 품는 것**을 전제하는데
 * 그쪽은 오버레이와 콘텐츠를 형제로 낸다. 시트 CSS 193줄을 다시 짜는 대신 이 94줄을 쓴다.
 *
 * ## 중첩 시트
 *
 * `CoachSessionOverlay` 안에서 `BottomSheetSelect` 가 열린다. 인스턴스마다 독립적으로 처리하면
 * ① 안쪽 시트를 닫을 때 배경 inert 가 풀려 **바깥 시트가 열린 채 배경이 살아나고**
 * ② Escape 한 번에 두 시트가 같이 닫힌다.
 * 그래서 열린 시트를 **스택**으로 들고, 최상단만 Escape·Tab 을 처리하며 inert 는 스택이 빌 때만 푼다.
 */

/** 열려 있는 시트 스택. 최상단만 키보드를 처리한다. */
const openSheets: symbol[] = []

/** Tab 순환 대상. `inert`·`hidden`·disabled 는 브라우저가 이미 제외하므로 조건을 더 얹지 않는다. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 앱 루트를 통째로 비활성화한다 — 스크린리더·Tab·포인터가 모두 시트 뒤로 새지 않는다. */
function syncBackgroundInert() {
  const appRoot = document.getElementById('app')
  if (!appRoot) return
  if (openSheets.length > 0) appRoot.setAttribute('inert', '')
  else appRoot.removeAttribute('inert')
}

export function useSheetA11y(open: Ref<boolean>, sheetRef: Ref<HTMLElement | null>, onClose: () => void) {
  const id = Symbol('sheet')
  /** 열기 직전 포커스 위치 — 닫을 때 여기로 돌려준다(키보드 사용자가 자리를 잃지 않게). */
  let previouslyFocused: HTMLElement | null = null

  function isTopmost() {
    return openSheets[openSheets.length - 1] === id
  }

  /**
   * 눈에 보이는 것만 센다.
   *
   * ⚠ `offsetParent !== null` 로 거르면 **jsdom 에서 전부 탈락한다** — 레이아웃 엔진이 없어
   * offsetParent 가 항상 null 이고 `checkVisibility` 도 없다(2026-09-21 실측, 테스트 3건 실패).
   * 브라우저에서는 `checkVisibility` 로 정확히 거르고, 없는 환경에서는 거르지 않는다 —
   * 시트는 `v-if` 로 렌더되므로 숨은 초점 대상이 섞일 여지가 작다.
   */
  function isVisible(el: HTMLElement): boolean {
    if (typeof el.checkVisibility === 'function') return el.checkVisibility()
    return true
  }

  function focusables(): HTMLElement[] {
    const root = sheetRef.value
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => isVisible(el) || el === document.activeElement
    )
  }

  function onKeydown(event: KeyboardEvent) {
    // 최상단 시트만 반응한다 — 중첩됐을 때 Escape 한 번에 전부 닫히면 안 된다.
    if (!open.value || !isTopmost()) return

    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const items = focusables()
    if (!items.length) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement as HTMLElement | null

    if (event.shiftKey && (active === first || !sheetRef.value?.contains(active))) {
      event.preventDefault()
      last.focus()
      return
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function release() {
    const index = openSheets.indexOf(id)
    if (index >= 0) openSheets.splice(index, 1)
    syncBackgroundInert()
  }

  /**
   * ⚠ `immediate: true` 가 필요하다. 부모가 `v-if` 로 **이미 열린 상태의 시트를 마운트**하는
   * 경우가 있는데, 기본 watch 는 초기값에 안 돌아서 그 시트만 조용히 접근성이 꺼진다
   * (2026-09-21 배선 테스트가 이걸 잡았다 — 라이브로는 못 봤을 결함이다).
   */
  watch(open, async (isOpen) => {
    if (isOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null
      openSheets.push(id)
      syncBackgroundInert()
      await nextTick()
      // 첫 포커스는 시트 안으로. 대상이 없으면 시트 자체에(role=dialog 라 읽힌다).
      ;(focusables()[0] ?? sheetRef.value)?.focus?.()
    } else {
      release()
      previouslyFocused?.focus?.()
      previouslyFocused = null
    }
  }, { immediate: true })

  // capture 로 잡는다 — 시트 안 버튼이 Escape 를 먼저 먹는 경우를 피한다.
  window.addEventListener('keydown', onKeydown, true)

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true)
    release()
  })
}
