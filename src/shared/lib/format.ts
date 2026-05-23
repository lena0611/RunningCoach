export function formatPace(seconds: number | null): string {
  if (!seconds) return '-'
  const rounded = Math.round(seconds)
  const min = Math.floor(rounded / 60)
  const sec = String(rounded % 60).padStart(2, '0')
  return `${min}'${sec}"`
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '-'
  const rounded = Math.round(seconds)
  const h = Math.floor(rounded / 3600)
  const m = Math.floor((rounded % 3600) / 60)
  const s = rounded % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function formatInteger(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : '-'
}

export function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}
