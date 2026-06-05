// 러너 날씨 파생지표(L2)와 의사결정(L3). 순수 함수로 두어 Vitest로 검증한다.
// 설계 합의: .claude memory weather-runner-domain.md, Issue #219.
// 체감온도 공식은 Edge weather-run/index.ts feltTemperatureC와 미러로 유지한다.

export type RunningSafetyLevel = 'good' | 'caution' | 'bad' | 'unknown'
export type RunningSafetyKind = 'heat' | 'cold' | 'rain' | 'wind' | 'mild' | 'unknown'

export type RunningSafety = {
  level: RunningSafetyLevel
  kind: RunningSafetyKind
  title: string
  summary: string
  bullets: string[]
}

export type OutfitRecommendation = {
  bucketIndex: number
  label: string
  top: string
  bottom: string
  accessories: string[]
  note: string
}

// 계절분기 체감온도(자체 산출). 여름(>=20℃ & 습도): 기상청 여름철 체감온도(Stull 습구 기반).
// 겨울(<=10℃ & 풍속>1.3m/s): 기상청 풍속냉각. 중간: 기온 그대로(왜곡 방지).
export function feltTemperatureC(tempC: number | null, humidityPct: number | null, windMps: number | null): number | null {
  if (tempC === null || !Number.isFinite(tempC)) return null
  const rh = humidityPct !== null && Number.isFinite(humidityPct) ? humidityPct : null

  if (tempC >= 20 && rh !== null) {
    const tw =
      tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
      Math.atan(tempC + rh) -
      Math.atan(rh - 1.67633) +
      0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
      4.686035
    const at = -0.2442 + 0.55399 * tw + 0.45535 * tempC - 0.0022 * tw * tw + 0.00278 * tw * tempC + 3.0
    return round1(at)
  }

  if (tempC <= 10 && windMps !== null && Number.isFinite(windMps) && windMps > 1.3) {
    const v = Math.pow(windMps * 3.6, 0.16)
    const wc = 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v
    return round1(wc)
  }

  return tempC
}

// 러닝 체감온도 -> 5℃ 단위 10버킷(≤-10 ~ ≥30) 인덱스. null이면 -1.
export function outfitBucketIndex(feltTempC: number | null): number {
  if (feltTempC === null || !Number.isFinite(feltTempC)) return -1
  if (feltTempC < -10) return 0
  if (feltTempC >= 30) return 9
  return Math.floor((feltTempC + 10) / 5) + 1 // -10~-5 ->1 ... 25~30 ->8
}

const OUTFIT_BUCKETS: Omit<OutfitRecommendation, 'bucketIndex' | 'note'>[] = [
  { label: '−10℃ 이하 (혹한)', top: '기모 긴팔 + 보온 미드레이어 + 방풍 재킷', bottom: '기모 긴 타이츠 + 바람막이 하의', accessories: ['모자/넥워머', '장갑', '귀마개'] },
  { label: '−10 ~ −5℃ (강추위)', top: '기모 긴팔 + 방풍 재킷', bottom: '기모 긴 타이츠', accessories: ['장갑', '모자'] },
  { label: '−5 ~ 0℃ (한겨울)', top: '긴팔 + 얇은 바람막이', bottom: '긴 타이츠', accessories: ['장갑', '얇은 모자'] },
  { label: '0 ~ 5℃ (쌀쌀)', top: '긴팔 + 얇은 바람막이(초반)', bottom: '긴 타이츠', accessories: ['얇은 장갑'] },
  { label: '5 ~ 10℃ (선선)', top: '긴팔 한 겹', bottom: '긴 타이츠 또는 반바지+토시', accessories: ['초반 얇은 장갑'] },
  { label: '10 ~ 15℃ (러닝 최적)', top: '반팔 + 얇은 긴팔(초반만)', bottom: '반바지 또는 7부', accessories: [] },
  { label: '15 ~ 20℃ (쾌적)', top: '반팔', bottom: '반바지', accessories: [] },
  { label: '20 ~ 25℃ (따뜻)', top: '반팔 또는 민소매', bottom: '반바지', accessories: ['수분 챙기기'] },
  { label: '25 ~ 30℃ (더움)', top: '통풍 민소매/반팔', bottom: '가벼운 반바지', accessories: ['모자', '선크림', '수분·전해질'] },
  { label: '30℃ 이상 (폭염)', top: '통풍 민소매', bottom: '가벼운 반바지', accessories: ['모자', '선크림', '수분·전해질', '강도 낮추기'] }
]

