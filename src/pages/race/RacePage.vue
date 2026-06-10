<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRunStore } from '@/app/stores/runStore'
import { useLiveRun } from '@/features/live-run/useLiveRun'
import { ghostCurveForRun, listDistanceOptions, listOpponents, type OpponentOption } from '@/features/live-run/raceTargets'
import { distanceAtTime, type GhostCurvePoint } from '@/shared/lib/selfRace/ghost'
import type { AnnounceConfig, PeriodicAnnounceKind } from '@/features/live-run/liveRunBridge'
import type { LiveGapPayload, LiveTickPayload } from '@/features/live-run/liveRunBridge'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import ListRow from '@/shared/ui/ListRow.vue'

type Step = 'setup' | 'live' | 'summary'
type RaceMode = 'solo' | 'crew'
type RaceSettings = {
  distanceM: number | null
  opponentRunId: string | null
  periodicKind: PeriodicAnnounceKind
  stepM: 100 | 500 | 1000
  stepSec: number
  reversalAlert: boolean
  distanceLabel: string
  opponentLabel: string
  voiceLabel: string
}

const emit = defineEmits<{ close: [] }>()

const LS_KEY = 'race_last_settings_v1'

const runStore = useRunStore()
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

const distances = computed(() => listDistanceOptions(runStore.selectedUserRuns))
const selectedDistanceM = ref<number | null>(null)
const opponents = computed(() => listOpponents(runStore.selectedUserRuns, selectedDistanceM.value))
const selectedOpponentRunId = ref<string | null>(null)
const hasGhost = computed(() => selectedOpponentRunId.value != null)

const periodicKind = ref<PeriodicAnnounceKind>('distance')
const stepM = ref<100 | 500 | 1000>(1000)
const stepSec = ref<number>(300)
const reversalAlert = ref(true)

const finalTick = ref<LiveTickPayload | null>(null)
const finalGap = ref<LiveGapPayload | null>(null)

// 라이브 진행 막대용 — 시작 시점 목표거리·고스트 곡선 캡처
const activeTargetM = ref(0)
const activeGhostCurve = ref<GhostCurvePoint[] | null>(null)

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
      step.value = 'summary'
    }
  }
)

function buildAnnounceConfig(): AnnounceConfig {
  if (periodicKind.value === 'distance') return { periodic: { kind: 'distance', stepM: stepM.value }, reversalAlert: reversalAlert.value }
  if (periodicKind.value === 'time') return { periodic: { kind: 'time', stepSec: stepSec.value }, reversalAlert: reversalAlert.value }
  return { periodic: { kind: 'silent' }, reversalAlert: reversalAlert.value }
}

function voiceLabel(): string {
  const reversal = hasGhost.value && reversalAlert.value
  if (periodicKind.value === 'silent') return reversal ? '역전만' : '조용히'
  const base = periodicKind.value === 'distance'
    ? (stepM.value >= 1000 ? `${stepM.value / 1000}km` : `${stepM.value}m`)
    : `${Math.round(stepSec.value / 60)}분`
  return reversal ? `${base}, 역전 마다` : `${base}마다`
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
    distanceLabel: selectedDistanceM.value ? `${selectedDistanceM.value / 1000}km` : '자유',
    opponentLabel: opponentLabel(opp),
    voiceLabel: voiceLabel()
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(lastSettings.value))
  } catch {
    // 저장 실패는 치명적 아님
  }
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
  started.value = false
  countdown.value = null
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

// 명시적 '시작' → 3·2·1 카운트다운 후 실제 측정 시작(begin).
function beginCountdown() {
  if (countdown.value !== null || started.value || !gpsReady.value) return
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
  if (live.available) live.begin() // 준비된 GPS 세션에서 클럭·측정 시작
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
  clearCountdown()
  live.stop()
  step.value = 'summary'
}

function resetRace() {
  finalTick.value = null
  finalGap.value = null
  started.value = false
  clearCountdown()
  step.value = 'setup'
}

onUnmounted(() => {
  clearCountdown()
  live.stop() // 스택 닫힘/언마운트 시 GPS 세션 정리(대기/진행 중이던 경우)
})

