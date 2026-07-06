<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRunStore } from '@/app/stores/runStore'
import { useCompetitionStore } from '@/app/stores/competitionStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useWatchRaceStore } from '@/app/stores/watchRaceStore'
import { useLiveRun } from '@/features/live-run/useLiveRun'
import { ghostCurveForRun, listDistanceOptions, listOpponents, type OpponentOption } from '@/features/live-run/raceTargets'
import type { CompetitionTargetPb } from '@/entities/competition/model'
import { distanceAtTime, formatGapAmount, type GapDisplayMode, type GhostCurvePoint } from '@/shared/lib/selfRace/ghost'
import type { AnnounceConfig, PeriodicAnnounceKind } from '@/features/live-run/liveRunBridge'
import type { LiveGapPayload, LiveTickPayload } from '@/features/live-run/liveRunBridge'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import ListRow from '@/shared/ui/ListRow.vue'
import StackPage from '@/shared/ui/StackPage.vue'
import { formatTime } from '@/shared/lib/format'
import { evaluateDoubleGap, type DoubleGapStatus } from '@/shared/lib/coaching/doubleSession'

type Step = 'setup' | 'live' | 'summary'
type RaceMode = 'solo' | 'crew'
type RaceSettings = {
  distanceM: number | null
  opponentRunId: string | null
  periodicKind: PeriodicAnnounceKind
  stepM: 100 | 500 | 1000
  stepSec: number
  reversalAlert: boolean
  gapMode: GapDisplayMode
  distanceLabel: string
  opponentLabel: string
  voiceLabel: string
}

const emit = defineEmits<{ close: [] }>()

const LS_KEY = 'race_last_settings_v1'

const runStore = useRunStore()
const competitionStore = useCompetitionStore()
const healthKitSync = useHealthKitSyncStore()
const watchRaceStore = useWatchRaceStore()
const live = useLiveRun()
const route = useRoute()

const previewMode = computed(() => import.meta.env.DEV && route.query.preview !== '0')

const step = ref<Step>('setup')
const raceMode = ref<RaceMode>('solo')
const settingsOpen = ref(false)
const lastSettings = ref<RaceSettings | null>(null)
// 라이브 진입 후 명시적 시작 전까지 started=false(대기). 시작 시 3·2·1 카운트다운.
const started = ref(false)
const countdown = ref<number | null>(null)
let countdownTimer: ReturnType<typeof setTimeout> | null = null
// 같은 날 둘째 세션 minGap 강한 확인(#462) — 직전 런이 5h 이내 종료면 회복 권고 후 '그래도 시작' 오버라이드 허용.
const gapConfirm = ref<DoubleGapStatus | null>(null)
let gapOverridden = false

const distances = computed(() => listDistanceOptions(runStore.selectedUserRuns))
const selectedDistanceM = ref<number | null>(null)
const opponents = computed(() => listOpponents(runStore.selectedUserRuns, selectedDistanceM.value))
const selectedOpponentRunId = ref<string | null>(null)
const hasGhost = computed(() => selectedOpponentRunId.value != null)

const periodicKind = ref<PeriodicAnnounceKind>('distance')
const stepM = ref<100 | 500 | 1000>(1000)
const stepSec = ref<number>(300)
const reversalAlert = ref(true)
const gapMode = ref<GapDisplayMode>('distance')

const finalTick = ref<LiveTickPayload | null>(null)
const finalGap = ref<LiveGapPayload | null>(null)

// 라이브 진행 막대용 — 시작 시점 목표거리·고스트 곡선 캡처
const activeTargetM = ref(0)
const activeGhostCurve = ref<GhostCurvePoint[] | null>(null)
// 결과 분류용(#233) — 시작 시점 타겟 PB(없음이면 null)·측정 시작 시각, 중복 기록 방지 플래그
const activeTargetPb = ref<CompetitionTargetPb | null>(null)
const racedAtStart = ref('')
const resultRecorded = ref(false)

onMounted(() => {
  if (!runStore.loaded) void runStore.load()
  loadSavedSettings()
})

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const s = JSON.parse(raw) as RaceSettings
    lastSettings.value = s
    selectedDistanceM.value = s.distanceM
    selectedOpponentRunId.value = s.opponentRunId
    periodicKind.value = s.periodicKind
    stepM.value = s.stepM
    stepSec.value = s.stepSec
    reversalAlert.value = s.reversalAlert
    gapMode.value = s.gapMode ?? 'distance'
  } catch {
    // 저장값 손상 시 무시
  }
}

watch(
  distances,
  (list) => {
    if (selectedDistanceM.value == null && list.length) selectedDistanceM.value = list[0].distanceM
  },
  { immediate: true }
)

function selectDistance(distanceM: number) {
  selectedDistanceM.value = distanceM
  selectedOpponentRunId.value = null
}

