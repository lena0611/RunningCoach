import type { NotificationSettings } from '@/app/stores/settingsStore'

type NativeNotificationRequest = {
  id: string
  title: string
  body: string
  dateIso: string
}

const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const reminderHour = 7
const scheduleHorizonDays = 14

/**
 * 알림을 만들 예정 세션(2026-09-07). **실제 플랜(training_schedule)** 에서 온다.
 *
 * 예전엔 `training_memory.weeklyPattern`(옛 루틴 메모) 문자열을 파싱했는데, 그 메모가 비면
 * **훈련 알림이 통째로 0건**이 됐다(실제로 비어 있었다). 플랜은 스케줄 테이블이 갖고 있고
 * 메모는 그 이전 유물이다 — 알림도 플랜을 봐야 날짜 변경·휴식 선언을 따라간다.
 */
export type PlannedSessionForNotification = {
  /** YYYY-MM-DD */
  date: string
  /** 세션 이름(예: 'Easy + Strides'). */
  title: string
}

export function syncNativeNotifications(settings: NotificationSettings, sessions: PlannedSessionForNotification[]) {
  const handler = window.webkit?.messageHandlers?.runContextNotifications
  if (!handler) return false
  const payloadSettings = { ...settings }

  handler.postMessage({
    type: 'syncNotificationSettings',
    settings: payloadSettings,
    notifications: buildTrainingNotifications(payloadSettings, sessions)
  })
  return true
}

export function notifyHealthKitNewRuns(settings: NotificationSettings, count: number) {
  if (!settings.allEnabled || !settings.healthKitNewRun || count <= 0) return false
  if (isDocumentVisible()) return false
  const handler = window.webkit?.messageHandlers?.runContextNotifications
  if (!handler) return false

  handler.postMessage({
    type: 'showNotification',
    id: `healthkit-new-run-${Date.now()}`,
    title: '새 러닝 기록을 가져왔습니다',
    body: count === 1 ? 'HealthKit에서 새 러닝 1개를 저장했습니다.' : `HealthKit에서 새 러닝 ${count}개를 저장했습니다.`
  })
  return true
}

function isDocumentVisible() {
  return typeof document !== 'undefined' && document.visibilityState === 'visible'
}

export function buildTrainingNotifications(
  settings: NotificationSettings,
  sessions: PlannedSessionForNotification[]
): NativeNotificationRequest[] {
  if (!settings.allEnabled || !sessions.length) return []

  const now = new Date()
  const horizon = new Date(now)
  horizon.setDate(now.getDate() + scheduleHorizonDays)
  const notifications: NativeNotificationRequest[] = []

  for (const session of sessions) {
    const day = new Date(`${session.date}T00:00:00`)
    if (!Number.isFinite(day.getTime()) || day > horizon) continue
    const dayName = weekdays[day.getDay()]

    if (settings.workoutMorning) {
      const morning = new Date(day)
      morning.setHours(reminderHour, 0, 0, 0)
      // 지난 시각은 예약하지 않는다 — 예약 즉시 울리는 알림은 알림이 아니라 사고다.
      if (morning > now) {
        notifications.push({
          id: `training-morning-${dateKey(morning)}`,
          title: `${dayName} ${session.title}`,
          body: '오늘 예정 훈련입니다. 컨디션과 날씨를 확인하세요.',
          dateIso: morning.toISOString()
        })
      }
    }

    if (settings.scheduledWorkout) {
      const evening = new Date(day)
      evening.setHours(18, 0, 0, 0)
      if (evening > now) {
        notifications.push({
          id: `training-evening-${dateKey(evening)}`,
          title: `${session.title} 준비`,
          body: `${dayName} 예정 세션입니다.`,
          dateIso: evening.toISOString()
        })
      }
    }
  }
  return notifications
}

function dateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
    String(value.getHours()).padStart(2, '0')
  ].join('')
}
