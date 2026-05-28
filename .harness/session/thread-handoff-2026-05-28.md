# PaceLAB Thread Handoff - 2026-05-28

이 문서는 현재 긴 대화창을 새 대화로 넘기기 위한 압축 인수인계다. 새 스레드에서는 이 파일을 먼저 읽고, 필요한 세부 규칙은 각 문서로 좁혀서 확인한다.

## 프로젝트 루트

- 웹/PWA: `/Users/smart-tn-083/practice/run-ai`
- iOS 네이티브 로컬: `/Users/smart-tn-083/practice/RunningCoach`
- 네이티브 별도 저장소: `lena0611/RunningCoach-Native-Swift`
- 프론트 저장소: `lena0611/RunningCoach`

## 현재 제품 방향

- 앱명/브랜드는 `PaceLAB`.
- Vue 3 + Vite + TypeScript + Pinia + Vue Router 기반 정적 웹앱이다.
- GitHub Pages로 정적 배포하고, 실제 기능은 iOS WebView 하이브리드 앱 또는 localhost에서 사용한다.
- DB/Auth/AI 백엔드는 Supabase를 쓴다.
- OpenAI API Key는 Supabase Edge Function secret에만 둔다.
- iOS 앱은 GitHub Pages URL을 WebView에 띄우고 HealthKit, 위치/날씨, 알림 같은 네이티브 기능을 브리지한다.
- HealthKit 자동 동기화와 세션별 HealthKit 재갱신을 제공한다.
- FIT 업로드는 보조 입력 수단으로 유지한다.

## 핵심 사용자 요구

- 개인 러닝 코치 앱이지만 하네스 검증용 프로젝트이기도 하다.
- 사용자는 AI 코치가 이전 맥락을 잊지 않고, 목표/부상/루틴/최근 훈련 흐름을 보고 판단하기를 원한다.
- 코칭 톤은 리포트가 아니라 오래 봐온 코치처럼 대화체여야 한다.
- 세션 피드백은 평균값이 아니라 랩/샘플 기반 중간 과정, 처방 준수, 심박 품질, 다음 훈련 조정까지 포함해야 한다.
- 주간 루틴은 사용자가 고정하는 것이 아니라 AI가 목표 달성 관점에서 유지/상향/하향/보류를 판단한다.
- 사용자는 AI 처방을 Workoutdoors에 옮겨 세팅하고 뛴다. 따라서 세부 처방 기준이 명확해야 한다.

## 주요 구현 상태

### 프론트

- 주요 화면은 요약, 기록, 기억 중심이다. 기존 AI Coach 독립 탭은 제거되고 세션 상세에서 AI 코칭을 연다.
- `src/pages/dashboard/DashboardPage.vue`
  - 홈/요약, 다음 예정 훈련, 목표 예상, 최근 세션, 세션 상세 스택.
- `src/pages/run-log/RunLogPage.vue`
  - 달력, 월별 세션 목록, 세션 상세, 세션 편집/삭제, AI 코칭 채팅.
- `src/pages/memory/MemoryPage.vue`
  - 목표 관리, 부상/주의사항 관리, 훈련법/지식 관리, 코칭 메모리.
- `src/shared/ui/RunDetailContent.vue`
  - 세션 상세 공통 콘텐츠. 어디에서 진입해도 동일해야 한다.
- `src/shared/ui/FitnessDetailCharts.vue`
  - 경로 상세 지도, 페이스/심박/케이던스/고도 차트, 드래그 세그먼트 선택.
- `src/shared/ui/RunSessionList.vue`
  - 세션 목록 공통 컴포넌트. 홈/기록/추이 상세에서 재사용한다.

### HealthKit 동기화

- `src/app/stores/healthKitSyncStore.ts`
  - 앱 활성화 시 자동 동기화.
  - 저장된 최신 날짜 이후 신규 기록만 자동 저장.
  - 기존 HealthKit 기록 중 외부 ID 없는 항목은 후보와 매칭해 보강.
  - 세션 상세에서 특정 세션 HealthKit 재갱신 가능.
