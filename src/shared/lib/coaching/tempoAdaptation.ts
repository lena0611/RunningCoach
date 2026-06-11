import type { RunLog } from '@/entities/run/model'
import { getActiveInjuryItem, type TrainingMemory } from '@/entities/training-memory/model'
import { deriveHeartRateModel, deriveObservedMaxHr, type HeartRateModelSource } from '@/shared/lib/heartRateZones'
import { evaluateLapDrift } from '@/shared/lib/lapDrift'

/**
 * Tempo 심박 상한 적응형 보정 (#301, running-coaching-standards §개인화 진화 / ai-coaching-goal §적응형 알고리즘 기억).
 *
 * 원칙: `heartRateZones.ts`의 Tanaka+HRR 추정(base)은 안전 기본값으로 유지하고, 그 위에
 *   "추정 → 검증 → 적응" 보정을 얹는다. 모두 run_logs 파생·결정적 계산(저장 없음).
 *   - 상향만(과소추정 교정). base 미만으로 내리지 않는다. 하향은 코치 서술·수동.
 *   - 단일 세션으로 크게 바꾸지 않는다: 최근 Tempo 중 검증 세션 2회→후보(관찰), 3회 이상→고신뢰 자동 적용(+1 step).
 *   - 부상 활성 시 상향 게이트 차단.
 */

export type TempoGrade = 'A' | 'B' | 'C' | 'D'
export type TempoCeilingSource = 'estimate' | 'adapted'
export type TempoCeilingConfidence = 'low' | 'medium' | 'high'

export type TempoGradeResult = {
  /** A 처방 완전 준수 / B 자극 확보+경계 일부 초과 / C 경계 크게·반복 초과 / D 세션 목적 실패. */
  grade: TempoGrade
  /** 템포다운 자극을 확보했는가(실제 품질 세션이었는가). */
  stimulus: boolean
  /** 상한 대비 최대심박 초과 bpm(양수=초과). 상한·심박 없으면 null. */
  overBpm: number | null
  /** 후반 급락/심박 드리프트 주의(level>=2). */
  lateFade: boolean
  reasons: string[]
}

export type TempoCeilingAdaptation = {
  baseCeilingBpm: number | null
  /** 평가·코칭에 쓰는 현재 상한. 고신뢰 검증 시 base+step, 아니면 base. base 미만 불가. */
  effectiveCeilingBpm: number | null
  /** 상향 후보(관찰 중). 없으면 null. */
  candidateCeilingBpm: number | null
  source: TempoCeilingSource
  confidence: TempoCeilingConfidence
  /** 검증(상향 자격) 통과한 최근 Tempo 수. */
  qualifyingCount: number
  /** 분석에 쓴 최근 Tempo 세션 수. */
  sampleCount: number
  rationale: string
}

// 등급 경계
const MINOR_OVER_BPM = 10 // 이 이하 초과 + 후반 안정이면 B(자극 확보·경계 일부 초과)
// 적응
const RECENT_TEMPO_LIMIT = 5
const RAISE_STEP_BPM = 2
const CANDIDATE_COUNT = 2 // 검증 2회 → 상향 후보(관찰)
const CONFIRM_COUNT = 3 // 검증 3회 이상 → 고신뢰 자동 적용
const RPE_MAX_FOR_RAISE = 6

/**
 * 한 Tempo 세션을 effective 상한 기준으로 A/B/C/D 등급화한다.
 * fadeLevel 은 evaluateLapDrift(run).level(0~3). ceilingBpm null이면 상한 판정 없이 자극/후반만 본다.
 */
