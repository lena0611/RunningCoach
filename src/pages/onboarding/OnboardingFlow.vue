<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/app/stores/authStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { hasNativeBridge } from '@/shared/lib/runtime'
import { skipsHealthKitImport } from '@/shared/api/testAccountRepository'
import {
  answerBelowRecord,
  distanceKeyFromLongestKm,
  summarizeHealthKitPreview,
  weeklyDaysFromPreview
} from '@/features/import-healthkit-run/onboardingImport'
import { type TrainingInjuryItem, type TrainingMemory } from '@/entities/training-memory/model'
import { vdotFromPerformance, vdotFromVo2Max } from '@/shared/lib/vdotPaces'
import { distanceClassFromMeters, gradeBandFromVdot, nextDistanceClass } from '@/shared/lib/level/levelModel'
import {
  buildInitialWeeklyPattern,
  routineTemplateById,
  ROUTINE_TEMPLATES,
  WEEK_DAYS,
  type RoutineGoalKey,
  type RoutineSlot,
  type RoutineTemplate,
  type RunnerLevelKey,
  type WeekDay
} from '@/shared/lib/coaching/initialWeeklyPattern'

const memoryStore = useMemoryStore()
const levelStore = useLevelStore()
const authStore = useAuthStore()
const healthKitSyncStore = useHealthKitSyncStore()

type StepKey = 1 | 'records' | 2 | 3 | 4 | 5 | 'reveal'
const step = ref<StepKey>(1)
const saving = ref(false)
const error = ref('')

// ── 기록 가져오기 단계(#870) ─────────────────────────────────────────────
// 아이폰 앱(HealthKit 브리지)에서만 보인다. HealthKit 차단 테스트 계정도 건너뛴다. 1단계를 넘길 때 정한다.
const recordsEnabled = ref(false)
let recordsDecided = false
/** 'import' = 미리본 기록을 온보딩 마지막에 저장, 'today' = 오늘 이전 러닝은 가져오지 않음, null = 고르지 않음(단계 없음). */
const recordsChoice = ref<'import' | 'today' | null>(null)
const PREVIEW_TIMEOUT_MS = 20_000
let previewTimer: ReturnType<typeof setTimeout> | null = null

const stepOrder = computed<StepKey[]>(() => (recordsEnabled.value ? [1, 'records', 2, 3, 4, 5] : [1, 2, 3, 4, 5]))
const stepIndex = computed(() => stepOrder.value.indexOf(step.value))

const preview = computed(() => healthKitSyncStore.onboardingPreview)
const previewSummary = computed(() => {
  const p = preview.value
  return p?.status === 'done' && p.candidates.length ? summarizeHealthKitPreview(p.candidates, localTodayIso()) : null
})
const recordsView = computed<'ask' | 'loading' | 'found' | 'empty'>(() => {
  const p = preview.value
  if (!p) return 'ask'
  if (p.status === 'loading') return 'loading'
  return previewSummary.value ? 'found' : 'empty'
})
/** 가져오기로 고른 기록의 요약 — 미리 채우기·어긋남 확인·시작 위치 근거에 쓴다. */
const importedSummary = computed(() => (recordsChoice.value === 'import' ? previewSummary.value : null))
const recordDistanceKey = computed(() => (importedSummary.value ? distanceKeyFromLongestKm(importedSummary.value.longestKm) : null))
/** '아직 레이싱 전'을 골랐는데 기록상 5K 이상을 뛰었다 — 걷기·뛰기부터 시작할지 한 번 묻는다. */
const showRecordConflict = computed(
  () => form.maxDistanceKey === 'pre' && recordDistanceKey.value !== null && answerBelowRecord('pre', recordDistanceKey.value)
)

async function decideRecordsStep() {
  if (recordsDecided) return
  recordsDecided = true
  const userId = authStore.user?.id
  recordsEnabled.value = hasNativeBridge() && !(userId && (await skipsHealthKitImport(userId)))
}

