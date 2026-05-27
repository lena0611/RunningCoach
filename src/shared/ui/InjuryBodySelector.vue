<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  injuryAreaCatalog,
  injuryAreaGroups,
  getInjuryArea,
  getInjuryAreaLabel,
  type InjuryAreaSelection,
  type InjuryBodyView
} from '@/entities/training-memory/injuryAreas'
import ScaleSlider from './ScaleSlider.vue'

const props = withDefaults(
  defineProps<{
    modelValue: InjuryAreaSelection[]
    label?: string
  }>(),
  {
    label: '부상 부위'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: InjuryAreaSelection[]]
}>()

const views: Array<{ id: InjuryBodyView; label: string }> = [
  { id: 'front', label: '전면' },
  { id: 'right', label: '우측' },
  { id: 'back', label: '후면' },
  { id: 'left', label: '좌측' }
]
const activeView = ref<InjuryBodyView>('front')
const dragStartX = ref<number | null>(null)

const activeAreas = computed(() => injuryAreaCatalog.filter((area) => area.views.includes(activeView.value)))
const selectedIds = computed(() => new Set((props.modelValue ?? []).map((item) => item.areaId)))
const selectedAreas = computed(() => (props.modelValue ?? []).map((item) => ({ ...item, definition: getInjuryArea(item.areaId) })).filter((item) => item.definition))

function selectView(direction: 1 | -1) {
  const current = views.findIndex((view) => view.id === activeView.value)
  activeView.value = views[(current + direction + views.length) % views.length].id
}

function setView(view: InjuryBodyView) {
  activeView.value = view
}

function toggleArea(areaId: string) {
  const next = [...(props.modelValue ?? [])]
  const index = next.findIndex((item) => item.areaId === areaId)
  if (index >= 0) {
    next.splice(index, 1)
  } else {
    next.push({ areaId, painLevel: null })
  }
  emit('update:modelValue', next)
}

function updatePain(areaId: string, painLevel: number | null) {
  emit('update:modelValue', (props.modelValue ?? []).map((item) => item.areaId === areaId ? { ...item, painLevel } : item))
}

function onPointerDown(event: PointerEvent) {
  dragStartX.value = event.clientX
}

function onPointerUp(event: PointerEvent) {
  if (dragStartX.value === null) return
  const diff = event.clientX - dragStartX.value
  dragStartX.value = null
  if (Math.abs(diff) < 36) return
  selectView(diff < 0 ? 1 : -1)
}
</script>

<template>
  <div class="injury-body-selector full">
    <div class="injury-selector-head">
      <div>
        <span class="form-section-title">{{ label }}</span>
        <p class="helper">전신을 돌리거나 아래 목록에서 복수 선택하세요. 통증 레벨은 부위별로 따로 기록합니다.</p>
      </div>
      <span class="context-chip">{{ selectedAreas.length }}개 선택</span>
    </div>

    <div class="injury-body-layout">
      <section class="body-view-card" aria-label="인체 부위 선택">
        <div class="body-view-toolbar">
          <button type="button" aria-label="이전 방향" @click="selectView(-1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div class="body-view-tabs">
            <button
              v-for="view in views"
              :key="view.id"
              type="button"
              :class="{ active: activeView === view.id }"
              @click="setView(view.id)"
            >
              {{ view.label }}
            </button>
          </div>
          <button type="button" aria-label="다음 방향" @click="selectView(1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>

        <div class="body-silhouette-stage" @pointerdown="onPointerDown" @pointerup="onPointerUp">
          <svg class="body-silhouette" viewBox="0 0 100 112" role="img" aria-label="터치 가능한 인체 모델">
            <defs>
              <linearGradient id="bodyGradient" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stop-color="var(--color-surface-2)" />
                <stop offset="100%" stop-color="var(--color-surface)" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="13" r="8" class="body-base" />
            <path class="body-base" d="M40 23h20l6 23-8 4 5 54H52l-2-34-2 34H37l5-54-8-4 6-23Z" />
            <path class="body-guide" d="M50 23v81" />
            <g
              v-for="area in activeAreas"
              :key="area.id"
              class="body-area-zone"
              :class="{ selected: selectedIds.has(area.id) }"
              role="button"
              tabindex="0"
              :aria-label="area.label"
              @click="toggleArea(area.id)"
              @keydown.enter.prevent="toggleArea(area.id)"
              @keydown.space.prevent="toggleArea(area.id)"
            >
              <rect :x="area.x" :y="area.y" :width="area.width" :height="area.height" rx="4" />
            </g>
          </svg>
          <div class="body-view-label">{{ views.find((view) => view.id === activeView)?.label }}</div>
        </div>
      </section>

      <section class="injury-area-list" aria-label="부위 목록 선택">
        <article v-for="group in injuryAreaGroups" :key="group.id">
          <div class="injury-group-head">
            <strong>{{ group.label }}</strong>
            <small>{{ group.description }}</small>
          </div>
          <div class="injury-area-chip-grid">
            <button
              v-for="area in injuryAreaCatalog.filter((item) => item.group === group.id)"
              :key="area.id"
              type="button"
              :class="{ selected: selectedIds.has(area.id) }"
              @click="toggleArea(area.id)"
            >
              <span>{{ area.shortLabel }}</span>
              <small>{{ area.structure }}</small>
            </button>
          </div>
        </article>
      </section>
    </div>

    <div v-if="selectedAreas.length" class="injury-pain-panel">
      <strong>부위별 통증 레벨</strong>
      <ScaleSlider
        v-for="selection in selectedAreas"
        :key="selection.areaId"
        :model-value="selection.painLevel"
        :label="getInjuryAreaLabel(selection.areaId)"
        :min="1"
        :max="5"
        min-label="조용함"
        max-label="강함"
        @update:model-value="updatePain(selection.areaId, $event)"
      />
    </div>
  </div>
</template>
