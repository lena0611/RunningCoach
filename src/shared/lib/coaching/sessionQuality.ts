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

export type LsdKind = 'recovery' | 'standard' | 'progressive'

export type LsdEvaluation = {
  /** Recovery LSD(아주 편한 회복 롱런) / Standard LSD / Progressive LSD(후반 페이스업). */
  kind: LsdKind
  durationMin: number | null
  rpe: number | null
  /** 전→후반 심박 드리프트(bpm). */
  hrDriftBpm: number | null
  /** 후반 페이스 변화(초/km, 음수=빨라짐). */
  paceDeltaSec: number | null
  /** 후반까지 "오래 편하게"가 유지됐는가(부담 신호 없음). */
  stable: boolean
  reasons: string[]
}

const LSD_PROGRESSIVE_PACE_GAIN = 8 // 후반 8s/km 이상 빨라지면 progressive
const LSD_RECOVERY_RPE = 3
const LSD_STRAIN_DRIFT = 12

/**
 * LSD 세션을 "오래 편하게" 관점으로 복합 평가하고 세분화한다(#354 §5).
 * 평균 심박 단독이 아니라 지속시간·RPE·심박 드리프트·페이스 안정성을 함께 본다.
 */
export function evaluateLsd(
  run: RunLog,
  opts: { easyCeilingBpm?: number | null; recoveryCeilingBpm?: number | null } = {}
): LsdEvaluation {
  const { firstHr, secondHr, firstPaceSec, secondPaceSec } = splitHalves(run)
  const hrDriftBpm = firstHr !== null && secondHr !== null ? Math.round(secondHr - firstHr) : null
  const paceDeltaSec = firstPaceSec !== null && secondPaceSec !== null ? Math.round(secondPaceSec - firstPaceSec) : null
  const paceGainSec = paceDeltaSec === null ? null : -paceDeltaSec
  const durationMin = run.durationSec !== null && run.durationSec > 0 ? Math.round(run.durationSec / 60) : null
  const rpe = run.rpe
  const avgHr = run.avgHeartRate

  const lowEffort =
    (rpe !== null && rpe <= LSD_RECOVERY_RPE) ||
    (typeof opts.recoveryCeilingBpm === 'number' && avgHr !== null && avgHr <= opts.recoveryCeilingBpm) ||
    (typeof opts.easyCeilingBpm === 'number' && avgHr !== null && avgHr <= opts.easyCeilingBpm - 8)

  let kind: LsdKind
  if (paceGainSec !== null && paceGainSec >= LSD_PROGRESSIVE_PACE_GAIN) kind = 'progressive'
  else if (lowEffort) kind = 'recovery'
  else kind = 'standard'

  // "오래 편하게": 심박 드리프트가 과하지 않으면 안정. progressive는 의도된 페이스업이라 드리프트 허용폭을 조금 넓게.
  const driftCap = kind === 'progressive' ? LSD_STRAIN_DRIFT + 3 : LSD_STRAIN_DRIFT
  const stable = hrDriftBpm === null ? true : hrDriftBpm < driftCap

  const reasons: string[] = []
  if (kind === 'recovery') reasons.push('낮은 강도(RPE/심박) — 회복형 LSD')
  else if (kind === 'progressive') reasons.push(`후반 ${paceGainSec}s/km 페이스업 — 프로그레시브 LSD`)
  else reasons.push('편안한 지속주 — 스탠다드 LSD')
  if (durationMin !== null) reasons.push(`지속 ${durationMin}분`)
  if (!stable && hrDriftBpm !== null) reasons.push(`후반 심박 드리프트 ${hrDriftBpm}bpm — 다음엔 초반을 더 눌러도 좋음`)

  return { kind, durationMin, rpe, hrDriftBpm, paceDeltaSec, stable, reasons }
}

export const LSD_KIND_LABEL: Record<LsdKind, string> = {
  recovery: 'Recovery LSD',
  standard: 'Standard LSD',
  progressive: 'Progressive LSD'
}

export type EasyRecoveryEvaluation = {
  /** 의도한 Easy/Recovery 강도를 유지했는가(우선순위: RPE > (호흡, 미수집) > 심박 > 페이스). */
  intentHeld: boolean
  /** 심박 상한 초과 bpm(양수=초과). 상한/심박 없으면 null. */
  overByBpm: number | null
  /** RPE가 낮아 심박 소폭 초과를 회복/이지 유지로 인정했는가. */
  rpeOverride: boolean
  reasons: string[]
}

// Easy/Recovery 모두 평균심박 +margin 까지 허용. Recovery 상한(Z1)이 Easy 상한(Z2)보다 이미 한 존 낮아
// 보수성이 충분하므로, margin 0(1bpm 초과로 즉시 처벌)이 아니라 약간의 여유를 둔다(cardiac drift·HR lag 흡수).
const EASY_OVER_MARGIN = 5
const RECOVERY_OVER_MARGIN = 4
const RECOVERY_RPE_LOW = 3
const EASY_RPE_LOW = 4
// RPE가 낮아도 이만큼 넘으면 데이터 불일치로 보고 override하지 않는다.
const RPE_OVERRIDE_CAP_BPM = 15

/**
 * Easy/Recovery 강도 유지 판정 (#354 §2).
 * 심박 상한 초과를 곧바로 실패로 보지 않고 RPE를 우선한다(RPE > 호흡 > 심박 > 페이스).
 * 호흡 데이터는 현재 미수집이라 RPE → 심박 → 페이스 순으로 적용한다.
 */
