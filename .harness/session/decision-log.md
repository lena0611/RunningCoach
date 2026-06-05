# 결정 로그

이 문서는 이 프로젝트에서 내린 중요한 판단과 선택 이유를 남기는 소비자 프로젝트 전용 로그입니다.

> 하네스 본체의 변경 이력이나 릴리스 노트가 아닙니다. 하네스 본체 변경 기록은 하네스 저장소의 `CHANGELOG.md` 또는 릴리스 태그를 확인합니다.

## 기록 원칙
- 프로젝트 기준, 스택 기준, 템플릿 계약, 개인 기준이 충돌할 때 선택 이유를 남깁니다.
- 테스트 전략, 예외 허용, 아키텍처 경계, 운영 절차처럼 이후 작업에 영향을 주는 판단을 남깁니다.
- 단순 작업 로그나 일회성 구현 세부사항은 남기지 않습니다.
- 임시 예외는 가능하면 `.harness/policy/waivers.json`에 범위와 만료 조건을 함께 남깁니다.

> 2026-05 결정 61건은 `decision-log-2026H1.md`로 아카이브했습니다(하네스 v0.2.55 기억 표면 정리). 현재 파일은 최근/유효 결정만 유지합니다.

## 2026-06-01 - 추세 Lens 하단 탭 신설
- 결정: `추세`를 4번째 하단 탭으로 추가(목표 진전/유산소 효율/강도 분포/세션 품질/회복 비용 Lens, 각 Lens는 변화·신뢰도·근거 세션·처방 영향). `RunLog`/목표/부상 편집·AI 코칭 변경은 미담당. 의료/부상 예측 단정 없이 처방 보수성 조정 신호로만 제한.
- → 권위: `.harness/project/navigation-information-architecture.md`. UI 반영은 `03-ui-ux` workstream.

## 2026-06-01 - HealthKit 과거 이관 임시 UI
- 문제: Issue #25의 날짜 범위 HealthKit 이관 경로는 웹 store와 네이티브 브리지에는 연결됐지만, 사용자가 실제 iPhone 앱에서 2025-11~2026-04 범위를 실행할 화면 진입점이 없었다.
- 결정: 정식 데이터 관리 화면을 새로 설계하지 않고, 기록 페이지의 `전체 기록` 섹션 바로 위에 삭제 예정인 임시 마이그레이션 UI를 둔다. 버튼은 `2025-11-01`부터 `2026-04-30`까지 고정 범위로 `requestHistoricalMigration()`을 호출한다.
- 선택 이유: 이번 목적은 1회성 MVP 데이터 이관 실행이다. 영구 기능처럼 설정/범위 입력/관리 화면을 만들면 삭제 비용과 사용자 혼란이 커진다.
- 제거 조건: 사용자가 실제 데이터 이관 결과를 확인하고 #25 완료를 승인한 뒤 해당 임시 UI를 제거한다.

## 2026-06-01 - HealthKit 과거 이관 성공 후 임시 UI 제거
- 문제: 2025-11~2026-04 HealthKit 과거 이관이 성공해 기록 페이지의 1회성 실행 UI가 더 이상 사용자에게 노출될 필요가 없어졌다.
- 결정: 사용자-facing 임시 UI만 제거하고, 웹 `requestHistoricalMigration()`/`requestHealthKitRunsInRange()`와 네이티브 `requestRunningWorkoutsInRange` 처리 로직은 유지한다.
- 선택 이유: 향후 다른 날짜 범위 이관이나 운영성 복구가 필요할 수 있고, 비노출 브리지/저장 로직은 자동 동기화와 분리되어 일반 사용자 흐름을 방해하지 않는다.
- 포기한 대안: 마이그레이션 로직 전체 제거는 나중에 같은 문제가 생겼을 때 네이티브와 웹 계약을 다시 복원해야 하므로 채택하지 않는다.

## 2026-06-01 - 완료된 Issue worktree 정리 기준
- 결정: 완료 worktree 정리는 Issue Closed + Project Done + worktree clean + 후속 확인 불필요를 모두 만족할 때만 후보. Open/Deployed·미커밋 변경은 사용자 확인까지 보류·보고, 명시 삭제 지시에만 소실 알리고 force 제거.
- → 권위: `.harness/project/workflow-rules.md`, `github-issue-management-guide.md`, `commit-push-rules.md`.

## 2026-06-01 - 하단 네비 탭 수는 컴포넌트 상태를 기준으로 렌더링
- 문제: Issue #68에서 하단 네비가 4개 탭으로 늘었지만 전역 CSS 그리드는 3개 컬럼에 고정되어 모바일에서 네 번째 탭이 두 번째 줄로 밀리고 active pill이 화면을 가렸다.
- 결정: `BottomNav`가 항목 수를 CSS 변수로 내려주고, 모바일/데스크톱 그리드는 해당 값을 사용한다. 모바일 네비 폭과 항목 패딩은 4탭 기준에서 라벨이 한 줄로 유지되는 값으로 보정한다.
- 선택 이유: 탭 수 변경은 앱 쉘의 제품 구조 변경이므로 스타일에서 숫자를 중복 고정하면 같은 회귀가 반복된다. 컴포넌트의 실제 항목 수를 단일 기준으로 삼아 레이아웃을 맞춘다.
- 적용 범위: `src/shared/ui/BottomNav.vue`, `src/app/styles.css`.

