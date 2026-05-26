<script setup lang="ts">
import { computed } from 'vue'
import { courseTypes, runTypes, type ExtractedRunData } from '@/entities/run/model'
import { inferCourseType } from '@/features/infer-course-type/inferCourseType'
import { toNumberOrNull } from '@/shared/lib/format'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
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

function updateNumber(key: keyof ExtractedRunData, value: string) {
  ;(model.value[key] as number | null) = toNumberOrNull(value)
  if (key === 'distanceKm' || key === 'elevationGainM' || key === 'elevationLossM') {
    maybeInferCourseType()
  }
}

function maybeInferCourseType() {
  if (model.value.courseType !== 'Unknown') return
  model.value.courseType = inferCourseType({
    distanceKm: model.value.distanceKm,
    elevationGainM: model.value.elevationGainM,
    elevationLossM: model.value.elevationLossM
  })
}
</script>

<template>
  <form class="form-grid">
    <label class="full">
      세션 제목
      <input v-model="model.sessionTitle" placeholder="예: 오늘 목요일 템포" />
    </label>
    <DateField v-model="model.date" label="날짜" />
    <BottomSheetSelect
      v-model="model.type"
      label="타입"
      :options="runTypes.map((type) => ({ value: type, label: type }))"
    />
    <label>
      거리 km
      <input :value="model.distanceKm" type="number" step="0.01" @input="updateNumber('distanceKm', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      시간 분
      <input v-model.number="durationMin" type="number" />
    </label>
    <label>
      평균 페이스
      <input v-model="paceText" placeholder="7:36" />
    </label>
    <label>
      평균 심박
      <input :value="model.avgHeartRate ?? ''" type="number" @input="updateNumber('avgHeartRate', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      최대 심박
      <input :value="model.maxHeartRate ?? ''" type="number" @input="updateNumber('maxHeartRate', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      케이던스
      <input :value="model.cadence ?? ''" type="number" @input="updateNumber('cadence', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      기온
      <input :value="model.temperature ?? ''" type="number" @input="updateNumber('temperature', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      습도 %
      <input :value="model.humidity ?? ''" type="number" min="0" max="100" @input="updateNumber('humidity', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      바람 m/s
      <input :value="model.windMps ?? ''" type="number" step="0.1" @input="updateNumber('windMps', ($event.target as HTMLInputElement).value)" />
    </label>
    <BottomSheetSelect
      v-model="model.courseType"
      label="코스 타입"
      :options="courseTypes.map((courseType) => ({ value: courseType, label: courseType }))"
    />
    <label>
      누적 상승 m
      <input :value="model.elevationGainM ?? ''" type="number" @input="updateNumber('elevationGainM', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      누적 하강 m
      <input :value="model.elevationLossM ?? ''" type="number" @input="updateNumber('elevationLossM', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      운동강도
      <input :value="model.rpe ?? ''" type="number" min="1" max="10" @input="updateNumber('rpe', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      수면 점수
      <input :value="model.sleepQuality ?? ''" type="number" min="1" max="10" @input="updateNumber('sleepQuality', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      컨디션 점수
      <input :value="model.conditionScore ?? ''" type="number" min="1" max="10" @input="updateNumber('conditionScore', ($event.target as HTMLInputElement).value)" />
    </label>
    <label>
      스트레스
      <input :value="model.stressLevel ?? ''" type="number" min="1" max="10" @input="updateNumber('stressLevel', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="full">
      동행/상황
      <input v-model="model.companion" placeholder="예: 배우자 회복런, 혼자, 그룹런" />
    </label>
    <label class="full">
      운동 후 느낌
      <textarea v-model="model.workoutFeeling" rows="2" placeholder="예: 템포 후 9분대 조깅은 회복 느낌이었음" />
    </label>
    <label class="full">
      통증/불편
      <textarea v-model="model.painNote" rows="2" placeholder="예: 좌측 햄스트링 이상 없음" />
    </label>
    <label class="full">
      메모
      <textarea v-model="model.memo" rows="3" />
    </label>
  </form>
</template>
