<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useGoalAdjustStore } from '@/app/stores/goalAdjustStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useToastStore } from '@/app/stores/toastStore'
import { getActiveGoal, getActiveInjuryItem } from '@/entities/training-memory/model'
import { applyGoalChange, type GoalChange } from '@/entities/training-memory/goalChanges'
import { beginnerWalkRunStage } from '@/shared/lib/coaching/beginnerWalkRun'
import { goalAdjustOptions, goalAdjustStartDate, isGoalDateFeasible, raceDistanceLabel, type GoalAdjustInput } from '@/shared/lib/coaching/goalAdjust'
import { buildPeriodizedSchedule, GOAL_DISTANCE_RECENCY_DAYS, planStartWeeklyKm } from '@/shared/lib/coaching/periodizedSchedule'
import { getLongestRunKmWithinDays } from '@/shared/lib/runStats'
import { formatDuration, formatMonthDay } from '@/shared/lib/format'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import { useSheetA11y } from '@/shared/lib/useSheetA11y'
import DateField from '@/shared/ui/DateField.vue'

/**
 * 목표 다시 정하기(#889) — 부상·휴식으로 대회가 빠듯할 때 미루기·거리 낮추기·완주만·잠시 내려놓기·그대로.
 * 쉬던(내려놓은) 목표를 열면 '다시 시작' 모드다. 고른 결과는 메모리에만 쓴다 — 플랜은 목표 날짜·거리가
 * 플랜을 지은 값과 달라진 걸 일정 확인(useTrainingWeek)이 보고 오늘부터 다시 짠다.
 */
type Choice = 'postpone' | 'shorter' | 'finish' | 'letgo'
type Step = 'options' | 'postpone' | 'letgo'

const store = useGoalAdjustStore()
const memoryStore = useMemoryStore()
const runStore = useRunStore()
const levelStore = useLevelStore()
const toastStore = useToastStore()

const step = ref<Step>('options')
const choice = ref<Choice | null>(null)
const pickedDate = ref<string | null>(null)
const customDate = ref<string | null>(null)
const saving = ref(false)

const today = ref(new Date())
const goal = computed(() => {
  const memory = memoryStore.memory
  return (store.goalId ? memory.goals.find((g) => g.id === store.goalId) : null) ?? getActiveGoal(memory)
})
const resumeMode = computed(() => goal.value?.status === 'paused')
const injury = computed(() => getActiveInjuryItem(memoryStore.memory))
const restUntil = computed(() => {
  const rest = memoryStore.memory.activeRest
  return rest && rest.untilDate >= isoOf(today.value) ? rest.untilDate : null
})
const currentWeeklyKm = computed(() => planStartWeeklyKm(runStore.runs, levelStore.selfReportedMaxDistanceM, today.value))
const input = computed<GoalAdjustInput | null>(() =>
  goal.value
    ? {
        goal: goal.value,
        profile: memoryStore.memory.athleteProfile,
        today: today.value,
        currentWeeklyKm: currentWeeklyKm.value,
        recentLongestKm: getLongestRunKmWithinDays(runStore.runs, GOAL_DISTANCE_RECENCY_DAYS, today.value),
        // 예상 기록(페이스 판정)은 온보딩처럼 쓰지 않는다 — 시트는 어느 탭에서든 열려 요약 탭 예측을 들고 있지 않다.
        projectedSec: null,
        restUntil: restUntil.value
      }
    : null
)
const options = computed(() => (input.value ? goalAdjustOptions(input.value) : null))
const distanceLabel = computed(() => raceDistanceLabel(goal.value?.distanceKm ?? null))
const afterRest = computed(() => (restUntil.value ? '휴식 뒤 ' : ''))

/** 다시 시작·미루기 추천 날짜 — 지금 날짜가 안전하면 그 날, 아니면 가장 이른 안전한 날. */
const recommendedDate = computed(() => {
  const o = options.value
  if (!o || !goal.value) return null
  if (o.feasibleNow && goal.value.targetDate && goal.value.targetDate > isoOf(today.value)) return { date: goal.value.targetDate, weeks: weeksFromStart(goal.value.targetDate) }
  return o.postpone
})

