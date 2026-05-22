import type { RunLog } from '@/entities/run/model'
import type { TrainingMemory } from '@/entities/training-memory/model'
import { formatPace } from '@/shared/lib/format'
import { getEasyRatio, getLatestByTypes, getRunsWithinDays, getVolumeWarning, sumDistance } from '@/shared/lib/runStats'

export type RuleBasedCoaching = {
  readinessScore: number
  goalProbability: number
  recommendedSession: string
  dailyEvaluation: DailyTrainingEvaluation
  summary: string
  warnings: string[]
  reasons: string[]
  evidenceNotes: string[]
}

type DailyTrainingEvaluation = {
  score: number
  verdict: string
  purpose: string
  positives: string[]
  cautions: string[]
  nextAction: string
}

export function createRuleBasedCoaching(memory: TrainingMemory, runs: RunLog[], selectedRun: RunLog | null): RuleBasedCoaching {
  const recent7 = getRunsWithinDays(runs, 7)
  const recent14 = getRunsWithinDays(runs, 14)
  const recent30 = getRunsWithinDays(runs, 30)
  const lastRun = selectedRun ?? runs[0] ?? null
  const recent30Distance = sumDistance(recent30)
  const easyRatio = getEasyRatio(recent30)
  const latestTempo = getLatestByTypes(runs, ['Tempo'])
  const latestLong = getLatestByTypes(runs, ['LSD', 'Steady Long'])
  const warnings = [getVolumeWarning(runs)]
  const reasons: string[] = []
  const target = parseGoal(memory.goal)
  const hardSessions = recent7.filter(isHardSession).length
  const recent7Load = trainingLoad(recent7)
  const previous7 = recent14.filter((run) => !recent7.some((recent) => recent.id === run.id))
  const previous7Load = trainingLoad(previous7)
  const loadRatio = previous7Load > 0 ? recent7Load / previous7Load : null
  const easyDurationRatio = getEasyDurationRatio(recent30)
  const profile = memory.athleteProfile
  const pbSignal = estimatePersonalBestSignal(profile.personalBests, target)

  let readinessScore = 70
  if (sumDistance(recent7) > 35) readinessScore -= 15
  if (lastRun && isHardSession(lastRun)) readinessScore -= 10
  if (lastRun?.temperature && lastRun.temperature >= 30) {
    readinessScore -= 10
    warnings.push('최근 기록에 30도 이상 더위 조건이 있습니다.')
  }
  if (loadRatio !== null && loadRatio >= 1.35) readinessScore -= 10
  if (profile.runningExperienceMonths !== null && profile.runningExperienceMonths < 12) readinessScore -= 5
  if (profile.weeklyRunDaysTarget !== null && recent7.length > profile.weeklyRunDaysTarget + 1) readinessScore -= 5
  if (easyRatio >= 75) readinessScore += 8
  readinessScore = clamp(readinessScore, 20, 95)

  const age = getAge(profile.birthYear)
  if (age) reasons.push(`프로필: ${age}세, 러닝 경력 ${profile.runningExperienceMonths ?? '미입력'}개월 기준으로 보수 평가합니다.`)
  else reasons.push(`프로필: 나이 미입력, 러닝 경력 ${profile.runningExperienceMonths ?? '미입력'}개월 기준으로 보수 평가합니다.`)

  if (recent30Distance >= 90) reasons.push('최근 30일 볼륨은 목표 대비 기반 형성에 유리합니다.')
  else reasons.push('최근 30일 볼륨은 아직 보수적으로 늘리는 편이 좋습니다.')

  if (easyDurationRatio >= 75) reasons.push(`최근 30일 쉬운 강도 비율은 ${easyDurationRatio}%로 지구력 훈련 분포가 안정적입니다.`)
  else reasons.push(`최근 30일 쉬운 강도 비율은 ${easyDurationRatio}%로, 강한 훈련보다 Easy/Recovery 비중을 먼저 확보하는 편이 좋습니다.`)

  if (latestTempo) reasons.push(`최근 Tempo: ${latestTempo.date} ${latestTempo.distanceKm}km`)
  else reasons.push('최근 Tempo 기록이 없어 목표 페이스 적응 지표가 부족합니다.')

  if (latestLong) reasons.push(`최근 Long Run: ${latestLong.date} ${latestLong.type} ${latestLong.distanceKm}km`)
  else reasons.push('최근 Long Run 기록이 없어 지구력 지표가 부족합니다.')

  const performanceSignal = estimateGoalPerformanceSignal(runs, target)
  if (performanceSignal) reasons.push(performanceSignal)
  if (pbSignal) reasons.push(pbSignal.message)

  const goalProbability = clamp(
    Math.round(
      25 +
        recent30Distance * 0.25 +
        easyDurationRatio * 0.15 +
        (latestTempo ? 10 : 0) +
        (latestLong ? 10 : 0) +
        (performanceSignal ? 8 : 0) +
        (pbSignal?.goalProbabilityAdjustment ?? 0) +
        profileAdjustment(profile)
    ),
    15,
    90
  )
  const dailyEvaluation = evaluateDailyTraining(lastRun, target, {
    loadRatio,
    hardSessions,
    easyDurationRatio,
    profile,
    pbSignal
  })
  const recommendedSession = recommendNextSession(readinessScore, lastRun, recent7)

  return {
    readinessScore,
    goalProbability,
    recommendedSession,
    dailyEvaluation,
    summary: `${memory.goal} 기준 오늘 훈련 평가는 ${dailyEvaluation.verdict}입니다. 다음 훈련은 ${recommendedSession}을 권장합니다.`,
    warnings: Array.from(new Set(warnings)),
    reasons,
    evidenceNotes: [
      '훈련 분포는 최근 30일 기준 쉬운 강도 비중을 우선 확인한다. 다수의 지구력 훈련 연구에서 저강도 비중이 큰 분포가 반복적으로 관찰된다.',
      '급격한 부하 증가는 7일/이전 7일 비교로 보수적으로 경고하되, 부상 예측 공식처럼 단정하지 않는다.',
      '목표 가능성은 최근 훈련 일관성, 장거리 세션, Tempo 세션, 목표 페이스 근접 기록, 거리별 PB를 함께 보는 참고 점수다.',
      '나이, 성별, 러닝 경력은 절대 기준이 아니라 보수성 조절과 회복 경고에만 사용한다.'
    ]
  }
}

