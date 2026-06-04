export type HeartRateZone = 'Z0' | 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'Unknown'

export type HeartRateZoneDefinition = {
  zone: HeartRateZone
  label: string
  minBpm: number | null
  maxBpm: number | null
  trainingMeaning: string
}

// 존 라벨/의미는 bpm 숫자를 박지 않는다. 특정 상한(예: 165)은 개인 anchor에서 파생하며 코드 상수로 두지 않는다.
type HeartRateZoneMeta = { zone: HeartRateZone; label: string; trainingMeaning: string }
const HEART_RATE_ZONE_META: HeartRateZoneMeta[] = [
  { zone: 'Z0', label: '비훈련/매우 낮음', trainingMeaning: '러닝 강도 판단보다는 이동, 대기, 아주 낮은 회복 상태로 본다.' },
  { zone: 'Z1', label: '회복', trainingMeaning: '회복 조깅, 워밍업, 쿨다운. 숨이 편하고 다음 훈련을 방해하지 않는 강도.' },
  { zone: 'Z2', label: '이지', trainingMeaning: 'Easy의 핵심 영역. 페이스보다 심박 안정과 회복 반응을 우선한다.' },
  { zone: 'Z3', label: '이지 상단/스테디 초입', trainingMeaning: 'Easy로는 조금 높은 영역. Steady 성격이 섞일 수 있어 지속 시간과 다음날 반응을 본다.' },
  { zone: 'Z4', label: '템포', trainingMeaning: 'Tempo 품질 영역. 역치 상한을 넘기지 않는 것이 템포 처방의 핵심이다.' },
  { zone: 'Z5', label: '고강도', trainingMeaning: '목표 훈련에서는 보수적으로 다루는 영역. 반복 노출은 회복/부상 반응을 확인한다.' }
]

// 존 상단 경계를 anchor(=LTHR)의 비율로 정의한다. Joe Friel %LTHR 존 모델 계열의 PaceLAB 경계값이며, 특정 bpm 상수가 아니다.
const ZONE_TOP_FRACTION_OF_LTHR: Record<'Z0' | 'Z1' | 'Z2' | 'Z3' | 'Z4', number> = {
  Z0: 0.6,
  Z1: 0.79,
  Z2: 0.88,
  Z3: 0.94,
  Z4: 1
}

// 역치심박(LTHR)을 최대심박의 비율로 추정하는 계수. LT는 보통 HRmax의 88~92% 구간이라 중앙값 0.9를 쓴다.
const LT_FRACTION_OF_MAX = 0.9
// 누적 RunLog에서 관측 최대심박을 추정할 때 필요한 최소 표본 수와 관측 윈도(일).
const OBSERVED_MIN_SAMPLES = 3
const OBSERVED_WINDOW_DAYS = 180

export type HeartRateModeSetting = 'auto' | 'manual'

export type HeartRatePersonalInput = {
  birthYear?: number | null
  maxHeartRate?: number | null
  restingHeartRate?: number | null
  lactateThresholdHr?: number | null
  heartRateMode?: HeartRateModeSetting
}

// 'lthr'/'measured_max'=사용자 직접입력, 'observed_data'/'age_estimated'/'age_data_corrected'=앱 추천, 'insufficient'=근거 부족(상한 미설정).
export type HeartRateModelSource =
  | 'lthr'
  | 'measured_max'
  | 'observed_data'
  | 'age_estimated'
  | 'age_data_corrected'
  | 'insufficient'

export type HeartRateModel = {
  zones: HeartRateZoneDefinition[]
  anchorBpm: number | null
  tempoCeilingBpm: number | null
  easyCeilingBpm: number | null
  recoveryCeilingBpm: number | null
  estimatedMaxHr: number | null
  observedMaxHr: number | null
  restingHeartRate: number | null
  source: HeartRateModelSource
  isEstimated: boolean
  isUserOverride: boolean
}

export type ObservedHeartRate = { observedMaxHr: number | null; sampleCount: number }

