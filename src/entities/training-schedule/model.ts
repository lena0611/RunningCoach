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
    paceRange: typeof obj.paceRange === 'string' ? normalizeLegacyPaceText(obj.paceRange) : '',
    note: typeof obj.note === 'string' ? obj.note : ''
  }
}

/**
 * 표기 통일(2026-07-04) 이전에 저장된 처방 문자열("5분10초/km~5분35초/km")을 "5:10~5:35/km" 로 변환한다.
 * 로드 시 표시용 정규화 — 재정렬이 돌면 새 포맷으로 다시 저장되므로 과도기 호환 계층이다.
 */
export function normalizeLegacyPaceText(text: string): string {
  if (!text.includes('분')) return text
  const converted = text.replace(/(\d+)분(\d{2})초\/km/g, '$1:$2/km')
  // 구간이면 앞쪽 단위 생략: "5:10/km~5:35/km" → "5:10~5:35/km"
  return converted.replace(/(\d+:\d{2})\/km~(\d+:\d{2})\/km/g, '$1~$2/km')
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
 * 최근 변경 보호 창(일). `updatedAt`(= superseded 로 **전환된 시점**)이 이 기간 안이면 지우지 않는다.
 * 진행 중인 변경·크로스클라이언트 레이스에 대한 안전 여유다.
 *
 * ⚠ 축은 `session_date`(훈련 날짜)가 아니라 `updatedAt` 이다. 재정렬은 **미래** 세션을 supersede 하므로
 * 세션 날짜로 나이를 재면 3개월 전에 폐기된 행도 "미래라서 최신"으로 오판한다(2026-08-07 실측:
 * session_date 기준으로는 3,698행 중 3,108행이 창 안이라 17행만 지워졌다).
 */
export const SUPERSEDED_REVERT_WINDOW_DAYS = 14

/** 한 번의 로드에서 지울 상한. 실데이터 삭제라 무제한 벌크를 만들지 않는다(다음 로드에서 이어서 지운다). */
export const SUPERSEDED_PRUNE_BATCH = 300

/**
 * 지워도 안전한 `superseded` 행의 id를 고른다(#661 DB 위생).
 *
 * ## 왜 이렇게 쌓이나 (2026-08-07 실측)
 * 재정렬이 돌 때마다 **같은 미래 날짜**를 다시 supersede 하므로 한 날짜에 폐기본이 층층이 쌓인다 —
 * 한 사용자에서 superseded 3,698행이 **날짜 169개**에 몰려 있었다(날짜당 중위 23개, 최대 27개).
 * `fetchTrainingSchedule` 은 status 필터 없이 전량을 받아오므로 이게 곧 전송량·메모리이고,
 * 2026-08-03 에는 1000행 상한에 걸려 **미래 세션이 잘려** 코치가 "예정된 훈련이 없어요"라고 오답했다.
 *
 * ## 보존 규칙 — 실제 소비처의 판정과 **같게** 맞춘다
 * 1. **(목표, 날짜)별 `createdAt` 가장 이른 superseded 1건 보존.** `CoachPage.activeOriginal` 이
 *    "원래 제안 · 되돌리기"를 그릴 때 고르는 행이 정확히 이것이다(createdAt 오름차순 [0]).
 *    → 되돌리기가 읽는 행 자체를 남기므로 기능이 **바이트 단위로 보존**된다. 같은 날짜의 나머지 22개는
 *      아무도 읽지 않는 중간 사본이다.
 * 2. **최근 변경 보호** — `updatedAt >= today - 14일` 은 남긴다(진행 중 변경·레이스 안전 여유).
 * 3. **목표별 최초 세션 날짜 행 보존** — `useCoachMoments.scheduleStartDate` 가 status 무관 최소 날짜라,
 *    가장 오래된 행을 지우면 "플랜 시작일"이 밀려 과거 런의 추가런 판정이 바뀐다.
 *
 * 규칙 1이 되돌리기를 정확히 보호하므로, 예전의 "같은 날 활성 세션이 있으면 전부 보존" 규칙은 뺐다 —
 * 실측에서 그 규칙만으로 2,451행이 영구 보존돼 정리가 사실상 동작하지 않았다.
 *
 * 순수 함수다 — 삭제는 호출부가 이 id 목록으로만 한다(광범위 WHERE 금지).
 */
export function findPrunableSupersededIds(
  sessions: ScheduledSession[],
  today: string,
  options?: { windowDays?: number; limit?: number }
): string[] {
  const windowDays = options?.windowDays ?? SUPERSEDED_REVERT_WINDOW_DAYS
  const limit = options?.limit ?? SUPERSEDED_PRUNE_BATCH
  const cutoff = shiftIsoDate(today, -windowDays)
  if (!cutoff) return []

  const earliestDateByGoal = new Map<string, string>()
  /** (목표|날짜) → 그 날짜 폐기본 중 createdAt 가장 이른 행의 id. 되돌리기가 읽는 바로 그 행. */
  const revertSourceId = new Map<string, { id: string; createdAt: string }>()
  for (const session of sessions) {
    const goalKey = session.goalId ?? ''
    const earliest = earliestDateByGoal.get(goalKey)
    if (!earliest || session.date < earliest) earliestDateByGoal.set(goalKey, session.date)
    if (session.status !== 'superseded') continue
    const stackKey = `${goalKey}|${session.date}`
    const current = revertSourceId.get(stackKey)
    if (!current || session.createdAt < current.createdAt) {
      revertSourceId.set(stackKey, { id: session.id, createdAt: session.createdAt })
    }
  }

  return sessions
    .filter((session) => {
      if (session.status !== 'superseded') return false
      const goalKey = session.goalId ?? ''
      if (revertSourceId.get(`${goalKey}|${session.date}`)?.id === session.id) return false
      if ((session.updatedAt ?? '').slice(0, 10) >= cutoff) return false
      if (earliestDateByGoal.get(goalKey) === session.date) return false
      return true
    })
    .sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''))
    .slice(0, limit)
    .map((session) => session.id)
}

