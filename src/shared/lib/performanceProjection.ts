import type { RunLog } from '@/entities/run/model'
import type { TrainingGoal, TrainingInjuryItem } from '@/entities/training-memory/model'

export type RaceProjectionSignal = {
  runId: string
  date: string
  type: string
  distanceKm: number
  durationSec: number
  projectedSec: number
  confidence: 'high' | 'medium' | 'low'
}

export type ProjectionReadinessFactor = {
  key: 'performance' | 'threshold' | 'aerobicBase' | 'longRun' | 'consistency' | 'injuryRecovery'
  label: string
  score: number
  status: 'good' | 'watch' | 'weak'
  summary: string
  detail: string
}

export type RaceProjection = {
  targetDistanceKm: number
  targetDurationSec: number | null
  current: RaceProjectionSignal
  previous: RaceProjectionSignal | null
  deltaSec: number | null
  readinessScore: number
  readinessLevel: '충분' | '보통' | '부족'
  readinessSummary: string
  factors: ProjectionReadinessFactor[]
  /**
   * 신뢰구간(sec, [빠름, 느림]) — #367. 단일 기록 외삽 하나로 단정하지 않는다.
   * 다중 기록 합의 + 거리 외삽 보정 center 둘레로, 외삽 거리·신뢰도·훈련량 적정도에 따라 폭이 넓어진다.
   * (근거: Vickers&Vertosick 2016, Keogh&Smyth 2019 — running-coaching-standards "목표 달성 예측")
   */
  projectedRangeSec: [number, number] | null
}

// #312/#98: 대시보드와 코칭이 같은 6요소 전망을 쓰도록 coach-run 에 주입하는 compact 요약.
export type CoachGoalProjectionSummary = {
  projectedSec: number | null
  projectedRangeSec: [number, number] | null
  readinessScore: number | null
  readinessLevel: RaceProjection['readinessLevel'] | null
  deltaSec: number | null
}

export function summarizeGoalProjectionForCoach(projection: RaceProjection | null): CoachGoalProjectionSummary | null {
  if (!projection) return null
  return {
    projectedSec: projection.current?.projectedSec ?? null,
    projectedRangeSec: projection.projectedRangeSec,
    readinessScore: projection.readinessScore,
    readinessLevel: projection.readinessLevel,
    deltaSec: projection.deltaSec
  }
}

const dayMs = 24 * 60 * 60 * 1000

// 개인 심박 기준에서 파생한 상한. 개인 기준이 없으면(데이터 부족) null이고, 그 경우 HR 기반 게이트는 건너뛴다.
export type ProjectionHeartRateCeilings = {
  easyCeilingBpm: number | null
  tempoCeilingBpm: number | null
}

export function getRaceProjection(
  runs: RunLog[],
  activeGoal: TrainingGoal | null | undefined,
  today = new Date(),
  activeInjury?: TrainingInjuryItem | null,
  ageWeight = 0,
  heartRateCeilings?: ProjectionHeartRateCeilings | null
): RaceProjection | null {
  const targetDistanceKm = activeGoal?.distanceKm
  if (!targetDistanceKm || targetDistanceKm <= 0) return null

  const ceilings: ProjectionHeartRateCeilings = {
    easyCeilingBpm: heartRateCeilings?.easyCeilingBpm ?? null,
    tempoCeilingBpm: heartRateCeilings?.tempoCeilingBpm ?? null
  }

  const signals = runs
    .filter((run) => run.durationSec && run.distanceKm >= Math.max(3, targetDistanceKm * 0.35))
    .map((run) => toProjectionSignal(run, targetDistanceKm))
    .filter((signal): signal is RaceProjectionSignal => Boolean(signal))
    .filter((signal) => signal.confidence !== 'low')
    .sort((a, b) => b.date.localeCompare(a.date))

  if (!signals.length) return null

  const current = chooseCurrentSignal(signals, activeGoal?.targetDurationSec ?? null)
  const previous = signals.filter((signal) => signal.runId !== current.runId).find((signal) => signal.date < current.date) ?? null
  const factors = buildReadinessFactors(runs, targetDistanceKm, activeGoal?.targetDurationSec ?? null, current, today, activeInjury ?? null, ageWeight, ceilings)
  const readinessScore = weightedReadinessScore(factors)
  const readinessLevel = getReadinessLevel(readinessScore)
  const projectedRangeSec = computeProjectionRange(signals, current, targetDistanceKm, factors)

  return {
    targetDistanceKm,
    targetDurationSec: activeGoal?.targetDurationSec ?? null,
    current,
    previous,
    deltaSec: previous ? current.projectedSec - previous.projectedSec : null,
    readinessScore,
    readinessLevel,
    readinessSummary: summarizeReadiness(readinessScore, factors),
    factors,
    projectedRangeSec
  }
}