function findRecords() {
  recordsChoice.value = null // 찾으면 다시 '가져오기'가 기본 선택이 되게
  healthKitSyncStore.requestOnboardingPreview()
  if (previewTimer) clearTimeout(previewTimer)
  // 권한 시트에서 오래 머물거나 응답이 끊기면 '찾지 못했어요'로 넘긴다(무한 로딩 금지).
  previewTimer = setTimeout(() => {
    if (healthKitSyncStore.onboardingPreview?.status === 'loading') {
      healthKitSyncStore.onboardingPreview = { status: 'error', candidates: [], error: '응답이 없어요' }
    }
  }, PREVIEW_TIMEOUT_MS)
}

function startFresh() {
  recordsChoice.value = 'today'
  goNext()
}

// 기록을 찾으면 기본 선택은 '가져오기'(추천).
watch(recordsView, (view) => {
  if (view === 'found' && recordsChoice.value === null) recordsChoice.value = 'import'
})

/** 가져오기로 고르면 다음 단계들을 기록으로 미리 채운다(바꿔도 된다). */
function applyRecordsPrefill() {
  const summary = importedSummary.value
  if (!summary) return
  form.maxDistanceKey = distanceKeyFromLongestKm(summary.longestKm)
  const days = weeklyDaysFromPreview(summary)
  if (days) form.weeklyDays = days
}

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})

type DistKey = 'pre' | '5k' | '10k' | 'half' | 'full'
type GoalKey = '5k' | '10k' | 'half' | 'full'

const DIST_M: Record<DistKey, number> = { pre: 0, '5k': 5000, '10k': 10000, half: 21097.5, full: 42195 }
const DIST_LABEL: Record<DistKey, string> = { pre: '아직 레이싱 전', '5k': '5K', '10k': '10K', half: '하프', full: '풀마라톤' }
const GOAL_KM: Record<GoalKey, number> = { '5k': 5, '10k': 10, half: 21.0975, full: 42.195 }
const GOAL_LABEL: Record<GoalKey, string> = { '5k': '5K', '10k': '10K', half: '하프', full: '풀마라톤' }

const INJURY_AREAS = ['햄스트링', '무릎', '족저/발바닥', '아킬레스', '장경인대(IT밴드)', '정강이', '발목', '고관절/엉덩이', '허리', '기타'] as const
const SEVERITY_LABEL: Record<number, string> = { 1: '자각 정도', 2: '러닝 후 통증', 3: '러닝 중 통증', 4: '러닝 어려움' }
// 처방 교체 시 순환할 템플릿 순서.
const TEMPLATE_CYCLE = ROUTINE_TEMPLATES.map((template) => template.id)

const form = reactive({
  birthYear: null as number | null,
  sex: 'unknown' as 'male' | 'female' | 'other' | 'unknown',
  experienceMonths: null as number | null,
  maxDistanceKey: 'pre' as DistKey,
  recordMin: null as number | null,
  recordSec: null as number | null,
  goalKey: '10k' as GoalKey,
  weeklyDays: 4,
  hasInjury: false,
  injuryArea: '햄스트링' as string,
  injurySeverity: 2 as number,
  injuryOnset: '' as string
})

const routineSlots = ref<RoutineSlot[]>([])

const selfMaxDistanceM = computed(() => DIST_M[form.maxDistanceKey])
const selfDistanceKm = computed(() => selfMaxDistanceM.value / 1000)

const recordSec = computed<number | null>(() => {
  if (form.maxDistanceKey === 'pre') return null
  const total = (form.recordMin ?? 0) * 60 + (form.recordSec ?? 0)
  return total > 0 ? total : null
})

const placementVdot = computed<number | null>(() => {
  if (recordSec.value && selfDistanceKm.value >= 3) {
    const v = vdotFromPerformance(selfDistanceKm.value, recordSec.value)
    if (v !== null) return v
  }
  return vdotFromVo2Max(memoryStore.memory.athleteProfile.vo2Max)
})

const previewClass = computed(() => distanceClassFromMeters(selfMaxDistanceM.value))
const previewNextClass = computed(() => nextDistanceClass(previewClass.value))
const previewGrade = computed(() => gradeBandFromVdot(placementVdot.value))
const previewLabel = computed(() =>
  previewGrade.value ? `${previewClass.value.label} · ${previewGrade.value.label}` : previewClass.value.label
)

// 경력(개월) 기반 보수적 레벨 추정. grade label 포맷에 의존하지 않는다.
const levelKey = computed<RunnerLevelKey>(() => {
  const months = form.experienceMonths ?? 0
  if (months < 6) return 'beginner'
  if (months < 18) return 'novice'
  if (months < 36) return 'intermediate'
  return 'advanced'
})

