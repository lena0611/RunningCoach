# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 **부트스트랩 메모**입니다.
운영 규칙 본문은 여기서 중복하지 않습니다. 최신 기준은 `active-context.md`,
`project-memory.md`, `.harness/project/workflow-rules.md`, `decision-log.md`를 우선합니다.
> 상세 인수인계가 있으면 프로젝트 루트 `HANDOFF.md`를 먼저 본다.

## ⭐ 현재 위치 (2026-06-20) — 제안훈련 응답 + 주간 정산 + 주 고정 뷰(#454) 배포 완료
- 미래 카드에 **포기(skipped 신설)·조정·되돌리기·오늘로 가져오기** + 전제 **주간 정산 모델**(닫힌 주만 missed 확정, `settleClosedWeeks` 단일소유·weekStart 경계, realign 확정책임 제거) + **데이-스트립 월~일 고정+주 페이징**. PR **#454** main 머지(`94331e7`), **마이그레이션 `202606190001` 원격 배포 확인**. harness:check(607+build) 통과. 메모리 [[schedule-response-and-weekly-settlement]].
  - 충돌은 v1에서 **스왑**으로만. 같은 날 더블/N세션 + 네이티브 6h minGap은 **후속 #455**로 분리.
- 직전: #402 코칭 인간화(coach-run 서사 코치·v106), `#전문코치리뷰` 트리거 + 코칭 SSOT 선독 의무 + commit-msg `Coach-Review` 게이트. 메모리 [[coach-not-data-referee]], [[professional-coach-review-trigger]].

## 다음 1순위 (검증·정리)
1. **#454 나머지 플로우 실렌더 스팟체크** — 되돌리기(토 Easy→LSD)는 실기기 확인됨. 남은 것: ①주 페이징 ②안 뛴 날→다른날로/스왑 ③포기 후 카드 잔존·재시도 ④주말(토/일) 백로그 시 트리아지 시트. 통과면 에픽 #362 마무리.
2. **#455**(신규) 같은 날 더블/일일 N세션 + 세션 간 minGap(네이티브 6h 런타임 가드) — 모델(하루 1세션 전제) 변경·런매칭·네이티브 동반 필요라 분리. 6h minGap SSOT는 글리코겐 재합성 인용 확보 후.
3. **#359**(롱런 네거티브 스플릿 오판 + 내부 토큰 노출) — 코드·배포(v106) 완료. **토요일 LSD 실주행 스모크만 남음**(오늘 6/20이 그 토요일): ①네거티브 스플릿 안정 판정 ②내부 토큰 미노출. 통과 보고 시 close.
4. **#307 에픽 인터뷰 스모크** — PostRunInterviewSheet은 HealthKit 새 임포트 직후 트리거라 실데이터 필요. 통과 시 에픽 완료. 메모리 [[coach-goal-management-epic]].
5. **#374** 주기화 스케줄·개러지 캐러셀 실기기 스모크.
6. **grill 설계 백로그 정리** — 게이트 이슈(#260 와이어프레임, #397 합의, #411/#398/#408/#279/#375)·메모리-only 비전(요약탭 개러지·분석 3계층·IA 개편·능동소통) 흩어짐 → 라벨 `needs:design-grill` 또는 메모리 통합.
7. (이슈 미등록) 네이티브 fast-segment 임계 5:45→5:50 누락 튜닝(수동 Xcode).

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
