<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRunStore } from '@/app/stores/runStore'
import RunImageUploader from '@/widgets/run-image-uploader/RunImageUploader.vue'
import RunForm from '@/shared/ui/RunForm.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import { formatDateWithWeekday } from '@/shared/lib/format'
import type { ExtractedRunData } from '@/entities/run/model'
import { createEmptyRun, extractRunDataFromFile } from '@/features/extract-run-data/localFileExtractor'
import {
  registerHealthKitBridge,
  requestHealthKitRuns,
  toExtractedRunData,
  unregisterHealthKitBridge,
  type HealthKitRunCandidate
} from '@/features/import-healthkit-run/healthKitBridge'

const router = useRouter()
const runStore = useRunStore()
const uploader = ref<InstanceType<typeof RunImageUploader> | null>(null)
const file = ref<File | null>(null)
const form = ref<ExtractedRunData | null>(null)
const currentSource = ref<'file_import' | 'healthkit' | 'manual'>('file_import')
const healthKitCandidates = ref<HealthKitRunCandidate[]>([])
const selectedHealthKitId = ref('')
const loading = ref(false)
const saving = ref(false)
const bulkSaving = ref(false)
const healthKitLoading = ref(false)
const healthKitStatus = ref('')
const error = ref('')
const healthKitOptions = computed(() =>
  healthKitCandidates.value.map((candidate) => ({
    value: candidate.externalId,
    label: `${formatDateWithWeekday(candidate.date)} · ${candidate.distanceKm ?? '-'}km`,
    description: candidate.sourceName ?? 'HealthKit'
  }))
)

registerHealthKitBridge({
  onRuns(runs) {
    healthKitLoading.value = false
    healthKitCandidates.value = runs
    selectedHealthKitId.value = runs[0]?.externalId ?? ''
    if (runs[0]) {
      form.value = toExtractedRunData(runs[0])
      currentSource.value = 'healthkit'
      healthKitStatus.value = `${runs.length}개 HealthKit 러닝 후보를 가져왔습니다.`
    } else {
      healthKitStatus.value = '최근 90일 HealthKit 러닝 기록이 없습니다.'
    }
    error.value = ''
  },
  onError(message) {
    healthKitLoading.value = false
    healthKitStatus.value = ''
    error.value = message
  }
})

onBeforeUnmount(unregisterHealthKitBridge)

function onSelected(selected: File) {
  file.value = selected
  form.value = null
  currentSource.value = 'file_import'
  error.value = ''
}

async function analyze() {
  if (!file.value) return
  loading.value = true
  error.value = ''
  try {
    form.value = await extractRunDataFromFile(file.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '파일 분석 실패'
  } finally {
    loading.value = false
  }
}

function manual() {
  form.value = createEmptyRun()
  currentSource.value = 'manual'
}

function importFromHealthKit() {
  error.value = ''
  healthKitLoading.value = true
  healthKitStatus.value = 'HealthKit에서 최근 러닝을 조회 중입니다.'
  try {
    requestHealthKitRuns(90)
  } catch (err) {
    healthKitLoading.value = false
    healthKitStatus.value = ''
    error.value = err instanceof Error ? err.message : 'HealthKit 가져오기 실패'
  }
}

async function saveMayHealthKitRuns() {
  const year = new Date().getFullYear()
  const mayRuns = healthKitCandidates.value
    .filter((candidate) => candidate.date >= `${year}-05-01` && candidate.date <= `${year}-05-31`)
    .filter((candidate) => !isAlreadySaved(candidate))

  if (!mayRuns.length) {
    healthKitStatus.value = `${year}년 5월 HealthKit 후보 중 새로 저장할 기록이 없습니다.`
    return
  }

  bulkSaving.value = true
  error.value = ''
  try {
    const inserted = await runStore.addRuns(
      mayRuns.map((candidate) => toExtractedRunData(candidate)),
      'healthkit'
    )
    healthKitStatus.value = `${year}년 5월 HealthKit 기록 ${inserted.length}개를 Run Log에 저장했습니다.`
  } catch (err) {
    error.value = err instanceof Error ? err.message : '5월 HealthKit 기록 저장 실패'
  } finally {
    bulkSaving.value = false
  }
}

function isAlreadySaved(candidate: HealthKitRunCandidate) {
  return runStore.runs.some((run) => {
    if (run.externalId && run.externalId === candidate.externalId) return true
    return (
      run.source === 'healthkit' &&
      run.date === candidate.date &&
      run.distanceKm === (candidate.distanceKm ?? 0) &&
      run.durationSec === candidate.durationSec
    )
  })
}

function selectHealthKitCandidate() {
  const candidate = healthKitCandidates.value.find((item) => item.externalId === selectedHealthKitId.value)
  if (candidate) {
    form.value = toExtractedRunData(candidate)
    currentSource.value = 'healthkit'
  }
}

async function save() {
  if (!form.value) return
  saving.value = true
  error.value = ''
  try {
    await runStore.addRun(form.value, currentSource.value)
    file.value = null
    form.value = null
    selectedHealthKitId.value = ''
    currentSource.value = 'file_import'
    uploader.value?.clear()
    router.push('/runs')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '저장 실패'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="page upload-page">
    <SectionCard>
      <div class="section-heading">
        <h2>HealthKit 가져오기</h2>
      </div>
      <div class="actions">
        <button type="button" :disabled="healthKitLoading" @click="importFromHealthKit">
          {{ healthKitLoading ? '가져오는 중' : '최근 러닝 가져오기' }}
        </button>
        <button class="ghost" type="button" :disabled="!healthKitCandidates.length || bulkSaving" @click="saveMayHealthKitRuns">
          {{ bulkSaving ? '저장 중' : '올해 5월 기록 일괄 저장' }}
        </button>
      </div>
      <p v-if="healthKitStatus" class="helper">{{ healthKitStatus }}</p>
      <BottomSheetSelect
        v-if="healthKitCandidates.length"
        v-model="selectedHealthKitId"
        class="full"
        label="HealthKit 후보"
        :options="healthKitOptions"
        @update:model-value="selectHealthKitCandidate"
      />
      <p class="helper">iOS 앱에서는 HealthKit에서 러닝 기록을 가져오고, 일반 웹에서는 아래 FIT 업로드를 사용합니다.</p>
    </SectionCard>
    <RunImageUploader ref="uploader" @selected="onSelected" @cleared="file = null" />
    <div class="actions">
      <button type="button" :disabled="!file || loading" @click="analyze">
        {{ loading ? '분석 중' : '파일 분석' }}
      </button>
      <button class="ghost" type="button" @click="manual">수동 입력</button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
    <SectionCard v-if="form">
      <div class="section-heading">
        <h2>분석 결과 확인</h2>
      </div>
      <RunForm v-model="form" />
      <div class="actions">
        <button type="button" :disabled="saving" @click="save">{{ saving ? '저장 중' : '저장' }}</button>
      </div>
    </SectionCard>
  </section>
</template>
