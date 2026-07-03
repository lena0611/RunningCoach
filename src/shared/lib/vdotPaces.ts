import type { AthleteProfile, PersonalBest } from '@/entities/training-memory/model'

// VDOT 기반 페이스 추정.
//
// 목적: 심박 상한(heartRateModel)이 권위인 PaceLAB 코칭에 "보조" 페이스 타깃을 제공한다.
// - PB/Race가 있으면 Daniels VDOT로 역치(템포)/이지/레이스 페이스를 환산한다(신뢰도 measured).
// - PB가 없고 HealthKit VO2max가 있으면 VO2max를 VDOT 근사값으로 써서 같은 페이스를 추정한다(신뢰도 estimate).
// - 둘 다 없으면 페이스 타깃을 만들지 않는다(insufficient). "있으면 활용 / 없으면 미사용".
//
// 주의(왜 estimate가 보수적인가):
// Apple Watch VO2max는 생리학적 추정치이고 Daniels VDOT는 경기력에서 역산한 의사(pseudo)-VO2max라 1:1이 아니다.
// 러닝 이코노미 차이로 잘 훈련된 러너는 VDOT가 실측 VO2max보다 높고, 미숙련 러너는 낮을 수 있다.
// 그래서 VO2max→VDOT는 1:1 근사로만 쓰고 confidence를 'estimate'로 내려 표기하며, 산출 페이스도 항상 심박 상한 하위의 보조 신호로만 쓴다.
//
// 참고: Jack Daniels & Gilbert, VDOT 공식. v는 m/min, VO2는 mL/kg·min, t는 분.

export type PaceSource = 'pb_measured' | 'vo2max_estimate' | 'insufficient'
export type PaceConfidence = 'measured' | 'estimate' | 'none'

export type PaceModel = {
  vdot: number | null
  source: PaceSource
  confidence: PaceConfidence
  // 모든 페이스는 sec/km. 표시 포맷은 호출부에서 한다.
  thresholdPaceSec: number | null // 템포/역치 페이스 (T)
  easyPaceSec: number | null // 이지 페이스 대표값 (E)
  easyPaceRangeSec: [number, number] | null // 이지 페이스 권장 구간 (느린→빠른)
  marathonPaceSec: number | null // 마라톤 페이스 (M)
  intervalPaceSec: number | null // 인터벌 페이스 (I)
  // 추정 근거 요약(코칭/표시용). 예: 'PB 5.00km 22:30 환산' / 'HealthKit VO2max 48.5 추정'
  basis: string | null
}

// VDOT 추정에 쓸 수 있는 최소 PB 거리. 너무 짧은 기록은 VDOT를 과대평가하므로 3km 이상만 본다.
// (runnerLevel.ts의 MIN_PB_DISTANCE_KM와 동일 기준)
const MIN_PB_DISTANCE_KM = 3

// 러닝 VO2 비용: VO2 = -4.60 + 0.182258·v + 0.000104·v²  (v in m/min)
function vo2Cost(velocityMetersPerMin: number): number {
  return -4.6 + 0.182258 * velocityMetersPerMin + 0.000104 * velocityMetersPerMin * velocityMetersPerMin
}

// 위 비용식을 v에 대해 역산(이차방정식의 양의 근).
function velocityForVo2(vo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - vo2
  const disc = b * b - 4 * a * c
  if (disc <= 0) return 0
  return (-b + Math.sqrt(disc)) / (2 * a)
}

// 지속 시간 t(분)에서 유지 가능한 %VO2max (Daniels drop-off 곡선).
function fractionalVo2Max(durationMin: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * durationMin) +
    0.2989558 * Math.exp(-0.1932605 * durationMin)
  )
}

// 경기력(거리 km, 시간 sec)에서 VDOT 산출.
export function vdotFromPerformance(distanceKm: number, durationSec: number): number | null {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationSec)) return null
  if (distanceKm <= 0 || durationSec <= 0) return null
  const meters = distanceKm * 1000
  const minutes = durationSec / 60
  const velocity = meters / minutes // m/min
  const vo2 = vo2Cost(velocity)
  const pct = fractionalVo2Max(minutes)
  if (pct <= 0) return null
  const vdot = vo2 / pct
  if (!Number.isFinite(vdot) || vdot <= 0) return null
  // 현실 범위로 클램프(과대/과소 방지).
  return clamp(round1(vdot), 20, 90)
}

// PB 목록에서 가장 높은(=가장 좋은) VDOT를 산출. 기준 거리 미만 기록은 제외.
export function vdotFromPersonalBests(personalBests: PersonalBest[]): { vdot: number; basis: string } | null {
  let best: { vdot: number; pb: PersonalBest } | null = null
  for (const pb of personalBests) {
    if (pb.distanceKm < MIN_PB_DISTANCE_KM || pb.durationSec <= 0 || pb.distanceKm <= 0) continue
    const vdot = vdotFromPerformance(pb.distanceKm, pb.durationSec)
    if (vdot === null) continue
    if (!best || vdot > best.vdot) best = { vdot, pb }
  }
  if (!best) return null
  const basis = `PB ${best.pb.distanceKm.toFixed(2)}km ${formatClock(best.pb.durationSec)} 환산`
  return { vdot: best.vdot, basis }
}

