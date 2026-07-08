<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { defaultPrescriptionTemplates, type PrescriptionTemplate, type TrainingInjuryItem, type TrainingMemory } from '@/entities/training-memory/model'
import { vdotFromPerformance, vdotFromVo2Max } from '@/shared/lib/vdotPaces'
import { distanceClassFromMeters, gradeBandFromVdot, nextDistanceClass } from '@/shared/lib/level/levelModel'
import {
  buildInitialWeeklyPattern,
  prescriptionTemplateById,
  slotsToWeeklyPattern,
  WEEK_DAYS,
  type RoutineGoalKey,
  type RoutineSlot,
  type RunnerLevelKey,
  type WeekDay
} from '@/shared/lib/coaching/initialWeeklyPattern'
import { saveWeeklyPattern } from '@/shared/api/adaptiveTrainingRepository'

const memoryStore = useMemoryStore()
const levelStore = useLevelStore()

type StepKey = 1 | 2 | 3 | 4 | 5 | 'reveal'
const step = ref<StepKey>(1)
const saving = ref(false)
const error = ref('')

type DistKey = 'pre' | '5k' | '10k' | 'half' | 'full'
type GoalKey = '5k' | '10k' | 'half' | 'full'

const DIST_M: Record<DistKey, number> = { pre: 0, '5k': 5000, '10k': 10000, half: 21097.5, full: 42195 }
const DIST_LABEL: Record<DistKey, string> = { pre: '아직 레이싱 전', '5k': '5K', '10k': '10K', half: '하프', full: '풀마라톤' }
const GOAL_KM: Record<GoalKey, number> = { '5k': 5, '10k': 10, half: 21.0975, full: 42.195 }
const GOAL_LABEL: Record<GoalKey, string> = { '5k': '5K', '10k': '10K', half: '하프', full: '풀마라톤' }

const INJURY_AREAS = ['햄스트링', '무릎', '족저/발바닥', '아킬레스', '장경인대(IT밴드)', '정강이', '발목', '고관절/엉덩이', '허리', '기타'] as const
const SEVERITY_LABEL: Record<number, string> = { 1: '자각 정도', 2: '러닝 후 통증', 3: '러닝 중 통증', 4: '러닝 어려움' }
// 처방 교체 시 순환할 템플릿 순서.
const TEMPLATE_CYCLE = defaultPrescriptionTemplates.map((template) => template.id)

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

function templateOf(id: string): PrescriptionTemplate | null {
  return prescriptionTemplateById(id)
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

function next() {
  if (step.value === 1) step.value = 2
  else if (step.value === 2) step.value = 3
  else if (step.value === 3) {
    regenerateRoutine()
    step.value = 4
  } else if (step.value === 4) step.value = 5
  else if (step.value === 5) step.value = 'reveal'
}
function back() {
  if (step.value === 2) step.value = 1
  else if (step.value === 3) step.value = 2
  else if (step.value === 4) step.value = 3
  else if (step.value === 5) step.value = 4
  else if (step.value === 'reveal') step.value = 5
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
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
    if (placed) {
      const memory: TrainingMemory = JSON.parse(JSON.stringify(memoryStore.memory))
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

      // #329/#330: 온보딩 루틴 → weeklyPattern + 선택 처방 템플릿(중복 제거)
      const slots = routineSlots.value
      if (slots.length) {
        memory.weeklyPattern = slotsToWeeklyPattern(slots)
        const chosenIds = [...new Set(slots.map((slot) => slot.templateId))]
        const chosenTemplates = chosenIds
          .map((id) => templateOf(id))
          .filter((template): template is PrescriptionTemplate => Boolean(template))
        if (chosenTemplates.length) {
          memory.adaptiveTrainingProfile.prescriptionTemplates = JSON.parse(JSON.stringify(chosenTemplates))
        }
      }

      // #331: 부상 심화 입력 → 구조화 TrainingInjuryItem
      if (form.hasInjury) {
        memory.injuryItems = [...(memory.injuryItems ?? []), buildInjuryItem()]
      }

      await memoryStore.update(memory)
      // #328: weekly_patterns 이력 저장(실패해도 온보딩 완료는 막지 않는다)
      if (slots.length) {
        try {
          await saveWeeklyPattern(memory.weeklyPattern, 'onboarding')
        } catch {
          /* 이력 저장 실패는 치명적이지 않음 */
        }
      }
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
          <span :class="{ on: typeof step === 'number' && step >= 1 }" />
          <span :class="{ on: typeof step === 'number' && step >= 2 }" />
          <span :class="{ on: typeof step === 'number' && step >= 3 }" />
          <span :class="{ on: typeof step === 'number' && step >= 4 }" />
          <span :class="{ on: typeof step === 'number' && step >= 5 }" />
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
        <label class="field field-row">
          <span>현재 관리 중인 부상이 있나요?</span>
          <input v-model="form.hasInjury" type="checkbox" />
        </label>
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
        <small class="onboarding-help">요일 탭→다음 요일 · 세션 탭→처방 교체</small>
      </section>

      <!-- 5: 처방 매핑 확정 (#330) -->
      <section v-else-if="step === 5" class="onboarding-step">
        <h2>처방 확인</h2>
        <p class="onboarding-help">각 세션의 강도 기준이에요. ‘다른 처방’으로 바꿀 수 있어요.</p>
        <ul class="rx-list">
          <li v-for="(slot, index) in routineSlots" :key="index" class="rx-row">
            <div class="rx-head">
              <span class="rx-day">{{ slot.day }}</span>
              <span class="rx-name">{{ templateName(slot.templateId) }}</span>
              <button type="button" class="rx-swap" @click="swapPrescription(index)">다른 처방</button>
            </div>
            <p class="rx-purpose">{{ templateOf(slot.templateId)?.purpose }}</p>
            <p class="rx-workout">{{ (templateOf(slot.templateId)?.workout ?? []).join(' · ') }}</p>
          </li>
        </ul>
      </section>

      <!-- reveal: 시작 배치 -->
      <section v-else class="onboarding-step onboarding-reveal">
        <p class="reveal-eyebrow">🎉 시작 위치</p>
        <div class="reveal-badge">{{ previewLabel }}</div>
        <p class="reveal-tentative">(잠정 · GPS 주행으로 완주하면 인증됩니다)</p>
        <p v-if="placementVdot" class="onboarding-help">VDOT {{ placementVdot }} 기준</p>
        <p v-else class="onboarding-help">기록/VO2max가 쌓이면 등급이 잡혀요.</p>
        <p v-if="previewNextClass" class="reveal-next">다음 목표: {{ previewNextClass.label }} 🔒</p>
      </section>

      <p v-if="error" class="onboarding-error">{{ error }}</p>

      <footer class="onboarding-foot">
        <button v-if="step !== 1" class="ghost" type="button" :disabled="saving" @click="back">이전</button>
        <button v-if="step !== 'reveal'" class="primary" type="button" :disabled="saving" @click="next">다음</button>
        <button v-else class="primary" type="button" :disabled="saving" @click="persist(true)">
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

.rx-workout {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
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
