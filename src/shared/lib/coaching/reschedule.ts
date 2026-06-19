/**
 * 세션 조정(reschedule)·오늘로 가져오기·스왑 순수 로직 (제안훈련 응답, 에픽 #362).
 *
 * 하이브리드 B(decision-log 2026-06-16): 단일 세션의 날짜 이동은 **국소 처리**(그날만, A1 재정렬과 별개).
 * 처방은 **보존한 채 날짜만** 옮긴다 — 재파생하지 않는다(관측 Easy 페이스 오버레이 #405 가 날아가
 * 페이스 라벨이 퇴행하는 회귀 방지). 영속(superseded 전환 + insert)은 store/호출부가 한다.
 *
 * 조정 충돌(목표 날짜에 이미 활성 세션 존재) 해결 = **스왑**(두 세션 날짜 맞바꿈). 같은 날 2세션(더블)은
 * 별도 후속(모델이 하루 1세션 전제 — 캐러셀·런매칭·네이티브 minGap 동반 변경 필요).
 */

import { trainingWeekRange, type ScheduledSession, type ScheduledSessionDraft } from '@/shared/lib/coaching/periodizedSchedule'

export type RescheduleProposal = {
  draft: ScheduledSessionDraft
  /** 다른 훈련 주(월~일)로 넘어가 그 주 부하 흐름이 달라질 수 있을 때의 소프트 경고(없으면 ''). */
  warning: string
  /** 원본과 목표 날짜가 서로 다른 훈련 주에 속하는가. */
  crossesWeek: boolean
}

function toDateOnly(d: Date): string {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  const y = copy.getFullYear()
  const m = String(copy.getMonth() + 1).padStart(2, '0')
  const day = String(copy.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekStartOf(dateStr: string): string {
  return trainingWeekRange(new Date(`${dateStr}T00:00:00`)).start
}

function draftFrom(session: ScheduledSession, newDate: string): ScheduledSessionDraft {
  return {
    goalId: session.goalId,
    date: newDate,
    phase: session.phase,
    sessionType: session.sessionType,
    keySession: session.keySession,
    // 처방 보존(얕은 복제) — 날짜만 바뀐 같은 세션이다. 재파생 금지(#405).
    prescription: { ...session.prescription },
    source: 'manual'
  }
}

/**
 * 세션을 newDate 로 옮기는 draft 를 만든다(처방 보존, source=manual).
 * 다른 주로 넘어가면 점진 부하 흐름 변화에 대한 소프트 경고를 단다(막지는 않는다 — 사용자 주권).
 */
export function proposeReschedule(current: ScheduledSession, newDate: string): RescheduleProposal {
  const crossesWeek = weekStartOf(current.date) !== weekStartOf(newDate)
  let warning = ''
  if (crossesWeek && current.keySession) {
    warning = '다른 주로 옮기는 거예요. 키 세션이라 그 주 부하 흐름이 달라질 수 있어요 — 가능하면 이번 주 안에서 옮기는 걸 권해요.'
  } else if (crossesWeek) {
    warning = '다른 주로 옮기는 거예요. 그 주 볼륨이 살짝 달라질 수 있어요.'
  }
  return { draft: draftFrom(current, newDate), warning, crossesWeek }
}

/** "오늘로 가져오기" — 지난(open/missed/skipped) 세션을 오늘 날짜로 옮긴다. */
export function proposeMoveToToday(current: ScheduledSession, today: Date): RescheduleProposal {
  return proposeReschedule(current, toDateOnly(today))
}

export type SwapProposal = {
  /** 두 원본을 superseded 로 비우고 이 둘을 insert(서로 날짜 교환). */
  drafts: [ScheduledSessionDraft, ScheduledSessionDraft]
  /** 비울 원본 id 두 개(= [moving.id, occupant.id]). */
  supersedeIds: [string, string]
  warning: string
}

/**
 * 조정 충돌 해결 = 스왑: 옮기려는 세션(moving)과 그 날을 점유한 세션(occupant)의 날짜를 맞바꾼다.
 * 둘 다 처방 보존. 키 세션끼리 맞바꾸면 하드-이지 교대가 깨질 수 있어 소프트 안내만 단다.
 */
export function proposeSwap(moving: ScheduledSession, occupant: ScheduledSession): SwapProposal {
  const movingDraft = draftFrom(moving, occupant.date)
  const occupantDraft = draftFrom(occupant, moving.date)
  let warning = ''
  if (moving.keySession && occupant.keySession) {
    warning = '두 핵심 세션의 날짜를 맞바꿔요. 하드-이지 교대·회복일이 유지되는지 한 번 확인해요.'
  }
  return { drafts: [movingDraft, occupantDraft], supersedeIds: [moving.id, occupant.id], warning }
}
