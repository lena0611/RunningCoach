# HealthKit 데이터 계약

이 문서는 iOS 네이티브 HealthKit 브리지가 Vue 웹 UI에 넘길 러닝 데이터 후보 구조를 정의한다.

## 목적
- Workoutdoors 또는 Apple 기본 운동 앱이 Apple 건강 앱/HealthKit에 저장한 러닝 기록을 읽는다.
- 네이티브 코드는 HealthKit 권한과 조회만 담당하고, 웹 앱은 전달받은 구조화 데이터 후보를 사용자가 확인/저장하게 한다.
- HealthKit 원본 샘플 전체를 장기 저장하지 않는다. 네이티브는 코칭에 필요한 샘플을 넓게 조회하되, 웹/DB에는 요약된 `RunLog` 후보만 넘긴다.

## HealthKit 입력 타입
- `HKWorkout`
  - 러닝 세션의 기본 컨테이너다.
  - `workoutActivityType == .running`인 항목만 기본 대상으로 한다.
  - 사용 필드: identifier, startDate, endDate, duration, metadata, allStatistics/statistics.
- `HKQuantitySample`
  - 운동에 연결된 세부 지표다.
  - 우선 조회 대상:
    - `heartRate`
    - `distanceWalkingRunning` 또는 workout distance statistics
    - `activeEnergyBurned`
    - `runningSpeed`
    - `runningPower`
    - `runningStrideLength`
    - `runningVerticalOscillation`
    - 가능한 경우 cadence 계열 수치
- `HKWorkoutRoute`
  - GPS route가 허용되고 존재할 때만 보조로 조회한다.
  - route 원본 전체 좌표는 저장하지 않는다. 세션 상세의 Apple Fitness형 경로 표시를 위해 downsampled `routePoints`만 저장한다.

## 웹으로 넘길 후보 구조

```ts
type HealthKitRunCandidate = {
  externalId: string
  sourceName: string | null
  date: string
  startAt: string
  endAt: string
  durationSec: number | null
  distanceKm: number | null
  avgPaceSec: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  cadence: number | null
  activeEnergyKcal: number | null
  temperature: number | null
  humidity: number | null
  windMps: number | null
  elevationGainM: number | null
  elevationLossM: number | null
  rpe: number | null
  routeAvailable: boolean
  laps: Lap[]
  fastSegments: FastSegment[]
  metricSamples: RunMetricSample[]
  routePoints: RunRoutePoint[]
  rawAvailability: {
    workout: boolean
    heartRate: boolean
    route: boolean
    cadence: boolean
    runningDynamics: boolean
  }
}

type FastSegment = {
  index: number
  startSec: number | null
  durationSec: number | null
  distanceKm: number | null
  avgPaceSec: number | null
  bestPaceSec: number | null
}

type RunMetricSample = {
  offsetSec: number
  heartRate: number | null
  paceSec: number | null
  cadence: number | null
}

type RunRoutePoint = {
  offsetSec: number
  latitude: number
  longitude: number
  altitude: number | null
}
```

## 세부 데이터 배열 구조

HealthKit 후보는 세션 요약만이 아니라 `laps`, `fastSegments`, `metricSamples`, `routePoints` 네 가지 세부 배열을 함께 넘긴다. 각 배열은 목적이 다르므로 UI와 AI 코칭에서 섞어 쓰지 않는다.

### `laps`

```ts
type Lap = {
  index: number
  distanceKm: number | null
  paceSec: number | null
  avgHeartRate: number | null
  maxHeartRate?: number | null
  cadence: number | null
}
```

- 네이티브 HealthKit 구현의 기본 lap은 Workoutdoors FIT step이 아니라 1km 전후의 거리 기반 split이다.
- 생성 우선순위:
  1. route location이 있으면 GPS 거리 누적으로 1km 단위 split 생성
  2. route가 없고 distance sample이 있으면 거리 샘플 누적으로 1km 단위 split 생성
  3. 둘 다 부족하면 세션 전체 1개 lap 또는 빈 배열
- `paceSec`: 해당 lap의 `durationSec / distanceKm`
- `avgHeartRate`: 해당 lap 시간 구간의 평균 심박
- `cadence`: 해당 lap 시간 구간의 평균 케이던스
- `maxHeartRate`: 현재 네이티브 HealthKit lap 구조에는 직접 포함되지 않는다. FIT import에서 lap `max_heart_rate`가 있으면 저장될 수 있고, HealthKit 세션 상세 UI는 `metricSamples`를 같은 lap 시간 구간으로 잘라 화면에서 최대심박을 보정 표시한다.
- HealthKit lap은 20초 가속/1분40초 회복 같은 Workoutdoors workout step 구조를 보장하지 않는다. Easy + Strides 판정은 `laps`보다 `metricSamples`, `fastSegments`, 필요 시 FIT import split을 더 중요하게 본다.

