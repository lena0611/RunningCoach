import type { RunLog, RunType } from '@/entities/run/model'

export type RunMetaChip = {
  label: string
  tone: 'schedule' | 'extra' | 'period' | 'weather'
}

const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const weekdayShort = ['일', '월', '화', '수', '목', '금', '토']
const dayPeriods = ['새벽', '아침', '오전', '오후', '저녁', '밤']

export function getRunMetaChips(run: RunLog, weeklyPattern: string[] = []): RunMetaChip[] {
  const chips: RunMetaChip[] = [
    isScheduledSession(run.date, run.type, weeklyPattern)
      ? { label: '스케줄', tone: 'schedule' }
      : { label: '추가', tone: 'extra' }
  ]

  const period = getRunPeriod(run)
  if (period) chips.push({ label: period, tone: 'period' })
  if (hasWeatherData(run)) chips.push({ label: '날씨', tone: 'weather' })

  return chips
}

export function isScheduledSession(dateText: string, type: RunType, weeklyPattern: string[]) {
  const weekdayIndex = getWeekday(dateText)
  if (weekdayIndex === null || type === 'Unknown') return false
  const weekday = weekdays[weekdayIndex]
  const short = weekdayShort[weekdayIndex]

  return weeklyPattern.some((item) => {
    const normalized = item.toLowerCase()
    return (
      (item.includes(weekday) || item.includes(`${short}요일`)) &&
      (normalized.includes(type.toLowerCase()) || isLongRunMatch(type, normalized))
    )
  })
}

function getRunPeriod(run: RunLog) {
  return dayPeriods.find((period) => run.sessionTitle.includes(period)) ?? null
}

function hasWeatherData(run: RunLog) {
  return run.temperature !== null || run.humidity !== null || run.windMps !== null
}

function isLongRunMatch(type: RunType, pattern: string) {
  if (type !== 'LSD' && type !== 'Steady Long') return false
  return pattern.includes('lsd') || pattern.includes('long') || pattern.includes('롱런') || pattern.includes('장거리')
}

function getWeekday(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText))
  return Number.isFinite(date.getTime()) ? date.getDay() : null
}
