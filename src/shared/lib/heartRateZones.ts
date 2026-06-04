export type HeartRateZone = 'Z0' | 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'Unknown'

export type HeartRateZoneDefinition = {
  zone: HeartRateZone
  label: string
  minBpm: number | null
  maxBpm: number | null
  trainingMeaning: string
}

export const defaultHeartRateZones: HeartRateZoneDefinition[] = [
  {
    zone: 'Z0',
    label: '비훈련/매우 낮음',
    minBpm: null,
    maxBpm: 99,
    trainingMeaning: '러닝 강도 판단보다는 이동, 대기, 아주 낮은 회복 상태로 본다.'
  },
  {
    zone: 'Z1',
    label: '회복',
    minBpm: 100,
    maxBpm: 130,
    trainingMeaning: '회복 조깅, 워밍업, 쿨다운. 숨이 편하고 다음 훈련을 방해하지 않는 강도.'
  },
  {
    zone: 'Z2',
    label: '이지',
    minBpm: 131,
    maxBpm: 145,
    trainingMeaning: 'Easy의 핵심 영역. 페이스보다 심박 안정과 회복 반응을 우선한다.'
  },
  {
    zone: 'Z3',
    label: '이지 상단/스테디 초입',
    minBpm: 146,
    maxBpm: 155,
    trainingMeaning: 'Easy로는 조금 높은 영역. Steady 성격이 섞일 수 있어 지속 시간과 다음날 반응을 본다.'
  },
  {
    zone: 'Z4',
    label: '템포',
    minBpm: 156,
    maxBpm: 165,
    trainingMeaning: '현재 Tempo 품질 영역. 템포 처방은 max 165bpm을 넘기지 않는 것이 핵심이다.'
  },
  {
    zone: 'Z5',
    label: '고강도',
    minBpm: 166,
    maxBpm: null,
    trainingMeaning: '현재 목표 훈련에서는 보수적으로 다루는 영역. 반복 노출은 회복/부상 반응을 확인한다.'
  }
]

// 개인값 미입력 시의 기본 템포(역치) 상한. defaultHeartRateZones의 Z4 상한과 같다.
export const DEFAULT_TEMPO_CEILING_BPM = 165

// 역치심박(LTHR)을 최대심박의 비율로 추정할 때 쓰는 계수. LT는 보통 HRmax의 88~92% 구간이라 중앙값 0.9를 쓴다.
const LT_FRACTION_OF_MAX = 0.9

// 존 상단 경계를 anchor(=LTHR 추정치)의 비율로 본 값. anchor=165면 기존 상수(99/130/145/155/165)와 정확히 일치한다.
const ZONE_TOP_RATIO_OF_ANCHOR: Record<'Z0' | 'Z1' | 'Z2' | 'Z3' | 'Z4', number> = {
  Z0: 99 / DEFAULT_TEMPO_CEILING_BPM,
  Z1: 130 / DEFAULT_TEMPO_CEILING_BPM,
  Z2: 145 / DEFAULT_TEMPO_CEILING_BPM,
  Z3: 155 / DEFAULT_TEMPO_CEILING_BPM,
  Z4: 1
}

export type HeartRatePersonalInput = {
  birthYear?: number | null
  maxHeartRate?: number | null
  restingHeartRate?: number | null
  lactateThresholdHr?: number | null
}

export type HeartRateModelSource = 'lthr' | 'measured_max' | 'age_estimated' | 'default'

export type HeartRateModel = {
  zones: HeartRateZoneDefinition[]
  anchorBpm: number
  tempoCeilingBpm: number
  easyCeilingBpm: number
  recoveryCeilingBpm: number
  estimatedMaxHr: number | null
  restingHeartRate: number | null
  source: HeartRateModelSource
  isEstimated: boolean
}

// Tanaka 식(208 − 0.7 × 나이). 220−나이보다 특히 40세 이상에서 더 정확하다.
export function tanakaMaxHr(birthYear: number | null | undefined, referenceYear: number): number | null {
  if (typeof birthYear !== 'number' || !Number.isFinite(birthYear)) return null
  const age = referenceYear - birthYear
  if (age < 5 || age > 100) return null
  return Math.round(208 - 0.7 * age)
}