// VO2max(mL/kg·min)를 VDOT 근사값으로. 1:1로만 쓰되 현실 범위로 클램프(보수적).
export function vdotFromVo2Max(vo2Max: number | null | undefined): number | null {
  if (typeof vo2Max !== 'number' || !Number.isFinite(vo2Max)) return null
  if (vo2Max < 15 || vo2Max > 95) return null
  return clamp(round1(vo2Max), 20, 90)
}

// Daniels 훈련 강도(%VO2max). 코칭에는 T(템포)와 E(이지)가 핵심이다.
const INTENSITY = {
  easy: 0.7, // E 대표값 (범위 0.59~0.74)
  easyEasiest: 0.62,
  easyHardest: 0.74,
  marathon: 0.84, // M
  threshold: 0.88, // T (템포/역치)
  interval: 0.975 // I (≈ vVO2max)
}

// VDOT에서 강도별 페이스(sec/km) 산출.
export function pacesFromVdot(vdot: number): {
  thresholdPaceSec: number
  easyPaceSec: number
  easyPaceRangeSec: [number, number]
  marathonPaceSec: number
  intervalPaceSec: number
} {
  const paceAt = (fraction: number): number => {
    const targetVo2 = vdot * fraction
    const velocity = velocityForVo2(targetVo2) // m/min
    if (velocity <= 0) return 0
    return Math.round(60000 / velocity) // sec/km
  }
  // 느린 쪽(낮은 %)이 페이스 숫자가 크다. 범위는 [느림, 빠름].
  const easySlow = paceAt(INTENSITY.easyEasiest)
  const easyFast = paceAt(INTENSITY.easyHardest)
  return {
    thresholdPaceSec: paceAt(INTENSITY.threshold),
    easyPaceSec: paceAt(INTENSITY.easy),
    easyPaceRangeSec: [easySlow, easyFast],
    marathonPaceSec: paceAt(INTENSITY.marathon),
    intervalPaceSec: paceAt(INTENSITY.interval)
  }
}

// VDOT와 거리(km)에서 레이스 예상 시간(sec) 추정. v와 t가 함께 들어가는 음함수라 이분법으로 푼다.
export function racePredictionSec(vdot: number, distanceKm: number): number | null {
  if (!Number.isFinite(vdot) || vdot <= 0 || distanceKm <= 0) return null
  const meters = distanceKm * 1000
  // VDOT(t) = vo2Cost(meters/t분) / fractionalVo2Max(t분). t에 대해 단조 증가하지 않으므로
  // "이 거리를 t분에 달렸을 때의 VDOT"가 목표 VDOT와 같아지는 t를 이분법으로 찾는다.
  const vdotForTime = (minutes: number): number => {
    const velocity = meters / minutes
    return vo2Cost(velocity) / fractionalVo2Max(minutes)
  }
  let lo = 1 // 1분
  let hi = 600 // 10시간
  // vdotForTime은 t가 커질수록(느릴수록) 감소한다. 목표보다 큰 lo, 작은 hi 사이를 좁힌다.
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    const v = vdotForTime(mid)
    if (v > vdot) lo = mid
    else hi = mid
  }
  const minutes = (lo + hi) / 2
  const sec = Math.round(minutes * 60)
  return Number.isFinite(sec) && sec > 0 ? sec : null
}

// 프로필에서 페이스 모델을 만든다. 우선순위: PB(measured) > VO2max(estimate) > 없음(insufficient).
export function resolvePaceModel(profile: AthleteProfile): PaceModel {
  const fromPb = vdotFromPersonalBests(profile.personalBests ?? [])
  if (fromPb) {
    return buildPaceModel(fromPb.vdot, 'pb_measured', 'measured', fromPb.basis)
  }
  const vo2Vdot = vdotFromVo2Max(profile.vo2Max)
  if (vo2Vdot !== null) {
    const basis = `HealthKit VO2max ${profile.vo2Max} 추정`
    return buildPaceModel(vo2Vdot, 'vo2max_estimate', 'estimate', basis)
  }
  return {
    vdot: null,
    source: 'insufficient',
    confidence: 'none',
    thresholdPaceSec: null,
    easyPaceSec: null,
    easyPaceRangeSec: null,
    marathonPaceSec: null,
    intervalPaceSec: null,
    basis: null
  }
}

function buildPaceModel(
  vdot: number,
  source: PaceSource,
  confidence: PaceConfidence,
  basis: string
): PaceModel {
  const paces = pacesFromVdot(vdot)
  return { vdot, source, confidence, basis, ...paces }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// 초 → "m:ss" 또는 "h:mm:ss"
export function formatClock(totalSec: number): string {
  const s = Math.round(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// 페이스 sec/km → "m:ss/km" (표기 통일 2026-07-04 — 구간은 formatPaceRangeSec 로 앞쪽 단위 생략)
export function formatPaceSec(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '-'
  return `${formatPaceClock(secPerKm)}/km`
}

/** 페이스 구간 → "5:30~6:30/km" (앞쪽 단위 생략 — 표기 규칙). 한쪽이라도 무효면 '-'. */
export function formatPaceRangeSec(fromSecPerKm: number | null, toSecPerKm: number | null): string {
  if (
    fromSecPerKm === null || toSecPerKm === null ||
    !Number.isFinite(fromSecPerKm) || !Number.isFinite(toSecPerKm) ||
    fromSecPerKm <= 0 || toSecPerKm <= 0
  ) {
    return '-'
  }
  return `${formatPaceClock(fromSecPerKm)}~${formatPaceClock(toSecPerKm)}/km`
}

function formatPaceClock(secPerKm: number): string {
  const total = Math.round(secPerKm)
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
