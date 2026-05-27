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

export function getHeartRateZone(heartRate: number | null | undefined): HeartRateZone {
  if (typeof heartRate !== 'number' || !Number.isFinite(heartRate)) return 'Unknown'
  return defaultHeartRateZones.find((zone) => {
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