// anchor(LTHR 추정치)에서 존 경계를 결정적으로 만든다. 반올림 충돌이 나도 항상 단조 증가하도록 보정한다.
export function buildHeartRateZones(anchorBpm: number): HeartRateZoneDefinition[] {
  const safeAnchor = Math.max(80, Math.round(anchorBpm))
  let prevTop = 0
  const tops: Record<'Z0' | 'Z1' | 'Z2' | 'Z3' | 'Z4', number> = { Z0: 0, Z1: 0, Z2: 0, Z3: 0, Z4: 0 }
  ;(['Z0', 'Z1', 'Z2', 'Z3', 'Z4'] as const).forEach((zone) => {
    const top = Math.max(prevTop + 1, Math.round(ZONE_TOP_RATIO_OF_ANCHOR[zone] * safeAnchor))
    tops[zone] = top
    prevTop = top
  })
  const meta = (zone: HeartRateZone) => defaultHeartRateZones.find((item) => item.zone === zone)
  const withRange = (
    zone: 'Z0' | 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5',
    minBpm: number | null,
    maxBpm: number | null
  ): HeartRateZoneDefinition => ({
    zone,
    label: meta(zone)?.label ?? zone,
    minBpm,
    maxBpm,
    trainingMeaning: meta(zone)?.trainingMeaning ?? ''
  })
  return [
    withRange('Z0', null, tops.Z0),
    withRange('Z1', tops.Z0 + 1, tops.Z1),
    withRange('Z2', tops.Z1 + 1, tops.Z2),
    withRange('Z3', tops.Z2 + 1, tops.Z3),
    withRange('Z4', tops.Z3 + 1, tops.Z4),
    withRange('Z5', tops.Z4 + 1, null)
  ]
}

// 개인 심박 기준에서 심박존/상한을 파생한다.
// 우선순위: lactateThresholdHr > 측정 maxHeartRate > Tanaka(birthYear) 추정 > 상수 fallback.
// resting HR은 코칭/회복 맥락으로 보존하며(추후 HRR 확장 여지), 현재 존 anchor 산출에는 직접 쓰지 않는다.
export function deriveHeartRateModel(
  profile: HeartRatePersonalInput | null | undefined,
  referenceYear: number = new Date().getFullYear()
): HeartRateModel {
  const lthr = normalizeBpm(profile?.lactateThresholdHr)
  const measuredMax = normalizeBpm(profile?.maxHeartRate)
  const restingHeartRate = normalizeBpm(profile?.restingHeartRate)

  let anchorBpm = DEFAULT_TEMPO_CEILING_BPM
  let estimatedMaxHr: number | null = measuredMax
  let source: HeartRateModelSource = 'default'

  if (lthr !== null) {
    anchorBpm = lthr
    source = 'lthr'
  } else if (measuredMax !== null) {
    anchorBpm = Math.round(measuredMax * LT_FRACTION_OF_MAX)
    source = 'measured_max'
  } else {
    const tanaka = tanakaMaxHr(profile?.birthYear, referenceYear)
    if (tanaka !== null) {
      anchorBpm = Math.round(tanaka * LT_FRACTION_OF_MAX)
      estimatedMaxHr = tanaka
      source = 'age_estimated'
    }
  }

  const zones = buildHeartRateZones(anchorBpm)
  const zoneTop = (zone: HeartRateZone) => zones.find((item) => item.zone === zone)?.maxBpm ?? DEFAULT_TEMPO_CEILING_BPM
  return {
    zones,
    anchorBpm,
    tempoCeilingBpm: zoneTop('Z4'),
    easyCeilingBpm: zoneTop('Z2'),
    recoveryCeilingBpm: zoneTop('Z1'),
    estimatedMaxHr,
    restingHeartRate,
    source,
    isEstimated: source === 'age_estimated'
  }
}

function normalizeBpm(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded >= 30 && rounded <= 240 ? rounded : null
}

export function getHeartRateZone(
  heartRate: number | null | undefined,
  zones: HeartRateZoneDefinition[] = defaultHeartRateZones
): HeartRateZone {
  if (typeof heartRate !== 'number' || !Number.isFinite(heartRate)) return 'Unknown'
  return zones.find((zone) => {
    const overMin = zone.minBpm === null || heartRate >= zone.minBpm
    const underMax = zone.maxBpm === null || heartRate <= zone.maxBpm
    return overMin && underMax
  })?.zone ?? 'Unknown'
}

export function isHeartRateAtOrBelowZone2(heartRate: number | null | undefined): boolean {
  const zone = getHeartRateZone(heartRate)
  return zone === 'Z0' || zone === 'Z1' || zone === 'Z2'
}

export function isRecoveryHeartRateZone(heartRate: number | null | undefined): boolean {
  const zone = getHeartRateZone(heartRate)
  return zone === 'Z0' || zone === 'Z1'
}

export function isTempoHeartRateZone(heartRate: number | null | undefined): boolean {
  return getHeartRateZone(heartRate) === 'Z4'
}