function recommendNextSession(readinessScore: number, lastRun: RunLog | null, recent7: RunLog[]) {
  const hardSessions = recent7.filter(isHardSession).length
  if (readinessScore < 50) return 'Recovery 30분 또는 휴식'
  if (lastRun && ['Tempo', 'Race', 'Steady Long', 'LSD'].includes(lastRun.type)) return 'Easy 40~50분'
  if (hardSessions >= 2) return 'Easy 45분, 심박 상한 우선'
  return `Easy 45분 + Strides 4회 또는 Tempo 준비주 (${formatPace(360)} 전후는 목표 기준 확인 필요)`
}

function evaluateDailyTraining(
  run: RunLog | null,
  target: GoalTarget,
  context: {
    loadRatio: number | null
    hardSessions: number
    easyDurationRatio: number
    profile: TrainingMemory['athleteProfile']
    pbSignal: PersonalBestSignal | null
  }
): DailyTrainingEvaluation {
  if (!run) {
    return {
      score: 0,
      verdict: '평가할 기록 없음',
      purpose: '오늘 선택된 RunLog가 없습니다.',
      positives: [],
      cautions: ['FIT 파일을 업로드하거나 Run Log에서 오늘 기록을 선택해야 평가할 수 있습니다.'],
      nextAction: '오늘 기록을 먼저 저장하세요.'
    }
  }

  const positives: string[] = []
  const cautions: string[] = []
  let score = 70
  const pace = run.avgPaceSec
  const durationMin = run.durationSec ? Math.round(run.durationSec / 60) : null
  const targetPace = target.paceSecPerKm
  const age = getAge(context.profile.birthYear)

  if (context.profile.runningExperienceMonths !== null && context.profile.runningExperienceMonths < 12 && isHardSession(run)) {
    cautions.push('러닝 경력 12개월 미만에서는 강한 세션의 빈도를 더 보수적으로 봅니다.')
    score -= 8
  }

  if (age && age >= 45 && isHardSession(run)) {
    cautions.push('45세 이상 프로필에서는 강한 세션 뒤 회복 간격을 더 보수적으로 봅니다.')
    score -= 5
  }

  if (context.profile.weeklyRunDaysTarget !== null && context.profile.weeklyRunDaysTarget <= 3 && isHardSession(run)) {
    cautions.push('주간 러닝 가능 횟수가 적으면 강한 세션보다 Easy/Long Run의 일관성이 우선입니다.')
    score -= 4
  }

  if (isEasySession(run)) {
    const easyFloor = targetPace + 30
    if (!pace || pace >= easyFloor) {
      positives.push('오늘 훈련은 쉬운 강도 기반으로 분류되어 누적 지구력 확보에 맞습니다.')
      score += 8
    } else {
      cautions.push(`Easy 계열인데 평균 페이스가 목표 페이스(${formatPace(targetPace)})에 너무 가깝습니다.`)
      score -= 10
    }
    if (run.type === 'Easy + Strides') positives.push('Strides는 Easy 기반을 해치지 않으면서 신경근 자극을 추가하는 목적에 맞습니다.')
  }

  if (run.type === 'Tempo') {
    if (pace && Math.abs(pace - targetPace) <= 25) {
      positives.push('Tempo 페이스가 10km 목표 페이스 주변이라 목표 특이성에 도움이 됩니다.')
      score += 12
    } else if (pace && pace < targetPace - 25) {
      cautions.push('Tempo가 목표 페이스보다 많이 빠릅니다. 반복되면 회복 부담이 커질 수 있습니다.')
      score -= 8
    } else {
      positives.push('Tempo 세션은 목표 페이스 적응을 확인하는 품질 훈련으로 볼 수 있습니다.')
      score += 6
    }
  }

  if (['LSD', 'Steady Long'].includes(run.type)) {
    if (run.distanceKm >= 8) {
      positives.push('10km 목표 대비 장거리 지구력 자극으로 충분한 거리입니다.')
      score += 10
    } else {
      cautions.push('Long Run 계열로 보기에는 거리가 짧습니다. 현재 단계에서는 Easy로 보는 편이 안전합니다.')
      score -= 6
    }
  }

  if (run.type === 'Race') {
    const predicted = predictRaceTime(run, target.distanceKm)
    if (predicted && predicted <= target.durationSec) {
      positives.push(`Riegel 예측 기준 ${target.distanceKm}km 목표 기록 안쪽 신호가 있습니다.`)
      score += 15
    } else if (predicted) {
      cautions.push(`Riegel 예측 기준 목표까지 약 ${formatPace(Math.round((predicted - target.durationSec) / target.distanceKm))}/km 개선이 필요합니다.`)
      score -= 5
    }
  }

  if (context.pbSignal) {
    if (context.pbSignal.predictedGoalSec <= target.durationSec) {
      positives.push('입력된 PB 기준으로 목표 기록에 근접했거나 이미 가능한 수행능력 신호가 있습니다.')
      score += 8
    } else {
      cautions.push(context.pbSignal.message)
      score -= context.pbSignal.predictedGoalSec - target.durationSec > 8 * 60 ? 6 : 3
    }
  }

  if (context.hardSessions >= 2 && isHardSession(run)) {
    cautions.push('최근 7일 안에 강한 세션이 이미 2회 이상입니다. 다음 훈련은 회복 우선입니다.')
    score -= 10
  }

  if (context.loadRatio !== null && context.loadRatio >= 1.35) {
    cautions.push('최근 7일 훈련 부하가 이전 7일보다 크게 증가했습니다. 부상 예측은 아니지만 보수적으로 조절해야 합니다.')
    score -= 10
  }

  if (run.temperature && run.temperature >= 30) {
    cautions.push('30도 이상 더위 조건입니다. 페이스보다 심박과 체감강도를 우선해야 합니다.')
    score -= 12
  }

  if (context.easyDurationRatio < 70) {
    cautions.push('최근 30일 쉬운 강도 비중이 낮습니다. 다음 며칠은 Easy/Recovery 비중을 늘리는 편이 좋습니다.')
    score -= 6
  }

  if (durationMin && durationMin >= 20) positives.push(`${durationMin}분 훈련으로 유효한 유산소 자극을 확보했습니다.`)

  const verdict = score >= 78 ? '목표에 잘 맞음' : score >= 60 ? '대체로 적절' : score >= 45 ? '주의 필요' : '회복 우선'

  return {
    score: clamp(score, 20, 95),
    verdict,
    purpose: describePurpose(run),
    positives,
    cautions,
    nextAction: cautions.length ? '다음 훈련은 Easy 또는 Recovery로 조절하고 강한 세션을 연속 배치하지 마세요.' : '다음 훈련은 주간 패턴에 따라 Easy + Strides 또는 Tempo 준비주로 이어가도 됩니다.'
  }
}