/** YYYY-MM-DD 를 일 단위로 이동. 로컬/UTC 혼용 없이 문자열 날짜만 다룬다. */
function shiftIsoDate(date: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  return new Date(ms + days * 86400000).toISOString().slice(0, 10)
}

/** 처방 채택 대상 롱런 계열. */
const LONG_RUN_SESSION_TYPES = new Set(['LSD', 'Steady Long'])
/** 처방 채택으로 교정 가능한 저강도 추론 라벨(같은 저강도 계열 — 채점 프레임 왜곡 없음). */
const LOW_INTENSITY_RUN_TYPES = new Set(['Easy', 'Recovery'])
/** 처방 이행으로 인정하는 최소 거리 비율. */
const PRESCRIBED_ADOPT_MIN_RATIO = 0.7

/**
 * 매칭(done)된 런의 라벨이 처방을 따라야 하는가 — **처방 채택**(2026-07-05).
 * 초보 램프의 짧은 LSD(예: 7~8km)는 inferRunType 롱런 게이트(10km+/80분+)에 안 걸려 Easy 로
 * 떨어진다. 처방이 롱런 계열이고 런이 저강도 계열로 추론됐으며 처방 거리의 70% 이상을 이행했으면
 * 라벨은 처방을 따른다(브리핑↔채점 일관성 — 시킨 대로 했는데 다른 이름으로 채점하지 않는다).
 * 사용자가 직접 지정한 타입(type:user)·레이싱 런은 건드리지 않는다. 중도 포기(<70%)는 추론 유지.
 */
export function shouldAdoptPrescribedRunType(
  run: { id: string; type?: string; distanceKm: number | null; tags?: string[] | null; source?: string },
  session: ScheduledSession
): boolean {
  if (session.status !== 'done' || session.runId !== run.id) return false
  if (!LONG_RUN_SESSION_TYPES.has(session.sessionType)) return false
  if (!run.type || !LOW_INTENSITY_RUN_TYPES.has(run.type)) return false
  if (run.tags?.includes('type:user') || run.tags?.includes('self-race')) return false
  if (run.source !== 'healthkit' && run.source !== 'file_import') return false
  const prescribedKm = session.prescription?.distanceKm
  if (prescribedKm == null || !Number.isFinite(prescribedKm) || prescribedKm <= 0) return false
  const ranKm = run.distanceKm
  if (ranKm == null || !Number.isFinite(ranKm)) return false
  return ranKm >= prescribedKm * PRESCRIBED_ADOPT_MIN_RATIO
}

