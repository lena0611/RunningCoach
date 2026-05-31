# Workstream 06: HealthKit/iOS 브리지

## 시작 문구

```text
이 요청은 HealthKit/iOS 브리지 중심으로 처리해줘.
먼저 .harness/session/workstreams/06-healthkit-ios.md를 읽고, 같은 목표 안에 필요한 관련 영역은 이 창에서 함께 관리해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 이 파일은 담당 창 고정 기준이 아니라 `06-healthkit-ios` 읽을거리 라우팅 기준이다.
- 요청 목표가 HealthKit/iOS 브리지 중심인지 확인하고, 같은 목표 안의 DB/러닝 로직/UI 영향 검토는 현재 요청 창에서 함께 처리한다.
- 독립 목표나 동시 업무가 섞이면 넓히지 말고 별도 Issue/worktree/branch로 분리한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 요청 단위 운영 기준을 따른다.
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

## 인접 영역 처리와 분리 기준
- 현재 HealthKit/iOS 요청을 완료하는 데 필요한 DB 변경, 훈련 판정 기준, 화면 표시 검토는 관련 workstream 파일을 추가로 읽고 같은 창에서 처리한다.
- HealthKit 변경과 별개인 DB/러닝 로직/UI 목표가 생기면 별도 Issue/worktree/branch로 분리한다.
- 분리할 때는 HealthKit 후보 구조, 누락/보강 필드, 웹 매핑 요구, iOS 관련 파일을 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 데이터 계약 변경은 `.harness/project/healthkit-data-contract.md`
- iOS 수동 조치는 `.harness/session/manual-actions.md`
- 구조 결정은 `.harness/session/decision-log.md`