function describePurpose(run: RunLog): string {
  if (run.type === 'Recovery') return '회복과 혈류 확보'
  if (run.type === 'Easy') return '저강도 유산소 기반 형성'
  if (run.type === 'Easy + Strides') return '저강도 기반 유지와 짧은 속도 자극'
  if (run.type === 'Tempo') return '10km 목표 페이스 적응과 젖산역치 주변 자극'
  if (run.type === 'LSD') return '긴 시간 저강도 지구력'
  if (run.type === 'Steady Long') return '장거리 지구력과 약간 높은 지속 강도'
  if (run.type === 'Race') return '현재 수행능력 확인'
  return '목적 미확정'
}

function estimateGoalPerformanceSignal(runs: RunLog[], target: GoalTarget): string | null {
  const candidates = runs
    .filter((run) => run.durationSec && run.distanceKm >= 3 && ['Race', 'Tempo'].includes(run.type))
    .map((run) => ({ run, predicted: predictRaceTime(run, target.distanceKm) }))
    .filter((item): item is { run: RunLog; predicted: number } => item.predicted !== null)
    .sort((a, b) => a.predicted - b.predicted)

  const best = candidates[0]
  if (!best) return null
  const deltaSec = best.predicted - target.durationSec
  if (deltaSec <= 0) return `최근 ${best.run.type} 기록의 Riegel 예측은 목표 기록에 도달 가능한 신호입니다.`
  return `최근 ${best.run.type} 기록의 Riegel 예측은 목표까지 약 ${Math.round(deltaSec / 60)}분 차이가 있습니다.`
}