### `metricSamples`

```ts
type RunMetricSample = {
  offsetSec: number
  heartRate: number | null
  paceSec: number | null
  cadence: number | null
}
```

- 러닝 중간 과정을 복기하기 위한 시간축 샘플이다.
- 네이티브는 세션 길이를 기준으로 bucket을 만들고, bucket 크기는 `max(15초, durationSec / 80 올림)`이다.
- 최대 120개까지만 웹으로 넘긴다.
- `heartRate`: bucket 내 평균 심박
- `paceSec`: `runningSpeed`가 있으면 그것을 우선 사용하고, 없으면 route timestamp 좌표로 계산한 속도를 사용한다.
- `cadence`: step/count 기반 cadence 계열 데이터를 bucket 평균으로 계산한다.
- 이 배열은 Apple Fitness형 페이스/심박수/케이던스/고도 차트의 x축 기준이 된다.
- 이 배열은 랩별 최대심박 보정에도 사용한다. 단, 현재 값은 raw instantaneous max가 아니라 bucket 평균들의 최대값이므로 “실제 순간 최고심박”과는 다를 수 있다.

### `routePoints`

```ts
type RunRoutePoint = {
  offsetSec: number
  latitude: number
  longitude: number
  altitude: number | null
}
```

- 지도 경로와 고도 차트, 코스 타입 추론에 쓰는 downsampled route다.
- 원본 route 전체 좌표를 저장하지 않는다.
- `offsetSec`: workout 시작 시각 기준 route point의 경과 초
- `latitude`, `longitude`: 지도 경로 표시용 좌표
- `altitude`: 고도 차트와 누적 상승/하강, Flat/Mixed/Hilly/Trail 추론에 사용한다.
- route가 없으면 지도 경로, 고도 차트, 고도 기반 코스 타입 추론은 제한된다.

### `fastSegments`

```ts
type FastSegment = {
  index: number
  startSec: number | null
  durationSec: number | null
  distanceKm: number | null
  avgPaceSec: number | null
  bestPaceSec: number | null
}
```

- 짧은 가속 구간을 감지하기 위한 요약 배열이다.
- 네이티브는 `runningSpeed` 샘플을 우선 사용하고, 없으면 route timestamp 좌표 기반 속도에서 후보를 만든다.
- 최대 12개까지만 유지한다.
- Easy + Strides처럼 1km lap으로는 뭉개지는 세션 유형을 추론할 때 핵심 근거다.

## 웹-네이티브 브리지
- 웹 -> 네이티브 요청:
  - `window.webkit.messageHandlers.runContextHealthKit.postMessage({ type: 'requestRecentRunningWorkouts', days: 14 })`
  - `window.webkit.messageHandlers.runContextHealthKit.postMessage({ type: 'requestRunningWorkoutByExternalId', externalId })`
- 네이티브 -> 웹 응답:
  - 성공: `window.RunContextHealthKit.receiveRuns(candidates)`
  - 실패: `window.RunContextHealthKit.receiveError(message)`
  - 단일 세션 갱신 성공: `window.RunContextHealthKit.receiveRunUpdate(candidate)`
  - 단일 세션 갱신 실패: `window.RunContextHealthKit.receiveRunUpdateError(externalId, message)`
- 네이티브는 `HealthKitRunCandidate[]`를 plain JSON으로 직렬화해 넘긴다.
- 웹은 후보를 바로 저장하지 않고 확인/수정 폼에 채운다.

