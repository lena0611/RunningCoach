import type { RunLog, RunType } from '@/entities/run/model'
import { getActiveGoal, getActiveInjuryItem, type TrainingMemory } from '@/entities/training-memory/model'
import { formatDuration, formatPace } from '@/shared/lib/format'
import { getAgeLoadWeight, getEasyRatio, getRunsWithinDays, sumDistance } from '@/shared/lib/runStats'
import { getRaceProjection } from '@/shared/lib/performanceProjection'
import { deriveHeartRateModel, deriveObservedMaxHr, type HeartRateModel } from '@/shared/lib/heartRateZones'
import { evaluateLapDrift } from '@/shared/lib/lapDrift'
import { computeTempoCeilingAdaptation, gradeTempoRun, type TempoCeilingAdaptation, type TempoGrade } from '@/shared/lib/coaching/tempoAdaptation'
import { evaluateSteadyLong } from '@/shared/lib/coaching/sessionQuality'

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

export type TrendOverallItem = {
  label: string
  title: string
  detail: string
  tone: TrendInsightTone
  lens?: TrendLensKey
}

export type TrendOverallSummary = {
  title: string
  tone: TrendInsightTone
  confidence: TrendInsightConfidence
  recentFlow: TrendOverallItem
  bestSignal: TrendOverallItem
  cautionSignal: TrendOverallItem
  prescriptionDirection: TrendOverallItem
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

export type TrendAnalysis = {
  lensResults: Record<TrendLensKey, TrendLensResult>
  overallSummary: TrendOverallSummary
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

type EfficiencyBandSummary = {
  count: number
  medianPaceSec: number
  avgTemperature: number | null
  avgElevationPerKm: number | null
  dominantCourseType: RunLog['courseType'] | null
}

type LoadSignal = {
  run: RunLog
  hard: boolean
  watch: boolean
  reason: string
}

const hardTypes: RunType[] = ['Tempo', 'Steady Long', 'Race']
const qualityTypes: RunType[] = ['Easy + Strides', 'Tempo', 'LSD', 'Steady Long', 'Race']
const lensOrder: TrendLensKey[] = ['goal', 'efficiency', 'intensity', 'quality', 'recovery']
const lensQuestionLabels: Record<TrendLensKey, string> = {
  goal: '목표까지',
  efficiency: '같은 심박에서',
  intensity: '무리했나',
  quality: '잘 수행했나',
  recovery: '회복됐나'
}
const warningLensPriority: TrendLensKey[] = ['recovery', 'intensity', 'goal', 'quality', 'efficiency']
const goodLensPriority: TrendLensKey[] = ['goal', 'recovery', 'quality', 'efficiency', 'intensity']
const dayMs = 24 * 60 * 60 * 1000

export function buildTrendLensResult(input: TrendInput): TrendLensResult {
  const today = input.today ?? new Date()
  const runs = [...input.runs].sort((a, b) => a.date.localeCompare(b.date))
  if (!runs.length) return emptyResult(input.lens, '러닝 기록이 필요합니다.', '추세를 보려면 먼저 기록을 저장해야 합니다.')

  const window = getDateWindow(runs, input.period, input.baseline, input.memory, today)
  const observed = deriveObservedMaxHr(runs.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })), today)
  const hr = deriveHeartRateModel(input.memory.athleteProfile, today.getFullYear(), observed)
  // tempoCeiling은 goal/quality 렌즈만 사용하므로 적응 계산도 그 두 경우에만 한다(efficiency/intensity/recovery는 base).
  if (input.lens === 'efficiency') return buildEfficiencyLens(window, hr)
  if (input.lens === 'intensity') return buildIntensityLens(window, today, hr)
  if (input.lens === 'recovery') return buildRecoveryLens(window)
  // Tempo 상한 적응(#301): 추정 base 위에 검증된 상향만 얹는다(채택값 sticky). effective를 Tempo 평가/목표 예상에 쓴다.
  const tempoAdaptation = computeTempoCeilingAdaptation(runs, hr.tempoCeilingBpm, {
    injuryActive: Boolean(getActiveInjuryItem(input.memory)),
    adoptedCeilingBpm: input.memory.adaptiveTrainingProfile.tempoCeiling?.adoptedBpm ?? null
  })
  const hrEffective =
    tempoAdaptation.effectiveCeilingBpm !== null && tempoAdaptation.effectiveCeilingBpm !== hr.tempoCeilingBpm
      ? { ...hr, tempoCeilingBpm: tempoAdaptation.effectiveCeilingBpm }
      : hr
  if (input.lens === 'goal') return buildGoalLens(runs, input.memory, today, hrEffective)
  return buildQualityLens(window, hrEffective, tempoAdaptation)
}

