<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRunStore } from '@/app/stores/runStore'
import { useLiveRun } from '@/features/live-run/useLiveRun'
import { ghostCurveForRun, listDistanceOptions, listOpponents, type OpponentOption } from '@/features/live-run/raceTargets'
import type { AnnounceConfig, PeriodicAnnounceKind } from '@/features/live-run/liveRunBridge'
import type { LiveGapPayload, LiveTickPayload } from '@/features/live-run/liveRunBridge'
import PageLayout from '@/shared/ui/PageLayout.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'

type Step = 'setup' | 'live' | 'summary'
type RaceMode = 'solo' | 'crew'
type RaceSettings = {
  distanceM: number | null
  opponentRunId: string | null
  periodicKind: PeriodicAnnounceKind
  stepM: 100 | 500 | 1000
  stepSec: number
  reversalAlert: boolean
  // read-only 요약 스냅샷
  distanceLabel: string
  opponentLabel: string
  voiceLabel: string
}

const LS_KEY = 'race_last_settings_v1'

const runStore = useRunStore()
const live = useLiveRun()
const route = useRoute()

const previewMode = computed(() => import.meta.env.DEV && route.query.preview !== '0')

const step = ref<Step>('setup')
const raceMode = ref<RaceMode>('solo')
const settingsOpen = ref(false)
const lastSettings = ref<RaceSettings | null>(null)

// ── 거리 / 상대 (설정 폼 편집 버퍼) ────────────────────────────────────────
const distances = computed(() => listDistanceOptions(runStore.selectedUserRuns))
const selectedDistanceM = ref<number | null>(null)
const opponents = computed(() => listOpponents(runStore.selectedUserRuns, selectedDistanceM.value))
const selectedOpponentRunId = ref<string | null>(null)
const hasGhost = computed(() => selectedOpponentRunId.value != null)

// ── 음성 안내 설정 ─────────────────────────────────────────────────────────
const periodicKind = ref<PeriodicAnnounceKind>('distance')
const stepM = ref<100 | 500 | 1000>(1000)
const stepSec = ref<number>(300)
const reversalAlert = ref(true)

// ── 라이브/요약 ────────────────────────────────────────────────────────────
const finalTick = ref<LiveTickPayload | null>(null)
const finalGap = ref<LiveGapPayload | null>(null)

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
    // 저장값 손상 시 무시(기본값 사용)
  }
}

// 거리 목록이 준비되면 첫 거리 자동 선택(저장값이 없을 때만)
watch(
  distances,
  (list) => {
    if (selectedDistanceM.value == null && list.length) selectedDistanceM.value = list[0].distanceM
  },
  { immediate: true }
)

function selectDistance(distanceM: number) {
  selectedDistanceM.value = distanceM
  selectedOpponentRunId.value = null // 거리 바뀌면 상대 후보가 달라짐 → 없음으로
}

// 네이티브 완주 → 요약
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
  if (periodicKind.value === 'silent') return '조용히'
  if (periodicKind.value === 'distance') return `${stepM.value >= 1000 ? `${stepM.value / 1000}km` : `${stepM.value}m`}마다`
  return `${Math.round(stepSec.value / 60)}분마다`
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
    // 저장 실패는 치명적 아님(이번 세션은 메모리값으로 동작)
  }
  settingsOpen.value = false
}

function startRace() {
  const ghostCurve = selectedOpponentRunId.value
    ? ghostCurveForRun(runStore.selectedUserRuns, selectedOpponentRunId.value) ?? undefined
    : undefined
  if (live.available) {
    live.start({ sessionId: `live-${Date.now()}`, mode: 'solo', ghostCurve, announceConfig: buildAnnounceConfig() })
  }
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
  step.value = 'setup'
}

