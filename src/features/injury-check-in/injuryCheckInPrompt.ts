export type InjuryCheckInDismissState = {
  userId: string
  itemId: string
  todayKey: string
  latestQualityRunDate: string | null
  lastCheckedAt: string | null
}

const dismissedPrefix = 'pacelab.injuryCheckIn.dismissed'

export function createInjuryCheckInDismissKey(state: InjuryCheckInDismissState) {
  const latestQualityRunDate = state.latestQualityRunDate ?? 'none'
  const lastCheckedDate = state.lastCheckedAt?.slice(0, 10) || 'never'
  return [
    dismissedPrefix,
    state.userId || 'default',
    state.itemId,
    state.todayKey,
    latestQualityRunDate,
    lastCheckedDate
  ].join('.')
}