type PersonalBestSignal = {
  message: string
  predictedGoalSec: number
  goalProbabilityAdjustment: number
}

function estimatePersonalBestSignal(personalBests: TrainingMemory['athleteProfile']['personalBests'], target: GoalTarget): PersonalBestSignal | null {
  const candidates = personalBests
    .filter((pb) => pb.durationSec > 0 && pb.distanceKm > 0)
    .map((pb) => ({
      pb,
      predictedGoalSec: Math.round(pb.durationSec * (target.distanceKm / pb.distanceKm) ** 1.06)
    }))
    .sort((a, b) => a.predictedGoalSec - b.predictedGoalSec)

  const best = candidates[0]
  if (!best) return null

  const deltaSec = best.predictedGoalSec - target.durationSec
  if (deltaSec <= 0) {
    return {
      message: `PB ${best.pb.distanceKm}km 기준 Riegel 예측은 목표 기록 안쪽입니다.`,
      predictedGoalSec: best.predictedGoalSec,
      goalProbabilityAdjustment: 12
    }
  }

  return {
    message: `PB ${best.pb.distanceKm}km 기준 Riegel 예측은 목표까지 약 ${Math.round(deltaSec / 60)}분 차이가 있습니다.`,
    predictedGoalSec: best.predictedGoalSec,
    goalProbabilityAdjustment: deltaSec <= 3 * 60 ? 8 : deltaSec <= 8 * 60 ? 4 : -4
  }
}

