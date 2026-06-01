<script setup lang="ts">
const props = defineProps<{
  kicker?: string
  title: string
  detail?: string
  metric?: string
  tone?: 'default' | 'primary' | 'warning' | 'danger'
  clickable?: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

function handleClick(event: MouseEvent) {
  if (props.clickable) emit('click', event)
}
</script>

<template>
  <component
    :is="clickable ? 'button' : 'article'"
    class="list-row"
    :class="[`list-row-${tone || 'default'}`, { 'list-row-has-leading': $slots.leading, 'list-row-clickable': clickable }]"
    :type="clickable ? 'button' : undefined"
    @click="handleClick"
  >
    <div v-if="$slots.leading" class="list-row-leading">
      <slot name="leading" />
    </div>
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
  </component>
</template>
