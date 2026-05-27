import { computed, ref } from 'vue'

type BottomSheetDragOptions = {
  thresholdPx?: number
  velocityThreshold?: number
}

export function useBottomSheetDrag(onClose: () => void, options: BottomSheetDragOptions = {}) {
  const thresholdPx = options.thresholdPx ?? 88
  const velocityThreshold = options.velocityThreshold ?? 0.6
  const dragOffset = ref(0)
  const dragging = ref(false)
  const styleActive = ref(false)
  let startY = 0
  let startAt = 0
  let pointerId: number | null = null
  let settleTimer = 0

  const sheetStyle = computed(() => (
    styleActive.value
      ? { transform: `translate3d(0, ${Math.max(0, dragOffset.value)}px, 0)` }
      : {}
  ))

  function startDrag(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    window.clearTimeout(settleTimer)
    pointerId = event.pointerId
    startY = event.clientY
    startAt = performance.now()
    dragOffset.value = 0
    dragging.value = true
    styleActive.value = true
    const target = event.currentTarget as HTMLElement | null
    target?.setPointerCapture?.(event.pointerId)
    window.addEventListener('pointermove', moveDrag, { passive: false })
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', cancelDrag)
  }

  function moveDrag(event: PointerEvent) {
    if (pointerId !== null && event.pointerId !== pointerId) return
    const delta = event.clientY - startY
    dragOffset.value = delta > 0 ? delta : delta * 0.18
    if (delta > 6) event.preventDefault()
  }

  function endDrag(event: PointerEvent) {
    if (pointerId !== null && event.pointerId !== pointerId) return
    const elapsed = Math.max(1, performance.now() - startAt)
    const velocity = dragOffset.value / elapsed
    const shouldClose = dragOffset.value >= thresholdPx || velocity >= velocityThreshold
    cleanup()
    if (shouldClose) {
      onClose()
      return
    }
    dragOffset.value = 0
    settleTimer = window.setTimeout(() => {
      styleActive.value = false
    }, 180)
  }

  function cancelDrag() {
    cleanup()
    dragOffset.value = 0
    settleTimer = window.setTimeout(() => {
      styleActive.value = false
    }, 180)
  }

  function cleanup() {
    dragging.value = false
    pointerId = null
    window.removeEventListener('pointermove', moveDrag)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', cancelDrag)
  }

  return {
    dragging,
    sheetStyle,
    startDrag
  }
}
