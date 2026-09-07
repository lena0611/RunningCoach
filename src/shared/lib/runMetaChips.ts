import { runDataCount, type RunLog } from '@/entities/run/model'

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

const dayPeriods = ['새벽', '아침', '오전', '오후', '저녁', '밤']
const sourceLabels: Record<RunLog['source'], string> = {
  file_import: 'FIT 업로드',
  healthkit: 'HealthKit',
  manual: '수동 입력',
  image_extracted: '이미지 추출'
}

/**
 * "스케줄 vs 추가" 판정 — 정본은 **실제 귀속**이다(2026-09-07).
 * 그 런에 연결된 예정 세션이 있으면 스케줄이다(요일·타입 무관, 옮긴 세션도 잡힘).
 * 옛 루틴 메모(weeklyPattern) 문자열 매칭은 걷어냈다 — 메모가 비면 모든 런이 '추가'로 뒤집혔고,
 * 플랜의 정본은 training_schedule 이다.
 */
function runIsScheduled(run: RunLog, scheduledRunIds?: ReadonlySet<string>): boolean {
  return scheduledRunIds?.has(run.id) ?? false
}

export function getRunMetaChips(run: RunLog, scheduledRunIds?: ReadonlySet<string>): RunMetaChip[] {
  // 레이스는 훈련 플랜 문맥(스케줄/추가) 밖의 별도 컨텍스트 — 첫 칩이 정체를 밝힌다(#552 워치 유입 포함).
  const chips: RunMetaChip[] = [
    run.tags.includes(SELF_RACE_TAG)
      ? { label: '🏁 레이스', tone: 'race' }
      : runIsScheduled(run, scheduledRunIds)
        ? { label: '스케줄', tone: 'schedule' }
        : { label: '추가', tone: 'extra' }
  ]

  const period = getRunPeriod(run)
  if (period) chips.push({ label: period, tone: 'period' })
  const weatherLabel = getWeatherChipLabel(run)
  if (weatherLabel) chips.push({ label: weatherLabel, tone: 'weather' })

  return chips
}

export function getRunFilterTags(run: RunLog, scheduledRunIds?: ReadonlySet<string>): RunFilterTag[] {
  const tags: RunFilterTag[] = []
  const scheduled = runIsScheduled(run, scheduledRunIds)
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

  // 목록에서 온 런은 무거운 배열을 안 받아온다(#661) → 서버 개수로 판정한다. 배열 길이만 보면
  // "데이터 있음" 배지가 전부 사라진다(있는데 안 불러온 것을 없는 것으로 오판).
  if (runDataCount(run, 'laps')) tags.push({ value: 'data:laps', label: '스플릿 있음', group: 'data' })
  if (runDataCount(run, 'metricSamples')) tags.push({ value: 'data:metrics', label: '차트 데이터 있음', group: 'data' })
  if (runDataCount(run, 'routePoints')) tags.push({ value: 'data:route', label: '경로 있음', group: 'data' })

  if (run.courseType !== 'Unknown') {
    tags.push({ value: `course:${run.courseType}`, label: `코스 ${run.courseType}`, group: 'course' })
  }

  for (const tag of run.tags) {
    const normalized = tag.trim()
    if (normalized) tags.push({ value: `tag:${normalized}`, label: normalized, group: 'custom' })
  }

  return uniqueTags(tags)
}

export function hasRunFilterTag(run: RunLog, tagValue: string, scheduledRunIds?: ReadonlySet<string>) {
  if (tagValue === 'All') return true
  return getRunFilterTags(run, scheduledRunIds).some((tag) => tag.value === tagValue)
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
