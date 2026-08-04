import { defineStore } from 'pinia'
import { DEFAULT_COACH_MODEL, FREE_TIER_COACH_MODEL_IDS, isCoachModelId, type CoachModelId } from '@/shared/lib/coaching/coachModels'

export type NotificationSettingKey = 'scheduledWorkout' | 'workoutMorning' | 'healthKitNewRun'
export type SettingsPanelFocus = 'notifications'

export type NotificationSettings = {
  allEnabled: boolean
  scheduledWorkout: boolean
  workoutMorning: boolean
  healthKitNewRun: boolean
}

export type NotificationSettingRow = {
  key: NotificationSettingKey
  title: string
  detail: string
}

export type DisabledNotificationItem = {
  key: 'allEnabled' | NotificationSettingKey
  title: string
  detail: string
}

const storageKey = 'runcontext.settings'
const defaultNotificationSettings: NotificationSettings = {
  allEnabled: false,
  scheduledWorkout: true,
  workoutMorning: true,
  healthKitNewRun: true
}
export const notificationAllSetting = {
  key: 'allEnabled',
  title: '전체 알림',
  detail: '훈련 스케줄과 HealthKit 신규 기록 알림을 한 번에 켜고 끕니다.'
} as const
export const notificationSettingRows = [
  {
    key: 'workoutMorning',
    title: '훈련 당일 아침',
    detail: '예정 훈련이 있는 날 오전 7시에 알려줍니다.'
  },
  {
    key: 'scheduledWorkout',
    title: '스케줄 훈련 준비',
    detail: '예정 세션 당일 저녁에 한 번 더 알려줍니다.'
  },
  {
    key: 'healthKitNewRun',
    title: 'HealthKit 새 러닝',
    detail: '앱이 새 러닝을 저장하면 알림을 보냅니다.'
  }
] as const satisfies readonly NotificationSettingRow[]

export const useSettingsStore = defineStore('settingsStore', {
  state: () => ({
    notificationSettings: loadSettings().notificationSettings,
    coachingModel: loadSettings().coachingModel,
    settingsPanelRequestId: 0,
    settingsPanelFocus: null as SettingsPanelFocus | null
  }),
  actions: {
    setAllNotifications(enabled: boolean) {
      this.notificationSettings = {
        ...this.notificationSettings,
        allEnabled: enabled
      }
      this.persist()
    },
    setNotificationSetting(key: NotificationSettingKey, enabled: boolean) {
      this.notificationSettings = {
        ...this.notificationSettings,
        [key]: enabled
      }
      this.persist()
    },
    setCoachingModel(model: CoachModelId) {
      this.coachingModel = model
      this.persist()
    },
    requestSettingsPanel(focus: SettingsPanelFocus | null = null) {
      this.settingsPanelFocus = focus
      this.settingsPanelRequestId += 1
    },
    persist() {
      localStorage.setItem(storageKey, JSON.stringify({
        notificationSettings: this.notificationSettings,
        coachingModel: this.coachingModel,
        // 한 번 저장되면 무료 모델 이관을 다시 적용하지 않는다(위 resolveStoredCoachModel).
        freeModelMigrated: true
      }))
    }
  }
})

export function getDisabledNotificationItems(settings: NotificationSettings): DisabledNotificationItem[] {
  if (!settings.allEnabled) {
    return [notificationAllSetting, ...notificationSettingRows]
  }
  return notificationSettingRows.filter((row) => !settings[row.key])
}

function loadSettings(): { notificationSettings: NotificationSettings; coachingModel: CoachModelId } {
  if (typeof localStorage === 'undefined') {
    return { notificationSettings: defaultNotificationSettings, coachingModel: DEFAULT_COACH_MODEL }
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}') as {
      notificationSettings?: Partial<NotificationSettings>
      coachingModel?: unknown
      freeModelMigrated?: unknown
    }
    return {
      notificationSettings: normalizeNotificationSettings(parsed.notificationSettings),
      coachingModel: resolveStoredCoachModel(parsed.coachingModel, parsed.freeModelMigrated === true)
    }
  } catch {
    return { notificationSettings: defaultNotificationSettings, coachingModel: DEFAULT_COACH_MODEL }
  }
}

/**
 * 저장된 모델 선택 해석 + **무료 모델 일회성 이관**.
 *
 * 기본값만 GPT 로 바꿔도 이미 저장된 값이 이기기 때문에, 기존 설치는 계속 무료 모델로 남아
 * 대화가 실패한다(무료 엔드포인트는 긴 답변이 200~250초에 스트림째 실패 — 2026-08-04 실측).
 * 그 저장값들은 사용자가 고른 게 아니라 **옛 기본값이 남은 것**이라 한 번만 GPT 로 옮긴다.
 * 이관 후에는 `freeModelMigrated` 플래그 때문에 다시 덮지 않는다 — 이후 사용자가 무료 모델을
 * 일부러 고르면 그 선택이 유지된다.
 */
export function resolveStoredCoachModel(stored: unknown, alreadyMigrated: boolean): CoachModelId {
  if (!isCoachModelId(stored)) return DEFAULT_COACH_MODEL
  if (!alreadyMigrated && FREE_TIER_COACH_MODEL_IDS.includes(stored)) return DEFAULT_COACH_MODEL
  return stored
}

function normalizeNotificationSettings(value: Partial<NotificationSettings> | undefined): NotificationSettings {
  return {
    ...defaultNotificationSettings,
    ...(value ?? {}),
    allEnabled: Boolean(value?.allEnabled)
  }
}
