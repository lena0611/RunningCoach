/**
 * 세션 의도(SessionIntent) 도메인 모델 (#308, 에픽 #307 기반).
 *
 * 코치가 운동 전 "오늘 훈련 / 왜 / 목표 / 성공 기준"을 제시하고 저장하는 단위.
 *   - Phase 1: 생성·표시(Pre-run 카드)
 *   - Phase 2: 실행된 RunLog 와 매칭(runId)되어 "의도 달성률" 산출의 기준
 *   - Phase 5: 부하 하향 시 목표 보호 서술의 근거
 *
 * 약결합: goalId 는 training_memory.goals[].id(jsonb 임베드, FK 없음),
 *   runId 는 run_logs FK(삭제 시 null).
 */

import type { RunType } from '@/entities/run/model'

export type SessionIntentSource = 'coach' | 'user'

/** planned: 생성됨(미실행). completed: 런 매칭됨. skipped: 건너뜀. superseded: 다른 의도로 대체됨. */
export type SessionIntentStatus = 'planned' | 'completed' | 'skipped' | 'superseded'

/** 성공 기준의 정량 의도. 심박 상한이 1순위(페이스 아님, domain-rules). */
export type SessionIntentTargets = {
  /** 이 세션에서 넘기지 않을 최대 심박(bpm). heartRateModel 에서 유래. */
  hrCeilingBpm: number | null
  /** 목표 평균심박 범위 [min, max]. */
  hrRange: [number, number] | null
  /** 목표 RPE 범위 [min, max]. */
  rpeRange: [number, number] | null
  /** 페이스 운영 의도(예: "후반 페이스 유지"). 정량화 어려워 문자열. */
  paceHold: string
}

export type SessionIntent = {
  id: string
  userId: string
  /** training_memory.goals[].id 약결합. 활성 목표가 없으면 null. */
  goalId: string | null
  /** 의도한 날짜(YYYY-MM-DD). 매칭 1차 키. */
  plannedDate: string
  sessionType: RunType
  title: string
  why: string
  targets: SessionIntentTargets
  successCriteria: string[]
  source: SessionIntentSource
  status: SessionIntentStatus
  /** 매칭된 정본 RunLog id. 매칭 시점에 채워진다. RunLog 삭제 시 null. */
  runId: string | null
  matchedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 생성 입력. 서버가 id/user_id/status/runId/타임스탬프 부여. */
export type SessionIntentDraft = {
  goalId: string | null
  plannedDate: string
  sessionType: RunType
  title: string
  why: string
  targets: SessionIntentTargets
  successCriteria: string[]
  source: SessionIntentSource
}

export function defaultSessionIntentTargets(): SessionIntentTargets {
  return { hrCeilingBpm: null, hrRange: null, rpeRange: null, paceHold: '' }
}

function normalizeRange(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const [a, b] = raw
  if (typeof a !== 'number' || typeof b !== 'number' || Number.isNaN(a) || Number.isNaN(b)) return null
  return a <= b ? [a, b] : [b, a]
}

/** jsonb 로 들어온 targets 를 안전한 기본값으로 강제한다. */
export function normalizeSessionIntentTargets(raw: unknown): SessionIntentTargets {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const ceiling = obj.hrCeilingBpm
  return {
    hrCeilingBpm: typeof ceiling === 'number' && !Number.isNaN(ceiling) ? ceiling : null,
    hrRange: normalizeRange(obj.hrRange),
    rpeRange: normalizeRange(obj.rpeRange),
    paceHold: typeof obj.paceHold === 'string' ? obj.paceHold : ''
  }
}

/** 아직 실행과 매칭되지 않은(매칭 후보) 의도인가. */
export function isPendingIntent(intent: SessionIntent): boolean {
  return intent.status === 'planned' && !intent.runId
}