## HealthKit/알림 브리지 플로우
- PaceLAB의 iOS 알림은 APNs/FCM 원격 푸시가 아니라 `runContextNotifications` WebView bridge를 통해 네이티브가 예약/표시하는 로컬 알림이다.
- 앱 시작 또는 인증 후 웹이 `syncNotificationSettings`를 보내면 네이티브는 `allEnabled`, `healthKitNewRun`을 `UserDefaults`에 저장하고, `pacelab-` prefix의 기존 예약 알림을 제거한 뒤 웹이 넘긴 새 예약 알림을 등록한다.
- 앱 설정에서 전체 알림 또는 개별 알림을 바꾸면 웹은 최신 설정 객체를 즉시 `syncNotificationSettings`로 다시 보낸다. 네이티브는 이 sync를 iOS 알림 권한 요청 기회로도 사용한다.
- 훈련 스케줄 알림은 웹이 주간 루틴을 기준으로 최대 14일치 후보를 만든다. `workoutMorning`은 오전 7시, `scheduledWorkout`은 오후 6시 로컬 알림으로 예약한다.
- HealthKit 신규 러닝 감지는 네이티브 `HKObserverQuery`와 `enableBackgroundDelivery(.immediate)`를 사용한다. 감지 대상은 `.running` workout 변경이다.
- 앱이 foreground `active` 상태에서 HealthKit 변경을 감지하면 네이티브는 배너를 직접 띄우지 않고 `window.RunContextHealthKit.receiveHealthKitChanged('background-delivery')`를 호출한다. 웹은 reason 값으로 분기하지 않고 `syncAfterNativeChange()`를 실행해 최근 HealthKit 러닝을 즉시 다시 요청한다.
- foreground 자동 동기화 결과 새 러닝이 저장되면 웹은 toast로 저장 결과를 표시하고, 앱 내부 알림 설정의 `allEnabled`와 `healthKitNewRun`이 모두 켜져 있을 때 `showNotification` bridge로 "새 러닝 기록을 가져왔습니다" 로컬 알림을 요청한다.
- 앱이 background 상태에서 HealthKit 변경을 감지하면 네이티브는 웹 동기화 대신 "새 러닝 기록이 감지됐습니다" 로컬 알림을 시도한다. 조건은 iOS 알림 권한 허용, `allEnabled=true`, `healthKitNewRun=true`이다. 사용자가 앱을 다시 열면 기존 activation sync가 누락 러닝을 저장한다.
- HealthKit 감지가 웹 설정 sync보다 먼저 와서 네이티브 저장 설정이 아직 `allEnabled=false`이고 `healthKitNewRun=true`이면 네이티브는 감지를 최대 10분 pending으로 보관한다. 이후 `syncNotificationSettings`에서 `allEnabled=true`가 들어오면 pending HealthKit 감지 알림을 표시한다.
- 앱이 foreground에 있어도 네이티브 즉시 알림은 `UNUserNotificationCenterDelegate.willPresent`에서 `.banner`, `.sound`, `.list`를 반환하므로 배너로 보일 수 있다.
- 사용자가 앱을 강제 종료한 상태에서 HealthKit background delivery가 반드시 앱을 깨운다고 보장하지 않는다. 강제 종료 상태까지 사용자 호출을 보장해야 하는 요구는 원격 푸시/APNs 설계로 별도 분리한다.

## 동기화 정책
- 앱 기동/재활성화 자동 동기화는 현재 저장된 최신 `RunLog.date` 이후의 새 HealthKit 러닝만 가져온다.
- 이미 저장된 HealthKit 세션은 자동 동기화에서 갱신하지 않는다. 기존 세션 보강은 세션 상세의 새로고침 아이콘을 통해 사용자가 명시적으로 요청한다.
- 단일 세션 갱신은 `RunLog.externalId`와 `HKWorkout.uuid`를 매칭해 같은 원본 운동만 다시 조회한다.
- 단일 세션 갱신은 HealthKit 유래 구조화 필드(`distanceKm`, `durationSec`, `avgPaceSec`, `avgHeartRate`, `maxHeartRate`, `cadence`, `activeEnergyKcal`, `elevationGainM`, `elevationLossM`, `laps`, `fastSegments`, `metricSamples`, `routePoints`, `rawAvailability`)를 새 값으로 갱신한다.
- 단일 세션 갱신은 사용자가 입력한 코칭 메모, RPE, 통증 메모, 동반주, 제목, 기존 AI 코칭 대화 기록을 보존한다.