## 2026-06-01 - Root tab pager 내부 fixed 요소는 비활성 탭에서 숨김
- 결정: tab-local fixed chrome은 비활성 `.tab-swipe-panel[aria-hidden='true']` 아래에서 숨긴다. fixed는 부모 패널 overflow를 벗어나 z-index만으로는 다른 탭 누수를 못 막으므로 active panel scoping 필요.
- → 권위: `.harness/project/ui-guidelines.md`. 통합 계약은 2026-06-05 "하단 네비 스와이프 탭" 항목 + `.claude` memory `tab-swipe-pager-contract`.

## 2026-06-01 - Teleport fixed 요소는 route 조건으로 렌더링 제한
- 결정: `Teleport to="body"` 요소(Run Log 월 heading)는 CSS descendant scoping이 안 닿으므로 route가 `/runs`일 때만 렌더링. tab-local 좌우 드래그 UI는 `data-no-swipe`+pointer/touch stop으로 root pager 이벤트 차단.
- → 권위: `.harness/project/ui-guidelines.md`. 통합 계약은 2026-06-05 "하단 네비 스와이프 탭" 항목 + memory `tab-swipe-pager-contract`.

## 2026-06-01 - AI 코칭은 코드 판단 엔진과 구조화 장기기억을 분리
- 문제: AI 코칭이 장기 컨텍스트를 사용하고 있었지만, 러너 정체성/반복 belief 같은 구조화 계층과 코드가 먼저 계산하는 판단 엔진이 명확히 분리되어 있지 않았다.
- 결정: `coach-run`에서 `runningAnalysisEngine`을 만들어 HR drift, 부하 변화, 회복 상태, 부상 위험, 과훈련 경고, 훈련 적합성 점수를 먼저 계산한다. `TrainingMemory`에는 `runnerIdentity`와 `coachBeliefs`를 추가하고, OpenAI 응답은 Responses API strict JSON schema로 강제한다.
- 선택 이유: 계산 가능한 판단은 코드가 책임지고, OpenAI는 그 판단을 설명/코칭 언어로 바꾸는 역할로 좁혀야 개인화 품질과 재현성이 올라간다.
- 검증: 중요 경로 `supabase/functions/coach-run/index.ts`는 `npm run supabase:functions:check`로 Deno 타입 체크를 통과시킨다. 전체 변경은 `npm run test:run`, `npm run build`, `npm run harness:check`로 확인한다.
- 적용 범위: `supabase/functions/coach-run/index.ts`, `src/entities/training-memory/model.ts`, `.harness/project/ai-coaching-goal.md`, `.harness/project/running-coaching-standards.md`, `.harness/project/architecture-rules.md`, `.harness/project/domain-rules.md`.

## 2026-06-02 - 추세 Lens 원본 신호와 표시용 처방 게이트 분리
- 결정: `buildTrendLensResult`는 단일 Lens 원본 분석으로 유지하고, 화면은 `buildTrendAnalysis`가 5개 Lens 계산 후 recovery/intensity warning을 전역 safety gate로 적용한 표시용 결과를 쓴다. 좋은 신호 hero는 보존하되 최종 처방 문구는 게이트 통과 반영. (Lens 계산에 타 Lens 상태 직접 주입은 독립성·테스트 경계 흐려 미채택.)
- → 권위: `.harness/project/domain-rules.md`.

## 2026-06-02 - 추세 종합 판단 클릭은 렌즈 선택만 수행
- 문제: 종합 판단 항목 클릭 시 해당 Lens를 선택한 뒤 `scrollIntoView({ block: 'start' })`로 Lens 상세까지 강제 이동하면서 모바일 화면 위치가 튀거나 사용자가 현재 맥락을 잃는 회귀가 생겼다.
- 결정: 종합 판단 항목 클릭은 관련 Lens 탭 선택만 수행한다. Lens 상세 영역으로의 강제 자동 스크롤은 제거하고, 버튼 기본 브라우저 스타일 영향은 CSS에서 명시적으로 차단한다.
- 선택 이유: 종합 판단 카드와 Lens 탭은 상하로 인접해 있어 선택 변경만으로도 연결성이 유지된다. 반면 자동 스크롤은 모바일 WebView와 root tab pager 맥락에서 화면 위치를 예측하기 어렵게 만든다.
- 포기한 대안: `scrollIntoView` 옵션을 `nearest`로 약화하는 방식은 브라우저/viewport 상태에 따라 여전히 위치 이동이 달라질 수 있어 채택하지 않는다.
- 적용 범위: `src/pages/trends/TrendsPage.vue`, `src/app/styles.css`.

