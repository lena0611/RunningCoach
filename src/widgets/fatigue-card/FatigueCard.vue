<script setup lang="ts">
import SectionGroup from '@/shared/ui/SectionGroup.vue'

defineProps<{ warning: string }>()
</script>

<template>
  <SectionGroup title="피로 경고">
    <p>{{ warning }}</p>
  </SectionGroup>
</template>
