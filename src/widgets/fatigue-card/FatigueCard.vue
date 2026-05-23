<script setup lang="ts">
import SectionCard from '@/shared/ui/SectionCard.vue'

defineProps<{ warning: string }>()
</script>

<template>
  <SectionCard>
    <div class="section-heading">
      <h2>피로 경고</h2>
    </div>
    <p>{{ warning }}</p>
  </SectionCard>
</template>
