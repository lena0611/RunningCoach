import type { RunLog, RunType } from '@/entities/run/model'
import { getActiveGoal, getActiveInjuryItem, type TrainingMemory } from '@/entities/training-memory/model'
import { formatDuration, formatPace } from '@/shared/lib/format'
import { getEasyRatio, getRunsWithinDays, sumDistance } from '@/shared/lib/runStats'
import { getRaceProjection } from '@/shared/lib/performanceProjection'

export type TrendLensKey = 'goal' | 'efficiency' | 'intensity' | 'quality' | 'recovery'
export type TrendPeriod = '90d' | '180d' | '365d' | 'all'
export type TrendBaseline = 'previous-period' | 'goal-start' | 'first-run'
export type TrendInsightTone = 'good' | 'watch' | 'warning' | 'neutral'
export type TrendInsightConfidence = 'high' | 'medium' | 'low'

export type TrendInsightCard = {
  id: string
  label: string
  value: string
  unit?: string
  hint: string
  tone: TrendInsightTone
}

export type TrendChartPoint = {
  id: string
  label: string
  date: string
  value: number
  runId?: string
  detail?: string
  status?: TrendInsightTone
  confidence?: TrendInsightConfidence
}

export type TrendEvidenceRun = {
  runId: string
  role: 'baseline' | 'current' | 'supporting' | 'excluded' | 'warning'
  reason: string
}

export type TrendPrescriptionImpact = {
  status: 'raise-candidate' | 'maintain' | 'reduce-or-recover' | 'not-enough-data'
  title: string
  reasons: string[]
}

export type TrendLensResult = {
  lens: TrendLensKey
  title: string
  summary: string
  hero: {
    value: string
    label: string
    detail: string
    tone: TrendInsightTone
    confidence: TrendInsightConfidence
  }
  cards: TrendInsightCard[]
  chart: TrendChartPoint[]
  explanations: string[]
  evidenceRuns: TrendEvidenceRun[]
  prescriptionImpact: TrendPrescriptionImpact
}

type TrendInput = {
  lens: TrendLensKey
  period: TrendPeriod
  baseline: TrendBaseline
  runs: RunLog[]
  memory: TrainingMemory
  today?: Date
}

type DateWindow = {
  current: RunLog[]
  baseline: RunLog[]
  currentLabel: string
  baselineLabel: string
}

const hardTypes: RunType[] = ['Tempo', 'LSD', 'Steady Long', 'Race']
const qualityTypes: RunType[] = ['Easy + Strides', 'Tempo', 'LSD', 'Steady Long', 'Race']
const dayMs = 24 * 60 * 60 * 1000

export function buildTrendLensResult(input: TrendInput): TrendLensResult {
  const today = input.today ?? new Date()
  const runs = [...input.runs].sort((a, b) => a.date.localeCompare(b.date))
  if (!runs.length) return emptyResult(input.lens, '러닝 기록이 필요합니다.', '추세를 보려면 먼저 기록을 저장해야 합니다.')

  const window = getDateWindow(runs, input.period, input.baseline, input.memory, today)
  if (input.lens === 'goal') return buildGoalLens(runs, input.memory, today)
  if (input.lens === 'efficiency') return buildEfficiencyLens(window)
  if (input.lens === 'intensity') return buildIntensityLens(window, today)
  if (input.lens === 'quality') return buildQualityLens(window)
  return buildRecoveryLens(window)
}

