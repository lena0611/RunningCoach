# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 **부트스트랩 메모**입니다.
운영 규칙 본문은 여기서 중복하지 않습니다. 최신 기준은 `active-context.md`,
`project-memory.md`, `.harness/project/workflow-rules.md`, `decision-log.md`를 우선합니다.

## 먼저 확인할 것
1. `git --no-pager status --short` (변경분 있으면 `git diff`, 필요 시 `git diff --staged`)
2. `. "$HOME/.nvm/nvm.sh" && nvm use` — 이후 npm/tsc/build/test/harness 명령은 새 shell마다 다시 실행
3. `package-lock.json`은 있고 `node_modules`가 없으면 `npm ci` (Issue worktree는 `node_modules`를 자동으로 안 가져옴)
4. `.harness/session/active-context.md`
5. `.harness/session/workstreams/README.md` → 해당 업무 유형의 `workstreams/*.md`만 좁혀서
6. `.harness/session/developer-input-queue.md`

## 세션 시작 시 기억할 것 (상세 규칙은 위 기준 문서에 있음)
- 이번 작업 설명이 있으면 `npm run harness:context -- "<작업 설명>"`로 읽을 기준을 좁힌다.
- 프롬프트에 Issue URL/번호가 있으면 구현·라우팅 전에 Issue 본문/labels/Project fields를 먼저 조회한다.
- Issue 없이 업무 내용만 오면 제목/문제·목표/범위/제외/완료 조건/검증 후보/Project fields/label로 구체화한 뒤 기존 Issue 검색·생성·재사용을 판단한다. 상세: `.harness/project/github-issue-management-guide.md`, `github-tracking-rules.md`.
- 요청 단위 풀스택 창 운영, 완료 책임 창, Issue/worktree 분리, `업무 피로도` 자가진단 → `active-context.md` + `.harness/project/workflow-rules.md`.
- 완료 승인 전 build/test/harness:check/배포/commit/push 금지. PaceLAB MVP 단계 예외 흐름은 `workflow-rules.md`.
- 기준 작업트리 `main` 직접 commit/push는 hook 차단. 승인 예외만 `HARNESS_ALLOW_MAIN_COMMIT=1` / `HARNESS_ALLOW_MAIN_PUSH=1`.
- 기존 Codex 창은 백그라운드로 못 깨운다. 최신 룰은 다음 사용자 입력 시 `.codex/hooks/inject-context.sh`가 기본 컨텍스트로 주입한다.
- 긴 대화창을 마칠 때는 `active-context.md` 또는 `thread-handoff-YYYY-MM-DD.md`에 최소 인수인계만 남긴다.