function opponentLabel(o: OpponentOption): string {
  if (o.kind === 'none') return '없음 — 자유 레이싱'
  const km = o.distanceM ? o.distanceM / 1000 : 0
  return `${km}km ${o.kind === 'race' ? '레이싱' : '훈련'} PB · ${fmtTime(o.elapsedSec)}`
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
  <PageLayout>
    <header class="race-head">
      <h1>레이싱</h1>
      <p class="sub">달리며 음성으로 경쟁 상황을 안내</p>
    </header>

    <SectionGroup v-if="!live.available && !previewMode" title="안내">
      <p class="race-text">가상레이싱은 <strong>iOS 앱</strong>에서만 가능합니다.</p>
      <p class="race-muted">앱에서 화면을 잠그고 달리면 음성으로 경쟁 상황을 안내합니다.</p>
    </SectionGroup>

    <!-- ① 설정 -->
    <template v-else-if="step === 'setup'">
      <div class="race-modes" role="tablist">
        <button type="button" role="tab" :aria-selected="raceMode === 'solo'" :class="{ active: raceMode === 'solo' }" @click="raceMode = 'solo'">나와의 대결</button>
        <button type="button" role="tab" :aria-selected="raceMode === 'crew'" :class="{ active: raceMode === 'crew' }" @click="raceMode = 'crew'">크루와 대결</button>
      </div>

      <SectionGroup v-if="raceMode === 'crew'" title="크루와 대결">
        <p class="race-muted">추후 공개됩니다.</p>
      </SectionGroup>

      <template v-else>
        <!-- 저장된 설정 있음: read-only 요약 -->
        <template v-if="lastSettings">
          <SectionGroup title="레이싱 설정">
            <template #actions>
              <button class="ghost" type="button" @click="openSettings">설정 변경</button>
            </template>
            <div class="summary-grid">
              <div><span>거리</span><strong>{{ lastSettings.distanceLabel }}</strong></div>
              <div><span>상대</span><strong>{{ lastSettings.opponentLabel }}</strong></div>
              <div><span>음성 안내</span><strong>{{ lastSettings.voiceLabel }}</strong></div>
              <div v-if="lastSettings.opponentRunId"><span>역전 알림</span><strong>{{ lastSettings.reversalAlert ? '켜짐' : '꺼짐' }}</strong></div>
            </div>
          </SectionGroup>
          <div class="race-bottom-spacer" aria-hidden="true" />
          <button class="race-cta fixed" type="button" @click="startRace">레이싱 시작</button>
        </template>

        <!-- 저장된 설정 없음: 빈 상태 -->
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
          <div class="live-time">{{ elapsedText }}</div>
          <div class="live-distance">{{ distanceText }} km</div>
          <div v-if="hasGhost" class="live-gap" :class="live.gap.value?.leadState ?? 'even'">{{ gapText(live.gap.value) }}</div>
          <div class="live-meta">페이스 {{ paceText }} · 신호 {{ live.tick.value?.signalState ?? '-' }} · {{ live.tick.value?.source ?? '-' }}</div>
        </div>
        <p v-if="live.permission.value === 'whenInUse'" class="race-warn">위치를 "항상 허용"으로 바꿔야 화면을 잠가도 측정됩니다.</p>
        <p v-if="live.error.value" class="race-warn">오류 {{ live.error.value.code }}: {{ live.error.value.message }}</p>
      </SectionGroup>
      <div class="race-actions">
        <button v-if="live.state.value === 'paused'" class="race-btn secondary" type="button" @click="live.resume()">재개</button>
        <button v-else class="race-btn secondary" type="button" @click="live.pause()">일시정지</button>
        <button class="race-btn danger" type="button" @click="endRace">종료</button>
      </div>
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
      <button class="race-cta inline" type="button" @click="resetRace">새 레이싱</button>
    </template>

    <!-- 설정 스택 상세 -->
    <Teleport to="body">
      <Transition name="stack-page">
        <div v-if="settingsOpen" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <div><h2>레이싱 설정</h2></div>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="settingsOpen = false">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
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
  </PageLayout>
</template>

<style scoped>
.race-head { padding: 4px 2px 2px; }
.race-head h1 { font-size: 1.5rem; margin: 0; color: var(--color-text); }
.race-head .sub { color: var(--color-muted); font-size: 0.86rem; margin: 4px 0 0; }

.race-text { color: var(--color-text); margin: 0 0 6px; }
.race-muted { font-size: 0.84rem; color: var(--color-muted); margin: 6px 0 0; line-height: 1.5; }
.race-warn { font-size: 0.84rem; color: var(--color-warning-text); margin: 10px 0 0; }

/* 상위 모드 탭 — 페이지 레벨 밑줄형 탭 스킨 */
.race-modes { display: flex; gap: 2px; border-bottom: 1px solid var(--color-border); margin-bottom: 16px; }
.race-modes button {
  flex: 1; padding: 14px 0 13px; border: none; background: transparent;
  color: var(--color-muted); font-size: 1.08rem; font-weight: 700; cursor: pointer;
  position: relative; box-shadow: none; letter-spacing: -0.01em;
}
.race-modes button.active { color: var(--color-text); }
.race-modes button.active::after {
  content: ''; position: absolute; left: 14%; right: 14%; bottom: -1px; height: 3px;
  background: var(--color-primary); border-radius: 3px 3px 0 0;
}

.race-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.race-chips button {
  padding: 9px 18px; border: 1px solid var(--color-border); border-radius: 999px;
  background: transparent; color: var(--color-text); font-size: 0.92rem; cursor: pointer; box-shadow: none;
}
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

.race-cta { width: 100%; padding: 15px; border: none; border-radius: 14px; background: var(--color-primary); color: var(--color-on-primary); font-size: 1.02rem; font-weight: 700; cursor: pointer; box-shadow: none; }
.race-cta.inline { margin-top: 14px; }
/* 스택 상세 하단 고정 푸터(.memory-stack-page 3행 그리드의 footer 슬롯) */
.stack-footer {
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px);
  background: var(--color-header-bg);
  backdrop-filter: blur(18px);
  border-top: 1px solid var(--color-border);
}
.race-cta.fixed { position: fixed; left: 50%; transform: translateX(-50%); bottom: var(--bottom-nav-reserve); width: min(100% - 32px, 560px); z-index: 40; }
.race-bottom-spacer { height: 74px; }

