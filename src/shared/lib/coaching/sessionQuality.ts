import type { Lap, RunLog } from '@/entities/run/model'

/**
 * 세션 분석 고도화 (#354) — "규칙=증거" 신호 함수.
 * 규칙 엔진이 단순 pass/fail을 내지 않고, 다단계 등급 + 보정 지표(evidence)를 산출한다.
 * AI(coach-run)가 이 증거 위에 맥락(목표·부상·날씨·성향)을 얹어 최종 해석한다.
 */

type HalfSplit = {
  firstHr: number | null
  secondHr: number | null
  firstPaceSec: number | null
  secondPaceSec: number | null
}

function averageNullable(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!valid.length) return null
  return valid.reduce((sum, v) => sum + v, 0) / valid.length
}

function weightedPace(laps: Lap[]): number | null {
  const paceLaps = laps.filter((lap) => lap.paceSec !== null && lap.paceSec !== undefined)
  if (!paceLaps.length) return null
  const distance = paceLaps.reduce((sum, lap) => sum + (lap.distanceKm ?? 0), 0)
  if (distance > 0) {
    return paceLaps.reduce((sum, lap) => sum + (lap.paceSec ?? 0) * (lap.distanceKm ?? 0), 0) / distance
  }
  return averageNullable(paceLaps.map((lap) => lap.paceSec))
}

/** 랩을 전/후반으로 나눠 평균 심박·가중 페이스를 산출한다. 유효 랩 2개 미만이면 모두 null. */
function splitHalves(run: RunLog): HalfSplit {
  const laps = run.laps.filter((lap) => lap.avgHeartRate && lap.paceSec)
  if (laps.length < 2) return { firstHr: null, secondHr: null, firstPaceSec: null, secondPaceSec: null }
  const mid = Math.ceil(laps.length / 2)
  const first = laps.slice(0, mid)
  const second = laps.slice(mid)
  return {
    firstHr: averageNullable(first.map((l) => l.avgHeartRate)),
    secondHr: averageNullable(second.map((l) => l.avgHeartRate)),
    firstPaceSec: weightedPace(first),
    secondPaceSec: weightedPace(second)
  }
}

export type SteadyLongGrade = 'quality' | 'aggressive' | 'strained' | 'failed' | 'insufficient'

export type SteadyLongEvaluation = {
  grade: SteadyLongGrade
  /** 전→후반 평균심박 차(bpm). 양수=후반 상승. */
  rawHrDrift: number | null
  /** 후반 가속분을 보정한 심박 드리프트(bpm). 네거티브 스플릿이면 raw보다 작아진다. */
  adjustedHrDrift: number | null
  /** 후반 페이스 변화(초/km). 양수=후반 느려짐, 음수=후반 빨라짐(네거티브 스플릿). */
  paceDeltaSec: number | null
  /** 후반에 빨라진 정도(초/km). 양수=네거티브 스플릿. */
  paceGainSec: number | null
  /** 0~100. 높을수록 효율적(낮은 보정 드리프트로 페이스 유지/향상). */
  efficiencyScore: number | null
  reasons: string[]
}

// 빨라진 1초/km당 정상적으로 오르는 심박 보정량(대략).
const HR_PER_PACE_SEC = 0.4
const STRAINED_ADJUSTED_DRIFT = 12
const QUALITY_ADJUSTED_DRIFT = 8
const QUALITY_PACE_SLOWDOWN = 10
const AGGRESSIVE_PACE_GAIN = 10
const BLOWUP_PACE_SLOWDOWN = 18
const BLOWUP_RAW_DRIFT = 10

/**
 * Steady Long 세션을 다단계로 평가한다(#354 §6).
 * 핵심: 전후반 심박차를 그대로 드리프트로 보지 않고, 후반 가속(네거티브 스플릿)을 보정한다.
 */
export function evaluateSteadyLong(run: RunLog): SteadyLongEvaluation {
  const { firstHr, secondHr, firstPaceSec, secondPaceSec } = splitHalves(run)
  if (firstHr === null || secondHr === null || firstPaceSec === null || secondPaceSec === null) {
    return {
      grade: 'insufficient',
      rawHrDrift: null,
      adjustedHrDrift: null,
      paceDeltaSec: null,
      paceGainSec: null,
      efficiencyScore: null,
      reasons: ['랩 데이터 부족 — 후반 안정성 판정 보류']
    }
  }

  const rawHrDrift = Math.round(secondHr - firstHr)
  const paceDeltaSec = Math.round(secondPaceSec - firstPaceSec)
  const paceGainSec = -paceDeltaSec
  // 후반에 빨라졌으면 그만큼 심박 상승은 정상 → 보정해서 깐다. 느려졌는데 오른 심박은 보정하지 않는다.
  const adjustedHrDrift = Math.round(rawHrDrift - Math.max(0, paceGainSec) * HR_PER_PACE_SEC)
  const efficiencyScore = Math.max(
    0,
    Math.min(100, Math.round(70 + Math.max(-30, Math.min(30, paceGainSec)) * 0.7 - Math.max(0, adjustedHrDrift) * 3))
  )

  const blewUp = paceDeltaSec >= BLOWUP_PACE_SLOWDOWN && rawHrDrift >= BLOWUP_RAW_DRIFT
  let grade: SteadyLongGrade
  const reasons: string[] = []

  if (blewUp) {
    grade = 'failed'
    reasons.push(`후반 ${paceDeltaSec}s/km 급락 + 심박 ${rawHrDrift}bpm 상승 — 후반 무너짐`)
  } else if (adjustedHrDrift >= STRAINED_ADJUSTED_DRIFT || paceDeltaSec >= 12) {
    grade = 'strained'
    reasons.push(`보정 드리프트 ${adjustedHrDrift}bpm — 후반 부담이 컸음`)
  } else if (paceGainSec >= AGGRESSIVE_PACE_GAIN && adjustedHrDrift >= 6) {
    grade = 'aggressive'
    reasons.push(`후반 ${paceGainSec}s/km 가속(네거티브 스플릿) — 강하게 밀어붙임`)
  } else if (adjustedHrDrift <= QUALITY_ADJUSTED_DRIFT && paceDeltaSec <= QUALITY_PACE_SLOWDOWN) {
    grade = 'quality'
    reasons.push(
      paceGainSec > 0
        ? `후반 ${paceGainSec}s/km 가속에도 보정 드리프트 ${adjustedHrDrift}bpm — 잘 통제된 네거티브 스플릿`
        : `보정 드리프트 ${adjustedHrDrift}bpm — 후반까지 안정 유지`
    )
  } else {
    grade = 'strained'
    reasons.push(`보정 드리프트 ${adjustedHrDrift}bpm — 후반 흔들림`)
  }

  return { grade, rawHrDrift, adjustedHrDrift, paceDeltaSec, paceGainSec, efficiencyScore, reasons }
}

export const STEADY_LONG_GRADE_LABEL: Record<SteadyLongGrade, string> = {
  quality: 'Quality Steady Long',
  aggressive: 'Aggressive Steady Long',
  strained: 'Strained Steady Long',
  failed: 'Failed Long Run',
  insufficient: '판정 보류'
}
