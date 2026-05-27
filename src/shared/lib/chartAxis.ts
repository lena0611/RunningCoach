export type ChartMetricKind =
  | 'distance'
  | 'temperature'
  | 'elevation'
  | 'heartRate'
  | 'heartCadence'
  | 'pace'
  | 'cadence'
  | 'percent'
  | 'count'
  | 'generic'

export type ChartDomain = {
  min: number
  max: number
  dataMin: number
  dataMax: number
  displayMin: number
  displayMax: number
}

const presets: Record<ChartMetricKind, { paddingRatio: number; minSpan: number; step: number; clampMin?: number; clampMax?: number }> = {
  distance: { paddingRatio: 0.16, minSpan: 5, step: 1, clampMin: 0 },
  temperature: { paddingRatio: 0.18, minSpan: 6, step: 2 },
  elevation: { paddingRatio: 0.18, minSpan: 10, step: 5 },
  heartRate: { paddingRatio: 0.14, minSpan: 24, step: 5, clampMin: 40 },
  heartCadence: { paddingRatio: 0.14, minSpan: 32, step: 5, clampMin: 0 },
  pace: { paddingRatio: 0.24, minSpan: 105, step: 15, clampMin: 60 },
  cadence: { paddingRatio: 0.14, minSpan: 24, step: 5, clampMin: 0 },
  percent: { paddingRatio: 0.08, minSpan: 20, step: 10, clampMin: 0, clampMax: 100 },
  count: { paddingRatio: 0.16, minSpan: 4, step: 1, clampMin: 0 },
  generic: { paddingRatio: 0.14, minSpan: 5, step: 1 }
}

export function getChartDomain(values: Array<number | null | undefined>, kind: ChartMetricKind = 'generic'): ChartDomain | null {
  const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!numbers.length) return null

  const dataMin = Math.min(...numbers)
  const dataMax = Math.max(...numbers)
  if (kind === 'percent') {
    return { min: 0, max: 100, dataMin, dataMax, displayMin: dataMin, displayMax: dataMax }
  }

  const preset = presets[kind]
  const domainNumbers = kind === 'pace' && numbers.length >= 12 ? trimExtremePaceOutliers(numbers) : numbers
  const displayMin = Math.min(...domainNumbers)
  const displayMax = Math.max(...domainNumbers)
  const rawSpan = Math.max(displayMax - displayMin, 0)
  const span = Math.max(rawSpan, preset.minSpan)
  const center = (displayMin + displayMax) / 2
  const half = span / 2
  const padding = span * preset.paddingRatio
  let min = rawSpan === 0 ? center - half - padding : displayMin - padding
  let max = rawSpan === 0 ? center + half + padding : displayMax + padding

  min = roundDown(min, preset.step)
  max = roundUp(max, preset.step)

  if (preset.clampMin !== undefined) min = Math.max(preset.clampMin, min)
  if (preset.clampMax !== undefined) max = Math.min(preset.clampMax, max)

  if (max <= min) {
    max = min + preset.minSpan
  }

  return { min, max, dataMin, dataMax, displayMin, displayMax }
}

export function inferChartMetricKind(unit: string | undefined): ChartMetricKind {
  if (unit === 'km') return 'distance'
  if (unit === '°') return 'temperature'
  if (unit === '%') return 'percent'
  if (unit === '회') return 'count'
  return 'generic'
}

function roundDown(value: number, step: number) {
  return Math.floor(value / step) * step
}

function roundUp(value: number, step: number) {
  return Math.ceil(value / step) * step
}

function trimExtremePaceOutliers(values: number[]) {
  if (values.length < 12) return values
  const sorted = [...values].sort((a, b) => a - b)
  const dataMin = sorted[0]
  const dataMax = sorted[sorted.length - 1]
  const lowerProbe = sorted[Math.floor((sorted.length - 1) * 0.08)]
  const upperProbe = sorted[Math.ceil((sorted.length - 1) * 0.92)]
  const stableSpan = Math.max(upperProbe - lowerProbe, 1)
  const fastOutlierGap = Math.max(45, stableSpan * 0.8)
  const slowOutlierGap = Math.max(75, stableSpan * 1.0)
  const displayMin = dataMin < lowerProbe - fastOutlierGap ? lowerProbe : dataMin
  const displayMax = dataMax > upperProbe + slowOutlierGap ? upperProbe : dataMax

  return values.filter((value) => value >= displayMin && value <= displayMax)
}
