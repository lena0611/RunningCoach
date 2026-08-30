<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { deriveHeartRateModel, deriveObservedMaxHr } from '@/shared/lib/heartRateZones'
import RunImageUploader from '@/widgets/run-image-uploader/RunImageUploader.vue'
import ActionGroup from '@/shared/ui/ActionGroup.vue'
import ContentStack from '@/shared/ui/ContentStack.vue'
import RunForm from '@/shared/ui/RunForm.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import type { ExtractedRunData } from '@/entities/run/model'
import { createEmptyRun, extractRunDataFromFile } from '@/features/extract-run-data/localFileExtractor'
import { hasNativeBridge } from '@/shared/lib/runtime'

const props = defineProps<{ stackMode?: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const router = useRouter()
const runStore = useRunStore()
const memoryStore = useMemoryStore()
const healthKitSyncStore = useHealthKitSyncStore()

/**
 * 수동 동기화(#718). 자동 동기화는 `changes-only` 라 **변화가 없으면 아무 말도 안 한다** —
 * 그래서 "안 돌았다"와 "돌았는데 0건"이 화면에서 구분되지 않았다(2026-08-29 실사고).
 * 이 버튼은 `toast` 모드라 변화가 없어도 결과를 말해준다.
 */
function syncNow() {
  void healthKitSyncStore.requestSync({ feedback: 'toast' })
}
const uploader = ref<InstanceType<typeof RunImageUploader> | null>(null)
const file = ref<File | null>(null)
const form = ref<ExtractedRunData | null>(null)
const currentSource = ref<'file_import' | 'healthkit' | 'manual'>('file_import')
const loading = ref(false)
const saving = ref(false)
const error = ref('')

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
    const observed = deriveObservedMaxHr(runStore.sortedRuns.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })))
    const heartRateModel = deriveHeartRateModel(memoryStore.memory.athleteProfile, new Date().getFullYear(), observed)
    form.value = await extractRunDataFromFile(file.value, heartRateModel)
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

async function save() {
  if (!form.value) return
  saving.value = true
  error.value = ''
  try {
    await runStore.addRun(form.value, currentSource.value)
    file.value = null
    form.value = null
    currentSource.value = 'file_import'
    uploader.value?.clear()
    if (props.stackMode) {
      emit('saved')
    } else {
      router.push('/runs')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '저장 실패'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="upload-page" :class="{ page: !stackMode }">
    <ContentStack>
    <SectionGroup title="HealthKit 자동 동기화">
      <p v-if="hasNativeBridge()" class="helper">
        로그인 상태에서 앱을 켜거나 다시 활성화하면, 저장된 최신 Run Log 이후의 HealthKit 러닝만 자동으로 동기화합니다.
      </p>
      <p v-else class="helper">일반 웹에서는 HealthKit 브리지가 없어 아래 FIT 업로드 또는 수동 입력을 사용합니다.</p>
      <p v-if="healthKitSyncStore.syncing" class="helper">HealthKit 동기화 중입니다.</p>
      <p v-else-if="healthKitSyncStore.status" class="helper">{{ healthKitSyncStore.status }}</p>
      <!-- 건너뛴 이유를 화면에 노출한다(#718). 예전엔 조용히 return 이라 "왜 안 됐는지" 알 수 없었다. -->
      <p v-if="healthKitSyncStore.skipReason" class="helper">{{ healthKitSyncStore.skipReason }}</p>
      <p v-if="healthKitSyncStore.error" class="error">{{ healthKitSyncStore.error }}</p>
      <!-- 읽기 권한 의심(#719): 기존 기록은 있는데 조회가 0건이면 '운동' 읽기가 막힌 것이다.
           iOS 는 권한이 없어도 에러 대신 빈 결과를 주므로, 사용자가 스스로 알아챌 방법이 없다. -->
      <p v-if="healthKitSyncStore.readAuthSuspect" class="error">
        건강 앱에서 <strong>운동</strong> 읽기 권한이 꺼진 것 같아요. 기존 기록이 있는데 조회가 0건입니다.
        아래 버튼을 누르면 권한을 다시 요청합니다 — 시트가 뜨면 <strong>운동</strong>과 <strong>경로</strong>를 허용해 주세요.
      </p>
      <ActionGroup v-if="hasNativeBridge()">
        <button class="ghost" type="button" :disabled="healthKitSyncStore.syncing" @click="syncNow">
          {{ healthKitSyncStore.syncing ? '동기화 중' : '지금 동기화' }}
        </button>
        <button
          v-if="healthKitSyncStore.readAuthSuspect"
          type="button"
          :disabled="healthKitSyncStore.syncing"
          @click="healthKitSyncStore.retryReadAuth()"
        >
          건강 권한 다시 요청
        </button>
      </ActionGroup>
    </SectionGroup>
    <RunImageUploader ref="uploader" @selected="onSelected" @cleared="file = null" />
    <ActionGroup>
      <button type="button" :disabled="!file || loading" @click="analyze">
        {{ loading ? '분석 중' : '파일 분석' }}
      </button>
      <button class="ghost" type="button" @click="manual">수동 입력</button>
      <p v-if="error" class="error">{{ error }}</p>
    </ActionGroup>
    <SectionGroup v-if="form" title="분석 결과 확인">
      <RunForm v-model="form" />
      <ActionGroup>
        <button type="button" :disabled="saving" @click="save">{{ saving ? '저장 중' : '저장' }}</button>
      </ActionGroup>
    </SectionGroup>
    </ContentStack>
  </section>
</template>
