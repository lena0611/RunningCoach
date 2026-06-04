import type { RunLog } from '@/entities/run/model'
import type { AthleteProfile, PersonalBest, RunnerLevel } from '@/entities/training-memory/model'
import { getRunsWithinDays, sumDistance } from '@/shared/lib/runStats'

export type RunnerLevelDerivation = {
  level: RunnerLevel
  source: 'auto' | 'manual'
  score: number
  dataSufficiency: 'low' | 'ok'
  reasons: string[]
}

export const RUNNER_LEVEL_LABEL: Record<RunnerLevel, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급'
}

const MIN_PB_DISTANCE_KM = 3

// 경력 1차 base + 볼륨/빈도/PB 페이스 보정 점수제.
// 데이터가 빈약하면 보수적으로 초급으로 본다. (domain-rules.md 러너 레벨 규칙)
export function deriveRunnerLevel(profile: AthleteProfile, runs: RunLog[], today = new Date()): RunnerLevelDerivation {
  const reasons: string[] = []

  const expMonths = profile.runningExperienceMonths
  const expKnown = expMonths !== null && Number.isFinite(expMonths)
  let expPts = 0
  if (!expKnown) {
    reasons.push('러닝 경력 미입력으로 경력 점수는 보수적으로 0.')
  } else if (expMonths! < 12) {
    expPts = 0
    reasons.push(`러닝 경력 ${expMonths}개월(1년 미만)으로 기반 형성 단계.`)
  } else if (expMonths! < 36) {
    expPts = 2
    reasons.push(`러닝 경력 ${expMonths}개월(1~3년)으로 중급 기반.`)
  } else {
    expPts = 4
    reasons.push(`러닝 경력 ${expMonths}개월(3년 이상)으로 충분한 경험.`)
  }

  const recent30 = getRunsWithinDays(runs, 30, today)
  const volume30 = sumDistance(recent30)
  let volumePts = 0
  if (volume30 < 40) volumePts = 0
  else if (volume30 < 100) volumePts = 1
  else if (volume30 < 180) volumePts = 2
  else volumePts = 3
  reasons.push(`최근 30일 볼륨 ${volume30}km.`)

  // 최근 30일 실제 러닝 빈도(주당)로 추정. weeklyRunDaysTarget은 목표값이라 보조로만 쓴다.
  const weeklyFreq = recent30.length / (30 / 7)
  let freqPts = 0
  if (weeklyFreq < 2.5) freqPts = 0
  else if (weeklyFreq < 4.5) freqPts = 1
  else freqPts = 2
  reasons.push(`최근 30일 주당 러닝 약 ${weeklyFreq.toFixed(1)}회.`)

  const pbPace = fastestPbPaceSecPerKm(profile.personalBests)
  const pbKnown = pbPace !== null
  let pbPts = 0
  if (!pbKnown) {
    reasons.push('기준 거리(3km+) PB 미입력으로 페이스 점수는 0.')
  } else if (pbPace! > 390) {
    pbPts = 0
    reasons.push(`PB 환산 페이스 ${formatPace(pbPace!)}/km(6분30초 초과).`)
  } else if (pbPace! > 330) {
    pbPts = 1
    reasons.push(`PB 환산 페이스 ${formatPace(pbPace!)}/km(5분30초~6분30초).`)
  } else if (pbPace! > 285) {
    pbPts = 2
    reasons.push(`PB 환산 페이스 ${formatPace(pbPace!)}/km(4분45초~5분30초).`)
  } else {
    pbPts = 3
    reasons.push(`PB 환산 페이스 ${formatPace(pbPace!)}/km(4분45초 미만).`)
  }

  const score = expPts + volumePts + freqPts + pbPts

  // 신뢰할 신호가 거의 없으면(경력·PB 미입력 + 볼륨/빈도 빈약) 데이터 부족으로 본다.
  const dataSufficiency: 'low' | 'ok' =
    !expKnown && !pbKnown && volume30 < 40 && weeklyFreq < 2 ? 'low' : 'ok'

  let level: RunnerLevel
  if (dataSufficiency === 'low') {
    level = 'beginner'
    reasons.push('데이터가 빈약해 보수적으로 초급으로 본다. 경력/PB/볼륨이 쌓이면 자동 상향된다.')
  } else if (score >= 7) {
    level = 'advanced'
  } else if (score >= 3) {
    level = 'intermediate'
  } else {
    level = 'beginner'
  }

  return { level, source: 'auto', score, dataSufficiency, reasons }
}

// athleteProfile.runnerLevel override를 우선 적용한다. 'auto'면 deriveRunnerLevel 결과를 쓴다.
export function resolveRunnerLevel(profile: AthleteProfile, runs: RunLog[], today = new Date()): RunnerLevelDerivation {
  const setting = profile.runnerLevel
  if (setting === 'beginner' || setting === 'intermediate' || setting === 'advanced') {
    return {
      level: setting,
      source: 'manual',
      score: 0,
      dataSufficiency: 'ok',
      reasons: [`사용자가 ${RUNNER_LEVEL_LABEL[setting]}으로 직접 설정.`]
    }
  }
  return deriveRunnerLevel(profile, runs, today)
}

function fastestPbPaceSecPerKm(personalBests: PersonalBest[]): number | null {
  const paces = personalBests
    .filter((pb) => pb.distanceKm >= MIN_PB_DISTANCE_KM && pb.durationSec > 0 && pb.distanceKm > 0)
    .map((pb) => pb.durationSec / pb.distanceKm)
  if (paces.length === 0) return null
  return Math.min(...paces)
}

function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm)
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}분${sec.toString().padStart(2, '0')}초`
}