function buildGoalLens(runs: RunLog[], memory: TrainingMemory, today: Date): TrendLensResult {
  const activeGoal = getActiveGoal(memory)
  const projection = getRaceProjection(runs, activeGoal, today, getActiveInjuryItem(memory))
  if (!activeGoal || !projection) {
    return emptyResult('goal', '목표 신호 부족', '활성 목표와 품질 세션이 더 쌓이면 목표 진전 추세를 계산합니다.')
  }

  const weakest = [...projection.factors].sort((a, b) => a.score - b.score)[0]
  const deltaText = projection.deltaSec === null
    ? '비교 부족'
    : projection.deltaSec < 0
      ? `${formatDuration(Math.abs(projection.deltaSec))} 개선`
      : `${formatDuration(projection.deltaSec)} 후퇴`
  const tone = projection.readinessScore >= 75 ? 'good' : projection.readinessScore >= 55 ? 'watch' : 'warning'

  return {
    lens: 'goal',
    title: '목표 진전',
    summary: '활성 목표까지 가까워지는 축과 막히는 축을 분리해서 봅니다.',
    hero: {
      value: formatDuration(projection.current.projectedSec),
      label: `${projection.targetDistanceKm}km 목표 예상`,
      detail: `준비도 ${projection.readinessScore}점 · ${projection.readinessLevel}`,
      tone,
      confidence: projection.current.confidence
    },
    cards: [
      card('readiness', '준비도', String(projection.readinessScore), '점', projection.readinessSummary, tone),
      card('delta', '최근 변화', deltaText, '', projection.previous ? '이전 대표 품질 세션 대비' : '비교할 이전 신호 부족', projection.deltaSec !== null && projection.deltaSec < 0 ? 'good' : 'watch'),
      card('weakest', '병목 축', weakest?.label ?? '데이터 부족', '', weakest?.summary ?? '판단 근거 부족', weakest?.status === 'weak' ? 'warning' : 'watch'),
      card('target', '목표 기준', activeGoal.title, '', activeGoal.successCriteria || '활성 목표 기준', 'neutral')
    ],
    chart: projection.factors.map((factor) => ({
      id: factor.key,
      label: factor.label,
      date: projection.current.date,
      value: factor.score,
      detail: factor.summary,
      status: factor.status === 'good' ? 'good' : factor.status === 'weak' ? 'warning' : 'watch',
      confidence: 'medium'
    })),
    explanations: [
      projection.readinessSummary,
      weakest ? `${weakest.label}: ${weakest.detail}` : '목표 판단에 필요한 품질 세션이 아직 부족합니다.',
      '목표 예상은 단일 기록 환산이 아니라 수행능력, 역치, 유산소 베이스, 롱런, 일관성, 부상/회복 게이트를 함께 봅니다.'
    ],
    evidenceRuns: [
      { runId: projection.current.runId, role: 'current', reason: '현재 목표 예상의 대표 신호입니다.' },
      ...(projection.previous ? [{ runId: projection.previous.runId, role: 'baseline' as const, reason: '최근 변화 비교 기준입니다.' }] : [])
    ],
    prescriptionImpact: prescription(
      tone === 'good' ? 'raise-candidate' : tone === 'warning' ? 'reduce-or-recover' : 'maintain',
      tone === 'good' ? '목표 훈련 유지 또는 소폭 상향 후보' : tone === 'warning' ? '목표 상향보다 병목 보완 우선' : '목표 루틴 유지',
      [weakest ? `${weakest.label} 신호를 다음 처방 판단에 우선 반영합니다.` : '추가 품질 세션이 필요합니다.']
    )
  }
}

