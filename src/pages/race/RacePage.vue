<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRunStore } from '@/app/stores/runStore'
import { useLiveRun } from '@/features/live-run/useLiveRun'
import { ghostCurveForTarget, listRaceTargets } from '@/features/live-run/raceTargets'
import type { AnnounceConfig, PeriodicAnnounceKind } from '@/features/live-run/liveRunBridge'
import type { LiveGapPayload, LiveTickPayload } from '@/features/live-run/liveRunBridge'

type Step = 'setup' | 'live' | 'summary'

const runStore = useRunStore()
const live = useLiveRun()

const step = ref<Step>('setup')

// ── 타겟 선택 ('없음' = null) ──────────────────────────────────────────────
const targets = computed(() => listRaceTargets(runStore.selectedUserRuns))
const selectedTargetId = ref<string | null>(null) // null = 없음

// ── 경쟁 보고 주기 설정 (#232 스펙) ────────────────────────────────────────
const periodicKind = ref<PeriodicAnnounceKind>('distance')
const stepM = ref<100 | 500 | 1000>(1000)
const stepSec = ref<number>(300)
const reversalAlert = ref(true)

// ── 라이브/요약 표시용 ────────────────────────────────────────────────────
const finalTick = ref<LiveTickPayload | null>(null)
const finalGap = ref<LiveGapPayload | null>(null)

onMounted(() => {
  if (!runStore.loaded) void runStore.load()
})

// 네이티브가 정지(완주)로 상태를 바꾸면 요약으로 전환
watch(
  () => live.state.value,
  (s) => {
    if (s === 'stopped' && step.value === 'live') {
      finalTick.value = live.tick.value
      finalGap.value = live.gap.value
      step.value = 'summary'
    }
  }
)

const hasGhost = computed(() => selectedTargetId.value != null)

function buildAnnounceConfig(): AnnounceConfig {
  if (periodicKind.value === 'distance') {
    return { periodic: { kind: 'distance', stepM: stepM.value }, reversalAlert: reversalAlert.value }
  }
  if (periodicKind.value === 'time') {
    return { periodic: { kind: 'time', stepSec: stepSec.value }, reversalAlert: reversalAlert.value }
  }
  return { periodic: { kind: 'silent' }, reversalAlert: reversalAlert.value }
}

function startRace() {
  const ghostCurve = selectedTargetId.value
    ? ghostCurveForTarget(runStore.selectedUserRuns, selectedTargetId.value) ?? undefined
    : undefined
  live.start({
    sessionId: `live-${Date.now()}`,
    mode: 'solo',
    ghostCurve,
    announceConfig: buildAnnounceConfig()
  })
  step.value = 'live'
}

function endRace() {
  finalTick.value = live.tick.value
  finalGap.value = live.gap.value
  live.stop()
  step.value = 'summary'
}

function resetRace() {
  finalTick.value = null
  finalGap.value = null
  selectedTargetId.value = null
  step.value = 'setup'
}

