<script setup lang="ts">
import { computed } from 'vue'
import UnitValue from '@/shared/ui/UnitValue.vue'

type MetricPairListItem = {
  id: string
  label: string
  value?: string | number | null
  unit?: string
  valueKind?: 'metric' | 'text'
}

const props = withDefaults(defineProps<{
  items: MetricPairListItem[]
  density?: 'regular' | 'compact' | 'dense'
  verticalDivider?: boolean
}>(), {
  verticalDivider: false
})

const rows = computed(() => {
  const nextRows: Array<[MetricPairListItem, MetricPairListItem | null]> = []
  for (let index = 0; index < props.items.length; index += 2) {
    nextRows.push([props.items[index], props.items[index + 1] ?? null])
  }
  return nextRows
})

function displayValue(value: MetricPairListItem['value']) {
  return value === null || value === undefined || value === '' ? '-' : value
}
</script>

<template>
  <div
    class="metric-pair-list"
    :class="[
      `metric-pair-list-density-${density ?? 'regular'}`,
      { 'metric-pair-list-vertical-divider': verticalDivider }
    ]"
  >
    <div v-for="row in rows" :key="row.map((item) => item?.id).join('-')" class="metric-pair-row">
      <article
        v-for="item in row"
        :key="item?.id ?? 'empty'"
        class="metric-pair-cell"
        :class="{
          'metric-pair-cell-empty': !item,
          'metric-pair-cell-text': item?.valueKind === 'text'
        }"
      >
        <template v-if="item">
          <span>{{ item.label }}</span>
          <strong>
            <UnitValue v-if="item.unit" :amount="displayValue(item.value)" :unit="item.unit" />
            <template v-else>{{ displayValue(item.value) }}</template>
          </strong>
        </template>
      </article>
    </div>
  </div>
</template>
