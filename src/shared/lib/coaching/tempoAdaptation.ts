import type { RunLog } from '@/entities/run/model'
import { getActiveInjuryItem, type TrainingMemory } from '@/entities/training-memory/model'
import { deriveHeartRateModel, deriveObservedMaxHr, type HeartRateModelSource } from '@/shared/lib/heartRateZones'
import { evaluateLapDrift } from '@/shared/lib/lapDrift'

/**
 * Tempo 심박 상한 적응형 보정 (#301, running-coaching-standards §개인화 진화 / ai-coaching-goal §적응형 알고리즘 기억).
 *
 * 원칙: `heartRateZones.ts`의 Tanaka+HRR 추정(base)은 안전 기본값으로 유지하고, 그 위에
 *   "추정 → 검증 → 적응" 보정을 얹는다. 등급화는 run_logs 파생·결정적 계산이고,
 *   채택된 적응 상한은 `adaptiveTrainingProfile.tempoCeiling`에 영속한다(doc 계약: 진화는 메모리 갱신).
 *   - 상향만(과소추정 교정). base 미만으로 내리지 않는다. 하향은 코치 서술·수동.
 *   - 검증 세션 2회→후보(관찰), 3회 이상→고신뢰 자동 채택(현재 상한 +step). 채택값은 sticky.
 *   - 다단계 래칫: 채택값(currentFloor)을 기준으로 재검증해 158→160→162…로 단계적 상향.
 *   - 부상 활성 시 상향 게이트 차단(채택값은 유지).
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
  /** 평가·코칭에 쓰는 현재 상한(=채택값 또는 base, 검증 시 +step). base 미만 불가. */
  effectiveCeilingBpm: number | null
  /** 상향 후보(관찰 중). 없으면 null. */
  candidateCeilingBpm: number | null
  /** 영속 계층이 채택해야 할 상한(검증 통과 시 effective와 동일, 아니면 기존 채택값). */
  proposedAdoptedCeilingBpm: number | null
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
// 안전망: 적응 상한은 추정 base 대비 최대 이만큼만 올린다(클라이언트 산출 채택값의 폭주·변조 방지).
export const MAX_TOTAL_RAISE_BPM = 12
const RAISE_STEP_BPM = 2
const CANDIDATE_COUNT = 2 // 검증 2회 → 상향 후보(관찰)
const CONFIRM_COUNT = 3 // 검증 3회 이상 → 고신뢰 자동 채택
const RPE_MAX_FOR_RAISE = 6
const RECOVERY_WINDOW_DAYS = 5 // 회복으로 인정하는 다음 런 최대 간격(강세션은 4일+ 휴식이 흔하므로 5일까지 인정)
// 지속 자극 게이트: 평균심박이 현재 상한 −이 값 이상이어야 "유지된 템포"로 본다(이지런 1bpm blip·스파이크 배제).
const SUSTAINED_AVG_MARGIN_BPM = 20

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
  // 최대심박이 상한을 넘었다면 낮은 평균과 무관하게 강한 자극이 있었던 것으로 본다(인터벌형 등).
  const maxBelowCeiling = ceilingBpm === null || maxHr === null || maxHr <= ceilingBpm
  const clearlyEasy =
    (rpe !== null && rpe <= 3) ||
    (overBpm !== null && overBpm < -20) ||
    (ceilingBpm !== null && avgHr !== null && avgHr < ceilingBpm - 30 && maxBelowCeiling)
  if (clearlyEasy) {
    return { grade: 'D', stimulus: false, overBpm, lateFade, reasons: ['자극 부족(목표 강도 미도달)'] }
  }

  const hrOk = overBpm !== null && overBpm <= 0
  const bigOver = overBpm !== null && overBpm > MINOR_OVER_BPM

  let grade: TempoGrade
  if (bigOver || (lateFade && overBpm !== null && overBpm > 0)) {
    grade = 'C'
  } else if (hrOk && !lateFade) {
    grade = 'A'
  } else {
    // 경미 초과(≤10), 또는 상한 준수했지만 후반 흔들림, 또는 상한 미상(B로 보수 판정)
    grade = 'B'
  }

  // 등급에 맞춘 사유. '상한' 토큰은 Quality Lens '심박 초과' 카드 집계에 쓰이므로 초과 시 유지한다.
  const reasons: string[] = []
  if (grade === 'A') {
    reasons.push('처방 완전 준수')
  } else if (grade === 'B') {
    if (overBpm !== null && overBpm > 0) reasons.push(`상한 ${overBpm}bpm 초과(경계)`)
    else if (lateFade) reasons.push('후반 드리프트(상한은 준수)')
    else reasons.push('자극 확보')
  } else {
    // C
    if (overBpm !== null && overBpm > 0) reasons.push(`상한 ${overBpm}bpm 초과`)
    if (lateFade) reasons.push('후반 드리프트')
  }
  return { grade, stimulus: true, overBpm, lateFade, reasons }
}


