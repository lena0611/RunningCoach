<script setup lang="ts">
import { useToastStore } from '@/app/stores/toastStore'

const toastStore = useToastStore()
</script>

<template>
  <Transition name="toast-pop">
    <div v-if="toastStore.current" class="app-toast" :class="`app-toast-${toastStore.current.tone}`" role="status">
      {{ toastStore.current.message }}
    </div>
  </Transition>
</template>
