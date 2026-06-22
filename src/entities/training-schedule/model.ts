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

/**
 * planned: 생성됨(미수행). done: 런 매칭됨. superseded: 대체/재정렬로 폐기.
 * missed: **닫힌 주**(이번 주 월요일 이전)에 미수행으로 확정(수동적 — 주간 정산이 부여).
 * skipped: 사용자가 **의도적으로 포기**(능동적 선택). missed 와 달리 사용자 의사다.
 *   missed/skipped 둘 다 active 아님(런 매칭·주간 미션 집계 제외), 단 UI 카드는 계속 보이고 재시도(reschedule) 가능.
 * rested: 사용자가 **선언한 휴식 기간**의 세션(#473, SSOT §휴식과 복귀). 의도된 회복이며 **missed 아님**.
 *   active/planned 아님 → 주간 정산(missed 확정)·트리아지·재정렬·런 매칭·미션 집계에서 자동 제외(닦달 차단).
 *   "쉬는 건 실패가 아니다" — 경고색·취소선 없이 차분히 표시한다.
 */
export type ScheduledSessionStatus = 'planned' | 'done' | 'superseded' | 'missed' | 'skipped' | 'rested'

/**
 * 같은 날 2세션(더블, #455)의 슬롯. null = 단일 세션 날(기본). 'AM' = 오전(강도/키), 'PM' = 오후(이지/회복).
 * 강도 워크아웃은 AM, 둘째(PM)는 이지가 원칙(SSOT §같은 날 2세션). minGap 계산·표시·런 매칭 순서에 쓴다.
 */
export type SessionSlot = 'AM' | 'PM' | null

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
  /** 같은 날 더블 슬롯(#455). null = 단일 세션 날. 'AM'(강도/키)·'PM'(이지). */
  slot: SessionSlot
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
  /** 더블 슬롯(#455). 단일 세션 생성(generator/realign)은 생략 → 저장 시 null. 더블 추가만 'AM'/'PM' 지정. */
  slot?: SessionSlot
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

/** 재정렬·대체 대상이 되는 활성 세션(planned/missed)인가. superseded/done/skipped/rested 는 제외. */
export function isActiveSession(session: ScheduledSession): boolean {
  return session.status === 'planned' || session.status === 'missed'
}

/**
 * 사용자가 선언한 휴식 기간의 세션인가(#473). active/planned 아님 — 닦달 경로에서 자동 제외되지만,
 * UI(차분한 💤 표시·복귀 배너)는 이 술어로 rested 를 명시적으로 인지한다(generic rest 와 구분).
 */
export function isRestedSession(session: ScheduledSession): boolean {
  return session.status === 'rested'
}

/** 런↔세션 매칭 허용 윈도우(일). SessionIntent 매처와 동일(±1) — 하루 늦게/일찍 한 세션도 인정. */
export const SCHEDULE_MATCH_WINDOW_DAYS = 1

function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * 런을 어느 ScheduledSession 에 귀속할지 고른다(동일 날짜 우선, 없으면 ±윈도우 내 가장 가까운 활성 세션,
 * 동률이면 과거 미수행을 먼저 — "어제 빠진 세션 따라잡기"). 윈도우 밖이면 null = 진짜 엑스트라 런.
 */
export function selectSessionForRun(
  sessions: ScheduledSession[],
  run: { date: string; type?: RunType; startAt?: string | null },
  windowDays = SCHEDULE_MATCH_WINDOW_DAYS
): ScheduledSession | null {
  const scored = sessions
    .filter(isActiveSession)
    .map((session) => ({ session, gap: diffDays(session.date, run.date) }))
    .filter((entry) => Math.abs(entry.gap) <= windowDays)
  if (!scored.length) return null
  // 같은 날짜에 세션이 여럿(더블)이어도 결정론적으로 고른다.
  // (이전엔 동일날짜 tie 가 배열 순서 의존이라 엉뚱한 세션이 done 되고 실제 수행 세션이 planned 로 남았다.)
  const typeRank = (s: ScheduledSession) => (run.type && s.sessionType === run.type ? 0 : 1)
  // 같은 날 더블(AM/PM)이면 런 시작 시각으로 슬롯을 가른다(결정 B: 시각 1순위, 동률 시 타입 폴백, #455).
  // 오전(시작<12시) 런→AM 슬롯, 오후→PM 슬롯. startAt 없거나 단일(null slot)이면 중립(타입에 위임).
  const runHour = run.startAt ? new Date(run.startAt).getHours() : null
  const slotRank = (s: ScheduledSession) => {
    if (runHour === null || !s.slot) return 1
    const amRun = runHour < 12
    return (amRun && s.slot === 'AM') || (!amRun && s.slot === 'PM') ? 0 : 1
  }
  scored.sort(
    (x, y) =>
      Math.abs(x.gap) - Math.abs(y.gap) || // 가까운 날짜 우선
      x.gap - y.gap || // 동률이면 과거(미수행) 먼저
      slotRank(x.session) - slotRank(y.session) || // 더블이면 런 시작 시각의 슬롯 우선
      typeRank(x.session) - typeRank(y.session) || // 런 타입과 일치하는 세션 우선
      Number(y.session.keySession) - Number(x.session.keySession) || // 키세션 우선
      x.session.date.localeCompare(y.session.date)
  )
  return scored[0].session
}

/**
 * 라벨 재추론(reinferMislabeledLongRuns) 후, 이미 done 으로 연결된 런이 같은 윈도우 안에서
 * **새 타입과 정확히 일치하는** 활성(planned/missed) 세션을 만나면 그 세션을 돌려준다(없으면 null).
 * 매칭 재연결(repoint)에 쓴다 — 같은 날 Easy(잘못 done)+LSD(missed) 더블을 LSD 쪽으로 옮기는 치유.
 * **정확 타입 일치가 있을 때만** 동작하므로 결정론·멱등이다(재연결 후엔 연결 세션 타입이 맞아 다시 트리거되지 않음).
 * excludeSessionId 는 현재 잘못 연결된(done) 세션 — 그 자신은 후보에서 뺀다(active 도 아니지만 방어적으로).
 */
export function selectBetterTypeMatchForRun(
  sessions: ScheduledSession[],
  run: { date: string; type?: RunType },
  excludeSessionId: string,
  windowDays = SCHEDULE_MATCH_WINDOW_DAYS
): ScheduledSession | null {
  if (!run.type) return null
  const scored = sessions
    .filter(isActiveSession)
    .filter((session) => session.id !== excludeSessionId && session.sessionType === run.type)
    .map((session) => ({ session, gap: diffDays(session.date, run.date) }))
    .filter((entry) => Math.abs(entry.gap) <= windowDays)
  if (!scored.length) return null
  scored.sort(
    (x, y) =>
      Math.abs(x.gap) - Math.abs(y.gap) || // 가까운 날짜 우선
      x.gap - y.gap || // 동률이면 과거(미수행) 먼저
      Number(y.session.keySession) - Number(x.session.keySession) || // 키세션 우선
      x.session.date.localeCompare(y.session.date)
  )
  return scored[0].session
}
