# 다음 세션 리마인더

새 세션에서 바로 이어받기 위한 소비자 프로젝트 전용 메모입니다.

## 먼저 확인할 것
1. `git --no-pager status --short`
2. 변경분이 있으면 `git diff`, 필요 시 `git diff --staged`
3. `. "$HOME/.nvm/nvm.sh" && nvm use`
4. 현재 작업트리에 `package-lock.json`이 있고 `node_modules`가 없으면 `npm ci`
5. `.harness/session/active-context.md`
6. `.harness/session/workstreams/README.md`
7. 해당 업무 유형의 `.harness/session/workstreams/*.md`
8. `.harness/session/developer-input-queue.md`

## 다음 작업
- 기존에 열려 있는 Codex 창에는 백그라운드 메시지를 직접 보낼 수 없다. 최신 운영 룰은 다음 사용자 입력 시 `.codex/hooks/inject-context.sh`의 기본 컨텍스트로 주입된다.
- 다음 사용자 입력을 받은 모든 창은 최신 운영 룰로 `.harness/session/workstreams/README.md`, `.harness/project/github-issue-management-guide.md`, `.harness/project/github-tracking-rules.md`, `.harness/project/workflow-rules.md`를 우선 확인한다.
- Codex 세션 시작 hook은 `.nvmrc` 요구 버전과 현재 hook Node 버전을 보여준다. 이후 각 shell 명령은 별도 프로세스이므로 npm/tsc/build/test/harness 명령 전에는 현재 작업트리에서 `. "$HOME/.nvm/nvm.sh" && nvm use`를 실행한다.
- Issue worktree는 ignored 파일인 `node_modules`를 자동으로 가져오지 않는다. 새 worktree를 만들거나 들어간 뒤 `node_modules`가 없으면 TypeScript/build/test 전에 `npm ci`로 의존성을 준비한다.
- 정식 Issue 작업은 GitHub Issue/Project, Issue별 worktree/branch, 실제 Markdown 댓글, 필요한 경우의 parent/child Issue, `업무 피로도` 자가진단 기준을 적용한다.
- 프롬프트에 Issue URL 또는 Issue 번호가 있으면 구현이나 라우팅 전에 Issue 본문, labels, Project fields를 먼저 조회한다.
- Issue 없이 업무 내용만 들어오면 에이전트가 한글 우선 제목, 문제/목표, 범위, 제외 범위, 완료 조건, 검증 후보, Project fields, label 후보로 구체화하고, 기존 Issue 검색 후 생성/재사용을 판단한다. 정식 개발/문서/운영 작업이면 이 단계가 MVP 배포 자동 완료 흐름보다 먼저다.
- 새 대화창은 요청 단위 풀스택 창으로 취급한다. 사용자가 업무 내용만 적으면 에이전트가 기획, 버그픽스, UI/UX, 코칭/훈련 로직, HealthKit/iOS, Supabase/OpenAI Edge Function, 부상관리 도메인, 하네스/정책 중 필요한 읽을거리 라우팅을 고른다.
- 새 요청을 한 표면에 가두지 않는다. 시작 시 웹 프론트 래퍼(`src/**`, GitHub Pages, iOS WebView 화면), iOS 네이티브 래퍼(`/Users/smart-tn-083/practice/RunningCoach`), Supabase 백엔드(`supabase/**`, Auth/Postgres/RLS/Edge Function), OpenAI 코칭/secret 경계를 함께 떠올린다.
- 같은 사용자 목표 안에서 프론트 표시, 네이티브 브리지, DB/동기화, Edge Function, 배포/캐시 영향이 연결되면 현재 요청 창이 전체 계약과 검증 후보를 관리한다.
- workstream 파일은 담당 창 분리 기준이 아니라 읽을거리 인덱스다. 같은 목표 안의 다영역 작업은 현재 요청 창이 관리한다.
- 모든 업무 요청은 시작할 때 `완료 책임 창`을 하나 정한다. 기본값은 현재 요청 창이며, 완료 책임이 불명확하면 구현이나 문서 변경을 넓히기 전에 Issue/worktree 분리 기준을 정한다.
- 사용자가 완료를 명시해도 현재 창에서 완료 처리할 수 있는지, 후속 독립 업무 분리가 필요한지 먼저 검토한다.
- 기존 01~08 workstream 라우팅으로 안정적으로 처리하기 어려운 새 도메인이 반복되면 `01-harness-ops`에서 새 라우팅 파일 추가 여부를 먼저 검토한다.
- 업무 유형별로 `.harness/session/workstreams/*.md`의 시작 문서만 좁혀 읽는다.
- 이번 작업 설명이 있으면 `npm run harness:context -- "<작업 설명>"`으로 읽을 기준을 좁힙니다.
- 일반 작업은 완료 승인 전 `build`, 테스트, `harness:check`, 배포, commit, push를 실행하지 않습니다. 단, PaceLAB MVP 단계의 구현/버그/운영 요청은 먼저 GitHub Issue 생성/재사용과 Issue worktree/branch 분리를 완료한 뒤, 명시적 중단 지시가 없으면 배포 확인까지 수행하고 보고한 다음 사용자의 최종 완료 승인을 기다립니다.
- 기준 작업트리 `main` 직접 commit/push는 hook에서 차단합니다. 사용자 승인 예외만 `HARNESS_ALLOW_MAIN_COMMIT=1` 또는 `HARNESS_ALLOW_MAIN_PUSH=1`로 우회합니다.
- 긴 대화창을 마칠 때는 `active-context.md` 또는 `thread-handoff-YYYY-MM-DD.md`에 다음 대화가 이어받을 최소 정보만 남깁니다.
- `.harness/session/thread-handoff-2026-05-28.md`는 2026-05-28 긴 대화의 과거 스냅샷입니다. 최신 기준은 `active-context.md`, `project-memory.md`, `workflow-rules.md`, `decision-log.md`를 우선합니다.