watch(
  () => live.state.value,
  (s) => {
    if (s === 'stopped' && step.value === 'live') {
      finalTick.value = live.tick.value
      finalGap.value = live.gap.value
      recordRaceResult()
      step.value = 'summary'
    }
  }
)

// #235: 네이티브가 레이싱 결과를 HealthKit에 저장 완료하면(externalId 통보), 단건 동기화를
// 트리거해 RunLog 유입·중복차단·결과연결(linkPendingResults)을 즉시 마무리한다.
// 결과 요약 자체는 위 recordRaceResult(PendingSelfRace)로 이미 표시되므로 sync는 비치명적 후처리.
watch(
  () => live.workoutSaved.value,
  (saved) => {
    if (saved) void healthKitSync.importCompetitionRun(saved)
  }
)

function buildAnnounceConfig(): AnnounceConfig {
  const gap = gapMode.value
  if (periodicKind.value === 'distance') return { periodic: { kind: 'distance', stepM: stepM.value }, reversalAlert: reversalAlert.value, gapMode: gap }
  if (periodicKind.value === 'time') return { periodic: { kind: 'time', stepSec: stepSec.value }, reversalAlert: reversalAlert.value, gapMode: gap }
  return { periodic: { kind: 'silent' }, reversalAlert: reversalAlert.value, gapMode: gap }
}

function voiceLabel(): string {
  const gapLabel = gapMode.value === 'time' ? '시간차' : '거리차'
  const reversal = hasGhost.value && reversalAlert.value
  if (periodicKind.value === 'silent') return reversal ? `역전만 · ${gapLabel}` : `조용히 · ${gapLabel}`
  const base = periodicKind.value === 'distance'
    ? (stepM.value >= 1000 ? `${stepM.value / 1000}km` : `${stepM.value}m`)
    : `${Math.round(stepSec.value / 60)}분`
  const cadence = reversal ? `${base}, 역전 마다` : `${base}마다`
  return `${cadence} · ${gapLabel}`
}

function openSettings() {
  settingsOpen.value = true
}

function saveSettings() {
  const opp = opponents.value.find((o) => o.runId === selectedOpponentRunId.value) ?? opponents.value[0]
  lastSettings.value = {
    distanceM: selectedDistanceM.value,
    opponentRunId: selectedOpponentRunId.value,
    periodicKind: periodicKind.value,
    stepM: stepM.value,
    stepSec: stepSec.value,
    reversalAlert: reversalAlert.value,
    gapMode: gapMode.value,
    distanceLabel: selectedDistanceM.value ? `${selectedDistanceM.value / 1000}km` : '자유',
    opponentLabel: opponentLabel(opp),
    voiceLabel: voiceLabel()
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(lastSettings.value))
  } catch {
    // 저장 실패는 치명적 아님
  }
  // 워치 카탈로그는 lastSelection·announceConfig 로 이 설정을 미러한다(#552).
  // runs 변경 감시(App.vue)만으론 설정 단독 변경이 워치에 안 가므로 저장 직후 즉시 push.
  watchRaceStore.pushCatalog()
  settingsOpen.value = false
}

// '레이싱 입장' — 라이브 화면으로 이동하되 아직 트래킹은 시작하지 않는다(대기 상태).
// '레이싱 입장' — GPS를 켜고(준비) 신호 확보를 기다린다. 클럭/측정은 시작(begin) 때.
function enterRace() {
  const ghostCurve = selectedOpponentRunId.value
    ? ghostCurveForRun(runStore.selectedUserRuns, selectedOpponentRunId.value) ?? undefined
    : undefined
  activeTargetM.value = selectedDistanceM.value ?? 0
  activeGhostCurve.value = ghostCurve ?? null
  activeTargetPb.value = captureTargetPb()
  racedAtStart.value = ''
  resultRecorded.value = false
  started.value = false
  countdown.value = null
  gapConfirm.value = null
  gapOverridden = false
  if (live.available) {
    live.start({
      sessionId: `live-${Date.now()}`,
      mode: 'solo',
      ghostCurve,
      announceConfig: buildAnnounceConfig(),
      targetDistanceM: selectedDistanceM.value // 거리 도달 시 네이티브 자동 완주
    })
  }
  step.value = 'live'
}

// GPS 확보 후 사용 가능. ['ok','weak'] 신호 틱이 오면 준비 완료. 브리지 없으면(미리보기) 허용.
const gpsReady = computed(() => !live.available || ['ok', 'weak'].includes(live.tick.value?.signalState ?? ''))

// 직전(가장 최근 종료) 런 기준 같은 날 둘째 세션 간격을 평가한다. 5h 창이 곧 '같은 날 둘째'를
// 의미하므로 종료 후 5h가 지났으면 verdict='ok' 라 확인이 뜨지 않는다(날짜키/타임존 매칭 불필요).
function evaluateSecondRunGap(): DoubleGapStatus {
  const lastEndAt = runStore.sortedRuns.find((r) => r.endAt)?.endAt ?? null
  return evaluateDoubleGap({ amEndAt: lastEndAt })
}

