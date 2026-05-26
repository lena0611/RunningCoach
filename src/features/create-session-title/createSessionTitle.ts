import type { RunType } from '@/entities/run/model'

type CreateSessionTitleInput = {
  date: string
  startAt?: string | null
  type: RunType
  weeklyPattern?: string[]
}

const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const weekdayShort = ['일', '월', '화', '수', '목', '금', '토']

export function createSessionTitle(input: CreateSessionTitleInput) {
  const scope = isScheduledSession(input.date, input.type, input.weeklyPattern ?? []) ? '스케줄' : '추가'
  const period = getDayPeriod(input.startAt)
  return `[${scope}] [${period}] ${input.type}`
}

function isScheduledSession(dateText: string, type: RunType, weeklyPattern: string[]) {
  const weekdayIndex = getWeekday(dateText)
  if (weekdayIndex === null) return false
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

function getDayPeriod(startAt: string | null | undefined) {
  const date = startAt ? new Date(startAt) : null
  const hour = date && Number.isFinite(date.getTime()) ? date.getHours() : null
  if (hour === null) return '오전'
  if (hour < 5) return '새벽'
  if (hour < 9) return '아침'
  if (hour < 12) return '오전'
  if (hour < 18) return '오후'
  if (hour < 21) return '저녁'
  return '밤'
}