function buildEfficiencyLens(window: DateWindow): TrendLensResult {
  const current = comparableHeartRatePace(window.current)
  const baseline = comparableHeartRatePace(window.baseline)
  const currentBest = chooseEfficiencyBand(current, baseline)
  if (!currentBest) return emptyResult('efficiency', '효율 비교 데이터 부족', '심박과 페이스가 함께 있는 기록이 더 필요합니다.')

  const baseValue = baseline[currentBest.band]
  const currentValue = current[currentBest.band]
  const delta = baseValue && currentValue ? baseValue.medianPaceSec - currentValue.medianPaceSec : null
  const tone: TrendInsightTone = delta === null ? 'neutral' : delta >= 8 ? 'good' : delta <= -8 ? 'warning' : 'watch'
  const confidence = Math.min(currentValue?.count ?? 0, baseValue?.count ?? 0) >= 3 ? 'high' : 'medium'

  return {
    lens: 'efficiency',
    title: '유산소 효율',
    summary: '같은 심박대에서 더 빠르게 달리게 됐는지 봅니다.',
    hero: {
      value: delta === null ? '비교 부족' : `${delta > 0 ? '+' : ''}${Math.round(delta)}초/km`,
      label: `${currentBest.label} 효율 변화`,
      detail: `${window.currentLabel} vs ${window.baselineLabel}`,
      tone,
      confidence
    },
    cards: Object.entries(current).slice(0, 4).map(([band, item]) => {
      const base = baseline[band]
      const diff = base ? base.medianPaceSec - item.medianPaceSec : null
      return card(
        band,
        heartRateBandLabel(band),
        diff === null ? '비교 부족' : `${diff > 0 ? '+' : ''}${Math.round(diff)}`,
        diff === null ? '' : '초/km',
        `${item.count}개 point · 현재 ${formatPace(item.medianPaceSec)}/km`,
        diff === null ? 'neutral' : diff >= 8 ? 'good' : diff <= -8 ? 'warning' : 'watch'
      )
    }),
    chart: efficiencyChartPoints(window.current),
    explanations: [
      delta !== null && delta > 0 ? '같은 심박대에서 페이스가 빨라진 신호입니다.' : '심박대가 함께 올라간 빠른 기록은 효율 개선으로 단정하지 않습니다.',
      '기온, 코스, 고도 차이가 크면 해석 신뢰도가 낮아집니다.',
      '심박 데이터가 없는 기록은 이 Lens의 핵심 계산에서 제외됩니다.'
    ],
    evidenceRuns: evidenceFromRuns(window.current.filter((run) => run.avgHeartRate && run.avgPaceSec).slice(-4), 'supporting', '효율 비교에 사용한 최근 기록입니다.'),
    prescriptionImpact: prescription(
      tone === 'good' ? 'raise-candidate' : tone === 'warning' ? 'maintain' : 'maintain',
      tone === 'good' ? 'Easy 또는 Tempo 처방 소폭 상향 후보' : '심박 기준 처방 유지',
      ['효율 변화는 다음 훈련 강도를 올릴 수 있는 보조 신호입니다.', '회복 비용 Lens가 나쁘면 상향하지 않습니다.']
    )
  }
}

function buildIntensityLens(window: DateWindow, today: Date): TrendLensResult {
  const currentDistance = sumDistance(window.current)
  const baselineDistance = sumDistance(window.baseline)
  const easyRatio = getEasyRatio(window.current)
  const hardCount = window.current.filter((run) => hardTypes.includes(run.type)).length
  const current7 = sumDistance(getRunsWithinDays(window.current, 7, today))
  const previous7 = sumDistance(getRunsWithinDays(window.current, 14, today).filter((run) => !getRunsWithinDays(window.current, 7, today).some((recent) => recent.id === run.id)))
  const loadDelta = previous7 > 0 ? ((current7 - previous7) / previous7) * 100 : null
  const tone: TrendInsightTone = hardCount >= 3 || (loadDelta !== null && loadDelta >= 35) ? 'warning' : easyRatio >= 70 ? 'good' : 'watch'

  return {
    lens: 'intensity',
    title: '강도 분포',
    summary: 'Easy 기반과 강훈련 밀도가 균형을 이루는지 봅니다.',
    hero: {
      value: `${easyRatio}%`,
      label: 'Easy 비율',
      detail: `강훈련 ${hardCount}회 · ${window.currentLabel}`,
      tone,
      confidence: window.current.length >= 5 ? 'high' : 'medium'
    },
    cards: [
      card('distance', '거리 변화', signedNumber(currentDistance - baselineDistance, 'km'), '', `${window.baselineLabel} 대비`, currentDistance >= baselineDistance ? 'good' : 'watch'),
      card('easy', 'Easy 비율', String(easyRatio), '%', '랩/페이스 기반', easyRatio >= 70 ? 'good' : easyRatio < 55 ? 'warning' : 'watch'),
      card('hard', '강훈련', String(hardCount), '회', 'Tempo/LSD/Steady/Race', hardCount >= 3 ? 'warning' : 'watch'),
      card('load', '최근 부하', loadDelta === null ? '비교 부족' : `${Math.round(loadDelta)}%`, '', '최근 7일 vs 이전 7일', loadDelta !== null && loadDelta >= 35 ? 'warning' : 'neutral')
    ],
    chart: typeDistributionPoints(window.current),
    explanations: [
      'Easy 비율은 RunType만으로 계산하지 않고 가능한 경우 랩/페이스를 우선합니다.',
      '최근 부하 증가는 부상 예측 공식이 아니라 스케줄 보수성 조절 신호입니다.',
      hardCount >= 3 ? '강훈련이 한 주에 몰려 다음 처방 상향은 보류하는 편이 낫습니다.' : '강훈련 과밀 신호는 크지 않습니다.'
    ],
    evidenceRuns: evidenceFromRuns(window.current.filter((run) => hardTypes.includes(run.type)).slice(-4), 'warning', '강도 밀도 판단에 사용한 품질 세션입니다.'),
    prescriptionImpact: prescription(
      tone === 'warning' ? 'reduce-or-recover' : 'maintain',
      tone === 'warning' ? '다음 세션 회복 또는 Easy 우선' : '주간 강도 분포 유지',
      ['강훈련 과밀과 부하 급증은 다음 추천 세션 강도를 낮추는 근거입니다.']
    )
  }
}