export function gradeTempoRun(run: RunLog, ceilingBpm: number | null, fadeLevel: number): TempoGradeResult {
  const maxHr = run.maxHeartRate
  const avgHr = run.avgHeartRate
  const rpe = run.rpe
  const overBpm = ceilingBpm !== null && maxHr !== null ? maxHr - ceilingBpm : null
  const lateFade = fadeLevel >= 2

  // 자극 부족(D)은 "데이터 없음"이 아니라 "쉬웠다는 적극적 증거"가 있을 때만 판정한다(Tempo는 기본 자극 인정).
  const clearlyEasy =
    (rpe !== null && rpe <= 3) ||
    (overBpm !== null && overBpm < -20) ||
    (ceilingBpm !== null && maxHr === null && avgHr !== null && avgHr < ceilingBpm - 30)
  const stimulus = !clearlyEasy

  const reasons: string[] = []
  if (!stimulus) {
    reasons.push('자극 부족(목표 강도 미도달)')
    return { grade: 'D', stimulus: false, overBpm, lateFade, reasons }
  }

  const hrOk = overBpm !== null && overBpm <= 0
  const minorOver = overBpm !== null && overBpm > 0 && overBpm <= MINOR_OVER_BPM
  const bigOver = overBpm !== null && overBpm > MINOR_OVER_BPM

  if (overBpm !== null && overBpm > 0) reasons.push(`상한 ${overBpm}bpm 초과`)
  if (lateFade) reasons.push('후반 드리프트')

  let grade: TempoGrade
  if (bigOver || (lateFade && overBpm !== null && overBpm > 0)) {
    grade = 'C'
  } else if (hrOk && !lateFade) {
    grade = 'A'
  } else {
    // 경미 초과, 또는 상한 준수했지만 후반 흔들림, 또는 상한 미상(B로 보수 판정)
    grade = 'B'
  }
  if (grade === 'A') reasons.push('처방 완전 준수')
  return { grade, stimulus: true, overBpm, lateFade, reasons: minorOver && !reasons.length ? ['경계 일부 초과'] : reasons }
}

type TempoSessionSignal = {
  date: string
  maxHeartRate: number | null
  rpe: number | null
  fadeLevel: number
  recoveryOk: boolean
}

function nextRunRecoveryOk(run: RunLog, sortedAsc: RunLog[]): boolean | null {
  const next = sortedAsc.find((item) => item.date > run.date)
  if (!next) return null // 다음 기록이 아직 없음 → 회복 미관측
  if (next.painNote.trim()) return false
  if ((next.rpe ?? 0) >= 7) return false
  if ((next.conditionScore ?? 5) <= 2) return false
  return true
}

