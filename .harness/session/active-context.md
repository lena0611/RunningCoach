# 현재 컨텍스트

이 문서는 이 프로젝트에서 최근 작업 상태와 다음 작업을 짧게 이어받기 위한 소비자 프로젝트 전용 문서입니다.

> 하네스 본체의 개발 기록이 아닙니다. 설치된 프로젝트의 현재 작업 맥락만 기록합니다.

## 현재 상태
- updatedAt: 2026-06-05
- baseHarness: 0.2.53
- activeStack: `.harness/policy/profile.json` 참고
- harnessMode: `.harness/policy/profile.json` 참고

## 최근 작업
- 2026-05-28 긴 대화창 인수인계는 `.harness/session/thread-handoff-2026-05-28.md`에 남아 있다. 현재 기준은 이 문서와 `project-memory.md`, `next-session-reminder.md`, `workflow-rules.md`를 우선한다.
- 2026-05-28 `08-injury-domain`에서 부상 체크인/완치 후보/보강운동 근거 기준을 정리했다. 최신 도메인 기준은 `.harness/project/domain-rules.md`, 코칭 표현 기준은 `.harness/project/ai-coaching-goal.md`, 선택 이유는 `.harness/session/decision-log.md`를 본다.
- 현재 제품명은 `PaceLAB`이다. 사용자-facing UI에서 `RunContext` 표현은 제거하는 방향이다.
- 현재 구조는 GitHub Pages 정적 프론트 + Supabase Auth/Postgres/Edge Function + OpenAI API + iOS WKWebView/HealthKit 하이브리드다.
- iOS 네이티브 로컬 프로젝트는 `/Users/smart-tn-083/practice/RunningCoach`에 있다.
- HealthKit 자동 동기화, 세션별 HealthKit 재갱신, FIT 보조 import를 유지한다.
- AI 코칭은 세션 상세에서 열며, 별도 Coach 하단 탭은 제거된 상태다.
- 일반 작업의 완료 승인 전 자동 검증/커밋 금지 원칙은 하네스 본체 `0.2.51`에 반영되어 있다. 다만 PaceLAB MVP 단계의 구현/버그/운영 요청은 먼저 GitHub Issue 생성/재사용과 Issue worktree/branch 분리를 완료한 뒤, 명시적 중단 지시가 없으면 배포 확인까지 수행하고 보고한 다음 사용자의 최종 완료 승인을 기다린다. `CLAUDE.md`, `AGENTS.md`, `.claude/hooks/enforce-check.sh`, `.harness/project/commit-push-rules.md` 기준을 함께 따른다.

## 요청 단위 창 운영 기준
- 이 프로젝트는 상시 workstream별 대화창 분리 운영을 중단하고, 요청 단위 새 창 운영을 기본으로 한다.
- 기존에 열려 있는 Codex 창은 백그라운드로 직접 깨울 수 없다. 최신 운영 룰은 다음 사용자 입력 시 `.codex/hooks/inject-context.sh`가 기본 컨텍스트로 주입한다.
- 모든 대화창은 매 사용자 요청마다 요청을 분류해 필요한 workstream 파일을 읽을거리 라우팅으로만 선택한다. 같은 목표 안의 기획/디자인/웹/네이티브/Supabase/AI/하네스 작업은 현재 요청 창이 풀스택으로 관리한다.
- 모든 요청 창은 시작 시 PaceLAB 기본 제품 표면을 함께 확인한다. 웹 프론트 래퍼는 이 저장소의 `src/**`와 GitHub Pages/iOS WebView 화면, iOS 네이티브 래퍼는 `/Users/smart-tn-083/practice/RunningCoach`, Supabase 백엔드는 `supabase/**`와 Auth/Postgres/RLS/Edge Function이다.
- 요청이 특정 표면만 언급해도 사용자 흐름상 저장, 동기화, 표시, 브리지, Edge Function, 배포/캐시가 연결되면 현재 요청 창이 전체 계약과 검증 후보를 소유한다.
- 모든 대화창은 GitHub Issue/Project, Issue별 worktree/branch, 실제 Markdown 댓글, 필요한 경우의 parent/child Issue, `업무 피로도` 자가진단 기준을 현재 운영 기준으로 적용한다.
- 기준 작업트리 `main` 직접 commit/push는 hook에서 차단한다. 사용자 승인 예외만 `HARNESS_ALLOW_MAIN_COMMIT=1` 또는 `HARNESS_ALLOW_MAIN_PUSH=1`로 우회한다.
- 사용자가 동시에 여러 업무를 요청하면 업무마다 Issue, worktree, branch, PR을 분리한다. 같은 창이 순차 관리할 수는 있지만 파일 변경과 커밋 범위는 섞지 않는다.
- 작업 유형별 시작 문서와 종료 기록 기준은 `.harness/project/workflow-rules.md`의 `요청 단위 풀스택 창 운영`을 따른다.
- 긴 대화창을 넘길 때는 이 문서에 최신 인수인계 파일만 가리키고, 상세는 `thread-handoff-YYYY-MM-DD.md`처럼 별도 파일로 둔다.

## 확인할 일
- 새 대화의 작업 유형을 먼저 선언하고 `.harness/project/workflow-rules.md`의 작업 유형별 시작 문서를 좁혀 읽는다.
- 코칭/훈련 알고리즘 작업은 `.harness/project/ai-coaching-goal.md`, `.harness/project/domain-rules.md`, `.harness/project/running-coaching-standards.md`를 함께 확인한다.
- HealthKit/iOS 작업은 `.harness/project/healthkit-data-contract.md`와 네이티브 로컬 프로젝트를 함께 확인한다.
- Supabase Edge Function 변경 시 `coach-run` 배포가 별도로 필요하다.
