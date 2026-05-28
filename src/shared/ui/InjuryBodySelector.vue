<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  injuryAreaCatalog,
  injuryAreaGroups,
  getInjuryArea,
  getInjuryAreaLabel,
  type InjuryAreaSelection
} from '@/entities/training-memory/injuryAreas'
import ScaleSlider from './ScaleSlider.vue'

type BodyModelId = 'upper' | 'lower' | 'foot'
type AnatomicalViewId = 'front' | 'right' | 'back' | 'left'
type BodyViewId =
  | 'deg0'
  | 'deg45'
  | 'deg90'
  | 'deg135'
  | 'deg180'
  | 'deg225'
  | 'deg270'
  | 'deg315'
  | 'deg360'
  | 'footTop'
  | 'footSole'

type BodyViewOption = {
  id: BodyViewId
  label: string
  imageKey: string
  anatomicalView: AnatomicalViewId
  kind: 'around' | 'top' | 'sole'
}

type HitZone = {
  id: string
  label: string
  model: BodyModelId
  views: BodyViewId[]
  x: number
  y: number
  width: number
  height: number
  candidates: string[]
}

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

const frameImages: Record<string, string> = {
  'upper-0': new URL('../assets/body-models/frames/upper-0.png', import.meta.url).href,
  'upper-45': new URL('../assets/body-models/frames/upper-45.png', import.meta.url).href,
  'upper-90': new URL('../assets/body-models/frames/upper-90.png', import.meta.url).href,
  'upper-135': new URL('../assets/body-models/frames/upper-135.png', import.meta.url).href,
  'upper-180': new URL('../assets/body-models/frames/upper-180.png', import.meta.url).href,
  'upper-225': new URL('../assets/body-models/frames/upper-225.png', import.meta.url).href,
  'upper-270': new URL('../assets/body-models/frames/upper-270.png', import.meta.url).href,
  'upper-315': new URL('../assets/body-models/frames/upper-315.png', import.meta.url).href,
  'upper-360': new URL('../assets/body-models/frames/upper-360.png', import.meta.url).href,
  'lower-0': new URL('../assets/body-models/frames/lower-0.png', import.meta.url).href,
  'lower-45': new URL('../assets/body-models/frames/lower-45.png', import.meta.url).href,
  'lower-90': new URL('../assets/body-models/frames/lower-90.png', import.meta.url).href,
  'lower-135': new URL('../assets/body-models/frames/lower-135.png', import.meta.url).href,
  'lower-180': new URL('../assets/body-models/frames/lower-180.png', import.meta.url).href,
  'lower-225': new URL('../assets/body-models/frames/lower-225.png', import.meta.url).href,
  'lower-270': new URL('../assets/body-models/frames/lower-270.png', import.meta.url).href,
  'lower-315': new URL('../assets/body-models/frames/lower-315.png', import.meta.url).href,
  'lower-360': new URL('../assets/body-models/frames/lower-360.png', import.meta.url).href,
  'foot-front': new URL('../assets/body-models/frames/foot-front.png', import.meta.url).href,
  'foot-outer': new URL('../assets/body-models/frames/foot-outer.png', import.meta.url).href,
  'foot-back': new URL('../assets/body-models/frames/foot-back.png', import.meta.url).href,
  'foot-inner': new URL('../assets/body-models/frames/foot-inner.png', import.meta.url).href,
  'foot-top': new URL('../assets/body-models/frames/foot-top.png', import.meta.url).href,
  'foot-sole': new URL('../assets/body-models/frames/foot-sole.png', import.meta.url).href
}

const bodyModelOptions: Array<{ id: BodyModelId; label: string; description: string }> = [
  { id: 'upper', label: '상체/허리', description: '허리, 골반 주변' },
  { id: 'lower', label: '하체', description: '대퇴, 무릎, 정강이, 종아리' },
  { id: 'foot', label: '발/발목', description: '아킬레스, 발목, 족저' }
]

