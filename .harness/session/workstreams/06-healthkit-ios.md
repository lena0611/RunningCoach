# Workstream 06: HealthKit/iOS 브리지

## 시작 문구

```text
이 대화창은 HealthKit/iOS 브리지 업무만 다룬다.
먼저 .harness/session/workstreams/06-healthkit-ios.md를 읽고, HealthKit 데이터 계약과 iOS WebView bridge 범위에서만 작업해줘.
완료 승인 전에는 build/test/harness:check/iOS 빌드/배포/commit/push/PR을 실행하지 말고 후보로만 보고해줘.
```

## 요청 처리 규칙
- 모든 사용자 요청을 처리하기 전에 이 창의 workstream이 `06-healthkit-ios`인지 먼저 확인한다.
- 현재 창의 workstream이 불명확하거나 요청이 담당 범위를 넘으면 넓은 작업을 진행하지 말고 대상 workstream과 인수인계 문구를 제안한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 공통 창간 운영 기준을 따른다.
- 완료 전 후속 창으로 넘길 때는 커밋하지 않고, 인수인계 문구에 `git status --short`, `git diff`, 필요 시 `git diff --staged` 확인 지시를 포함한다.

## 담당 범위
- HealthKit 자동 동기화
- 세션별 HealthKit 재갱신
- route, lap, metric sample, active energy 매핑
- iOS WebView message bridge
- 네이티브 HealthKit/WeatherKit importer

## 먼저 읽을 문서
1. `.harness/session/active-context.md`
2. `.harness/project/healthkit-data-contract.md`
3. `.harness/project/weatherkit-data-contract.md`
4. `.harness/project/workflow-rules.md`

## 관련 파일
- `src/app/stores/healthKitSyncStore.ts`
- `src/features/import-healthkit-run/healthKitBridge.ts`
- `src/features/import-healthkit-run/mergeHealthKitRefreshRun.ts`
- `src/features/import-weatherkit/weatherKitBridge.ts`
- `/Users/smart-tn-083/practice/RunningCoach/RunningCoach/RunningCoach/HealthKitRunImporter.swift`
- `/Users/smart-tn-083/practice/RunningCoach/RunningCoach/RunningCoach/RunContextWebView.swift`
- `/Users/smart-tn-083/practice/RunningCoach/RunningCoach/RunningCoach/WeatherKitImporter.swift`

## 제외 범위
- AI 코칭 프롬프트
- Supabase migration
- UI 전체 리디자인
- 러닝 공식 조사

## 범위 밖 처리
- HealthKit 데이터를 저장하기 위한 DB 변경이 필요하면 `07-data-supabase`로 넘긴다.
- HealthKit 값 해석이 훈련 판정 기준을 바꾸면 `04-running-logic`으로 넘긴다.
- 화면 표시 문제가 중심이 되면 `03-ui-ux`로 넘긴다.
- 넘길 때는 HealthKit 후보 구조, 누락/보강 필드, 웹 매핑 요구, iOS 관련 파일을 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 데이터 계약 변경은 `.harness/project/healthkit-data-contract.md`
- iOS 수동 조치는 `.harness/session/manual-actions.md`
- 구조 결정은 `.harness/session/decision-log.md`