## 2026-06-02 - 브릿지 체크는 UX 차단, 서버 앱 세션은 보안 경계
- 문제: GitHub Pages 공개 프론트에서 `window.webkit`/`NativeBridge` 존재 여부만 확인하면 사용자가 브라우저 개발자도구나 스크립트로 bridge 모양을 흉내내 서버 기능을 호출할 수 있다.
- 결정: 프론트 bridge 체크는 일반 브라우저 UX 차단으로만 유지한다. AI 코칭처럼 OpenAI 비용과 사용자 러닝 데이터 접근이 있는 Edge Function은 사용자 인증 뒤 `app-session` Edge Function이 발급한 짧은 수명의 서버 앱 세션, 승인 사용자 allowlist, 함수별 rate limit을 추가로 검증한다.
- 구현 기준: MVP 임시 운영은 `APP_SECURITY_MODE=allowlist`로 둔다. 서버는 승인된 로그인 사용자에게만 HMAC 서명 앱 세션을 발급하고, `coach-run`은 앱 세션과 rate limit을 통과해야 OpenAI 호출을 수행한다. 이 모드는 기존 앱 빌드와 호환되지만 기기 attestation은 수행하지 않는다.
- 무료 Apple 계정 전제: 현재 Apple Developer 계정이 무료(Personal Team)라 DeviceCheck/App Attest용 key id와 `.p8` private key를 발급할 수 없다. 따라서 MVP는 `allowlist` 모드만 운영하며, allowlist 모드는 deviceToken 없이 통과하므로 iOS 네이티브 코드 변경(예: `runContextAppSecurity` 핸들러, `RunContextWebView.swift`)이 필요 없다. 웹 프론트는 브리지가 없으면 deviceToken 없이 앱 세션을 요청한다.
- 향후 hardening: 유료 Apple Developer 계정으로 전환해 DeviceCheck key id와 `.p8` private key가 준비되면 `APP_SECURITY_MODE=devicecheck`로 바꾸고, 그때 iOS 네이티브 `runContextAppSecurity` bridge에서 받은 DeviceCheck token을 `app-session`에서 Apple API로 검증한다(서버 측 `verifyDeviceCheckToken` 경로는 이미 구현됨, 네이티브 브리지만 추가 필요). App Attest는 더 강한 production hardening 후보로 남기되, 구현 전에는 App Attest payload를 성공 처리하지 않는다(501).
- 선택 이유: `window` 객체 검사는 클라이언트 자가 주장이라 보안 경계가 될 수 없다. 현재 Personal Team/DeviceCheck key 미준비 상태에서는 기기 증명을 바로 운영할 수 없으므로, 먼저 서버 allowlist, 짧은 수명 앱 세션, rate limit으로 비용성 기능 통제를 강화한다.
- 포기한 대안: 프론트 난독화, bridge 이름 숨기기, route guard 강화만으로 서버 기능을 보호하는 방식은 공개 번들과 DevTools 조작을 막지 못하므로 채택하지 않는다.
- 검증: `npm run supabase:functions:check`, `npm run test:run`, `npm run build`, `npm run harness:check`를 실행했다. `config-contract.md` 변경이 `common.runtime.minimum-node` sync gap으로 잡혔지만, 이번 변경은 Node 최소 버전 계약이 아니라 서버 secret/앱 세션 설정 계약 추가이므로 harness runtime 구현 변경은 필요 없다. `APP_SECURITY_MODE=allowlist` 임시 운영 전환 뒤에도 같은 검증을 재실행했다.
- 적용 범위: `supabase/functions/app-session/index.ts`(신규), `supabase/functions/coach-run/index.ts`, `supabase/migrations/202606020001_app_security_sessions.sql`(신규), `src/shared/api/appSecurity.ts`(신규), `src/shared/api/coachRepository.ts`, `src/features/import-healthkit-run/healthKitBridge.ts`(Window 타입), `.env.example`, `package.json`, `.harness/project/architecture-rules.md`, `.harness/project/config-contract.md`, `.harness/project/github-pages-supabase-playbook.md`. iOS 네이티브(`RunContextWebView.swift`)는 무료 계정 전제상 이번 MVP 범위에서 변경하지 않았고 devicecheck 전환 시점으로 보류한다.
- 배포 순서 주의: `coach-run`이 `x-pacelab-app-session` 검증을 강제하므로 프론트 배포 전에 (1) Supabase secret(`APP_SESSION_HMAC_SECRET`, `APP_SECURITY_MODE=allowlist`, `PACELAB_ALLOWED_EMAILS`, `COACH_RUN_RATE_LIMIT_PER_HOUR`) 설정, (2) `app_sessions`/`edge_function_rate_limits` 마이그레이션 적용, (3) `app-session`·`coach-run` Edge Function 배포가 선행돼야 한다. 순서가 어긋나면 모든 사용자의 AI 코칭이 403/500으로 끊긴다.

