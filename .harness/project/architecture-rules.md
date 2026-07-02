# 아키텍처 규칙

프로젝트 고유의 모듈 경계, 의존 방향, 데이터 흐름을 기록합니다.

## 레이어와 책임
- `src/app`: 앱 부트스트랩, 라우터, 전역 스토어, 전역 스타일을 담당한다.
- `src/pages`: 화면 단위 조합을 담당한다.
- `src/widgets`: 재사용 가능한 화면 블록을 담당한다.
- `src/features`: 파일 import, HealthKit 후보 수신, AI 컨텍스트 생성 같은 사용자 행동 중심 로직을 담당한다.
- `src/entities`: `RunLog`, `Lap`, `TrainingMemory` 같은 도메인 타입과 상수를 담당한다.
- `TrainingMemory` normalization은 `src/entities/training-memory/model.ts`의 `normalizeTrainingMemory`를 기준으로 통일한다. legacy `goal` 문자열은 active goal title로 변환해 호환한다.
- 훈련법/문헌 기반 지식은 `TrainingMemory`에 직접 섞지 않고 Supabase `training_knowledge_*` 테이블에 분리한다. `TrainingMemory`는 사용자별 상태와 개인화 보정값, `TrainingKnowledge`는 승인된 공통 지식이다.
- `TrainingMemory.runnerIdentity`는 러너의 장기 특성 계층이고, `TrainingMemory.coachBeliefs`는 반복 확인된 코치 가설 계층이다. 둘 다 단일 코칭 이벤트 기록을 대체하지 않고 `coach_memory_items`보다 구조화된 장기 컨텍스트로 사용한다.
- `training_knowledge_requests` 저장은 사용자 backlog 등록만 담당한다. 프론트에서 요청을 저장할 때 OpenAI Edge Function을 호출하지 않고, 비용이 드는 조사/요약/구조화는 별도 관리 작업으로 분리한다.
- AI 처방 컨텍스트는 `TrainingKnowledge`의 구조화 rule을 먼저 검색하고, 이후 `adaptiveTrainingProfile`으로 사용자별 보정을 적용한다. 지식 검색은 activeGoal 거리, 세션 타입, 훈련 단계, 부상/주의 조건을 기준으로 좁혀야 한다.
- RAG/벡터 검색은 `training_knowledge_chunks`의 승인된 요약 chunk만 대상으로 한다. 책/유료 콘텐츠 원문 전문이나 긴 발췌를 저장하지 않는다.
- legacy `knownIssues`는 자유 텍스트 주의사항으로 유지하고, 구조화된 부상관리는 `injuryItems`와 `activeInjuryItemId`를 기준으로 한다.
- 부상 체크인/완치/보강운동 근거는 당분간 Supabase 별도 테이블이 아니라 `training_memory.memory.injuryItems` JSON 계약으로 확장한다. 항목별 체크인 이력은 `checkInHistory`, 최근 체크 시각은 `lastCheckedAt`, 사용자 승인 완치 시각은 `resolvedAt`, 보강운동 근거와 수행 조건은 `strengthPlanDetails`에 둔다. 기존 UI/AI 호환을 위해 표시용 문자열 `strengthPlan`은 유지한다.
- `src/shared`: 포맷터, 통계 계산, 공통 UI, 외부 라이브러리 타입 선언을 담당한다.
- `src/shared/ui`: PaceLAB 자체 UI 시스템의 구현 위치다. 외부 UI 라이브러리 전면 도입 대신 `.harness/project/ui-system-contract.md`의 토큰/컴포넌트 계약을 따른다.

## 의존 방향
- 상위 레이어는 하위 레이어를 사용할 수 있지만, 하위 레이어가 pages/widgets에 의존하지 않는다.
- 도메인 타입은 `entities`에 두고 계산 유틸은 `shared/lib` 또는 관련 `features`에 둔다.
- 정적 프론트는 직접 secret을 갖지 않는다. DB/Auth/AI 호출은 Supabase public client와 Edge Function 경계로만 수행한다.
- 브라우저의 `window.webkit`/`NativeBridge` 존재 여부는 UX 접근 차단 신호일 뿐 보안 경계가 아니다. 비용이 들거나 민감 데이터에 접근하는 서버 기능은 Supabase Edge Function에서 사용자 인증, 서버 발급 앱 세션, 승인 사용자 allowlist, rate limit을 검증해야 한다.
- Supabase 데이터 접근은 RLS를 우회하지 않고 앱 인증 세션의 `auth.uid()`/`user_id` 컨텍스트를 1차 경로로 사용한다. 에이전트 디버깅도 인증 없는 직접 조회나 service role/admin 우회를 먼저 시도하지 않고, 앱 repository/store 경계 또는 동일한 사용자 세션 조건으로 재현한다.