/** 최근 Tempo 수행으로 상한 적응 상태를 결정적으로 산출한다(상향만, base 미만 불가). */
export function computeTempoCeilingAdaptation(
  runs: RunLog[],
  baseCeilingBpm: number | null,
  opts: { injuryActive?: boolean } = {}
): TempoCeilingAdaptation {
  const none = (rationale: string): TempoCeilingAdaptation => ({
    baseCeilingBpm,
    effectiveCeilingBpm: baseCeilingBpm,
    candidateCeilingBpm: null,
    source: 'estimate',
    confidence: 'low',
    qualifyingCount: 0,
    sampleCount: 0,
    rationale
  })

  if (baseCeilingBpm === null) return none('심박 상한 미설정(나이/심박 입력 필요) — 적응 보류.')

  const sortedAsc = [...runs].sort((a, b) => a.date.localeCompare(b.date))
  const recentTempo = sortedAsc
    .filter((run) => run.type === 'Tempo')
    .slice(-RECENT_TEMPO_LIMIT)

  const sampleCount = recentTempo.length
  if (opts.injuryActive) {
    return {
      ...none('부상 활성 — 상향 게이트 차단. 회복 후 재평가.'),
      sampleCount
    }
  }
  if (!sampleCount) return none('최근 Tempo 기록 없음 — 추정 상한 유지.')

  const signals: TempoSessionSignal[] = recentTempo.map((run) => ({
    date: run.date,
    maxHeartRate: run.maxHeartRate,
    rpe: run.rpe,
    fadeLevel: evaluateLapDrift(run).level,
    recoveryOk: nextRunRecoveryOk(run, sortedAsc) === true
  }))

  // 상향 검증 자격: 상한 초과 + RPE<=6(기록 있음) + 후반 안정 + 다음날 회복 양호.
  const qualifying = signals.filter(
    (s) =>
      s.maxHeartRate !== null &&
      s.maxHeartRate > baseCeilingBpm &&
      s.rpe !== null &&
      s.rpe <= RPE_MAX_FOR_RAISE &&
      s.fadeLevel < 2 &&
      s.recoveryOk
  )
  const qualifyingCount = qualifying.length

  // 적응 상한은 step만큼만 올리되, 실제로 입증된 최대심박을 넘지 않는다(보수적 단일 step).
  const demonstratedMax = qualifying.reduce((max, s) => Math.max(max, s.maxHeartRate ?? 0), 0)
  const raiseTarget = Math.min(baseCeilingBpm + RAISE_STEP_BPM, demonstratedMax || baseCeilingBpm + RAISE_STEP_BPM)

  if (qualifyingCount >= CONFIRM_COUNT) {
    return {
      baseCeilingBpm,
      effectiveCeilingBpm: raiseTarget,
      candidateCeilingBpm: null,
      source: 'adapted',
      confidence: 'high',
      qualifyingCount,
      sampleCount,
      rationale: `최근 Tempo ${qualifyingCount}회가 상한 초과에도 RPE 낮고 후반 안정·회복 양호 — 상한을 ${baseCeilingBpm}→${raiseTarget}bpm로 상향 적용.`
    }
  }
  if (qualifyingCount === CANDIDATE_COUNT) {
    return {
      baseCeilingBpm,
      effectiveCeilingBpm: baseCeilingBpm,
      candidateCeilingBpm: raiseTarget,
      source: 'estimate',
      confidence: 'medium',
      qualifyingCount,
      sampleCount,
      rationale: `최근 Tempo ${qualifyingCount}회가 상향 조건을 충족 — ${raiseTarget}bpm 상향 후보로 관찰 중(1회 더 확인되면 적용).`
    }
  }
  return {
    baseCeilingBpm,
    effectiveCeilingBpm: baseCeilingBpm,
    candidateCeilingBpm: null,
    source: 'estimate',
    confidence: 'low',
    qualifyingCount,
    sampleCount,
    rationale: '아직 상향 근거가 충분치 않음 — 추정 상한 유지.'
  }
}

export const HEART_RATE_CONFIDENCE_LABEL: Record<TempoCeilingConfidence, string> = {
  low: '낮음',
  medium: '관찰 중',
  high: '높음'
}

/** UI 신뢰도 표시용 출처 라벨. adapted면 "최근 템포 N회 분석", 아니면 base source 라벨에 위임. */
export function tempoCeilingSourceLabel(
  adaptation: TempoCeilingAdaptation,
  baseSourceLabel: string
): string {
  if (adaptation.source === 'adapted') return `최근 템포 ${adaptation.qualifyingCount}회 분석`
  return baseSourceLabel
}

export type TempoCoachingSummary = {
  baseCeilingBpm: number | null
  effectiveCeilingBpm: number | null
  candidateCeilingBpm: number | null
  source: TempoCeilingSource
  confidence: TempoCeilingConfidence
  rationale: string
  /** base 추정 출처(coach가 추정/직접입력 단정 수위를 조절하도록). */
  baseSource: HeartRateModelSource
}

/**
 * coach-run 주입용 컴팩트 요약(client-summary 패턴). 웹이 전체 run으로 산출해 보낸다 —
 * 서버가 Tempo 분석을 재구현하지 않게(미러 이중유지 회피).
 */
export function summarizeTempoCoaching(runs: RunLog[], memory: TrainingMemory): TempoCoachingSummary {
  const observed = deriveObservedMaxHr(runs.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })))
  const hr = deriveHeartRateModel(memory.athleteProfile, new Date().getFullYear(), observed)
  const adaptation = computeTempoCeilingAdaptation(runs, hr.tempoCeilingBpm, {
    injuryActive: Boolean(getActiveInjuryItem(memory))
  })
  return {
    baseCeilingBpm: adaptation.baseCeilingBpm,
    effectiveCeilingBpm: adaptation.effectiveCeilingBpm,
    candidateCeilingBpm: adaptation.candidateCeilingBpm,
    source: adaptation.source,
    confidence: adaptation.confidence,
    rationale: adaptation.rationale,
    baseSource: hr.source
  }
}