const situation = computed(() => {
  const km = currentWeeklyKm.value
  const load = km ? `요즘 주 약 ${Math.round(km)}km` : '요즘 기록이 적은 편'
  const body = injury.value ? `${load}에 ${injury.value.area} 부상을 관리하는 중이에요.` : restUntil.value ? `${load}에 쉬는 중이에요.` : `${load}예요.`
  if (resumeMode.value) return `${body} 지금 몸 상태로 안전하게 닿는 날을 골라 뒀어요.`
  if (options.value?.feasibleNow) return `${body} 지금 일정도 안전한 범위예요. 그래도 바꾸고 싶으면 골라요.`
  const from = restUntil.value ? `휴식이 끝나는 ${formatMonthDay(options.value!.startDate)}부터 세면, ` : ''
  return `${body} ${from}${formatMonthDay(goal.value!.targetDate!)} ${distanceLabel.value}까지 안전하게 늘릴 시간이 모자라요.`
})

type Row = { value: Choice; title: string; detail: string; recommended: boolean }
const rows = computed<Row[]>(() => {
  const o = options.value
  const g = goal.value
  if (!o || !g) return []
  const list: Row[] = []
  const rec = recommendedDate.value
  if (rec) {
    list.push({
      value: 'postpone',
      title: resumeMode.value ? '날짜 정해 다시 시작' : '날짜 미루기',
      detail: `${formatMonthDay(rec.date, true)} ${distanceLabel.value} · ${afterRest.value}${rec.weeks}주`,
      recommended: true
    })
  }
  if (o.shorter) {
    list.push({
      value: 'shorter',
      title: resumeMode.value ? '거리 낮춰 다시 시작' : '거리 낮추기',
      detail: `${formatMonthDay(o.shorter.date, true)} ${raceDistanceLabel(o.shorter.distanceKm)} · ${afterRest.value}${o.shorter.weeks}주`,
      recommended: !rec
    })
  }
  if (!resumeMode.value && !o.feasibleNow && g.targetDate) {
    list.push({
      value: 'finish',
      title: '날짜 그대로, 완주만',
      detail: `${formatMonthDay(g.targetDate)} ${distanceLabel.value} · ${g.targetDurationSec ? '기록 목표는 빼고 ' : ''}걷기를 섞어 완주해요`,
      recommended: false
    })
  }
  if (!resumeMode.value) {
    list.push({ value: 'letgo', title: '잠시 내려놓기', detail: '대회 목표는 보관하고 회복부터 챙겨요. 나으면 다시 정해요', recommended: list.length === 0 })
  }
  return list
})

// 시트를 열 때마다 처음 화면으로, 추천 항목을 미리 고른다.
watch(
  () => store.open,
  (open) => {
    document.body.classList.toggle('sheet-open', open)
    if (!open) return
    today.value = new Date()
    step.value = 'options'
    choice.value = rows.value.find((r) => r.recommended)?.value ?? rows.value[0]?.value ?? null
    pickedDate.value = recommendedDate.value?.date ?? null
    customDate.value = null
  }
)
onBeforeUnmount(() => document.body.classList.remove('sheet-open'))

const drag = useBottomSheetDrag(() => store.close())
const sheetEl = ref<HTMLElement | null>(null)
// 그리는 조건(open && goal)과 같은 값을 넘긴다 — open 만 넘기면 목표가 없을 때 시트 없이 배경만 잠긴다.
useSheetA11y(computed(() => store.open && Boolean(goal.value)), sheetEl, () => store.close())

// 미루기 화면 — 추천일·+1주·+2주·직접 고르기.
const dateChoices = computed(() => {
  const rec = recommendedDate.value
  if (!rec) return []
  return [0, 7, 14].map((offset) => {
    const date = addDaysIso(rec.date, offset)
    return { date, label: formatMonthDay(date, true), recommended: offset === 0 }
  })
})
const finalDate = computed(() => customDate.value ?? pickedDate.value)
const customTooSoon = computed(() => Boolean(customDate.value && input.value && !isGoalDateFeasible(input.value, customDate.value)))
const preview = computed(() => {
  const g = goal.value
  const date = finalDate.value
  if (!g || !date) return null
  const start = isoOf(goalAdjustStartDate(today.value, restUntil.value))
  const drafts = buildPeriodizedSchedule({
    goal: { ...g, targetDate: date },
    profile: memoryStore.memory.athleteProfile,
    today: today.value,
    currentWeeklyKm: currentWeeklyKm.value,
    entryLevel: beginnerWalkRunStage(levelStore.selfReportedMaxDistanceM, runStore.runs) !== null
  }).filter((d) => d.date >= start)
  if (!drafts.length) return null
  const first = drafts[0].date
  const firstWeek = drafts.filter((d) => d.date < addDaysIso(first, 7))
  const kms = firstWeek.map((d) => d.prescription.distanceKm ?? 0).filter((km) => km > 0)
  return {
    firstDate: first,
    weeks: weeksFromStart(date),
    count: firstWeek.length,
    kmRange: kms.length ? `${Math.min(...kms).toFixed(1)}~${Math.max(...kms).toFixed(1)}km` : null
  }
})