## 공개 API 경계
- 현재 웹 앱은 GitHub Pages 정적 프론트이며, 백엔드/Auth/DB/AI 경계는 Supabase를 사용한다.
- iOS 확장 방향은 하이브리드 앱이다. Vue 화면은 WebView 또는 로컬 번들로 유지하고, 네이티브 iOS 레이어는 HealthKit 조회, 날씨용 CoreLocation/Open-Meteo 조회, 웹-네이티브 브리지만 담당한다.
- 알림은 FCM 같은 원격 푸시 인프라를 기본값으로 두지 않는다. 훈련 스케줄 알림과 앱 내부 HealthKit 신규 저장 알림은 iOS 네이티브 `runContextNotifications` 브리지를 통해 로컬 알림으로 예약/표시한다.
- HealthKit 신규 러닝 감지는 네이티브 `HKObserverQuery` background delivery를 우선 사용한다. foreground에서는 웹 `RunContextHealthKit.receiveHealthKitChanged`로 즉시 동기화하고, background에서는 로컬 알림으로 앱 재진입을 유도한 뒤 기존 activation sync가 누락분을 저장한다. 사용자가 앱을 강제 종료한 상태까지 보장하는 요구는 원격 푸시/APNs 설계로 별도 분리한다.
- 현재 iOS/watchOS 네이티브는 **이 모노레포의 `native/` 하위**에 있다(#250). Xcode 프로젝트는 `native/RunningCoach.xcodeproj`, Swift 소스는 `native/RunningCoach/`(iOS·watchOS가 공유하는 순수 로직은 `native/RaceCore/`)에 있다. **단일 `.git`/단일 origin**이므로 웹+네이티브 변경은 같은 worktree에서 하나의 commit/PR로 원자적으로 한다. 과거 별도 저장소 `RunningCoach-Native-Swift`는 archive됨. (상세: CLAUDE.md "모노레포 구조 (#250)")
- iOS Bundle Identifier는 계정 이메일에서 추론하지 않고 `com.lena0611.RunningCoach`로 고정한다. iPhone의 Apple ID가 `lenas0611@gmail.com`이고 Apple Developer 계정이 `lena0611@gmail.com`이어도 Bundle ID는 개발자 계정 문자열이 아니라 앱 식별자이므로 `lenas0611`로 바꾸지 않는다.
- 현재 사용자는 Personal Team으로 iPhone 빌드한다. Personal Team은 WeatherKit capability를 지원하지 않으므로 네이티브 타깃에 WeatherKit entitlement/capability를 켜면 안 된다. WeatherKit을 다시 켜려면 유료 Apple Developer Program 전환 또는 다른 날씨 API/서버리스 대안을 먼저 결정한다.
- iOS WebView는 상단/하단 safe area 안쪽에 갇히지 않고 화면 끝까지 확장한다. 네이티브는 `WKWebView`를 `.ignoresSafeArea()`와 `contentInsetAdjustmentBehavior = .never`로 배치하고, 실제 터치/가독성 여백은 웹 CSS의 `env(safe-area-inset-top/bottom)`에서 책임진다.
- Strava 연동을 추가할 때는 Supabase Edge Function 또는 별도 서버리스 API가 Strava OAuth, refresh token, activity fetch를 책임진다.
- `RunLog`, `TrainingMemory`, `coach_reports`, `coach_memory_items`의 영구 저장소는 Supabase Postgres다. localStorage는 Supabase 미설정/개발 fallback으로만 취급한다.

## Supabase 접근 기준
- RLS 실패는 예상 가능한 권한 경계입니다. 에이전트는 인증 없는 anon 조회, 임의 SQL 조회, service role/admin key 경로를 먼저 시도한 뒤 앱 사용자 컨텍스트로 fallback하지 않습니다.
- 특정 사용자의 실제 데이터 확인이 필요하면 처음부터 앱 로그인 세션, repository/store 함수, 또는 사용자가 제공한 현재 앱 컨텍스트의 사용자 ID를 기준으로 재현합니다. 익명 클라이언트, 인증 없는 SQL, service role/admin key를 먼저 시도하지 않습니다.
- RLS로 막힌 결과를 "데이터 없음"으로 해석하지 않습니다. 앱 컨텍스트에서 같은 사용자, 같은 repository/store 경로, 같은 인증 상태로 다시 확인한 뒤 판단합니다.
- Edge Function 내부에서 서버 권한이 필요한 경우에도 목적, 대상 테이블, RLS 우회 필요성을 먼저 설명하고, service role key나 secret 값을 대화에 노출하지 않습니다.
- 여러 사용자 전체를 대상으로 하는 운영 조회, migration 검증, RLS 정책 점검은 `07-data-supabase` 범위에서 별도 작업으로 분리하고 사용자 승인을 받습니다.

## 데이터 흐름
- FIT 파일 선택 -> 브라우저 로컬 파싱 -> 사용자가 확인/수정 -> Supabase `run_logs` 저장 -> 대시보드/AI Coach 컨텍스트 계산
- iOS 하이브리드 확장: Workoutdoors/Apple Fitness -> Apple 건강 앱/HealthKit 저장 -> 네이티브 iOS HealthKit 조회 -> 웹 앱에 `RunLog` 후보 전달 -> 앱 기동/재활성화 시 최신 저장일 이후 후보 자동 저장
- 날씨 확장 기본값: iOS 앱은 네이티브 CoreLocation -> 무료 Open-Meteo forecast API 호출 -> `WeatherSnapshot` 전달, 일반 브라우저/localhost는 웹 geolocation -> 무료 Open-Meteo 호출 -> 홈의 다음 세션 준비 카드에서 체감온도/강수확률/강수량/강수시간 표시
- `TrainingMemory` 수정 -> Supabase `training_memory` 저장 -> AI Coach 컨텍스트 생성에 반영
- AI 코칭 요청 -> Supabase Edge Function -> DB에서 `TrainingMemory`, `RunLog`, `coach_memory_items` 조회 -> OpenAI 호출 -> `coach_reports`, 새 `coach_memory_items`, 필요한 경우 갱신된 `training_memory.memory.weeklyPattern` 저장
- AI 코칭 Edge Function은 OpenAI 호출 전에 `x-pacelab-app-session`을 검증한다. MVP 임시 모드에서는 승인 사용자 allowlist를 통과한 인증 사용자에게 서버가 짧은 수명의 앱 세션을 발급하고, 토큰 원문은 저장하지 않고 해시만 저장한다. 이 모드는 비용성 기능 통제용이며 "iOS 앱에서 실행된 기기" 증명은 아니다. 정식 기기 증명은 유료 Apple Developer DeviceCheck/App Attest 키를 준비한 뒤 `APP_SECURITY_MODE=devicecheck` 또는 App Attest 검증으로 전환한다.
- AI 코칭 컨텍스트는 비용을 통제한다. 같은 세션 대화 thread는 이어서 넣되, 다른 세션 대화는 전체 전문이 아니라 유사 세션 snippet과 `coach_memory_items` 중심으로 주입한다.
- AI 코칭 Edge Function은 OpenAI context에 원본 RunLog 대용량 배열을 직접 넣지 않는다. `metric_samples`, `route_points`, `laps`, `fast_segments`는 서버 내부 계산 근거로만 쓰고, 모델에는 선택 세션/최근 세션 요약과 계산된 흐름 신호만 전달한다.
- AI 코칭 Edge Function은 `runningAnalysisEngine`에서 HR drift, 부하 증가율, 회복 상태, 부상 위험, 과훈련 경고, 훈련 적합성 점수를 먼저 계산하고, OpenAI는 이 판단을 설명하는 역할을 맡는다.
- AI 코칭 Edge Function은 Responses API strict JSON schema를 사용해 `report`, `memoryItems`, `trainingMemoryPatch`, `injuryUpdateProposal` 응답 구조를 강제한다. 프롬프트만으로 JSON을 기대하지 않는다.
- `coach-run`의 사용자 요청 1회는 OpenAI 모델 호출 1회를 원칙으로 한다. 스트리밍 파서 fallback이나 오류 복구가 두 번째 모델 호출을 만들면 429를 증폭할 수 있으므로, fallback은 같은 응답 payload 안에서만 처리한다.
- 장기기억 컨텍스트는 `coach_memory_items` 최근 목록을 그대로 넣지 않고, 선택 세션/메모 태그, activeGoal, activeInjuryItem, runnerIdentity, coachBeliefs, 반복 패턴 키워드, 중요 러닝 맥락, 최근성을 점수화해 최대 소량만 넣는다.
- 장기 확장: Strava activity fetch -> `RunLog` 후보 생성 -> 사용자 확인/저장

## 화면 로딩과 스토어 규칙
- Dashboard, Run Log, Coach처럼 `RunLog`를 읽는 화면은 앱 초기화에만 의존하지 말고, 화면 진입 시 스토어가 아직 로드되지 않았으면 `load()`를 보장한다.
- 데이터 화면은 빈 상태와 로딩 실패를 구분한다. Supabase 조회 실패가 0km처럼 보이지 않도록 로딩/오류/다시 불러오기 UI를 둔다.
- 수정/삭제 같은 모바일 주요 액션은 사용자가 즉시 결과를 확인할 수 있게 폼 위치, 진행 상태, 오류 메시지를 명시한다.
- WebView 배포 직후 캐시/전파 지연으로 Vue 마운트가 늦을 수 있다. 웹 `index.html`은 빈 `#app`만 두지 말고 기본 로딩 텍스트를 제공한다.
- 계정정보, 설정, 세션 상세처럼 패널 안에서 더 깊은 화면이 열릴 때는 기존 바닥 화면을 밀어내지 않는다. 상위 패널은 그대로 유지하고, 하위 패널만 별도 스택 레이어로 위에 올라와야 뒤로/닫기 동작이 사용자의 공간 기억을 깨지 않는다.
- 브랜드 로고/워드마크는 앱의 홈/요약으로 돌아가는 전역 진입점이다. 버튼처럼 동작하되 시각적으로는 로고 잠금 형태를 유지한다.

## HealthKit 브리지 계약
- HealthKit 데이터 구조와 `RunLog` 매핑은 `.harness/project/healthkit-data-contract.md`를 기준으로 한다.
- 네이티브는 `HKWorkout` 러닝 세션과 관련 quantity samples를 구조화된 후보로 변환한다.
- 웹 앱은 HealthKit 원본 객체를 직접 다루지 않고 `HealthKitRunCandidate` 같은 plain JSON 후보만 받는다.
- 네이티브 후보에 새 구조화 필드가 추가되면 웹 `RunLog` 타입, HealthKit 변환기, Supabase migration/repository, 세션 새로고침 병합, 수정 폼, 상세 표시까지 한 번에 연결한다. 브리지 타입에만 추가하고 저장 모델에서 버리면 안 된다.
- 웹 앱의 HealthKit 브리지 등록과 자동 동기화 트리거는 앱 루트 전역 스토어에서 담당한다. 개별 페이지가 브리지를 직접 등록/해제하지 않는다.

## 날씨 계약
- 날씨 데이터 구조와 웹 전달 구조는 `.harness/project/weatherkit-data-contract.md`를 기준으로 한다. **운영 기본 출처는 국내 정확도를 위해 기상청 단기예보(VilageFcstInfoService_2.0)**이며 Supabase Edge Function `weather-run` 프록시 경유로 받는다. serviceKey는 서버 secret 전용이다.
- `weather-run`은 위경도 -> 격자(nx/ny) 룩업(`grid.json` 행정동↔격자 최근접), 초단기실황 + 단기예보 호출, 카테고리 디코딩, 발표시각 캐시, `WeatherSnapshot` 정규화를 담당한다. 비용/외부 호출 경계이므로 `x-pacelab-app-session` 검증과 rate limit(`WEATHER_RUN_RATE_LIMIT_PER_HOUR`)을 통과한다.
- 입력 2축은 위치(현위치 GPS / 마지막 러닝 위치 = 최근 GPS 러닝 시작점, GPS 실패 시 fallback)와 시점(지금 / 3일 이내 날짜, 초과는 "예보 범위 밖" 안내)이다. 시점 전환은 이미 받은 3일 스냅샷을 클라이언트에서 필터해 추가 호출을 만들지 않는다.
- 체감온도는 기상청이 미제공하므로 계절분기로 자체 산출한다(여름 열지수 / 겨울 풍속냉각 / 중간 기온). 공식은 Edge `weather-run`과 웹 `src/shared/lib/runningWeather.ts`를 미러로 유지한다. 일출/일몰은 외부 API 없이 위경도 천문계산(`src/shared/lib/sunTimes.ts`)으로 구한다.
- Open-Meteo(`import-open-meteo`)는 Supabase 미설정/비로그인 개발 환경 fallback으로만 남긴다. WeatherKit 네이티브 브리지 경로는 보존하되 운영 기본이 아니다.
- 웹 앱의 날씨 자동 갱신 트리거는 앱 루트 전역 스토어에서 담당한다. 홈의 새로고침 아이콘은 전체 화면 리로드가 아니라 날씨 데이터만 다시 패치한다.
- 날씨 조회가 실패해도 RunLog 저장, HealthKit 동기화, AI 코칭은 계속 동작해야 한다.

## 새 모듈 추가 규칙
- 새 파일 import 포맷을 추가하기 전에 FIT 단일 포맷으로 해결할 수 없는 이유를 `decision-log.md`에 남긴다.
- 새 코칭 규칙은 근거와 입력 데이터, 출력 영향을 함께 기록한다.
- 외부 API 연동은 secret 보관이 필요한지 먼저 판단하고, 필요하면 정적 프론트가 아니라 서버리스 경계로 분리한다.
- HealthKit 연동은 서버리스나 웹 브라우저 코드가 아니라 iOS 네이티브 타깃에서 구현한다. iOS 앱의 날씨도 안정성을 위해 네이티브 CoreLocation + 무료 Open-Meteo 호출을 기본값으로 사용한다.

## 구현 단순성 (YAGNI · 현 개발 단계 보정)
- 알려진 요구를 충분히 푸는 **가장 단순한 구현**을 기본으로 한다. 상상 속 미래를 위한 투기적 추상, 불필요한 유연성/설정 옵션, 일어날 수 없는 시나리오용 방어코드를 만들지 않는다(YAGNI). 자가 점검: "시니어 엔지니어가 과하다고 볼까?", "200줄이 50줄로 되면 다시 쓴다."
- 반복 패턴은 실제로 3번 나타날 때 추상화한다(rule of three). 1회성 코드에 추상 레이어를 두지 않는다.
- **예외 — 과설계가 아니라 과업이므로 이 규칙이 막지 않는다:** (a) 구조를 올바른 모양으로 다잡는 의도적 리팩터링, (b) 로드맵에 있는 '알려진' 근미래 요구를 위한 토대 구축. "단순성"을 필요한 리팩터링이나 계획된 토대를 억누르는 근거로 쓰지 않는다.
- 근거: 젊은 코드베이스는 도메인 이해 전 조급한 추상으로 부채가 쌓이고, 현재 코딩 모델(Opus 4.8)은 과설계 경향이 있으며, 우리 도메인은 연쇄(`data-change-impact-map.md`)가 심해 불필요한 복잡도의 비용이 곱으로 커진다. 안드레 카파시 'Simplicity First' 원칙을 **현 개발 단계에 맞게 보정**해 채택한 것이다(원문의 strict-surgical/no-refactor 조항은 유지보수기 미덕이라 현 단계에선 완화).
- 안정화/유지보수 단계로 넘어가면 side-effect 최소화를 위한 외과적 변경(원문 Surgical) 강조를 다시 강화할지 재검토한다.

## 변경 규칙
- 아키텍처 경계 변경은 `decision-log.md`에 이유를 남깁니다.
- 공통 하네스의 스택 기준과 충돌하면 로컬 규칙의 적용 범위와 예외를 명시합니다.
