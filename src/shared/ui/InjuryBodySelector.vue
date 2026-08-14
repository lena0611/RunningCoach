<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  injuryAreaCatalog,
  injuryAreaGroups,
  injuryStructureLabels,
  getInjuryArea,
  getInjuryAreaLabel,
  type InjuryAreaSelection
} from '@/entities/training-memory/injuryAreas'
import { BODY_MAP_SIDE_LABEL_X, bodyMapViews, type BodyMapViewId } from './injuryBodyMap'
import ScaleSlider from './ScaleSlider.vue'
import SegmentTabs from './SegmentTabs.vue'

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

const activeView = ref<BodyMapViewId>('front')

const selectedIds = computed(() => new Set((props.modelValue ?? []).map((item) => item.areaId)))
const selectedAreas = computed(() =>
  (props.modelValue ?? [])
    .map((item) => ({ ...item, definition: getInjuryArea(item.areaId) }))
    .filter((item) => item.definition)
)
const activeViewDef = computed(() => bodyMapViews.find((view) => view.id === activeView.value) ?? bodyMapViews[0])
const viewTabItems = bodyMapViews.map((view) => ({ value: view.id, label: view.label }))

/** 현재 뷰에서는 보이지 않는 선택 부위가 있으면 어느 뷰에 있는지 알린다 */
const otherViewHint = computed(() => {
  const ids = selectedIds.value
  if (!ids.size) return ''
  const visibleHere = new Set(activeViewDef.value.regions.map((region) => region.areaId))
  const labels = bodyMapViews
    .filter((view) => view.id !== activeView.value)
    .filter((view) => view.regions.some((region) => ids.has(region.areaId) && !visibleHere.has(region.areaId)))
    .map((view) => view.label)
  return labels.length ? `${labels.join('·')} 뷰에도 선택한 부위가 있습니다` : ''
})

function areaLabel(areaId: string) {
  return getInjuryAreaLabel(areaId)
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

function removeArea(areaId: string) {
  emit('update:modelValue', (props.modelValue ?? []).filter((item) => item.areaId !== areaId))
}

function updatePain(areaId: string, painLevel: number | null) {
  emit('update:modelValue', (props.modelValue ?? []).map((item) => (item.areaId === areaId ? { ...item, painLevel } : item)))
}
</script>

<template>
  <div class="injury-body-selector full">
    <div class="injury-selector-head">
      <div>
        <span class="form-section-title">{{ label }}</span>
        <p class="helper">아픈 부위를 눌러 선택하세요. 선택한 부위마다 통증 레벨을 입력합니다.</p>
      </div>
      <span class="context-chip">{{ selectedAreas.length }}개 선택</span>
    </div>

    <section class="body-map-card" aria-label="인체 부위 선택">
      <SegmentTabs
        variant="segmented"
        aria-label="인체 방향"
        :items="viewTabItems"
        :active="activeView"
        @change="activeView = $event as BodyMapViewId"
      />

      <div class="body-map-stage">
        <svg
          class="body-map-svg"
          :class="`body-map-svg-${activeViewDef.id}`"
          :viewBox="activeViewDef.viewBox"
          role="group"
          :aria-label="`${activeViewDef.label} 인체 부위 선택`"
        >
          <image
            class="body-map-photo"
            :href="activeViewDef.image.href"
            :x="activeViewDef.image.x"
            :y="activeViewDef.image.y"
            :width="activeViewDef.image.width"
            :height="activeViewDef.image.height"
            preserveAspectRatio="none"
          />

          <g
            v-for="region in activeViewDef.regions"
            :key="region.areaId"
            class="body-map-region"
            :class="{ selected: selectedIds.has(region.areaId) }"
            role="button"
            tabindex="0"
            :aria-label="areaLabel(region.areaId)"
            :aria-pressed="selectedIds.has(region.areaId)"
            @click="toggleArea(region.areaId)"
            @keydown.enter.prevent="toggleArea(region.areaId)"
            @keydown.space.prevent="toggleArea(region.areaId)"
          >
            <title>{{ areaLabel(region.areaId) }}</title>
            <path :d="region.d" />
          </g>

          <text
            class="body-map-side"
            :x="BODY_MAP_SIDE_LABEL_X.left"
            :y="activeViewDef.sideLabelY"
            :font-size="activeViewDef.sideLabelSize"
          >
            {{ activeViewDef.screenLeftLabel }}
          </text>
          <text
            class="body-map-side"
            :x="BODY_MAP_SIDE_LABEL_X.right"
            :y="activeViewDef.sideLabelY"
            :font-size="activeViewDef.sideLabelSize"
          >
            {{ activeViewDef.screenRightLabel }}
          </text>
        </svg>
      </div>

      <p v-if="otherViewHint" class="body-map-note">{{ otherViewHint }}</p>

      <div v-if="selectedAreas.length" class="body-map-selected">
        <button
          v-for="selection in selectedAreas"
          :key="selection.areaId"
          type="button"
          class="body-map-selected-chip"
          :aria-label="`${areaLabel(selection.areaId)} 선택 해제`"
          @click="removeArea(selection.areaId)"
        >
          <span>{{ areaLabel(selection.areaId) }}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <details class="injury-area-finder">
        <summary>이름으로 찾기</summary>
        <article v-for="group in injuryAreaGroups" :key="group.id">
          <div class="injury-group-head">
            <strong>{{ group.label }}</strong>
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
              <small>{{ injuryStructureLabels[area.structure] }}</small>
            </button>
          </div>
        </article>
      </details>
    </section>

    <div v-if="selectedAreas.length" class="injury-pain-panel">
      <strong>부위별 통증 레벨</strong>
      <ScaleSlider
        v-for="selection in selectedAreas"
        :key="selection.areaId"
        :model-value="selection.painLevel"
        :label="getInjuryAreaLabel(selection.areaId)"
        :min="0"
        :max="5"
        min-label="0 없음"
        max-label="5 강함"
        @update:model-value="updatePain(selection.areaId, $event)"
      />
    </div>
  </div>
</template>
