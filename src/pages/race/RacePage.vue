<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRunStore } from '@/app/stores/runStore'
import { useLiveRun } from '@/features/live-run/useLiveRun'
import { ghostCurveForTarget, listRaceTargets } from '@/features/live-run/raceTargets'
import type { AnnounceConfig, PeriodicAnnounceKind } from '@/features/live-run/liveRunBridge'
import type { LiveGapPayload, LiveTickPayload } from '@/features/live-run/liveRunBridge'
import PageLayout from '@/shared/ui/PageLayout.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'

type Step = 'setup' | 'live' | 'summary'

const runStore = useRunStore()
const live = useLiveRun()
const route = useRoute()

// dev 전용 미리보기: 브리지 없는 브라우저에서도 화면 스타일을 보기 위함(?preview=1).
// import.meta.env.DEV가 false인 프로덕션 빌드에는 포함되지 않는다.
const previewMode = computed(() => import.meta.env.DEV && route.query.preview === '1')

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
  if (live.available) {
    live.start({
      sessionId: `live-${Date.now()}`,
      mode: 'solo',
      ghostCurve,
      announceConfig: buildAnnounceConfig()
    })
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
  <PageLayout>
    <header class="race-head">
      <h1>나와의 대결</h1>
      <p class="sub">혼자하기 · 화면 잠가도 음성으로 안내</p>
    </header>

    <!-- 브리지 없음(웹) 폴백 -->
    <SectionGroup v-if="!live.available && !previewMode" title="안내">
      <p class="race-text">가상레이싱은 <strong>iOS 앱</strong>에서만 가능합니다.</p>
      <p class="race-muted">앱에서 화면을 잠그고 달리면 음성으로 경쟁 상황을 안내합니다.</p>
    </SectionGroup>

    <!-- ① 타겟 선택 + 설정 -->
    <template v-else-if="step === 'setup'">
      <SectionGroup title="타겟">
        <div class="race-options">
          <label class="race-option" :class="{ active: selectedTargetId === null }">
            <input type="radio" :checked="selectedTargetId === null" @change="selectedTargetId = null" />
            <span class="option-main">없음 — 자유 레이싱</span>
            <span class="option-sub">고스트 없이 측정만. 이번 기록이 다음 타겟이 됩니다.</span>
          </label>

          <label v-for="t in targets" :key="t.runId" class="race-option" :class="{ active: selectedTargetId === t.runId }">
            <input type="radio" :checked="selectedTargetId === t.runId" @change="selectedTargetId = t.runId" />
            <span class="option-main">
              {{ t.distanceKm.toFixed(2) }}km · {{ fmtTime(t.durationSec) }}
              <span v-if="t.isPb" class="pb-badge">최고</span>
            </span>
            <span class="option-sub">{{ fmtPace(t.avgPaceSec) }} · {{ t.date }}</span>
          </label>
        </div>
        <p v-if="targets.length === 0" class="race-muted">
          아직 레이싱 세션이 없어요. 먼저 '없음'으로 한 번 달리면 다음부터 그 기록과 대결할 수 있어요.
        </p>
      </SectionGroup>

      <SectionGroup title="경쟁 보고 주기">
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
          <span class="toggle-label">역전 알림 (추월/추월당함)</span>
          <input type="checkbox" v-model="reversalAlert" />
        </label>
      </SectionGroup>

      <button class="race-cta" type="button" @click="startRace">레이싱 시작</button>
    </template>

    <!-- ② 라이브 -->
    <template v-else-if="step === 'live'">
      <SectionGroup title="라이브">
        <div class="race-live">
          <div class="live-time">{{ elapsedText }}</div>
          <div class="live-distance">{{ distanceText }} km</div>
          <div v-if="hasGhost" class="live-gap" :class="live.gap.value?.leadState ?? 'even'">
            {{ gapText(live.gap.value) }}
          </div>
          <div class="live-meta">
            페이스 {{ paceText }} · 신호 {{ live.tick.value?.signalState ?? '-' }} · {{ live.tick.value?.source ?? '-' }}
          </div>
        </div>
        <p v-if="live.permission.value === 'whenInUse'" class="race-warn">
          위치를 "항상 허용"으로 바꿔야 화면을 잠가도 측정됩니다.
        </p>
        <p v-if="live.error.value" class="race-warn">오류 {{ live.error.value.code }}: {{ live.error.value.message }}</p>
      </SectionGroup>

      <div class="race-actions">
        <button v-if="live.state.value === 'paused'" class="race-btn secondary" type="button" @click="live.resume()">재개</button>
        <button v-else class="race-btn secondary" type="button" @click="live.pause()">일시정지</button>
        <button class="race-btn danger" type="button" @click="endRace">종료</button>
      </div>
    </template>

    <!-- ③ 종료 요약 -->
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
      <button class="race-cta" type="button" @click="resetRace">새 레이싱</button>
    </template>
  </PageLayout>
</template>

<style scoped>
.race-head { padding: 4px 2px 2px; }
.race-head h1 { font-size: 1.5rem; margin: 0; color: var(--color-text); }
.race-head .sub { color: var(--color-muted); font-size: 0.86rem; margin: 4px 0 0; }

.race-text { color: var(--color-text); margin: 0 0 6px; }
.race-muted { font-size: 0.84rem; color: var(--color-muted); margin: 8px 0 0; line-height: 1.5; }
.race-warn { font-size: 0.84rem; color: var(--color-warning-text); margin: 10px 0 0; }

.race-options { display: flex; flex-direction: column; gap: 10px; }
.race-option {
  display: flex; flex-direction: column; gap: 3px;
  padding: 13px 14px; border: 1px solid var(--color-border); border-radius: 12px;
  background: var(--color-field); cursor: pointer;
}
.race-option.active { border-color: var(--color-primary); background: var(--color-primary-soft); }
.race-option input { display: none; }
.option-main { font-weight: 600; color: var(--color-text); }
.option-sub { font-size: 0.8rem; color: var(--color-muted); }
.pb-badge { font-size: 0.7rem; background: var(--color-primary); color: var(--color-on-primary); border-radius: 6px; padding: 1px 7px; margin-left: 6px; }

.seg { display: flex; gap: 6px; background: var(--color-surface-2); padding: 4px; border-radius: 12px; margin-bottom: 10px; }
.seg button {
  flex: 1; border: none; background: transparent; color: var(--color-muted);
  padding: 10px 0; border-radius: 9px; font-size: 0.9rem; cursor: pointer;
}
.seg button.active { background: var(--color-primary); color: var(--color-on-primary); font-weight: 600; }

.race-toggle { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 4px; }
.race-toggle .toggle-label { flex: 1; min-width: 0; color: var(--color-text); font-size: 0.92rem; }
.race-toggle input { flex: none; width: 22px; height: 22px; accent-color: var(--color-primary); }

.race-cta {
  width: 100%; padding: 15px; border: none; border-radius: 14px; margin-top: 4px;
  background: var(--color-primary); color: var(--color-on-primary);
  font-size: 1.02rem; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-button);
}

.race-actions { display: flex; gap: 10px; margin-top: 4px; }
.race-btn { flex: 1; padding: 14px; border: none; border-radius: 14px; font-size: 1rem; font-weight: 600; cursor: pointer; }
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
.summary-grid { display: flex; flex-direction: column; gap: 0; margin-top: 6px; }
.summary-grid div { display: flex; justify-content: space-between; border-top: 1px solid var(--color-border); padding: 11px 0; }
.summary-grid span { color: var(--color-muted); }
.summary-grid strong { color: var(--color-text); }
</style>