function next() {
  if (choice.value === 'postpone') step.value = 'postpone'
  else if (choice.value === 'letgo') step.value = 'letgo'
  else if (choice.value === 'shorter' && options.value?.shorter) {
    const s = options.value.shorter
    void apply(
      resumeMode.value ? { kind: 'resume', targetDate: s.date, distanceKm: s.distanceKm } : { kind: 'shorter', distanceKm: s.distanceKm, targetDate: s.date },
      `${raceDistanceLabel(s.distanceKm)} · ${formatMonthDay(s.date, true)}로 바꿨어요. 플랜도 새 목표에 맞춰 다시 짜요.`
    )
  } else if (choice.value === 'finish') {
    void apply({ kind: 'finish-only' }, '기록 목표를 빼고 완주를 목표로 해요. 이 일정으로는 다시 묻지 않을게요.')
  }
}

function confirmPostpone() {
  const date = finalDate.value
  if (!date) return
  void apply(
    resumeMode.value ? { kind: 'resume', targetDate: date } : { kind: 'postpone', targetDate: date },
    `${formatMonthDay(date, true)}로 ${resumeMode.value ? '다시 시작해요' : '미뤘어요'}. 플랜도 새 날짜에 맞춰 다시 짜요.`
  )
}

async function apply(change: GoalChange, message: string) {
  const g = goal.value
  if (!g || saving.value) return
  saving.value = true
  try {
    await memoryStore.update(applyGoalChange(memoryStore.memory, g.id, change, new Date().toISOString()))
    toastStore.success(message)
    store.close()
  } catch {
    toastStore.error('목표를 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.')
  } finally {
    saving.value = false
  }
}