- 최근 수정: 특정 세션 상세에서 HealthKit 갱신 시 `/runs?coach=1` 쿼리가 남아 코칭 화면으로 넘어가던 문제를 수정했다.
  - 커밋: `a783833 세션 갱신 후 코칭 이동 방지`

### AI 코칭

- Supabase Edge Function: `supabase/functions/coach-run/index.ts`
- 최근 수정: `coachingDecisionBoard`를 추가했다.
  - 선택 세션 근거
  - 랩/샘플 기반 페이스/심박 흐름
  - 처방 준수
  - 목표 예상
  - 루틴 업데이트 판단
- Supabase 배포 완료:
  - `npx supabase functions deploy coach-run --project-ref nvocucbtftayleoxpzjq`
- 커밋: `5284203 AI 코칭 판단 근거 보강`

### 세션 유형 추론

- `src/features/infer-run-type/inferRunType.ts`
- 최근 수정: LSD vs Steady Long 판정을 페이스보다 심박 중심으로 보수화했다.
- Easy는 페이스보다 심박 기준이 우선이다.
- Easy + Strides는 케이던스만으로 판단하면 안 된다. route/speed 기반 fast segment와 요일/루틴 맥락을 함께 봐야 한다.
- 커밋: `3ce0e2c 장거리 유형 판정 개선`

### 부상관리

- 부상 부위 자유입력만 쓰지 않고 정규화 입력으로 전환 중이다.
- 현재는 이미지 스틸컷 기반 around-view로 시도했으나 품질 한계가 있어, 이미지 전문 생성 AI로 정교한 인체/부위 이미지를 받아 적용하는 방향으로 보류했다.
- 관련 파일:
  - `src/shared/ui/InjuryBodySelector.vue`
  - 부상 이미지 assets
- 요구:
  - 선택 가능한 부위는 근육/힘줄/인대/관절/뼈 수준으로 정규화.
  - 선택 후 상세 후보를 보여주고, 최종 등록 시 부위별 통증 레벨을 받는다.
  - 수면질은 부상 범주가 아니라 회복/컨디션 신호로 분리.

## 중요한 하네스/프로젝트 문서

- `.harness/project/ai-coaching-goal.md`
  - 코칭 말투, 답변 구조, 판단 보드, 루틴 업데이트 규칙.
- `.harness/project/running-coaching-standards.md`
  - 훈련 기준선, 심박/강도/처방 원칙.
- `.harness/project/domain-rules.md`
  - 세션 유형 판정, LSD/Steady Long, Easy 기준 등 도메인 규칙.
- `.harness/project/healthkit-data-contract.md`
  - HealthKit에서 받는 데이터 구조.
- `.harness/project/ui-system-contract.md`
  - 자체 UI 시스템, 토큰, 공통 컴포넌트 사용 원칙.
- `.harness/project/training-knowledge-ops.md`
  - 훈련법 지식 보관소와 향후 RAG/vector DB 전환 조건.
- `.harness/session/decision-log.md`
  - 주요 결정 로그.

## 검증 규칙

항상 프로젝트 루트에서 먼저 Node 버전을 맞춘다.

```sh
source ~/.nvm/nvm.sh && nvm use
```

작업 후 기본 검증:

```sh
npm run build
npm run harness:check -- --no-cache
```

하네스 체크는 테스트와 빌드까지 실행한다. 작고 빠른 확인만 필요하면 커밋/푸시 훅에서 `--fast`가 돌 수 있지만, 최종 검증은 full check가 기준이다.

Supabase Edge Function 변경 시:

```sh
npx supabase functions deploy coach-run --project-ref nvocucbtftayleoxpzjq
```

하네스는 Edge Function 전용 검증 스크립트 부재를 경고한다. 향후 `supabase:functions:check` 스크립트 추가를 검토한다.