function buildQualityLens(window: DateWindow): TrendLensResult {
  const qualityRuns = window.current.filter((run) => qualityTypes.includes(run.type))
  if (!qualityRuns.length) return emptyResult('quality', '품질 세션 부족', 'Tempo, Long Run, Easy + Strides 같은 품질 세션이 쌓이면 안정성을 봅니다.')
  const evaluations = qualityRuns.map(evaluateQualityRun)
  const stableCount = evaluations.filter((item) => item.stable).length
  const ratio = Math.round((stableCount / evaluations.length) * 100)
  const tone: TrendInsightTone = ratio >= 70 ? 'good' : ratio < 45 ? 'warning' : 'watch'

  return {
    lens: 'quality',
    title: '세션 품질',
    summary: '훈련 타입별 의도와 실제 수행이 맞았는지 봅니다.',
    hero: {
      value: `${ratio}%`,
      label: '품질 안정률',
      detail: `${stableCount}/${evaluations.length}개 세션 안정`,
      tone,
      confidence: evaluations.length >= 4 ? 'high' : 'medium'
    },
    cards: [
      card('stable', '안정 세션', String(stableCount), '회', '품질 기준 통과', tone),
      card('total', '품질 세션', String(evaluations.length), '회', window.currentLabel, 'neutral'),
      card('drift', '드리프트 주의', String(evaluations.filter((item) => item.reason.includes('드리프트')).length), '회', '후반 안정성 후보', 'watch'),
      card('hr', '심박 초과', String(evaluations.filter((item) => item.reason.includes('상한')).length), '회', '처방 상한 후보', 'warning')
    ],
    chart: evaluations.map((item) => ({
      id: item.run.id,
      label: item.run.date.slice(5).replace('-', '.'),
      date: item.run.date,
      value: item.score,
      runId: item.run.id,
      detail: `${item.run.type} · ${item.reason}`,
      status: item.stable ? 'good' : 'watch',
      confidence: item.run.laps.length >= 2 ? 'high' : 'medium'
    })),
    explanations: [
      '품질 점수는 운동 처방을 확정하지 않고 다음 세션 상향/유지 판단의 보조 근거로 씁니다.',
      'Easy는 낮은 심박 안정성, Tempo는 상한 준수, Long Run은 후반 유지력을 우선 봅니다.',
      '랩이나 심박 데이터가 부족한 세션은 낮은 confidence로 처리합니다.'
    ],
    evidenceRuns: evidenceFromRuns(qualityRuns.slice(-5), 'supporting', '품질 안정성 판단에 사용한 세션입니다.'),
    prescriptionImpact: prescription(
      tone === 'good' ? 'raise-candidate' : tone === 'warning' ? 'maintain' : 'maintain',
      tone === 'good' ? '동일 유형 처방 소폭 상향 후보' : '같은 처방 유지',
      ['품질이 안정된 유형만 다음 단계로 올리고, 불안정한 유형은 반복 확인합니다.']
    )
  }
}

