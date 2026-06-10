import type { RunLog, RunMetricSample, Lap } from '@/entities/run/model'

/**
 * 가상레이싱 `나와의 대결` 고스트 비교 엔진 — 순수 로직 (#230, competition-domain §9.1·§9.4).
 *
 * ⚠️ 이 파일은 고스트 비교 알고리즘의 **단일 기준(canonical spec)** 이다.
 *   - 포그라운드 화면 비교 표시가 이 함수들을 직접 쓴다.
 *   - 백그라운드 실시간 루프는 WKWebView JS 정지 때문에 네이티브 `GhostRaceEngine`(#229)이
 *     **이 알고리즘을 포팅**해 실행한다. 네이티브 포팅은 여기 정의된 부호·보간·역전·dedupe
 *     규칙에서 어긋나면 안 된다.
 *   - Vitest(`ghost.test.ts`)가 회귀 기준이다.
 *
 * 곡선 좌표계: GhostCurve.points 는 출발선부터의 **누적거리(distanceM) ↔ 경과시간(elapsedSec)**
 * 쌍이며, 둘 다 단조증가하고 {0,0} 에서 시작한다.
 *
 * 부호 약속(중요):
 *   - timeGapSec  : 음수 = 내가 고스트보다 **앞섬**(같은 거리를 더 빨리 도달), 양수 = 뒤짐.
 *   - distanceGapM: 양수 = 내가 고스트보다 **앞섬**(같은 시각에 더 멀리), 음수 = 뒤짐.
 */

export type GhostCurveSource = 'metricSamples' | 'laps' | 'even'

export type GhostCurvePoint = { distanceM: number; elapsedSec: number }

export type GhostCurve = {
  source: GhostCurveSource
  points: GhostCurvePoint[]
}

export type LiveTick = { cumulativeDistanceM: number; elapsedSec: number }

export type LeadState = 'ahead' | 'behind' | 'even'

export type GapState = {
  timeGapSec: number
  distanceGapM: number
  leadState: LeadState
}

export type AnnouncementKind = 'periodic' | 'lap' | 'reversal' | 'finish'

/** 고스트 격차 표현 단위. 사용자가 음성 설정에서 고르며 화면 표시와 음성 안내가 함께 따른다. */
export type GapDisplayMode = 'distance' | 'time'

export type AnnouncementContext = {
  gap: GapState
  /** 격차 표현 단위(거리/시간). 없으면 'distance'. */
  gapMode?: GapDisplayMode
  /** lap/periodic 의 기준 거리(m). dedupe·문구에 사용. */
  distanceM?: number
  /**
   * periodic 의 주기 step 인덱스(1부터). 시간 주기(N분마다)에서는 같은 km 안에 여러 멘트가
   * 생기므로 km 버킷이 아닌 step 으로 dedupe 해야 한다(없으면 같은 km 내 2번째 발화부터 무음 드롭).
   * 거리 주기에서도 step 으로 dedupe 하면 1km 미만 간격이 안전하다. 없으면 km 버킷으로 폴백.
   */
  periodicStep?: number
  /** reversal 종류. */
  reversal?: 'overtake' | 'overtaken'
}

export type Announcement = { text: string; priority: number; dedupeKey: string }

/** leadState 가 'even' 으로 판정되는 시간차 한계(초). */
const EVEN_EPSILON_SEC = 1

// ── 곡선 생성 ───────────────────────────────────────────────────────────────

/**
 * 기존 레이싱 세션 RunLog 로 고스트 곡선을 만든다. 3단 fallback:
 * metricSamples(페이스 적분) → laps(랩 누적) → even(등속). opts.mode='even' 이면 강제 등속.
 */
export function buildGhostCurve(run: RunLog, opts: { mode?: 'ghost' | 'even' } = {}): GhostCurve {
  const totalM = (run.distanceKm ?? 0) * 1000
  if (opts.mode === 'even') return evenCurve(totalM, run.durationSec)

  return fromMetricSamples(run.metricSamples ?? [], totalM)
    ?? fromLaps(run.laps ?? [], totalM, run.durationSec)
    ?? evenCurve(totalM, run.durationSec)
}