.race-actions { display: flex; gap: 10px; margin-top: 4px; }
.race-btn { flex: 1; padding: 14px; border: none; border-radius: 14px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: none; }
.race-btn.secondary { background: var(--color-surface-2); color: var(--color-text); }
.race-btn.danger { background: var(--tds-red-500); color: #fff; }

.race-live { text-align: center; padding: 6px 0; }
.live-time { font-size: 2.8rem; font-weight: 700; color: var(--color-text); font-variant-numeric: tabular-nums; line-height: 1.1; }
.live-distance { font-size: 1.15rem; color: var(--color-muted); margin-top: 2px; }
.live-gap { font-size: 1.35rem; font-weight: 700; margin: 10px 0; }
.live-gap.ahead { color: var(--color-primary); }
.live-gap.behind { color: var(--color-warning-text); }
.live-gap.even { color: var(--color-muted); }
.live-meta { font-size: 0.85rem; color: var(--color-muted); margin-top: 4px; }

.summary-title { font-size: 1.5rem; font-weight: 700; color: var(--color-text); }
.summary-grid { display: flex; flex-direction: column; gap: 0; }
.summary-grid div { display: flex; justify-content: space-between; gap: 16px; border-top: 1px solid var(--color-border); padding: 12px 0; }
.summary-grid div:first-child { border-top: none; }
.summary-grid span { color: var(--color-muted); flex: none; }
.summary-grid strong { color: var(--color-text); text-align: right; }
</style>
