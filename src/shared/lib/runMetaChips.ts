import type { RunLog, RunType } from '@/entities/run/model'

export type RunMetaChip = {
  label: string
  tone: 'race' | 'schedule' | 'extra' | 'period' | 'weather'
}

// SSOT 는 entities/competition/model.ts 의 SELF_RACE_TAG 지만, shared→entities 값 import 는
// 아키텍처 래칫(architecture-boundaries.test.ts, #397)이 막는다 — achievements.ts·distancePb.ts 와
// 같은 이유의 의도적 로컬 복제(값 변경 시 grep 'self-race' 일괄).
const SELF_RACE_TAG = 'self-race'

export type RunFilterTag = {
  value: string
  label: string
  group: 'schedule' | 'period' | 'weather' | 'source' | 'data' | 'course' | 'custom'
}

const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const weekdayShort = ['일', '월', '화', '수', '목', '금', '토']
const dayPeriods = ['새벽', '아침', '오전', '오후', '저녁', '밤']
const sourceLabels: Record<RunLog['source'], string> = {
  file_import: 'FIT 업로드',
  healthkit: 'HealthKit',
  manual: '수동 입력',
  image_extracted: '이미지 추출'
}

export function getRunMetaChips(run: RunLog, weeklyPattern: string[] = []): RunMetaChip[] {
  // 레이스는 훈련 플랜 문맥(스케줄/추가) 밖의 별도 컨텍스트 — 첫 칩이 정체를 밝힌다(#552 워치 유입 포함).
  const chips: RunMetaChip[] = [
    run.tags.includes(SELF_RACE_TAG)
      ? { label: '🏁 레이스', tone: 'race' }
      : isScheduledSession(run.date, run.type, weeklyPattern)
        ? { label: '스케줄', tone: 'schedule' }
        : { label: '추가', tone: 'extra' }
  ]

  const period = getRunPeriod(run)
  if (period) chips.push({ label: period, tone: 'period' })
  const weatherLabel = getWeatherChipLabel(run)
  if (weatherLabel) chips.push({ label: weatherLabel, tone: 'weather' })

  return chips
}

export function getRunFilterTags(run: RunLog, weeklyPattern: string[] = []): RunFilterTag[] {
  const tags: RunFilterTag[] = []
  const scheduled = isScheduledSession(run.date, run.type, weeklyPattern)
  tags.push({
    value: scheduled ? 'schedule:scheduled' : 'schedule:extra',
    label: scheduled ? '스케줄' : '추가',
    group: 'schedule'
  })

  const period = getRunPeriod(run)
  if (period) {
    tags.push({ value: `period:${period}`, label: period, group: 'period' })
  }
  if (hasWeatherData(run)) {
    tags.push({ value: 'weather:present', label: '날씨 있음', group: 'weather' })
  }

  tags.push({ value: `source:${run.source}`, label: sourceLabels[run.source] ?? run.source, group: 'source' })

  if (run.laps.length) tags.push({ value: 'data:laps', label: '스플릿 있음', group: 'data' })
  if (run.metricSamples.length) tags.push({ value: 'data:metrics', label: '차트 데이터 있음', group: 'data' })
  if (run.routePoints.length) tags.push({ value: 'data:route', label: '경로 있음', group: 'data' })

  if (run.courseType !== 'Unknown') {
    tags.push({ value: `course:${run.courseType}`, label: `코스 ${run.courseType}`, group: 'course' })
  }

  for (const tag of run.tags) {
    const normalized = tag.trim()
    if (normalized) tags.push({ value: `tag:${normalized}`, label: normalized, group: 'custom' })
  }

  return uniqueTags(tags)
}

export function hasRunFilterTag(run: RunLog, tagValue: string, weeklyPattern: string[] = []) {
  if (tagValue === 'All') return true
  return getRunFilterTags(run, weeklyPattern).some((tag) => tag.value === tagValue)
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

function getWeatherChipLabel(run: RunLog) {
  if (run.temperature !== null) return `기온 ${Math.round(run.temperature)}°`
  if (run.humidity !== null) return `습도 ${Math.round(run.humidity)}%`
  if (run.windMps !== null) return `바람 ${round(run.windMps)}m/s`
  return ''
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function uniqueTags(tags: RunFilterTag[]) {
  const seen = new Set<string>()
  return tags.filter((tag) => {
    if (seen.has(tag.value)) return false
    seen.add(tag.value)
    return true
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
