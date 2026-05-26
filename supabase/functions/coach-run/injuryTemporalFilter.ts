export function filterInjuryItemsForRunDate(injuryItems: unknown[], selectedRunDate: string | null) {
  if (!selectedRunDate) return injuryItems
  return injuryItems.filter((item) => isInjuryKnownByRunDate(item, selectedRunDate))
}

export function getActiveInjuryItemForRunDate(memory: unknown, injuryItems: unknown[], selectedRunDate: string | null) {
  const availableItems = filterInjuryItemsForRunDate(injuryItems, selectedRunDate)
  if (!memory || typeof memory !== 'object') return availableItems[0] ?? null

  const activeInjuryItemId = (memory as { activeInjuryItemId?: unknown }).activeInjuryItemId
  const activeItem = availableItems.find((item) => {
    return item && typeof item === 'object' && (item as { id?: unknown }).id === activeInjuryItemId
  })

  return activeItem ?? availableItems.find((item) => {
    if (!item || typeof item !== 'object') return false
    const status = (item as { status?: unknown }).status
    return status === 'active' || status === 'monitoring'
  }) ?? null
}

function isInjuryKnownByRunDate(item: unknown, selectedRunDate: string) {
  const effectiveDate = getInjuryEffectiveDate(item)
  if (!effectiveDate) return true
  return dateOnly(effectiveDate) <= dateOnly(selectedRunDate)
}

function getInjuryEffectiveDate(item: unknown) {
  if (!item || typeof item !== 'object') return null
  const candidate = item as {
    onsetDate?: unknown
    lastFlareDate?: unknown
    createdAt?: unknown
  }
  return firstDate(candidate.onsetDate) ?? firstDate(candidate.lastFlareDate) ?? firstDate(candidate.createdAt)
}

function firstDate(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? null
}

function dateOnly(value: string) {
  return value.slice(0, 10)
}
