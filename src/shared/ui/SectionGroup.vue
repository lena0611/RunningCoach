<script setup lang="ts">
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'

withDefaults(defineProps<{
  title: string
  compact?: boolean
  surface?: boolean
  surfaceVariant?: 'default' | 'subtle' | 'flat'
}>(), {
  surface: true
})
</script>

<template>
  <section class="section-group">
    <SectionHeader :title="title" :compact="compact">
      <slot name="actions" />
    </SectionHeader>
    <SectionCard v-if="surface" class="section-group-surface" :variant="surfaceVariant">
      <slot />
    </SectionCard>
    <slot v-else />
  </section>
</template>
