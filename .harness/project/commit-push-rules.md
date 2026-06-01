# 커밋/푸시 안전장치 규칙

commit/push 단계에서 동작하는 git hook, 커밋 템플릿, 최종 검증 기준을 기록합니다.

이 문서는 `.harness/project/workflow-rules.md`의 일반 작업 흐름과 분리합니다. 대화창 운영, 업무 진행 방식, workstream 운영 문구만 바뀌는 경우에는 이 문서를 수정하지 않습니다.

## MVP 기본 최종화 흐름
- PaceLAB MVP 단계에서 `Target=MVP`인 정식 Issue 작업은 사용자가 단순 확인, 검토, 조사, 기획 질문만 요청한 경우를 제외하고 완료까지 이어서 진행합니다.
- 구현/버그/운영 요청을 사용자가 맡긴 경우, 먼저 GitHub Issue 생성/재사용과 Issue worktree/branch 분리를 완료합니다. 그 뒤 명시적인 보류 지시가 없으면 검증, commit, push, PR 생성 또는 main 반영, 배포 확인까지 진행하고 보고한 다음 사용자의 최종 완료 승인을 기다립니다.
- 이 기본 완료 흐름에서도 Issue별 git worktree와 feature branch 분리는 유지합니다. 동시에 여러 Issue를 처리할 수 있도록 한 작업트리에 여러 Issue 변경을 섞지 않습니다.
- 사용자가 `검토만`, `PR까지만`, `커밋하지 마`, `배포하지 마`, `여기서 멈춰`처럼 중단점을 지정하면 그 지시를 우선합니다.
- git hook은 작업 완료 시점을 결정하지 않고, commit/push 직전에 실행되는 안전장치입니다.
- MVP가 아닌 `Target=Beta/App Store/Later` 작업은 별도 승인 기준을 Issue 본문이나 댓글에 명시합니다.

## 브랜치와 머지 기준
- `main`은 머지와 배포 기준 브랜치입니다.
- 정식 Issue 작업은 `main`에 직접 커밋하지 않고 Issue 전용 git worktree와 `issue-<번호>/<짧은-설명>` feature branch에서 진행합니다.
- feature branch와 worktree를 만들기 전에는 현재 작업트리에 다른 Issue 변경이 섞여 있는지 `git status --short`와 `git diff`로 확인합니다.
- 동시에 여러 요청이 진행되면 각 Issue별 worktree와 branch를 분리합니다.
- 기준 작업트리 `/Users/smart-tn-083/practice/run-ai`는 `main` 확인, Issue/Project 정리, merge/deploy 기준으로 두고, 구현/문서 수정은 `/Users/smart-tn-083/practice/run-ai.worktrees/issue-<번호>-<짧은-설명>`에서 수행합니다.
- `.githooks/pre-commit`과 `.githooks/pre-push`는 `main` 직접 commit/push를 차단합니다. 사용자 명시 승인 예외만 `HARNESS_ALLOW_MAIN_COMMIT=1` 또는 `HARNESS_ALLOW_MAIN_PUSH=1`로 우회합니다.
- feature branch 변경은 PR을 통해 `main`으로 머지합니다.
- `main`에 머지된 뒤에만 GitHub Pages 배포 또는 운영 배포의 기준 변경으로 봅니다.
- 하네스/운영 문서처럼 짧고 독립적인 변경도 원칙적으로 Issue worktree/branch를 권장합니다. 사용자가 명시적으로 `main` 직접 커밋을 승인한 경우에만 직접 커밋할 수 있습니다.
- Issue가 `Closed`이고 Project Status가 `Done`이며 해당 worktree가 clean이면 로컬 Issue worktree는 완료 후 정리 대상입니다. `Open` 또는 `Deployed` 상태 worktree는 사용자 최종 완료 확인 전까지 기본 보류합니다.

## hook 설치 기준
- `npm run hooks:install`은 `core.hooksPath`를 `.githooks`로 설정합니다.
- 기존 `.git/hooks/*` 또는 기존 `core.hooksPath`의 hook은 삭제하지 않습니다.
- 기존 hook 경로는 `harness.previousHooksPath`에 저장하고, `.githooks/*`에서 먼저 체인 실행합니다.
- `.github/commit-template.txt`를 git commit template로 연결합니다.

## pre-commit
- 사용자가 커밋을 승인하고 실제 `git commit`이 실행될 때 동작합니다.
- 기존 pre-commit hook이 있으면 먼저 실행합니다.
- 하네스 seed-mode 확인 후 `npm run harness:check`를 실행합니다.
- 이 단계는 전체 검증에 가깝기 때문에 사용자의 완료 승인 없이 에이전트가 임의로 유도하지 않습니다.

## pre-push
- 사용자가 push를 승인하고 실제 `git push`가 실행될 때 동작합니다.
- 기존 pre-push hook이 있으면 먼저 실행합니다.
- 반복 검증 부담을 줄이기 위해 `npm run harness:check -- --fast`를 실행합니다.

## PR과 배포
- MVP Target의 정식 Issue에서는 `진행해`와 구현/버그/운영 작업 위임을 완료 흐름 승인으로 봅니다. 별도 중단 지시가 없으면 PR merge 또는 main 반영, 배포 확인까지 이어간 뒤 보고하고 사용자의 최종 완료 승인을 기다립니다.
- 단순 확인/검토/조사 요청 또는 사용자가 지정한 중단점이 있으면 그 범위까지만 수행합니다.
- `배포해`는 MVP 기본 흐름이 아닌 보류 상태의 branch나 PR에도 main 머지와 배포 진행을 명시 승인하는 말로 봅니다.
- 배포 완료 후에도 사용자의 앱/운영 확인이 남아 있으면 GitHub Project Status는 `Deployed`에 둡니다.
- MVP 기본 흐름에서는 검증과 배포 확인이 끝나면 Issue 또는 대화에 완료 요약을 남기고 사용자 최종 완료 승인을 기다립니다. Status를 `Done`으로 바꾸거나 Issue를 닫는 작업은 사용자의 명시 완료 지시 후에만 수행합니다.

## 변경 시 함께 확인할 것
- `.githooks/pre-commit`
- `.githooks/pre-push`
- `.harness/bin/install-hooks.mjs`
- `.harness/bin/run-previous-hook.mjs`
- `.github/commit-template.txt`
- README의 hook 안내

## 예외 기록
- 프로젝트 사정으로 hook을 설치하지 않는 것은 허용할 수 있습니다.
- 단, 에이전트 작업은 hook 설치 여부와 무관하게 완료 승인 게이트와 최종 검증 원칙을 따릅니다.
- hook 정책 자체를 바꾸는 예외는 `decision-log.md` 또는 `waivers.json`에 범위, 사유, 만료 조건을 남깁니다.