export function buildTrendAnalysis(input: Omit<TrendInput, 'lens'>): TrendAnalysis {
  const rawResults = buildTrendLensResults(input)
  const gatedResults = applyTrendSafetyGate(rawResults)
  return {
    lensResults: Object.fromEntries(gatedResults.map((result) => [result.lens, result])) as Record<TrendLensKey, TrendLensResult>,
    overallSummary: buildTrendOverallSummaryFromResults(input, gatedResults)
  }
}

export function buildTrendOverallSummary(input: Omit<TrendInput, 'lens'>): TrendOverallSummary {
  return buildTrendAnalysis(input).overallSummary
}

function buildTrendLensResults(input: Omit<TrendInput, 'lens'>) {
  return lensOrder.map((lens) => buildTrendLensResult({ ...input, lens }))
}

function buildTrendOverallSummaryFromResults(input: Omit<TrendInput, 'lens'>, lensResults: TrendLensResult[]): TrendOverallSummary {
  if (!input.runs.length) {
    return {
      title: '기록을 쌓으면 판단합니다',
      tone: 'neutral',
      confidence: 'low',
      recentFlow: overallItem('최근 흐름', '데이터 부족', '러닝 기록이 저장되면 목표, 효율, 강도, 품질, 회복을 함께 봅니다.', 'neutral'),
      bestSignal: overallItem('가장 좋은 신호', '아직 없음', '좋은 신호를 고르기에는 비교 가능한 기록이 부족합니다.', 'neutral'),
      cautionSignal: overallItem('가장 조심할 신호', '아직 없음', '주의 신호도 기록이 쌓인 뒤 판단합니다.', 'neutral'),
      prescriptionDirection: overallItem('다음 처방 방향', '기록 확보 우선', 'HealthKit 또는 수동 기록을 저장한 뒤 다음 훈련 조정 신호를 확인합니다.', 'neutral')
    }
  }

  const warning = pickLensResult(lensResults, warningLensPriority, (result) => result.hero.tone === 'warning')
  const good = pickLensResult(lensResults, goodLensPriority, (result) => result.hero.tone === 'good')
  const reduce = pickLensResult(lensResults, warningLensPriority, (result) => result.prescriptionImpact.status === 'reduce-or-recover')
  const raise = pickLensResult(lensResults, goodLensPriority, (result) => result.prescriptionImpact.status === 'raise-candidate')
  const raiseBlocker = raiseBlockerResult(lensResults)
  const dataReadyCount = lensResults.filter((result) => result.hero.confidence !== 'low').length
  const goodCount = lensResults.filter((result) => result.hero.tone === 'good').length
  const warningCount = lensResults.filter((result) => result.hero.tone === 'warning').length
  const tone: TrendInsightTone = reduce || warningCount >= 2 ? 'warning' : goodCount >= 2 && !warning ? 'good' : warning ? 'watch' : 'watch'
  const confidence: TrendInsightConfidence = dataReadyCount >= 4 ? 'high' : dataReadyCount >= 2 ? 'medium' : 'low'

  return {
    title: overallTitle(tone, goodCount, warningCount),
    tone,
    confidence,
    recentFlow: overallItem(
      '최근 흐름',
      recentFlowTitle(tone, goodCount, warningCount),
      recentFlowDetail(lensResults, goodCount, warningCount, dataReadyCount),
      tone
    ),
    bestSignal: good
      ? resultItem('가장 좋은 신호', good, '좋은 쪽으로 확인된 신호입니다.')
      : overallItem('가장 좋은 신호', '확실한 상승 신호 부족', '좋은 흐름을 고르기에는 아직 관찰 또는 데이터 부족 신호가 더 큽니다.', 'watch'),
    cautionSignal: warning
      ? resultItem('가장 조심할 신호', warning, '다음 처방을 보수적으로 만드는 신호입니다.')
      : overallItem('가장 조심할 신호', '큰 경고 없음', '현재 렌즈 조합에서는 강하게 낮춰야 할 경고가 크지 않습니다.', 'good'),
    prescriptionDirection: prescriptionDirectionItem(reduce, raiseBlocker ? undefined : raise, raiseBlocker)
  }
}

