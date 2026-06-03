export type InjuryCheckInDismissState = {
  userId: string
  itemId: string
  todayKey: string
  latestRunDate: string | null
  lastCheckedAt: string | null
}

const dismissedPrefix = 'pacelab.injuryCheckIn.dismissed'
const screeningPromptedPrefix = 'pacelab.injuryScreening.lastPromptedAt'
const screeningGuideSeenPrefix = 'pacelab.injuryScreening.guideSeen'

export function createInjuryCheckInDismissKey(state: InjuryCheckInDismissState) {
  const latestRunDate = state.latestRunDate ?? 'none'
  const lastCheckedDate = state.lastCheckedAt?.slice(0, 10) || 'never'
  return [
    dismissedPrefix,
    state.userId || 'default',
    state.itemId,
    state.todayKey,
    latestRunDate,
    lastCheckedDate
  ].join('.')
}

export function createInjuryScreeningPromptedKey(userId: string) {
  return [screeningPromptedPrefix, userId || 'default'].join('.')
}

export function createInjuryScreeningGuideSeenKey(userId: string) {
  return [screeningGuideSeenPrefix, userId || 'default'].join('.')
}