function weeksFromStart(date: string): number {
  const start = goalAdjustStartDate(today.value, restUntil.value)
  return Math.floor((new Date(`${date}T12:00:00`).getTime() - start.getTime()) / (7 * 86_400_000))
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return isoOf(d)
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="bottom-sheet">
      <div v-if="store.open && goal" class="bottom-sheet-layer" role="presentation" @click.self="store.close()">
        <section
          ref="sheetEl"
          tabindex="-1"
          class="bottom-sheet goal-adjust-sheet"
          :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
          :style="drag.sheetStyle.value"
          role="dialog"
          aria-modal="true"
          aria-label="목표 다시 정하기"
        >
          <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
          <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
            <div class="goal-adjust-heading">
              <button v-if="step !== 'options'" class="stack-icon-button" type="button" aria-label="뒤로" @pointerdown.stop @click="step = 'options'">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <div class="goal-adjust-title">
                <h2>{{ step === 'postpone' ? (resumeMode ? '다시 시작할 날짜' : '날짜 미루기') : step === 'letgo' ? '잠시 내려놓기' : '목표 다시 정하기' }}</h2>
                <small v-if="step === 'options'">
                  {{ goal.title }}<template v-if="distanceLabel"> · {{ distanceLabel }}</template><template v-if="goal.targetDate"> · {{ formatMonthDay(goal.targetDate, true) }}</template><template v-if="goal.targetDurationSec"> · 목표 {{ formatDuration(goal.targetDurationSec) }}</template>
                </small>
              </div>
            </div>
            <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="store.close()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
            </button>
          </div>

          <div class="goal-adjust-content">
            <template v-if="step === 'options'">
              <p class="goal-adjust-lead">{{ situation }}</p>
              <div class="goal-adjust-options" role="radiogroup" aria-label="목표를 어떻게 할까요">
                <button
                  v-for="row in rows"
                  :key="row.value"
                  type="button"
                  role="radio"
                  class="goal-adjust-option"
                  :class="{ 'goal-adjust-option-on': choice === row.value }"
                  :aria-checked="choice === row.value"
                  @click="choice = row.value"
                >
                  <span class="goal-adjust-radio" aria-hidden="true" />
                  <span class="goal-adjust-option-body">
                    <span class="goal-adjust-option-title">
                      <strong>{{ row.title }}</strong>
                      <span v-if="row.recommended" class="goal-adjust-badge">추천</span>
                    </span>
                    <span class="goal-adjust-option-detail">{{ row.detail }}</span>
                  </span>
                </button>
              </div>
              <button class="goal-adjust-primary" type="button" :disabled="!choice || saving" @click="next">다음</button>
              <button
                v-if="!resumeMode && options && !options.feasibleNow"
                class="goal-adjust-text"
                type="button"
                :disabled="saving"
                @click="apply({ kind: 'keep' }, '지금 목표 그대로 가요. 이 일정으로는 다시 묻지 않을게요.')"
              >
                지금 목표 그대로 갈게요
              </button>
            </template>

            <template v-else-if="step === 'postpone'">
              <div class="goal-adjust-block">
                <span class="goal-adjust-label">{{ resumeMode ? '다시 시작할 대회 날짜' : '새 대회 날짜' }}</span>
                <div class="goal-adjust-dates" role="radiogroup" aria-label="대회 날짜">
                  <button
                    v-for="d in dateChoices"
                    :key="d.date"
                    type="button"
                    role="radio"
                    class="goal-adjust-date"
                    :class="{ 'goal-adjust-option-on': !customDate && pickedDate === d.date }"
                    :aria-checked="!customDate && pickedDate === d.date"
                    @click="pickedDate = d.date; customDate = null"
                  >
                    <strong>{{ d.label }}</strong>
                    <span v-if="d.recommended">추천 · 가장 이른 안전한 날</span>
                  </button>
                </div>
                <DateField v-model="customDate" label="직접 고르기" />
                <p v-if="customTooSoon" class="goal-adjust-warn">이 날짜는 빠듯해요. {{ dateChoices[0] ? `${dateChoices[0].label} 이후를 권해요.` : '' }}</p>
                <p v-else class="goal-adjust-note">나갈 대회가 정해져 있으면 그 날을 고르세요.</p>
              </div>
              <div v-if="finalDate" class="goal-adjust-changes">
                <strong>이렇게 바뀌어요</strong>
                <ul>
                  <li>목표: {{ distanceLabel }} · {{ formatMonthDay(finalDate, true) }}<template v-if="goal.targetDurationSec"> · 목표 기록 {{ formatDuration(goal.targetDurationSec) }}는 그대로</template></li>
                  <li v-if="preview">플랜을 지금 다시 짜요. {{ restUntil ? '휴식이 끝나고 ' : '' }}{{ formatMonthDay(preview.firstDate, true) }}부터 {{ preview.weeks }}주</li>
                  <li v-if="preview && preview.kmRange">첫 주는 {{ preview.count }}번, 한 번에 {{ preview.kmRange }}</li>
                  <li v-if="injury">통증이 오래가면 언제든 다시 미룰 수 있어요</li>
                </ul>
              </div>
              <button class="goal-adjust-primary" type="button" :disabled="!finalDate || saving" @click="confirmPostpone">
                {{ finalDate ? `${formatMonthDay(finalDate, true)}로 ${resumeMode ? '다시 시작하기' : '미루기'}` : '날짜를 골라 주세요' }}
              </button>
            </template>

            <template v-else>
              <p class="goal-adjust-lead">부상 회복이 먼저예요. 대회는 다 나은 뒤에 다시 정해도 늦지 않아요.</p>
              <div class="goal-adjust-changes">
                <strong>이렇게 바뀌어요</strong>
                <ul>
                  <li>'{{ goal.title }}' 목표는 지우지 않고 보관해요. 코치 탭에서 언제든 다시 꺼낼 수 있어요</li>
                  <li>플랜은 '회복 우선' 리듬으로 바뀌어요. {{ restUntil ? `휴식이 끝난 ${formatMonthDay(addDaysIso(restUntil, 1), true)}부터 ` : '' }}주 3회 정도 가볍게</li>
                  <li>D-day·기록 예측·훈련 단계 카드는 잠시 숨겨요</li>
                  <li>통증이 가라앉으면 코치가 다음 목표를 먼저 물어봐요</li>
                </ul>
              </div>
              <div class="goal-adjust-actions">
                <button class="goal-adjust-secondary" type="button" @click="step = 'options'">취소</button>
                <button class="goal-adjust-primary" type="button" :disabled="saving" @click="apply({ kind: 'let-go' }, '대회 목표를 잠시 내려놓았어요. 회복을 먼저 챙겨요.')">대회 목표 내려놓기</button>
              </div>
            </template>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.goal-adjust-sheet {
  max-height: min(90vh, 780px);
}

.goal-adjust-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.goal-adjust-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.goal-adjust-title small {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}

.goal-adjust-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-height: calc(min(90vh, 780px) - 96px);
  overflow-y: auto;
  overscroll-behavior: contain;
  word-break: keep-all;
}