## `RunLog` 매핑
- `date`: `HKWorkout.startDate`의 로컬 날짜
- `durationSec`: `HKWorkout.duration`
- `distanceKm`: workout distance statistics 또는 distance quantity sample 합계
- `avgPaceSec`: `durationSec / distanceKm`
- `avgHeartRate`: workout 기간 내 heart rate 평균
- `maxHeartRate`: workout 기간 내 heart rate 최대
- `cadence`: HealthKit에서 cadence 계열 지표가 있을 때만 사용한다. 없으면 `null`.
- `activeEnergyKcal`: `activeEnergyBurned` statistics가 있으면 활동 칼로리(kcal)로 채운다. Apple Fitness의 “활동 킬로칼로리”에 해당하며, 총 칼로리와 혼동하지 않는다. 없으면 `null`.
- `temperature`: `HKMetadataKeyWeatherTemperature`가 있으면 섭씨로 채운다. 없으면 `null`.
- `humidity`: `HKMetadataKeyWeatherHumidity`가 있으면 0~100 퍼센트로 채운다. 없으면 `null`.
- `windMps`: HealthKit workout metadata에서 안정적으로 기대하지 않는다. 없으면 `null`.
- `elevationGainM`: route location altitude로 계산한 누적 상승이다. route와 유효 altitude가 있으면 평지에 가까운 기록도 `0` 또는 작은 수치로 채우고, route나 유효 altitude가 없을 때만 `null`.
- `elevationLossM`: route location altitude로 계산한 누적 하강이다. route와 유효 altitude가 있으면 평지에 가까운 기록도 `0` 또는 작은 수치로 채우고, route나 유효 altitude가 없을 때만 `null`.
- `courseType`: 웹에서 `elevationGainM`, `elevationLossM`, `distanceKm`, `routePoints.altitude`로 사용자 수정 가능한 기본값을 추론한다. 고저 데이터가 부족하면 `Unknown`으로 둔다. 고도 기반 자동 추론은 Flat/Mixed/Hilly/Trail까지만 수행하고, Track/Treadmill은 고도만으로 단정하지 않는다.
- `rpe`: iOS 18+에서 `workoutEffortScore`가 workout에 연결되어 조회될 때만 운동강도로 채운다. 없으면 사용자가 수정할 수 있게 `null`로 둔다.
- `laps`: HealthKit에서 route 또는 거리 샘플이 있으면 네이티브가 1km 단위 split으로 가공해 채운다. 각 lap은 거리, 페이스, 평균 심박을 우선 채우고 cadence는 가능한 경우에만 채운다. HealthKit lap은 Workoutdoors FIT의 workout step split처럼 세부 가속/회복 구조를 보장하지 않는다. 랩 최대심박은 HealthKit 후보 원본에 없을 수 있으며, 웹 UI는 `metricSamples`를 lap 시간 구간으로 잘라 보정 표시한다.
- `fastSegments`: `runningSpeed` 샘플을 우선 사용하고, 없으면 route timestamp 좌표에서 계산한 짧은 고속 구간 요약이다. HealthKit lap이 1km로 뭉개져도 `fastSegments`가 있으면 Easy + Strides 추론의 핵심 근거로 사용한다.
- `metricSamples`: 심박/페이스/케이던스를 시간축으로 downsample한 표시/코칭용 샘플이다. Apple Fitness형 세부 차트와 중간 과정 분석에 사용한다.
- `routePoints`: 원본 route 전체가 아니라 화면 표시를 위해 downsample한 좌표 샘플이다. 시작/종료 노드, 선택 구간 표시, 경로 미리보기에만 사용한다.
- `source`: HealthKit 후보 저장 시 `healthkit`을 사용한다.

## 제한과 보완
- HealthKit은 Workoutdoors의 FIT 전체 필드를 1:1로 보장하지 않는다.
- Workoutdoors 고유 메타데이터, 일부 러닝 다이내믹스는 누락될 수 있다.
- route가 없고 거리 샘플도 부족하면 lap은 세션 전체 1개 요약 또는 빈 배열일 수 있다.
- route/speed 샘플이 없으면 `fastSegments`는 빈 배열일 수 있다. 이 경우 1km lap만 보고 Easy + Strides로 단정하지 않고 자동 판정은 보수적으로 수행한다.
- FIT 업로드는 HealthKit 누락 지표를 보완하는 입력 채널로 유지한다. Workoutdoors FIT가 짧은 가속/회복 split을 보존하면 route가 없어도 Easy + Strides 판정 근거로 사용한다.
- Route 원본 전체 좌표와 원본 파일은 저장 금지다. 사용자가 세션 상세 지도형 표시를 요구했으므로 DB에는 downsampled `routePoints`만 저장한다.

## 구현 검증 기준
- 같은 날짜의 Workoutdoors/Apple 기본 러닝이 HealthKit에서 `.running` workout으로 조회되는지 확인한다.
- 거리, 시간, 평균 페이스가 Apple 건강/피트니스 앱 표시와 큰 차이가 없는지 확인한다.
- route 또는 거리 샘플이 있는 기록은 `laps[]`가 생성되고, lap별 거리 합계가 세션 거리와 크게 어긋나지 않는지 확인한다.
- 심박 평균/최대가 없을 수 있는 상황을 UI가 명확히 표시한다.
- HealthKit 권한 거부 시 FIT 업로드와 수동 입력이 계속 동작한다.
