# 아키텍처 규칙

프로젝트 고유의 모듈 경계, 의존 방향, 데이터 흐름을 기록합니다.

## 레이어와 책임
- `src/app`: 앱 부트스트랩, 라우터, 전역 스토어, 전역 스타일을 담당한다.
- `src/pages`: 화면 단위 조합을 담당한다.
- `src/widgets`: 재사용 가능한 화면 블록을 담당한다.
- `src/features`: 파일 import, HealthKit 후보 수신, AI 컨텍스트 생성 같은 사용자 행동 중심 로직을 담당한다.
- `src/entities`: `RunLog`, `Lap`, `TrainingMemory` 같은 도메인 타입과 상수를 담당한다.
- `TrainingMemory` normalization은 `src/entities/training-memory/model.ts`의 `normalizeTrainingMemory`를 기준으로 통일한다. legacy `goal` 문자열은 active goal title로 변환해 호환한다.
- legacy `knownIssues`는 자유 텍스트 주의사항으로 유지하고, 구조화된 부상관리는 `injuryItems`와 `activeInjuryItemId`를 기준으로 한다.
- `src/shared`: 포맷터, 통계 계산, 공통 UI, 외부 라이브러리 타입 선언을 담당한다.

## 의존 방향
- 상위 레이어는 하위 레이어를 사용할 수 있지만, 하위 레이어가 pages/widgets에 의존하지 않는다.
- 도메인 타입은 `entities`에 두고 계산 유틸은 `shared/lib` 또는 관련 `features`에 둔다.
- 정적 프론트는 직접 secret을 갖지 않는다. DB/Auth/AI 호출은 Supabase public client와 Edge Function 경계로만 수행한다.

## 공개 API 경계
- 현재 웹 앱은 GitHub Pages 정적 프론트이며, 백엔드/Auth/DB/AI 경계는 Supabase를 사용한다.
- iOS 확장 방향은 하이브리드 앱이다. Vue 화면은 WebView 또는 로컬 번들로 유지하고, 네이티브 iOS 레이어는 HealthKit/WeatherKit 권한 및 조회와 웹-네이티브 브리지만 담당한다.
- 현재 로컬 iOS 네이티브 프로젝트 경로는 `/Users/smart-tn-083/practice/RunningCoach/RunningCoach/RunningCoach.xcodeproj`다. Swift 소스는 `/Users/smart-tn-083/practice/RunningCoach/RunningCoach/RunningCoach` 아래에 있다. 네이티브 Git 저장소는 `https://github.com/lena0611/RunningCoach-Native-Swift`이며, 웹 repo 밖에 있으므로 네이티브 변경 시 이 경로와 저장소를 함께 확인한다.
- iOS Bundle Identifier는 계정 이메일에서 추론하지 않고 `com.lena0611.RunningCoach`로 고정한다. iPhone의 Apple ID가 `lenas0611@gmail.com`이고 Apple Developer 계정이 `lena0611@gmail.com`이어도 Bundle ID는 개발자 계정 문자열이 아니라 앱 식별자이므로 `lenas0611`로 바꾸지 않는다.
- 현재 사용자는 Personal Team으로 iPhone 빌드한다. Personal Team은 WeatherKit capability를 지원하지 않으므로 네이티브 타깃에 WeatherKit entitlement/capability를 켜면 안 된다. WeatherKit을 다시 켜려면 유료 Apple Developer Program 전환 또는 다른 날씨 API/서버리스 대안을 먼저 결정한다.
- iOS WebView는 상단/하단 safe area 안쪽에 갇히지 않고 화면 끝까지 확장한다. 네이티브는 `WKWebView`를 `.ignoresSafeArea()`와 `contentInsetAdjustmentBehavior = .never`로 배치하고, 실제 터치/가독성 여백은 웹 CSS의 `env(safe-area-inset-top/bottom)`에서 책임진다.
- Strava 연동을 추가할 때는 Supabase Edge Function 또는 별도 서버리스 API가 Strava OAuth, refresh token, activity fetch를 책임진다.
- `RunLog`, `TrainingMemory`, `coach_reports`, `coach_memory_items`의 영구 저장소는 Supabase Postgres다. localStorage는 Supabase 미설정/개발 fallback으로만 취급한다.

