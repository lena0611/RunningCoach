<script setup lang="ts">
defineProps<{
  kicker?: string
  title: string
  detail?: string
  metric?: string
  tone?: 'default' | 'primary' | 'warning' | 'danger'
}>()
</script>

<template>
  <article class="list-row" :class="[`list-row-${tone || 'default'}`]">
    <div class="list-row-main">
      <span v-if="kicker" class="list-row-kicker">{{ kicker }}</span>
      <strong class="list-row-title">{{ title }}</strong>
      <span v-if="detail" class="list-row-detail">{{ detail }}</span>
      <slot />
    </div>
    <div v-if="metric || $slots.addon" class="list-row-addon">
      <strong v-if="metric" class="list-row-metric">{{ metric }}</strong>
      <slot name="addon" />
    </div>
  </article>
</template>
