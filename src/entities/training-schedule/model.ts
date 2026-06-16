/**
 * 날짜축 주기화 스케줄(ScheduledSession) 도메인 모델 (#363, 에픽 #362 기반).
 *
 * 기존 weeklyPattern(요일 반복 템플릿)과 달리, 목표(레이스 날짜+목표 기록)를 받아
 * D-day 까지 **날짜별 계획 세션**을 담는다. 하이브리드 B(decision-log 2026-06-16):
 *   - F2 생성기가 Daniels VDOT + 80/20 + Phase 골격으로 이 모델에 write.
 *   - A1 재정렬 엔진이 누적 이탈 시 목표일 고정 채 forward 재구축.
 *   - A2 "작전 바꾸기"가 그날 세션을 superseded 로 두고 대체안 insert.
 *
 * 약결합: goalId 는 training_memory.goals[].id(jsonb 임베드, FK 없음),
 *   runId 는 run_logs FK(삭제 시 null).
 */

import type { RunType } from '@/entities/run/model'
import type { TrainingPhaseName } from '@/entities/training-memory/model'

export type { TrainingPhaseName }

/** planned: 생성됨(미수행). done: 런 매칭됨. superseded: 대체/재정렬로 폐기. missed: 날짜 지났는데 미수행. */
export type ScheduledSessionStatus = 'planned' | 'done' | 'superseded' | 'missed'

/** generator: F2 골격 생성. realign: A1 재정렬. manual: 사용자/작전 바꾸기. */
export type ScheduledSessionSource = 'generator' | 'realign' | 'manual'

/** 세션 처방 요약(결정론). 심박 상한이 1순위지만 스케줄 단위에선 거리/시간/페이스대 요약만 둔다. */
export type ScheduledSessionPrescription = {
  distanceKm: number | null
  durationMin: number | null
  /** VDOT 기반 목표 페이스대 라벨(예: "5:10~5:35/km"). 없으면 ''. */
  paceRange: string
  /** 자유 노트(스트라이드 프로토콜 등). */
  note: string
}

export type ScheduledSession = {
  id: string
  userId: string
  /** training_memory.goals[].id 약결합. 활성 목표가 없으면 null. */
  goalId: string | null
  /** 계획 날짜(YYYY-MM-DD). */
  date: string
  phase: TrainingPhaseName
  sessionType: RunType
  /** 주기화 골격의 키 세션(Tempo/Long/TT 등). 재정렬 시 우선 보존. */
  keySession: boolean
  prescription: ScheduledSessionPrescription
  status: ScheduledSessionStatus
  source: ScheduledSessionSource
  /** 매칭된 정본 RunLog id. done 전환 시 채워진다. RunLog 삭제 시 null. */
  runId: string | null
  createdAt: string
  updatedAt: string
}

/** 생성 입력. 서버가 id/user_id/타임스탬프 부여. */
export type ScheduledSessionDraft = {
  goalId: string | null
  date: string
  phase: TrainingPhaseName
  sessionType: RunType
  keySession: boolean
  prescription: ScheduledSessionPrescription
  source: ScheduledSessionSource
}

export function defaultScheduledSessionPrescription(): ScheduledSessionPrescription {
  return { distanceKm: null, durationMin: null, paceRange: '', note: '' }
}

function toNumberOrNull(raw: unknown): number | null {
  if (typeof raw !== 'number' || Number.isNaN(raw) || !Number.isFinite(raw)) return null
  return raw
}

/** jsonb 로 들어온 prescription 을 안전한 기본값으로 강제한다. */
export function normalizeScheduledSessionPrescription(raw: unknown): ScheduledSessionPrescription {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    distanceKm: toNumberOrNull(obj.distanceKm),
    durationMin: toNumberOrNull(obj.durationMin),
    paceRange: typeof obj.paceRange === 'string' ? obj.paceRange : '',
    note: typeof obj.note === 'string' ? obj.note : ''
  }
}

/** 아직 수행되지 않은(계획) 세션인가. */
export function isPlannedSession(session: ScheduledSession): boolean {
  return session.status === 'planned' && !session.runId
}

/** 재정렬·대체 대상이 되는 활성 세션(planned/missed)인가. superseded/done 은 제외. */
export function isActiveSession(session: ScheduledSession): boolean {
  return session.status === 'planned' || session.status === 'missed'
}
