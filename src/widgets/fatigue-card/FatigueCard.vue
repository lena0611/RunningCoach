<script setup lang="ts">
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'

defineProps<{ warning: string }>()
</script>

<template>
  <SectionCard>
    <SectionHeader title="피로 경고" />
    <p>{{ warning }}</p>
  </SectionCard>
</template>
