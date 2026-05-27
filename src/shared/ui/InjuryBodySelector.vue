<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  injuryAreaCatalog,
  injuryAreaGroups,
  getInjuryArea,
  getInjuryAreaLabel,
  type InjuryAreaDefinition,
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
  degree: number | null
  label: string
  anatomicalView: AnatomicalViewId
  scaleX: number
  shiftX: number
  kind?: 'around' | 'top' | 'sole'
}

type ZoneGeometry = {
  d: string
  labelX: number
  labelY: number
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

const activeModel = ref<BodyModelId>('lower')
const activeView = ref<BodyViewId>('deg0')
const selectedPart = ref('')
const dragStartX = ref<number | null>(null)
const dragMoved = ref(false)

const bodyModelOptions: Array<{ id: BodyModelId; label: string; description: string }> = [
  { id: 'upper', label: '상체/허리', description: '허리, 골반 주변' },
  { id: 'lower', label: '하체', description: '대퇴, 무릎, 정강이, 종아리' },
  { id: 'foot', label: '발/발목', description: '아킬레스, 발목, 족저' }
]

const aroundViewOptions: BodyViewOption[] = [
  { id: 'deg0', degree: 0, label: '0°', anatomicalView: 'front', scaleX: 1, shiftX: 0, kind: 'around' },
  { id: 'deg45', degree: 45, label: '45°', anatomicalView: 'front', scaleX: 0.82, shiftX: 3, kind: 'around' },
  { id: 'deg90', degree: 90, label: '90°', anatomicalView: 'right', scaleX: 0.54, shiftX: 6, kind: 'around' },
  { id: 'deg135', degree: 135, label: '135°', anatomicalView: 'right', scaleX: 0.74, shiftX: 4, kind: 'around' },
  { id: 'deg180', degree: 180, label: '180°', anatomicalView: 'back', scaleX: 1, shiftX: 0, kind: 'around' },
  { id: 'deg225', degree: 225, label: '225°', anatomicalView: 'back', scaleX: 0.82, shiftX: -3, kind: 'around' },
  { id: 'deg270', degree: 270, label: '270°', anatomicalView: 'left', scaleX: 0.54, shiftX: -6, kind: 'around' },
  { id: 'deg315', degree: 315, label: '315°', anatomicalView: 'left', scaleX: 0.74, shiftX: -4, kind: 'around' },
  { id: 'deg360', degree: 360, label: '360°', anatomicalView: 'front', scaleX: 1, shiftX: 0, kind: 'around' }
]

const footViewOptions: BodyViewOption[] = [
  { id: 'deg0', degree: 0, label: '전면', anatomicalView: 'front', scaleX: 1, shiftX: 0, kind: 'around' },
  { id: 'deg90', degree: 90, label: '외측', anatomicalView: 'right', scaleX: 0.62, shiftX: 5, kind: 'around' },
  { id: 'deg180', degree: 180, label: '후면', anatomicalView: 'back', scaleX: 1, shiftX: 0, kind: 'around' },
  { id: 'deg270', degree: 270, label: '내측', anatomicalView: 'left', scaleX: 0.62, shiftX: -5, kind: 'around' },
  { id: 'footTop', degree: null, label: '발등', anatomicalView: 'front', scaleX: 1, shiftX: 0, kind: 'top' },
  { id: 'footSole', degree: null, label: '발바닥', anatomicalView: 'front', scaleX: 1, shiftX: 0, kind: 'sole' }
]

const modelAreaIds: Record<BodyModelId, string[]> = {
  upper: ['lower-back', 'left-hip', 'right-hip'],
  lower: [
    'left-hip',
    'right-hip',
    'left-quadriceps',
    'right-quadriceps',
    'left-hamstring',
    'right-hamstring',
    'left-it-band',
    'right-it-band',
    'left-knee',
    'right-knee',
    'left-shin',
    'right-shin',
    'left-calf',
    'right-calf'
  ],
  foot: [
    'left-calf',
    'right-calf',
    'left-achilles',
    'right-achilles',
    'left-ankle',
    'right-ankle',
    'left-plantar-fascia',
    'right-plantar-fascia'
  ]
}

const zoneGeometries: Record<string, ZoneGeometry> = {
  'lower-back': {
    d: 'M49 60 C48 53 53 49 60 49 C67 49 72 53 71 60 L69 73 C68 79 64 82 60 82 C56 82 52 79 51 73 Z',
    labelX: 60,
    labelY: 66
  },
  'left-hip': {
    d: 'M36 63 C43 59 51 61 54 67 C56 73 51 80 43 80 C36 80 31 76 31 70 C31 67 33 65 36 63 Z',
    labelX: 43,
    labelY: 72
  },
  'right-hip': {
    d: 'M66 67 C69 61 77 59 84 63 C87 65 89 67 89 70 C89 76 84 80 77 80 C69 80 64 73 66 67 Z',
    labelX: 77,
    labelY: 72
  },
  'left-quadriceps': {
    d: 'M39 75 C46 72 51 76 51 85 L50 111 C49 119 45 124 40 123 C35 122 33 116 34 108 L36 85 C36 80 37 77 39 75 Z',
    labelX: 42,
    labelY: 98
  },
  'right-quadriceps': {
    d: 'M69 85 C69 76 74 72 81 75 C83 77 84 80 84 85 L86 108 C87 116 85 122 80 123 C75 124 71 119 70 111 Z',
    labelX: 78,
    labelY: 98
  },
  'left-hamstring': {
    d: 'M39 76 C45 72 50 75 51 84 L50 110 C49 119 45 124 40 123 C35 122 33 116 34 108 L36 84 C36 80 37 78 39 76 Z',
    labelX: 42,
    labelY: 98
  },
  'right-hamstring': {
    d: 'M69 84 C70 75 75 72 81 76 C83 78 84 80 84 84 L86 108 C87 116 85 122 80 123 C75 124 71 119 70 110 Z',
    labelX: 78,
    labelY: 98
  },
  'left-it-band': {
    d: 'M31 78 C35 76 38 79 38 84 L37 116 C37 123 34 128 30 126 C27 124 27 118 28 111 L29 87 C29 83 29 80 31 78 Z',
    labelX: 33,
    labelY: 101
  },
  'right-it-band': {
    d: 'M82 84 C82 79 85 76 89 78 C91 80 91 83 91 87 L92 111 C93 118 93 124 90 126 C86 128 83 123 83 116 Z',
    labelX: 87,
    labelY: 101
  },
  'left-knee': {
    d: 'M34 121 C36 117 43 116 47 120 C51 124 49 132 44 135 C39 138 32 135 31 129 C30 126 31 123 34 121 Z',
    labelX: 40,
    labelY: 128
  },
  'right-knee': {
    d: 'M73 120 C77 116 84 117 86 121 C89 124 90 128 89 131 C87 136 81 138 76 135 C71 132 69 124 73 120 Z',
    labelX: 80,
    labelY: 128
  },
  'left-shin': {
    d: 'M35 136 C39 133 45 135 47 141 L49 165 C50 174 47 180 42 180 C37 180 34 174 34 166 L33 145 C33 141 33 138 35 136 Z',
    labelX: 41,
    labelY: 158
  },
  'right-shin': {
    d: 'M73 141 C75 135 81 133 85 136 C87 138 87 141 87 145 L86 166 C86 174 83 180 78 180 C73 180 70 174 71 165 Z',
    labelX: 79,
    labelY: 158
  },
  'left-calf': {
    d: 'M35 137 C39 132 47 135 49 143 L50 160 C51 172 47 181 41 181 C35 181 31 172 33 160 L33 145 C33 141 34 139 35 137 Z',
    labelX: 41,
    labelY: 160
  },
  'right-calf': {
    d: 'M71 143 C73 135 81 132 85 137 C86 139 87 141 87 145 L87 160 C89 172 85 181 79 181 C73 181 69 172 70 160 Z',
    labelX: 79,
    labelY: 160
  },
  'left-achilles': {
    d: 'M37 118 C40 115 44 115 46 118 L47 136 C47 141 44 144 41 144 C38 144 35 141 36 136 Z',
    labelX: 41,
    labelY: 130
  },
  'right-achilles': {
    d: 'M74 118 C76 115 80 115 83 118 L84 136 C85 141 82 144 79 144 C76 144 73 141 73 136 Z',
    labelX: 79,
    labelY: 130
  },
  'left-ankle': {
    d: 'M31 133 C36 130 45 130 50 134 C54 138 51 145 44 147 L35 147 C29 145 27 137 31 133 Z',
    labelX: 41,
    labelY: 140
  },
  'right-ankle': {
    d: 'M70 134 C75 130 84 130 89 133 C93 137 91 145 85 147 L76 147 C69 145 66 138 70 134 Z',
    labelX: 80,
    labelY: 140
  },
  'left-plantar-fascia': {
    d: 'M23 145 C31 140 45 140 53 146 C58 150 57 157 51 160 L28 160 C20 159 17 150 23 145 Z',
    labelX: 39,
    labelY: 153
  },
  'right-plantar-fascia': {
    d: 'M67 146 C75 140 89 140 97 145 C103 150 100 159 92 160 L69 160 C63 157 62 150 67 146 Z',
    labelX: 81,
    labelY: 153
  }
}

const selectedIds = computed(() => new Set((props.modelValue ?? []).map((item) => item.areaId)))
const selectedAreas = computed(() =>
  (props.modelValue ?? [])
    .map((item) => ({ ...item, definition: getInjuryArea(item.areaId) }))
    .filter((item) => item.definition)
)
const selectedLabel = computed(() => (selectedPart.value ? getInjuryAreaLabel(selectedPart.value) : '부위를 터치하세요'))
const activeModelLabel = computed(() => bodyModelOptions.find((item) => item.id === activeModel.value)?.label ?? '하체')
const availableViewOptions = computed(() => (activeModel.value === 'foot' ? footViewOptions : aroundViewOptions))
const activeViewOption = computed(() => availableViewOptions.value.find((item) => item.id === activeView.value) ?? availableViewOptions.value[0])
const anatomicalView = computed(() => activeViewOption.value.anatomicalView)
const activeViewLabel = computed(() => {
  const directionLabel: Record<AnatomicalViewId, string> = {
    front: '전면',
    right: '우측',
    back: '후면',
    left: '좌측'
  }
  return activeViewOption.value.degree === null
    ? activeViewOption.value.label
    : `${activeViewOption.value.label} · ${directionLabel[activeViewOption.value.anatomicalView]}`
})
const stillcutTransform = computed(() => {
  const option = activeViewOption.value
  return `translate(${60 + option.shiftX} 0) scale(${option.scaleX} 1) translate(-60 0)`
})
const visibleAreas = computed(() =>
  injuryAreaCatalog.filter((area) => modelAreaIds[activeModel.value].includes(area.id) && area.views.includes(anatomicalView.value))
)

function toggleArea(areaId: string) {
  const next = [...(props.modelValue ?? [])]
  const index = next.findIndex((item) => item.areaId === areaId)
  if (index >= 0) {
    next.splice(index, 1)
  } else {
    next.push({ areaId, painLevel: null })
  }
  selectedPart.value = areaId
  emit('update:modelValue', next)
}

function updatePain(areaId: string, painLevel: number | null) {
  emit('update:modelValue', (props.modelValue ?? []).map((item) => (item.areaId === areaId ? { ...item, painLevel } : item)))
}

function setActiveModel(model: BodyModelId) {
  activeModel.value = model
  const options = model === 'foot' ? footViewOptions : aroundViewOptions
  const firstView = options.find((view) =>
    injuryAreaCatalog.some((area) => modelAreaIds[model].includes(area.id) && area.views.includes(view.anatomicalView))
  )
  activeView.value = firstView?.id ?? 'deg0'
  selectedPart.value = ''
}

function selectView(view: BodyViewId) {
  activeView.value = view
}

function rotateView(direction: 1 | -1) {
  const options = availableViewOptions.value
  const index = options.findIndex((item) => item.id === activeView.value)
  const next = (index + direction + options.length) % options.length
  activeView.value = options[next].id
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

function handleZoneClick(areaId: string) {
  if (dragMoved.value) return
  toggleArea(areaId)
}

function zoneFor(area: InjuryAreaDefinition) {
  return zoneGeometries[area.id] ?? fallbackZone(area)
}

function fallbackZone(area: InjuryAreaDefinition): ZoneGeometry {
  const x = area.x
  const y = area.y
  const w = area.width
  const h = area.height
  return {
    d: `M${x} ${y} h${w} v${h} h-${w} Z`,
    labelX: x + w / 2,
    labelY: y + h / 2
  }
}
</script>

<template>
  <div class="injury-body-selector full">
    <div class="injury-selector-head">
      <div>
        <span class="form-section-title">{{ label }}</span>
        <p class="helper">각도별 스틸컷을 넘겨 보며 부위를 터치하거나 아래 목록에서 복수 선택하세요.</p>
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
            <strong>{{ activeModelLabel }} · {{ activeViewLabel }}</strong>
            <small>{{ selectedLabel }}</small>
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
          class="body-stillcut-stage"
          :class="[`model-${activeModel}`, `view-${activeView}`]"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <svg class="body-stillcut" viewBox="0 0 120 190" role="img" aria-label="각도별 인체 스틸컷">
            <defs>
              <linearGradient id="skinTone" x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stop-color="#d9dde2" />
                <stop offset="48%" stop-color="#aeb7c0" />
                <stop offset="100%" stop-color="#6f7a86" />
              </linearGradient>
              <radialGradient id="bodyShade" cx="46%" cy="30%" r="76%">
                <stop offset="0%" stop-color="#f0f2f4" />
                <stop offset="62%" stop-color="#9da8b2" />
                <stop offset="100%" stop-color="#54616c" />
              </radialGradient>
              <filter id="softBodyShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="8" stdDeviation="5" flood-color="#02070a" flood-opacity="0.5" />
              </filter>
            </defs>

            <g class="body-still-shadow">
              <ellipse cx="60" cy="180" rx="36" ry="7" />
            </g>

            <g v-if="activeModel === 'upper'" class="body-surface-group" :transform="stillcutTransform" filter="url(#softBodyShadow)">
              <circle class="body-surface" cx="60" cy="22" r="12" />
              <path class="body-surface" d="M47 35 C54 30 66 30 73 35 L82 61 C85 77 76 95 60 96 C44 95 35 77 38 61 Z" />
              <path class="body-surface body-side-limb" d="M38 42 C29 51 25 70 31 87 C34 95 42 92 41 83 L43 54 Z" />
              <path class="body-surface body-side-limb" d="M82 42 C91 51 95 70 89 87 C86 95 78 92 79 83 L77 54 Z" />
              <path class="body-cutline" d="M60 38 L60 92 M45 64 C52 68 68 68 75 64" />
              <path class="body-muscle-line" d="M47 48 C52 54 56 57 60 58 C64 57 68 54 73 48 M50 75 C56 78 64 78 70 75" />
            </g>

            <g v-else-if="activeModel === 'lower'" class="body-surface-group" :transform="stillcutTransform" filter="url(#softBodyShadow)">
              <path class="body-surface" d="M41 43 C48 32 72 32 79 43 C82 54 73 72 60 73 C47 72 38 54 41 43 Z" />
              <path class="body-surface body-leg-left" d="M42 69 C51 66 56 72 55 86 L51 126 C50 137 45 143 40 142 C34 141 31 132 33 121 L35 86 C36 77 38 72 42 69 Z" />
              <path class="body-surface body-leg-right" d="M65 86 C64 72 69 66 78 69 C82 72 84 77 85 86 L87 121 C89 132 86 141 80 142 C75 143 70 137 69 126 Z" />
              <path class="body-surface body-lower-left" d="M36 139 C43 136 49 140 50 150 L52 173 C52 181 47 186 41 185 C35 184 31 177 32 168 L33 150 C33 145 34 141 36 139 Z" />
              <path class="body-surface body-lower-right" d="M70 150 C71 140 77 136 84 139 C86 141 87 145 87 150 L88 168 C89 177 85 184 79 185 C73 186 68 181 68 173 Z" />
              <path class="body-cutline" d="M60 42 L60 73 M44 74 C48 88 49 105 47 125 M76 74 C72 88 71 105 73 125 M40 144 C42 155 42 168 41 182 M80 144 C78 155 78 168 79 182" />
              <path class="body-muscle-line" d="M39 86 C44 92 49 92 54 86 M66 86 C71 92 76 92 81 86 M36 154 C41 158 46 158 50 154 M70 154 C74 158 80 158 85 154" />
            </g>

            <g v-else class="body-surface-group" :transform="stillcutTransform" filter="url(#softBodyShadow)">
              <template v-if="activeViewOption.kind === 'top'">
                <path class="body-surface" d="M23 70 C33 52 52 48 60 66 C68 48 87 52 97 70 C104 84 101 111 89 126 C79 139 65 136 60 122 C55 136 41 139 31 126 C19 111 16 84 23 70 Z" />
                <path class="body-cutline" d="M60 66 L60 124 M29 91 C39 97 50 99 58 94 M62 94 C70 99 81 97 91 91" />
                <path class="body-muscle-line" d="M31 76 C43 70 52 72 57 84 M89 76 C77 70 68 72 63 84 M32 113 C41 118 49 119 56 114 M64 114 C71 119 79 118 88 113" />
              </template>
              <template v-else-if="activeViewOption.kind === 'sole'">
                <path class="body-surface" d="M24 66 C37 51 54 50 60 70 C66 50 83 51 96 66 C105 83 101 119 86 139 C76 151 64 146 60 129 C56 146 44 151 34 139 C19 119 15 83 24 66 Z" />
                <path class="body-cutline" d="M60 70 L60 130 M31 86 C42 92 50 94 57 91 M63 91 C70 94 78 92 89 86" />
                <path class="body-muscle-line" d="M29 109 C40 117 51 118 57 112 M63 112 C69 118 80 117 91 109 M37 130 C45 134 53 134 58 128 M62 128 C67 134 75 134 83 130" />
              </template>
              <template v-else>
                <path class="body-surface" d="M38 24 C45 20 51 25 51 36 L49 109 C48 121 43 128 38 127 C32 126 29 117 31 106 L33 38 C33 31 35 27 38 24 Z" />
                <path class="body-surface" d="M69 36 C69 25 75 20 82 24 C85 27 87 31 87 38 L89 106 C91 117 88 126 82 127 C77 128 72 121 71 109 Z" />
                <path class="body-surface" d="M23 133 C34 126 50 127 60 136 C67 142 66 153 57 158 L29 158 C19 156 14 140 23 133 Z" />
                <path class="body-surface" d="M60 136 C70 127 86 126 97 133 C106 140 101 156 91 158 L63 158 C54 153 53 142 60 136 Z" />
                <path class="body-cutline" d="M40 28 C42 56 41 86 39 122 M80 28 C78 56 79 86 81 122 M25 146 C36 149 49 149 58 145 M62 145 C71 149 84 149 95 146" />
                <path class="body-muscle-line" d="M34 70 C39 74 44 74 49 70 M71 70 C76 74 81 74 86 70" />
              </template>
            </g>

            <g class="body-zone-layer" :transform="stillcutTransform">
              <g
                v-for="area in visibleAreas"
                :key="area.id"
                class="body-zone"
                :class="{ selected: selectedIds.has(area.id) }"
                tabindex="0"
                role="button"
                :aria-pressed="selectedIds.has(area.id)"
                :aria-label="area.label"
                @click="handleZoneClick(area.id)"
                @keydown.enter.prevent="toggleArea(area.id)"
                @keydown.space.prevent="toggleArea(area.id)"
              >
                <path class="body-zone-shape" :d="zoneFor(area).d" />
                <text v-if="selectedIds.has(area.id)" class="body-zone-text" :x="zoneFor(area).labelX" :y="zoneFor(area).labelY">
                  {{ area.shortLabel }}
                </text>
              </g>
            </g>
          </svg>
          <div class="body-view-label">{{ activeViewLabel }} · 드래그 회전 · 터치 선택</div>
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