function fromMetricSamples(samples: RunMetricSample[], totalM: number): GhostCurve | null {
  const valid = samples
    .filter((s) => s.offsetSec != null && Number.isFinite(s.offsetSec) && s.paceSec != null && Number.isFinite(s.paceSec) && (s.paceSec as number) > 0)
    .sort((a, b) => a.offsetSec - b.offsetSec)
  if (valid.length < 2) return null

  const speedOf = (s: RunMetricSample) => 1000 / (s.paceSec as number) // m/s
  const points: GhostCurvePoint[] = [{ distanceM: 0, elapsedSec: 0 }]
  let cum = 0
  let prevT = 0
  let prevV = speedOf(valid[0])
  for (const s of valid) {
    const v = speedOf(s)
    const dt = s.offsetSec - prevT
    if (dt > 0) {
      cum += ((prevV + v) / 2) * dt
      points.push({ distanceM: cum, elapsedSec: s.offsetSec })
    }
    prevT = s.offsetSec
    prevV = v
  }
  if (cum <= 0 || !Number.isFinite(cum)) return null
  if (totalM > 0) {
    const scale = totalM / cum
    for (const p of points) p.distanceM *= scale
  }
  return { source: 'metricSamples', points }
}

function fromLaps(laps: Lap[], totalM: number, durationSec: number | null): GhostCurve | null {
  const valid = laps
    .filter((l) => l.distanceKm != null && Number.isFinite(l.distanceKm) && (l.distanceKm as number) > 0 && l.paceSec != null && Number.isFinite(l.paceSec) && (l.paceSec as number) > 0)
    .sort((a, b) => a.index - b.index)
  if (!valid.length) return null

  const points: GhostCurvePoint[] = [{ distanceM: 0, elapsedSec: 0 }]
  let cumDist = 0
  let cumTime = 0
  for (const lap of valid) {
    cumDist += (lap.distanceKm as number) * 1000
    cumTime += (lap.distanceKm as number) * (lap.paceSec as number)
    points.push({ distanceM: cumDist, elapsedSec: cumTime })
  }
  if (cumDist <= 0 || cumTime <= 0) return null
  // 랩 합을 실제 총거리/총시간에 앵커링(랩이 전 구간을 못 덮을 수 있음).
  const distScale = totalM > 0 ? totalM / cumDist : 1
  const timeScale = durationSec && durationSec > 0 ? durationSec / cumTime : 1
  for (const p of points) {
    p.distanceM *= distScale
    p.elapsedSec *= timeScale
  }
  return { source: 'laps', points }
}

function evenCurve(totalM: number, durationSec: number | null): GhostCurve {
  if (totalM > 0 && durationSec && durationSec > 0) {
    return { source: 'even', points: [{ distanceM: 0, elapsedSec: 0 }, { distanceM: totalM, elapsedSec: durationSec }] }
  }
  return { source: 'even', points: [{ distanceM: 0, elapsedSec: 0 }] }
}

// ── 곡선 질의 ───────────────────────────────────────────────────────────────

/** 고스트가 누적거리 distanceM 에 도달한 시각(초). 곡선 범위를 벗어나면 끝점으로 클램프. */
export function timeAtDistance(curve: GhostCurve, distanceM: number): number {
  return interpolate(curve.points, 'distanceM', 'elapsedSec', distanceM)
}

/** 고스트가 elapsedSec 시점에 도달한 누적거리(m). 곡선 범위를 벗어나면 끝점으로 클램프. */
export function distanceAtTime(curve: GhostCurve, elapsedSec: number): number {
  return interpolate(curve.points, 'elapsedSec', 'distanceM', elapsedSec)
}

function interpolate(points: GhostCurvePoint[], keyAxis: keyof GhostCurvePoint, valueAxis: keyof GhostCurvePoint, key: number): number {
  if (!points.length) return 0
  if (key <= points[0][keyAxis]) return points[0][valueAxis]
  const last = points[points.length - 1]
  if (key >= last[keyAxis]) return last[valueAxis]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (key <= b[keyAxis]) {
      const span = b[keyAxis] - a[keyAxis]
      if (span <= 0) return a[valueAxis]
      const ratio = (key - a[keyAxis]) / span
      return a[valueAxis] + ratio * (b[valueAxis] - a[valueAxis])
    }
  }
  return last[valueAxis]
}

// ── 비교 ───────────────────────────────────────────────────────────────────

/** 현재 라이브 틱과 고스트 곡선을 비교해 시간차/거리차/우열을 낸다. */
export function computeGap(curve: GhostCurve, tick: LiveTick): GapState {
  const ghostTimeAtMyDistance = timeAtDistance(curve, tick.cumulativeDistanceM)
  const ghostDistanceAtMyTime = distanceAtTime(curve, tick.elapsedSec)
  const timeGapSec = tick.elapsedSec - ghostTimeAtMyDistance
  const distanceGapM = tick.cumulativeDistanceM - ghostDistanceAtMyTime
  const leadState: LeadState = timeGapSec < -EVEN_EPSILON_SEC ? 'ahead' : timeGapSec > EVEN_EPSILON_SEC ? 'behind' : 'even'
  return { timeGapSec, distanceGapM, leadState }
}

/**
 * 역전을 1회성으로 감지한다. 추월(뒤지다가 앞섬)='overtake', 역추월(앞서다 뒤짐)='overtaken'.
 * 같은 우열이 유지되는 동안에는 null 을 반환해 연속 발화를 막는다.
 */