.goal-adjust-lead {
  margin: 0;
  font-size: var(--text-info-size);
  line-height: var(--text-info-line);
  color: var(--color-text);
}

.goal-adjust-options {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-card);
  background: var(--color-surface-card);
  overflow: hidden;
}

.goal-adjust-option {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  min-height: 44px;
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-bottom: 1px solid var(--color-border-strong);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  text-shadow: none;
  color: var(--color-text);
  font: inherit;
  text-align: left;
}

.goal-adjust-option:last-child {
  border-bottom: 0;
}

.goal-adjust-option-on {
  background: var(--color-primary-soft);
}

.goal-adjust-radio {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 3px;
  border-radius: var(--radius-pill);
  border: 2px solid var(--color-muted-2);
  box-sizing: border-box;
}

.goal-adjust-option-on .goal-adjust-radio {
  border: 6px solid var(--color-primary);
}

.goal-adjust-option-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.goal-adjust-option-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.goal-adjust-option-title strong {
  font-size: var(--text-body-size);
  font-weight: var(--font-weight-bold);
}

.goal-adjust-badge {
  padding: 1px var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-micro-size);
  font-weight: var(--font-weight-bold);
}

.goal-adjust-option-detail {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-muted);
}

.goal-adjust-option-on .goal-adjust-option-detail {
  color: var(--color-text);
}

.goal-adjust-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.goal-adjust-label {
  font-size: var(--text-caption-size);
  font-weight: var(--font-weight-bold);
  color: var(--color-muted);
}

.goal-adjust-dates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.goal-adjust-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 56px;
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-field);
  background: var(--color-surface-card);
  box-shadow: none;
  text-shadow: none;
  color: var(--color-text);
  font: inherit;
}

.goal-adjust-date strong {
  font-size: var(--text-body-size);
  font-weight: var(--font-weight-bold);
}

.goal-adjust-date span {
  font-size: var(--text-micro-size);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary-text);
  text-align: center;
}

.goal-adjust-date.goal-adjust-option-on {
  outline: 1px solid var(--color-primary);
  outline-offset: -1px;
}

.goal-adjust-note,
.goal-adjust-warn {
  margin: 0;
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-muted);
}

.goal-adjust-warn {
  color: var(--color-warning-text);
}

.goal-adjust-changes {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-card);
  background: var(--color-surface-card);
}

.goal-adjust-changes strong {
  font-size: var(--text-caption-size);
  font-weight: var(--font-weight-bold);
}

.goal-adjust-changes ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-text);
}

.goal-adjust-actions {
  display: flex;
  gap: var(--space-2);
}

.goal-adjust-primary,
.goal-adjust-secondary {
  min-height: 52px;
  padding: 0 var(--space-5);
  border: 0;
  border-radius: var(--radius-button);
  box-shadow: none;
  text-shadow: none;
  font: inherit;
  font-size: var(--text-body-size);
  font-weight: var(--font-weight-heavy);
}

.goal-adjust-primary {
  flex-grow: 1;
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.goal-adjust-primary:disabled {
  opacity: 0.5;
}

.goal-adjust-secondary {
  background: var(--color-surface-card);
  color: var(--color-text);
}

.goal-adjust-text {
  align-self: center;
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 0;
  background: transparent;
  box-shadow: none;
  text-shadow: none;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--text-caption-size);
  font-weight: var(--font-weight-semibold);
}
</style>
