<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ selected: [file: File]; cleared: [] }>()

const fileName = ref('')
const fileSize = ref('')

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fileName.value = file.name
  fileSize.value = formatFileSize(file.size)
  emit('selected', file)
}

function clear() {
  fileName.value = ''
  fileSize.value = ''
  emit('cleared')
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}

defineExpose({ clear })
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <h2>FIT 파일 업로드</h2>
      <button v-if="fileName" class="ghost" type="button" @click="clear">폐기</button>
    </div>
    <label class="upload-box">
      <input type="file" accept=".fit,application/octet-stream" @change="onFileChange" />
      <span>Workoutdoors FIT 파일 선택</span>
      <small>FIT 파일을 브라우저에서 로컬 분석합니다. 원본 파일명과 파일 내용은 저장하지 않습니다.</small>
    </label>
    <div v-if="fileName" class="preview file-preview">
      <strong>{{ fileName }}</strong>
      <p>{{ fileSize }}</p>
    </div>
  </section>
</template>