## 2026-06-04 - Edge Function 인증/토큰 변경은 배포 후 실제 흐름 스모크가 완료 조건
- 문제: #93 보안 강화 배포 후 코칭이 연속으로 막혔다. (1) `appSecurity.ts`의 `requestDeviceCheckToken`이 브리지 미연결 시 동기 `throw`라 호출부 `.catch()` 폴백이 무력화됐고(브리지 없는 모든 환경에서 차단), (2) `app-session` 토큰을 `'.'`로 join했는데 `expiresAt`(toISOString)의 밀리초 `.` 때문에 `coach-run`의 `split('.')` 조각 수가 6을 넘어 모든 토큰이 403으로 거부됐다.
- 공통 원인: 두 버그 모두 `deno check`, `vue-tsc build`, vitest unit test를 통과했다. 타입·빌드·단위 테스트는 런타임 비동기 폴백, 토큰 직렬화/서명/검증 같은 실제 인증 흐름 버그를 잡지 못한다.
- 결정: Edge Function의 인증·세션·토큰·rate limit 같은 보안 경계를 추가/변경하면, 타입체크와 빌드만으로 완료로 보지 않는다. 배포 후 승인 사용자 로그인 상태에서 실제 코칭 1회(또는 보호 대상 호출 1회)를 스모크 검증하는 것을 완료 조건에 포함한다. 캐시된 옛 토큰이 있으면 클라이언트 캐시를 비운 뒤 검증한다.
- 선택 이유: 보안 경계 변경은 happy-path 단위 테스트가 거의 없고, 토큰 포맷/서명/구분자 충돌은 정적 검사로 드러나지 않아 프로덕션에서야 노출된다. 스모크 1회가 가장 싸고 확실한 게이트다.
- 포기한 대안: Edge 런타임 통합 테스트 하네스 구축은 MVP 단계 비용이 커서 보류하고, 배포 후 수동 스모크로 대체한다.
- 적용 범위: `src/shared/api/appSecurity.ts`(PR #156), `supabase/functions/app-session/index.ts`·`supabase/functions/coach-run/index.ts`(PR #158), `.harness/project/workflow-rules.md` 검증 규칙.

## 2026-06-02 - Root tab swipe release animation은 route 전환보다 먼저 수행
- 문제: Issue #92에서 스와이프 판정 직후 `router.push`가 먼저 실행되고, track은 아직 dragging 상태라 CSS transition이 꺼져 있었다. 그 결과 손을 뗀 offset 지점에서 다음 패널까지 이어지는 애니메이션 없이 route index가 즉시 바뀌어 화면이 확 넘어갔다.
- 결정: root tab swipe는 release 단계에서 `swipeTrackIndex`로 현재 시각 기준 index를 고정하고, `swipeOffset`을 패널 폭 끝까지 transition시킨 뒤 route를 변경한다. route 변경 후 reset은 시각 위치가 같은 상태에서 수행한다.
- 선택 이유: 사용자가 손을 뗀 순간의 offset은 다음 장면 전환의 시작점이어야 한다. route 변경을 먼저 하면 Vue route index 변경과 dragging transition off 상태가 결합해 전환 애니메이션을 볼 수 없다.
- 운영 보정: 사용자 최종 완료 승인 전 Issue close가 금지되어 있으므로 PR 본문에 `Closes #...`를 넣지 않는다. #92는 이전 PR 본문의 `Closes #92` 때문에 조기 close되어 다시 열었다.
- 적용 범위: `src/app/App.vue`, GitHub Issue/PR 운영 문구.

## 2026-06-02 - Root tab swipe 차단은 내부 horizontal gesture만 opt-out
- 문제: Issue #92 후속 확인에서 root swipe 차단 selector가 `button`, `[role="button"]`, 일반 차트까지 포함해 요약의 최근 세션 같은 일반 버튼형 카드에서 홈 간 스와이프가 시작되지 않았다.
- 결정: 일반 button/card/list row/summary row/non-interactive chart는 root tab swipe를 막지 않는다. 실제 내부 좌우 드래그나 horizontal scroll을 가진 컴포넌트만 `data-no-swipe`, `[data-horizontal-scroll]`, `role="slider"`, overflow-x scroll 감지로 opt-out한다.
- 선택 이유: root pager의 click suppression은 horizontal swipe 후 accidental click을 막을 수 있다. 터치 시작점이 pressable이라는 이유만으로 root swipe를 차단하면 모바일 앱의 기본 탭 이동 제스처가 깨진다.
- 추가 결정: iOS/WebView에서 double-tap zoom은 웹 viewport/touch guard와 네이티브 WKWebView zoom gesture 비활성화를 함께 적용한다. iOS 앱 orientation은 Info.plist 생성 설정과 AppDelegate supported orientation을 portrait로 고정한다.
- 적용 범위: `src/app/App.vue`, `src/shared/ui/BottomSheetSelect.vue`, `src/shared/ui/TrendLensChart.vue`, `index.html`, `src/app/styles.css`, `/Users/smart-tn-083/practice/RunningCoach`.

## 2026-06-04 - 템포 심박 상한·심박존을 개인 심박 기준으로 공식 파생 (Issue #123 조사 → #127 구현)
- 배경: #123 조사 결과 템포 상한 165와 Z0~Z5 존이 개발자 개인값으로 4곳(`heartRateZones` Z4, `coach-run` tempoHeartRateCeilingBpm/boundary, `performanceProjection`, `trendInsights`)에 하드코딩돼 있었고, `AthleteProfile`에 개인 심박 입력 필드·환산식·개인화 경로가 전혀 없었다(문서 약속만 존재). 랩 "8랩"은 1km 분할이 아니라 소스(FIT/HealthKit) lap 레코드를 1:1 저장한 순번임도 확인.
- 결정: 심박존·템포/이지/회복 상한을 단일 공식으로 파생한다. 우선순위는 **LTHR > 측정 HRmax > Tanaka(208−0.7×나이) 추정 > 상수 fallback**. anchor=LTHR, 측정/추정 HRmax에서는 LT≈0.9×HRmax(역치 88~92% HRmax 중앙값). 존 경계는 anchor를 기준 상수 비율로 만들어 anchor=165면 기존 상수와 정확히 일치(미입력 회귀 0).
- 웹 근거: 템포 ~75~85% HRmax, 역치 ~85~92% HRmax / ~80~88% HRR; Tanaka 식이 220−나이보다 정확(특히 40세+); Friel LTHR(30분 단독 TT 마지막 20분 평균) 기반 존; Karvonen %HRR. (ASICS, Marathon Handbook, Tanaka PMC5862813, Joe Friel, RunReps)
- 포기한 대안: Karvonen(%HRR) 중심 — 사용자가 LTHR 우선을 선택. 안정심박은 입력은 받아 코칭 맥락으로 보존하되 anchor 산출엔 직접 쓰지 않음(추후 HRR 확장 여지). 랩 거리 정규화는 별도 decision 후보로 보류(route 기반 fastSegments 우선 정책 유지).
- 안전: Tanaka 추정은 단정 근거가 아니라 보수 신호로만 쓰고 측정/역치 입력을 권유. 레벨·나이로 안전 상한을 낮추지 않는다. 의료 단정 금지.
- 적용 범위: `src/entities/training-memory/model.ts`(AthleteProfile 3필드+normalize), `src/shared/lib/heartRateZones.ts`(deriveHeartRateModel), `src/shared/lib/performanceProjection.ts`, `src/shared/lib/trendInsights.ts`, `src/pages/dashboard/DashboardPage.vue`, `src/shared/ui/AppHeader.vue`, `src/pages/memory/MemoryPage.vue`, `supabase/functions/coach-run/index.ts`(deriveCoachHeartRateModel), `.harness/project/domain-rules.md`.

## 2026-06-04 - 심박 상한 165 상수 완전 제거 + 데이터 보정 + auto/manual + 근거 표시 (Issue #127 v2)
- 배경: 사용자가 #127 1차(merge/배포) 후 확인. (1) 나이만 입력해도 156으로 자동 적용되는 것을 보고 "나이 베이스 + 누적 데이터 보정"을 원했고, (2) 165는 2달 전 ChatGPT에서 받은 개발자 개인값을 상수로 박은 것이라 "코드 어디에도 165 상수를 두면 안 된다"고 못박았으며, (3) 앱 화면에 산출식·외부 근거를 보여 신뢰를 줄 것, (4) 추천값 vs 사용자 지정값 분리·선택을 요구.
- 결정:
  - 165/145/130 상수를 **코드 전역에서 제거**(heartRateZones·coach-run·performanceProjection·trendInsights·inferRunType). 존 경계는 anchor(LTHR)의 %LTHR 비율로만 정의(Z1 0.79·Z2 0.88·Z3 0.94·Z4 1.0). 36세는 공식상 anchor≈165가 자연 산출.
  - 추천(auto) anchor = max(Tanaka 나이추정, 누적 RunLog 관측 최대심박)×0.9. 관측은 표본 3개↑(4개↑면 최고 1개 제외)로 강건 추정, 올리는 방향으로만 보정. 직접입력(manual)은 LTHR > 측정 HRmax.
  - 근거 데이터 전무 시 상한 null(미설정). 165 fallback 없음 → 페이스/RPE/드리프트로 평가 + 입력 권유.
  - `AthleteProfile.heartRateMode: 'auto'|'manual'` 추가(러너레벨 패턴과 동일). 직접값 보존·토글. UI에 현재값/추천값/source + 산출식 + 외부 근거 링크(Tanaka PMID 11153730, Joe Friel LTHR, ASICS).
  - inferRunType은 store에서 모델을 주입받아 상수 없이 판정. 테스트는 anchor=165 모델(manual+LTHR 165)을 주입해 기존 판정 회귀를 막음.
- 포기/주의: 나이 추정을 그대로 게이트로 쓰면 fit한 50세가 156에 갇히는 문제 → 관측 보정으로 해소. 나이/추정은 보수 신호로만, 레벨·나이로 안전 상한 안 낮춤, 의료 단정 금지.
- 적용 범위: 위 5개 코드 파일 + `src/entities/training-memory/model.ts`(heartRateMode) + 3개 UI(AppHeader/MemoryPage/Dashboard) + import 경로(healthKitSyncStore/UploadRunPage/localFileExtractor/healthKitBridge) + `.harness/project/domain-rules.md`.

## 2026-06-04 - 저장 처방의 stale 심박 상한(165) 잔재 정리 (Issue #127 후속)
- 증상: 심박 추천(예 156)으로 설정해도 코칭/주간 루틴 템포 처방에 옛 165가 그대로 나옴.
- 원인: 프로필 "심박 상한"은 deriveHeartRateModel로 live 계산이지만, weeklyPattern/adaptiveTrainingProfile.prescriptionTemplates/progressionCriteria/sessionGuides는 과거 AI/기본값이 박은 "165bpm" 텍스트를 그대로 보존(normalize가 저장 배열 유지). coach-run은 그 템플릿을 우선 사용하라고 지시해 새 코칭도 165를 에코.
- 데이터 구조 확인: 처방·루틴은 `training_memory.memory` 단일 JSON에 **upsert(덮어쓰기) → 이력 없음, 항상 최신본**. coach_reports만 append 이력. 따라서 stale 165는 "과거 기록"이 아니라 현재 최신 처방의 잔재라 **이력 훼손 없이 load 시 정규화 가능**.
- 결정: (1) `stripStaleHeartRateCeilings`로 정규화(load) 시 처방/루틴 텍스트의 130/145/165/168을 일반 표현("회복/이지/템포 상한")으로 치환(웹 normalizeTrainingMemory + coach-run sanitizeMemoryHeartRateCeilings). (2) coach-run 지침에서 심박 상한 숫자는 저장 텍스트가 아니라 항상 heartRateModel을 유일 출처로 사용하도록 명시. coach_reports 과거 이력은 불변(새 턴부터 정합).
- 적용 범위: `src/entities/training-memory/model.ts`(sanitizer + 정규화 적용), `supabase/functions/coach-run/index.ts`(sanitizeMemoryHeartRateCeilings + 지침), 테스트 추가.

## 2026-06-05 - worktree에서 harness:check가 lint/test/build를 silent skip (하네스 본체 결함 + 운영 대응)
- 증상: Issue worktree에서 commit/pre-push hook의 `npm run harness:check`가 매번 `검증: 스택 미적용으로 lint/test/build 스킵`을 찍고도 `결과: 통과`로 끝남. 검증을 안 했는데 통과처럼 보이는 silent degradation.
- 원인(소스): `guard.mjs:22`가 적용 여부를 `fs.existsSync('.harness/.stack-applied.json')` 마커 존재만으로 판정 → 마커 없으면 `guard.mjs:549`에서 lint/test/build 블록을 통째 스킵. 그런데 이 마커는 `.gitignore:19`로 **추적 제외**(내용에 npx 캐시 등 머신 로컬 경로 포함이 이유로 추정).
- 근본: git worktree는 **추적 파일만 새로 체크아웃**하고 ignored 파일은 안 만들어 냄(node_modules와 동일 이치). 단일 작업트리 + 브랜치 분기 모델에선 마커가 그 자리에 남아 "한 번 stack:apply=영구"가 성립해 문제가 안 났으나, worktree(및 fresh `git clone`/CI 러너 등 "추적 파일만의 깨끗한 체크아웃")에선 마커가 빠져 검증이 누락됨. 하네스가 "적용 상태"를 머신 로컬·체크아웃 종속 마커로 들고 있는 게 원인. 참고: 프리셋 스냅샷 `.harness/stacks/.applied/<id>/`는 추적되어 worktree에도 존재함(확인).
- 결정/대응:
  - (즉시 운영) 상류 수정 전까지 worktree 작업은 hook 검증과 별개로 작업트리에서 `npm run build`+`npm run test:run`을 직접 돌려 보강한다(이번 #186/#188이 그렇게 처리됨). 필요 시 worktree에서 `npm run stack:apply` 1회로 마커를 만들면 hook이 풀 검증으로 돌지만, profile.json/stack-preset-rules.md/harness-lock.json(추적 파일)을 건드릴 수 있어 commit 전 `git status` 확인 필요.
  - (상류 제안) harness-seed의 `guard.mjs` 판정을 **추적되는 상태에서 derive**: `profile.json`의 `activeStack` + 커밋된 `.harness/stacks/.applied/<id>/` 스냅샷 존재로 "적용됨"을 판정(마커는 보조). 더해 **linked worktree + 마커 없음**이면 조용한 info가 아니라 **경고**로 스킵을 알린다. 이러면 worktree/clone/CI 어떤 fresh checkout이든 검증이 자연히 켜짐.
- 메타: 이 repo는 하네스(harness-seed/스택 하네스)의 도그푸드 소비자라, 본 발견은 상류 개선 피드백으로 격상. `.harness/bin/*`는 sync로 내려오는 본체이므로 로컬 직접 수정은 다음 sync에 덮임 → 수정은 상류에서.

## 2026-06-05 - 하네스 base v0.2.53 적용 (위 silent-skip 상류 수정 반영, Issue #194)
- 적용: `npm run harness:update -- --base-only`로 base 0.2.52 → 0.2.53. stack vue3-vite-pinia-router 0.1.32는 최신(무변경).
- 상류 수정 확인: v0.2.53 `guard.mjs`는 우리가 제안한 1번대로, 로컬 마커(`.harness/.stack-applied.json`) 없이도 `profile.json` activeStack + 커밋된 `.harness/stacks/.applied/<stack>/manifest.json` 스냅샷에서 적용 상태를 derive. **마커 없는 worktree에서 `Stack applied state derived from tracked snapshot ...` 출력 후 `검증: test, build 통과` 실제 실행**을 확인(캐시 비우고 재현). silent skip 종료.
- 표준 계층 충돌 처리: 이 업데이트가 base-managed인 `CLAUDE.md`/`AGENTS.md`의 인라인 PaceLAB 전용 문구(MVP 자동완료 흐름·요청창 풀스택 소유·main 직접 commit 차단/예외)를 generic base 문구로 되돌림. 확인 결과 해당 권위 규칙은 프로젝트 소유 문서 `.harness/project/workflow-rules.md`(8·33·44·45행)와 `commit-push-rules.md`(21행)에 그대로 보존되어 **동작 손실 없음**.
  - 결정: 재인라인하지 않고 generic base 문구를 수용. 프로젝트 전용 규칙의 단일 출처는 `.harness/project/*`로 유지(엔트리 파일에 인라인하면 base 업데이트마다 덮여 drift 재발). CLAUDE.md는 "작업별로 골라 읽는 기준"으로 그 문서들을 가리키고, UserPromptSubmit hook이 PaceLAB 컨텍스트를 매 요청 주입하므로 surface도 유지됨.
- 주의(기록): fresh worktree는 `node_modules`가 없으면 이제 검증이 실제 실행되며 `vitest: command not found`로 실패할 수 있음 → 하네스 문제 아님, `npm ci` 선행 필요. strict(`harness:check:strict`)는 사전 존재하던 doc-link 경고(`workflow-rules.md → GlossaryPage.vue`)에서 죽으므로 평소 게이트는 비-strict `harness:check` 기준.

## 2026-06-05 - 하단 네비 스와이프 탭: 스크롤 모델 + iOS 제스처 계약 (#196·#198·#200·#204·#206·#208·#210·#212 완료처리)
- 배경: 하단 4탭(요약/기록/추세/기억)은 App.vue가 4페이지를 한 트랙에 동시 마운트해 좌우 스와이프로 전환. 번들 다이어트 + iOS 스와이프 불안정(세로 끌림·mid-drag 네비·sticky 잔상) 해결에 8개 이슈·연쇄 회귀가 있었어 핵심 계약을 고정한다.
- 아키텍처(#196·#198):
  - 4탭 페이지는 `defineAsyncComponent` 지연 로드(독립 청크). 활성 탭만 초기, `onTabPointerDown` 시 좌우 이웃 로드, 유지. **App.vue에서 페이지 정적 import 금지**(라우터 `() => import()` 무력화 → 전부 entry로 합쳐짐).
  - 탭 홈 스크롤 모델 = 상세 스택(`.memory-stack-page`)과 동일: `.app-shell.is-tab-home` `height:100dvh` 고정 grid + `.app-main` 내부 스크롤 행 + **각 `.tab-swipe-panel`이 독립 내부 스크롤러**(`overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain`). 바디 미스크롤 → 상단 오버스크롤로 웹뷰 뒤 미노출, 내부는 바운스(pull-to-refresh 대비).
- iOS 제스처/스크롤 계약(회귀 교훈, 위반 금지):
  1. **Pointer Events `preventDefault()`는 iOS 네이티브 스크롤을 못 막음 — non-passive `touchmove`만 가능.** 수평 락 중 document `{passive:false}` touchmove로 preventDefault.
  2. **스크롤 시작된 touchmove는 취소 불가** → 첫 유의미 move(≥6px)에서 방향 확정(absX>absY=수평), 수평이면 즉시 preventDefault(dead-zone 대기 금지).
  3. **제스처 도중 스크롤러 `overflow`/`touch-action` 토글 금지** → reflow가 `pointercancel` 유발, `@pointercancel`이 종료처리에 묶이면 mid-drag 네비(#200→#204). 세로 억제는 토글 아닌 scrollTop 핀 + touchmove preventDefault.
  4. **`pointercancel`은 네비 커밋 금지(스냅백). 네비는 `pointerup`에서만.**
  5. **내부 스크롤러에선 `window` scroll 리스너를 capture(`{capture:true}`)로** — 버블 리스너는 자식 스크롤러 scroll을 못 받음(#210 sticky 잔상 원인).
  6. **스크롤 위치는 패널별 독립** → 탭 도착 시 active 패널 `scrollTop=0` 리셋(#208). AppShell `window/app-main.scrollTo`는 탭 라우트에선 무효(잔존 무해).
  7. **스크롤-구동 sticky는 스와이프 확정 즉시 정리** → 확정 시 `CustomEvent('pacelab:tab-swipe-commit')` 발화, 페이지가 수신해 해제(#212). 도착-후 처리는 슬라이드 종료 후 늦게 떨어짐.
- 한계: iOS 첫 move 이전 미세 세로 끌림 잔존 가능. 검증 실기기 필수(헤드리스 불가). 미채택: 비활성 탭 완전 지연 마운트, 부상 이미지 최적화(부상 전면개선 시 별도).
- 적용: `src/app/App.vue`(arbiter·지연로드·commit 이벤트), `src/app/styles.css`(is-tab-home·panel), `src/shared/ui/AppShell.vue`(is-tab-home), `src/pages/run-log/RunLogPage.vue`(capture scroll·sticky 이벤트). 다른 탭엔 동일 sticky 패턴 없음(점검 완료).

## 2026-06-05 - 날씨 도메인 러너 중심 재설계: 기상청 교체·Edge 프록시 (Issue #219)
- 배경: Open-Meteo(글로벌)는 국내 정확도가 약하고 로드 실패가 잦음. 국내 정확도 높은 기상청 단기예보(VilageFcstInfoService_2.0)로 교체.
- 결정:
  - **출처 교체 + 프록시**: 운영 기본을 기상청으로 교체. serviceKey가 `VITE_WEATHER_*`(프론트 노출, config-contract 위반)였던 문제를 Edge Function `weather-run`에서 `KMA_SERVICE_KEY_DEC/ENC` 서버 secret으로 옮겨 해결. Edge가 격자 룩업·디코딩·발표시각 캐시·rate limit·app-session 검증을 담당(coach-run 패턴). 로드 안정성도 캐시/서버 흡수로 개선.
  - **좌표→격자**: Lambert 변환식 대신 행정동↔격자 룩업표(`grid.json`, 3834행) 최근접 매칭(사용자 선택). 역매핑으로 동네명 라벨 동시 제공.
  - **체감온도 계절분기 자체 산출**: 기상청 미제공 → 여름 열지수(Stull 습구)/겨울 풍속냉각/중간 기온. 웹 `runningWeather.ts` ↔ Edge `weather-run` **미러 유지**(pace/HR 모델과 동일 패턴).
  - **일출/일몰**: 외부 API 없이 위경도 천문계산(`sunTimes.ts`, NOAA solar-noon). day-wrap은 Date 산술에 위임.
  - **시점 전환**: 3일 스냅샷을 한 번 받고 클라이언트에서 날짜 필터(추가 호출 없음). 3일 초과는 "예보 범위 밖" 안내(중기예보 미사용).
  - **복장 추천**: 러닝 체감온도 5℃ 단위 10버킷(≤−10~≥30) + 강수·강풍 가점. 규칙기반(오프라인).
  - **공유 인증 모듈**: `_shared/appSession.ts` 신설(weather-run에서 사용). coach-run(4715줄, critical)은 인라인 구현 유지해 risk 격리 — 추후 수렴 가능.
  - **Open-Meteo 보존**: 삭제하지 않고 Supabase 미설정/비로그인 개발 fallback으로만 유지.
- harness:check blocking 오탐 처리: `config-contract.md` 변경이 `[common.runtime.minimum-node]` 정책과 매칭됐으나, 이번 변경은 **KMA Edge secret 추가**일 뿐 Node 최소버전 enforcement(`check-node-version.mjs`)와 무관 → 반대편 구현 변경 불필요. (정책의 "can ignore when: 구현 변경이 필요 없고 그 이유가 decision-log에 남아 있을 때" 충족.) `package.json` 변경은 `supabase:functions:check`에 weather-run 추가뿐으로 vue3-vite-runtime 계약 무영향.
- 미완 수동 단계(배포 전 필수): Supabase Edge secret `supabase secrets set KMA_SERVICE_KEY_DEC=... KMA_SERVICE_KEY_ENC=...` 설정 후 `weather-run` 배포. 배포 후 실제 위치 1회 스모크(인증/프록시 토큰 경로 포함)로 완료 확인 — `.claude` memory `edge-auth-deploy-smoke` 기준.
- 재발 방지 기록: `.harness/project/architecture-rules.md`(날씨 계약), `domain-rules.md`(WeatherSnapshot·외부 시스템 계약), `config-contract.md`(KMA secret), `weatherkit-data-contract.md`, `.harness/session/decision-log.md`(본 항목), `.claude` memory `weather-runner-domain.md` 반영.

## 2026-06-05 - 세션 파일 슬림 구조 채택 + 운영 규칙 단일 출처 고정
- 문제: `next-session-reminder.md`와 `active-context.md`가 `.harness/project/workflow-rules.md`의 "요청 단위 풀스택 창 운영" 규칙 본문을 거의 1:1로 복붙해 비대해졌다. 두 파일은 매 세션 SessionStart hook(`session-start-reminder.sh`, `sed 1,120p`)과 always-on 기준으로 로드되므로 중복이 매 세션 토큰을 두 번 먹고, 규칙 단일 출처가 무너진다.
- 결정: 두 파일은 **부트스트랩/핸드오프 계층**으로 한정한다. `next-session-reminder.md`=부팅 체크리스트, `active-context.md`=프로젝트 고정 사실+최신 상태+핸드오프. 운영 규칙 본문은 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 **단일 출처**로 가리키고 session 파일에 중복 기재하지 않는다. (next-session-reminder.md 35→23줄, active-context.md 39→30줄.)
- 계층 근거: `standards-layers.md` — 세션 운영 기준은 회사 공통(본체) 영역이나 "기본 운영 기준" 층이라 프로젝트가 구체화 가능. 두 파일은 `install-manifest.json`의 `projectOwnedFiles`라 본체 업데이트가 내용을 보존 → 슬림 내용은 프로젝트 소유로 유지된다.
- 본체 분담: 슬림 유지 "원칙"은 본체로 승격 요청(상류 PR 대상: `.claude/commands/reminder.md`, `.harness/skills/registry.json`, `.harness/session/README.md`, `.harness/documentation/decision-flow.md` — 모두 managedFiles라 업데이트로 전파). 진행 상태는 `.harness/session/manual-actions.md` open 항목 참고.
- 반영 후 절차: 본체 반영 확인 시 이 프로젝트는 `npm run harness:update -- --base-only`(기본 update는 stack이므로 `--base-only` 필수)로 managed 지침을 받고, owned인 두 세션 파일은 그대로 둔다.
- 재발 방지 기록: `.harness/session/active-context.md`, `.harness/session/next-session-reminder.md`(슬림화), `.harness/session/manual-actions.md`(본체 요청 추적), `.harness/session/decision-log.md`(본 항목). project 규칙 문서는 변경 없음(단일 출처가 이미 `workflow-rules.md`).
