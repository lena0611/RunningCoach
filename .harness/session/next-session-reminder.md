# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 **부트스트랩 메모**입니다.
운영 규칙 본문은 여기서 중복하지 않습니다. 최신 기준은 `active-context.md`,
`project-memory.md`, `.harness/project/workflow-rules.md`, `decision-log.md`를 우선합니다.
> 상세 인수인계가 있으면 프로젝트 루트 `HANDOFF.md`를 먼저 본다.

## ⭐ 현재 위치 (2026-06-22) — 같은 날 더블(#455) + minGap #462 완료(웹 강한 확인) — 네이티브 하드가드 불필요로 정리
- **#455 더블 웹(Phase 1~3)** 라이브: slot 모델(AM/PM)·런매칭·적격 게이트(경력36mo·볼륨80km·부상·단일quality·ACWR≤1.5)·PM 이지 강제·코치 자동제안·UI(캐러셀 ×2 배지·더블 패널·추가 시트·차단 카드). 마이그레이션 `202606220001`(slot) 배포.
- **#462 완료** 라이브(PR #469 `ecd9b57`): 더블 minGap = ① v1 웹 동적 안내(`evaluateDoubleGap` 종료+5h/+7h·blocked/tight/ok 색) + ② **최종 웹 강한 확인**. 네이티브 하드가드는 **불필요로 정리** — 인앱 관측 가능한 '시작'은 라이브 트래킹(`RacePage` 셀프레이스)뿐 + 더블 PM은 워치 import라 네이티브가 가로챌 지점 없음 → 시작을 직접 일으키는 웹에서 `RacePage.beginCountdown`이 직전 종료 런 `blocked`(<5h)면 회복 권고 오버레이('조금 더 쉬기'/'그래도 시작'). 결정=AskUserQuestion(범위=인앱 라이브 시작에만/강도=강한 확인+오버라이드). 메모리 [[schedule-response-and-weekly-settlement]].
  - ⚠ **머지 사고**: #463 스쿼시가 파일 누락(24→11)→#464 롤포워드 복구. **이후 머지는 트리 검증 필수**(`git diff <tip> origin/main` 빈결과), 의심 시 `--merge`. 메모리 [[pr-squash-merge-race-verify-tree]].
- 직전: #454(제안훈련 응답+주간정산+주 고정 뷰 `94331e7`), #402 코칭 인간화(v106), `#전문코치리뷰` + 코칭 SSOT 선독 의무 + commit-msg `Coach-Review` 게이트. 메모리 [[coach-not-data-referee]], [[professional-coach-review-trigger]].

## 다음 1순위
1. **실기기 시각 스팟체크** — #462 강한 확인 오버레이(셀프레이스로 같은 날 둘째 시작 시) + #455 더블 카드(배지·패널·추가 시트·차단 카드) + #462 동적 gap 바 색감. 신기능이라 *적격+같은날 직전 런*이라야 떠서 자연스럽게 생길 때(렌더 로직은 컴포넌트 테스트로 검증됨, 위험 낮음).
2. **#454 나머지 플로우 실렌더 스팟체크** — 주 페이징·다른날로/스왑·포기 잔존·주말 트리아지. 통과면 에픽 #362 마무리.
3. **#359**(롱런 네거티브 스플릿+토큰 노출) — 코드·배포 완료, 토 LSD 실주행 스모크만 남음.
4. **#307 인터뷰 스모크**(HealthKit 새 임포트 직후 트리거, 실데이터 필요)·**#374** 주기화·개러지 캐러셀 실기기.
5. **grill 설계 백로그 정리** — 게이트 이슈(#260·#397·#411/#398/#408/#279/#375)·메모리-only 비전(요약탭 개러지·분석 3계층·IA 개편·능동소통) → `needs:design-grill` 라벨/메모리 통합.
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