function profileAdjustment(profile: TrainingMemory['athleteProfile']): number {
  let adjustment = 0
  if (profile.runningExperienceMonths !== null) {
    if (profile.runningExperienceMonths >= 24) adjustment += 4
    else if (profile.runningExperienceMonths < 12) adjustment -= 4
  }
  if (profile.weeklyRunDaysTarget !== null) {
    if (profile.weeklyRunDaysTarget >= 4) adjustment += 3
    else if (profile.weeklyRunDaysTarget <= 2) adjustment -= 3
  }
  return adjustment
}

function getAge(birthYear: number | null): number | null {
  if (!birthYear) return null
  const age = new Date().getFullYear() - birthYear
  return age > 0 && age < 120 ? age : null
}

function parseGoal(goal: string): GoalTarget {
  const distanceMatch = goal.match(/(\d+(?:\.\d+)?)\s*km/i)
  const colonTimeMatch = goal.match(/(\d{1,3})\s*:\s*(\d{2})/)
  const minuteTimeMatch = goal.match(/(\d{1,3})\s*분/)
  const distanceKm = distanceMatch ? Number(distanceMatch[1]) : 10
  let durationSec = 59 * 60 + 59

  if (colonTimeMatch) {
    durationSec = Number(colonTimeMatch[1]) * 60 + Number(colonTimeMatch[2])
  } else if (minuteTimeMatch) {
    durationSec = Number(minuteTimeMatch[1]) * 60
  }

  return {
    distanceKm,
    durationSec,
    paceSecPerKm: Math.round(durationSec / distanceKm)
  }
}

type GoalTarget = {
  distanceKm: number
  durationSec: number
  paceSecPerKm: number
}

function predictRaceTime(run: RunLog, targetDistanceKm: number): number | null {
  if (!run.durationSec || run.distanceKm <= 0) return null
  return Math.round(run.durationSec * (targetDistanceKm / run.distanceKm) ** 1.06)
}

function getEasyDurationRatio(runs: RunLog[]): number {
  const total = runs.reduce((sum, run) => sum + (run.durationSec ?? 0), 0)
  if (!total) return 0
  const easy = runs.filter(isEasySession).reduce((sum, run) => sum + (run.durationSec ?? 0), 0)
  return Math.round((easy / total) * 100)
}

function trainingLoad(runs: RunLog[]): number {
  return runs.reduce((sum, run) => sum + ((run.durationSec ?? 0) / 60) * intensityWeight(run), 0)
}

function intensityWeight(run: RunLog): number {
  if (run.type === 'Recovery') return 0.8
  if (['Easy', 'Easy + Strides', 'LSD'].includes(run.type)) return 1
  if (run.type === 'Steady Long') return 1.35
  if (run.type === 'Tempo') return 1.6
  if (run.type === 'Race') return 2
  return 1.1
}

function isEasySession(run: RunLog): boolean {
  return ['Recovery', 'Easy', 'Easy + Strides', 'LSD'].includes(run.type)
}

function isHardSession(run: RunLog): boolean {
  return ['Tempo', 'Race', 'Steady Long'].includes(run.type)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