function templateOf(id: string): RoutineTemplate | null {
  return routineTemplateById(id)
}
function templateName(id: string): string {
  return templateOf(id)?.name ?? id
}

function regenerateRoutine() {
  routineSlots.value = buildInitialWeeklyPattern({
    weeklyDays: form.weeklyDays,
    goal: form.goalKey as RoutineGoalKey,
    level: levelKey.value,
    hasActiveInjury: form.hasInjury
  })
}

// Step 4: 요일 순환(✎), 처방 순환(칩 탭), 삭제(✕), 추가(+).
function cycleDay(index: number) {
  const slot = routineSlots.value[index]
  if (!slot) return
  const current = WEEK_DAYS.indexOf(slot.day)
  slot.day = WEEK_DAYS[(current + 1) % WEEK_DAYS.length]
}
function cycleTemplate(index: number) {
  const slot = routineSlots.value[index]
  if (!slot) return
  const current = TEMPLATE_CYCLE.indexOf(slot.templateId)
  const nextId = TEMPLATE_CYCLE[(current + 1) % TEMPLATE_CYCLE.length]
  slot.templateId = nextId
  slot.sessionType = templateOf(nextId)?.sessionType ?? slot.sessionType
}
function removeSlot(index: number) {
  routineSlots.value.splice(index, 1)
}
function addSlot() {
  if (routineSlots.value.length >= 7) return
  const used = new Set(routineSlots.value.map((s) => s.day))
  const freeDay = WEEK_DAYS.find((d) => !used.has(d)) ?? '수'
  routineSlots.value.push({ day: freeDay, templateId: 'easy-base', sessionType: 'Easy' })
}

// Step 5: 부상 시 금기 처방 제외하고 순환.
const INJURY_BLOCKED = new Set(['cruise-interval', '5k-check'])
function eligibleTemplateIds(): string[] {
  return form.hasInjury ? TEMPLATE_CYCLE.filter((id) => !INJURY_BLOCKED.has(id)) : TEMPLATE_CYCLE
}
function swapPrescription(index: number) {
  const slot = routineSlots.value[index]
  if (!slot) return
  const pool = eligibleTemplateIds()
  const current = pool.indexOf(slot.templateId)
  const nextId = pool[(current + 1) % pool.length]
  slot.templateId = nextId
  slot.sessionType = templateOf(nextId)?.sessionType ?? slot.sessionType
}