const aroundViews = (model: 'upper' | 'lower'): BodyViewOption[] => [
  { id: 'deg0', label: '0°', imageKey: `${model}-0`, anatomicalView: 'front', kind: 'around' },
  { id: 'deg45', label: '45°', imageKey: `${model}-45`, anatomicalView: 'front', kind: 'around' },
  { id: 'deg90', label: '90°', imageKey: `${model}-90`, anatomicalView: 'right', kind: 'around' },
  { id: 'deg135', label: '135°', imageKey: `${model}-135`, anatomicalView: 'right', kind: 'around' },
  { id: 'deg180', label: '180°', imageKey: `${model}-180`, anatomicalView: 'back', kind: 'around' },
  { id: 'deg225', label: '225°', imageKey: `${model}-225`, anatomicalView: 'back', kind: 'around' },
  { id: 'deg270', label: '270°', imageKey: `${model}-270`, anatomicalView: 'left', kind: 'around' },
  { id: 'deg315', label: '315°', imageKey: `${model}-315`, anatomicalView: 'left', kind: 'around' },
  { id: 'deg360', label: '360°', imageKey: `${model}-360`, anatomicalView: 'front', kind: 'around' }
]

const footViewOptions: BodyViewOption[] = [
  { id: 'deg0', label: '전면', imageKey: 'foot-front', anatomicalView: 'front', kind: 'around' },
  { id: 'deg90', label: '외측', imageKey: 'foot-outer', anatomicalView: 'right', kind: 'around' },
  { id: 'deg180', label: '후면', imageKey: 'foot-back', anatomicalView: 'back', kind: 'around' },
  { id: 'deg270', label: '내측', imageKey: 'foot-inner', anatomicalView: 'left', kind: 'around' },
  { id: 'footTop', label: '발등', imageKey: 'foot-top', anatomicalView: 'front', kind: 'top' },
  { id: 'footSole', label: '발바닥', imageKey: 'foot-sole', anatomicalView: 'front', kind: 'sole' }
]

const hitZones: HitZone[] = [
  { id: 'upper-lower-back', label: '허리/골반 뒤쪽', model: 'upper', views: ['deg180', 'deg225', 'deg270'], x: 39, y: 43, width: 22, height: 28, candidates: ['lower-back', 'left-hip', 'right-hip'] },
  { id: 'upper-front-hip', label: '골반 앞쪽', model: 'upper', views: ['deg0', 'deg45', 'deg315', 'deg360'], x: 38, y: 63, width: 24, height: 17, candidates: ['left-hip', 'right-hip'] },

  { id: 'lower-left-front-thigh', label: '좌측 앞 허벅지', model: 'lower', views: ['deg0', 'deg45', 'deg360'], x: 31, y: 35, width: 15, height: 27, candidates: ['left-quadriceps', 'left-it-band'] },
  { id: 'lower-right-front-thigh', label: '우측 앞 허벅지', model: 'lower', views: ['deg0', 'deg315', 'deg360'], x: 54, y: 35, width: 15, height: 27, candidates: ['right-quadriceps', 'right-it-band'] },
  { id: 'lower-left-knee-shin', label: '좌측 무릎/정강이', model: 'lower', views: ['deg0', 'deg45', 'deg360'], x: 29, y: 58, width: 16, height: 27, candidates: ['left-knee', 'left-shin'] },
  { id: 'lower-right-knee-shin', label: '우측 무릎/정강이', model: 'lower', views: ['deg0', 'deg315', 'deg360'], x: 55, y: 58, width: 16, height: 27, candidates: ['right-knee', 'right-shin'] },
  { id: 'lower-back-thigh-left', label: '좌측 뒤 허벅지', model: 'lower', views: ['deg135', 'deg180', 'deg225'], x: 29, y: 36, width: 17, height: 28, candidates: ['left-hamstring', 'left-it-band'] },
  { id: 'lower-back-thigh-right', label: '우측 뒤 허벅지', model: 'lower', views: ['deg135', 'deg180', 'deg225'], x: 54, y: 36, width: 17, height: 28, candidates: ['right-hamstring', 'right-it-band'] },
  { id: 'lower-back-calf-left', label: '좌측 종아리', model: 'lower', views: ['deg135', 'deg180', 'deg225', 'deg270'], x: 30, y: 62, width: 15, height: 25, candidates: ['left-calf', 'left-achilles'] },
  { id: 'lower-back-calf-right', label: '우측 종아리', model: 'lower', views: ['deg90', 'deg135', 'deg180', 'deg225'], x: 55, y: 62, width: 15, height: 25, candidates: ['right-calf', 'right-achilles'] },
  { id: 'lower-side-leg', label: '측면 다리', model: 'lower', views: ['deg90', 'deg270'], x: 37, y: 36, width: 25, height: 50, candidates: ['left-it-band', 'right-it-band', 'left-knee', 'right-knee', 'left-shin', 'right-shin', 'left-calf', 'right-calf'] },

  { id: 'foot-front-ankle', label: '발목 앞쪽', model: 'foot', views: ['deg0'], x: 32, y: 18, width: 36, height: 28, candidates: ['left-ankle', 'right-ankle'] },
  { id: 'foot-back-achilles', label: '아킬레스/뒤꿈치', model: 'foot', views: ['deg180'], x: 32, y: 20, width: 36, height: 30, candidates: ['left-achilles', 'right-achilles'] },
  { id: 'foot-side-ankle', label: '발목 측면', model: 'foot', views: ['deg90', 'deg270'], x: 24, y: 28, width: 52, height: 28, candidates: ['left-ankle', 'right-ankle', 'left-achilles', 'right-achilles'] },
  { id: 'foot-top-forefoot', label: '발등/앞발', model: 'foot', views: ['footTop'], x: 24, y: 32, width: 52, height: 34, candidates: ['left-ankle', 'right-ankle', 'left-plantar-fascia', 'right-plantar-fascia'] },
  { id: 'foot-sole-plantar', label: '발바닥/족저', model: 'foot', views: ['footSole'], x: 24, y: 24, width: 52, height: 50, candidates: ['left-plantar-fascia', 'right-plantar-fascia'] }
]

