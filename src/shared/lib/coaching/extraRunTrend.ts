/**
 * 예정 외 추가 런 추세 추적 + 넌지시 질문 (#380 후속).
 *
 * 코치는 추가 런을 단발성으로 흘리지 않고 **추세**를 본다: 패턴인지, 주간 볼륨에 의미 있게
 * 기여하는지. 임계를 넘으면 적절한 타이밍에 **관심을 표현하며 의도를 묻는다**(긍/부정 단정 전).
 * 의도 파악 후 분기 피드백(브랜치 목표/훈련 추가 vs 주의)은 후속 증분에서 처리한다.
 *
 * 순수 로직 — 어떤 런이 "추가(미귀속)"인지는 호출부가 attributedRunIds 로 알려준다.
 */

import type { RunLog } from '@/entities/run/model'

const WINDOW_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000
/** 패턴으로 보는 최소 추가 런 횟수(최근 30일). 그 미만은 단발성. */
export const EXTRA_RUN_PATTERN_MIN = 3
/** 의미 있는 볼륨 임계: 최근 볼륨 중 추가 런 비중. */
export const EXTRA_RUN_MEANINGFUL_SHARE = 0.15

export type ExtraRunTrend = {
  /** 최근 30일 추가(미귀속) 런 수. */
  count: number
  /** 추가 런 누적 거리(km). */
  extraVolumeKm: number
  /** 추가 런이 최근 총 볼륨에서 차지하는 비중(0~1). */
  weekShare: number
  /** 단발성 아님(패턴). */
  isPattern: boolean
  /** 주간 볼륨에 의미 있게 기여. */
  isMeaningfulVolume: boolean
  /** 패턴이고 볼륨도 의미 있어 코치가 관심 가질 단계. */
  noteworthy: boolean
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * 추가 런 추세를 분석한다. attributedRunIds = 스케줄 세션/의도에 귀속된 런 id 집합(따라잡기 포함).
 * 거기 없는 런이 "예정 외 추가 런".
 */
export function analyzeExtraRunTrend(
  runs: RunLog[],
  attributedRunIds: Set<string>,
  today: Date,
  /** 플랜 시작일(YYYY-MM-DD). 이 날짜 이전 런은 "플랜 없던 시절"이라 추가런으로 세지 않는다. */
  planStartDate: string | null = null
): ExtraRunTrend {
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const windowSince = start.getTime() - (WINDOW_DAYS - 1) * MS_PER_DAY
  const planSince = planStartDate ? new Date(`${planStartDate}T00:00:00`).getTime() : -Infinity
  const since = Math.max(windowSince, planSince)

  const recent = runs.filter((r) => new Date(`${r.date}T00:00:00`).getTime() >= since)
  const totalKm = recent.reduce((s, r) => s + (r.distanceKm ?? 0), 0)
  const extra = recent.filter((r) => !attributedRunIds.has(r.id))
  const extraVolumeKm = round1(extra.reduce((s, r) => s + (r.distanceKm ?? 0), 0))
  const weekShare = totalKm > 0 ? extraVolumeKm / totalKm : 0

  const isPattern = extra.length >= EXTRA_RUN_PATTERN_MIN
  const isMeaningfulVolume = weekShare >= EXTRA_RUN_MEANINGFUL_SHARE
  return {
    count: extra.length,
    extraVolumeKm,
    weekShare: Math.round(weekShare * 100) / 100,
    isPattern,
    isMeaningfulVolume,
    noteworthy: isPattern && isMeaningfulVolume
  }
}

export type ExtraRunInquiry = {
  /** 코치가 관심을 표현하며 의도를 묻는 한 줄(넌지시). */
  message: string
  /** 의도 선택지(트레이니가 고르면 분기 피드백으로). */
  options: string[]
}

/**
 * 추세가 noteworthy 일 때만 넌지시 질문을 만든다(긍/부정 단정 없이 관심+의도 질문). 아니면 null.
 */
export function buildExtraRunInquiry(trend: ExtraRunTrend): ExtraRunInquiry | null {
  if (!trend.noteworthy) return null
  return {
    message: `최근 지정 훈련 외 러닝이 ${trend.count}회(${trend.extraVolumeKm}km)나 되네요 — 꽤 인상적이에요. 왜 더 뛰고 계세요?`,
    options: ['컨디션이 좋아서', '빠진 훈련 보충', '스트레스 해소', '그냥 더 하고 싶어서']
  }
}
