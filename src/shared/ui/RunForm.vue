<script setup lang="ts">
import { computed } from 'vue'
import { courseTypes, runTypes, type ExtractedRunData } from '@/entities/run/model'
import { inferCourseType } from '@/features/infer-course-type/inferCourseType'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import ClearableField from '@/shared/ui/ClearableField.vue'
import DateField from '@/shared/ui/DateField.vue'

const model = defineModel<ExtractedRunData>({ required: true })

const durationMin = computed({
  get: () => (model.value.durationSec ? Math.floor(model.value.durationSec / 60) : null),
  set: (value: number | null) => {
    model.value.durationSec = value === null ? null : value * 60
  }
})

const paceText = computed({
  get: () => {
    if (!model.value.avgPaceSec) return ''
    const rounded = Math.round(model.value.avgPaceSec)
    const min = Math.floor(rounded / 60)
    const sec = String(rounded % 60).padStart(2, '0')
    return `${min}:${sec}`
  },
  set: (value: string) => {
    const [rawMin, rawSec = '0'] = value.split(':')
    const min = Number(rawMin)
    const sec = Number(rawSec)
    model.value.avgPaceSec = Number.isFinite(min) ? min * 60 + (Number.isFinite(sec) ? sec : 0) : null
  }
})

function maybeInferCourseType() {
  if (model.value.courseType !== 'Unknown') return
  model.value.courseType = inferCourseType({
    distanceKm: model.value.distanceKm,
    elevationGainM: model.value.elevationGainM,
    elevationLossM: model.value.elevationLossM,
    routePoints: model.value.routePoints
  })
}

function setNumber(key: keyof ExtractedRunData, value: string | number | null) {
  ;(model.value[key] as number | null) = value === null ? null : Number(value)
  if (key === 'distanceKm' || key === 'elevationGainM' || key === 'elevationLossM') {
    maybeInferCourseType()
  }
}
</script>

<template>
  <form class="form-grid">
    <label class="full">
      세션 제목
      <ClearableField v-model="model.sessionTitle" placeholder="예: 오늘 목요일 템포" />
    </label>
    <DateField v-model="model.date" label="날짜" />
    <BottomSheetSelect
      v-model="model.type"
      label="타입"
      :options="runTypes.map((type) => ({ value: type, label: type }))"
    />
    <label>
      거리 km
      <ClearableField :model-value="model.distanceKm" type="number" step="0.01" number @update:model-value="setNumber('distanceKm', $event)" />
    </label>
    <label>
      시간 분
      <ClearableField v-model="durationMin" type="number" number />
    </label>
    <label>
      평균 페이스
      <ClearableField v-model="paceText" placeholder="7:36" />
    </label>
    <label>
      평균 심박
      <ClearableField :model-value="model.avgHeartRate" type="number" number @update:model-value="setNumber('avgHeartRate', $event)" />
    </label>
    <label>
      최대 심박
      <ClearableField :model-value="model.maxHeartRate" type="number" number @update:model-value="setNumber('maxHeartRate', $event)" />
    </label>
    <label>
      케이던스
      <ClearableField :model-value="model.cadence" type="number" number @update:model-value="setNumber('cadence', $event)" />
    </label>
    <label>
      기온
      <ClearableField :model-value="model.temperature" type="number" number @update:model-value="setNumber('temperature', $event)" />
    </label>
    <label>
      습도 %
      <ClearableField :model-value="model.humidity" type="number" inputmode="numeric" min="0" max="100" number @update:model-value="setNumber('humidity', $event)" />
    </label>
    <label>
      바람 m/s
      <ClearableField :model-value="model.windMps" type="number" step="0.1" number @update:model-value="setNumber('windMps', $event)" />
    </label>
    <BottomSheetSelect
      v-model="model.courseType"
      label="코스 타입"
      :options="courseTypes.map((courseType) => ({ value: courseType, label: courseType }))"
    />
    <label>
      누적 상승 m
      <ClearableField :model-value="model.elevationGainM" type="number" number @update:model-value="setNumber('elevationGainM', $event)" />
    </label>
    <label>
      누적 하강 m
      <ClearableField :model-value="model.elevationLossM" type="number" number @update:model-value="setNumber('elevationLossM', $event)" />
    </label>
    <label>
      운동강도
      <ClearableField :model-value="model.rpe" type="number" min="1" max="10" number @update:model-value="setNumber('rpe', $event)" />
    </label>
    <label>
      수면 점수
      <ClearableField :model-value="model.sleepQuality" type="number" min="1" max="10" number @update:model-value="setNumber('sleepQuality', $event)" />
    </label>
    <label>
      컨디션 점수
      <ClearableField :model-value="model.conditionScore" type="number" min="1" max="10" number @update:model-value="setNumber('conditionScore', $event)" />
    </label>
    <label>
      스트레스
      <ClearableField :model-value="model.stressLevel" type="number" min="1" max="10" number @update:model-value="setNumber('stressLevel', $event)" />
    </label>
    <label class="full">
      동행/상황
      <ClearableField v-model="model.companion" placeholder="예: 배우자 회복런, 혼자, 그룹런" />
    </label>
    <label class="full">
      운동 후 느낌
      <ClearableField v-model="model.workoutFeeling" as="textarea" rows="2" placeholder="예: 템포 후 9분대 조깅은 회복 느낌이었음" />
    </label>
    <label class="full">
      통증/불편
      <ClearableField v-model="model.painNote" as="textarea" rows="2" placeholder="예: 좌측 햄스트링 이상 없음" />
    </label>
    <label class="full">
      메모
      <ClearableField v-model="model.memo" as="textarea" rows="3" />
    </label>
  </form>
</template>
