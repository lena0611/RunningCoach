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

export function syncNativeNotifications(settings: NotificationSettings, weeklyPattern: string[]) {
  const handler = window.webkit?.messageHandlers?.runContextNotifications
  if (!handler) return false

  handler.postMessage({
    type: 'syncNotificationSettings',
    settings,
    notifications: buildTrainingNotifications(settings, weeklyPattern)
  })
  return true
}

export function notifyHealthKitNewRuns(settings: NotificationSettings, count: number) {
  if (!settings.allEnabled || !settings.healthKitNewRun || count <= 0) return false
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

function buildTrainingNotifications(settings: NotificationSettings, weeklyPattern: string[]): NativeNotificationRequest[] {
  if (!settings.allEnabled) return []
  const plans = parseWeeklyPattern(weeklyPattern)
  if (!plans.length) return []

  const now = new Date()
  const notifications: NativeNotificationRequest[] = []
  for (let offset = 0; offset <= scheduleHorizonDays; offset += 1) {
    const date = new Date(now)
    date.setDate(now.getDate() + offset)
    const dayName = weekdays[date.getDay()]
    const plan = plans.find((item) => item.dayName === dayName)
    if (!plan) continue

    if (settings.workoutMorning) {
      const morning = new Date(date)
      morning.setHours(reminderHour, 0, 0, 0)
      if (morning > now) {
        notifications.push({
          id: `training-morning-${dateKey(morning)}`,
          title: `${dayName} ${plan.title}`,
          body: '오늘 예정 훈련입니다. 컨디션과 날씨를 확인하세요.',
          dateIso: morning.toISOString()
        })
      }
    }

    if (settings.scheduledWorkout) {
      const evening = new Date(date)
      evening.setHours(18, 0, 0, 0)
      if (evening > now) {
        notifications.push({
          id: `training-evening-${dateKey(evening)}`,
          title: `${plan.title} 준비`,
          body: `${dayName} 루틴 기준 예정 세션입니다.`,
          dateIso: evening.toISOString()
        })
      }
    }
  }
  return notifications
}

function parseWeeklyPattern(weeklyPattern: string[]) {
  return weeklyPattern
    .map((item) => {
      const [dayText, ...titleParts] = item.split(':')
      const dayName = weekdays.find((day) => dayText.trim().includes(day))
      const title = titleParts.join(':').trim()
      if (!dayName || !title) return null
      return { dayName, title }
    })
    .filter((item): item is { dayName: string, title: string } => item !== null)
}

function dateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
    String(value.getHours()).padStart(2, '0')
  ].join('')
}
