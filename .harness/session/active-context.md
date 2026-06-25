# 현재 컨텍스트

이 프로젝트의 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.
운영 규칙 본문은 여기서 중복하지 않고 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 가리킵니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.
> 상세 인수인계는 (있으면) 프로젝트 루트 `HANDOFF.md`. 장기 지식은 에이전트 메모리.

## ⭐ 현재 작업 — 감별진단 KB §5 Phase C(능동 코치 모먼트 grill) 출하 = §5 전부 완료 (2026-06-25, PR #520 머지, Issue #519)
- **출하 완료(트리검증·787 unit+vue-tsc+harness:check·#전문코치리뷰 4렌즈 PASS(must-fix 0)·라이브 스모크):** 앱 열 때 세션당 **1문항**(`injuryProbes[8]`, §1 결정적 지문 1:1) → `probeAnswers` 누적 → 아형 해소(`subtypeResolved`→가능성 라벨 "…(부착부)") + red-flag 자가검사(`redFlagSelfTest` 배열→`evaluateRedFlags` 게이트). 신규 RedFlagSignals `weightBearingFailureOrInstability`(파열·잠김·근위파열 전용).
- **핵심 결정:** ① 경계 래칫 #397 — `coachMoments`(shared) entities import 안 함, 페이지가 `selectNextProbe` precompute→`ctx.painProbe` plain 주입 ② **한 세션 1문항** = 부상 id 변경 시만 스냅샷(probeAnswers 비반응→자동전진 X) ③ 모델은 `probeAnswers?`/`subtypeResolved?`만 적재(나머지 dead 미적재) ④ should-fix 5건 반영(정강이 구획증후군·햄스트링 골+신경 이중·'영상검사'→'전문가 평가'·ACWR 평이화·동시쓰기 가드).
- 라이브 스모크(실계정 비파괴·원복): 휴식 중 프로브 렌더·실클릭 누적/응답/자동전진無·redFlag→의뢰힌트 플립.
- **증분2 part1 — 답변 기반 랭킹 재가중 출하(PR #523, 트리검증·#전문코치리뷰 2렌즈 SHIP·라이브):** `rankInjuryHypotheses`가 `probeAnswers`의 `favors`에 `PROBE_FAVOR_BOOST`(1.5) **가산**(× 아닌 +, comorbid 점수 보존→top-2 동반표시) → 물어본 답이 상위 "가능성"을 좁힘(햄스트링 sprint-pop→PHT에서 좌상으로). favors=overuse 한정이라 redFlag 우선(§4) 보존. SSOT §2-B 문구를 실제 가산 모델로 정정. **남은 should-fix(비차단)=옵션별 likelihood 그라데이션 → #522**(flat 1.5라 pathognomonic↔약한 답 동일가중; per-option 모델 확장 필요).
- **§5 = A+B(#516)+C(#520)+D(#516)+E(#518)+증분2재가중(#523) 출하.** 남은 후속: #522(likelihood 그라데이션)·monitoring/재발 게이트·지면/페이스 신호. [[injury-focus-week-2026-06-24]] [[rri-risk-factor-evidence-2026-06]].

## (이전) ⭐ 현재 작업 — 보류 (나) Trends E2E 마무리 + #473 클로즈 확인 (2026-06-24 추가, PR #513 머지)
- **(나) Trends 렌즈 stackpage E2E 수정 (PR #513)**: `goto('/trends')`→`goto('/#/trends')`(해시) **+ lens 행 `.click()`→`domClick`**(좌표 클릭 간섭). goto 이슈에 가려 lens 클릭이 검증된 적 없어 안 드러났던 두 번째 버그 — 라이브 QA로 포착. 안전 비파괴 배치 7개(stackpage 3 + session-detail 4) green, harness:check 통과.
- **세션 재생성 OTP 불요**: 라이브 chrome 브라우저(:5175)가 살아 있으면 그 localStorage 추출로 OTP 없이 qa-storage 재생성(리프레시 토큰 회전이 qa-storage 만료의 근본 원인). 이번 OTP 불요.
- **#473 완전 종료**: 이슈·후속(#501·#502) CLOSED, PR #503·#504·#505 MERGED. Phase 3만 추적 이슈 없이 연기.
- **남은 (가) = 6/29 이후**: 부상 휴식 자연 해소 후 비-휴식 계정에서 `rest-return` ×2 + stackpage '다음 훈련'을 조작 0으로 검증. [[auth-e2e-account-state-and-seed-safety]]

## (이전) ⭐ 현재 작업 — 렌더 E2E 커버리지 확장 + 인증 E2E 견고화·시드 안전화 (2026-06-24 종료, PR #510·#511 머지)
- **walk-run 렌더 E2E #501 후속 (PR #510)**: `seedWalkRunReturn`(in-memory·인증 불필요) + `e2e/walk-run-return.spec.ts` — 라우트 스모크 config(Supabase OFF)에서 작전 카드 걷기-뛰기 사다리 렌더 단언. 인증 불요/필요 스펙 testMatch 분리.
- **인증 E2E 견고화·시드 안전화 (PR #511)**: 부상 체크인 모달 addInitScript 억제(비파괴) + **seedReturnRamp 비파괴화**(실 목표 보존). 🚨 검증 중 seedReturnRamp가 실계정 목표를 덮어쓴 사고 발생 → localStorage 원본으로 복구 완료(손실 0), `restoreMemoryFromLocalSnapshot` 유틸 추가. 검증=session-detail 4/4·stackpage 2/4. 상세 [[auth-e2e-account-state-and-seed-safety]].
- **인증 복구**: QA 계정 세션 만료→앱 OTP 재로그인→qa-storage 재생성. 토큰 회전으로 재만료 가능(다음 인증 E2E 전 재로그인 필요할 수 있음).
- **보류(새 세션)**: (가) rest-return+stackpage 2건 = 계정 비-휴식(부상 휴식 6/29까지)일 때 검증, (나) stackpage Trends `goto('/trends')`→`/#/trends` 수정.

## (이전) ⭐ 현재 작업 — #473 후속(walk-run·coach 휴식인지) + 세션상세 App레벨 + 코치 부상 스냅샷, 전부 출하·라이브검증 (2026-06-24 후반)
- **이번 세션(PR #503·#504·#505·#506·#508 머지, #275·#473·#501·#502·#507 클로즈, 전부 라이브 검증):**
  - **#275·#473 CLOSE.** (a)(b)를 #473에서 후속 분리 → #501·#502 신설·구현.
  - **(a) 부상 복귀 walk-run #501 (PR#503)**: `walkRunReturn.ts` — 게이트 active+sev≥2(급성 통증성만), 저강도 연속 세션을 P1~P5 사다리+통증정지로(제시형, 자동진행 아님), redFlag escape hatch 상시. 실행 번들 직접호출로 검증. [[rest-and-return-coaching]].
  - **(b) coach-run 휴식 인지 #502 (PR#504 + Edge 배포)**: restState client-summary 주입→휴식 중 처방 닦달 차단. 실코칭 1회 검증(복귀일 인용).
  - **(d) 세션상세 App 레벨 오버레이 #505 + 스모크 #506**: `sessionDetailStore`+`SessionDetailOverlay`(상세+편집+삭제), 중복·편집삭제 라우팅 제거, 딥링크 store화, z 880/882. Playwright 4/4. [[stacks-app-level-independence]].
  - **코치 부상 컨텍스트 스냅샷 #507 (PR#508 + 마이그+Edge 배포)**: `coach_reports.injury_context_snapshot` — 과거 코칭이 그때 부상 상태 충실 표시("🩹 당시 부상" 캡션). insert→select→done=DB저장 증명. [[coach-report-injury-snapshot]].
- ⚠ **배포**: 마이그 db push는 auto-mode 차단→사용자 `! supabase db push`. edge는 `--use-api`(Docker 불필요). 배포 순서=마이그→coach-run→웹.
- **(이전 세션) UI 스택 정리(PR#490~#499):**
  - **#275 스택 공통화**: 중복 스택 마크업을 공유 `src/shared/ui/StackPage.vue`로 추출, 전 화면 마이그레이션(#490·#491). 함정=자동 import 없음→누락 시 build 통과·런타임 무음실패. [[stackpage-commonization-275]].
  - **애니메이션 규칙 정렬**(#492~#494): 진입/첫 스택=밑→위(rise)+우상단 X, 전진 드릴인=우→좌(push)+좌측 뒤로(`transition ?? (back ? 'push' : 'rise')`), 1차 등장 240→360ms.
  - **AI 코칭 App 레벨 독립 오버레이**(#496): `CoachSessionOverlay.vue`+`coachStore`로 추출, App.vue 탭 페이저 밖 상시 렌더 → 어느 탭에서 열든 그 탭 위에 뜨고 닫으면 스크롤 보존 복귀. **사용자 결정=비-탭 스택 전부 App 레벨 독립**. z `--z-coach:900`. [[stacks-app-level-independence]].
  - **부수**: 스플래시 무한 고착 방지 캐시정리 2초 가드(#495)·재앵커 토스트 스팸→멱등화(#497)·상단 코치 모먼트 중복 제거(#498)·진행평가 팝업 표준 바텀시트화(#499). #499 CTA는 `v-if="shouldTransition"`(전환 제안 시만 노출) — 사용자 "그대로 둬", DEV 훅으로 라이브 재현 확인 후 원복(코드 무변).
  - ⚠ **연속 배포 금지**: 단시간 다중 배포 → WKWebView 청크 캐시 stale → 스플래시 고착. 배포 간격 둘 것.
- **남은 iOS 후속(직전 세션)**: 가짜 '새 러닝 감지' 배너 제거됨(PR#488). 다음=워치 실주행→집 동기화 시 '제때 1번' 알림 오나(워치 필요). [[healthkit-detected-notify-gate]].
- **#473 휴식·복귀 Phase 1·2·후속 전부 완료·라이브**: 닦달 차단·💤 배너·코치 보이스·복귀 램프 + (a) walk-run + (b) coach 휴식인지 출하, #473 CLOSE. 남은 건 Phase 3(풀 휴식모드)만. [[rest-and-return-coaching]].
- **🧪 자율 QA 인프라**: 테스트 계정(lena0611+qa) 저장 세션 + `playwright.rest.config.ts` + DEV 시드 훅(`window.__pacelabE2E`, `src/app/devE2ESeed.ts`). 규칙 [[agent-verifies-via-local-qa]].
- ⚠ **머지 규칙**: squash 후 `git diff <tip> origin/main` 빈결과 트리 검증 필수(#463 사고), 의심 시 `--merge`. [[pr-squash-merge-race-verify-tree]].
- **그 다음**: iOS '새 러닝 감지' 워치 실주행 확인(1순위) → 실기기 시각 스팟체크 → #359/#307/#374 스모크 → grill 설계 백로그(#260·#397·#398·#408·#411·#375·#279) → 코치 detail footer 동적 라벨 복원·walk-run UI 렌더 E2E(부상 시드 훅).

## 현재 상태
- updatedAt: 2026-06-25
- baseHarness / activeStack / harnessMode: `.harness/policy/profile.json` 참고
- 코칭 작업 시 `.harness/project/professional-coach-review-trigger.md` 강제(SSOT 선독→배치 시 그릴→커밋 게이트).

## 제품 구조 (고정 사실)
- 제품명 `PaceLAB`. GitHub Pages 정적 프론트 + Supabase Auth/Postgres/Edge Function + OpenAI + iOS WKWebView/HealthKit 하이브리드.
- **모노레포(#250, 2026-06-08)**: 웹(repo root `src/`)과 네이티브(`native/`)가 **단일 .git/origin**. 브리지 계약은 웹↔네이티브 원자적 동시 변경. 네이티브 빌드는 harness:check 밖(수동 Xcode). 상세 [[native-repo-git-management]].
- AI 코칭은 세션 상세에서 열며 별도 Coach 탭 없음.

## 운영 기준 (단일 출처 포인터)
- 요청 단위 풀스택 창 운영, 완료 책임 창, Issue/worktree/branch 분리, 완료 승인 전 build/test/배포/commit/push 게이트, `main` 직접 commit/push 차단(`HARNESS_ALLOW_MAIN_*` 예외) → `.harness/project/workflow-rules.md` + `CLAUDE.md` 단일 출처.
- PaceLAB MVP 단계는 구현/버그/운영을 배포 확인까지 자동 진행 후 완료 승인 대기.

## 확인할 일
- 새 대화의 작업 유형을 먼저 선언하고 `.harness/project/workflow-rules.md` 시작 문서 표를 좁혀 읽는다.
- Supabase Edge Function(`coach-run` 등) 변경은 배포가 별도 필요.
