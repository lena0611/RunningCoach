export type PaceChartDisplayOptions = {
  minSec: number
  maxSec: number
  maxInterpolatedGap?: number
  minVisibleBarSec?: number
}

const DEFAULT_MAX_INTERPOLATED_GAP = 2
const DEFAULT_MIN_VISIBLE_BAR_SEC = 18

export function preparePaceChartDisplayValues(
  values: Array<number | null | undefined>,
  options: PaceChartDisplayOptions
): Array<number | null> {
  const maxInterpolatedGap = options.maxInterpolatedGap ?? DEFAULT_MAX_INTERPOLATED_GAP
  const minVisibleBarSec = options.minVisibleBarSec ?? DEFAULT_MIN_VISIBLE_BAR_SEC
  const slowOutlierDisplayMax = Math.max(options.minSec, options.maxSec - minVisibleBarSec)
  const displayValues = values.map((value) => toDisplayPace(value, options.minSec, options.maxSec, slowOutlierDisplayMax))

  let index = 0
  while (index < displayValues.length) {
    if (displayValues[index] !== null) {
      index += 1
      continue
    }

    const gapStart = index
    while (index < displayValues.length && displayValues[index] === null) {
      index += 1
    }
    const gapEnd = index - 1
    const gapLength = gapEnd - gapStart + 1
    const previous = displayValues[gapStart - 1]
    const next = displayValues[index]

    if (gapLength > maxInterpolatedGap || previous === undefined || next === undefined || previous === null || next === null) {
      continue
    }

    for (let gapIndex = 0; gapIndex < gapLength; gapIndex += 1) {
      const ratio = (gapIndex + 1) / (gapLength + 1)
      displayValues[gapStart + gapIndex] = Math.round(previous + (next - previous) * ratio)
    }
  }

  return displayValues
}

function toDisplayPace(
  value: number | null | undefined,
  minSec: number,
  maxSec: number,
  slowOutlierDisplayMax: number
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < minSec) return minSec
  if (value > maxSec) return slowOutlierDisplayMax
  return value
}