function buildRecoveryLens(window: DateWindow): TrendLensResult {
  const sorted = [...window.current].sort((a, b) => a.date.localeCompare(b.date))
  const checks = sorted.filter((run) => qualityTypes.includes(run.type) || run.distanceKm >= 10).map((run) => recoveryCost(run, sorted))
  if (!checks.length) return emptyResult('recovery', '회복 반응 부족', '품질 세션 이후의 다음 기록이 쌓이면 회복 비용을 봅니다.')
  const highCost = checks.filter((item) => item.cost >= 2)
  const quiet = checks.length - highCost.length
  const tone: TrendInsightTone = highCost.length > 0 && highCost.length >= quiet ? 'warning' : quiet >= highCost.length ? 'good' : 'watch'

  return {
    lens: 'recovery',
    title: '회복 비용',
    summary: '좋은 기록이 다음 훈련에 어떤 대가를 남겼는지 봅니다.',
    hero: {
      value: highCost.length ? `${highCost.length}회 주의` : '조용함',
      label: '품질 세션 후 반응',
      detail: `${checks.length}개 품질 세션 확인`,
      tone,
      confidence: checks.length >= 3 ? 'high' : 'medium'
    },
    cards: [
      card('quiet', '조용한 회복', String(quiet), '회', '다음 기록 반응 기준', quiet >= highCost.length ? 'good' : 'watch'),
      card('cost', '주의 반응', String(highCost.length), '회', '통증/RPE/공백 후보', highCost.length ? 'warning' : 'neutral'),
      card('pain', '통증 연결', String(checks.filter((item) => item.reason.includes('통증')).length), '회', 'painNote 기준', 'warning'),
      card('gap', '긴 공백', String(checks.filter((item) => item.reason.includes('공백')).length), '회', '3일 이상', 'watch')
    ],
    chart: checks.map((item) => ({
      id: item.run.id,
      label: item.run.date.slice(5).replace('-', '.'),
      date: item.run.date,
      value: item.cost,
      runId: item.run.id,
      detail: item.reason,
      status: item.cost >= 2 ? 'warning' : item.cost === 0 ? 'good' : 'watch',
      confidence: item.nextRun ? 'high' : 'medium'
    })),
    explanations: [
      '회복 비용은 성능 저하의 원인을 확정하지 않고 다음 강도 조절 신호로만 사용합니다.',
      '기록이 없는 날은 휴식인지 누락인지 알 수 없으므로 긴 공백은 확정 판단하지 않습니다.',
      highCost.length ? '주의 반응이 반복되어 다음 품질 세션 상향은 보류하는 편이 낫습니다.' : '품질 세션 뒤 큰 회복 비용 신호는 적습니다.'
    ],
    evidenceRuns: checks.filter((item) => item.cost >= 2).map((item) => ({ runId: item.run.id, role: 'warning', reason: item.reason })),
    prescriptionImpact: prescription(
      tone === 'warning' ? 'reduce-or-recover' : 'maintain',
      tone === 'warning' ? '강도 상향 보류' : '처방 유지 후보',
      ['회복 비용이 큰 세션 뒤에는 Recovery/Easy 또는 동일 처방 유지가 우선입니다.']
    )
  }
}

