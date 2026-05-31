# AGENTS

보조 에이전트 진입점입니다. 기준 진입점은 `CLAUDE.md`입니다.

Claude가 아닌 에이전트도 먼저 `CLAUDE.md`를 읽고 같은 순서와 원칙을 따릅니다.

하네스 본체는 `.harness/`에 있습니다. 플랫폼별 파일은 본체 밖의 어댑터입니다.

## 비-Claude 에이전트 필수 동작
Codex, Copilot, 기타 에이전트는 사용자가 "하네스"라고 말하지 않아도 루트에 `.harness/`가 있으면 하네스 작업 프로토콜을 자동으로 적용합니다.

1. 작업 시작 전 `CLAUDE.md`의 "하네스 자동 인식 의무"와 "항상 읽는 최소 기준"을 읽습니다.
2. 코드/문서/설정 변경 전 반복 규칙 승격 후보를 판단합니다.
3. 확정된 반복 규칙은 `.harness/project/domain-rules.md`, `architecture-rules.md`, `workflow-rules.md`, `commit-push-rules.md` 중 알맞은 곳에 반영합니다.
4. 불확실한 질문은 `.harness/session/developer-input-queue.md`에 남기고 필요하면 사용자에게 인터뷰합니다.
5. 사용자가 명시적으로 완료, 최종 검증, 커밋, 푸시, PR 생성을 승인하기 전에는 `build`, `test`, `harness:check`, commit, push, PR 생성을 실행하지 않고 검증 후보로 보고합니다. 단, 이 프로젝트가 PaceLAB MVP 단계이고 사용자가 구현/버그/운영 작업을 맡긴 경우에는 먼저 GitHub Issue 생성/재사용과 Issue worktree/branch 분리를 완료한 뒤, 명시적 중단 지시가 없는 한 검증, commit, push, PR/main 반영, 배포 확인까지 수행하고 보고한 다음 사용자의 최종 완료 승인을 기다립니다.
6. 사용자가 `최종 검증만` 요청하면 `npm run harness:check`를 직접 실행합니다. 사용자가 `커밋` 또는 `커밋하고 푸시`를 요청했고 git hook이 설치되어 있으면 선행 `harness:check`를 중복 실행하지 않고 hook 검증에 맡깁니다.
7. hook이 설치되어 있지 않거나 `--no-verify` 등으로 우회되는 환경이면 commit/push 전에 에이전트가 직접 `npm run harness:check`를 실행합니다.
8. 기준 작업트리 `main` 직접 commit/push는 원칙적으로 차단합니다. 사용자가 명시적으로 main 직접 기록/최종화 예외를 승인한 경우에만 `HARNESS_ALLOW_MAIN_COMMIT=1` 또는 `HARNESS_ALLOW_MAIN_PUSH=1`로 hook 차단을 우회할 수 있습니다.

Codex나 Copilot 계열 에이전트는 Claude Code의 `SessionStart` hook과 slash command를 그대로 강제할 수 없습니다. 대신 새 작업을 시작할 때 `CLAUDE.md`의 읽기 순서를 따르고, 필요하면 아래 파일을 직접 갱신합니다.

- 리마인더: `.harness/session/next-session-reminder.md`
- 장기 메모리: `.harness/session/project-memory.md`
- 결정 로그: `.harness/session/decision-log.md`

큰 작업이나 낯선 요청은 `npm run harness:context -- "<작업 설명>"` 결과의 Selected Skills를 보고 읽을 문서, 실행할 명령, 기록 위치를 좁힙니다.

프로젝트가 session workstreams README를 만들어 요청 라우팅 운영을 선택했다면, 각 요청 시작 시 관련 workstream 파일을 읽을거리 인덱스로 고르고, 독립 목표나 동시 업무의 Issue/worktree 분리 필요 여부를 먼저 식별합니다. PaceLAB에서는 웹 프론트 래퍼, iOS 네이티브 래퍼, Supabase/Auth/Postgres/Edge Function, OpenAI 코칭, GitHub Pages 배포 경계를 같은 요청 창이 함께 관장합니다. 요청 라우팅 운영이 없으면 강제하지 않습니다.
