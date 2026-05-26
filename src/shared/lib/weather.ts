import type { WeatherHourlyPoint, WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'

export type RunningWeatherAdvice = {
  level: 'good' | 'caution' | 'bad' | 'unknown'
  title: string
  summary: string
  bullets: string[]
}

export function getRunningWeatherAdvice(snapshot: WeatherSnapshot | null): RunningWeatherAdvice {
  if (!snapshot) {
    return {
      level: 'unknown',
      title: '기상정보 대기',
      summary: '위치 권한을 허용하면 무료 Open-Meteo 예보로 다음 세션 준비를 보여줍니다.',
      bullets: ['체감온도', '강수확률', '강수량/강수시간']
    }
  }

  const current = snapshot.current
  const observedAt = Date.parse(snapshot.observedAt)
  const nextSixHours = getUpcomingHours(snapshot.hourly, 6, Number.isFinite(observedAt) ? observedAt : Date.now())
  const apparent = current.apparentTemperatureC ?? current.temperatureC
  const rainHours = nextSixHours.filter((hour) => hasRain(hour))
  const maxRainChance = Math.max(...nextSixHours.map((hour) => hour.precipitationChance ?? 0), current.precipitationIntensityMmPerHour ? 0.7 : 0)
  const rainAmount = round(nextSixHours.reduce((sum, hour) => sum + (hour.precipitationAmountMm ?? 0), 0))
  const rainSummary = rainHours.length ? `${rainHours.length}시간 비 가능` : '향후 6시간 강수 낮음'

  if (apparent !== null && apparent >= 30) {
    return {
      level: 'bad',
      title: '더위 주의',
      summary: `체감 ${Math.round(apparent)}도입니다. 오늘은 페이스보다 심박과 체감강도를 먼저 봐야 합니다.`,
      bullets: [`${rainSummary}`, `예상 강수량 ${rainAmount}mm`, '낮 시간 강도훈련은 피하기']
    }
  }

  if (maxRainChance >= 0.6 || rainAmount >= 2) {
    return {
      level: 'caution',
      title: '비 예보 확인',
      summary: `강수 가능성이 높습니다. 미끄러운 노면과 신발 젖는 시간을 고려하세요.`,
      bullets: [`최대 강수확률 ${Math.round(maxRainChance * 100)}%`, `예상 강수량 ${rainAmount}mm`, rainSummary]
    }
  }

  if (apparent !== null && apparent <= 2) {
    return {
      level: 'caution',
      title: '초반 보온 필요',
      summary: `체감 ${Math.round(apparent)}도입니다. 워밍업을 길게 잡는 편이 낫습니다.`,
      bullets: [`${rainSummary}`, `예상 강수량 ${rainAmount}mm`, '초반 10분은 완전 이지']
    }
  }

  return {
    level: 'good',
    title: '러닝하기 무난',
    summary: apparent !== null ? `체감 ${Math.round(apparent)}도 기준으로 무난합니다.` : '현재 기상 조건은 큰 부담이 없어 보입니다.',
    bullets: [`${rainSummary}`, `예상 강수량 ${rainAmount}mm`, maxRainChance ? `최대 강수확률 ${Math.round(maxRainChance * 100)}%` : '강수확률 낮음']
  }
}

export function getUpcomingHours(hourly: WeatherHourlyPoint[], count: number, referenceTime = Date.now()) {
  return hourly
    .filter((hour) => {
      const time = Date.parse(hour.time)
      return Number.isFinite(time) && time >= referenceTime - 60 * 60 * 1000
    })
    .slice(0, count)
}

export function getRainWindowText(hourly: WeatherHourlyPoint[]) {
  const upcoming = getUpcomingHours(hourly, 12)
  let rainHours = upcoming.filter(hasRain)
  if (!rainHours.length) rainHours = hourly.slice(0, 12).filter(hasRain)
  if (!rainHours.length) return '향후 12시간 뚜렷한 비 없음'
  const first = rainHours[0]
  const last = rainHours[rainHours.length - 1]
  return `${formatHour(first.time)}~${formatHour(last.time)} 비 가능`
}

export function weatherSymbolToEmoji(symbolName: string) {
  if (/sun|clear/.test(symbolName)) return '☀️'
  if (/cloud\.rain|rain|drizzle/.test(symbolName)) return '🌧️'
  if (/snow/.test(symbolName)) return '🌨️'
  if (/bolt|thunder/.test(symbolName)) return '⛈️'
  if (/wind/.test(symbolName)) return '🌬️'
  if (/cloud/.test(symbolName)) return '☁️'
  return '🌤️'
}

export function formatWeatherNumber(value: number | null, unit = '') {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${Math.round(value)}${unit}`
}

export function formatRainAmount(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '-'
  if (value < 0.1) return '0mm'
  return `${round(value)}mm`
}

function hasRain(hour: WeatherHourlyPoint) {
  return (hour.precipitationChance ?? 0) >= 0.35 || (hour.precipitationAmountMm ?? 0) >= 0.1 || (hour.precipitationIntensityMmPerHour ?? 0) >= 0.1
}

function formatHour(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getHours()}시`
}

function round(value: number) {
  return Math.round(value * 10) / 10
}