const activeModel = ref<BodyModelId>('lower')
const activeView = ref<BodyViewId>('deg0')
const pendingZoneId = ref('')
const dragStartX = ref<number | null>(null)
const dragMoved = ref(false)

const selectedIds = computed(() => new Set((props.modelValue ?? []).map((item) => item.areaId)))
const selectedAreas = computed(() =>
  (props.modelValue ?? [])
    .map((item) => ({ ...item, definition: getInjuryArea(item.areaId) }))
    .filter((item) => item.definition)
)
const activeModelLabel = computed(() => bodyModelOptions.find((item) => item.id === activeModel.value)?.label ?? '하체')
const availableViewOptions = computed(() => {
  if (activeModel.value === 'foot') return footViewOptions
  if (activeModel.value === 'upper') return aroundViews('upper')
  return aroundViews('lower')
})
const activeViewOption = computed(() => availableViewOptions.value.find((item) => item.id === activeView.value) ?? availableViewOptions.value[0])
const activeFrameSrc = computed(() => frameImages[activeViewOption.value.imageKey])
const activeViewLabel = computed(() => `${activeModelLabel.value} · ${activeViewOption.value.label}`)
const visibleZones = computed(() => hitZones.filter((zone) => zone.model === activeModel.value && zone.views.includes(activeView.value)))
const pendingZone = computed(() => visibleZones.value.find((zone) => zone.id === pendingZoneId.value) ?? null)
const pendingOptions = computed(() =>
  (pendingZone.value?.candidates ?? [])
    .map((areaId) => getInjuryArea(areaId))
    .filter((area): area is NonNullable<ReturnType<typeof getInjuryArea>> => Boolean(area))
)
const selectedNodes = computed(() => {
  const ids = selectedIds.value
  return visibleZones.value
    .filter((zone) => zone.candidates.some((areaId) => ids.has(areaId)))
    .map((zone) => ({
      id: zone.id,
      x: zone.x + zone.width / 2,
      y: zone.y + zone.height / 2,
      count: zone.candidates.filter((areaId) => ids.has(areaId)).length
    }))
})

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

function setActiveModel(model: BodyModelId) {
  activeModel.value = model
  activeView.value = (model === 'foot' ? footViewOptions[0] : aroundViews(model === 'upper' ? 'upper' : 'lower')[0]).id
  pendingZoneId.value = ''
}

function selectView(view: BodyViewId) {
  activeView.value = view
  pendingZoneId.value = ''
}

function rotateView(direction: 1 | -1) {
  const options = availableViewOptions.value
  const index = options.findIndex((item) => item.id === activeView.value)
  const next = (index + direction + options.length) % options.length
  activeView.value = options[next].id
  pendingZoneId.value = ''
}

function onPointerDown(event: PointerEvent) {
  dragStartX.value = event.clientX
  dragMoved.value = false
}

