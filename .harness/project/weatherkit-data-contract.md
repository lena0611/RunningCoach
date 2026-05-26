# 날씨 데이터 계약

이 문서는 RunContext가 홈/AI 코칭에 사용하는 날씨 데이터 구조를 정의한다.

## 목적
- 러닝 준비 판단에 중요한 체감온도, 강수확률, 강수량, 강수 시간대를 홈의 다음 세션 준비 카드에 제공한다.
- 기본 구현은 무료 Open-Meteo forecast API를 사용한다. API key는 필요 없고, 사용자의 현재 위치 권한을 받은 뒤 좌표를 낮은 정밀도로 반올림해 호출한다.
- WeatherKit은 Personal Team 빌드 제한 때문에 보류한다. 유료 Apple Developer Program 전환 전에는 WeatherKit capability를 켜지 않는다.
- 날씨 데이터는 다음 세션 판단 보조 정보다. 코칭/추천은 날씨 때문에 세션 강도를 조정할 수 있지만 의료/안전 보장을 단정하지 않는다.

## 입력 소스
- 기본값: Open-Meteo `https://api.open-meteo.com/v1/forecast`
  - `current`: temperature, apparent temperature, humidity, wind speed, precipitation, weather code
  - `hourly`: temperature, apparent temperature, precipitation probability/amount/intensity, weather code
  - `daily`: min/max temperature, precipitation probability/amount, weather code
- 위치:
  - 일반 브라우저/localhost는 `navigator.geolocation`을 사용한다.
  - iOS 하이브리드 앱은 네이티브 브리지에서 CoreLocation으로 위치를 잡고 무료 Open-Meteo를 호출한다. WKWebView geolocation은 기동 직후 타임아웃이 흔하므로 기본 경로로 쓰지 않는다.
  - 위치 권한이 거부되면 웹은 날씨 없이 기존 추천을 유지한다.
  - API 요청 좌표는 소수 둘째 자리 수준으로 반올림한다.

## 웹으로 넘길 후보 구조

```ts
type WeatherSnapshot = {
  locationName: string | null
  observedAt: string
  current: {
    temperatureC: number | null
    apparentTemperatureC: number | null
    humidity: number | null
    windMps: number | null
    precipitationIntensityMmPerHour: number | null
    condition: string
    symbolName: string
    isDaylight: boolean
  }
  hourly: WeatherHourlyPoint[]
  daily: WeatherDailyPoint[]
}

type WeatherHourlyPoint = {
  time: string
  temperatureC: number | null
  apparentTemperatureC: number | null
  precipitationChance: number | null // 0~1
  precipitationAmountMm: number | null
  precipitationIntensityMmPerHour: number | null
  condition: string
  symbolName: string
  isDaylight: boolean
}

type WeatherDailyPoint = {
  date: string
  minTemperatureC: number | null
  maxTemperatureC: number | null
  precipitationChance: number | null // 0~1
  precipitationAmountMm: number | null
  symbolName: string
  condition: string
}
```

## 웹 호출 흐름
- iOS 앱: 웹 -> `runContextWeatherKit` 브리지 요청 -> 네이티브 CoreLocation -> Open-Meteo forecast API 호출 -> `WeatherSnapshot`으로 변환해 웹에 전달한다.
- 일반 브라우저/localhost: 웹 -> 위치 권한 요청 -> Open-Meteo forecast API 호출 -> `WeatherSnapshot`으로 변환한다.
- 앱 기동/활성화 시 로그인 상태이고 15분 캐시가 만료됐으면 자동 갱신한다.
- 사용자가 홈의 날씨 카드에서 새로고침 아이콘을 누르면 화면 전체가 아니라 날씨 데이터만 다시 요청한다.

## iOS 날씨 브리지
- 호환을 위해 브리지 이름은 `runContextWeatherKit`을 유지하지만, 현재 구현은 WeatherKit이 아니라 무료 Open-Meteo다.
- 웹 -> 네이티브: `window.webkit.messageHandlers.runContextWeatherKit.postMessage({ type: 'requestWeatherForecast', hours: 24, days: 7 })`
- 네이티브 -> 웹 성공: `window.RunContextWeatherKit.receiveForecast(snapshot)`
- 네이티브 -> 웹 실패: `window.RunContextWeatherKit.receiveError(message)`
- 장기적으로 유료 Apple Developer Program 전환 후 WeatherKit을 다시 켤 수 있지만, Personal Team 빌드에서는 capability를 추가하지 않는다.

## 단위 변환
- 온도: 섭씨 `°C`
- 체감온도: 섭씨 `°C`
- 습도: 0~1 비율
- 풍속: m/s
- 강수확률: 0~1 비율
- 강수량: mm
- 강수강도: mm/h
- 시간: ISO 문자열

## 화면 사용 기준
- 홈의 `다음 세션 날씨` 카드에 표시한다.
- 우선 표시 지표:
  - 실제 온도
  - 체감 온도
  - 향후 6~12시간 강수확률
  - 향후 6~12시간 강수량
  - 비가 올 가능성이 있는 시간대
- 30도 이상 체감온도는 더위 주의로 보며, 사용자의 더위 심박 상승 성향과 함께 코칭에서 보수적으로 사용한다.
- 비 예보가 높으면 미끄러운 노면, 신발 젖음, 훈련 강도 조정 포인트를 보여준다.

## iOS 빌드 체크리스트
- 현재 Personal Team 빌드에서는 Xcode target에 WeatherKit capability를 추가하지 않는다. Personal Team은 WeatherKit provisioning을 지원하지 않아 iPhone 빌드가 실패한다.
- WeatherKit capability는 유료 Apple Developer Program 전환 뒤에만 다시 검토한다.
- Open-Meteo 방식에서도 네이티브 CoreLocation 권한을 위해 위치 권한 설명을 `Info.plist`에 유지한다.

## 구현 검증 기준
- iOS 앱 기동 후 홈에 `다음 세션 날씨` 카드가 채워진다.
- 체감온도와 실제 온도가 구분되어 보인다.
- 강수확률과 강수량, 비 가능 시간대가 표시된다.
- 위치 권한 거부나 Open-Meteo 호출 실패 시 앱 전체가 실패하지 않고 날씨 카드만 빈 상태 또는 오류 상태로 남는다.