## 최근 미해결/다음 후보 작업

1. **훈련 페이스 공식화**
   - 사용자가 10km 목표 기록표 이미지를 줬다.
   - 해야 할 일: 출처/근거를 웹에서 확인하고 공식화 가능 여부 조사.
   - 목표: 사용자가 거리와 목표시간을 입력하면 Easy, LSD, Tempo, Interval 페이스 기준점을 산출.
   - 단, 최종 처방은 부상, 소화율, 심박, 회복, 날씨, 최근 훈련 품질로 보정.
   - 웹 검색이 필요한 작업이다. 표의 출처를 추정하지 말고 공식/신뢰 가능한 러닝 코칭 자료를 확인한다.

2. **5/28 코칭 스트림 미수신**
   - 사용자가 5/28 세션 코칭 대화창에서 피드백 요청 시 스트림이 안 온다고 보고했다.
   - 아직 직접 원인 분석 전이다.
   - 확인할 파일: `src/shared/api/coachRepository.ts`, `src/pages/run-log/RunLogPage.vue`, `supabase/functions/coach-run/index.ts`.
   - 최근 Edge Function context가 커졌으므로 payload 크기/응답 지연/stream parser 오류 가능성도 본다.

3. **세션 유형 재판정**
   - HealthKit 재갱신 시 개선된 추론 로직으로 기존 잘못된 type이 덮어써져야 한다는 요구가 있다.
   - `type:user` 태그가 있으면 사용자가 수정한 타입이므로 덮어쓰면 안 된다.
   - `type:auto` 또는 자동 추론 데이터는 재동기화 시 새 로직으로 재판정되어야 한다.

4. **세션 상세 지도/차트 품질**
   - 지도 경로가 작게 보이는 문제, OSM 스타일/무채색 타일 검토, 경로 선 두께/노드 시인성 조정 이슈가 있었다.
   - 차트는 페이스/심박 Y축 고정 정책을 일부 적용했으나 데이터별 보정 여지가 남아 있다.
   - 고도 데이터는 버리지 않는다. 코스 타입 추론과 세션 상세 차트에 사용한다.

5. **훈련 지식 관리**
   - 훈련법 등록 요청 화면은 존재하지만, 실제 지식화는 아직 수동/관리자 중심.
   - 향후 요청량이 많아지면 vector DB/RAG 전환 조건은 `training-knowledge-ops.md`에 정리되어 있다.

6. **하네스 개선 관찰**
   - 이 프로젝트는 하네스 소비자 관점 검증 프로젝트이기도 하다.
   - 반복 이슈:
     - 대화가 길어지면 에이전트 속도와 품질이 떨어진다.
     - 프로젝트 룰 승격 기준이 너무 넓으면 작업이 무거워진다.
     - Edge Function 검증 스크립트 부재 경고가 반복된다.
     - UI 회귀 방지를 위해 e2e/시각 검증이 더 필요하다.

## 새 스레드 시작 시 권장 절차

1. 이 파일을 먼저 읽는다.
2. 사용자의 새 요청이 어느 영역인지 분류한다.
   - 코칭/훈련 알고리즘
   - 세션 상세/차트/지도
   - HealthKit/iOS 브리지
   - UI/UX
   - Supabase/Edge Function
   - 하네스 개선 관찰
3. 필요한 프로젝트 문서만 추가로 읽는다.
4. 구현 전 `git status --short`로 워킹트리 확인.
5. 작업 후 `npm run build`, `npm run harness:check -- --no-cache`.
6. Edge Function 변경이면 Supabase 배포.
7. 커밋/푸시.

## 커밋/배포 상태

최근 main 푸시 완료:

- `a783833 세션 갱신 후 코칭 이동 방지`
- `5284203 AI 코칭 판단 근거 보강`
- `3ce0e2c 장거리 유형 판정 개선`

작성 시점 워킹트리는 깨끗했다.