function onPointerMove(event: PointerEvent) {
  if (dragStartX.value === null) return
  const delta = event.clientX - dragStartX.value
  if (Math.abs(delta) < 46) return
  dragMoved.value = true
  rotateView(delta > 0 ? -1 : 1)
  dragStartX.value = event.clientX
}

function onPointerUp() {
  dragStartX.value = null
  window.setTimeout(() => {
    dragMoved.value = false
  }, 0)
}

function openZone(zoneId: string) {
  if (dragMoved.value) return
  pendingZoneId.value = zoneId
}
</script>

<template>
  <div class="injury-body-selector full">
    <div class="injury-selector-head">
      <div>
        <span class="form-section-title">{{ label }}</span>
        <p class="helper">이미지의 부위를 터치한 뒤 정확한 부위를 선택하세요. 최종 선택 목록에서 통증 레벨을 입력합니다.</p>
      </div>
      <span class="context-chip">{{ selectedAreas.length }}개 선택</span>
    </div>

    <div class="injury-body-layout">
      <section class="body-view-card" aria-label="인체 부위 선택">
        <div class="body-model-tabs" role="tablist" aria-label="인체 모델 범위">
          <button
            v-for="model in bodyModelOptions"
            :key="model.id"
            type="button"
            role="tab"
            :aria-selected="activeModel === model.id"
            :class="{ active: activeModel === model.id }"
            @click="setActiveModel(model.id)"
          >
            <span>{{ model.label }}</span>
            <small>{{ model.description }}</small>
          </button>
        </div>

        <div class="body-view-toolbar">
          <button type="button" aria-label="이전 각도" @click="rotateView(-1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div class="body-view-status">
            <strong>{{ activeViewLabel }}</strong>
            <small>{{ pendingZone?.label ?? '부위를 터치하세요' }}</small>
          </div>
          <button type="button" aria-label="다음 각도" @click="rotateView(1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>

        <div class="body-view-tabs body-view-angle-tabs" role="tablist" aria-label="모델 각도">
          <button
            v-for="view in availableViewOptions"
            :key="view.id"
            type="button"
            role="tab"
            :aria-selected="activeView === view.id"
            :class="{ active: activeView === view.id }"
            @click="selectView(view.id)"
          >
            {{ view.label }}
          </button>
        </div>

        <div
          class="body-model-stage"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <img class="body-model-image" :src="activeFrameSrc" alt="" draggable="false" />
          <svg class="body-zone-overlay" viewBox="0 0 100 100" aria-label="터치 가능한 부위 영역">
            <g
              v-for="zone in visibleZones"
              :key="zone.id"
              class="body-hit-zone"
              :class="{ active: pendingZoneId === zone.id }"
              role="button"
              tabindex="0"
              :aria-label="zone.label"
              @click="openZone(zone.id)"
              @keydown.enter.prevent="openZone(zone.id)"
              @keydown.space.prevent="openZone(zone.id)"
            >
              <rect :x="zone.x" :y="zone.y" :width="zone.width" :height="zone.height" rx="8" />
            </g>
            <g v-for="node in selectedNodes" :key="node.id" class="body-selected-node">
              <circle :cx="node.x" :cy="node.y" r="3.2" />
              <text v-if="node.count > 1" :x="node.x" :y="node.y + 1.2">{{ node.count }}</text>
            </g>
          </svg>
          <div class="body-view-label">{{ activeViewLabel }} · 드래그 전환</div>
        </div>

        <div v-if="pendingZone" class="body-zone-detail">
          <div>
            <strong>{{ pendingZone.label }}</strong>
            <small>정확한 부위를 선택하세요.</small>
          </div>
          <div class="body-zone-option-grid">
            <button
              v-for="area in pendingOptions"
              :key="area.id"
              type="button"
              :class="{ selected: selectedIds.has(area.id) }"
              @click="toggleArea(area.id)"
            >
              <span>{{ area.label }}</span>
              <small>{{ area.structure }}</small>
            </button>
          </div>
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
      <strong>선택 목록과 통증 레벨</strong>
      <div class="selected-injury-list">
        <div v-for="selection in selectedAreas" :key="selection.areaId" class="selected-injury-item">
          <div>
            <span>{{ getInjuryAreaLabel(selection.areaId) }}</span>
            <small>{{ selection.definition?.structure }}</small>
          </div>
          <button type="button" aria-label="선택 제거" @click="removeArea(selection.areaId)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
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
