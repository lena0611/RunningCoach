<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToastStore } from '@/app/stores/toastStore'

const toastStore = useToastStore()
const dragging = ref(false)
const startY = ref(0)
const dragY = ref(0)

const toastStyle = computed(() => {
  if (!dragging.value || !toastStore.current) return undefined
  const allowed = toastStore.current.placement === 'top' ? Math.min(dragY.value, 0) : Math.max(dragY.value, 0)
  return {
    transform: `translateY(${allowed}px)`,
    opacity: String(Math.max(0.35, 1 - Math.abs(allowed) / 120))
  }
})

function onPointerDown(event: PointerEvent) {
  dragging.value = true
  startY.value = event.clientY
  dragY.value = 0
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  dragY.value = event.clientY - startY.value
}

function onPointerEnd() {
  if (!dragging.value) return
  const placement = toastStore.current?.placement
  const shouldDismiss = placement === 'top' ? dragY.value < -28 : dragY.value > 28
  dragging.value = false
  dragY.value = 0
  if (shouldDismiss) toastStore.clear()
}
</script>

<template>
  <!-- body로 teleport: 스택/코치 오버레이도 body로 teleport되므로, 같은 body 레벨에서 z-toast(1200)로
       오버레이(z 860~900) 위에 뜨게 한다. App.vue 내부에 두면 상위 스택 컨텍스트에 갇혀 상세 페이지 밑에 깔린다. -->
  <Teleport to="body">
    <Transition :name="toastStore.current?.placement === 'top' ? 'toast-drop' : 'toast-rise'">
      <div
        v-if="toastStore.current"
        :key="toastStore.current.id"
        class="app-toast"
        :class="[`app-toast-${toastStore.current.tone}`, `app-toast-${toastStore.current.placement}`, { 'app-toast-dragging': dragging }]"
        :style="toastStyle"
        role="status"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
      >
        {{ toastStore.current.message }}
      </div>
    </Transition>
  </Teleport>
</template>