// 명시적 '시작' → 3·2·1 카운트다운 후 실제 측정 시작(begin).
function beginCountdown() {
  if (countdown.value !== null || started.value || !gpsReady.value) return
  // 같은 날 둘째 세션 회복 간격(minGap) 강한 확인 — 물리 차단이 아니라 회복 권고 + '그래도 시작'
  // 오버라이드(코치 SSOT §같은 날 2세션: minGap은 안내, 성인 런 물리 차단 금지).
  if (!gapOverridden) {
    const gap = evaluateSecondRunGap()
    if (gap.verdict === 'blocked') {
      gapConfirm.value = gap
      return
    }
  }
  countdown.value = 3
  const tick = () => {
    if (countdown.value === null) return
    if (countdown.value > 1) {
      countdown.value -= 1
      countdownTimer = setTimeout(tick, 1000)
    } else {
      countdown.value = null
      startTracking()
    }
  }
  countdownTimer = setTimeout(tick, 1000)
}

function startTracking() {
  started.value = true
  racedAtStart.value = new Date().toISOString() // 결과↔RunLog 근접 매칭의 1차 키(#233)
  if (live.available) live.begin() // 준비된 GPS 세션에서 클럭·측정 시작
}

// minGap 확인에서 '그래도 시작' — 오버라이드 후 카운트다운 재진입(코치 톤: 막지 않고 존중).
function proceedDespiteGap() {
  gapConfirm.value = null
  gapOverridden = true
  beginCountdown()
}

function dismissGapConfirm() {
  gapConfirm.value = null
}

// 시작 시점 선택된 상대를 타겟 PB 로 캡처. '없음'(자유 TT)이면 null → 태깅만, 결과 미생성.
function captureTargetPb(): CompetitionTargetPb | null {
  const opp = opponents.value.find((o) => o.runId === selectedOpponentRunId.value)
  if (!opp || opp.kind !== 'best' || !opp.runId || opp.distanceM == null || opp.elapsedSec == null) return null
  return { distanceM: opp.distanceM, elapsedSec: opp.elapsedSec, sourceRunId: opp.runId }
}

// 라이브 종료 결과를 경쟁 도메인에 보관(#233). 다음 HealthKit 동기화 때 RunLog 와 매칭·태깅된다.
// 정본 RunLog 의 type·부하·추세는 건드리지 않는다(§10). 중복 기록은 resultRecorded 로 1회만.
function recordRaceResult() {
  if (resultRecorded.value) return
  const tick = finalTick.value
  if (!tick) return
  const gap = finalGap.value
  competitionStore.recordFinish({
    racedAt: racedAtStart.value || new Date().toISOString(),
    racedDistanceM: tick.cumulativeDistanceM ?? 0,
    racedDurationSec: tick.elapsedSec ?? null,
    targetPb: activeTargetPb.value,
    finalGap: gap ? { timeGapSec: gap.timeGapSec, leadState: gap.leadState } : null
  })
  resultRecorded.value = true
}

function clearCountdown() {
  if (countdownTimer) {
    clearTimeout(countdownTimer)
    countdownTimer = null
  }
  countdown.value = null
}

function endRace() {
  finalTick.value = live.tick.value
  finalGap.value = live.gap.value
  recordRaceResult()
  clearCountdown()
  live.stop()
  step.value = 'summary'
}

function resetRace() {
  finalTick.value = null
  finalGap.value = null
  activeTargetPb.value = null
  racedAtStart.value = ''
  resultRecorded.value = false
  started.value = false
  gapConfirm.value = null
  gapOverridden = false
  clearCountdown()
  step.value = 'setup'
}

onUnmounted(() => {
  clearCountdown()
  live.stop() // 스택 닫힘/언마운트 시 GPS 세션 정리(대기/진행 중이던 경우)
})

