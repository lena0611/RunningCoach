/**
 * 의도 달성률(#310, Phase 2): 저장된 SessionIntent.targets 와 실제 RunLog 를 비교해
 * "의도 대비 얼마나 그대로 수행했는가"를 0~100%로 산출하는 순수 함수.
 *
 * 가중치: 심박 상한 준수 40% + 후반 페이스 유지 35% + RPE 범위 25%.
 * 평가 불가한 항목(데이터 없음)은 빼고 가용 가중치로 정규화한다.
 * ⚠️ 휴리스틱 점수이며 의학/성과 판정이 아니다.
 */

import type { RunLog } from '@/entities/run/model'
import type { SessionIntent } from '@/entities/session-intent/model'
import { evaluateLapDrift } from '@/shared/lib/lapDrift'

export type FulfillmentComponentKey = 'hr' | 'pace' | 'rpe'

export type FulfillmentComponent = {
  key: FulfillmentComponentKey
  label: string
  weight: number
  /** 0~1, 평가 불가면 null. */
  score: number | null
  detail: string
}

export type IntentFulfillment = {
  pct: number
  components: FulfillmentComponent[]
  resultSummary: string
}

const HR_WEIGHT = 0.4
const PACE_WEIGHT = 0.35
const RPE_WEIGHT = 0.25

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function scoreHr(intent: SessionIntent, run: RunLog): FulfillmentComponent {
  const ceiling = intent.targets.hrCeilingBpm
  const avg = run.avgHeartRate
  if (!ceiling || avg === null) {
    return { key: 'hr', label: '심박 상한', weight: HR_WEIGHT, score: null, detail: '심박 데이터 없음' }
  }
  // 상한 이내면 만점, 초과 15bpm 에서 0점.
  const score = avg <= ceiling ? 1 : clamp01(1 - (avg - ceiling) / 15)
  return {
    key: 'hr',
    label: '심박 상한',
    weight: HR_WEIGHT,
    score,
    detail: `평균심박 ${avg} / 상한 ${ceiling}${avg <= ceiling ? ' ✓' : ''}`
  }
}

function scorePace(run: RunLog): FulfillmentComponent {
  const drift = evaluateLapDrift(run)
  if (drift.paceDeltaSec === null) {
    return { key: 'pace', label: '후반 페이스 유지', weight: PACE_WEIGHT, score: null, detail: '랩 데이터 부족' }
  }
  const delta = drift.paceDeltaSec
  // 후반이 같거나 빠르면 만점, 30초/km 느려지면 0점.
  const score = delta <= 0 ? 1 : clamp01(1 - delta / 30)
  return {
    key: 'pace',
    label: '후반 페이스 유지',
    weight: PACE_WEIGHT,
    score,
    detail: `후반 ${delta >= 0 ? '+' : ''}${delta}초/km${delta <= 0 ? ' ✓' : ''}`
  }
}

function scoreRpe(intent: SessionIntent, run: RunLog): FulfillmentComponent {
  const range = intent.targets.rpeRange
  const rpe = run.rpe
  if (!range || rpe === null) {
    return { key: 'rpe', label: 'RPE 범위', weight: RPE_WEIGHT, score: null, detail: 'RPE 입력 없음' }
  }
  const [min, max] = range
  let score = 1
  if (rpe < min) score = clamp01(1 - (min - rpe) / 3)
  else if (rpe > max) score = clamp01(1 - (rpe - max) / 3)
  return {
    key: 'rpe',
    label: 'RPE 범위',
    weight: RPE_WEIGHT,
    score,
    detail: `RPE ${rpe} (목표 ${min}~${max})${rpe >= min && rpe <= max ? ' ✓' : ''}`
  }
}

export function computeIntentFulfillment(intent: SessionIntent, run: RunLog): IntentFulfillment | null {
  const components = [scoreHr(intent, run), scorePace(run), scoreRpe(intent, run)]
  const assessable = components.filter((c) => c.score !== null)
  if (!assessable.length) return null

  const totalWeight = assessable.reduce((sum, c) => sum + c.weight, 0)
  const weighted = assessable.reduce((sum, c) => sum + (c.score as number) * c.weight, 0)
  const pct = Math.round((weighted / totalWeight) * 100)

  return {
    pct,
    components,
    resultSummary: assessable.map((c) => c.detail).join(' · ')
  }
}
