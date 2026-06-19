# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 **부트스트랩 메모**입니다.
운영 규칙 본문은 여기서 중복하지 않습니다. 최신 기준은 `active-context.md`,
`project-memory.md`, `.harness/project/workflow-rules.md`, `decision-log.md`를 우선합니다.
> 상세 인수인계가 있으면 프로젝트 루트 `HANDOFF.md`를 먼저 본다.

## ⭐ 현재 위치 (2026-06-19) — 코칭 인간화 대수술(#402) 배포 완료
- coach-run을 **흐름으로 서사 읽는 코치**로 재정의(데이터 판정단 금지·스트라이드 비채점·전후반 드리프트 소스 차단·Easy/LSD 초반통제·삭제 UX·인터뷰 라벨). PR #443~448 머지, 엣지 **v105** 배포. 메모리 [[coach-not-data-referee]].
- 운영장치 신설: `#전문코치리뷰` 트리거 + **코칭 작업 전 SSOT 선독(의무)** + commit-msg `Coach-Review` 게이트. 메모리 [[professional-coach-review-trigger]].

## 다음 1순위 (검증·정리)
1. **#359**(coach-run 롱런 네거티브 스플릿 오판 + 내부 토큰 노출) — 이번 작업으로 해결됐을 가능성 큼 → **실코칭 1회로 확인 후 close**.
2. **#307 에픽 인터뷰 스모크** — PostRunInterviewSheet은 **HealthKit 새 임포트 직후** 트리거라 실데이터 필요(이번 세션 인터뷰 "어제/오늘" 라벨 정합 수정함). 통과 시 에픽 완료처리. 메모리 [[coach-goal-management-epic]].
3. **#374** 주기화 스케줄·개러지 캐러셀 실기기 스모크.
4. **grill 설계 백로그 정리** — 게이트 이슈(#260 와이어프레임, #397 합의, #411/#398/#408/#279/#375)와 메모리-only 비전(요약탭 개러지·분석 3계층·IA 개편·능동소통)이 흩어짐 → 라벨 `needs:design-grill` 또는 메모리로 통합.
5. (이슈 미등록) 네이티브 fast-segment 임계 5:45→5:50 누락 튜닝(수동 Xcode).

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
