# 세션 시작 알림

새 세션을 열면 이 문서를 가장 먼저 읽습니다.

바로 이어서 [`next-session-reminder.md`](./next-session-reminder.md)를 봅니다.

Claude Code에서는 `SessionStart` hook이 `next-session-reminder.md`를 자동으로 보여줍니다. Codex와 Copilot은 같은 hook 강제성이 없으므로 `CLAUDE.md`의 읽기 순서에 따라 직접 확인합니다.

## 지금 반드시 떠올릴 것
0. 루트에 `.harness/`, `AGENTS.md`, `CLAUDE.md` 중 하나라도 있으면 사용자가 하네스를 언급하지 않아도 하네스 프로젝트로 자동 인식합니다.
1. 모든 작업은 `.harness/policy/ai-standard-guiding-policy.md`의 위배 여부를 먼저 확인합니다.
2. 프로젝트 목적은 아직 `TBD`입니다. 새 기능 전에 `.harness/project/project-charter.md`를 먼저 확인합니다.
3. `src/`, 기준 문서, 하네스 문서를 손대면 시작 전에는 `npm run harness:impact`로 영향 범위를 확인합니다. `npm run harness:check`는 사용자가 최종 검증을 승인한 뒤 실행합니다.
4. 자동 검사가 통과해도 수동 검토 항목은 `.harness/policy/automation-coverage.md`를 보고 다시 판단합니다.
5. `.harness/session/developer-input-queue.md`의 `open`/`deferred` 항목은 새 세션에서 다시 확인합니다.
6. 문서를 키워야 한다면 먼저 `.harness/documentation/indexing-rules.md`에 맞게 인덱스/세부 문서 분리를 판단합니다.
7. 개발 방향을 유지하려면 하네스만 만들지 말고, 필요 시 trigger와 hook까지 함께 설계해야 합니다.
8. 강제 강도와 예외 허용 범위가 애매하면 `.harness/policy/enforcement-ladder.md`를 보고 사용자에게 묻습니다.
9. 코드 변경 시 스타일 검증도 구조 검증과 함께 보며, `npm run lint` 또는 `npm run harness:check`를 기준으로 판단합니다.
10. 새 환경을 준비한 뒤에는 `npm run hooks:install`로 로컬 훅과 커밋 템플릿을 연결합니다.
11. 에이전트 작업은 hook 설치 여부와 무관하게 기준 계층을 읽습니다. 다만 일반 작업은 사용자 완료 승인 전 `build`, `test`, `harness:check`, commit, push, PR 생성을 실행하지 않고 검증 후보로 보고합니다. PaceLAB MVP 단계에서 구현/버그/운영 요청을 맡은 경우에는 먼저 GitHub Issue 생성/재사용과 Issue worktree/branch 분리를 완료한 뒤, 명시적 중단 지시가 없는 한 검증, commit, push, PR/main 반영, 배포 확인까지 수행하고 보고한 다음 사용자의 최종 완료 승인을 기다립니다.
12. 사용자가 `최종 검증만` 요청하면 `npm run harness:check`를 직접 실행합니다. 사용자가 `커밋/푸시`를 요청했고 hook이 설치되어 있으면 pre-commit/pre-push 검증을 신뢰하고 선행 `harness:check`를 중복 실행하지 않습니다.
13. 스타일이 반복 패턴으로 굳어지기 시작하면 `.harness/style/style-evolution.md` 기준으로 규칙 승격 후보를 확인합니다.
14. 코드 변경 후에는 도메인, 아키텍처, 워크플로우 로컬룰로 승격할 후보가 있는지 확인하고, 확신이 없으면 `.harness/session/developer-input-queue.md`에 질문으로 남깁니다.
15. 큰 작업이나 생소한 영역은 `npm run harness:sync`와 `npm run harness:context -- "<작업 설명>"`로 에이전트 판단 컨텍스트를 먼저 만듭니다.
16. 개발자에게 진행 상황을 보일 때는 원시 내부 추론이 아니라 `[harness] request/context/impact/action/decision/verify` 형태의 visible trace로 요약합니다.
17. 사용자가 하네스를 언급하지 않는 것은 하네스를 비활성화한다는 뜻이 아닙니다. 하네스 설치 프로젝트에서는 항상 이 문서의 절차를 적용합니다.
18. PaceLAB 새 요청 창은 단일 풀스택 담당 창입니다. 요청이 들어오면 웹 프론트 래퍼, iOS 네이티브 래퍼, Supabase/Auth/Postgres/Edge Function, OpenAI 코칭, GitHub Pages 배포 경계 중 어떤 표면이 영향을 받는지 먼저 떠올립니다.
19. 한 목표 안에서 프론트, 네이티브, Supabase가 함께 필요하면 같은 요청 창이 전체 계약과 검증 후보를 관리합니다. 독립 목표나 동시 업무만 Issue/worktree/branch로 분리합니다.
20. 프롬프트에 Issue URL 또는 Issue 번호가 있으면 구현이나 라우팅 전에 Issue 본문, labels, Project fields를 먼저 조회합니다.
21. Issue 없이 업무 내용만 들어오면 에이전트가 한글 우선 제목, 문제/목표, 범위, 제외 범위, 완료 조건, 검증 후보, Project fields, label 후보로 구체화한 뒤 기존 Issue 검색과 생성/재사용을 판단합니다. 정식 개발/문서/운영 작업이면 이 단계가 MVP 배포 자동 완료 흐름보다 먼저입니다.
22. Codex 세션 시작 시 `.nvmrc` 기준 Node 버전을 먼저 확인합니다. hook에서 `nvm use`를 실행해도 이후 Codex shell에 영구 적용되지는 않으므로, npm/tsc/build/test/harness 명령 전에는 현재 작업트리에서 `. "$HOME/.nvm/nvm.sh" && nvm use`를 실행합니다.
23. Issue worktree는 git ignored 파일인 `node_modules`를 자동으로 가져오지 않습니다. 새 worktree를 만들거나 들어간 뒤 `node_modules`가 없으면 TypeScript/build/test 전에 `npm ci`로 의존성을 준비합니다.
24. 기준 작업트리 `main` 직접 commit/push는 git hook에서 차단합니다. 사용자가 명시적으로 main 직접 기록/최종화 예외를 승인한 경우에만 `HARNESS_ALLOW_MAIN_COMMIT=1` 또는 `HARNESS_ALLOW_MAIN_PUSH=1`로 우회합니다.

