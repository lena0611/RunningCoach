<script setup lang="ts">
type InfoPairGridItem = {
  id?: string
  label: string
  value: string | number | null | undefined
}

withDefaults(defineProps<{
  items: InfoPairGridItem[]
  verticalDivider?: boolean
}>(), {
  verticalDivider: false
})

function displayValue(value: InfoPairGridItem['value']) {
  return value === null || value === undefined || value === '' ? '미입력' : value
}
</script>

<template>
  <div class="info-pair-grid" :class="{ 'info-pair-grid-vertical-divider': verticalDivider }">
    <div v-for="item in items" :key="item.id ?? item.label">
      <span>{{ item.label }}</span>
      <strong>{{ displayValue(item.value) }}</strong>
    </div>
  </div>
</template>