function getDateWindow(runs: RunLog[], period: TrendPeriod, baseline: TrendBaseline, memory: TrainingMemory, today: Date): DateWindow {
  const days = periodDays(period)
  const current = days === null ? runs : runs.filter((run) => daysBetween(run.date, today) < days)
  if (baseline === 'goal-start') {
    const start = getActiveGoal(memory)?.startDate
    const baselineRuns = start ? runs.filter((run) => run.date < start) : []
    return { current, baseline: baselineRuns, currentLabel: periodLabel(period), baselineLabel: '목표 시작 전' }
  }
  if (baseline === 'first-run') {
    const midpoint = current[Math.floor(current.length / 2)]?.date
    return {
      current: midpoint ? current.filter((run) => run.date >= midpoint) : current,
      baseline: midpoint ? current.filter((run) => run.date < midpoint) : [],
      currentLabel: '최근 절반',
      baselineLabel: '초기 절반'
    }
  }
  if (days === null) {
    const midpoint = runs[Math.floor(runs.length / 2)]?.date
    return {
      current: midpoint ? runs.filter((run) => run.date >= midpoint) : runs,
      baseline: midpoint ? runs.filter((run) => run.date < midpoint) : [],
      currentLabel: '최근 절반',
      baselineLabel: '초기 절반'
    }
  }
  const start = new Date(today.getTime() - days * dayMs)
  const previousStart = new Date(today.getTime() - days * 2 * dayMs)
  return {
    current,
    baseline: runs.filter((run) => {
      const date = parseDate(run.date)
      return date >= previousStart && date < start
    }),
    currentLabel: periodLabel(period),
    baselineLabel: `이전 ${periodLabel(period)}`
  }
}

function comparableHeartRatePace(runs: RunLog[]) {
  const bands: Record<string, number[]> = {}
  for (const run of runs) {
    if (!run.avgHeartRate || !run.avgPaceSec) continue
    const band = heartRateBand(run.avgHeartRate)
    const list = bands[band] ?? []
    list.push(run.avgPaceSec)
    bands[band] = list
  }
  return Object.fromEntries(
    Object.entries(bands).map(([band, values]) => [
      band,
      {
        count: values.length,
        medianPaceSec: median(values)
      }
    ])
  ) as Record<string, { count: number; medianPaceSec: number }>
}

function chooseEfficiencyBand(
  current: Record<string, { count: number; medianPaceSec: number }>,
  baseline: Record<string, { count: number; medianPaceSec: number }>
) {
  const candidates = ['z2', 'z3', 'z4', 'z1', 'z5']
  const band = candidates.find((key) => current[key] && baseline[key]) ?? Object.keys(current)[0]
  return band ? { band, label: heartRateBandLabel(band) } : null
}

function efficiencyChartPoints(runs: RunLog[]): TrendChartPoint[] {
  return runs
    .filter((run) => run.avgHeartRate && run.avgPaceSec)
    .map((run) => ({
      id: run.id,
      label: run.date.slice(5).replace('-', '.'),
      date: run.date,
      value: Math.round(run.avgPaceSec ?? 0),
      runId: run.id,
      detail: `${run.type} · ${run.avgHeartRate}bpm`,
      status: 'neutral',
      confidence: 'medium'
    }))
}

function typeDistributionPoints(runs: RunLog[]): TrendChartPoint[] {
  const byType = new Map<RunType, number>()
  for (const run of runs) byType.set(run.type, (byType.get(run.type) ?? 0) + run.distanceKm)
  return Array.from(byType.entries()).map(([type, distance]) => ({
    id: type,
    label: type,
    date: '',
    value: Math.round(distance * 10) / 10,
    detail: `${type} ${distance.toFixed(1)}km`,
    status: hardTypes.includes(type) ? 'watch' : 'good',
    confidence: 'medium'
  }))
}

function evaluateQualityRun(run: RunLog) {
  const drift = estimateNumericDrift(run)
  const hrCeilingExceeded = run.type === 'Tempo' && (run.maxHeartRate ?? 0) > 165
  const easyExceeded = run.type === 'Easy' && (run.maxHeartRate ?? run.avgHeartRate ?? 0) > 150
  const longEnough = run.type === 'LSD' || run.type === 'Steady Long' ? run.distanceKm >= 10 : true
  const stable = !hrCeilingExceeded && !easyExceeded && longEnough && drift < 2
  const score = Math.max(0, 100 - (hrCeilingExceeded ? 25 : 0) - (easyExceeded ? 20 : 0) - (!longEnough ? 20 : 0) - drift * 12)
  const reasons = [
    hrCeilingExceeded ? '상한 초과' : '',
    easyExceeded ? 'Easy 심박 상승' : '',
    !longEnough ? '롱런 거리 부족' : '',
    drift >= 2 ? '드리프트 주의' : ''
  ].filter(Boolean)
  return {
    run,
    stable,
    score: Math.round(score),
    reason: reasons.join(' · ') || '안정'
  }
}