function opponentLabel(o: OpponentOption): string {
  if (o.kind === 'none') return '없음 — 자유 레이싱'
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
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"/km`
}
function formatGapMinSec(seconds: number): string {
  const s = Math.round(Math.abs(seconds))
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m}분 ${rest}초` : `${m}분`
}
function gapText(gap: LiveGapPayload | null): string {
  if (!gap) return '고스트 없음'
  const amount = formatGapMinSec(gap.timeGapSec)
  if (gap.leadState === 'ahead') return `고스트보다 ${amount} 앞`
  if (gap.leadState === 'behind') return `고스트보다 ${amount} 뒤`
  return '고스트와 나란히'
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

// 실시간 타겟과의 갭을 거리(m)로 표현: 내 누적거리 − 같은 시각 고스트 거리. 양수=내가 앞.
const distanceGapM = computed(() => {
  if (!activeGhostCurve.value) return null
  const ghostDist = distanceAtTime({ source: 'even', points: activeGhostCurve.value }, live.tick.value?.elapsedSec ?? 0)
  return (live.tick.value?.cumulativeDistanceM ?? 0) - ghostDist
})
const liveLead = computed<'ahead' | 'behind' | 'even'>(() => {
  const g = distanceGapM.value
  if (g == null || Math.abs(g) <= 5) return 'even'
  return g > 0 ? 'ahead' : 'behind'
})
const liveGapText = computed(() => {
  const g = distanceGapM.value
  if (g == null) return '고스트 없음'
  const a = Math.abs(g)
  const amount = a >= 1000 ? `${(a / 1000).toFixed(2)}km` : `${Math.round(a)}m`
  if (g > 5) return `고스트보다 ${amount} 앞`
  if (g < -5) return `고스트보다 ${amount} 뒤`
  return '고스트와 나란히'
})
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
      <div><h2>레이싱</h2></div>
      <button class="stack-icon-button" type="button" aria-label="닫기" @click="emit('close')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
      </button>
    </header>

    <main class="memory-stack-content">
      <!-- 브리지 없음(웹) 폴백 -->
      <SectionGroup v-if="!live.available && !previewMode" title="안내">
        <p class="race-text">가상레이싱은 <strong>iOS 앱</strong>에서만 가능합니다.</p>
        <p class="race-muted">앱에서 화면을 잠그고 달리면 음성으로 경쟁 상황을 안내합니다.</p>
      </SectionGroup>

      <!-- ① 설정 -->
      <template v-else-if="step === 'setup'">
        <div class="race-modes" role="tablist">
          <button type="button" role="tab" :aria-selected="raceMode === 'solo'" :class="{ active: raceMode === 'solo' }" @click="raceMode = 'solo'">🏃 나와의 대결</button>
          <button type="button" role="tab" :aria-selected="raceMode === 'crew'" :class="{ active: raceMode === 'crew' }" @click="raceMode = 'crew'">👥 크루와 대결</button>
        </div>

        <SectionGroup v-if="raceMode === 'crew'" title="크루와 대결">
          <p class="race-muted">추후 공개됩니다.</p>
        </SectionGroup>

        <template v-else>
          <template v-if="lastSettings">
            <SectionGroup title="레이싱 설정">
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

          <SectionGroup v-else title="나와의 대결">
            <p class="race-muted">고스트(과거 기록)와 달리거나, 자유 레이싱으로 기록에 도전하세요. 거리·상대·음성 안내를 먼저 설정합니다.</p>
            <button class="race-cta inline" type="button" @click="openSettings">설정하러 가기</button>
          </SectionGroup>
        </template>
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
            <div v-if="finalGap"><span>고스트 시간차</span><strong>{{ gapText(finalGap) }}</strong></div>
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

    <!-- 2차 스택: 레이싱 설정 -->
    <Teleport to="body">
      <Transition name="stack-page">
        <div v-if="settingsOpen" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <button class="stack-icon-button" type="button" aria-label="뒤로" @click="settingsOpen = false">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <div><h2>레이싱 설정</h2></div>
            </header>
            <main class="memory-stack-content">
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
                <label class="race-toggle" :class="{ 'is-disabled': !hasGhost }">
                  <span class="toggle-label">
                    역전 알림 (추월/추월당함)
                    <small v-if="!hasGhost" class="toggle-hint">상대를 선택하면 켤 수 있어요</small>
                  </span>
                  <input type="checkbox" v-model="reversalAlert" :disabled="!hasGhost" />
                </label>
              </SectionGroup>
            </main>
            <footer class="stack-footer">
              <button class="race-cta" type="button" @click="saveSettings">설정 저장</button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
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

.summary-title { font-size: 1.5rem; font-weight: 700; color: var(--color-text); }
.summary-grid { display: flex; flex-direction: column; gap: 0; }
.summary-grid div { display: flex; justify-content: space-between; gap: 16px; border-top: 1px solid var(--color-border); padding: 12px 0; }
.summary-grid div:first-child { border-top: none; }
.summary-grid span { color: var(--color-muted); flex: none; }
.summary-grid strong { color: var(--color-text); text-align: right; }
</style>
