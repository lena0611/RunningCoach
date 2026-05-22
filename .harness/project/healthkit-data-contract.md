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
  - route 원본 좌표를 저장하지 않는다. 1km lap/split 계산 후보 생성에만 사용한다.

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
  routeAvailable: boolean
  laps: Lap[]
  rawAvailability: {
    workout: boolean
    heartRate: boolean
    route: boolean
    cadence: boolean
    runningDynamics: boolean
  }
}
```

## 웹-네이티브 브리지
- 웹 -> 네이티브 요청:
  - `window.webkit.messageHandlers.runContextHealthKit.postMessage({ type: 'requestRecentRunningWorkouts', days: 14 })`
- 네이티브 -> 웹 응답:
  - 성공: `window.RunContextHealthKit.receiveRuns(candidates)`
  - 실패: `window.RunContextHealthKit.receiveError(message)`
- 네이티브는 `HealthKitRunCandidate[]`를 plain JSON으로 직렬화해 넘긴다.
- 웹은 후보를 바로 저장하지 않고 확인/수정 폼에 채운다.

## `RunLog` 매핑
- `date`: `HKWorkout.startDate`의 로컬 날짜
- `durationSec`: `HKWorkout.duration`
- `distanceKm`: workout distance statistics 또는 distance quantity sample 합계
- `avgPaceSec`: `durationSec / distanceKm`
- `avgHeartRate`: workout 기간 내 heart rate 평균
- `maxHeartRate`: workout 기간 내 heart rate 최대
- `cadence`: HealthKit에서 cadence 계열 지표가 있을 때만 사용한다. 없으면 `null`.
- `temperature`: HealthKit 기본 러닝 workout에서 안정적으로 기대하지 않는다. 없으면 `null`.
- `laps`: HealthKit에서 route 또는 거리 샘플이 있으면 네이티브가 1km 단위 split으로 가공해 채운다. 각 lap은 거리, 페이스, 평균 심박을 우선 채우고 cadence는 가능한 경우에만 채운다.
- `source`: HealthKit 후보 저장 시 `healthkit`을 사용한다.

## 제한과 보완
- HealthKit은 Workoutdoors의 FIT 전체 필드를 1:1로 보장하지 않는다.
- Workoutdoors 고유 메타데이터, 일부 러닝 다이내믹스는 누락될 수 있다.
- route가 없고 거리 샘플도 부족하면 lap은 세션 전체 1개 요약 또는 빈 배열일 수 있다.
- FIT 업로드는 HealthKit 누락 지표를 보완하는 입력 채널로 유지한다.
- Route 좌표는 민감정보이므로 기본 저장 금지다.

## 구현 검증 기준
- 같은 날짜의 Workoutdoors/Apple 기본 러닝이 HealthKit에서 `.running` workout으로 조회되는지 확인한다.
- 거리, 시간, 평균 페이스가 Apple 건강/피트니스 앱 표시와 큰 차이가 없는지 확인한다.
- route 또는 거리 샘플이 있는 기록은 `laps[]`가 생성되고, lap별 거리 합계가 세션 거리와 크게 어긋나지 않는지 확인한다.
- 심박 평균/최대가 없을 수 있는 상황을 UI가 명확히 표시한다.
- HealthKit 권한 거부 시 FIT 업로드와 수동 입력이 계속 동작한다.