async function next() {
  if (step.value === 1) await decideRecordsStep()
  if (step.value === 'records') applyRecordsPrefill()
  if (step.value === 3) regenerateRoutine()
  goNext()
}
function goNext() {
  step.value = stepOrder.value[stepIndex.value + 1] ?? 'reveal'
}
function back() {
  if (step.value === 'reveal') step.value = stepOrder.value[stepOrder.value.length - 1]
  else if (stepIndex.value > 0) step.value = stepOrder.value[stepIndex.value - 1]
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
/** 기기 시간대 기준 오늘(YYYY-MM-DD). "오늘부터만" 기준일은 UTC 가 아니라 사용자의 오늘이어야 한다. */
function localTodayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildInjuryItem(): TrainingInjuryItem {
  return {
    title: `${form.injuryArea} (온보딩 신고)`,
    area: form.injuryArea,
    status: 'active',
    severity: form.injurySeverity,
    onsetDate: form.injuryOnset || null,
    returnToRunCriteria: ''
  } as unknown as TrainingInjuryItem
}

async function persist(placed: boolean) {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    // 기록 가져오기(#870): 플랜을 짓기 전에(아래 complete 가 짓는 신호다) 고른 대로 저장한다.
    // 건너뛰기면 고르지 않은 것으로 보고 미리본 것도 버린다 — 온보딩이 끝나면 평소 자동 동기화가 돈다.
    if (placed && recordsChoice.value === 'import') await healthKitSyncStore.importOnboardingPreview()
    else healthKitSyncStore.clearOnboardingPreview()
    if (placed) {
      const memory: TrainingMemory = JSON.parse(JSON.stringify(memoryStore.memory))
      if (recordsChoice.value === 'today') memory.healthKitImportFrom = localTodayIso()
      memory.athleteProfile.birthYear = form.birthYear
      memory.athleteProfile.sex = form.sex
      memory.athleteProfile.runningExperienceMonths = form.experienceMonths
      memory.athleteProfile.weeklyRunDaysTarget = form.weeklyDays
      if (recordSec.value && selfDistanceKm.value > 0) {
        memory.athleteProfile.personalBests = [
          ...(memory.athleteProfile.personalBests ?? []),
          { distanceKm: selfDistanceKm.value, durationSec: recordSec.value, date: todayIso(), source: 'estimated' }
        ]
      }
      if (memory.goals?.[0]) {
        memory.goals[0].distanceKm = GOAL_KM[form.goalKey]
        memory.goals[0].title = `${GOAL_LABEL[form.goalKey]} 목표`
      }
      memory.goal = `${GOAL_LABEL[form.goalKey]} 목표`

      // 온보딩 루틴 슬롯은 "이런 주로 시작해요" 미리보기다 — 메모리에 저장하지 않는다.
      // 주간 루틴의 정본은 목표로 생성되는 주기화 플랜(training_schedule), 세션별 실행 지침은
      // sessionBriefing 이 갖는다. 여기서 처방을 따로 영속하면 그 둘과 어긋난다(2026-09-07).

      // #331: 부상 심화 입력 → 구조화 TrainingInjuryItem
      if (form.hasInjury) {
        memory.injuryItems = [...(memory.injuryItems ?? []), buildInjuryItem()]
      }

      await memoryStore.update(memory)
    }
    await levelStore.complete({
      self_reported_max_distance_m: placed ? selfMaxDistanceM.value || null : null,
      self_reported_vdot: placed ? placementVdot.value : null
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : '저장에 실패했어요. 잠시 후 다시 시도해주세요.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="onboarding" role="dialog" aria-modal="true" aria-label="시작 인터뷰">
    <div class="onboarding-card">
      <header class="onboarding-head">
        <div class="onboarding-dots" v-if="step !== 'reveal'">
          <span v-for="(key, index) in stepOrder" :key="key" :class="{ on: index <= stepIndex }" />
        </div>
        <button v-if="step !== 'reveal'" class="onboarding-skip" type="button" :disabled="saving" @click="persist(false)">
          건너뛰기
        </button>
      </header>

      <!-- 1: 기본 -->
      <section v-if="step === 1" class="onboarding-step">
        <h2>나를 알려주세요</h2>
        <p class="onboarding-help">레벨을 정확히 잡기 위한 기본 정보예요.</p>
        <label class="field">
          <span>출생연도</span>
          <input v-model.number="form.birthYear" type="number" inputmode="numeric" placeholder="예: 1992" />
        </label>
        <label class="field">
          <span>성별</span>
          <select v-model="form.sex">
            <option value="unknown">선택 안 함</option>
            <option value="male">남성</option>
            <option value="female">여성</option>
            <option value="other">기타</option>
          </select>
        </label>
        <label class="field">
          <span>러닝 경력 (개월)</span>
          <input v-model.number="form.experienceMonths" type="number" inputmode="numeric" placeholder="예: 18" />
        </label>
      </section>

      <!-- 기록 가져오기(#870): 아이폰 앱에서만. 조회는 미리보기이고 저장은 온보딩 마지막에 한다. -->
      <section v-else-if="step === 'records'" class="onboarding-step">
        <template v-if="recordsView === 'ask'">
          <h2>지금까지 뛴 기록이 있나요?</h2>
          <p class="onboarding-help">아이폰 건강 앱에 러닝 기록이 있으면 가져와서, 처음부터 내 몸에 맞는 강도로 시작해요.</p>
          <div class="records-box">
            <span class="records-box-label">가져오는 것</span>
            <span>러닝 운동 — 거리·시간·페이스</span>
            <span>심박·케이던스</span>
            <span>경로(지도)</span>
            <small class="onboarding-help">몇 개가 있는지 먼저 보여드리고, 가져올지는 그다음에 골라요.</small>
          </div>
          <div class="records-actions">
            <button class="primary" type="button" @click="findRecords">건강 앱에서 찾아보기</button>
            <button class="ghost" type="button" @click="startFresh">아직 뛴 기록이 없어요</button>
          </div>
        </template>

        <template v-else-if="recordsView === 'loading'">
          <h2>건강 앱에서 찾는 중…</h2>
          <p class="onboarding-help">권한을 묻는 창이 뜨면 '운동'과 '운동 경로'를 허용해 주세요.</p>
        </template>

        <template v-else-if="recordsView === 'found' && previewSummary">
          <h2>최근 90일 러닝을 {{ previewSummary.count }}개 찾았어요</h2>
          <p class="onboarding-help">아직 아무것도 저장하지 않았어요.</p>
          <div class="records-grid">
            <div class="records-stat">
              <span>기간</span>
              <strong>{{ previewSummary.firstDate?.slice(5).replace('-', '/') }} ~ {{ previewSummary.lastDate?.slice(5).replace('-', '/') }}</strong>
            </div>
            <div class="records-stat">
              <span>가장 긴 러닝</span>
              <strong>{{ previewSummary.longestKm }}km</strong>
            </div>
            <div class="records-stat">
              <span>최근 4주 평균</span>
              <strong>{{ previewSummary.recentRunsPerWeek > 0 ? `주 ${previewSummary.recentKmPerWeek}km · ${Math.round(previewSummary.recentRunsPerWeek)}회` : '기록 없음' }}</strong>
            </div>
            <div class="records-stat">
              <span>마지막 러닝</span>
              <strong>{{ previewSummary.daysSinceLast === 0 ? '오늘' : `${previewSummary.daysSinceLast}일 전` }}</strong>
            </div>
          </div>
          <div class="records-choices" role="radiogroup" aria-label="기록을 어떻게 할까요">
            <button
              type="button"
              role="radio"
              class="records-choice"
              :class="{ on: recordsChoice === 'import' }"
              :aria-checked="recordsChoice === 'import'"
              @click="recordsChoice = 'import'"
            >
              <strong>이 기록 가져오기 <span class="records-badge">추천</span></strong>
              <span>시작 강도를 이 기록에 맞춰요. 기록·추세 탭에도 바로 보여요.</span>
            </button>
            <button
              type="button"
              role="radio"
              class="records-choice"
              :class="{ on: recordsChoice === 'today' }"
              :aria-checked="recordsChoice === 'today'"
              @click="recordsChoice = 'today'"
            >
              <strong>오늘부터 뛴 것만</strong>
              <span>지금까지 기록은 가져오지 않아요. 오늘 이후 러닝만 들어와요.</span>
            </button>
          </div>
        </template>

        <template v-else>
          <h2>최근 90일 러닝을 찾지 못했어요</h2>
          <p class="onboarding-help">둘 중 하나예요. iOS 는 어느 쪽인지 알려주지 않아요.</p>
          <div class="records-box">
            <strong>아직 아이폰으로 뛴 기록이 없어요</strong>
            <small class="onboarding-help">처음부터 시작하면 돼요. 걷기·뛰기부터 차근차근 안내할게요.</small>
          </div>
          <div class="records-box">
            <strong>건강 앱에서 '운동' 읽기를 꺼 두었어요</strong>
            <small class="onboarding-help">설정 › 건강 › 데이터 접근 및 기기 › PaceLAB 에서 '운동'과 '운동 경로'를 켠 뒤 다시 찾아보세요.</small>
          </div>
          <div class="records-actions">
            <button class="primary" type="button" @click="startFresh">처음부터 시작할게요</button>
            <button class="ghost" type="button" @click="findRecords">켜고 다시 찾아보기</button>
          </div>
        </template>
      </section>

      <!-- 2: 완주 경험 + 기록 -->
      <section v-else-if="step === 2" class="onboarding-step">
        <h2>완주해본 가장 긴 거리는?</h2>
        <p class="onboarding-help">거리 클래스(전직)를 정합니다. 영구 해금이라 줄어들지 않아요.</p>
        <div class="chip-grid">
          <button
            v-for="key in (['pre','5k','10k','half','full'] as DistKey[])"
            :key="key"
            type="button"
            class="chip"
            :class="{ on: form.maxDistanceKey === key }"
            @click="form.maxDistanceKey = key"
          >
            {{ DIST_LABEL[key] }}
          </button>
        </div>
        <small v-if="importedSummary" class="onboarding-help">
          기록상 가장 긴 러닝 {{ importedSummary.longestKm }}km · {{ importedSummary.longestDate?.slice(5).replace('-', '/') }} — 기록으로 미리 골라 두었어요. 바꿔도 돼요.
        </small>
        <div v-if="showRecordConflict && importedSummary" class="records-conflict" role="status">
          <strong>기록을 보니 이미 {{ importedSummary.longestKm }}km를 뛰셨어요</strong>
          <span>'레이싱 전'으로 시작하면 걷기·뛰기 1주차부터예요. 지금 기록이면 그보다 위에서 시작하는 게 맞아 보여요.</span>
          <button class="primary" type="button" @click="form.maxDistanceKey = recordDistanceKey ?? 'pre'">기록 기준으로 시작 (추천)</button>
          <button class="ghost" type="button" @click="recordsChoice = 'today'">그래도 걷기·뛰기부터 — 지금까지 기록은 안 가져와요</button>
        </div>
        <div v-if="form.maxDistanceKey !== 'pre'" class="record-row">
          <span class="field-label">{{ DIST_LABEL[form.maxDistanceKey] }} 기록 (선택)</span>
          <div class="record-inputs">
            <input v-model.number="form.recordMin" type="number" inputmode="numeric" placeholder="분" />
            <span>:</span>
            <input v-model.number="form.recordSec" type="number" inputmode="numeric" placeholder="초" />
          </div>
          <small class="onboarding-help">기록을 넣으면 등급이 정확해져요(없으면 추정).</small>
        </div>
      </section>

      <!-- 3: 목표 & 현재 + 부상 심화 -->
      <section v-else-if="step === 3" class="onboarding-step">
        <h2>목표와 현재 루틴</h2>
        <p class="onboarding-help">퀘스트와 추천 훈련의 기준이 됩니다.</p>
        <span class="field-label">목표 거리</span>
        <div class="chip-grid">
          <button
            v-for="key in (['5k','10k','half','full'] as GoalKey[])"
            :key="key"
            type="button"
            class="chip"
            :class="{ on: form.goalKey === key }"
            @click="form.goalKey = key"
          >
            {{ GOAL_LABEL[key] }}
          </button>
        </div>
        <label class="field">
          <span>주간 러닝 목표 (회/주)</span>
          <input v-model.number="form.weeklyDays" type="number" inputmode="numeric" min="1" max="7" />
        </label>
        <!-- 체크박스는 전역 input 스타일(폭 100%·높이 48px)에 늘어나 회색 막대로 보였다(#866) — 앱의 켬/끔 스위치로 -->
        <div class="field field-row">
          <span id="onboarding-injury-label">현재 관리 중인 부상이 있나요?</span>
          <button
            class="switch-control"
            :class="{ on: form.hasInjury }"
            type="button"
            role="switch"
            aria-labelledby="onboarding-injury-label"
            :aria-checked="form.hasInjury"
            @click="form.hasInjury = !form.hasInjury"
          >
            <span />
          </button>
        </div>
        <div v-if="form.hasInjury" class="injury-detail">
          <label class="field">
            <span>부위</span>
            <select v-model="form.injuryArea">
              <option v-for="area in INJURY_AREAS" :key="area" :value="area">{{ area }}</option>
            </select>
          </label>
          <span class="field-label">심각도</span>
          <div class="chip-grid">
            <button
              v-for="level in ([1,2,3,4] as number[])"
              :key="level"
              type="button"
              class="chip"
              :class="{ on: form.injurySeverity === level }"
              @click="form.injurySeverity = level"
            >
              {{ level }}. {{ SEVERITY_LABEL[level] }}
            </button>
          </div>
          <label class="field">
            <span>언제부터인가요? (선택)</span>
            <input v-model="form.injuryOnset" type="date" />
          </label>
          <small class="onboarding-help">부상 정보는 추천 루틴에서 고강도 세션을 자동으로 낮춰요.</small>
        </div>
      </section>

      <!-- 4: 주간 루틴 추천 + 인라인 편집 (#329) -->
      <section v-else-if="step === 4" class="onboarding-step">
        <h2>주간 루틴 추천</h2>
        <p class="onboarding-help">
          주 {{ form.weeklyDays }}회 · {{ GOAL_LABEL[form.goalKey] }} 목표 기준이에요. 요일/세션을 바꿀 수 있어요.
        </p>
        <ul class="slot-list">
          <li v-for="(slot, index) in routineSlots" :key="index" class="slot-row">
            <button type="button" class="slot-day" @click="cycleDay(index)">{{ slot.day }}</button>
            <button type="button" class="chip slot-chip" @click="cycleTemplate(index)">{{ templateName(slot.templateId) }}</button>
            <button type="button" class="slot-x" aria-label="삭제" @click="removeSlot(index)">✕</button>
          </li>
        </ul>
        <button v-if="routineSlots.length < 7" type="button" class="slot-add" @click="addSlot">＋ 세션 추가</button>
        <small class="onboarding-help">요일 탭→다음 요일 · 세션 탭→다른 훈련으로 교체</small>
      </section>

      <!-- 5: 처방 매핑 확정 (#330) -->
      <section v-else-if="step === 5" class="onboarding-step">
        <h2>훈련 확인</h2>
        <p class="onboarding-help">각 세션이 무엇을 위한 건지예요. ‘다른 훈련’으로 바꿀 수 있어요. 웜업·반복수 같은 세부 실행 지침은 목표로 플랜이 만들어진 뒤 세션마다 계산돼요.</p>
        <ul class="rx-list">
          <li v-for="(slot, index) in routineSlots" :key="index" class="rx-row">
            <div class="rx-head">
              <span class="rx-day">{{ slot.day }}</span>
              <span class="rx-name">{{ templateName(slot.templateId) }}</span>
              <button type="button" class="rx-swap" @click="swapPrescription(index)">다른 훈련</button>
            </div>
            <p class="rx-purpose">{{ templateOf(slot.templateId)?.purpose }}</p>
          </li>
        </ul>
      </section>

      <!-- reveal: 시작 배치 -->
      <section v-else class="onboarding-step onboarding-reveal">
        <p class="reveal-eyebrow">🎉 시작 위치</p>
        <div class="reveal-badge">{{ previewLabel }}</div>
        <!-- 가져온 기록이 클래스를 받쳐 주면 이미 GPS 로 확인된 것이다(#870) -->
        <p v-if="!importedSummary || answerBelowRecord(recordDistanceKey ?? 'pre', form.maxDistanceKey)" class="reveal-tentative">(잠정 · GPS 주행으로 완주하면 인증됩니다)</p>
        <p v-if="placementVdot" class="onboarding-help">VDOT {{ placementVdot }} 기준</p>
        <p v-else class="onboarding-help">기록/VO2max가 쌓이면 등급이 잡혀요.</p>
        <p v-if="previewNextClass" class="reveal-next">다음 목표: {{ previewNextClass.label }} 🔒</p>
        <p v-if="importedSummary" class="reveal-basis">
          가져온 기록 {{ importedSummary.count }}개 기준 ·
          <template v-if="importedSummary.daysSinceLast !== null && importedSummary.daysSinceLast > 28">마지막 러닝이 {{ importedSummary.daysSinceLast }}일 전이라 쉰 만큼 낮춰서 시작해요.</template>
          <template v-else>최근 4주 기록에 맞춰 첫 플랜을 짜요.</template>
        </p>
        <p v-else-if="recordsChoice === 'today'" class="reveal-basis">지금까지 기록은 가져오지 않고, 온보딩 답으로 첫 플랜을 짜요.</p>
      </section>

      <p v-if="error" class="onboarding-error">{{ error }}</p>

      <footer class="onboarding-foot">
        <button v-if="step !== 1" class="ghost" type="button" :disabled="saving" @click="back">이전</button>
        <button
          v-if="step !== 'reveal' && (step !== 'records' || recordsView === 'found')"
          class="primary"
          type="button"
          :disabled="saving"
          @click="next"
        >
          다음
        </button>
        <button v-else-if="step === 'reveal'" class="primary" type="button" :disabled="saving" @click="persist(true)">
          {{ saving ? '저장 중…' : '시작하기' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--color-surface, #0c0d10);
  overflow-y: auto;
}

.onboarding-card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.onboarding-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
}

.onboarding-dots {
  display: flex;
  gap: 6px;
}

.onboarding-dots span {
  width: 14px;
  height: 6px;
  border-radius: 999px;
  background: rgba(120, 120, 120, 0.3);
}

.onboarding-dots span.on {
  background: var(--color-primary);
}

.onboarding-skip {
  background: none;
  border: none;
  color: var(--color-muted);
  font-size: var(--text-caption-size);
  cursor: pointer;
}

.onboarding-step {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.onboarding-step h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.onboarding-help {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--color-text);
}

.field-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.field input[type='number'],
.field input[type='text'],
.field input[type='date'],
.field select {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
  color: var(--color-text);
  font-size: 16px;
}

.field-label {
  font-size: 14px;
  color: var(--color-text);
}

.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
}

.chip.on {
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}

.record-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.record-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.record-inputs input {
  width: 80px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
  color: var(--color-text);
  font-size: 16px;
  text-align: center;
}

.injury-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-card, 16px);
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
}

.slot-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.slot-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slot-day {
  flex: 0 0 auto;
  width: 44px;
  padding: 10px 0;
  border-radius: 12px;
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
  color: var(--color-text);
  font-size: var(--text-info-size);
  font-weight: 600;
  cursor: pointer;
}

.slot-chip {
  flex: 1;
  text-align: center;
}

.slot-x {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: transparent;
  color: var(--color-muted);
  font-size: 14px;
  cursor: pointer;
}

.slot-add {
  align-self: flex-start;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px dashed rgba(120, 120, 120, 0.4);
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
}

.rx-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rx-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: var(--radius-card, 16px);
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
}

.rx-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rx-day {
  flex: 0 0 auto;
  font-weight: 700;
  color: var(--color-primary);
}

.rx-name {
  flex: 1;
  font-weight: 600;
  color: var(--color-text);
}

.rx-swap {
  flex: 0 0 auto;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: transparent;
  color: var(--color-muted);
  font-size: 12px;
  cursor: pointer;
}

.rx-purpose {
  font-size: var(--text-caption-size);
  color: var(--color-text);
  margin: 0;
}


.onboarding-reveal {
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 24px 0;
}

.reveal-eyebrow {
  font-size: 14px;
  color: var(--color-muted);
  margin: 0;
}

.reveal-badge {
  font-size: 26px;
  font-weight: 800;
  color: var(--color-primary);
  padding: 14px 22px;
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-card, 20px);
}

.reveal-tentative {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
  margin: 0;
}

.reveal-next {
  font-size: 14px;
  color: var(--color-text);
  margin-top: 6px;
}

.records-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--color-surface-2);
  font-size: var(--text-info-size);
  color: var(--color-text);
}

.records-box-label {
  font-size: var(--text-caption-size);
  font-weight: 700;
  color: var(--color-muted);
}

.records-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.records-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.records-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-surface-2);
}