## PaceLAB 기본 제품 표면
- 웹 프론트 래퍼: 이 저장소의 Vue 3 + Vite + TypeScript 앱, `src/**`, GitHub Pages 정적 배포, iOS WebView에서 실행되는 화면과 상태 관리.
- iOS 네이티브 래퍼: `/Users/smart-tn-083/practice/RunningCoach`의 Swift/WKWebView/HealthKit/WeatherKit/로컬 알림 브리지.
- Supabase 백엔드: 이 저장소의 `supabase/**`, Supabase Auth/Postgres/RLS/Edge Function, `coach-run`, OpenAI API secret 경계.
- 공유 계약: `.harness/project/architecture-rules.md`, `.harness/project/healthkit-data-contract.md`, `.harness/project/config-contract.md`, `.harness/project/github-pages-supabase-playbook.md`.
- 시작 판단: 요청을 한 표면에 가두지 말고, 사용자 흐름 기준으로 프론트 표시, 네이티브 브리지, 저장/동기화, Edge Function, 배포/캐시 영향까지 확인합니다.

## Codex 런타임 준비
- 세션 시작 hook은 `.nvmrc` 요구 버전과 현재 hook 프로세스의 Node 버전을 보여줍니다.
- 후속 shell 명령은 별도 프로세스이므로 npm 계열 명령 앞에는 `. "$HOME/.nvm/nvm.sh" && nvm use`를 붙이거나 같은 shell에서 먼저 실행합니다.
- 이 프로젝트는 `package-lock.json` 기준 npm 프로젝트입니다. Issue worktree에서 `node_modules`가 없으면 복사나 symlink보다 `npm ci`를 우선합니다.
- `npm ci`는 설치 작업이므로 정식 검증 명령은 아니지만, `vue-tsc`, `vite`, `vitest` 같은 로컬 바이너리가 없어 생기는 가짜 실패를 막기 위한 worktree 준비 단계입니다.

## 방향 유지 장치 원칙
- **Harness**는 방향과 작업 레일을 정합니다.
- **Trigger**는 어떤 상황에서 무엇을 다시 떠올려야 하는지 강제합니다.
- **Hook**은 실제 실행 단계에서 빠져나가지 못하게 막습니다.
- 새로운 운영 규칙을 추가할 때는 항상 “하네스만으로 충분한가, trigger가 필요한가, hook으로 강제해야 하는가”를 함께 판단합니다.
- 강제 강도(`inform/trigger/hook/block`)와 예외 허용 범위(`none/defer/waiver`)도 함께 판단합니다.

## 세션 종료 트리거
- 사용자가 `세션종료`라고 말하면 이 세션에서 남은 미결 사항, 다음에 바로 떠올려야 할 점, 개발자에게 다시 물어봐야 할 항목을 `next-session-reminder.md`에 갱신합니다.

## 새 세션에서 재계획해야 하는 미해결 항목
- 실제 프로젝트 목적과 문제 정의 채우기
- 비목표와 성공 기준 확정
- waiver가 필요한 예외 상황이 생기면 `waivers.json` 등록 프로세스 확정
- 프로젝트가 커지면 ownership map 또는 boundary map 추가 여부 재판단

## 개발자 입력 요청 원칙
- 개발자 정보 부족 때문에 완료되지 못한 항목은 `developer-input-queue.md`에 유지합니다.
- 새 세션에서는 큐의 `open` 또는 `deferred` 항목을 개발자에게 다시 확인합니다.
- 개발자는 다음 중 하나를 선택할 수 있습니다.
  1. 지금 답변
  2. 이번 세션에서는 유보
  3. 나중에 다시 묻기
- 답변을 거절하거나 유보하더라도 그 선택을 존중하고 상태만 갱신합니다.

## 세션 시작 기본 명령
```bash
git --no-pager status --short
npm run hooks:install
npm run harness:impact
# 최종화 승인 후에만 실행:
# HARNESS_AGENT_CHECK_APPROVED=1 npm run harness:check
```
