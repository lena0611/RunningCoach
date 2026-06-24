# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 **부트스트랩 메모**입니다.
운영 규칙 본문은 여기서 중복하지 않습니다. 최신 기준은 `active-context.md`,
`project-memory.md`, `.harness/project/workflow-rules.md`, `decision-log.md`를 우선합니다.
> 상세 인수인계가 있으면 프로젝트 루트 `HANDOFF.md`를 먼저 본다.

## ⭐ 현재 위치 (2026-06-25) — 감별진단 KB §5 Phase C·E 출하 = §5 전부(A+B+C+D+E) 완료
- **이번 세션 완료(PR #520 머지·트리검증, Issue #519):** 감별진단 KB Phase C — 부상 "왜 아픈지" 좁히는 **능동 코치 모먼트 grill(1문항)**.
  - 앱 열 때 세션당 1문항(`injuryProbes[8]`, §1 결정적 지문 1:1) → `probeAnswers` 누적 → 아형 해소(`subtypeResolved`→가능성 라벨 "…(부착부)") + red-flag 자가검사(`redFlagSelfTest` **배열** → `evaluateRedFlags` 게이트).
  - 모델은 `probeAnswers?`/`subtypeResolved?`만 적재(나머지 dead field 여전히 미적재). 신규 RedFlagSignals `weightBearingFailureOrInstability`(파열·잠김·근위파열 전용, 억지매핑 회피).
  - **경계 래칫 #397**: `coachMoments`(shared) entities import 안 함 → 페이지가 `selectNextProbe` precompute → `ctx.painProbe` plain 주입. **한 세션 1문항** = 부상 id 변경 시만 스냅샷(probeAnswers 변화 비반응, 자동전진 X).
  - **#전문코치리뷰 4렌즈 적대검증 PASS(must-fix 0)**. should-fix 5건 반영(정강이 구획증후군 변별·햄스트링 골+신경 이중·'영상검사'→'전문가 평가'·ACWR 평이화·동시쓰기 가드). 787 unit+vue-tsc+harness:check. 라이브 스모크(실계정 비파괴·원복): 휴식 중 렌더·실클릭 누적/응답/자동전진無·redFlag→의뢰힌트 플립.
  - **(직전) Phase E 한 줄 힌트(PR #518)**: 대시보드 "🔎 가능성 {가설}·조절 {레버}"(redFlag면 "⚠ 전문가 평가").
  - **§5 감별진단 KB = A+B+C+D+E 전부 출하 완료.** 후속(증분2, 별도): 다축 누적·답변 rank 재가중, monitoring severity/recency 게이트, 재발 에피소드 스코프화, 지면/페이스 신호. [[injury-focus-week-2026-06-24]] [[rri-risk-factor-evidence-2026-06]].
- 머지=squash 후 `git diff --quiet origin/main <tip>` 트리검증(--quiet=exit-code 의미있음). 훅 미설치 클론이면 커밋 전 `npm run harness:check` 직접.

## (이전) ⭐ 현재 위치 (2026-06-24 추가) — 보류 (나) Trends E2E 마무리 + #473 클로즈 확인 (PR #513 머지)
- **이번 턴 완료(머지·트리검증):**
  - **(나) Trends 렌즈 stackpage E2E 수정 (PR #513)**: `goto('/trends')`→`goto('/#/trends')`(해시) **+ lens 행 `.click()`→`domClick`**(좌표 클릭 간섭, 다른 stackpage 테스트와 동일 패턴). goto 이슈에 가려 lens 클릭이 검증된 적 없어 두 번째 버그가 안 드러났던 것 — 라이브 QA로 포착. **안전 비파괴 배치 7개(stackpage 3 + session-detail 4) green**, harness:check 통과. 상세 [[auth-e2e-account-state-and-seed-safety]].
  - **#473 클로즈 확인 = task 정리 완료**: 이미 CLOSED(오늘 01:29), 후속 #501·#502 둘 다 CLOSED, PR #503·#504·#505 전부 MERGED. 열린 Phase 3(풀 휴식모드) 추적 이슈 없음(연기). 잔여 없음.
  - **세션 재생성 OTP 불요 교훈**: qa-storage 만료 시 **라이브 chrome 브라우저(:5175)부터 확인** — 살아 있으면(리프레시 토큰 회전으로 갱신 중, 그게 qa-storage 만료의 근본 원인) 그 localStorage 추출로 OTP 없이 재생성. 이번에도 OTP 불요였음.
- **여전히 보류((가) 나머지 = 6/29 이후):** `rest-return` ×2 + stackpage '다음 훈련' — 부상 휴식(**6/29까지**) 자연 해소 후 **비-휴식 계정에서 조작 0**으로 검증(rest-return은 휴식 변경=파괴적, 휴식 중 금지).

## (이전) ⭐ 현재 위치 (2026-06-24 종료) — 렌더 E2E 커버리지 확장 + 인증 E2E 견고화/시드 안전화 (PR #510·#511 머지)
- **이번 세션 완료(머지·트리검증):**
  - **walk-run 렌더 E2E #501 후속 (PR #510)**: `seedWalkRunReturn`(in-memory·persist 안 함·**인증 불필요**) + `e2e/walk-run-return.spec.ts`. 라우트 스모크 config(`playwright.config.ts`, Supabase OFF·`VITE_E2E_ROUTE_SMOKE`)에서 작전 카드의 걷기-뛰기 5단계 사다리·통증정지·redFlag·severity3 의뢰 렌더 DOM 단언. #501은 그동안 buildSessionBriefing 직접호출로만 검증됐던 렌더 공백을 메움. 인증 불요 스펙(app-smoke·walk-run-return)=기본 config, 인증 필요 스펙=rest config로 testMatch 분리.
  - **인증 E2E 견고화 + 시드 안전화 (PR #511)**: ① 활성 부상 시 뜨는 App 레벨 '부상 상태 체크인' 모달이 클릭을 가로채던 것 → `addInitScript`로 dismiss 플래그(`pacelab.injuryCheckIn.dismissed.*`) 항상-dismissed 억제(비파괴). ② **🚨 `seedReturnRamp`가 `goals:[raceGoal]`로 실 목표를 통째 덮어쓰는 파괴적 시드 → 인증된 실계정에서 돌자 사용자 실 목표 소실 → localStorage 원본 스냅샷으로 복구 완료(손실 0)**. 비파괴화(실 목표 보존)+복구 유틸 `restoreMemoryFromLocalSnapshot` 추가. 상세 [[auth-e2e-account-state-and-seed-safety]].
  - ✅ **검증**: `session-detail-overlay` 4/4, `stackpage-275` 2/4 통과(rest config). 나머지 2(stackpage '다음 훈련'=활성 휴식이 히어로 숨김·'Trends 렌즈'=`goto('/trends')` 해시라우팅 기존 이슈)+`rest-return`은 **계정 상태로 보류, 회귀 아님**.
  - **인증 복구**: QA 계정(lena0611@gmail.com) 세션 만료→앱 **OTP 재로그인**(사용자에게 코드 요청)→로그인된 chrome 브라우저 localStorage 추출로 `qa-storage.json` 재생성. ⚠ 토큰 회전으로 **또 만료될 수 있음** → 다음 인증 E2E 전 재로그인 필요할 수 있음.
- **보류(새 세션에서 진행):**
  - **(가) 나머지 인증 E2E 검증** — `rest-return`(2개)+stackpage 2건. 전제: 계정이 **비-휴식**일 때(부상 휴식 **6/29까지** → 이후 자연 해소) 또는 휴식 capture+restore. `rest-return`은 휴식을 변경하므로 휴식 중 실계정엔 capture+restore 없이 금지. + 인증 세션 만료 시 OTP 재로그인.
  - **(나) Trends goto 수정** — `e2e/stackpage-275.spec.ts`의 `goto('/trends')`→`goto('/#/trends')` 한 줄(해시라우팅). 안전·비파괴.

## (이전) ⭐ 현재 위치 (2026-06-24 후반) — #473 후속 2건(walk-run·coach-run 휴식) + 세션상세 App레벨 출하, #275·#473 클로즈
- **이번 턴 완료(전부 머지·트리검증, 코드 출하):**
  - **#275 CLOSE, #473 CLOSE.** (a)(b)를 #473에서 후속 분리 → 새 이슈 #501·#502 생성·구현·머지.
  - **(a) 부상 복귀 walk-run #501 (PR #503)**: `walkRunReturn.ts` — 게이트 active+sev≥2(급성 통증성만), 저강도 연속 세션을 P1~P5 사다리+통증정지로(제시형, 자동진행 아님), redFlag escape hatch 상시. 적대 코치검증 반영. [[rest-and-return-coaching]].
  - **(b) coach-run 휴식 인지 #502 (PR #504 + Edge 배포)**: restState client-summary 주입→채팅 코치가 휴식 중 처방 닦달 안 함. 후방호환.
  - **(d) 세션상세 App 레벨 오버레이 (PR #505, #275 후속)**: `sessionDetailStore`+`SessionDetailOverlay`(상세+편집+삭제), 대시보드/기록 중복·편집삭제 라우팅 제거, 딥링크 store화, z 880. 코치 패턴 미러. [[stacks-app-level-independence]].
  - ✅ **3건 라이브 검증 완료(chrome-devtools, 테스트 계정 5175 세션)**: (d) Playwright 4/4 통과(PR #506, `e2e/session-detail-overlay.spec.ts`) + z 880/882/900 확인, (a) 실행 번들 buildSessionBriefing 직접 호출로 walk-run 산출 확인, (b) 휴식 중 실제 코칭 1회=닦달 없이 복귀일(6/30) 인용. OTP 불필요였음(브라우저 기로그인→localStorage 추출로 qa-storage 재생성, origin 5175).

## (이전) ⭐ 현재 위치 (2026-06-24) — UI 스택 시스템 정리(#275 공통화·코치 App레벨 오버레이·바텀시트) 10개 PR 머지·라이브
- **이번 세션 완료(PR#490~#499, 전부 머지·배포·트리검증):**
  - **#275 스택 공통화**: 중복 스택 마크업을 공유 `src/shared/ui/StackPage.vue`로 추출, 전 화면 마이그레이션(#490·#491). 함정=자동 import 없음→컴포넌트 import 누락 시 build 통과·런타임 무음실패(리뷰로만 포착). 상세 [[stackpage-commonization-275]].
  - **스택 등장 애니메이션 규칙 정렬**(#492·#493·#494): 진입/첫 스택=밑→위(rise)+우상단 X, 전진 드릴인=우→좌(push)+좌측 뒤로. `transition ?? (back ? 'push' : 'rise')`. 1차 등장 240→360ms 완화. 추세→세션은 드릴인(push).
  - **AI 코칭 App 레벨 독립 오버레이**(#496): 코치 뷰를 `src/features/coach-session/CoachSessionOverlay.vue` + `coachStore`로 추출, App.vue가 탭 페이저 밖에서 항상 렌더 → 어느 탭에서 열든 그 탭 위에 뜨고 닫으면 그 탭(스크롤 보존)로 복귀. **사용자 결정=비-탭 스택은 전부 App 레벨 독립**. z 함정 `--z-coach:900`. 상세 [[stacks-app-level-independence]].
  - **부수 수정**: 부팅 스플래시 무한 고착 방지 `cleanupLegacyWebCaches` 2초 가드(#495) · 매 부팅 '일정 다시 짰어요' 토스트 스팸 → 스케줄 재앵커 멱등화(persisted `scheduleAnchorWeeklyKm`, #497) · 상단 코치 모먼트 중복(부상 고지·지속 휴식 응원=전용 카드/배너와 중복) 제거(#498) · 훈련 단계 '진행 평가' 팝업을 표준 바텀시트로(ad-hoc 모달 제거, #499).
  - **#499 CTA 동작 확인(코드 변경 없음)**: 진행평가 바텀시트 하단 CTA는 `v-if="shouldTransition"` — 전환 제안 있을 때만 `닫기`+`전환` 노출(평상시 숨김). 사용자 "그대로 둬" 결정. DEV 임시 훅으로 'Race Specific+레이스≤2주' 상태 라이브 재현→CTA 정상 렌더 확인 후 훅 되돌림.
  - ⚠ **연속 배포 금지 교훈**: 짧은 시간 다중 배포는 WKWebView 청크 캐시 stale로 앱 스플래시 고착 유발. 배포 간격 두기.
- **남은 iOS 후속(직전 세션, 미해결)**: 가짜 '새 러닝 감지' 배너는 제거됨(PR#488 머지·기기검증). 다음 = **워치 차고 실제 1회 뛰어 집 동기화 시 '제때 1번' 알림 오나** 확인(iOS 백그라운드 깨움 의존, 워치 실주행 필요). 미수신/잔존 오탐이면 "진짜 새 워크아웃 endDate 게이트". [[healthkit-detected-notify-gate]].
- **#473 휴식·복귀(직전 세션) Phase 1·2 코어 완료·라이브**: rested 닦달 차단·💤 배너·코치 보이스·복귀 램프(현재 체력 재앵커+초반 Easy·거리캡). 인증 E2E 검증 완료. **후속(미착수)**: (a) 부상 복귀 walk-run 점진 처방(reason-blind 거리램프=공백, injury KB §3-B), (b) coach-run LLM 휴식 인지(채팅 닦달 구멍), (c) #473 이슈 클로즈 정리. 상세 [[rest-and-return-coaching]].
- 🧪 **자율 QA 인프라(재사용)**: 테스트 계정(lena0611+qa) 저장 세션 + Playwright 인증 E2E + DEV 시드 훅(`window.__pacelabE2E`, `src/app/devE2ESeed.ts`). 실행 `npx playwright test --config playwright.rest.config.ts`. 규칙=CLAUDE.md "검증·보고 방식"·[[agent-verifies-via-local-qa]].
- ⚠ **머지 규칙**: squash 후 `git diff <tip> origin/main` 빈결과 트리 검증 필수(#463 24→11 누락 사고), 의심 시 `--merge`. [[pr-squash-merge-race-verify-tree]].

## 다음 1순위
0. ✅ **감별진단 KB §5 = A+B+C+D+E 전부 출하 완료** — Phase A+B+D(#516)·E(#518)·**C grill 능동 모먼트(#520, 이번 세션)**. 남은 건 **증분2(별도, 미착수)**: 다축 누적·답변 기반 rank 재가중, monitoring severity/recency 게이트, 재발 에피소드 스코프화, 지면/페이스 데이터 신호(신뢰 베이스라인 확보 시). [[injury-focus-week-2026-06-24]]
0b. **(가) 인증 E2E 나머지 = 6/29 이후**: 부상 휴식 자연 해소 후 비-휴식 계정에서 `rest-return` ×2 + stackpage '다음 훈련'을 **조작 0**으로 검증. 세션 만료면 라이브 chrome(:5175) localStorage 추출(OTP 불요) 우선, 죽었으면 OTP. [[auth-e2e-account-state-and-seed-safety]]
1. **iOS '새 러닝 감지' 실주행 확인** — 가짜 배너는 제거됨(PR#488). 다음 = 워치 차고 실제 1회 뛰어 집 동기화 시 '제때 1번' 알림 오나 확인(워치 실주행 필요). 미수신/잔존 오탐이면 "진짜 새 워크아웃 endDate 게이트". [[healthkit-detected-notify-gate]].
2. ✅ **#473 완전 종료** — 이슈 CLOSED, 후속 #501·#502 CLOSED, PR #503·#504·#505 MERGED. Phase 3(풀 휴식모드)는 추적 이슈 없이 연기됨(필요 시 신규 이슈로). [[rest-and-return-coaching]].
3. **스택 후속(같은 패턴 적용 대상)** — 세션상세 자체를 App 레벨 단일화(대시보드/기록 중복) + 편집/삭제 라우팅 제거(코치 오버레이와 동일 패턴). 코치 detail footer 라벨은 정적 "AI 코칭"으로 단순화됨 → 필요 시 store에 hasThread 노출로 "이어가기/받기" 복원. [[stacks-app-level-independence]].
4. **실기기 시각 스팟체크** — #462 강한 확인 오버레이 + #455 더블 카드 + 동적 gap 바(자연 발생 시, 위험 낮음).
5. **#454 나머지 플로우 실렌더 스팟체크** — 주 페이징·다른날로/스왑·포기 잔존·주말 트리아지. 통과면 에픽 #362 마무리.
6. **#359**(롱런 네거티브 스플릿) 토 LSD 스모크 · **#307** 인터뷰 스모크 · **#374** 주기화·개러지 실기기.
7. **grill 설계 백로그 정리** — 게이트 이슈(#260·#397·#411/#398/#408/#279/#375)·메모리-only 비전 → `needs:design-grill` 라벨/메모리 통합.
8. (이슈 미등록) 네이티브 fast-segment 임계 5:45→5:50 튜닝(수동 Xcode).

## 먼저 확인할 것
1. `git --no-pager status --short`
2. `. "$HOME/.nvm/nvm.sh" && nvm use` — npm/tsc/build/test/harness는 새 shell마다 다시.
3. `node_modules` 없으면 `npm ci`.
4. `.harness/session/active-context.md` (+ 있으면 루트 `HANDOFF.md`)
5. `.harness/session/developer-input-queue.md`

## 세션 시작 시 기억할 것 (상세 규칙은 기준 문서)
- 작업 설명 있으면 `npm run harness:context -- "<설명>"`로 읽을 기준 좁히기.
- **코칭 동작/지식 작업은 코드 전에 코치 SSOT(`running-coaching-standards`/`running-injury-knowledge`) 선독 → 배치 시 그릴 → 커밋 시 `Coach-Review` 게이트.** (`.harness/project/professional-coach-review-trigger.md`)
- Issue URL/번호 있으면 구현 전 Issue 본문/labels/Project 조회. 없으면 제목/목표/범위/완료조건으로 구체화 후 기존 Issue 검색·재사용 판단.
- 완료 승인 전 build/test/harness:check/배포/commit/push 금지(MVP 예외 흐름은 `workflow-rules.md`). `main` 직접 commit/push는 hook 차단.
- 긴 대화창을 마칠 때는 **이 파일과 `active-context.md`를 현재 상태로 갱신**(낡은 항목 제거). 상세는 루트 `HANDOFF.md`, 장기 지식은 메모리.
