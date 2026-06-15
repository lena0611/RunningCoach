# 현재 컨텍스트

이 프로젝트의 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.
운영 규칙 본문은 여기서 중복하지 않고 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 가리킵니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.

## ⭐ 다음 작업 — #233 가상레이싱 결과 분류·RunLog 링크 (착수 직전, 2026-06-11)
- **상태**: 설계 착수 직전. 코드 미시작. 선행 #228(거리별 PB `src/shared/lib/achievement/distancePb.ts`)·#229(라이브 트래킹) 모두 Done.
- **목표**: 라이브 레이싱 결과를 경량 `competition_result`로 분류·저장하고 정본 RunLog에 링크. 훈련 분류와 직교(경쟁 주석).
- **스펙(확정, `.harness/project/competition-domain.md` §9.2·§10)**:
  - 정본 RunLog `type` **불변**(`inferRunType` 그대로, 'Race' 강제 금지 — Riegel/부하/추세 오염 방지). `RunLog.tags += 'self-race'` 경량 태그만(식별 + 업적 PB 훈련/레이싱 사다리 분리 키).
  - `competition_result{mode:'self-pb', targetPb:{distanceM,elapsedSec,sourceRunId}, racedDistanceM, resultGapSec, outcome:'win'|'lose'|'tie', linkedRunId, racedAt}`.
  - 링크: 라이브 종료 후 import된 RunLog와 **시간·거리 근접 매칭**(기존 `requestRunningWorkoutByExternalId` 패턴 재사용).
  - **이중계산 방지**: competition_result는 볼륨·부하·추세 집계 **미포함**. 업적·동기부여·코칭 인용 전용.
  - `competition_result`는 현재 코드에 **없음**(신규). 라이브 결과는 RacePage에 `finalTick`/`finalGap`/`finalDistanceGapM`로 종료 요약만 존재(미저장).
- **다음 세션 1순위 조사(미확인)**: ① RunLog 영속화 위치(Supabase 테이블 vs 로컬) ② `requestRunningWorkoutByExternalId` 매칭 로직 위치·패턴 ③ coach-run 컨텍스트 주입 지점([[coach-context-client-summary]] 패턴) ④ 'self-race' 태그를 라이브 종료→import RunLog에 붙이는 시점.
- **착수 전 결정 필요(사용자 인터뷰)**: **저장 여부** — MVP 미저장(종료요약만) vs 저장(업적/코칭 인용 위해 권장). 저장 시 Supabase 테이블 신설 여부.
- **작업 규율**: 새 worktree `run-ai.worktrees/issue-233-*` 생성(현 issue-232 워크트리는 #232/#296용, 모두 머지·종료됨). 큰 작업이니 구현 전 설계 합의.

## 현재 상태
- updatedAt: 2026-06-11 (#233 착수 직전)
- baseHarness: 0.2.53
- activeStack / harnessMode: `.harness/policy/profile.json` 참고

## 제품 구조 (고정 사실)
- 제품명은 `PaceLAB`. 사용자-facing UI에서 `RunContext` 표현은 제거하는 방향.
- GitHub Pages 정적 프론트 + Supabase Auth/Postgres/Edge Function + OpenAI API + iOS WKWebView/HealthKit 하이브리드.
- iOS 네이티브 repo: `/Users/smart-tn-083/practice/RunningCoach/RunningCoach`(2중첩, 바깥은 컨테이너), remote `github.com/lena0611/RunningCoach-Native-Swift`(웹 repo와 별개). 상세 [[native-repo-git-management]].
- HealthKit 자동 동기화, 세션별 HealthKit 재갱신, FIT 보조 import 유지.
- AI 코칭은 세션 상세에서 열며, 별도 Coach 하단 탭은 제거됨.

## 최근 작업
- 2026-05-28 긴 대화 인수인계는 `thread-handoff-2026-05-28.md`(과거 스냅샷). 최신 기준은 이 문서 + `project-memory.md` + `workflow-rules.md` + `decision-log.md`를 우선한다.
- 2026-05-28 `08-injury-domain`에서 부상 체크인/완치 후보/보강운동 근거 기준을 정리. 도메인 기준 `.harness/project/domain-rules.md`, 코칭 표현 `.harness/project/ai-coaching-goal.md`, 선택 이유 `.harness/session/decision-log.md`.

## 운영 기준 (단일 출처 포인터)
- 요청 단위 풀스택 창 운영, 완료 책임 창, 동시 요청 Issue/worktree/branch 분리, Codex 백그라운드 주입(`.codex/hooks/inject-context.sh`), 완료 승인 전 build/test/harness:check/배포/commit/push 게이트, 기준 작업트리 `main` 직접 commit/push 차단(`HARNESS_ALLOW_MAIN_*` 예외) → `.harness/project/workflow-rules.md`의 `요청 단위 풀스택 창 운영`과 `CLAUDE.md`를 단일 출처로 따른다.
- PaceLAB MVP 단계 구현/버그/운영 요청의 자동 진행(배포 확인까지) + 사용자 최종 완료 승인 대기 흐름도 위 문서를 따른다.

## 확인할 일
- (대기) 케이던스 수정 기기 검증: 사용자 2026-06-08 앱 재빌드 예정. 네이티브 `RunningCoach-Native-Swift` PR #4 → Xcode 재빌드·기기 설치·해당 런 재동기화 후 Apple과 케이던스(평균 167/범위 158~172/전구간) 일치 확인 → 일치 시 PR #4 머지. 웹은 Issue #225 + PR #226(배포 완료)로 sanitize 방어막 적용됨.
- 새 대화의 작업 유형을 먼저 선언하고 `.harness/project/workflow-rules.md`의 작업 유형별 시작 문서 표만 좁혀 읽는다.
- Supabase Edge Function(`coach-run` 등) 변경 시 배포가 별도로 필요하다.
