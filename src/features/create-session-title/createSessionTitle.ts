import type { RunType } from '@/entities/run/model'

type CreateSessionTitleInput = {
  date: string
  startAt?: string | null
  type: RunType
  weeklyPattern?: string[]
}

const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

export function createSessionTitle(input: CreateSessionTitleInput) {
  const weekday = getWeekdayName(input.date)
  const period = getDayPeriod(input.startAt)
  return `${weekday} ${period} 러닝`
}

function getWeekdayName(dateText: string) {
  const weekdayIndex = getWeekday(dateText)
  return weekdayIndex === null ? '오늘' : weekdays[weekdayIndex]
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
