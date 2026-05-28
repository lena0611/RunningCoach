<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useRunStore } from '@/app/stores/runStore'
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
const healthKitSyncStore = useHealthKitSyncStore()
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
      <p v-if="healthKitSyncStore.error" class="error">{{ healthKitSyncStore.error }}</p>
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
