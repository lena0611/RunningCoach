# WeatherKit 데이터 계약

이 문서는 iOS 네이티브 WeatherKit 브리지가 Vue 웹 UI에 넘길 기상 데이터 구조를 정의한다.

## 목적
- 러닝 준비 판단에 중요한 체감온도, 강수확률, 강수량, 강수 시간대를 홈의 다음 세션 준비 카드에 제공한다.
- 웹 앱은 WeatherKit을 직접 호출하지 않는다. iOS 네이티브 레이어가 위치 권한과 WeatherKit 조회를 담당하고, 웹은 plain JSON만 받는다.
- 기상 데이터는 다음 세션 판단 보조 정보다. 코칭/추천은 기상 때문에 세션 강도를 조정할 수 있지만 의료/안전 보장을 단정하지 않는다.

## iOS 입력 소스
- Apple WeatherKit
  - `WeatherService`
  - `WeatherQuery.current`
  - `WeatherQuery.hourly`
  - `WeatherQuery.daily`
- CoreLocation
  - 현재 위치 기준 예보가 기본값이다.
  - 위치 권한이 거부되면 네이티브는 웹에 오류를 넘기고, 웹은 날씨 없이 기존 추천을 유지한다.

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

## 웹-네이티브 브리지
- 웹 -> 네이티브 요청:
  - `window.webkit.messageHandlers.runContextWeatherKit.postMessage({ type: 'requestWeatherForecast', hours: 24, days: 7 })`
- 네이티브 -> 웹 응답:
  - 성공: `window.RunContextWeatherKit.receiveForecast(snapshot)`
  - 실패: `window.RunContextWeatherKit.receiveError(message)`
- 네이티브는 `WeatherSnapshot`을 plain JSON으로 직렬화해 넘긴다.
- 웹은 앱 기동/활성화 시 WeatherKit 브리지가 있으면 15분 캐시 기준으로 자동 갱신한다.

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
- 홈의 `다음 세션 기상` 카드에 표시한다.
- 우선 표시 지표:
  - 실제 온도
  - 체감 온도
  - 향후 6~12시간 강수확률
  - 향후 6~12시간 강수량
  - 비가 올 가능성이 있는 시간대
- 30도 이상 체감온도는 더위 주의로 보며, 사용자의 더위 심박 상승 성향과 함께 코칭에서 보수적으로 사용한다.
- 비 예보가 높으면 미끄러운 노면, 신발 젖음, 훈련 강도 조정 포인트를 보여준다.

## iOS 빌드 체크리스트
- Xcode target에 WeatherKit capability를 추가한다.
- 위치 권한 설명을 `Info.plist`에 추가한다.
- `WKUserContentController`에 `runContextWeatherKit` script message handler를 추가한다.
- 요청 payload의 `type === "requestWeatherForecast"`를 처리한다.
- WeatherKit 조회 결과를 위 `WeatherSnapshot` 구조로 변환해 `window.RunContextWeatherKit.receiveForecast(...)`를 실행한다.
- 실패 시 `window.RunContextWeatherKit.receiveError(message)`를 실행한다.

## 구현 검증 기준
- iOS 앱 기동 후 홈에 `다음 세션 기상` 카드가 채워진다.
- 체감온도와 실제 온도가 구분되어 보인다.
- 강수확률과 강수량, 비 가능 시간대가 표시된다.
- 위치/WeatherKit 권한 거부 시 앱 전체가 실패하지 않고 날씨 카드만 빈 상태 또는 오류 상태로 남는다.