function opponentLabel(o: OpponentOption): string {
  if (o.kind === 'none') return '없음 — 한계 시험(TT)'
  const km = o.distanceM ? o.distanceM / 1000 : 0
  return `내 ${km}km 베스트 · ${fmtTime(o.elapsedSec)}`
}

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
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`
}
// 화면 격차 표기. 단위(거리/시간)는 gapMode를 따르고, 앞/뒤/나란히 판정은 네이티브 leadState로
// 통일한다(음성과 동일 기준). 양(量)은 음성과 같은 formatGapAmount로 포맷해 표현을 일치시킨다.
function gapLabel(distanceGapM: number | null, timeGapSec: number, leadState: LiveGapPayload['leadState'], mode: GapDisplayMode): string {
  if (leadState === 'even') return '고스트와 나란히'
  const amount = formatGapAmount({ distanceGapM: distanceGapM ?? 0, timeGapSec, leadState }, mode)
  return leadState === 'ahead' ? `고스트보다 ${amount} 앞` : `고스트보다 ${amount} 뒤`
}

const elapsedText = computed(() => fmtTime(live.tick.value?.elapsedSec))
const distanceText = computed(() => fmtKm(live.tick.value?.cumulativeDistanceM))
const paceText = computed(() => fmtPace(live.tick.value?.instantPaceSec))

// 실시간 진행 막대(0~목표거리). 내 위치 + 고스트 위치.
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
const myProgress = computed(() => (activeTargetM.value > 0 ? clamp01((live.tick.value?.cumulativeDistanceM ?? 0) / activeTargetM.value) : 0))
const ghostProgress = computed(() => {
  if (!activeGhostCurve.value || activeTargetM.value <= 0) return null
  const gd = distanceAtTime({ source: 'even', points: activeGhostCurve.value }, live.tick.value?.elapsedSec ?? 0)
  return clamp01(gd / activeTargetM.value)
})
const myPct = computed(() => `${(myProgress.value * 100).toFixed(1)}%`)
const ghostPct = computed(() => (ghostProgress.value == null ? null : `${(ghostProgress.value * 100).toFixed(1)}%`))

// 실시간 거리 격차: 내 누적거리 − 같은 시각 고스트 거리(m). 양수=내가 앞. (거리 모드 표시용)
const distanceGapM = computed(() => {
  if (!activeGhostCurve.value) return null
  const ghostDist = distanceAtTime({ source: 'even', points: activeGhostCurve.value }, live.tick.value?.elapsedSec ?? 0)
  return (live.tick.value?.cumulativeDistanceM ?? 0) - ghostDist
})
const liveLead = computed<'ahead' | 'behind' | 'even'>(() => live.gap.value?.leadState ?? 'even')
const liveGapText = computed(() => {
  if (!hasGhost.value) return '고스트 없음'
  const g = live.gap.value
  if (!g) return '고스트와 나란히'
  return gapLabel(distanceGapM.value, g.timeGapSec, g.leadState, gapMode.value)
})
// 종료 요약: 최종 거리 격차(거리 모드 표시용). 시간 격차는 finalGap에 들어 있다.
const finalDistanceGapM = computed(() => {
  if (!activeGhostCurve.value || !finalTick.value) return null
  const ghostDist = distanceAtTime({ source: 'even', points: activeGhostCurve.value }, finalTick.value.elapsedSec ?? 0)
  return (finalTick.value.cumulativeDistanceM ?? 0) - ghostDist
})
const summaryGapLabel = computed(() => (gapMode.value === 'time' ? '고스트 시간차' : '고스트 거리차'))
const summaryGapText = computed(() =>
  finalGap.value ? gapLabel(finalDistanceGapM.value, finalGap.value.timeGapSec, finalGap.value.leadState, gapMode.value) : ''
)
const targetKmLabel = computed(() => `${(activeTargetM.value / 1000).toFixed(activeTargetM.value % 1000 === 0 ? 0 : 1)}km`)
const summaryResult = computed(() => {
  if (!finalGap.value) return null
  if (finalGap.value.leadState === 'ahead') return { emoji: '🎉', label: '고스트 제침' }
  if (finalGap.value.leadState === 'behind') return { emoji: '😤', label: '아쉽게 뒤짐' }
  return { emoji: '🤝', label: '거의 동시' }
})

const showStartCta = computed(() => step.value === 'setup' && raceMode.value === 'solo' && !!lastSettings.value)
</script>

<template>
  <section class="memory-stack-page">
    <header class="memory-stack-header">
      <div><h2>한계 도전</h2></div>
      <button class="stack-icon-button" type="button" aria-label="닫기" @click="emit('close')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
      </button>
    </header>

    <main class="memory-stack-content">
      <!-- 브리지 없음(웹) 폴백 -->
      <SectionGroup v-if="!live.available && !previewMode" title="안내">
        <p class="race-text">한계 도전은 <strong>iOS 앱</strong>에서만 가능합니다.</p>
        <p class="race-muted">앱에서 화면을 잠그고 달리면 음성으로 고스트와의 격차를 안내합니다.</p>
      </SectionGroup>

      <!-- ① 설정 (다자간 보류 — 한계 도전 단일 흐름, #411) -->
      <template v-else-if="step === 'setup'">
        <template v-if="lastSettings">
          <SectionGroup title="한계 도전 설정">
            <div class="race-setting-list">
              <ListRow title="거리" clickable @click="openSettings">
                <template #addon><span class="row-value">{{ lastSettings.distanceLabel }}</span><svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg></template>
              </ListRow>
              <ListRow title="상대" clickable @click="openSettings">
                <template #addon><span class="row-value">{{ lastSettings.opponentLabel }}</span><svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg></template>
              </ListRow>
              <ListRow title="음성 안내" clickable @click="openSettings">
                <template #addon><span class="row-value">{{ lastSettings.voiceLabel }}</span><svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg></template>
              </ListRow>
            </div>
          </SectionGroup>
        </template>

        <SectionGroup v-else title="한계 도전">
          <p class="race-muted">과거의 나(고스트)와 겨뤄 한계를 갱신하거나, 상대 없이 한계 시험(TT)으로 현재 체력을 측정해요. 거리·상대·음성 안내를 먼저 설정합니다.</p>
          <button class="race-cta inline" type="button" @click="openSettings">설정하러 가기</button>
        </SectionGroup>
      </template>

      <!-- ② 라이브 -->
      <template v-else-if="step === 'live'">
        <SectionGroup title="라이브">
          <div class="race-live">
            <template v-if="started">
              <div class="live-time">{{ elapsedText }}</div>
              <div v-if="activeTargetM > 0" class="race-track">
                <div class="track-lane">
                  <span class="lane-label">나</span>
                  <div class="track-rail">
                    <div class="track-fill me" :style="{ width: myPct }" />
                    <div class="track-dot me" :style="{ left: myPct }" />
                  </div>
                </div>
                <div v-if="ghostPct" class="track-lane">
                  <span class="lane-label">고스트</span>
                  <div class="track-rail">
                    <div class="track-fill ghost" :style="{ width: ghostPct }" />
                    <div class="track-dot ghost" :style="{ left: ghostPct }" />
                  </div>
                </div>
                <div class="track-labels"><span>출발</span><span>{{ targetKmLabel }}</span></div>
              </div>
              <div v-if="hasGhost" class="live-gap" :class="liveLead">{{ liveGapText }}</div>
              <div class="live-stats">
                <div class="live-stat"><strong>{{ distanceText }}</strong><span>km</span></div>
                <div class="live-stat"><strong>{{ paceText }}</strong><span>페이스</span></div>
              </div>
              <div class="live-meta">신호 {{ live.tick.value?.signalState ?? '-' }} · {{ live.tick.value?.source ?? '-' }} · #{{ live.tick.value?.seq ?? 0 }}</div>
            </template>
            <template v-else>
              <p class="race-ready">{{ gpsReady ? '출발 준비 완료' : 'GPS 신호 확보 중…' }}</p>
              <p class="race-ready-sub">
                <template v-if="gpsReady">아래 <strong>시작</strong>을 누르면 3·2·1 카운트다운 후 측정이 시작됩니다.</template>
                <template v-else>위치 신호가 잡히면 시작 버튼이 켜집니다. (신호 {{ live.tick.value?.signalState ?? '대기' }})</template>
              </p>
              <p v-if="live.diagnostic.value" class="race-diag">진단 {{ live.diagnostic.value }}</p>
            </template>
          </div>
          <p v-if="started && live.error.value" class="race-warn">오류 {{ live.error.value.code }}: {{ live.error.value.message }}</p>
          <p v-if="started && live.diagnostic.value" class="race-diag">진단 {{ live.diagnostic.value }}</p>
        </SectionGroup>
      </template>

      <!-- ③ 요약 -->
      <template v-else>
        <SectionGroup title="결과">
          <div class="race-live">
            <div class="summary-title">
              <template v-if="summaryResult">{{ summaryResult.emoji }} {{ summaryResult.label }}</template>
              <template v-else>레이싱 완료</template>
            </div>
          </div>
          <div class="summary-grid">
            <div><span>거리</span><strong>{{ fmtKm(finalTick?.cumulativeDistanceM) }} km</strong></div>
            <div><span>시간</span><strong>{{ fmtTime(finalTick?.elapsedSec) }}</strong></div>
            <div v-if="finalGap"><span>{{ summaryGapLabel }}</span><strong>{{ summaryGapText }}</strong></div>
          </div>
        </SectionGroup>
      </template>
    </main>

    <!-- 컨텍스트 푸터 (스택 3행 그리드의 footer 슬롯) -->
    <footer v-if="showStartCta" class="stack-footer">
      <button class="race-cta" type="button" @click="enterRace">레이싱 입장</button>
    </footer>
    <footer v-else-if="step === 'live' && !started && countdown === null" class="stack-footer">
      <button class="race-cta" type="button" :disabled="!gpsReady" @click="beginCountdown">{{ gpsReady ? '시작' : 'GPS 확보 중…' }}</button>
    </footer>
    <footer v-else-if="step === 'live' && started" class="stack-footer race-live-footer">
      <button v-if="live.state.value === 'paused'" class="race-btn secondary" type="button" @click="live.resume()">재개</button>
      <button v-else class="race-btn secondary" type="button" @click="live.pause()">일시정지</button>
      <button class="race-btn danger" type="button" @click="endRace">종료</button>
    </footer>
    <footer v-else-if="step === 'summary'" class="stack-footer">
      <button class="race-cta" type="button" @click="resetRace">새 레이싱</button>
    </footer>

    <!-- 시작 카운트다운 오버레이 (3·2·1, 서클 애니메이션) -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="countdown !== null" class="race-countdown">
          <div :key="countdown" class="countdown-ring"><span class="countdown-num">{{ countdown }}</span></div>
        </div>
      </Transition>
    </Teleport>

    <!-- 같은 날 둘째 세션 minGap 강한 확인(#462) — 물리 차단이 아니라 회복 권고 + '그래도 시작' 오버라이드 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="gapConfirm" class="race-gap-confirm" role="dialog" aria-modal="true" aria-labelledby="gap-confirm-title">
          <div class="gap-confirm-card">
            <h3 id="gap-confirm-title" class="gap-confirm-title">회복할 시간이에요</h3>
            <p class="gap-confirm-body">
              마지막 런이 끝난 지 얼마 안 됐어요. 회복과 재충전을 위해 보통 <strong>5시간 이상</strong> 쉬는 걸 권해요.<template v-if="gapConfirm.optimalStartAt"> 가장 좋은 건 <strong>{{ formatTime(gapConfirm.optimalStartAt) }}</strong> 이후예요.</template>
              그래도 지금 시작할까요?
            </p>
            <div class="gap-confirm-actions">
              <button type="button" class="race-btn secondary" @click="dismissGapConfirm">조금 더 쉬기</button>
              <button type="button" class="race-btn danger" @click="proceedDespiteGap">그래도 시작</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 2차 스택: 레이싱 설정 -->
    <StackPage :open="settingsOpen" title="레이싱 설정" back dismiss-label="뒤로" @close="settingsOpen = false">
      <SectionGroup title="거리 설정">
        <div v-if="distances.length" class="race-chips">
          <button v-for="d in distances" :key="d.distanceM" type="button" :class="{ active: selectedDistanceM === d.distanceM }" @click="selectDistance(d.distanceM)">{{ d.label }}</button>
        </div>
        <p v-else class="race-muted">5km 이상 기록이 쌓이면 거리가 표시됩니다. 그 전엔 '없음'으로 자유 레이싱할 수 있어요.</p>
      </SectionGroup>

      <SectionGroup title="상대 설정">
        <div class="race-options">
          <label v-for="o in opponents" :key="o.runId ?? 'none'" class="race-option" :class="{ active: selectedOpponentRunId === o.runId }">
            <input type="radio" :checked="selectedOpponentRunId === o.runId" @change="selectedOpponentRunId = o.runId" />
            <span class="option-main">{{ opponentLabel(o) }}</span>
            <span v-if="o.kind === 'none'" class="option-sub">고스트 없이 측정만. 이번 기록이 다음 타겟이 됩니다.</span>
            <span v-else class="option-sub">{{ fmtPace(o.avgPaceSec) }} · {{ o.date }}</span>
          </label>
        </div>
      </SectionGroup>

      <SectionGroup title="음성 안내 설정">
        <div class="race-tabs" role="tablist">
          <button type="button" role="tab" :aria-selected="periodicKind === 'distance'" :class="{ active: periodicKind === 'distance' }" @click="periodicKind = 'distance'">거리</button>
          <button type="button" role="tab" :aria-selected="periodicKind === 'time'" :class="{ active: periodicKind === 'time' }" @click="periodicKind = 'time'">시간</button>
          <button type="button" role="tab" :aria-selected="periodicKind === 'silent'" :class="{ active: periodicKind === 'silent' }" @click="periodicKind = 'silent'">조용히</button>
        </div>
        <div v-if="periodicKind !== 'silent'" class="race-sub">
          <span class="race-sub-label">{{ periodicKind === 'distance' ? '구간마다 안내' : '시간마다 안내' }}</span>
          <div v-if="periodicKind === 'distance'" class="race-sub-options">
            <button type="button" :class="{ active: stepM === 100 }" @click="stepM = 100">100m</button>
            <button type="button" :class="{ active: stepM === 500 }" @click="stepM = 500">500m</button>
            <button type="button" :class="{ active: stepM === 1000 }" @click="stepM = 1000">1km</button>
          </div>
          <div v-else class="race-sub-options">
            <button type="button" :class="{ active: stepSec === 60 }" @click="stepSec = 60">1분</button>
            <button type="button" :class="{ active: stepSec === 180 }" @click="stepSec = 180">3분</button>
            <button type="button" :class="{ active: stepSec === 300 }" @click="stepSec = 300">5분</button>
          </div>
        </div>
        <p v-else class="race-sub-silent">음성 안내 없이 측정만 합니다.</p>
        <div class="race-sub" :class="{ 'is-disabled': !hasGhost }">
          <span class="race-sub-label">
            격차 표시 단위
            <small v-if="!hasGhost" class="toggle-hint">상대를 선택하면 설정할 수 있어요</small>
          </span>
          <div class="race-sub-options">
            <button type="button" :class="{ active: gapMode === 'distance' }" :disabled="!hasGhost" @click="gapMode = 'distance'">거리</button>
            <button type="button" :class="{ active: gapMode === 'time' }" :disabled="!hasGhost" @click="gapMode = 'time'">시간</button>
          </div>
        </div>
        <label class="race-toggle" :class="{ 'is-disabled': !hasGhost }">
          <span class="toggle-label">
            역전 알림 (추월/추월당함)
            <small v-if="!hasGhost" class="toggle-hint">상대를 선택하면 켤 수 있어요</small>
          </span>
          <input type="checkbox" v-model="reversalAlert" :disabled="!hasGhost" />
        </label>
      </SectionGroup>
      <template #footer>
        <button class="race-cta" type="button" @click="saveSettings">설정 저장</button>
      </template>
    </StackPage>
  </section>
</template>

<style scoped>
.race-text { color: var(--color-text); margin: 0 0 6px; }
.race-muted { font-size: 0.84rem; color: var(--color-muted); margin: 6px 0 0; line-height: 1.5; }
.race-warn { font-size: 0.84rem; color: var(--color-warning-text); margin: 10px 0 0; }
.race-diag { font-size: 0.72rem; color: var(--color-muted); margin: 8px 0 0; font-family: ui-monospace, monospace; }

/* 상위 모드 탭 — 페이지 레벨 밑줄형 탭 스킨 */
.race-modes { display: flex; gap: 2px; border-bottom: 1px solid var(--color-border); margin-bottom: 16px; }
.race-modes button {
  flex: 1; padding: 14px 0 13px; border: none; background: transparent;
  color: var(--color-muted); font-size: 1.04rem; font-weight: 700; cursor: pointer;
  position: relative; box-shadow: none; letter-spacing: -0.01em;
}
.race-modes button.active { color: var(--color-text); }
.race-modes button.active::after { content: ''; position: absolute; left: 14%; right: 14%; bottom: -1px; height: 3px; background: var(--color-primary); border-radius: 3px 3px 0 0; }

/* 레이싱 설정 요약 행: 값 + 화살표, 클릭 시 설정 스택 */
.race-setting-list { display: flex; flex-direction: column; }
.race-setting-list .row-value { color: var(--color-muted); font-size: 0.92rem; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.race-setting-list .row-chevron { width: 18px; height: 18px; color: var(--color-muted); flex: none; }

.race-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.race-chips button { padding: 9px 18px; border: 1px solid var(--color-border); border-radius: 999px; background: transparent; color: var(--color-text); font-size: 0.92rem; cursor: pointer; box-shadow: none; }
.race-chips button.active { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-primary); font-weight: 700; }

.race-options { display: flex; flex-direction: column; gap: 10px; }
.race-option { display: flex; flex-direction: column; gap: 3px; padding: 13px 14px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-field); cursor: pointer; }
.race-option.active { border-color: var(--color-primary); background: var(--color-primary-soft); }
.race-option input { display: none; }
.option-main { font-weight: 600; color: var(--color-text); }
.option-sub { font-size: 0.8rem; color: var(--color-muted); }

.race-tabs { display: flex; gap: 8px; }
.race-tabs button { flex: 1; padding: 11px 0; border: 1px solid var(--color-border); border-radius: 10px; background: transparent; color: var(--color-muted); font-size: 0.92rem; cursor: pointer; box-shadow: none; }
.race-tabs button.active { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-primary); font-weight: 700; }

.race-sub { margin: 12px 0 2px; padding: 12px 12px 12px 14px; border-left: 2px solid var(--color-primary); background: var(--color-subtle); border-radius: 0 12px 12px 0; }
.race-sub-label { display: block; font-size: 0.78rem; color: var(--color-muted); margin-bottom: 9px; }
.race-sub-options { display: flex; gap: 8px; }
.race-sub-options button { flex: 1; padding: 9px 0; border: 1px solid var(--color-border); border-radius: 9px; background: var(--color-surface-2); color: var(--color-text); font-size: 0.88rem; cursor: pointer; box-shadow: none; }
.race-sub-options button.active { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-primary); font-weight: 700; }
.race-sub-silent { margin: 12px 0 2px; font-size: 0.84rem; color: var(--color-muted); }

.race-toggle { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 12px; }
.race-toggle .toggle-label { flex: 1; min-width: 0; color: var(--color-text); font-size: 0.92rem; }
.race-toggle .toggle-hint { display: block; font-size: 0.75rem; color: var(--color-muted); margin-top: 3px; }
.race-toggle input { flex: none; width: 22px; height: 22px; accent-color: var(--color-primary); }
.race-toggle.is-disabled { opacity: 0.55; }
.race-toggle.is-disabled .toggle-label { color: var(--color-muted); }

.race-cta { width: 100%; padding: 15px; border: none; border-radius: 14px; background: var(--color-primary-strong); color: var(--color-on-primary); font-size: 1.02rem; font-weight: 700; cursor: pointer; box-shadow: none; }
.race-cta.inline { margin-top: 14px; }
.race-cta:disabled { opacity: 0.5; cursor: default; }

/* 스택 하단 고정 푸터 (.memory-stack-page 3행 그리드 footer 슬롯) */
.stack-footer { padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px); background: var(--color-header-bg); backdrop-filter: blur(18px); border-top: 1px solid var(--color-border); }
.race-live-footer { display: flex; gap: 10px; }
.race-btn { flex: 1; padding: 14px; border: none; border-radius: 14px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: none; }
.race-btn.secondary { background: var(--color-surface-2); color: var(--color-text); }
.race-btn.danger { background: var(--tds-red-500); color: #fff; }

.race-live { text-align: center; padding: 6px 0; }
.live-time { font-size: 3.4rem; font-weight: 800; color: var(--color-strong); font-variant-numeric: tabular-nums; line-height: 1.05; letter-spacing: -0.02em; }
.live-stats { display: flex; justify-content: center; gap: 14px; margin-top: 12px; }
.live-stat { flex: 1; max-width: 180px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px; border-radius: 12px; background: var(--color-surface-2); }
.live-stat strong { font-size: 1.8rem; font-weight: 800; color: var(--color-strong); font-variant-numeric: tabular-nums; line-height: 1.1; }
.live-stat span { font-size: 0.75rem; color: var(--color-muted); }
.live-gap { font-size: 1.45rem; font-weight: 700; margin: 12px 0; }
.live-gap.ahead { color: var(--color-primary); }
.live-gap.behind { color: var(--color-warning-text); }
.live-gap.even { color: var(--color-muted); }
.live-meta { font-size: 0.85rem; color: var(--color-muted); margin-top: 4px; }

/* 실시간 진행 막대 (목표 거리 대비 내 위치 + 고스트) */
/* 참가자별 레인(나/타겟) + 각자 진행 점 — 멀티(크루) 확장 구조 */
.race-track { margin: 16px 0 8px; display: flex; flex-direction: column; gap: 10px; }
.track-lane { display: flex; align-items: center; gap: 8px; }
.lane-label { width: 38px; flex: none; font-size: 0.78rem; color: var(--color-muted); text-align: right; }
.track-rail { position: relative; flex: 1; height: 10px; border-radius: 999px; background: var(--color-surface-2); }
.track-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 999px; transition: width 0.4s ease; }
.track-fill.me { background: var(--color-primary-strong); }
.track-fill.ghost { background: color-mix(in srgb, var(--color-muted) 50%, transparent); }
.track-dot { position: absolute; top: 50%; width: 13px; height: 13px; border-radius: 50%; transform: translate(-50%, -50%); transition: left 0.4s ease; border: 2px solid var(--color-bg); }
.track-dot.me { background: var(--color-primary); }
.track-dot.ghost { background: var(--color-muted); }
.track-labels { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--color-muted); margin-top: 2px; padding-left: 46px; }

.race-ready { font-size: 1.4rem; font-weight: 700; color: var(--color-text); margin: 8px 0 6px; }
.race-ready-sub { font-size: 0.9rem; color: var(--color-muted); line-height: 1.55; }

/* 시작 카운트다운 오버레이 */
.race-countdown { position: fixed; inset: 0; z-index: 1150; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(6px); }
.countdown-ring {
  width: 168px; height: 168px; border-radius: 50%;
  border: 4px solid var(--color-primary);
  display: flex; align-items: center; justify-content: center;
  animation: countdown-pulse 1s ease-out;
}
.countdown-num { font-size: 5.5rem; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
@keyframes countdown-pulse {
  0% { transform: scale(0.55); opacity: 0; }
  25% { opacity: 1; }
  100% { transform: scale(1.18); opacity: 0; }
}
.fade-enter-active, .fade-leave-active { transition: opacity 160ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 같은 날 둘째 세션 minGap 강한 확인 오버레이(#462) */
.race-gap-confirm { position: fixed; inset: 0; z-index: 1160; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(6px); }
.gap-confirm-card { width: 100%; max-width: 360px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 18px; padding: 22px 20px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3); }
.gap-confirm-title { margin: 0 0 8px; font-size: 1.12rem; font-weight: 800; color: var(--color-text); }
.gap-confirm-body { margin: 0 0 18px; font-size: 0.95rem; line-height: 1.55; color: var(--color-muted); }
.gap-confirm-body strong { color: var(--color-text); font-weight: 700; }
.gap-confirm-actions { display: flex; gap: 10px; }

.summary-title { font-size: 1.5rem; font-weight: 700; color: var(--color-text); }
.summary-grid { display: flex; flex-direction: column; gap: 0; }
.summary-grid div { display: flex; justify-content: space-between; gap: 16px; border-top: 1px solid var(--color-border); padding: 12px 0; }
.summary-grid div:first-child { border-top: none; }
.summary-grid span { color: var(--color-muted); flex: none; }
.summary-grid strong { color: var(--color-text); text-align: right; }
</style>