function buildGoalLens(runs: RunLog[], memory: TrainingMemory, today: Date, hr: HeartRateModel): TrendLensResult {
  const activeGoal = getActiveGoal(memory)
  const projection = getRaceProjection(
    runs,
    activeGoal,
    today,
    getActiveInjuryItem(memory),
    getAgeLoadWeight(memory.athleteProfile.birthYear, today),
    { easyCeilingBpm: hr.easyCeilingBpm, tempoCeilingBpm: hr.tempoCeilingBpm }
  )
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

function buildEfficiencyLens(window: DateWindow, hr: HeartRateModel): TrendLensResult {
  if (!hr.zones.length) {
    return emptyResult('efficiency', '심박 기준 데이터 부족', '나이 또는 심박(역치/최대) 정보가 있어야 같은 심박대 효율을 비교합니다.')
  }
  const current = comparableHeartRatePace(window.current, hr)
  const baseline = comparableHeartRatePace(window.baseline, hr)
  const currentBest = chooseEfficiencyBand(current, baseline, hr)
  if (!currentBest) return emptyResult('efficiency', '효율 비교 데이터 부족', '심박과 페이스가 함께 있는 기록이 더 필요합니다.')

  const baseValue = baseline[currentBest.band]
  const currentValue = current[currentBest.band]
  const delta = baseValue && currentValue ? baseValue.medianPaceSec - currentValue.medianPaceSec : null
  const sampleCount = Math.min(currentValue?.count ?? 0, baseValue?.count ?? 0)
  const contextWarnings = baseValue && currentValue ? efficiencyContextWarnings(currentValue, baseValue) : []
  const tone = efficiencyTone(delta, sampleCount, contextWarnings)
  const confidence: TrendInsightConfidence = sampleCount >= 3 && !contextWarnings.length ? 'high' : sampleCount >= 2 ? 'medium' : 'low'

  return {
    lens: 'efficiency',
    title: '유산소 효율',
    summary: '같은 심박대에서 더 빠르게 달리게 됐는지 봅니다.',
    hero: {
      value: delta === null ? '비교 부족' : `${delta > 0 ? '+' : ''}${Math.round(delta)}초/km`,
      label: `${currentBest.label} 효율 변화`,
      detail: `${window.currentLabel} vs ${window.baselineLabel}${contextWarnings.length ? ` · ${contextWarnings[0]}` : ''}`,
      tone,
      confidence
    },
    cards: Object.entries(current).slice(0, 4).map(([band, item]) => {
      const base = baseline[band]
      const diff = base ? base.medianPaceSec - item.medianPaceSec : null
      const bandSampleCount = Math.min(item.count, base?.count ?? 0)
      const bandContextWarnings = base ? efficiencyContextWarnings(item, base) : []
      return card(
        band,
        heartRateBandLabel(band, hr),
        diff === null ? '비교 부족' : `${diff > 0 ? '+' : ''}${Math.round(diff)}`,
        diff === null ? '' : '초/km',
        `${item.count}개 기록 · 현재 ${formatPace(item.medianPaceSec)}/km`,
        efficiencyTone(diff, bandSampleCount, bandContextWarnings)
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

function buildIntensityLens(window: DateWindow, today: Date, hr: HeartRateModel): TrendLensResult {
  const currentDistance = sumDistance(window.current)
  const baselineDistance = sumDistance(window.baseline)
  const easyRatio = getEasyRatio(window.current)
  const loadSignals = window.current.map((run) => loadSignalForRun(run, hr.easyCeilingBpm))
  const loadWatchCount = loadSignals.filter((item) => item.hard || item.watch).length
  const current7 = sumDistance(getRunsWithinDays(window.current, 7, today))
  const previous7 = sumDistance(getRunsWithinDays(window.current, 14, today).filter((run) => !getRunsWithinDays(window.current, 7, today).some((recent) => recent.id === run.id)))
  const loadDelta = previous7 > 0 ? ((current7 - previous7) / previous7) * 100 : null
  const tone: TrendInsightTone = loadWatchCount >= 3 || (loadDelta !== null && loadDelta >= 35) ? 'warning' : easyRatio >= 70 ? 'good' : 'watch'

  return {
    lens: 'intensity',
    title: '강도 분포',
    summary: 'Easy 기반과 강훈련 밀도가 균형을 이루는지 봅니다.',
    hero: {
      value: `${easyRatio}%`,
      label: 'Easy 비율',
      detail: `부하 주의 ${loadWatchCount}회 · ${window.currentLabel}`,
      tone,
      confidence: window.current.length >= 5 ? 'high' : 'medium'
    },
    cards: [
      card('distance', '거리 변화', signedNumber(currentDistance - baselineDistance, 'km'), '', `${window.baselineLabel} 대비`, currentDistance >= baselineDistance ? 'good' : 'watch'),
      card('easy', 'Easy 비율', String(easyRatio), '%', '랩/페이스 기반', easyRatio >= 70 ? 'good' : easyRatio < 55 ? 'warning' : 'watch'),
      card('hard', '부하 주의', String(loadWatchCount), '회', '강훈련 또는 LSD 부하 신호', loadWatchCount >= 3 ? 'warning' : 'watch'),
      card('load', '최근 부하', loadDelta === null ? '비교 부족' : `${Math.round(loadDelta)}%`, '', '최근 7일 vs 이전 7일', loadDelta !== null && loadDelta >= 35 ? 'warning' : 'neutral')
    ],
    chart: typeDistributionPoints(window.current, hr.easyCeilingBpm),
    explanations: [
      'Easy 비율은 RunType만으로 계산하지 않고 가능한 경우 랩/페이스를 우선합니다.',
      '최근 부하 증가는 부상 예측 공식이 아니라 스케줄 보수성 조절 신호입니다.',
      loadWatchCount >= 3 ? '부하 신호가 한 주에 몰려 다음 처방 상향은 보류하는 편이 낫습니다.' : '강훈련 과밀 신호는 크지 않습니다.'
    ],
    evidenceRuns: loadSignals
      .filter((item) => item.hard || item.watch)
      .slice(-4)
      .map((item) => ({ runId: item.run.id, role: 'warning', reason: item.reason })),
    prescriptionImpact: prescription(
      tone === 'warning' ? 'reduce-or-recover' : 'maintain',
      tone === 'warning' ? '다음 세션 회복 또는 Easy 우선' : '주간 강도 분포 유지',
      ['강훈련 과밀과 부하 급증은 다음 추천 세션 강도를 낮추는 근거입니다.']
    )
  }
}

function buildQualityLens(window: DateWindow, hr: HeartRateModel, tempoAdaptation: TempoCeilingAdaptation): TrendLensResult {
  const qualityRuns = window.current.filter((run) => qualityTypes.includes(run.type))
  if (!qualityRuns.length) return emptyResult('quality', '품질 세션 부족', 'Tempo, Long Run, Easy + Strides 같은 품질 세션이 쌓이면 안정성을 봅니다.')
  const evaluations = qualityRuns.map((run) => evaluateQualityRun(run, hr))
  const stableCount = evaluations.filter((item) => item.stable).length
  const ratio = Math.round((stableCount / evaluations.length) * 100)
  const tone: TrendInsightTone = ratio >= 70 ? 'good' : ratio < 45 ? 'warning' : 'watch'
  const adaptationNote =
    tempoAdaptation.source === 'adapted'
      ? `Tempo 상한 적응: ${tempoAdaptation.rationale}`
      : tempoAdaptation.candidateCeilingBpm !== null
        ? `Tempo 상한 ${tempoAdaptation.candidateCeilingBpm}bpm 상향 후보 관찰 중(검증 ${tempoAdaptation.qualifyingCount}회).`
        : null

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
      detail: `${item.run.type}${item.grade ? ` · ${item.grade}등급` : ''} · ${item.reason}`,
      status: item.stable ? 'good' : 'watch',
      confidence: item.run.laps.length >= 2 ? 'high' : 'medium'
    })),
    explanations: [
      'Tempo는 이진 성공/실패가 아니라 A/B/C/D 등급으로 봅니다(자극 확보 × 처방 준수). A·B는 안정으로 셉니다.',
      'Tempo 상한은 고정 추정값이 아니라 최근 수행으로 검증·적응하는 "현재까지 확인된 최적 추정치"입니다.',
      ...(adaptationNote ? [adaptationNote] : []),
      '랩이나 심박 데이터가 부족한 세션은 낮은 confidence로 처리합니다.'
    ],
    evidenceRuns: evidenceFromRuns(qualityRuns.slice(-5), 'supporting', '품질 안정성 판단에 사용한 세션입니다.'),
    prescriptionImpact: prescription(
      tempoAdaptation.candidateCeilingBpm !== null || tone === 'good' ? 'raise-candidate' : 'maintain',
      tempoAdaptation.candidateCeilingBpm !== null
        ? `Tempo 상한 ${tempoAdaptation.candidateCeilingBpm}bpm 상향 후보`
        : tone === 'good' ? '동일 유형 처방 소폭 상향 후보' : '같은 처방 유지',
      [
        tempoAdaptation.candidateCeilingBpm !== null
          ? '최근 Tempo가 상한을 넘겨도 RPE·후반·회복이 안정적이라 상한 상향을 관찰 중입니다.'
          : '품질이 안정된 유형만 다음 단계로 올리고, 불안정한 유형은 반복 확인합니다.'
      ]
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
      card('gap', '긴 공백', String(checks.filter((item) => item.reason.includes('공백')).length), '회', '4일 이상', 'watch')
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

function comparableHeartRatePace(runs: RunLog[], hr: HeartRateModel) {
  const bands: Record<string, RunLog[]> = {}
  for (const run of runs) {
    if (!run.avgHeartRate || !run.avgPaceSec) continue
    const band = heartRateBand(run.avgHeartRate, hr)
    const list = bands[band] ?? []
    list.push(run)
    bands[band] = list
  }
  return Object.fromEntries(
    Object.entries(bands).map(([band, runs]) => [
      band,
      {
        count: runs.length,
        medianPaceSec: median(runs.map((run) => run.avgPaceSec).filter((value): value is number => value !== null)),
        avgTemperature: averageNullable(runs.map((run) => run.temperature)),
        avgElevationPerKm: averageNullable(runs.map((run) => run.elevationGainM !== null && run.distanceKm > 0 ? run.elevationGainM / run.distanceKm : null)),
        dominantCourseType: dominantCourseType(runs)
      }
    ])
  ) as Record<string, EfficiencyBandSummary>
}

function chooseEfficiencyBand(
  current: Record<string, EfficiencyBandSummary>,
  baseline: Record<string, EfficiencyBandSummary>,
  hr: HeartRateModel
) {
  const candidates = ['z2', 'z3', 'z4', 'z1', 'z5']
  const band = candidates.find((key) => current[key] && baseline[key]) ?? Object.keys(current)[0]
  return band ? { band, label: heartRateBandLabel(band, hr) } : null
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

function typeDistributionPoints(runs: RunLog[], easyCeilingBpm: number | null): TrendChartPoint[] {
  const byType = new Map<RunType, { distance: number; status: TrendInsightTone }>()
  for (const run of runs) {
    const previous = byType.get(run.type)
    const signal = loadSignalForRun(run, easyCeilingBpm)
    const status: TrendInsightTone = signal.hard || signal.watch ? 'watch' : 'good'
    byType.set(run.type, {
      distance: (previous?.distance ?? 0) + run.distanceKm,
      status: previous?.status === 'watch' || status === 'watch' ? 'watch' : 'good'
    })
  }
  return Array.from(byType.entries()).map(([type, item]) => ({
    id: type,
    label: type,
    date: '',
    value: Math.round(item.distance * 10) / 10,
    detail: `${type} ${item.distance.toFixed(1)}km`,
    status: item.status,
    confidence: 'medium'
  }))
}

function evaluateQualityRun(run: RunLog, hr: HeartRateModel) {
  const drift = estimateNumericDrift(run)
  // Tempo(#301): 이진 상한 초과 대신 A/B/C/D 등급화. Quality Lens 호환을 위해 A/B=안정, C/D=불안정으로 매핑.
  // hr.tempoCeilingBpm은 적응 effective 상한이 반영된 값이다.
  if (run.type === 'Tempo') {
    const g = gradeTempoRun(run, hr.tempoCeilingBpm, drift)
    const stable = g.grade === 'A' || g.grade === 'B'
    const score = g.grade === 'A' ? 92 : g.grade === 'B' ? 78 : g.grade === 'C' ? 52 : 30
    return { run, stable, grade: g.grade as TempoGrade | undefined, score, reason: g.reasons.join(' · ') || `${g.grade}등급` }
  }
  // Steady Long(#354 §6): 전후반 심박차를 그대로 드리프트로 보지 않고 후반 가속(네거티브 스플릿)을 보정해 등급화.
  if (run.type === 'Steady Long') {
    const sl = evaluateSteadyLong(run)
    if (sl.grade !== 'insufficient') {
      const stable = sl.grade === 'quality' || sl.grade === 'aggressive'
      const score = sl.grade === 'quality' ? 90 : sl.grade === 'aggressive' ? 76 : sl.grade === 'strained' ? 50 : 28
      return { run, stable, grade: undefined as TempoGrade | undefined, score, reason: sl.reasons.join(' · ') }
    }
  }
  // 개인 심박 상한이 없으면 상한 초과 판정은 하지 않고 드리프트/거리만 본다.
  const easyExceeded = hr.easyCeilingBpm !== null && run.type === 'Easy' && (run.maxHeartRate ?? run.avgHeartRate ?? 0) > hr.easyCeilingBpm + 5
  const longEnough = run.type === 'LSD' || run.type === 'Steady Long' ? run.distanceKm >= 10 : true
  const stable = !easyExceeded && longEnough && drift < 2
  const score = Math.max(0, 100 - (easyExceeded ? 20 : 0) - (!longEnough ? 20 : 0) - drift * 12)
  const reasons = [
    easyExceeded ? 'Easy 심박 상승' : '',
    !longEnough ? '롱런 거리 부족' : '',
    drift >= 2 ? '드리프트 주의' : ''
  ].filter(Boolean)
  return {
    run,
    stable,
    grade: undefined as TempoGrade | undefined,
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
    if (cost > 0) {
      cost += 1
      reasons.push(`${gap}일 공백 동반`)
    } else {
      reasons.push(`${gap}일 공백 단독 관찰`)
    }
  }
  return {
    run,
    nextRun,
    cost,
    reason: reasons.join(' · ') || '조용한 회복'
  }
}

function estimateNumericDrift(run: RunLog) {
  return evaluateLapDrift(run).level
}

function loadSignalForRun(run: RunLog, easyCeilingBpm: number | null): LoadSignal {
  if (hardTypes.includes(run.type)) {
    return { run, hard: true, watch: true, reason: `${run.type} 강훈련 세션` }
  }
  if (run.type !== 'LSD') {
    return { run, hard: false, watch: false, reason: '저강도 또는 일반 세션' }
  }

  const drift = evaluateLapDrift(run)
  const reasons = [
    easyCeilingBpm !== null && (run.avgHeartRate ?? 0) > easyCeilingBpm ? 'LSD 평균심박 상승' : '',
    (run.rpe ?? 0) >= 6 ? 'LSD RPE 높음' : '',
    drift.level >= 2 ? 'LSD 후반 드리프트 큼' : ''
  ].filter(Boolean)
  if (!reasons.length) {
    return { run, hard: false, watch: false, reason: '낮은 심박/RPE의 LSD' }
  }
  return { run, hard: false, watch: true, reason: reasons.join(' · ') }
}

function efficiencyTone(delta: number | null, sampleCount: number, contextWarnings: string[]): TrendInsightTone {
  if (delta === null) return 'neutral'
  if (delta <= -8) return 'warning'
  if (delta >= 8) return sampleCount >= 3 && !contextWarnings.length ? 'good' : 'watch'
  return 'watch'
}

function efficiencyContextWarnings(current: EfficiencyBandSummary, baseline: EfficiencyBandSummary) {
  const warnings: string[] = []
  if (
    current.avgTemperature !== null
    && baseline.avgTemperature !== null
    && Math.abs(current.avgTemperature - baseline.avgTemperature) >= 5
  ) {
    warnings.push('기온 차이 큼')
  }
  if (
    current.avgElevationPerKm !== null
    && baseline.avgElevationPerKm !== null
    && Math.abs(current.avgElevationPerKm - baseline.avgElevationPerKm) >= 8
  ) {
    warnings.push('고도 차이 큼')
  }
  if (
    current.dominantCourseType
    && baseline.dominantCourseType
    && current.dominantCourseType !== 'Unknown'
    && baseline.dominantCourseType !== 'Unknown'
    && current.dominantCourseType !== baseline.dominantCourseType
  ) {
    warnings.push('코스 차이 큼')
  }
  return warnings
}

function averageNullable(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  if (!valid.length) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function dominantCourseType(runs: RunLog[]) {
  const counts = new Map<RunLog['courseType'], number>()
  for (const run of runs) counts.set(run.courseType, (counts.get(run.courseType) ?? 0) + 1)
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] ?? null
}

function heartRateBand(value: number, hr: HeartRateModel) {
  const zone = hr.zones.find((item) => (item.minBpm === null || value >= item.minBpm) && (item.maxBpm === null || value <= item.maxBpm))
  // Z0는 효율 비교에서 z1 밴드로 합친다(아주 낮은 회복/이동 구간).
  switch (zone?.zone) {
    case 'Z0':
    case 'Z1':
      return 'z1'
    case 'Z2':
      return 'z2'
    case 'Z3':
      return 'z3'
    case 'Z4':
      return 'z4'
    default:
      return 'z5'
  }
}

function heartRateBandLabel(value: string, hr: HeartRateModel) {
  const zoneByBand: Record<string, HeartRateModel['zones'][number]['zone']> = {
    z1: 'Z1',
    z2: 'Z2',
    z3: 'Z3',
    z4: 'Z4',
    z5: 'Z5'
  }
  const zone = hr.zones.find((item) => item.zone === zoneByBand[value])
  if (!zone) return value
  // z1 밴드는 Z0(아주 낮음)를 흡수하므로 하한은 Z1 minBpm을 그대로 쓴다.
  if (zone.maxBpm === null) return `${zone.minBpm}bpm+`
  return `${zone.minBpm}~${zone.maxBpm}bpm`
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

function pickLensResult(results: TrendLensResult[], priority: TrendLensKey[], predicate: (result: TrendLensResult) => boolean) {
  for (const lens of priority) {
    const result = results.find((item) => item.lens === lens)
    if (result && predicate(result)) return result
  }
  return undefined
}

function applyTrendSafetyGate(results: TrendLensResult[]) {
  const raiseBlocker = raiseBlockerResult(results)
  if (!raiseBlocker) return results
  return results.map((result) => {
    if (result.prescriptionImpact.status !== 'raise-candidate') return result
    return {
      ...result,
      prescriptionImpact: blockedRaisePrescription(result, raiseBlocker)
    }
  })
}

function raiseBlockerResult(results: TrendLensResult[]) {
  return results.find((result) => result.lens === 'recovery' && result.hero.tone === 'warning')
    ?? results.find((result) => result.lens === 'intensity' && result.hero.tone === 'warning')
}

function blockedRaisePrescription(result: TrendLensResult, raiseBlocker: TrendLensResult): TrendPrescriptionImpact {
  return prescription(
    'maintain',
    '현재 처방 유지 후 1회 더 확인',
    [
      `${lensQuestionLabels[result.lens]} 신호는 좋지만 ${lensQuestionLabels[raiseBlocker.lens]} 렌즈가 주의 신호라 상향 후보를 바로 적용하지 않습니다.`,
      '좋은 신호는 유지하되 회복/부하 게이트가 안정된 뒤 다시 확인합니다.'
    ]
  )
}

function overallItem(label: string, title: string, detail: string, tone: TrendInsightTone, lens?: TrendLensKey): TrendOverallItem {
  return { label, title, detail, tone, lens }
}

function resultItem(label: string, result: TrendLensResult, fallback: string): TrendOverallItem {
  return overallItem(
    label,
    `${lensQuestionLabels[result.lens]} · ${result.hero.label}`,
    result.explanations[0] ?? result.hero.detail ?? fallback,
    result.hero.tone,
    result.lens
  )
}

function prescriptionDirectionItem(reduce?: TrendLensResult, raise?: TrendLensResult, raiseBlocker?: TrendLensResult): TrendOverallItem {
  if (reduce) {
    return overallItem(
      '다음 처방 방향',
      reduce.prescriptionImpact.title,
      reduce.prescriptionImpact.reasons[0] ?? '회복 또는 Easy 우선으로 다음 세션을 보수적으로 봅니다.',
      'warning',
      reduce.lens
    )
  }
  if (raise) {
    return overallItem(
      '다음 처방 방향',
      raise.prescriptionImpact.title,
      raise.prescriptionImpact.reasons[0] ?? '회복 비용이 조용하면 같은 유형의 처방을 소폭 올릴 수 있습니다.',
      'good',
      raise.lens
    )
  }
  if (raiseBlocker) {
    return overallItem(
      '다음 처방 방향',
      '현재 처방 유지 후 1회 더 확인',
      `${lensQuestionLabels[raiseBlocker.lens]} 렌즈가 주의 신호라 상향 후보를 바로 적용하지 않습니다.`,
      'watch',
      raiseBlocker.lens
    )
  }
  return overallItem('다음 처방 방향', '현재 루틴 유지', '뚜렷한 상향 또는 하향 신호보다 같은 처방을 반복 확인할 근거가 큽니다.', 'watch')
}

function overallTitle(tone: TrendInsightTone, goodCount: number, warningCount: number) {
  if (tone === 'warning') return '상향보다 회복 확인이 먼저입니다'
  if (tone === 'good') return '좋은 흐름이 여러 축에서 보입니다'
  if (warningCount > 0) return '좋은 신호와 주의 신호가 함께 있습니다'
  if (goodCount > 0) return '좋은 신호를 유지하며 관찰합니다'
  return '조금 더 기록을 보며 판단합니다'
}

function recentFlowTitle(tone: TrendInsightTone, goodCount: number, warningCount: number) {
  if (tone === 'warning') return '주의 쪽으로 기울었습니다'
  if (tone === 'good') return '전반적으로 좋아지는 중'
  if (goodCount > 0 && warningCount > 0) return '좋은 신호와 주의 신호가 공존'
  if (goodCount > 0) return '일부 좋은 신호 확인'
  return '관찰 유지'
}

function recentFlowDetail(results: TrendLensResult[], goodCount: number, warningCount: number, dataReadyCount: number) {
  const goodLabels = results.filter((result) => result.hero.tone === 'good').map((result) => lensQuestionLabels[result.lens])
  const warningLabels = results.filter((result) => result.hero.tone === 'warning').map((result) => lensQuestionLabels[result.lens])
  if (warningLabels.length) return `${warningLabels.join(', ')} 렌즈는 조심하고, ${goodLabels.length ? `${goodLabels.join(', ')} 신호는 유지합니다.` : '상향 판단은 보류합니다.'}`
  if (goodLabels.length) return `${goodLabels.join(', ')} 렌즈에서 좋은 신호가 보입니다. 회복 비용이 커지지 않는지 함께 봅니다.`
  if (dataReadyCount < 2) return '비교 가능한 렌즈가 아직 적어 최근 흐름을 확정하지 않습니다.'
  return `좋은 신호 ${goodCount}개, 주의 신호 ${warningCount}개로 현재는 유지 관찰이 적절합니다.`
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