// 러닝 중엔 정지 체감보다 덥게 느껴진다 -> 옷차림은 체감온도 기준 한 단계 가볍게.
export function getOutfitRecommendation(feltTempC: number | null, opts: { rain?: boolean; windy?: boolean } = {}): OutfitRecommendation | null {
  const index = outfitBucketIndex(feltTempC)
  if (index < 0) return null
  const base = OUTFIT_BUCKETS[index]
  const accessories = [...base.accessories]
  if (opts.rain) accessories.push('방수 캡/재킷', '미끄럼 주의')
  if (opts.windy && index <= 5) accessories.push('바람막이 가점')
  return {
    bucketIndex: index,
    label: base.label,
    top: base.top,
    bottom: base.bottom,
    accessories,
    note: index >= 5 && index <= 7 ? '러닝 중 체온이 올라 실제보다 덥게 느껴집니다. 한 겹 가볍게 입으세요.' : '러닝 시작 직후엔 추워도 곧 더워집니다. 한 단계 가볍게.'
  }
}

export type DerivedHour = {
  temperatureC: number | null
  apparentTemperatureC: number | null
  humidity: number | null
  windMps: number | null
  precipitationChance: number | null
  precipitationAmountMm: number | null
}

// 열/한랭/강수/바람 안전등급. 러닝 강도·안전 판단의 단일 출처.
export function getRunningSafety(current: DerivedHour | null, upcomingHours: DerivedHour[] = []): RunningSafety {
  if (!current || current.temperatureC === null) {
    return { level: 'unknown', kind: 'unknown', title: '날씨 대기', summary: '위치를 선택하면 기상청 예보로 러닝 준비를 보여줍니다.', bullets: ['체감온도', '강수확률', '바람'] }
  }
  const felt = current.apparentTemperatureC ?? current.temperatureC
  const maxRainChance = Math.max(current.precipitationChance ?? 0, ...upcomingHours.map((h) => h.precipitationChance ?? 0))
  const rainAmount = round1(upcomingHours.reduce((sum, h) => sum + (h.precipitationAmountMm ?? 0), 0))
  const wind = current.windMps ?? 0

  if (felt >= 28) {
    return { level: 'bad', kind: 'heat', title: '더위 주의', summary: `체감 ${Math.round(felt)}도입니다. 페이스보다 심박·체감강도를 먼저 보고 수분을 챙기세요.`, bullets: [`체감 ${Math.round(felt)}도`, '강도훈련은 이른 아침/저녁으로', '수분·전해질 보충'] }
  }
  if (felt <= -8) {
    return { level: 'bad', kind: 'cold', title: '강추위 주의', summary: `체감 ${Math.round(felt)}도입니다. 워밍업을 충분히 하고 초반은 보온하세요.`, bullets: [`체감 ${Math.round(felt)}도`, '워밍업 길게', '노면 결빙 주의'] }
  }
  if (maxRainChance >= 0.6 || rainAmount >= 3) {
    return { level: 'caution', kind: 'rain', title: '비 예보 확인', summary: '강수 가능성이 높습니다. 노면 미끄럼과 젖는 시간을 고려하세요.', bullets: [`최대 강수확률 ${Math.round(maxRainChance * 100)}%`, `예상 강수량 ${rainAmount}mm`, '방수·미끄럼 주의'] }
  }
  if (wind >= 9) {
    return { level: 'caution', kind: 'wind', title: '강풍 주의', summary: `풍속 ${Math.round(wind)}m/s입니다. 맞바람 구간 페이스 저하를 감안하세요.`, bullets: [`풍속 ${Math.round(wind)}m/s`, '맞바람 구간 페이스 여유', '체온 손실 주의'] }
  }
  if (felt <= 2) {
    return { level: 'caution', kind: 'cold', title: '초반 보온 필요', summary: `체감 ${Math.round(felt)}도입니다. 초반 10분은 완전 이지로.`, bullets: [`체감 ${Math.round(felt)}도`, '초반 보온', '워밍업 충분히'] }
  }
  return { level: 'good', kind: 'mild', title: '러닝하기 무난', summary: `체감 ${Math.round(felt)}도 기준으로 무난합니다.`, bullets: [`체감 ${Math.round(felt)}도`, maxRainChance ? `최대 강수확률 ${Math.round(maxRainChance * 100)}%` : '강수확률 낮음', wind ? `풍속 ${Math.round(wind)}m/s` : '바람 약함'] }
}

export type HumidityLoad = { level: 'low' | 'normal' | 'high'; text: string }

export function getHumidityLoad(humidityPct: number | null): HumidityLoad | null {
  if (humidityPct === null || !Number.isFinite(humidityPct)) return null
  if (humidityPct >= 80) return { level: 'high', text: '습도 높음 — 땀 증발이 더뎌 체감강도가 올라갑니다.' }
  if (humidityPct <= 30) return { level: 'low', text: '건조 — 수분 손실에 유의하세요.' }
  return { level: 'normal', text: '습도 보통' }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
