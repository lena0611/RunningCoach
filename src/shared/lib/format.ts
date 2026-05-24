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

export function formatDateWithWeekday(value: string | null | undefined): string {
  if (!value) return '-'
  const dateText = value.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText)
  if (!match) return value
  const [, yearText, monthText, dayText] = match
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText))
  if (!Number.isFinite(date.getTime())) return value
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${dateText}(${weekdays[date.getDay()]})`
}

export function formatDateTimeWithWeekday(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return formatDateWithWeekday(value)
  const dateText = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
  const timeText = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${formatDateWithWeekday(dateText)} ${timeText}`
}

export function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}
