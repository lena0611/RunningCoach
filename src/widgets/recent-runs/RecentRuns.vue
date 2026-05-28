<script setup lang="ts">
import type { RunLog } from '@/entities/run/model'
import EmptyState from '@/shared/ui/EmptyState.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'

defineProps<{ runs: RunLog[]; weeklyPattern?: string[] }>()
defineEmits<{ showAll: [], select: [run: RunLog] }>()
</script>

<template>
  <SectionGroup title="최근 세션" :surface="false">
    <template #actions>
      <button class="icon-link-button" type="button" aria-label="전체 Run Log 보기" @click="$emit('showAll')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>
    </template>
    <RunSessionList v-if="runs.length" :runs="runs" :weekly-pattern="weeklyPattern" interactive @select="$emit('select', $event)" />
    <EmptyState v-else title="아직 저장된 러닝 기록이 없습니다." description="HealthKit 또는 FIT 파일로 첫 기록을 추가하세요." />
  </SectionGroup>
</template>