.records-stat span {
  font-size: var(--text-micro-size);
  color: var(--color-muted);
}

.records-stat strong {
  font-size: var(--text-info-size);
  color: var(--color-text);
}

.records-choices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 전역 button 기본(그라디언트·그림자·높이)을 지우고 카드형 선택지로 쓴다(ui-system-contract 커스텀 버튼 규칙). */
.records-choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-height: 0;
  padding: 14px;
  border: 2px solid var(--color-border-strong);
  border-radius: 14px;
  background: var(--color-surface-2);
  box-shadow: none;
  text-shadow: none;
  color: var(--color-text);
  text-align: left;
}

.records-choice.on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.records-choice strong {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-info-size);
}

.records-choice span {
  font-size: var(--text-caption-size);
  font-weight: 400;
  color: var(--color-muted);
}

.records-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary) !important;
  font-size: var(--text-micro-size) !important;
  font-weight: 700 !important;
}

.records-conflict {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-text);
}

.records-conflict span {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}

.reveal-basis {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
  margin: 6px 0 0;
}

.onboarding-error {
  font-size: var(--text-caption-size);
  color: #d05050;
  margin: 0;
}

.onboarding-foot {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.onboarding-foot button {
  flex: 1;
  padding: 14px;
  border-radius: 14px;
  font-size: var(--text-info-size);
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.onboarding-foot .ghost {
  flex: 0 0 auto;
  padding: 14px 18px;
  background: transparent;
  border: 1px solid rgba(120, 120, 120, 0.3);
  color: var(--color-text);
}

.onboarding-foot .primary {
  background: var(--color-primary);
  color: #08130d;
}
</style>
