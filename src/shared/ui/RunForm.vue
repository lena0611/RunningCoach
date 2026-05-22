<script setup lang="ts">
import { computed } from 'vue'
import { runTypes, type ExtractedRunData, type RunType } from '@/entities/run/model'
import { toNumberOrNull } from '@/shared/lib/format'

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
    const min = Math.floor(model.value.avgPaceSec / 60)
    const sec = String(model.value.avgPaceSec % 60).padStart(2, '0')
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
}
</script>

<template>
  <form class="form-grid">
    <label>
      날짜
      <input v-model="model.date" type="date" />
    </label>
    <label>
      타입
      <select v-model="model.type">
        <option v-for="type in runTypes" :key="type" :value="type">{{ type }}</option>
      </select>
    </label>
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
      RPE
      <input :value="model.rpe ?? ''" type="number" min="1" max="10" @input="updateNumber('rpe', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="full">
      메모
      <textarea v-model="model.memo" rows="3" />
    </label>
  </form>
</template>