function recoveryCost(run: RunLog, runs: RunLog[]) {
  const nextRun = runs.find((item) => item.date > run.date)
  const gap = nextRun ? Math.floor((parseDate(nextRun.date).getTime() - parseDate(run.date).getTime()) / dayMs) : null
  let cost = 0
  const reasons: string[] = []
  if (nextRun?.painNote.trim()) {
    cost += 2
    reasons.push('다음 기록 통증 메모')
  }
  if ((nextRun?.rpe ?? 0) >= 7) {
    cost += 1
    reasons.push('다음 기록 RPE 높음')
  }
  if ((nextRun?.conditionScore ?? 5) <= 2) {
    cost += 1
    reasons.push('컨디션 낮음')
  }
  if (gap !== null && gap >= 4) {
    cost += 1
    reasons.push(`${gap}일 공백`)
  }
  return {
    run,
    nextRun,
    cost,
    reason: reasons.join(' · ') || '조용한 회복'
  }
}

function estimateNumericDrift(run: RunLog) {
  const laps = run.laps.filter((lap) => lap.avgHeartRate && lap.paceSec)
  if (laps.length < 2) return 1
  const first = laps[0]
  const last = laps[laps.length - 1]
  const hrDiff = (last.avgHeartRate ?? 0) - (first.avgHeartRate ?? 0)
  const paceDiff = (last.paceSec ?? 0) - (first.paceSec ?? 0)
  if (hrDiff > 8 && paceDiff > 15) return 3
  if (hrDiff > 5 || paceDiff > 20) return 2
  return 0
}

function heartRateBand(value: number) {
  if (value <= 130) return 'z1'
  if (value <= 145) return 'z2'
  if (value <= 155) return 'z3'
  if (value <= 165) return 'z4'
  return 'z5'
}

function heartRateBandLabel(value: string) {
  const labels: Record<string, string> = {
    z1: '100~130bpm',
    z2: '131~145bpm',
    z3: '146~155bpm',
    z4: '156~165bpm',
    z5: '166bpm+'
  }
  return labels[value] ?? value
}

function periodDays(period: TrendPeriod) {
  if (period === '90d') return 90
  if (period === '180d') return 180
  if (period === '365d') return 365
  return null
}

function periodLabel(period: TrendPeriod) {
  if (period === '90d') return '최근 90일'
  if (period === '180d') return '최근 6개월'
  if (period === '365d') return '최근 1년'
  return '전체 기간'
}

function card(id: string, label: string, value: string, unit: string, hint: string, tone: TrendInsightTone): TrendInsightCard {
  return { id, label, value, unit, hint, tone }
}

function prescription(status: TrendPrescriptionImpact['status'], title: string, reasons: string[]): TrendPrescriptionImpact {
  return { status, title, reasons }
}

function evidenceFromRuns(runs: RunLog[], role: TrendEvidenceRun['role'], reason: string): TrendEvidenceRun[] {
  return runs.map((run) => ({ runId: run.id, role, reason }))
}

function emptyResult(lens: TrendLensKey, title: string, summary: string): TrendLensResult {
  return {
    lens,
    title,
    summary,
    hero: {
      value: '-',
      label: title,
      detail: summary,
      tone: 'neutral',
      confidence: 'low'
    },
    cards: [],
    chart: [],
    explanations: [summary],
    evidenceRuns: [],
    prescriptionImpact: prescription('not-enough-data', '데이터 부족', [summary])
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function signedNumber(value: number, unit: string) {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}${unit}`
}

function daysBetween(dateText: string, base: Date) {
  return Math.floor((base.getTime() - parseDate(dateText).getTime()) / dayMs)
}

function parseDate(value: string) {
  const [year, month, date] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, date)
}