## 데이터 흐름
- FIT 파일 선택 -> 브라우저 로컬 파싱 -> 사용자가 확인/수정 -> Supabase `run_logs` 저장 -> 대시보드/AI Coach 컨텍스트 계산
- iOS 하이브리드 확장: Workoutdoors/Apple Fitness -> Apple 건강 앱/HealthKit 저장 -> 네이티브 iOS HealthKit 조회 -> 웹 앱에 `RunLog` 후보 전달 -> 앱 기동/재활성화 시 최신 저장일 이후 후보 자동 저장
- 기상 확장 기본값: 브라우저/WKWebView 위치 권한 -> 무료 Open-Meteo forecast API 호출 -> `WeatherSnapshot` 변환 -> 홈의 다음 세션 준비 카드에서 체감온도/강수확률/강수량/강수시간 표시
- `TrainingMemory` 수정 -> Supabase `training_memory` 저장 -> AI Coach 컨텍스트 생성에 반영
- AI 코칭 요청 -> Supabase Edge Function -> DB에서 `TrainingMemory`, `RunLog`, `coach_memory_items` 조회 -> OpenAI 호출 -> `coach_reports`, 새 `coach_memory_items`, 필요한 경우 갱신된 `training_memory.memory.weeklyPattern` 저장
- AI 코칭 컨텍스트는 비용을 통제한다. 같은 세션 대화 thread는 이어서 넣되, 다른 세션 대화는 전체 전문이 아니라 유사 세션 snippet과 `coach_memory_items` 중심으로 주입한다.
- 장기기억 컨텍스트는 `coach_memory_items` 최근 목록을 그대로 넣지 않고, 선택 세션/메모 태그, 반복 패턴 키워드, 중요 러닝 맥락, 최근성을 점수화해 최대 소량만 넣는다.
- 장기 확장: Strava activity fetch -> `RunLog` 후보 생성 -> 사용자 확인/저장

## 화면 로딩과 스토어 규칙
- Dashboard, Run Log, Coach처럼 `RunLog`를 읽는 화면은 앱 초기화에만 의존하지 말고, 화면 진입 시 스토어가 아직 로드되지 않았으면 `load()`를 보장한다.
- 데이터 화면은 빈 상태와 로딩 실패를 구분한다. Supabase 조회 실패가 0km처럼 보이지 않도록 로딩/오류/다시 불러오기 UI를 둔다.
- 수정/삭제 같은 모바일 주요 액션은 사용자가 즉시 결과를 확인할 수 있게 폼 위치, 진행 상태, 오류 메시지를 명시한다.
- WebView 배포 직후 캐시/전파 지연으로 Vue 마운트가 늦을 수 있다. 웹 `index.html`은 빈 `#app`만 두지 말고 기본 로딩 텍스트를 제공한다.

## HealthKit 브리지 계약
- HealthKit 데이터 구조와 `RunLog` 매핑은 `.harness/project/healthkit-data-contract.md`를 기준으로 한다.
- 네이티브는 `HKWorkout` 러닝 세션과 관련 quantity samples를 구조화된 후보로 변환한다.
- 웹 앱은 HealthKit 원본 객체를 직접 다루지 않고 `HealthKitRunCandidate` 같은 plain JSON 후보만 받는다.
- 웹 앱의 HealthKit 브리지 등록과 자동 동기화 트리거는 앱 루트 전역 스토어에서 담당한다. 개별 페이지가 브리지를 직접 등록/해제하지 않는다.

## 기상정보 계약
- 기상 데이터 구조와 웹 전달 구조는 `.harness/project/weatherkit-data-contract.md`를 기준으로 하되, 현재 구현 기본값은 WeatherKit이 아니라 Open-Meteo다.
- Open-Meteo는 API key 없이 호출하며, 현재 위치 좌표는 낮은 정밀도로 반올림해 요청한다.
- 웹 앱의 기상정보 자동 갱신 트리거는 앱 루트 전역 스토어에서 담당한다.
- 기상정보 조회가 실패해도 RunLog 저장, HealthKit 동기화, AI 코칭은 계속 동작해야 한다.

## 새 모듈 추가 규칙
- 새 파일 import 포맷을 추가하기 전에 FIT 단일 포맷으로 해결할 수 없는 이유를 `decision-log.md`에 남긴다.
- 새 코칭 규칙은 근거와 입력 데이터, 출력 영향을 함께 기록한다.
- 외부 API 연동은 secret 보관이 필요한지 먼저 판단하고, 필요하면 정적 프론트가 아니라 서버리스 경계로 분리한다.
- HealthKit 연동은 서버리스나 웹 브라우저 코드가 아니라 iOS 네이티브 타깃에서 구현한다. 날씨는 무료 Open-Meteo 웹 호출을 기본값으로 사용한다.

## 변경 규칙
- 아키텍처 경계 변경은 `decision-log.md`에 이유를 남깁니다.
- 공통 하네스의 스택 기준과 충돌하면 로컬 규칙의 적용 범위와 예외를 명시합니다.