export function evaluateEasyRecovery(
  run: RunLog,
  opts: { ceilingBpm: number | null; isRecovery: boolean; hasStrides?: boolean }
): EasyRecoveryEvaluation {
  const reasons: string[] = []
  // Easy·Recovery·Easy+Strides 모두 평균심박으로 본런 강도를 판정한다(#402 정합성 감사).
  // 최고심박 단발 스파이크(언덕·신호·스트라이드 가속)는 이지의 "지속 강도"가 아니라 처벌하지 않는다 —
  // 브리핑(RPE 우선·살짝 넘어도 OK)·표준문서(평균 1차)와 정렬. 진짜 과강 Easy는 평균이 상한+margin을 넘어 잡힌다.
  const effectiveHr = run.avgHeartRate ?? run.maxHeartRate ?? null
  const margin = opts.isRecovery ? RECOVERY_OVER_MARGIN : EASY_OVER_MARGIN
  const overByBpm = opts.ceilingBpm !== null && effectiveHr !== null ? effectiveHr - opts.ceilingBpm : null
  const over = overByBpm !== null && overByBpm > margin

  const rpeLowThreshold = opts.isRecovery ? RECOVERY_RPE_LOW : EASY_RPE_LOW
  const rpeLow = run.rpe !== null && run.rpe <= rpeLowThreshold

  if (!over) {
    reasons.push(
      opts.hasStrides
        ? '본런 Easy 심박 범위 유지 — 스트라이드 가속·심박 상승은 의도된 정상'
        : opts.isRecovery
          ? '심박 회복 범위 유지'
          : 'Easy 심박 범위 유지'
    )
    return { intentHeld: true, overByBpm, rpeOverride: false, reasons }
  }

  // 초과했지만 RPE가 낮고, 초과 폭이 과하지 않으면 RPE를 우선해 유지로 본다.
  const withinOverrideCap = overByBpm !== null && overByBpm <= RPE_OVERRIDE_CAP_BPM
  if (rpeLow && withinOverrideCap) {
    reasons.push(`심박이 ${overByBpm}bpm 올랐지만 RPE ${run.rpe} — 체감상 ${opts.isRecovery ? '회복' : 'Easy'} 강도 유지로 본다`)
    return { intentHeld: true, overByBpm, rpeOverride: true, reasons }
  }

  reasons.push(
    run.rpe === null
      ? `심박이 상한을 ${overByBpm}bpm 초과(RPE 미입력) — 다음엔 조금 더 눌러도 좋다`
      : `심박 ${overByBpm}bpm 초과 + RPE ${run.rpe} — 의도보다 강도가 올라갔다`
  )
  return { intentHeld: false, overByBpm, rpeOverride: false, reasons }
}

/** coach-run 주입용 선택 세션 증거(#354). 규칙은 다단계 등급/보정 지표만 주고 AI가 최종 해석한다. */
export type CoachSessionEvidence = {
  runType: string
  steadyLong?: {
    grade: SteadyLongGrade
    rawHrDrift: number | null
    adjustedHrDrift: number | null
    paceDeltaSec: number | null
    efficiencyScore: number | null
  }
  lsd?: { kind: LsdKind; hrDriftBpm: number | null; paceDeltaSec: number | null; durationMin: number | null; stable: boolean }
  easyRecovery?: { intentHeld: boolean; overByBpm: number | null; rpeOverride: boolean }
  reasons: string[]
}

/**
 * 선택 세션의 타입별 품질 증거를 coach-run 주입용 컴팩트 객체로 만든다(#354).
 * Tempo는 기존 tempoCoaching 경로가 담당하므로 여기선 다루지 않는다.
 */
export function buildCoachSessionEvidence(
  run: RunLog,
  opts: { easyCeilingBpm?: number | null; recoveryCeilingBpm?: number | null } = {}
): CoachSessionEvidence {
  if (run.type === 'Steady Long') {
    const sl = evaluateSteadyLong(run)
    return {
      runType: run.type,
      steadyLong: {
        grade: sl.grade,
        rawHrDrift: sl.rawHrDrift,
        adjustedHrDrift: sl.adjustedHrDrift,
        paceDeltaSec: sl.paceDeltaSec,
        efficiencyScore: sl.efficiencyScore
      },
      reasons: sl.reasons
    }
  }
  if (run.type === 'LSD') {
    const lsd = evaluateLsd(run, opts)
    return {
      runType: run.type,
      lsd: { kind: lsd.kind, hrDriftBpm: lsd.hrDriftBpm, paceDeltaSec: lsd.paceDeltaSec, durationMin: lsd.durationMin, stable: lsd.stable },
      reasons: lsd.reasons
    }
  }
  if (run.type === 'Easy' || run.type === 'Recovery' || run.type === 'Easy + Strides') {
    const isRecovery = run.type === 'Recovery'
    const hasStrides = run.type === 'Easy + Strides'
    const er = evaluateEasyRecovery(run, {
      ceilingBpm: isRecovery ? opts.recoveryCeilingBpm ?? null : opts.easyCeilingBpm ?? null,
      isRecovery,
      hasStrides
    })
    // 스트라이드 세션은 AI가 가속 구간 심박을 강도 초과로 오판하지 않도록 컨텍스트를 함께 준다.
    const reasons = hasStrides
      ? ['스트라이드는 속도 기준 신경근 자극이라 그 구간 심박 상승은 의도된 정상(이지 심박 상한과 무관) — 본런 Easy 유지 여부로 판정한다', ...er.reasons]
      : er.reasons
    return {
      runType: run.type,
      easyRecovery: { intentHeld: er.intentHeld, overByBpm: er.overByBpm, rpeOverride: er.rpeOverride },
      reasons
    }
  }
  return { runType: run.type, reasons: [] }
}
