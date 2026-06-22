# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 **부트스트랩 메모**입니다.
운영 규칙 본문은 여기서 중복하지 않습니다. 최신 기준은 `active-context.md`,
`project-memory.md`, `.harness/project/workflow-rules.md`, `decision-log.md`를 우선합니다.
> 상세 인수인계가 있으면 프로젝트 루트 `HANDOFF.md`를 먼저 본다.

## ⭐ 현재 위치 (2026-06-23) — 휴식/복귀 기능(#473) 설계·SSOT 적재 완료, Phase 1 구현 대기
- **#473 범용 휴식+복귀 코칭** 설계 확정(부상/장마/개인 일정 휴식·**기간 사용자 지정**·**닦달 차단**). 딥리서치(복귀 프로토콜, 적대검증)→SSOT 적재(PR#474: `running-coaching-standards.md §휴식과 복귀`·`running-injury-knowledge.md §3-B`). 이슈 #473 3단계(P1 MVP/P2 복귀램프/P3 에픽). **P1 구현 미착수 = 다음 1순위.** 설계·복귀 프로토콜 전부 메모리 [[rest-and-return-coaching]].
- 이번 세션 머지 라이브: **#462 더블 minGap 웹 강한 확인**(PR#469, RacePage — 인앱 라이브 시작에만·강한 확인+오버라이드, 네이티브 하드가드 불필요로 정리) → **#455 에픽 클로즈** / **공통 하네스 0.2.70**(PR#471, 진입파일 마커 머지) + **루트 CLAUDE.md 마커 마이그레이션**(PR#472) / 로컬 브랜치 38→2 정리·레거시 worktree 2개 제거.
- 직전 라이브: #454(제안훈련 응답+주간정산+주 고정 뷰), #402 코칭 인간화. `#전문코치리뷰`+코칭 SSOT 선독 의무+commit-msg `Coach-Review` 게이트. 메모리 [[coach-not-data-referee]], [[professional-coach-review-trigger]], [[schedule-response-and-weekly-settlement]].
  - ⚠ **머지 규칙**: squash 후 `git diff <tip> origin/main` 빈결과 트리 검증 필수(#463 24→11 누락 사고), 의심 시 `--merge`. [[pr-squash-merge-race-verify-tree]].

## 다음 1순위
1. **#473 Phase 1 구현(휴식 선언 + 닦달 차단)** — `rested` 상태 신설(+DB CHECK 마이그, skipped `202606190001` 선례)→settle/triage/realign이 `planned`만 보므로 자동 닦달 제외 / `declareRest(start, days|until, reason?)` store 액션(범용·부상 무관) / 차분 주간카드(💤 칩 + "쉬는 중 D-N" 배너 + 복귀일 조정/지금 복귀) / 코치 톤("푹 쉬세요")+대안1회 / 복귀 정리. **PR 2~3개 분할(코어=데이터+store+차단 먼저).** 코칭 도메인→`Coach-Review`. 설계·복귀 프로토콜 전부 [[rest-and-return-coaching]]·SSOT §휴식과 복귀·§3-B. (착수 전 기존 감사 anchor: model.ts:25 status enum, trainingScheduleStore skip(id):106, settleClosedWeeks:99, scheduleRealign detectScheduleDeviation:90, weeklyTriage:88, DashboardPage carousel state:259, WeekTrainingCarousel.)
2. **실기기 시각 스팟체크** — #462 강한 확인 오버레이(셀프레이스로 같은 날 둘째 시작 시) + #455 더블 카드 + 동적 gap 바(자연 발생 시, 위험 낮음).
3. **#454 나머지 플로우 실렌더 스팟체크** — 주 페이징·다른날로/스왑·포기 잔존·주말 트리아지. 통과면 에픽 #362 마무리.
4. **#359**(롱런 네거티브 스플릿) 토 LSD 스모크 · **#307** 인터뷰 스모크 · **#374** 주기화·개러지 실기기.
5. **grill 설계 백로그 정리** — 게이트 이슈(#260·#397·#411/#398/#408/#279/#375)·메모리-only 비전 → `needs:design-grill` 라벨/메모리 통합.
6. (이슈 미등록) 네이티브 fast-segment 임계 5:45→5:50 튜닝(수동 Xcode).

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
