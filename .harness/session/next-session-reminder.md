# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 **부트스트랩 메모**입니다.
운영 규칙 본문은 여기서 중복하지 않습니다. 최신 기준은 `active-context.md`,
`project-memory.md`, `.harness/project/workflow-rules.md`, `decision-log.md`를 우선합니다.
> 상세 인수인계가 있으면 프로젝트 루트 `HANDOFF.md`를 먼저 본다.

## ⭐ 현재 위치 (2026-06-24) — UI 스택 시스템 정리(#275 공통화·코치 App레벨 오버레이·바텀시트) 10개 PR 머지·라이브
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
1. **iOS '새 러닝 감지' 실주행 확인** — 가짜 배너는 제거됨(PR#488). 다음 = 워치 차고 실제 1회 뛰어 집 동기화 시 '제때 1번' 알림 오나 확인(워치 실주행 필요). 미수신/잔존 오탐이면 "진짜 새 워크아웃 endDate 게이트". [[healthkit-detected-notify-gate]].
2. **#473 마무리 판단 + 후속 택1** — Phase 1·2 코어 완료·검증·배포 끝. 후속: (a) 부상 복귀 walk-run 점진 처방, (b) coach-run LLM 휴식 인지, (c) #473 이슈 클로즈+(a)(b) 별도 후속 분리. [[rest-and-return-coaching]].
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
