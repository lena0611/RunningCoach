// 일출/일몰 천문 계산(NOAA 태양위치식). 외부 API·키 없이 위경도+날짜로 계산한다.
// 기상청 단기예보는 일출/일몰 시각을 제공하지 않으므로 주/야 판정과 타임라인 음영의 단일 출처로 쓴다.
// solar noon ± 시간각 방식으로 계산해 UTC 일짜 경계(일출은 전날 UTC, 일몰은 같은 날 UTC)를 Date 산술이 흡수한다.

export type SunTimes = {
  sunrise: Date | null
  sunset: Date | null
}

const DEG = Math.PI / 180

// 날짜(UTC 연/월/일을 대상 달력일로 사용)와 위경도의 일출/일몰을 UTC Date로 반환한다.
export function getSunTimes(date: Date, latitude: number, longitude: number): SunTimes {
  const y = date.getUTCFullYear()
  const mo = date.getUTCMonth()
  const d = date.getUTCDate()
  const dayOfYear = getDayOfYear(y, mo, d)
  const midnightUtc = Date.UTC(y, mo, d, 0, 0, 0)

  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + 0.5)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)

  const latRad = latitude * DEG
  const cosH = Math.cos(90.833 * DEG) / (Math.cos(latRad) * Math.cos(decl)) - Math.tan(latRad) * Math.tan(decl)
  if (cosH > 1 || cosH < -1) return { sunrise: null, sunset: null } // 백야/극야

  const haDeg = Math.acos(cosH) / DEG
  const sunriseMin = 720 - 4 * (longitude + haDeg) - eqTime
  const sunsetMin = 720 - 4 * (longitude - haDeg) - eqTime

  return {
    sunrise: new Date(midnightUtc + Math.round(sunriseMin * 60 * 1000)),
    sunset: new Date(midnightUtc + Math.round(sunsetMin * 60 * 1000))
  }
}

// 특정 시각이 주간인지 판정한다(한국 KST 기준 달력일로 앵커링).
export function isDaylightAt(time: Date, latitude: number, longitude: number): boolean {
  const kstNoonUtc = new Date(time.getTime() + 9 * 60 * 60 * 1000)
  const anchor = new Date(Date.UTC(kstNoonUtc.getUTCFullYear(), kstNoonUtc.getUTCMonth(), kstNoonUtc.getUTCDate(), 3, 0, 0))
  const { sunrise, sunset } = getSunTimes(anchor, latitude, longitude)
  if (sunrise && sunset) return time.getTime() >= sunrise.getTime() && time.getTime() < sunset.getTime()
  const hour = (time.getUTCHours() + 9) % 24
  return hour >= 6 && hour < 19
}

function getDayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 0)
  const current = Date.UTC(year, month, day)
  return Math.floor((current - start) / (24 * 60 * 60 * 1000))
}