export function detectReversal(prev: GapState | null, next: GapState): 'overtake' | 'overtaken' | null {
  if (!prev) return null
  if (prev.leadState !== 'ahead' && next.leadState === 'ahead') return 'overtake'
  if (prev.leadState !== 'behind' && next.leadState === 'behind') return 'overtaken'
  return null
}

// ── 안내 문구 ────────────────────────────────────────────────────────────────

const PRIORITY: Record<AnnouncementKind, number> = { periodic: 1, lap: 2, reversal: 3, finish: 4 }

/** 절대 초를 한국어로. 60초 미만은 'N초', 이상은 'M분 S초'(S=0이면 'M분'). */
function formatGapSeconds(seconds: number): string {
  const s = Math.round(Math.abs(seconds))
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m}분 ${rest}초` : `${m}분`
}

function kmLabel(distanceM: number): string {
  const km = distanceM / 1000
  return Number.isInteger(km) ? `${km}km` : `${km.toFixed(1)}km`
}

/** 고스트와의 거리 격차를 한국어로. 1km 미만은 'Nm', 이상은 'X.Xkm'. */
function formatGapDistance(distanceGapM: number): string {
  const m = Math.round(Math.abs(distanceGapM))
  if (m < 1000) return `${m}m`
  return `${(m / 1000).toFixed(1)}km`
}

/** 격차 표현 단위(거리/시간)에 맞춰 양(量)을 한국어로. 화면·음성이 같은 단위를 쓰게 하는 단일 함수. */
export function formatGapAmount(gap: GapState, mode: GapDisplayMode): string {
  return mode === 'time' ? formatGapSeconds(gap.timeGapSec) : formatGapDistance(gap.distanceGapM)
}

function gapClause(gap: GapState, mode: GapDisplayMode): string {
  if (gap.leadState === 'even') return '고스트와 거의 나란히'
  const amount = formatGapAmount(gap, mode)
  return gap.leadState === 'ahead' ? `고스트보다 ${amount} 앞서는 중` : `고스트보다 ${amount} 뒤지는 중`
}

/**
 * 한국어 한 문장 안내 + 우선순위 + dedupeKey 를 만든다.
 * dedupeKey 는 같은 지점(같은 km) 재진입 시 중복 발화를 막는 키다.
 */
export function formatAnnouncement(kind: AnnouncementKind, ctx: AnnouncementContext): Announcement {
  const distanceM = ctx.distanceM ?? 0
  const kmBucket = Math.floor(distanceM / 1000)
  const mode: GapDisplayMode = ctx.gapMode ?? 'distance'
  switch (kind) {
    case 'periodic': {
      const text = ctx.gap.leadState === 'even'
        ? '고스트와 거의 나란히 달리고 있어요.'
        : ctx.gap.leadState === 'ahead'
          ? `고스트보다 ${formatGapAmount(ctx.gap, mode)} 앞서고 있어요.`
          : `고스트보다 ${formatGapAmount(ctx.gap, mode)} 뒤처졌어요.`
      return { text, priority: PRIORITY.periodic, dedupeKey: `periodic:${ctx.periodicStep ?? kmBucket}` }
    }
    case 'lap': {
      return { text: `${kmLabel(distanceM)} 통과 — ${gapClause(ctx.gap, mode)}.`, priority: PRIORITY.lap, dedupeKey: `lap:${Math.round(distanceM / 1000)}` }
    }
    case 'reversal': {
      const type = ctx.reversal ?? (ctx.gap.leadState === 'ahead' ? 'overtake' : 'overtaken')
      const text = type === 'overtake' ? '고스트를 제쳤어요! 지금부터가 진짜예요.' : '고스트에게 따라잡혔어요. 다시 붙어봐요.'
      return { text, priority: PRIORITY.reversal, dedupeKey: `reversal:${type}:${kmBucket}` }
    }
    case 'finish': {
      const amount = formatGapAmount(ctx.gap, mode)
      let text: string
      if (ctx.gap.leadState === 'even') {
        text = '완주! 고스트와 거의 동시에 들어왔어요.'
      } else if (mode === 'time') {
        text = ctx.gap.leadState === 'ahead' ? `완주! 고스트보다 ${amount} 빨랐어요.` : `완주! 고스트보다 ${amount} 늦었어요.`
      } else {
        text = ctx.gap.leadState === 'ahead' ? `완주! 고스트보다 ${amount} 앞서 들어왔어요.` : `완주! 고스트보다 ${amount} 뒤처져 들어왔어요.`
      }
      return { text, priority: PRIORITY.finish, dedupeKey: 'finish' }
    }
  }
}
