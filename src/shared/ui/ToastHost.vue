<script setup lang="ts">
import { useToastStore } from '@/app/stores/toastStore'

const toastStore = useToastStore()
</script>

<template>
  <Transition :name="toastStore.current?.placement === 'top' ? 'toast-drop' : 'toast-rise'">
    <div
      v-if="toastStore.current"
      class="app-toast"
      :class="[`app-toast-${toastStore.current.tone}`, `app-toast-${toastStore.current.placement}`]"
      role="status"
    >
      {{ toastStore.current.message }}
    </div>
  </Transition>
</template>