// ── 포맷 ──────────────────────────────────────────────────────────────────
function fmtTime(sec: number | null | undefined): string {
  const s = Math.max(0, Math.round(sec ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function fmtKm(m: number | null | undefined): string {
  return ((m ?? 0) / 1000).toFixed(2)
}
function fmtPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const s = Math.round(secPerKm)
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"/km`
}
function gapText(gap: LiveGapPayload | null): string {
  if (!gap) return '고스트 없음'
  const amount = `${Math.abs(Math.round(gap.timeGapSec))}초`
  if (gap.leadState === 'ahead') return `고스트보다 ${amount} 앞`
  if (gap.leadState === 'behind') return `고스트보다 ${amount} 뒤`
  return '고스트와 나란히'
}

const elapsedText = computed(() => fmtTime(live.tick.value?.elapsedSec))
const distanceText = computed(() => fmtKm(live.tick.value?.cumulativeDistanceM))
const paceText = computed(() => fmtPace(live.tick.value?.instantPaceSec))

const summaryResult = computed(() => {
  if (!finalGap.value) return null
  if (finalGap.value.leadState === 'ahead') return { emoji: '🎉', label: '고스트 제침' }
  if (finalGap.value.leadState === 'behind') return { emoji: '😤', label: '아쉽게 뒤짐' }
  return { emoji: '🤝', label: '거의 동시' }
})
</script>

<template>
  <main class="race-page">
    <header class="race-head">
      <h1>나와의 대결</h1>
      <p class="sub">혼자하기 · 화면 잠가도 음성으로 안내</p>
    </header>

    <!-- 브리지 없음(웹) 폴백 -->
    <section v-if="!live.available" class="race-card race-unavailable">
      <p>가상레이싱은 <strong>iOS 앱</strong>에서만 가능합니다.</p>
      <p class="helper">앱에서 화면을 잠그고 달리면 음성으로 경쟁 상황을 안내합니다.</p>
    </section>

    <!-- ① 타겟 선택 + 설정 -->
    <template v-else-if="step === 'setup'">
      <section class="race-card">
        <h2>타겟</h2>
        <label class="race-radio" :class="{ active: selectedTargetId === null }">
          <input type="radio" :value="null" :checked="selectedTargetId === null" @change="selectedTargetId = null" />
          <span class="radio-main">없음 — 자유 레이싱</span>
          <span class="radio-sub">고스트 없이 측정만. 이번 기록이 다음 타겟이 됩니다.</span>
        </label>

        <label v-for="t in targets" :key="t.runId" class="race-radio" :class="{ active: selectedTargetId === t.runId }">
          <input type="radio" :value="t.runId" :checked="selectedTargetId === t.runId" @change="selectedTargetId = t.runId" />
          <span class="radio-main">
            {{ t.distanceKm.toFixed(2) }}km · {{ fmtTime(t.durationSec) }}
            <span v-if="t.isPb" class="pb-badge">최고</span>
          </span>
          <span class="radio-sub">{{ fmtPace(t.avgPaceSec) }} · {{ t.date }}</span>
        </label>

        <p v-if="targets.length === 0" class="helper">
          아직 레이싱 세션이 없어요. 먼저 '없음'으로 한 번 달리면 다음부터 그 기록과 대결할 수 있어요.
        </p>
      </section>

      <section class="race-card">
        <h2>경쟁 보고 주기</h2>
        <div class="seg">
          <button type="button" :class="{ active: periodicKind === 'distance' }" @click="periodicKind = 'distance'">거리</button>
          <button type="button" :class="{ active: periodicKind === 'time' }" @click="periodicKind = 'time'">시간</button>
          <button type="button" :class="{ active: periodicKind === 'silent' }" @click="periodicKind = 'silent'">조용히</button>
        </div>

        <div v-if="periodicKind === 'distance'" class="seg">
          <button type="button" :class="{ active: stepM === 100 }" @click="stepM = 100">100m</button>
          <button type="button" :class="{ active: stepM === 500 }" @click="stepM = 500">500m</button>
          <button type="button" :class="{ active: stepM === 1000 }" @click="stepM = 1000">1km</button>
        </div>
        <div v-else-if="periodicKind === 'time'" class="seg">
          <button type="button" :class="{ active: stepSec === 60 }" @click="stepSec = 60">1분</button>
          <button type="button" :class="{ active: stepSec === 180 }" @click="stepSec = 180">3분</button>
          <button type="button" :class="{ active: stepSec === 300 }" @click="stepSec = 300">5분</button>
        </div>

        <label class="race-toggle">
          <span>역전 알림 (추월/추월당함)</span>
          <input type="checkbox" v-model="reversalAlert" />
        </label>
      </section>

      <button class="race-cta" type="button" @click="startRace">레이싱 시작</button>
    </template>

    <!-- ② 라이브 -->
    <template v-else-if="step === 'live'">
      <section class="race-card race-live">
        <div class="live-time">{{ elapsedText }}</div>
        <div class="live-distance">{{ distanceText }} km</div>
        <div v-if="hasGhost" class="live-gap" :class="live.gap.value?.leadState ?? 'even'">
          {{ gapText(live.gap.value) }}
        </div>
        <div class="live-meta">
          페이스 {{ paceText }}
          · 신호 {{ live.tick.value?.signalState ?? '-' }}
          · {{ live.tick.value?.source ?? '-' }}
        </div>
        <p v-if="live.permission.value === 'whenInUse'" class="helper warn">
          위치를 "항상 허용"으로 바꿔야 화면을 잠가도 측정됩니다.
        </p>
        <p v-if="live.error.value" class="helper warn">오류 {{ live.error.value.code }}: {{ live.error.value.message }}</p>
      </section>

      <div class="race-actions">
        <button v-if="live.state.value === 'paused'" class="race-cta ghost" type="button" @click="live.resume()">재개</button>
        <button v-else class="race-cta ghost" type="button" @click="live.pause()">일시정지</button>
        <button class="race-cta danger" type="button" @click="endRace">종료</button>
      </div>
    </template>

    <!-- ③ 종료 요약 -->
    <template v-else>
      <section class="race-card race-summary">
        <h2 v-if="summaryResult">{{ summaryResult.emoji }} {{ summaryResult.label }}</h2>
        <h2 v-else>레이싱 완료</h2>
        <div class="summary-grid">
          <div><span>거리</span><strong>{{ fmtKm(finalTick?.cumulativeDistanceM) }} km</strong></div>
          <div><span>시간</span><strong>{{ fmtTime(finalTick?.elapsedSec) }}</strong></div>
          <div v-if="finalGap"><span>고스트 시간차</span><strong>{{ gapText(finalGap) }}</strong></div>
        </div>
      </section>
      <button class="race-cta" type="button" @click="resetRace">새 레이싱</button>
    </template>
  </main>
</template>

<style scoped>
.race-page { max-width: 520px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.race-head h1 { font-size: 1.4rem; margin: 0; }
.race-head .sub { color: var(--text-secondary, #888); font-size: 0.85rem; margin: 2px 0 0; }
.race-card { background: var(--surface, #fff); border-radius: 16px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); display: flex; flex-direction: column; gap: 10px; }
.race-card h2 { font-size: 1rem; margin: 0 0 4px; }
.race-radio { display: grid; grid-template-columns: 1fr; gap: 2px; padding: 12px; border: 1.5px solid var(--border, #e4e4e7); border-radius: 12px; cursor: pointer; }
.race-radio.active { border-color: var(--accent, #6d28d9); background: color-mix(in srgb, var(--accent, #6d28d9) 8%, transparent); }
.race-radio input { display: none; }
.radio-main { font-weight: 600; }
.radio-sub { font-size: 0.8rem; color: var(--text-secondary, #888); }
.pb-badge { font-size: 0.7rem; background: var(--accent, #6d28d9); color: #fff; border-radius: 6px; padding: 1px 6px; margin-left: 6px; }
.helper { font-size: 0.82rem; color: var(--text-secondary, #888); margin: 0; }
.helper.warn { color: #d97706; }
.seg { display: flex; gap: 8px; }
.seg button { flex: 1; padding: 9px 0; border: 1.5px solid var(--border, #e4e4e7); border-radius: 10px; background: transparent; font-size: 0.9rem; cursor: pointer; }
.seg button.active { border-color: var(--accent, #6d28d9); background: var(--accent, #6d28d9); color: #fff; }
.race-toggle { display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; padding-top: 4px; }
.race-cta { padding: 14px; border: none; border-radius: 14px; background: var(--accent, #6d28d9); color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
.race-cta.ghost { background: var(--surface-2, #f1f1f4); color: var(--text, #18181b); }
.race-cta.danger { background: #dc2626; }
.race-actions { display: flex; gap: 10px; }
.race-actions .race-cta { flex: 1; }
.race-live { align-items: center; text-align: center; gap: 6px; }
.live-time { font-size: 2.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.live-distance { font-size: 1.2rem; color: var(--text-secondary, #888); }
.live-gap { font-size: 1.3rem; font-weight: 700; padding: 8px 0; }
.live-gap.ahead { color: #16a34a; }
.live-gap.behind { color: #dc2626; }
.live-gap.even { color: var(--text-secondary, #888); }
.live-meta { font-size: 0.85rem; color: var(--text-secondary, #888); }
.race-summary { align-items: center; text-align: center; }
.summary-grid { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.summary-grid div { display: flex; justify-content: space-between; border-top: 1px solid var(--border, #eee); padding-top: 8px; }
.summary-grid span { color: var(--text-secondary, #888); }
.race-unavailable { text-align: center; }
</style>
