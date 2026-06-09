<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useLevelStore } from '@/app/stores/levelStore'
import type { TrainingInjuryItem, TrainingMemory } from '@/entities/training-memory/model'
import { vdotFromPerformance, vdotFromVo2Max } from '@/shared/lib/vdotPaces'
import { distanceClassFromMeters, gradeBandFromVdot, nextDistanceClass } from '@/shared/lib/level/levelModel'

const memoryStore = useMemoryStore()
const levelStore = useLevelStore()

type StepKey = 1 | 2 | 3 | 'reveal'
const step = ref<StepKey>(1)
const saving = ref(false)
const error = ref('')

type DistKey = 'pre' | '5k' | '10k' | 'half' | 'full'
type GoalKey = '5k' | '10k' | 'half' | 'full'

const DIST_M: Record<DistKey, number> = { pre: 0, '5k': 5000, '10k': 10000, half: 21097.5, full: 42195 }
const DIST_LABEL: Record<DistKey, string> = { pre: '아직 레이싱 전', '5k': '5K', '10k': '10K', half: '하프', full: '풀마라톤' }
const GOAL_KM: Record<GoalKey, number> = { '5k': 5, '10k': 10, half: 21.0975, full: 42.195 }
const GOAL_LABEL: Record<GoalKey, string> = { '5k': '5K', '10k': '10K', half: '하프', full: '풀마라톤' }

const form = reactive({
  birthYear: null as number | null,
  sex: 'unknown' as 'male' | 'female' | 'other' | 'unknown',
  experienceMonths: null as number | null,
  maxDistanceKey: 'pre' as DistKey,
  recordMin: null as number | null,
  recordSec: null as number | null,
  goalKey: '10k' as GoalKey,
  weeklyDays: 4,
  hasInjury: false
})

const selfMaxDistanceM = computed(() => DIST_M[form.maxDistanceKey])
const selfDistanceKm = computed(() => selfMaxDistanceM.value / 1000)

const recordSec = computed<number | null>(() => {
  if (form.maxDistanceKey === 'pre') return null
  const total = (form.recordMin ?? 0) * 60 + (form.recordSec ?? 0)
  return total > 0 ? total : null
})

// 배치용 VDOT: 자기보고 기록(3km+) → 환산, 없으면 프로필 VO2max 보조.
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

function next() {
  if (step.value === 1) step.value = 2
  else if (step.value === 2) step.value = 3
  else if (step.value === 3) step.value = 'reveal'
}
function back() {
  if (step.value === 2) step.value = 1
  else if (step.value === 3) step.value = 2
  else if (step.value === 'reveal') step.value = 3
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
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
      if (form.hasInjury) {
        memory.injuryItems = [
          ...(memory.injuryItems ?? []),
          { title: '온보딩에서 신고한 부상', status: 'monitoring' } as unknown as TrainingInjuryItem
        ]
      }
      await memoryStore.update(memory)
    }
    await levelStore.complete({
      self_reported_max_distance_m: placed ? selfMaxDistanceM.value || null : null,
      self_reported_vdot: placed ? placementVdot.value : null
    })
    // 성공 시 levelStore.needsOnboarding 가 false 가 되어 App.vue 오버레이가 닫힌다.
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
          <span :class="{ on: step >= 1 }" />
          <span :class="{ on: step >= 2 }" />
          <span :class="{ on: step >= 3 }" />
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

      <!-- 3: 목표 & 현재 -->
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
        <button v-if="step !== 1 && step !== 'reveal'" class="ghost" type="button" :disabled="saving" @click="back">이전</button>
        <button v-if="step === 'reveal'" class="ghost" type="button" :disabled="saving" @click="back">이전</button>
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
  width: 18px;
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
  font-size: 13px;
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
  font-size: 13px;
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
  font-size: 12px;
  color: var(--color-muted);
  margin: 0;
}

.reveal-next {
  font-size: 14px;
  color: var(--color-text);
  margin-top: 6px;
}

.onboarding-error {
  font-size: 13px;
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
  font-size: 15px;
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
