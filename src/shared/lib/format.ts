export function formatPace(seconds: number | null): string {
  if (!seconds) return '-'
  const rounded = Math.round(seconds)
  const min = Math.floor(rounded / 60)
  const sec = String(rounded % 60).padStart(2, '0')
  // 표기 통일(2026-07-04): 페이스는 항상 m:ss (호출부가 '/km' 부착) — ui-guidelines 'rounded m:ss' 계약.
  return `${min}:${sec}`
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '-'
  const rounded = Math.round(seconds)
  const h = Math.floor(rounded / 3600)
  const m = Math.floor((rounded % 3600) / 60)
  const s = rounded % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

type NumberFormatOptions = {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

export function formatNumberWithCommas(value: number | null | undefined, options: NumberFormatOptions = {}): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'

  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0
  }).format(value)
}

export function formatInteger(value: number | null | undefined): string {
  return formatNumberWithCommas(typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null)
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

export function formatRunListDate(value: string | null | undefined, today = new Date()): string {
  if (!value) return '-'
  const date = parseDateOnly(value)
  if (!date) return formatDateWithWeekday(value)

  const base = new Date(today)
  base.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((base.getTime() - target.getTime()) / 86400000)
  if (diffDays === 0) return '오늘'
  if (diffDays === 1) return '어제'

  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const weekStart = getMonday(base)
  const previousWeekStart = new Date(weekStart)
  previousWeekStart.setDate(previousWeekStart.getDate() - 7)

  if (target >= weekStart && target <= base) return weekdays[target.getDay()]
  if (target >= previousWeekStart && target < weekStart) return `지난주 ${weekdays[target.getDay()]}`

  return formatDateWithWeekday(value).replace(/-/g, '.')
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

export function formatTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatTimeRange(startValue: string | null | undefined, endValue: string | null | undefined): string {
  const start = formatTime(startValue)
  const end = formatTime(endValue)
  if (start === '-' && end === '-') return ''
  if (start === '-') return end
  if (end === '-') return start
  return `${start}-${end}`
}

export function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText))
  return Number.isFinite(date.getTime()) ? date : null
}

function getMonday(value: Date) {
  const date = new Date(value)
  const day = date.getDay()
  const diff = day === 0 ? 6 : day - 1
  date.setDate(date.getDate() - diff)
  date.setHours(0, 0, 0, 0)
  return date
}