/**
 * 다중 기록 합의 + 거리 외삽 보정 center 와 신뢰구간(sec, [빠름, 느림])을 산출한다 (#367).
 * 단일 기록 외삽(current.projectedSec) 하나에 의존하지 않는다.
 */
export function computeProjectionRange(
  signals: RaceProjectionSignal[],
  current: RaceProjectionSignal,
  targetDistanceKm: number,
  factors: ProjectionReadinessFactor[]
): [number, number] | null {
  if (!signals.length) return null
  const recent = signals.slice(0, 6)

  // 1) 다중 기록 가중 합의(신뢰도·거리 근접도로 가중) — 단일 best 의존 완화.
  const weightOf = (s: RaceProjectionSignal): number => {
    const conf = s.confidence === 'high' ? 3 : s.confidence === 'medium' ? 2 : 1
    const proximity = 1 / (1 + Math.abs(s.distanceKm - targetDistanceKm) / Math.max(targetDistanceKm, 1))
    return conf * proximity
  }
  const wSum = recent.reduce((sum, s) => sum + weightOf(s), 0)
  const consensus = wSum > 0 ? recent.reduce((sum, s) => sum + s.projectedSec * weightOf(s), 0) / wSum : current.projectedSec

  // 2) 거리 외삽 보정: Riegel(지수 1.06)은 목표가 출처보다 훨씬 길면 속도를 과대(시간을 과소)예측.
  //    출처 거리 중앙값 대비 목표가 길수록 center 를 보수적으로 늦춘다.
  const medianSourceKm = median(recent.map((s) => s.distanceKm))
  const ratio = medianSourceKm > 0 ? targetDistanceKm / medianSourceKm : 1
  const extrapolation = Math.max(0, Math.log(Math.max(ratio, 1)))
  const center = consensus * (1 + extrapolation * 0.04)

  // 3) 신뢰구간 반폭: 기본 + 외삽 거리 + 신뢰도 부족 + 훈련량(유산소 베이스) 부족.
  const confScore = current.confidence === 'high' ? 0 : current.confidence === 'medium' ? 0.04 : 0.09
  const aerobic = factors.find((f) => f.key === 'aerobicBase')?.score ?? 50
  const volumePenalty = clamp((75 - aerobic) / 75, 0, 1) * 0.06
  // 표본 부족 페널티: 단일 기록(n=1)은 합의가 불가능하므로 크게, n=2 는 중간, n>=3 는 0.
  // (value #3 "다중 기록" 의도 — 기록 1개 외삽에 좁은 신뢰구간을 주지 않는다.)
  const samplePenalty = recent.length <= 1 ? 0.1 : recent.length === 2 ? 0.05 : 0
  const halfFraction = clamp(0.04 + extrapolation * 0.05 + confScore + volumePenalty + samplePenalty, 0.03, 0.35)
  const half = Math.round(center * halfFraction)

  return [Math.max(1, Math.round(center) - half), Math.round(center) + half]
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function chooseCurrentSignal(signals: RaceProjectionSignal[], targetDurationSec: number | null): RaceProjectionSignal {
  const recent = signals.slice(0, 6)
  const ranked = [...recent].sort((a, b) => {
    const aScore = signalPriority(a, targetDurationSec)
    const bScore = signalPriority(b, targetDurationSec)
    return bScore - aScore
  })
  return ranked[0] ?? signals[0]
}

function signalPriority(signal: RaceProjectionSignal, targetDurationSec: number | null) {
  const confidenceScore = signal.confidence === 'high' ? 40 : signal.confidence === 'medium' ? 25 : 10
  const distanceScore = Math.min(35, (signal.distanceKm / 10) * 35)
  const targetScore = targetDurationSec ? Math.max(0, 25 - Math.abs(signal.projectedSec - targetDurationSec) / 60) : 12
  return confidenceScore + distanceScore + targetScore
}

function buildReadinessFactors(
  runs: RunLog[],
  targetDistanceKm: number,
  targetDurationSec: number | null,
  current: RaceProjectionSignal,
  today: Date,
  activeInjury: TrainingInjuryItem | null,
  ageWeight = 0,
  ceilings: ProjectionHeartRateCeilings = { easyCeilingBpm: null, tempoCeilingBpm: null }
): ProjectionReadinessFactor[] {
  const recent7 = runsWithinDays(runs, 7, today)
  const recent14 = runsWithinDays(runs, 14, today)
  const recent30 = runsWithinDays(runs, 30, today)
  const recent42 = runsWithinDays(runs, 42, today)

  return [
    getPerformanceFactor(current, targetDistanceKm, targetDurationSec),
    getThresholdFactor(recent30, ceilings),
    getAerobicBaseFactor(recent30, targetDistanceKm, ceilings.easyCeilingBpm),
    getLongRunFactor(recent42, targetDistanceKm, today),
    getConsistencyFactor(recent30, recent14, recent7),
    getInjuryRecoveryFactor(activeInjury, recent14, ageWeight)
  ]
}

function getPerformanceFactor(current: RaceProjectionSignal, targetDistanceKm: number, targetDurationSec: number | null): ProjectionReadinessFactor {
  if (!targetDurationSec) {
    return factor('performance', '수행능력 신호', 55, `${current.type} ${current.distanceKm.toFixed(2)}km 기반`, '목표 기록이 없어서 환산 기록은 참고값으로만 봅니다.')
  }

  const diffSec = current.projectedSec - targetDurationSec
  const score = clamp(Math.round(100 - Math.max(diffSec, 0) / Math.max(targetDurationSec, 1) * 180), 20, 100)
  const paceGap = diffSec / targetDistanceKm
  const detail = diffSec <= 0
    ? '최근 품질 세션 환산은 목표 기록 안쪽입니다. 다만 단일 기록이라 다른 훈련 축과 함께 봅니다.'
    : `최근 품질 세션 환산은 목표보다 km당 약 ${formatPaceGap(paceGap)} 정도 여유가 더 필요합니다.`

  return factor('performance', '수행능력 신호', score, `${current.type} ${current.distanceKm.toFixed(2)}km 환산`, detail)
}

function getThresholdFactor(runs: RunLog[], ceilings: ProjectionHeartRateCeilings): ProjectionReadinessFactor {
  const thresholdRuns = runs.filter((run) => isThresholdSignal(run, ceilings))
  const meaningful = thresholdRuns.filter((run) => run.distanceKm >= 4 || (run.durationSec ?? 0) >= 20 * 60)
  // 템포 상한 미설정(개인 기준 없음)이면 상한 준수 여부를 판단하지 않고 횟수만 본다.
  const capped = ceilings.tempoCeilingBpm === null
    ? meaningful
    : meaningful.filter((run) => !run.maxHeartRate || run.maxHeartRate <= ceilings.tempoCeilingBpm!)
  const countScore = clamp(Math.round((meaningful.length / 3) * 75), 0, 75)
  const qualityBonus = meaningful.length ? Math.round((capped.length / meaningful.length) * 25) : 0
  const score = clamp(countScore + qualityBonus, 0, 100)

  return factor(
    'threshold',
    '역치/템포 훈련',
    score,
    `${meaningful.length}회 · 상한 준수 ${capped.length}회`,
    meaningful.length
      ? '10km 목표에는 편하게 힘든 강도를 유지하는 역치 자극이 필요합니다. 횟수와 심박 상한 준수 여부를 같이 봅니다.'
      : '최근 30일 안에 목표 특이적인 템포/역치 신호가 부족합니다.'
  )
}

function getAerobicBaseFactor(runs: RunLog[], targetDistanceKm: number, easyCeilingBpm: number | null): ProjectionReadinessFactor {
  const distance = sumDistance(runs)
  const weeklyAvg = distance / (30 / 7)
  const targetWeeklyDistance = Math.max(targetDistanceKm * 3, 20)
  const easyDistance = runs.reduce((sum, run) => sum + getLowIntensityDistance(run, easyCeilingBpm), 0)
  const easyRatio = distance > 0 ? easyDistance / distance : 0
  const volumeScore = clamp(Math.round((weeklyAvg / targetWeeklyDistance) * 60), 0, 60)
  const easyScore = clamp(Math.round((easyRatio / 0.75) * 40), 0, 40)
  const score = volumeScore + easyScore

  return factor(
    'aerobicBase',
    '유산소 베이스',
    score,
    `주 ${weeklyAvg.toFixed(1)}km · 저강도 ${Math.round(easyRatio * 100)}%`,
    '최근 30일 볼륨과 Easy/Recovery 비중을 같이 봅니다. 10km 목표라도 베이스가 약하면 템포 품질이 오래 유지되지 않습니다.'
  )
}

function getLongRunFactor(runs: RunLog[], targetDistanceKm: number, today: Date): ProjectionReadinessFactor {
  const longRuns = runs.filter((run) => run.distanceKm >= Math.max(8, targetDistanceKm))
  const latest = [...longRuns].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  const longest = longRuns.reduce<RunLog | null>((best, run) => (!best || run.distanceKm > best.distanceKm ? run : best), null)
  const distanceScore = longest ? clamp(Math.round((longest.distanceKm / Math.max(targetDistanceKm * 1.2, 10)) * 70), 0, 70) : 0
  const recencyDays = latest ? daysBetween(latest.date, today) : null
  const recencyScore = recencyDays === null ? 0 : recencyDays <= 14 ? 30 : recencyDays <= 28 ? 18 : 8
  const score = clamp(distanceScore + recencyScore, 0, 100)

  return factor(
    'longRun',
    'LSD/롱런 기반',
    score,
    latest ? `${latest.distanceKm.toFixed(2)}km · ${recencyDays}일 전` : '최근 롱런 없음',
    latest
      ? '최근 긴 거리 지속 능력과 신선도를 봅니다. 10km 목표에서는 완주 여유와 후반 유지력을 만드는 축입니다.'
      : '최근 42일 안에 목표 거리 이상의 LSD/롱런 신호가 부족합니다.'
  )
}

function getConsistencyFactor(recent30: RunLog[], recent14: RunLog[], recent7: RunLog[]): ProjectionReadinessFactor {
  const runDays = new Set(recent30.map((run) => run.date)).size
  const activeWeeks = countActiveWeeks(recent30)
  const hardCount = recent7.filter((run) => ['Tempo', 'Steady Long', 'LSD', 'Race'].includes(run.type)).length
  const recent7Distance = sumDistance(recent7)
  const prev7Distance = sumDistance(recent14.filter((run) => !recent7.some((recent) => recent.id === run.id)))
  const spikePenalty = prev7Distance > 0 && recent7Distance / prev7Distance >= 1.35 ? 15 : 0
  const hardPenalty = hardCount >= 3 ? 12 : 0
  const score = clamp(Math.round((runDays / 12) * 45) + activeWeeks * 12 - spikePenalty - hardPenalty, 0, 100)

  return factor(
    'consistency',
    '일관성/회복 여유',
    score,
    `${runDays}일 러닝 · 강훈련 ${hardCount}회`,
    spikePenalty || hardPenalty
      ? '루틴 소화는 보지만 최근 부하 급증이나 강훈련 과밀은 목표 예상에서 감점합니다.'
      : '최근 러닝 빈도와 주차별 끊김 여부를 봅니다. 예측 기록이 좋아도 지속성이 약하면 신뢰도를 낮춥니다.'
  )
}

function getInjuryRecoveryFactor(activeInjury: TrainingInjuryItem | null, recent14: RunLog[], ageWeight = 0): ProjectionReadinessFactor {
  const ageDetail = ageWeight >= 2 ? ' 나이대를 고려해 회복 게이트를 더 보수적으로 봅니다.' : ''
  if (!activeInjury || activeInjury.status === 'resolved' || activeInjury.status === 'archived') {
    const score = clamp(85 - ageWeight * 2, 0, 100)
    return factor('injuryRecovery', '부상/회복 게이트', score, ageWeight >= 2 ? '활성 제한 없음 · 회복 보수' : '활성 제한 없음', `현재 활성 부상 제한이 없으면 목표 예상의 회복 게이트는 크게 막지 않습니다.${ageDetail}`)
  }
  const severity = activeInjury.severity ?? 2
  const painMentions = recent14.filter((run) => run.painNote.trim()).length
  const score = clamp(92 - severity * 12 - Math.min(20, painMentions * 5) - ageWeight * 3, 20, 82)
  const area = activeInjury.area || '관리 부위'
  return factor(
    'injuryRecovery',
    '부상/회복 게이트',
    score,
    `${area} · ${activeInjury.status}${activeInjury.severity ? ` · ${activeInjury.severity}/5` : ''}`,
    `활성 부상이나 통증 메모가 있으면 예측 기록을 그대로 믿지 않고 강도 상향과 목표 준비도를 보수적으로 낮춥니다.${ageDetail}`
  )
}

function factor(key: ProjectionReadinessFactor['key'], label: string, score: number, summary: string, detail: string): ProjectionReadinessFactor {
  const normalizedScore = clamp(Math.round(score), 0, 100)
  return {
    key,
    label,
    score: normalizedScore,
    status: normalizedScore >= 75 ? 'good' : normalizedScore >= 50 ? 'watch' : 'weak',
    summary,
    detail
  }
}

function weightedReadinessScore(factors: ProjectionReadinessFactor[]): number {
  const weights: Record<ProjectionReadinessFactor['key'], number> = {
    performance: 0.27,
    threshold: 0.2,
    aerobicBase: 0.2,
    longRun: 0.15,
    consistency: 0.08,
    injuryRecovery: 0.1
  }
  const total = factors.reduce((sum, item) => sum + item.score * weights[item.key], 0)
  return clamp(Math.round(total), 0, 100)
}

function getReadinessLevel(score: number): RaceProjection['readinessLevel'] {
  if (score >= 75) return '충분'
  if (score >= 55) return '보통'
  return '부족'
}

function summarizeReadiness(score: number, factors: ProjectionReadinessFactor[]): string {
  const weak = factors.filter((item) => item.status === 'weak')
  const good = factors.filter((item) => item.status === 'good')
  if (score >= 75) return `근거 ${good.length}개가 안정적입니다. 현재 루틴 유지 또는 소폭 상향 검토가 가능합니다.`
  if (weak.length) return `${weak[0].label} 근거가 약합니다. 예상 기록보다 훈련 구성 보강이 먼저입니다.`
  return '핵심 근거는 보통 수준입니다. 루틴은 유지하되 다음 품질 세션 반응을 더 봅니다.'
}

function toProjectionSignal(run: RunLog, targetDistanceKm: number): RaceProjectionSignal | null {
  if (!run.durationSec || run.distanceKm <= 0) return null

  const confidence = getProjectionConfidence(run)
  const projectedSec = Math.round(run.durationSec * (targetDistanceKm / run.distanceKm) ** 1.06)
  if (!Number.isFinite(projectedSec) || projectedSec <= 0) return null

  return {
    runId: run.id,
    date: run.date,
    type: run.type,
    distanceKm: run.distanceKm,
    durationSec: run.durationSec,
    projectedSec,
    confidence
  }
}

function getProjectionConfidence(run: RunLog): RaceProjectionSignal['confidence'] {
  if (run.type === 'Race') return 'high'
  if (run.type === 'Tempo' && run.distanceKm >= 4) return 'medium'
  if (run.type === 'Steady Long' && run.distanceKm >= 8) return 'medium'
  if (run.type === 'LSD' && run.distanceKm >= 12 && (run.avgHeartRate ?? 999) >= 135) return 'medium'
  if (run.rpe !== null && run.rpe >= 7 && run.distanceKm >= 4) return 'medium'
  return 'low'
}

function isThresholdSignal(run: RunLog, ceilings: ProjectionHeartRateCeilings): boolean {
  if (run.type === 'Tempo' || run.type === 'Race') return true
  if (run.rpe !== null && run.rpe >= 6 && run.distanceKm >= 4) return true
  // 개인 심박 상한이 없으면 HR 기반 역치 추정은 건너뛴다(타입/RPE만 사용).
  if (ceilings.easyCeilingBpm === null || ceilings.tempoCeilingBpm === null) return false
  // 역치 신호로 보는 평균심박 하한은 Easy 상단 + 5bpm.
  const lowerBound = ceilings.easyCeilingBpm + 5
  return Boolean(run.avgHeartRate && run.avgHeartRate >= lowerBound && run.avgHeartRate <= ceilings.tempoCeilingBpm && run.distanceKm >= 4)
}

function getLowIntensityDistance(run: RunLog, easyCeilingBpm: number | null): number {
  // 개인 심박 상한이 없으면 HR로 저강도 거리를 가르지 않고 세션 타입으로만 본다.
  if (easyCeilingBpm !== null) {
    const lapsWithHeartRate = run.laps.filter((lap) => lap.distanceKm && lap.avgHeartRate)
    if (lapsWithHeartRate.length) {
      return lapsWithHeartRate.reduce((sum, lap) => sum + ((lap.avgHeartRate ?? 999) <= easyCeilingBpm ? lap.distanceKm ?? 0 : 0), 0)
    }
    if (run.avgHeartRate && run.avgHeartRate <= easyCeilingBpm) return run.distanceKm
  }
  if (['Recovery', 'Easy', 'Easy + Strides', 'LSD'].includes(run.type)) return run.distanceKm
  return 0
}

function runsWithinDays(runs: RunLog[], days: number, today: Date): RunLog[] {
  const start = new Date(today.getTime() - (days - 1) * dayMs)
  start.setHours(0, 0, 0, 0)
  return runs.filter((run) => new Date(`${run.date}T00:00:00`) >= start)
}

function countActiveWeeks(runs: RunLog[]): number {
  return new Set(runs.map((run) => getWeekKey(run.date))).size
}

function getWeekKey(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00`)
  const firstDay = new Date(date.getFullYear(), 0, 1)
  const dayOffset = Math.floor((date.getTime() - firstDay.getTime()) / dayMs)
  return `${date.getFullYear()}-${Math.floor(dayOffset / 7)}`
}

function sumDistance(runs: RunLog[]): number {
  return runs.reduce((sum, run) => sum + run.distanceKm, 0)
}

function daysBetween(dateText: string, today: Date): number {
  const date = new Date(`${dateText}T00:00:00`)
  const base = new Date(today)
  base.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((base.getTime() - date.getTime()) / dayMs))
}

function formatPaceGap(seconds: number): string {
  const absolute = Math.abs(Math.round(seconds))
  const min = Math.floor(absolute / 60)
  const sec = String(absolute % 60).padStart(2, '0')
  return min > 0 ? `${min}:${sec}` : `${sec}초`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
