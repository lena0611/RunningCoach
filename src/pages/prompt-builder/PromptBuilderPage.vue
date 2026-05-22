<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRunStore } from '@/app/stores/runStore'
import { fetchCoachReports, requestCoachRun, type CoachReport } from '@/shared/api/coachRepository'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { formatDuration, formatPace } from '@/shared/lib/format'

const runStore = useRunStore()
const selectedRunId = ref('')
const userNote = ref('')
const loading = ref(false)
const error = ref('')
const reports = ref<CoachReport[]>([])

const selectedRun = computed(() => runStore.sortedRuns.find((run) => run.id === selectedRunId.value) ?? null)
const reportThreads = computed(() =>
  reports.value.map((report) => ({
    ...report,
    blocks: parseCoachMarkdown(report.report)
  }))
)

onMounted(loadReports)

async function loadReports() {
  if (!isSupabaseConfigured) return
  try {
    reports.value = await fetchCoachReports()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '코칭 기록을 불러오지 못했습니다.'
  }
}

async function coach() {
  loading.value = true
  error.value = ''
  try {
    const report = await requestCoachRun(selectedRunId.value || null, userNote.value)
    reports.value = [report, ...reports.value]
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'AI 코칭 요청 실패'
  } finally {
    loading.value = false
  }
}

type CoachBlock =
  | { type: 'heading'; text: InlineSegment[] }
  | { type: 'paragraph'; text: InlineSegment[] }
  | { type: 'list'; items: InlineSegment[][] }
  | { type: 'code'; text: string }
  | { type: 'divider' }

type InlineSegment = {
  text: string
  bold: boolean
}

function parseCoachMarkdown(markdown: string): CoachBlock[] {
  const blocks: CoachBlock[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: string[] = []
  let code: string[] = []
  let inCode = false

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: parseInlineMarkdown(paragraph.join(' ')) })
      paragraph = []
    }
  }

  function flushList() {
    if (list.length) {
      blocks.push({ type: 'list', items: list.map(parseInlineMarkdown) })
      list = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      if (inCode) {
        blocks.push({ type: 'code', text: code.join('\n') })
        code = []
        inCode = false
      } else {
        flushParagraph()
        flushList()
        inCode = true
      }
      continue
    }

    if (inCode) {
      code.push(line)
      continue
    }

    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    if (trimmed === '---') {
      flushParagraph()
      flushList()
      blocks.push({ type: 'divider' })
      continue
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: parseInlineMarkdown(heading[1]) })
      continue
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      list.push(bullet[1])
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()
  if (code.length) blocks.push({ type: 'code', text: code.join('\n') })
  return blocks
}

function parseInlineMarkdown(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const pattern = /\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false })
    }
    segments.push({ text: match[1], bold: true })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false })
  }

  return segments.length ? segments : [{ text, bold: false }]
}
</script>

<template>
  <section class="page coach-page">
    <section class="panel coach-composer">
      <div class="section-heading">
        <h2>AI Coach</h2>
      </div>
      <p class="helper">RunLog, 누적 메모리, 오늘 메모를 합쳐 짧은 코칭 리포트를 생성합니다.</p>
      <label>
        선택 RunLog
        <select v-model="selectedRunId">
          <option value="">최근 흐름만 사용</option>
          <option v-for="run in runStore.sortedRuns" :key="run.id" :value="run.id">{{ run.date }} · {{ run.type }} · {{ run.distanceKm }}km</option>
        </select>
      </label>
      <section v-if="selectedRun" class="sub-panel">
        <strong>{{ selectedRun.date }} · {{ selectedRun.sessionTitle || selectedRun.type }}</strong>
        <p>{{ selectedRun.distanceKm }}km · {{ formatDuration(selectedRun.durationSec) }} · {{ formatPace(selectedRun.avgPaceSec) }}/km · HR {{ selectedRun.avgHeartRate ?? '-' }}</p>
        <p v-if="selectedRun.memo">{{ selectedRun.memo }}</p>
        <p v-if="selectedRun.workoutFeeling" class="helper">느낌: {{ selectedRun.workoutFeeling }}</p>
      </section>
      <label>
        오늘 메모
        <textarea v-model="userNote" rows="3" placeholder="예: 오늘 목요일 템포. 후반 3.5km는 와이프랑 9분대 회복 조깅." />
      </label>
      <div class="actions">
        <button type="button" :disabled="loading || !isSupabaseConfigured" @click="coach">{{ loading ? '분석 중' : 'AI 코칭 요청' }}</button>
      </div>
      <p v-if="!isSupabaseConfigured" class="error">Supabase 환경변수가 설정되어야 AI 코칭을 사용할 수 있습니다.</p>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <section class="panel coach-thread">
      <div class="section-heading">
        <h2>코칭 리포트</h2>
      </div>
      <article v-for="report in reportThreads" :key="report.id" class="coach-message">
        <div v-if="report.userNote" class="coach-bubble coach-bubble-user">
          <small>{{ new Date(report.createdAt).toLocaleString() }}</small>
          <p>{{ report.userNote }}</p>
        </div>
        <div class="coach-bubble coach-bubble-ai">
          <small>RunContext Coach</small>
          <div class="coach-report">
            <template v-for="(block, index) in report.blocks" :key="index">
              <h3 v-if="block.type === 'heading'">
                <template v-for="(segment, segmentIndex) in block.text" :key="segmentIndex">
                  <strong v-if="segment.bold">{{ segment.text }}</strong>
                  <span v-else>{{ segment.text }}</span>
                </template>
              </h3>
              <p v-else-if="block.type === 'paragraph'">
                <template v-for="(segment, segmentIndex) in block.text" :key="segmentIndex">
                  <strong v-if="segment.bold">{{ segment.text }}</strong>
                  <span v-else>{{ segment.text }}</span>
                </template>
              </p>
              <ul v-else-if="block.type === 'list'">
                <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
                  <template v-for="(segment, segmentIndex) in item" :key="segmentIndex">
                    <strong v-if="segment.bold">{{ segment.text }}</strong>
                    <span v-else>{{ segment.text }}</span>
                  </template>
                </li>
              </ul>
              <pre v-else-if="block.type === 'code'"><code>{{ block.text }}</code></pre>
              <hr v-else />
            </template>
          </div>
        </div>
      </article>
      <p v-if="!reports.length" class="empty">아직 코칭 리포트가 없습니다.</p>
    </section>
  </section>
</template>