/**
 * 크로스 클라이언트 재정렬 레이스가 남긴 **같은 날 중복 planned 클론**을 찾는다
 * (2026-07-04 실계정 사고: 폰+데스크톱이 동시에 ensure→realign 을 돌려 같은 날 LSD planned 3행).
 * 정상 더블(#455)은 slot('AM'/'PM')으로 구분되므로 (goalId, date, slot, sessionType) 이 전부 같은
 * run 미연결 planned 만 클론으로 본다. 유지 1건 = updatedAt 최신(동률이면 id 사전순 뒤) — 결정론·멱등.
 * 반환: superseded 로 내릴 잉여 세션들(유지분 제외).
 */
export function findDuplicatePlannedClones(sessions: ScheduledSession[]): ScheduledSession[] {
  const groups = new Map<string, ScheduledSession[]>()
  for (const session of sessions) {
    if (!isPlannedSession(session)) continue
    const key = `${session.goalId ?? ''}|${session.date}|${session.slot ?? ''}|${session.sessionType}`
    const group = groups.get(key)
    if (group) group.push(session)
    else groups.set(key, [session])
  }
  const extras: ScheduledSession[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort(
      (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id.localeCompare(a.id)
    )
    extras.push(...sorted.slice(1))
  }
  return extras
}

/**
 * 사용자가 선언한 휴식 기간의 세션인가(#473). active/planned 아님 — 닦달 경로에서 자동 제외되지만,
 * UI(차분한 💤 표시·복귀 배너)는 이 술어로 rested 를 명시적으로 인지한다(generic rest 와 구분).
 */
export function isRestedSession(session: ScheduledSession): boolean {
  return session.status === 'rested'
}

/**
 * 런↔세션 매칭 허용 윈도우(일). SessionIntent 매처와 동일 정책.
 * **뒤로만(따라잡기)**: 어제 놓친 세션을 오늘 뛰면 인정한다(#379 의도). 앞당김(예정일 전날 런이 내일 세션을 소거)은
 * 자동 크레딧하지 않는다 — 추가런은 예정 세션을 밀어내지 않는다(domain-rules). 앞당김 인정은 코치 모먼트가 묻고
 * 승인 시에만 연결한다(SSOT §세션 변경 행동 모델, 2026-09-03).
 */
export const SCHEDULE_MATCH_WINDOW_DAYS = 1

/** gap = 세션날짜 − 런날짜(일). 0 = 같은 날, 음수 = 런이 세션보다 늦음(따라잡기). 양수(앞당김)는 자동 매칭 대상이 아니다. */
function isCatchUpGap(gap: number, windowDays: number): boolean {
  return gap <= 0 && gap >= -windowDays
}

function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * 런을 어느 ScheduledSession 에 귀속할지 고른다(동일 날짜 우선, 없으면 뒤로 윈도우 내 가장 가까운 활성 세션 —
 * "어제 빠진 세션 따라잡기"). 윈도우 밖이거나 미래 세션만 있으면 null = 엑스트라 런(앞당김은 자동 크레딧 금지).
 */
export function selectSessionForRun(
  sessions: ScheduledSession[],
  run: { date: string; type?: RunType; startAt?: string | null },
  windowDays = SCHEDULE_MATCH_WINDOW_DAYS
): ScheduledSession | null {
  const scored = sessions
    .filter(isActiveSession)
    .map((session) => ({ session, gap: diffDays(session.date, run.date) }))
    .filter((entry) => isCatchUpGap(entry.gap, windowDays))
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
      Math.abs(x.gap) - Math.abs(y.gap) || // 가까운 날짜 우선(같은 날 > 어제)
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
    .filter((entry) => isCatchUpGap(entry.gap, windowDays))
  if (!scored.length) return null
  scored.sort(
    (x, y) =>
      Math.abs(x.gap) - Math.abs(y.gap) || // 가까운 날짜 우선(같은 날 > 어제)
      Number(y.session.keySession) - Number(x.session.keySession) || // 키세션 우선
      x.session.date.localeCompare(y.session.date)
  )
  return scored[0].session
}
