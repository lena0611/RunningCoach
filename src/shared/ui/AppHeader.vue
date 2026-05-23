<script setup lang="ts">
defineProps<{ isAuthenticated: boolean }>()
const emit = defineEmits<{ signOut: [] }>()
</script>

<template>
  <header class="app-header">
    <div>
      <p class="eyebrow">RunContext</p>
      <h1>러닝 기록 코치</h1>
    </div>
    <button v-if="isAuthenticated" class="icon-action" type="button" aria-label="로그아웃" @click="emit('signOut')">
      Logout
    </button>
  </header>
</template>