// Tanaka 식(208 − 0.7 × 나이). 220−나이보다 특히 40세 이상에서 더 정확하다.
export function tanakaMaxHr(birthYear: number | null | undefined, referenceYear: number): number | null {
  if (typeof birthYear !== 'number' || !Number.isFinite(birthYear)) return null
  const age = referenceYear - birthYear
  if (age < 5 || age > 100) return null
  return Math.round(208 - 0.7 * age)
}

// 누적 RunLog의 max_heart_rate에서 강건한 관측 최대심박을 추정한다. 표본 4개↑면 최고값 1개는 센서 튐으로 보고 2번째 최고값을 쓴다.
export function deriveObservedMaxHr(
  runs: { maxHeartRate: number | null; date: string }[],
  today: Date = new Date(),
  windowDays: number = OBSERVED_WINDOW_DAYS
): ObservedHeartRate {
  const cutoff = new Date(today.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const values = runs
    .filter((run) => new Date(`${run.date}T00:00:00`) >= cutoff)
    .map((run) => normalizeBpm(run.maxHeartRate))
    .filter((value): value is number => value !== null && value >= 120)
    .sort((a, b) => b - a)
  if (values.length < OBSERVED_MIN_SAMPLES) return { observedMaxHr: null, sampleCount: values.length }
  const observedMaxHr = values.length >= 4 ? values[1] : values[0]
  return { observedMaxHr, sampleCount: values.length }
}

// anchor(LTHR)에서 존 경계를 결정적으로 만든다. anchor가 없으면 빈 배열(존 미설정)을 돌려준다.
export function buildHeartRateZones(anchorBpm: number | null): HeartRateZoneDefinition[] {
  if (anchorBpm === null || !Number.isFinite(anchorBpm)) return []
  const safeAnchor = Math.max(80, Math.round(anchorBpm))
  let prevTop = 0
  const tops: Record<'Z0' | 'Z1' | 'Z2' | 'Z3' | 'Z4', number> = { Z0: 0, Z1: 0, Z2: 0, Z3: 0, Z4: 0 }
  ;(['Z0', 'Z1', 'Z2', 'Z3', 'Z4'] as const).forEach((zone) => {
    const top = Math.max(prevTop + 1, Math.round(ZONE_TOP_FRACTION_OF_LTHR[zone] * safeAnchor))
    tops[zone] = top
    prevTop = top
  })
  const meta = (zone: HeartRateZone) => HEART_RATE_ZONE_META.find((item) => item.zone === zone)
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

function buildModel(
  anchorBpm: number | null,
  partial: Pick<HeartRateModel, 'estimatedMaxHr' | 'observedMaxHr' | 'restingHeartRate' | 'source' | 'isEstimated' | 'isUserOverride'>
): HeartRateModel {
  const zones = buildHeartRateZones(anchorBpm)
  const zoneTop = (zone: HeartRateZone) => zones.find((item) => item.zone === zone)?.maxBpm ?? null
  return {
    zones,
    anchorBpm,
    tempoCeilingBpm: zoneTop('Z4'),
    easyCeilingBpm: zoneTop('Z2'),
    recoveryCeilingBpm: zoneTop('Z1'),
    ...partial
  }
}

// 앱 추천 모델: 사용자 직접입력을 무시하고 나이(Tanaka) 베이스 + 누적 데이터 관측으로만 산출한다.
// 보정: 보정 maxHR = max(Tanaka 나이추정, 관측 최대심박). 관측값은 올리는 방향으로만 적용한다(실제 도달 심박은 진짜 max의 하한).
export function deriveRecommendedHeartRateModel(
  profile: HeartRatePersonalInput | null | undefined,
  referenceYear: number = new Date().getFullYear(),
  observed: ObservedHeartRate | null = null
): HeartRateModel {
  const restingHeartRate = normalizeBpm(profile?.restingHeartRate)
  const ageMax = tanakaMaxHr(profile?.birthYear, referenceYear)
  const observedMaxHr = normalizeBpm(observed?.observedMaxHr) && (observed?.observedMaxHr ?? 0) >= 120 ? observed!.observedMaxHr : null

  if (ageMax !== null && observedMaxHr !== null) {
    const corrected = Math.max(ageMax, observedMaxHr)
    return buildModel(Math.round(corrected * LT_FRACTION_OF_MAX), {
      estimatedMaxHr: corrected,
      observedMaxHr,
      restingHeartRate,
      source: observedMaxHr > ageMax ? 'age_data_corrected' : 'age_estimated',
      isEstimated: true,
      isUserOverride: false
    })
  }
  if (ageMax !== null) {
    return buildModel(Math.round(ageMax * LT_FRACTION_OF_MAX), {
      estimatedMaxHr: ageMax, observedMaxHr: null, restingHeartRate, source: 'age_estimated', isEstimated: true, isUserOverride: false
    })
  }
  if (observedMaxHr !== null) {
    return buildModel(Math.round(observedMaxHr * LT_FRACTION_OF_MAX), {
      estimatedMaxHr: observedMaxHr, observedMaxHr, restingHeartRate, source: 'observed_data', isEstimated: true, isUserOverride: false
    })
  }
  return buildModel(null, {
    estimatedMaxHr: null, observedMaxHr: null, restingHeartRate, source: 'insufficient', isEstimated: false, isUserOverride: false
  })
}

// 사용자 직접입력 모델: LTHR > 측정 maxHeartRate. 입력이 없으면 null.
export function deriveManualHeartRateModel(profile: HeartRatePersonalInput | null | undefined): HeartRateModel | null {
  const lthr = normalizeBpm(profile?.lactateThresholdHr)
  const measuredMax = normalizeBpm(profile?.maxHeartRate)
  const restingHeartRate = normalizeBpm(profile?.restingHeartRate)
  if (lthr !== null) {
    return buildModel(lthr, { estimatedMaxHr: measuredMax, observedMaxHr: null, restingHeartRate, source: 'lthr', isEstimated: false, isUserOverride: true })
  }
  if (measuredMax !== null) {
    return buildModel(Math.round(measuredMax * LT_FRACTION_OF_MAX), {
      estimatedMaxHr: measuredMax, observedMaxHr: null, restingHeartRate, source: 'measured_max', isEstimated: false, isUserOverride: true
    })
  }
  return null
}

// 실제 적용 모델. heartRateMode가 'manual'이고 직접입력 값이 있으면 그것을 우선하고, 아니면 추천 모델을 쓴다.
export function deriveHeartRateModel(
  profile: HeartRatePersonalInput | null | undefined,
  referenceYear: number = new Date().getFullYear(),
  observed: ObservedHeartRate | null = null
): HeartRateModel {
  if (profile?.heartRateMode === 'manual') {
    const manual = deriveManualHeartRateModel(profile)
    if (manual) return manual
  }
  return deriveRecommendedHeartRateModel(profile, referenceYear, observed)
}

function normalizeBpm(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded >= 30 && rounded <= 240 ? rounded : null
}

// 심박존 분류. zones는 개인 모델에서 파생한 것을 넘긴다. 비어 있으면(개인 기준 미설정) Unknown.
export function getHeartRateZone(
  heartRate: number | null | undefined,
  zones: HeartRateZoneDefinition[]
): HeartRateZone {
  if (typeof heartRate !== 'number' || !Number.isFinite(heartRate)) return 'Unknown'
  return zones.find((zone) => {
    const overMin = zone.minBpm === null || heartRate >= zone.minBpm
    const underMax = zone.maxBpm === null || heartRate <= zone.maxBpm
    return overMin && underMax
  })?.zone ?? 'Unknown'
}

export function isHeartRateAtOrBelowZone2(heartRate: number | null | undefined, zones: HeartRateZoneDefinition[]): boolean {
  const zone = getHeartRateZone(heartRate, zones)
  return zone === 'Z0' || zone === 'Z1' || zone === 'Z2'
}

export function isRecoveryHeartRateZone(heartRate: number | null | undefined, zones: HeartRateZoneDefinition[]): boolean {
  const zone = getHeartRateZone(heartRate, zones)
  return zone === 'Z0' || zone === 'Z1'
}

export function isTempoHeartRateZone(heartRate: number | null | undefined, zones: HeartRateZoneDefinition[]): boolean {
  return getHeartRateZone(heartRate, zones) === 'Z4'
}
