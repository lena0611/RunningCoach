# 현재 컨텍스트

이 프로젝트의 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.
운영 규칙 본문은 여기서 중복하지 않고 `.harness/project/workflow-rules.md`와 `CLAUDE.md`를 가리킵니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.

## 현재 상태
- updatedAt: 2026-06-05
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
