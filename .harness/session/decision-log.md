# 결정 로그

이 문서는 이 프로젝트에서 내린 중요한 판단과 선택 이유를 남기는 소비자 프로젝트 전용 로그입니다.

> 하네스 본체의 변경 이력이나 릴리스 노트가 아닙니다. 하네스 본체 변경 기록은 하네스 저장소의 `CHANGELOG.md` 또는 릴리스 태그를 확인합니다.

## 2026-06-08 - 개인 업적 도메인(#181): 파생 계산 + 코칭 인용은 client-summary 주입
- 설계 게이트: #181은 Inbox·초안("설계 확정 후 착수")이라 구현 전 4개 결정을 사용자 확인. 결과(모두 추천 채택): (1) 범위=PB·기록류 우선(최장 거리/시간·최속 평균 페이스·거리 마일스톤 첫 달성, 누적류 스트릭/볼륨은 후속), (2) coach-run 인용 포함, (3) 표시 UI는 후속(와이어프레임 게이트), (4) 저장=파생 계산(테이블 없음).
- 저장 결정: 업적은 전부 `run_logs` 파생·stateless 재산출(`src/shared/lib/achievement/achievements.ts`). 별도 테이블/트리거 없음 → 새 기록 import 시 재호출만으로 자동 갱신. distancePb(#228)와 동일 패턴, 이중 출처·동기화 복잡도 회피.
- 컨텍스트 분리: PB·기록류는 'self-race'로 훈련/레이싱 상호 배타. 누적류는 통합(후속). race 사다리는 self-race 0건이면 비어있음(부트스트랩).
- **코칭 인용 = client-summary 주입(미러 대신)**: coach-run은 `run_logs`를 최근 120건만 조회 → 서버 재계산 시 올타임 기록(예: 130런 전 최장거리)을 놓침. 그래서 vdotPaces류 "양측 미러" 대신, **웹이 전체 런으로 산출한 컴팩트 요약을 payload로 전달**하는 `currentWeather` 패턴을 채택. coach-run은 `normalizeAchievements`로 검증·주입만. 이유: (a) 올타임 정확, (b) distancePb 적분(150줄) Deno 미러 회피, (c) 프롬프트 크기 절약(PB 2버킷·마일스톤 목록만). 단점=클라이언트 신뢰지만 사용자 본인 데이터·비권위 인용이라 수용. 인용 지침: 과장/날조 금지, 맥락 맞을 때 1~2개, 값 재계산 금지.
- 검증/배포: Edge(coach-run) 변경 → 배포 후 로그인 상태 실제 코칭 1회 스모크가 완료 조건([[edge-auth-deploy-smoke]]). 인증/토큰 경계 미변경(선택적 context 필드 추가).
- → 권위: 이슈 #181, `.harness/project/competition-domain.md` §9.2(PB 분리). UI·누적류는 후속 이슈.

## 2026-06-08 - PoC② metricSamples 밀도 측정 → 거리별 PB(#228) 착수 게이트 GO
- 게이트: 2026-06-07 결정의 "착수 게이트 PoC②"(metricSamples로 현실적 PB 곡선 생성 가능 비율 측정, #228 완료조건 1번)를 닫는다. **production 코드 없이** Supabase SQL Editor에서 집계 SQL만 실행해 측정(원시 PII 미반출). 측정 SQL은 repo root `poc228-metric-samples-density.sql`(재현용, 추적).
- 측정 결과(전체 188런, 5km↑ 140런이 5km PB 사다리 모집단):
  - 샘플 보유율 **97%(136/140)** — 순수 균등 fallback이 강제되는 무샘플 런은 **3%(4건)뿐**.
  - paceSec 커버리지 평균 0.98, 시간(offsetSec) 커버리지 평균 ~1.0 → 적분 입력(offsetSec/paceSec)이 거의 항상 존재.
  - 밀도 중앙값 15.2 샘플/km, 샘플 간격 중앙값 30.2초(≈80~100m/점) → 5km 경계 위치 오차 ±~18초로 PB 산출에 충분.
  - 밀도 히스토그램(5km↑): 무샘플 4 / <5km 1 / 5–10km 31 / 10–20km 104 / ≥20km 0.
  - source는 **전부 HealthKit**(188/188, 평균 73샘플/런). file_import·manual·image_extracted 경로의 샘플 부재는 이 데이터셋으로는 검증 불가(향후).
  - `self-race` 태그 런 **0건** → 레이싱 PB 사다리 현재 비어있음(이슈 부트스트랩 전제와 일치).
- 판정: **GO**. 근거 — 곡선 생성 가능 실질 비율 97%, 순수 fallback 3%로 균등 fallback 비중 우려 없음 → 고스트(#67) 입력 품질 재검토 불요.
- 구현에 고정할 결정 2가지:
  1. `computeDistancePbs` 분기는 **"샘플+paceSec 있으면 적분, 없으면 durationSec/distanceKm 균등"의 2단**으로 충분. 초기 측정에 쓴 `10샘플/km` 같은 밀도 컷오프는 **사용성 게이트로 쓰지 않는다**(성긴 5–10/km 22%도 실측 pace가 등속 가정보다 우월 → 적분 사용). 밀도 컷오프 도입 시 22%가 불필요하게 fallback으로 떨어짐.
  2. **race 분리 케이스는 실데이터가 없어 합성 fixture Vitest로만 검증** 가능(self-race 0건). #228 완료조건 "훈련·레이싱 분리 케이스" 테스트는 이 전제를 명시.
- → 권위: 이슈 #228 완료조건, `.harness/project/competition-domain.md` §9. 후속 구현(`src/shared/lib/achievement/distancePb.ts`)은 본 게이트 통과 후 진행.

## 2026-06-08 - 웹+네이티브 모노레포 이행 (#250, ultracode 9-에이전트 계획)
- 배경: 웹·네이티브가 `runContext*` 브리지 스키마로 결합돼 있는데 별 repo라 브리지 변경이 두 repo로 쪼개져 원자성이 깨짐. 라이브 트래킹(#229)·워치(#235)·레이싱 등 크로스커팅 작업이 곧 본격화 → 모노레포로 결정.
- 핵심 결정: (1) 웹 repo를 기준 모노레포로 유지(새 repo 안 팜 — 하네스·Pages·Actions·Supabase Vars·하드코딩 URL이 웹에 바인딩). (2) **웹은 root 그대로**(서브디렉터리化 금지 — `vite base '/RunningCoach/'`·`pages.yml`·`repoRoot`·상대경로 스크립트가 web-at-root 가정, 옮기면 전부 깨짐. 웹/하네스 변경 표면 0). (3) 네이티브만 `native/` 프리픽스로 `git subtree add` 흡수(history 보존, 2중첩 평탄화). (4) 네이티브 remote는 archive(삭제 금지), #248 parked는 보존 브랜치로 push.
- 검증으로 밝혀진 단순화: native/ 추가가 harness:check(web lint/test/build)·harness:impact에 영향 없음 → 계획이 우려한 stack scoping(scope-gate.mjs)은 **불필요**. WebApp gitignore분도 subtree에 안 딸려옴.
- 비가역 지점은 **E4(통합 브랜치→main 머지) 하나뿐**. 그 전까지는 통합 브랜치 삭제로 완전 복구. 백업 태그 `premonorepo-web-backup`/`premonorepo-native-backup` + 네이티브 미러(`~/backup/native-mirror.git`) 확보.
- 후속(별도): 브리지 계약 단일화(`shared/contracts/runContext.bridge.ts`), WebApp 빌드 자동복사, 메모리 모노레포판 갱신(`native-repo-git-management`·`worktree-edit-path`), #248 DeviceCheck.
- → 권위: root `CLAUDE.md` 모노레포 섹션, 이슈 #250.

## 기록 원칙
- 프로젝트 기준, 스택 기준, 템플릿 계약, 개인 기준이 충돌할 때 선택 이유를 남깁니다.
- 테스트 전략, 예외 허용, 아키텍처 경계, 운영 절차처럼 이후 작업에 영향을 주는 판단을 남깁니다.
- 단순 작업 로그나 일회성 구현 세부사항은 남기지 않습니다.
- 임시 예외는 가능하면 `.harness/policy/waivers.json`에 범위와 만료 조건을 함께 남깁니다.

> 아카이브: 2026-05 결정 61건과 2026-06 완료·통합·해소 항목은 `decision-log-2026H1.md`로 분리했습니다(하네스 v0.2.55 기억 표면 정리). 현재 파일은 최근 또는 아직 유효한 결정만 유지합니다.

## 2026-06-01 - 추세 Lens 하단 탭 신설
- 결정: `추세`를 4번째 하단 탭으로 추가(목표 진전/유산소 효율/강도 분포/세션 품질/회복 비용 Lens, 각 Lens는 변화·신뢰도·근거 세션·처방 영향). `RunLog`/목표/부상 편집·AI 코칭 변경은 미담당. 의료/부상 예측 단정 없이 처방 보수성 조정 신호로만 제한.
- → 권위: `.harness/project/navigation-information-architecture.md`. UI 반영은 `03-ui-ux` workstream.

## 2026-06-01 - HealthKit 과거 이관 임시 UI (완료·아카이브)
- #25 2025-11~2026-04 HealthKit 과거 이관용 1회성 UI를 기록 페이지에 추가했다가 이관 성공 후 제거. 비노출 브리지/저장 로직(`requestHistoricalMigration`/`requestHealthKitRunsInRange`/네이티브 `requestRunningWorkoutsInRange`)은 향후 범위 이관·운영 복구용으로 유지한다. 전문 → `decision-log-2026H1.md`.

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
- → 권위: `.harness/project/ai-coaching-goal.md`, `running-coaching-standards.md`, `architecture-rules.md`, `domain-rules.md`. 핵심 경로 `supabase/functions/coach-run/index.ts`는 `npm run supabase:functions:check`로 Deno 타입 체크.

## 2026-06-02 - 추세 Lens 원본 신호와 표시용 처방 게이트 분리
- 결정: `buildTrendLensResult`는 단일 Lens 원본 분석으로 유지하고, 화면은 `buildTrendAnalysis`가 5개 Lens 계산 후 recovery/intensity warning을 전역 safety gate로 적용한 표시용 결과를 쓴다. 좋은 신호 hero는 보존하되 최종 처방 문구는 게이트 통과 반영. (Lens 계산에 타 Lens 상태 직접 주입은 독립성·테스트 경계 흐려 미채택.)
- → 권위: `.harness/project/domain-rules.md`.

## 2026-06-02 - 추세 종합 판단 클릭은 렌즈 선택만 수행
- 문제: 종합 판단 항목 클릭 시 해당 Lens를 선택한 뒤 `scrollIntoView({ block: 'start' })`로 Lens 상세까지 강제 이동하면서 모바일 화면 위치가 튀거나 사용자가 현재 맥락을 잃는 회귀가 생겼다.
- 결정: 종합 판단 항목 클릭은 관련 Lens 탭 선택만 수행한다. Lens 상세 영역으로의 강제 자동 스크롤은 제거하고, 버튼 기본 브라우저 스타일 영향은 CSS에서 명시적으로 차단한다.
- 선택 이유: 종합 판단 카드와 Lens 탭은 상하로 인접해 있어 선택 변경만으로도 연결성이 유지된다. 자동 스크롤은 모바일 WebView와 root tab pager 맥락에서 화면 위치를 예측하기 어렵게 만든다.
- 적용 범위: `src/pages/trends/TrendsPage.vue`, `src/app/styles.css`.

## 2026-06-02 - 브릿지 체크는 UX 차단, 서버 앱 세션은 보안 경계
- 문제: GitHub Pages 공개 프론트에서 `window.webkit`/`NativeBridge` 존재 여부만 확인하면 사용자가 브라우저 개발자도구나 스크립트로 bridge 모양을 흉내내 서버 기능을 호출할 수 있다.
- 결정: 프론트 bridge 체크는 일반 브라우저 UX 차단으로만 유지한다. AI 코칭처럼 OpenAI 비용과 사용자 러닝 데이터 접근이 있는 Edge Function은 사용자 인증 뒤 `app-session` Edge Function이 발급한 짧은 수명의 서버 앱 세션, 승인 사용자 allowlist, 함수별 rate limit을 추가로 검증한다.
- 구현 기준: MVP 임시 운영은 `APP_SECURITY_MODE=allowlist`로 둔다. 서버는 승인된 로그인 사용자에게만 HMAC 서명 앱 세션을 발급하고, `coach-run`은 앱 세션과 rate limit을 통과해야 OpenAI 호출을 수행한다. 무료 Apple 계정(Personal Team)이라 DeviceCheck/App Attest key 미발급 → allowlist 모드는 deviceToken 없이 통과하므로 iOS 네이티브 변경 불필요. 유료 전환 시 `APP_SECURITY_MODE=devicecheck`로 바꾸고 네이티브 `runContextAppSecurity` 브리지만 추가(서버 `verifyDeviceCheckToken` 경로는 구현됨). App Attest는 미구현 시 501.
- 배포 순서 주의: `coach-run`이 `x-pacelab-app-session` 검증을 강제하므로 프론트 배포 전에 (1) Supabase secret(`APP_SESSION_HMAC_SECRET`, `APP_SECURITY_MODE=allowlist`, `PACELAB_ALLOWED_EMAILS`, `COACH_RUN_RATE_LIMIT_PER_HOUR`), (2) `app_sessions`/`edge_function_rate_limits` 마이그레이션, (3) `app-session`·`coach-run` 배포가 선행돼야 한다. 순서가 어긋나면 모든 사용자의 AI 코칭이 403/500으로 끊긴다.
- → 권위: `.harness/project/architecture-rules.md`, `config-contract.md`, `github-pages-supabase-playbook.md`. 신규: `supabase/functions/app-session/index.ts`, `src/shared/api/appSecurity.ts`.

## 2026-06-04 - Edge Function 인증/토큰 변경은 배포 후 실제 흐름 스모크가 완료 조건
- 결정: Edge Function의 인증·세션·토큰·rate limit 같은 보안 경계를 추가/변경하면 타입체크·빌드·단위 테스트만으로 완료로 보지 않는다. 배포 후 승인 사용자 로그인 상태에서 실제 코칭 1회(보호 대상 호출 1회) 스모크를 완료 조건에 포함한다(캐시된 옛 토큰은 비운 뒤). 정적 검사는 토큰 직렬화/서명/구분자 충돌·런타임 비동기 폴백 버그를 잡지 못함(#93 배포 후 연속 차단: 동기 throw로 폴백 무력화 + `expiresAt` 밀리초 `.`가 토큰 `split('.')` 조각 수를 넘겨 전부 403. PR #156/#158).
- → 권위: `.harness/project/workflow-rules.md` 검증 규칙, `.claude` memory `edge-auth-deploy-smoke`.

## 2026-06-04 - 심박존·템포/이지/회복 상한을 개인 심박 기준으로 공식 파생 (#123→#127, 165 상수 전역 제거)
- 배경: 템포 상한 165와 Z0~Z5 존이 개발자 개인값으로 4곳(`heartRateZones`·`coach-run`·`performanceProjection`·`trendInsights`)에 하드코딩, 개인 심박 입력·환산 경로 부재(#123 조사). 165는 2달 전 ChatGPT 개인값이라 "코드 어디에도 상수 금지" 요구.
- 결정(최종): 165/145/130 상수를 코드 전역에서 제거하고 존 경계를 anchor(LTHR)의 %LTHR 비율로만 정의(Z1 0.79·Z2 0.88·Z3 0.94·Z4 1.0). anchor 우선순위 manual=LTHR>측정 HRmax, auto=max(Tanaka 208−0.7×나이 추정, 누적 RunLog 관측 최대심박)×0.9(표본 3개↑·4개↑면 최고 1개 제외, 올리는 방향만 보정). `AthleteProfile.heartRateMode:'auto'|'manual'`. 근거 전무 시 상한 null(165 fallback 없음)→페이스/RPE/드리프트 평가+입력 권유. UI에 현재/추천값·source·산출식·외부 근거 링크(Tanaka PMID 11153730, Joe Friel LTHR, ASICS).
- 후속(잔재 정리, #127 후속): 저장 처방/루틴은 `training_memory.memory` 단일 JSON upsert(이력 없음·항상 최신본)라 stale 165 텍스트를 load 시 `stripStaleHeartRateCeilings`로 일반 표현 치환(웹 normalize + coach-run sanitize). coach-run은 심박 숫자를 항상 heartRateModel만 단일 출처로 사용. coach_reports append 이력은 불변(새 턴부터 정합).
- 안전: Tanaka/나이 추정은 보수 신호로만, 레벨·나이로 안전 상한 안 낮춤, 의료 단정 금지.
- → 권위: `.harness/project/domain-rules.md`. 단계별 전문(#127 구현/v2/후속) → `decision-log-2026H1.md`. 페이스/VO2max 미러는 `.claude` memory `vo2max-vdot-pace-model`.

## 2026-06-05 - 하네스 base v0.2.53 적용 (worktree silent-skip 상류 수정 반영, Issue #194)
- 적용: `npm run harness:update -- --base-only`로 base 0.2.52 → 0.2.53. stack 0.1.32 최신(무변경). worktree에서 hook `harness:check`가 추적 상태(`profile.json` activeStack + 커밋된 `.harness/stacks/.applied/<stack>/manifest.json` 스냅샷)로 적용 여부를 derive해 lint/test/build를 **실제 실행**(`Stack applied state derived from tracked snapshot` 출력) — 과거 silent-skip 결함 종료. 본체 결함 전문 → `decision-log-2026H1.md`.
- 표준 계층 결정: 이 업데이트가 base-managed `CLAUDE.md`/`AGENTS.md`의 인라인 PaceLAB 전용 문구를 generic base로 되돌렸으나, 권위 규칙은 `.harness/project/workflow-rules.md`·`commit-push-rules.md`에 보존돼 동작 손실 없음. 재인라인하지 않고 generic base 수용 — 프로젝트 전용 규칙 단일 출처는 `.harness/project/*`(엔트리 인라인은 base 업데이트마다 덮여 drift 재발). surface는 UserPromptSubmit hook이 매 요청 주입해 유지.
- 주의: fresh worktree는 `node_modules` 없으면 검증이 실제 실행돼 `vitest: command not found`로 실패 → `npm ci` 선행 필수(하네스 문제 아님).

## 2026-06-05 - 하단 네비 스와이프 탭: 스크롤 모델 + iOS 제스처 계약 (#196·#198·#200·#204·#206·#208·#210·#212 완료처리)
- 배경: 하단 4탭(요약/기록/추세/기억)은 App.vue가 4페이지를 한 트랙에 동시 마운트해 좌우 스와이프로 전환. 번들 다이어트 + iOS 스와이프 불안정(세로 끌림·mid-drag 네비·sticky 잔상) 해결에 8개 이슈·연쇄 회귀가 있었어 핵심 계약을 고정한다. (2026-06-02 root swipe 개별 결정 2건은 이 계약으로 통합·아카이브.)
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
- 적용: `src/app/App.vue`(arbiter·지연로드·commit 이벤트), `src/app/styles.css`(is-tab-home·panel), `src/shared/ui/AppShell.vue`(is-tab-home), `src/pages/run-log/RunLogPage.vue`(capture scroll·sticky 이벤트). `.claude` memory `tab-swipe-pager-contract`.

## 2026-06-05 - 날씨 도메인 러너 중심 재설계: 기상청 교체·Edge 프록시 (Issue #219)
- 배경: Open-Meteo(글로벌)는 국내 정확도가 약하고 로드 실패가 잦음. 국내 정확도 높은 기상청 단기예보(VilageFcstInfoService_2.0)로 교체.
- 결정:
  - **출처 교체 + 프록시**: 운영 기본을 기상청으로 교체. serviceKey가 `VITE_WEATHER_*`(프론트 노출, config-contract 위반)였던 문제를 Edge Function `weather-run`에서 `KMA_SERVICE_KEY_DEC/ENC` 서버 secret으로 옮겨 해결. Edge가 격자 룩업·디코딩·발표시각 캐시·rate limit·app-session 검증을 담당(coach-run 패턴).
  - **좌표→격자**: Lambert 변환식 대신 행정동↔격자 룩업표(`grid.json`, 3834행) 최근접 매칭. 역매핑으로 동네명 라벨 동시 제공.
  - **체감온도 계절분기 자체 산출**: 기상청 미제공 → 여름 열지수(Stull 습구)/겨울 풍속냉각/중간 기온. 웹 `runningWeather.ts` ↔ Edge `weather-run` **미러 유지**(pace/HR 모델과 동일 패턴).
  - **일출/일몰**: 외부 API 없이 위경도 천문계산(`sunTimes.ts`, NOAA solar-noon).
  - **시점 전환**: 3일 스냅샷 한 번 받고 클라이언트 날짜 필터(추가 호출 없음). 3일 초과는 "예보 범위 밖" 안내(중기예보 미사용).
  - **복장 추천**: 러닝 체감온도 5℃ 단위 10버킷(≤−10~≥30) + 강수·강풍 가점. 규칙기반(오프라인).
  - **공유 인증 모듈**: `_shared/appSession.ts` 신설(weather-run 사용). coach-run(critical)은 인라인 유지해 risk 격리.
  - **Open-Meteo 보존**: 삭제하지 않고 Supabase 미설정/비로그인 개발 fallback으로만 유지.
- 미완 수동 단계(배포 전 필수): Supabase Edge secret `KMA_SERVICE_KEY_DEC/ENC` 설정 후 `weather-run` 배포. 배포 후 실제 위치 1회 스모크(인증/프록시 토큰 경로 포함) — `.claude` memory `edge-auth-deploy-smoke` 기준.
- → 권위: `.harness/project/architecture-rules.md`(날씨 계약), `domain-rules.md`(WeatherSnapshot·외부 시스템 계약), `config-contract.md`(KMA secret), `weatherkit-data-contract.md`, `.claude` memory `weather-runner-domain`.

## 2026-06-05 - 세션 파일 슬림 구조 채택 + 운영 규칙 단일 출처 고정
- 문제: `next-session-reminder.md`와 `active-context.md`가 `.harness/project/workflow-rules.md`의 "요청 단위 풀스택 창 운영" 규칙 본문을 거의 1:1로 복붙해 비대해졌다. 두 파일은 매 세션 SessionStart hook과 always-on 기준으로 로드되므로 중복이 매 세션 토큰을 두 번 먹고, 규칙 단일 출처가 무너진다.
- 결정: 두 파일은 **부트스트랩/핸드오프 계층**으로 한정한다. `next-session-reminder.md`=부팅 체크리스트, `active-context.md`=프로젝트 고정 사실+최신 상태+핸드오프. 운영 규칙 본문은 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 **단일 출처**로 가리키고 session 파일에 중복 기재하지 않는다.
- 계층 근거: `standards-layers.md` — 세션 운영 기준은 "기본 운영 기준" 층이라 프로젝트가 구체화 가능. 두 파일은 `install-manifest.json`의 `projectOwnedFiles`라 본체 업데이트가 내용을 보존.
- 후속: 슬림 유지 "원칙"은 본체로 승격 요청해 하네스 v0.2.54/0.2.55에 반영됨(축적형 기억 파일까지 확장). 본 2026-06-06 정리가 그 기준의 첫 전면 적용.

## 2026-06-07 - 가상레이싱(나와의 대결) 도메인 분류 + 구현 스펙 확정 (Issue #67 후속, #228~#233)
- 배경: #67 기획 위에 구현 계약을 얹으며 (a) 레이싱 타겟 모델, (b) 가상레이싱의 세션 데이터 분류를 확정해야 했다. 분류는 부상·추세·추천·코칭 4대 경로로 흐르므로 결정 단위로 고정한다.
- 타겟 모델 결정: 타겟은 "과거 RunLog 1건"이 아니라 **거리별 PB**(출발선부터 5km 단위 누적거리에 가장 빨리 도달한 기록). PB 산출·업적 등록 엔진은 **#181 업적 도메인이 소유**(#228), `나와의 대결`은 소비만. PB 런의 곡선이 고스트 입력.
- PB 사다리 분리 결정: 업적 PB는 **훈련간 PB / 레이싱간 PB를 상호 배타로 분리**한다. 분리 키 = `RunLog.tags`의 'self-race' 포함 여부(#233 태깅의 이중 목적 — 식별 + PB 분리). 레이싱 PB가 훈련 PB 사다리를 오염시키지 않게 partition 후 각각 min. 타겟 선택(#232)은 두 사다리 모두 노출. `DistancePb`에 `context:'training'|'race'` 추가.
- 분류 결정(핵심): **가상레이싱 = 훈련 분류와 직교하는 경쟁 도메인의 "수행 모드 + 결과 주석". 별도 RunType도 별도 활동도 아니다.**
  - 근거: `type:'Race'`는 Riegel 예측(`performanceProjection.ts:303,312`)·회복 비용·테이퍼·하드세션 부하(`ruleBasedCoach.ts:208,388`, `runStats.ts:164`, `trendInsights.ts:118`)에 직접 투입되는 무거운 신호. 가상레이싱(쉬운 날 PB 추격 포함)을 'Race'로 강제하면 이 경로가 오염된다. 또 별도 "레이싱 활동"을 만들면 HealthKit→RunLog 정본과 거리·부하가 **이중계산**된다.
  - 처리: 정본 활동 = HealthKit→RunLog(`type`은 `inferRunType` 판정, 불변) + `tags += 'self-race'` 경량 태그. 레이싱 결과 = 경량 `competition_result{mode:'self-pb',targetPb,racedDistanceM,resultGapSec,outcome,linkedRunId,racedAt}` (종료 후 import된 RunLog와 시간·거리 근접 매칭). competition_result는 볼륨·부하·추세 집계 **미포함**(업적·동기부여·코칭 인용 전용).
- 선행 갭(불변): PaceLAB는 라이브 인-런 데이터를 안 받음 → iOS 라이브 트래킹(#229)이 1순위 선행. 브리지 2종 신설(`runContextLiveRun`, `runContextSpeech`)은 기존 healthKit 브리지 패턴 확장.
- 착수 게이트: PoC②(metricSamples 밀도로 고스트 생성 가능성, #228 — 코드 없이 가장 싸게 검증)를 **최우선**. PoC①(iOS 백그라운드 위치+오디오 60분+ 안정성, #229) 막히면 Watch 우선순위 상승.
- child 분해: #228(PB·업적, Ready/P2/최우선) #229(iOS 라이브, 선행) #230(고스트 엔진, 틱 모킹 선개발) #231(음성) #232(UI — 와이어프레임·glossary 게이트) #233(결과 분류·링크).
- → 권위: `.harness/project/competition-domain.md` §9·§10에 구현 스펙·분류 반영. UI 착수는 와이어프레임 합의 후(design-before-implementation), 사용자 노출 용어는 /glossary 동반 갱신.