const MS_PER_DAY = 86400000

function dayIndex(date: string): number | null {
  const t = Date.parse(`${(date ?? '').slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / MS_PER_DAY) : null
}

/** 다음날(최대 RECOVERY_WINDOW_DAYS 이내) 회복이 양호했는가. 다음 기록이 없거나 너무 멀면 null(미관측). */
function nextRunRecoveryOk(run: RunLog, sortedAsc: RunLog[]): boolean | null {
  const next = sortedAsc.find((item) => item.date > run.date)
  if (!next) return null
  const gap = dayIndex(next.date)
  const here = dayIndex(run.date)
  // 다음 기록이 회복 관찰 창을 벗어나면(예: 몇 주 뒤) 회복 근거로 쓰지 않는다.
  if (gap !== null && here !== null && gap - here > RECOVERY_WINDOW_DAYS) return null
  if (next.painNote.trim()) return false
  if ((next.rpe ?? 0) >= 7) return false
  if ((next.conditionScore ?? 5) <= 2) return false
  return true
}

/**
 * 최근 Tempo 수행으로 상한 적응 상태를 결정적으로 산출한다(상향만, base 미만 불가).
 * opts.adoptedCeilingBpm: 이미 채택·영속된 상한. 이를 currentFloor로 삼아 재검증하면 다단계 상향이 된다.
 */
export function computeTempoCeilingAdaptation(
  runs: RunLog[],
  baseCeilingBpm: number | null,
  opts: { injuryActive?: boolean; adoptedCeilingBpm?: number | null } = {}
): TempoCeilingAdaptation {
  const adopted = typeof opts.adoptedCeilingBpm === 'number' ? opts.adoptedCeilingBpm : null

  if (baseCeilingBpm === null) {
    return {
      baseCeilingBpm: null, effectiveCeilingBpm: null, candidateCeilingBpm: null, proposedAdoptedCeilingBpm: adopted,
      source: 'estimate', confidence: 'low', qualifyingCount: 0, sampleCount: 0,
      rationale: '심박 상한 미설정(나이/심박 입력 필요) — 적응 보류.'
    }
  }

  // 채택값은 sticky하되 base 미만으로 내려가지 않고(상향만), base+MAX_TOTAL_RAISE_BPM를 넘지도 않는다
  // (스티키 채택값의 폭주·변조 안전망). 추가 상향은 이 floor 기준으로 검증한다.
  const raiseCap = baseCeilingBpm + MAX_TOTAL_RAISE_BPM
  const currentFloor = Math.min(Math.max(baseCeilingBpm, adopted ?? baseCeilingBpm), raiseCap)
  const onAdapted = currentFloor > baseCeilingBpm

  const sortedAsc = [...runs].sort((a, b) => a.date.localeCompare(b.date))
  const recentTempo = sortedAsc.filter((run) => run.type === 'Tempo').slice(-RECENT_TEMPO_LIMIT)
  const sampleCount = recentTempo.length

  const settle = (over: Partial<TempoCeilingAdaptation>, rationale: string): TempoCeilingAdaptation => ({
    baseCeilingBpm,
    effectiveCeilingBpm: currentFloor,
    candidateCeilingBpm: null,
    proposedAdoptedCeilingBpm: adopted,
    source: onAdapted ? 'adapted' : 'estimate',
    confidence: onAdapted ? 'high' : 'low',
    qualifyingCount: 0,
    sampleCount,
    rationale,
    ...over
  })

  if (opts.injuryActive) return settle({}, '부상 활성 — 상향 게이트 차단. 채택된 상한은 유지, 회복 후 재평가.')
  if (!sampleCount) return settle({}, '최근 Tempo 기록 없음 — 현재 상한 유지.')

  const signals = recentTempo.map((run) => ({
    run,
    grade: gradeTempoRun(run, currentFloor, evaluateLapDrift(run).level),
    recoveryOk: nextRunRecoveryOk(run, sortedAsc) === true
  }))

  // 상향 검증 자격(완화 + 노이즈 방어): gradeTempoRun을 재사용해 "깨끗한 경계 초과"만 인정한다.
  //   - 등급 B + overBpm 1~10(자극 확보·후반 안정·경계 일부 초과). C(크게/반복 초과)·D(자극 부족)·A(상한 이내)는 제외.
  //   - 평균심박이 상한 근처(−20 이내)로 "유지된 템포"여야 한다(이지런 1bpm blip·HR 스파이크가 상한을 올리는 것 방지).
  //   - 회복 양호 필수. RPE는 자동 import엔 없으므로 "있으면 너무 높지 않아야(>6 제외)"로만.
  const qualifying = signals.filter(
    (s) =>
      s.grade.grade === 'B' &&
      s.grade.overBpm !== null &&
      s.grade.overBpm > 0 &&
      s.run.avgHeartRate !== null &&
      s.run.avgHeartRate >= currentFloor - SUSTAINED_AVG_MARGIN_BPM &&
      (s.run.rpe === null || s.run.rpe <= RPE_MAX_FOR_RAISE) &&
      s.recoveryOk
  )
  const qualifyingCount = qualifying.length

  // 한 단계만 올리되, 입증된 최대심박과 base+cap 안전망을 넘지 않는다(보수적 단일 step).
  const demonstratedMax = qualifying.reduce((max, s) => Math.max(max, s.run.maxHeartRate ?? 0), 0)
  const raiseTarget = Math.min(currentFloor + RAISE_STEP_BPM, demonstratedMax || currentFloor + RAISE_STEP_BPM, raiseCap)

  if (qualifyingCount >= CONFIRM_COUNT) {
    return {
      baseCeilingBpm,
      effectiveCeilingBpm: raiseTarget,
      candidateCeilingBpm: null,
      proposedAdoptedCeilingBpm: raiseTarget,
      source: 'adapted',
      confidence: 'high',
      qualifyingCount,
      sampleCount,
      rationale: `최근 Tempo ${qualifyingCount}회가 상한 초과에도 RPE 낮고 후반 안정·회복 양호 — 상한을 ${currentFloor}→${raiseTarget}bpm로 상향 적용.`
    }
  }
  if (qualifyingCount === CANDIDATE_COUNT) {
    return {
      baseCeilingBpm,
      effectiveCeilingBpm: currentFloor,
      candidateCeilingBpm: raiseTarget,
      proposedAdoptedCeilingBpm: adopted,
      source: onAdapted ? 'adapted' : 'estimate',
      confidence: onAdapted ? 'high' : 'medium',
      qualifyingCount,
      sampleCount,
      rationale: `최근 Tempo ${qualifyingCount}회가 상향 조건을 충족 — ${raiseTarget}bpm 상향 후보로 관찰 중(1회 더 확인되면 적용).`
    }
  }
  return settle(
    { qualifyingCount },
    onAdapted
      ? `현재 적응 상한 ${currentFloor}bpm 유지(추가 상향 근거는 아직 부족).`
      : '아직 상향 근거가 충분치 않음 — 추정 상한 유지.'
  )
}

export const HEART_RATE_CONFIDENCE_LABEL: Record<TempoCeilingConfidence, string> = {
  low: '낮음',
  medium: '관찰 중',
  high: '높음'
}

/** UI 신뢰도 표시용 출처 라벨. adapted면 "최근 템포 N회 분석", 아니면 base source 라벨에 위임. */
export function tempoCeilingSourceLabel(adaptation: TempoCeilingAdaptation, baseSourceLabel: string): string {
  if (adaptation.source === 'adapted') return adaptation.qualifyingCount > 0 ? `최근 템포 ${adaptation.qualifyingCount}회 분석` : '최근 템포 분석'
  return baseSourceLabel
}

/**
 * UI 공용: 적응 상한의 effective bpm + "(출처 · 신뢰도 X)[ · N 상향 후보]" 접미사를 만든다.
 * AppHeader/MemoryPage가 같은 표기를 쓰도록 단일 출처로 둔다.
 */
export function describeTempoCeilingMeta(
  adaptation: TempoCeilingAdaptation,
  baseTempoCeilingBpm: number | null,
  baseSourceLabel: string
): { effectiveBpm: number | null; suffix: string } {
  const effectiveBpm = adaptation.effectiveCeilingBpm ?? baseTempoCeilingBpm
  const sourceLabel = tempoCeilingSourceLabel(adaptation, baseSourceLabel)
  const candidate = adaptation.candidateCeilingBpm !== null ? ` · ${adaptation.candidateCeilingBpm} 상향 후보` : ''
  return { effectiveBpm, suffix: `(${sourceLabel} · 신뢰도 ${HEART_RATE_CONFIDENCE_LABEL[adaptation.confidence]})${candidate}` }
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
 * coach-run 주입용 컴팩트 요약(client-summary 패턴, 서사용). 영속된 채택 상한을 currentFloor로 반영한다.
 * 권위 있는 effective 상한은 서버가 메모리(adaptiveTrainingProfile.tempoCeiling)에서 직접 읽어 쓰며,
 * 이 요약은 후보·신뢰도·rationale 서사를 코치에 전달한다.
 */
export function summarizeTempoCoaching(runs: RunLog[], memory: TrainingMemory): TempoCoachingSummary {
  const observed = deriveObservedMaxHr(runs.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })))
  const hr = deriveHeartRateModel(memory.athleteProfile, new Date().getFullYear(), observed)
  const adaptation = computeTempoCeilingAdaptation(runs, hr.tempoCeilingBpm, {
    injuryActive: Boolean(getActiveInjuryItem(memory)),
    adoptedCeilingBpm: memory.adaptiveTrainingProfile.tempoCeiling?.adoptedBpm ?? null
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
