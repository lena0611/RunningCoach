# 작업 흐름 규칙

프로젝트 고유의 개발, 리뷰, 릴리스, 장애 대응 흐름을 기록합니다.

## 개발 흐름
- 정식 개발 작업의 단일 출처는 GitHub Issues로 둔다. 전체 상태판은 GitHub Project `PaceLAB Development`로 관리하며, 상세 기준은 `.harness/project/github-tracking-rules.md`를 따른다.
- 정식 Issue 작업은 Issue 단위 git worktree와 feature branch에서 수행하고, `main`은 머지와 배포 기준 브랜치로 유지한다. 동시에 여러 요청이 들어오면 각 Issue별 worktree, branch, PR을 분리한다.
- PaceLAB MVP 단계에서는 단순 확인, 검토, 조사, 기획 질문이 아닌 구현/버그/운영 요청을 사용자가 맡기면 중간 확인을 기본 대기점으로 두지 않는다. 명시적 보류 지시가 없고 완료 책임 창 안에서 해결 가능한 업무라면 완료 책임 창이 검증, 커밋, 푸시, PR, main 머지, 배포 확인까지 이어서 수행한 뒤 사용자에게 완료 확인을 요청한다. 단, GitHub Issue/Project를 `Done`, `Closed`, 또는 이에 준하는 최종 완료 상태로 변경하는 것은 사용자의 명시 지시가 있을 때만 수행한다.
- 에이전트가 GitHub Issue/Project를 생성하거나 수정할 때는 로컬 `gh` CLI를 1차 경로로 사용한다. GitHub App connector의 Issue/Project write 권한 부족이 확인된 작업에서는 connector-first 시도 후 fallback하는 흐름을 반복하지 않는다.
- `.harness/project/*`는 장기 기준과 결정 문서로 유지하고, 개별 백로그/진행 상태는 GitHub Issues/Projects에 둔다.
- 에이전트가 Supabase 데이터를 조회/수정할 때는 앱의 인증 컨텍스트와 RLS 정책을 1차 경로로 사용한다. 특히 특정 사용자의 데이터 확인은 처음부터 앱 로그인 세션, repository/store 함수, 또는 사용자가 제공한 현재 앱 컨텍스트의 사용자 ID로 재현한다. 인증 없는 직접 DB 조회나 service role/admin 우회 시도 후 앱 사용자 컨텍스트로 fallback하는 흐름을 반복하지 않는다.
- 아이디어는 `Idea` issue로 `Inbox`에 넣고, 목표/완료 조건/완료 책임 창/검증 후보가 정리되면 `Feature`, `Bug`, `Decision`, `Research` 등 정식 작업 issue로 승격한다.
- 정식 Issue 작업 중 대화가 길어지거나 여러 독립 목표/Issue 맥락이 섞이면 GitHub Project의 `업무 피로도` 필드를 `fresh`, `normal`, `tired`, `reset-needed` 중 하나로 자가진단해 맞춘다. 값이 `tired` 또는 `reset-needed`로 바뀌면 Issue 댓글에 이유와 권장을 남기고, `reset-needed`이면 넓은 새 작업을 시작하지 않는다.
- 먼저 도메인/아키텍처 결정이 일회성인지 반복 규칙인지 판단한다.
- 반복 규칙이면 `.harness/session/*`에만 두지 말고 `.harness/project/*` 문서로 승격한다.
- 구현은 GitHub Pages 정적 프론트 + Supabase 백엔드 경계를 우선하며, secret이 필요한 기능은 브라우저가 아니라 Supabase Edge Function 또는 서버리스 경계로 분리한다.
- 훈련법/문헌 지식화 요청이 많아지면 `.harness/project/training-knowledge-ops.md`의 운영 절차를 따른다. 사용자 요청 저장은 비용 없는 backlog insert로 유지하고, 조사/요약/규칙화는 별도 검토 작업으로 분리한다.
- 모바일 반복 사용 흐름을 우선 검토한다.
- 사용자 답변이 "추천/예상한 기본값대로"인 경우, 적용한 기본값을 `developer-input-queue.md`와 관련 project 문서에 구체적으로 남긴다.
- 버그픽스나 로직 강화 요청을 처리할 때는 코드 수정 전에 관련 project 룰 후보를 같이 찾고, 반복 가능성이 있으면 같은 커밋 또는 후속 커밋에서 `.harness/project/*`에 반영한다.
- `harness:check`의 “Project rule candidate check”는 통과 메시지가 아니라 실제 검토 요청으로 취급한다. 같은 종류의 버그가 재발 가능하면 룰을 업데이트한다.
- 정식 Issue를 `Done`으로 닫기 전에는 완료 책임 창이 재발 방지 기록 게이트를 통과해야 한다. 여러 번의 수정/배포, 반복 회귀, 독립 업무 분리나 인수인계 실패, 공유 계약 변경, 에이전트 운영 실패가 있었다면 `project-memory`, `decision-log`, 관련 `.harness/project/*` 중 적절한 장기 기억을 갱신한다.
- HealthKit/세션 상세/스플릿/경로 차트/자동 동기화/세션별 새로고침을 수정할 때는 구현 전에 `.harness/project/healthkit-data-contract.md`를 먼저 확인한다. 네이티브 후보 구조, 웹 `RunLog` 매핑, 샘플/랩/라우트 배열 의미를 추측하지 않는다.

## 요청 단위 풀스택 창 운영
- PaceLAB은 상시 workstream 대화창 분리 운영을 중단하고, 요청 단위 새 창 운영을 기본으로 한다.
- 사용자는 새 대화창 첫 메시지에 업무 내용만 적는다. 에이전트가 요청을 분류해 `.harness/session/workstreams/README.md`와 필요한 workstream 파일의 "먼저 읽을 문서"만 골라 읽는다.
- workstream 파일은 창 역할 분리 기준이 아니라 읽을거리 라우팅 인덱스다. 한 요청 안에서 기획, 디자인, 웹 개발, HealthKit/iOS, Supabase, AI 코칭, 하네스 운영이 함께 필요하면 현재 창이 풀스택 담당자로 전체를 관리한다.
- 모든 요청 창은 시작 시 기본 제품 표면을 함께 확인한다. 웹 프론트 래퍼(`src/**`, GitHub Pages, iOS WebView 화면), iOS 네이티브 래퍼(`/Users/smart-tn-083/practice/RunningCoach`), Supabase 백엔드(`supabase/**`, Auth/Postgres/RLS/Edge Function), OpenAI 코칭/secret 경계가 기본 표면이다.
- 특정 표면만 언급된 요청이라도 사용자 흐름이 다른 표면과 연결되면 같은 목표 안에서 데이터 계약, 브리지, 저장/동기화, 표시, Edge Function, 배포/캐시 영향까지 현재 요청 창이 검토한다.
- 모든 업무 요청의 기본 완료 책임 창은 현재 요청을 받은 새 창이다. 다른 상시 workstream 창으로 완료 책임을 이관하지 않는다.
- 에이전트는 요청이 정식 Issue 대상인지 판단하고, 필요하면 직접 GitHub Issue를 생성한다. 사용자가 Issue 번호를 먼저 만들 필요는 없다.
- 정식 개발/문서/운영 작업의 Issue 생성/재사용과 Issue worktree/branch 분리는 MVP 배포 자동 완료 흐름보다 먼저 적용되는 선행 게이트다.
- 사용자 프롬프트에 Issue URL 또는 Issue 번호가 있으면 구현이나 workstream 라우팅 전에 해당 Issue 본문, labels, Project fields를 먼저 조회한다. 조회한 `Workstream`, `Completion Owner`, `Target`, `Verification`을 기준으로 읽을거리와 작업 범위를 정한다.
- 사용자가 Issue 없이 업무 내용만 적으면 에이전트가 요청을 한글 우선 제목, 문제/목표, 범위, 제외 범위, 완료 조건, 검증 후보, Project fields, label 후보로 구체화한다. 같은 목표의 기존 Issue가 있는지 검색한 뒤 새 Issue 생성 또는 기존 Issue 재사용을 결정한다.
- 정식 Issue 작업은 계속 Issue 전용 git worktree와 `issue-<번호>/<짧은-설명>` branch에서 수행한다. 기준 작업트리 `main`은 merge/deploy/완료 정리 기준으로 유지한다.
- 새 Issue worktree를 만들거나 들어간 뒤에는 `. "$HOME/.nvm/nvm.sh" && nvm use`로 `.nvmrc` Node 버전을 맞추고, `node_modules`가 없으면 `npm ci`를 실행해 TypeScript/build/test 로컬 바이너리 누락을 막는다.
- 사용자가 동시에 여러 업무를 요청하면 업무마다 Issue, worktree, branch를 분리한다. 같은 창이 여러 요청을 순차 관리할 수는 있지만, 파일 변경, 검증, 커밋, PR은 Issue별 worktree 격리 원칙을 유지한다.
- 같은 제품/버그 목표의 완료 조건 안에 여러 기술 영역이 포함되면 하나의 Issue/worktree/PR로 묶을 수 있다. 분리 기준은 workstream 종류가 아니라 독립적인 목표, 동시 진행 필요성, 검증/배포 단위다.
- 사용자가 `검토만`, `조사만`, `PR까지만`, `커밋하지 마`, `배포하지 마`, `여기서 멈춰`처럼 중단점을 지정하면 그 지시를 우선한다.
- 대화창이 길어져 에이전트 응답이 느려지거나 서로 다른 Issue/branch/완료 조건이 섞이기 시작하면 구현을 더 밀지 말고 Issue 댓글 또는 `.harness/session/active-context.md`에 최소 인수인계를 남긴 뒤 새 요청 창에서 재개한다.
- 인수인계는 긴 작업 중단, 미커밋 변경 보존, 외부 수동 조치 대기, 컨텍스트 리셋 때만 사용한다. 긴 인수인계는 최신 상태와 다음 작업만 남기고, 회고나 모든 시도 내역은 남기지 않는다.
- 각 요청 창은 작업 시작, 종료, handoff 전에 `업무 피로도`를 확인한다. `tired`면 현재 Issue만 마무리하고 새 요청은 새 창으로 넘기며, `reset-needed`면 넓은 새 작업을 시작하지 않고 Issue 댓글과 handoff를 남긴다.
- build, test, `harness:check`, commit, push, PR 생성은 `CLAUDE.md`와 이 프로젝트의 MVP 기본 완료 흐름을 함께 따른다. 단순 확인/검토/조사 요청이거나 사용자가 명시한 중단점이 있으면 그 지점에서 멈춘다.
- 기준 작업트리 `main` 직접 commit/push는 hook에서 차단한다. 사용자 명시 승인 예외만 `HARNESS_ALLOW_MAIN_COMMIT=1` 또는 `HARNESS_ALLOW_MAIN_PUSH=1`로 우회한다.

## 완료 전 재발 방지 기록 게이트

완료 책임 창은 정식 Issue를 `Done`으로 닫기 전에 아래를 판단합니다. 하나라도 해당하면 장기 기억을 갱신해야 합니다.

- 같은 요청을 해결하기 위해 여러 번 수정, PR, merge, deploy를 반복했다.
- 사용자가 “왜 또 발생하나”, “재발하지 않게”, “다음에는 스스로”처럼 반복 실패를 지적했다.
- 독립 업무 분리, parent/child Issue, worktree 이관, 배포 확인처럼 운영 절차 실패가 있었다.
- 공유 계약, 데이터 계약, UI 공통 패턴, 검증 기준, 배포 기준이 바뀌었다.
- 같은 회귀가 다시 생길 가능성이 있어 다음 에이전트가 먼저 떠올려야 한다.
- 하네스/에이전트 운영 규칙 자체가 부족해 보강했다.

기록 위치:

| 위치 | 남길 내용 |
| --- | --- |
| `.harness/session/project-memory.md` | 세션이 바뀌어도 반복해서 참고할 안정적인 프로젝트 사실 |
| `.harness/session/decision-log.md` | 원인, 선택 이유, 포기한 대안, 예외, 기준 변경 이유 |
| `.harness/project/*.md` | 다음 작업에도 반복 적용할 도메인/아키텍처/워크플로우/검증 규칙 |
| GitHub Issue final comment | 이번 Issue에서 어떤 장기 기억을 남겼는지 또는 왜 남기지 않았는지 |

Issue final comment에는 항상 아래 항목을 포함합니다.

```text
재발 방지 기록:
- 반영: .harness/project/workflow-rules.md, .harness/session/decision-log.md
```

남길 장기 기준이 없을 때도 생략하지 않고 이유를 적습니다.

```text
재발 방지 기록:
- 해당 없음: 일회성 문구 수정이며 반복 규칙이나 공유 계약 변경 없음
```

## 완료 전 용어 안내 반영 게이트 (필수)

완료 책임 창은 정식 Issue를 `Done`으로 닫기 전에, 이번 작업이 **앱 사용자에게 보이는 용어/개념**을 추가·변경·삭제했는지 반드시 점검하고 필요하면 용어 안내 화면을 함께 갱신합니다. 이 게이트는 선택이 아니라 완료 전 필수 점검입니다.

용어 사전의 정본은 Supabase 마이그레이션 시드 `supabase/migrations/*_glossary_terms.sql`(또는 후속 시드 마이그레이션)이며, 웹 번들 fallback `src/entities/glossary/glossaryTerms.ts`와 화면(`src/pages/glossary/GlossaryPage.vue`)이 같은 내용을 미러링합니다.

- 점검 질문: 이번 변경으로 새 용어/약어/지표/세션 유형/심박·부하·부상·코칭 개념이 생겼거나, 기존 정의·기준 숫자·표현이 바뀌었는가?
- 하나라도 해당하면:
  - 새 시드 마이그레이션(`YYYYMMDDNN_glossary_terms_*.sql`)으로 용어를 추가/갱신한다(정본).
  - `src/entities/glossary/glossaryTerms.ts` 번들 fallback을 같은 내용으로 갱신한다.
  - 필요하면 카테고리 메타(`src/entities/glossary/model.ts`)와 정합성 테스트(`glossary.test.ts`)도 함께 갱신한다.
  - 시드와 번들 fallback의 slug/정의가 어긋나지 않게 한다.
- 해당 없으면 생략 사유를 Issue final comment에 남긴다.

Issue final comment에는 항상 아래 한 줄을 추가합니다.

```text
용어 안내 반영:
- 반영: supabase/migrations/<새 시드>.sql, src/entities/glossary/glossaryTerms.ts (+ 필요 시 model.ts, glossary.test.ts)
```

또는 변경이 없을 때:

```text
용어 안내 반영:
- 해당 없음: 앱 사용자 노출 용어/개념 변경 없음
```

## 완료 확인 후 기준 main 최신화 게이트

완료 책임 창은 배포 또는 배포 생략 확인 뒤 사용자가 완료를 명시하면 GitHub Issue/Project를 `Done` 또는 `Closed`로 바꾸기 전에 기준 작업트리의 `main`을 최신화합니다.

- 기준 작업트리: `/Users/smart-tn-083/practice/run-ai`
- 실행 조건:
  - PR이 `main`에 merge되었다.
  - 배포가 필요한 작업이면 배포 성공을 확인했고, 배포가 없는 작업이면 배포 생략 사유를 Issue 댓글에 남겼다.
  - 사용자가 완료 처리, 최종 완료, 닫기 등 명시적 완료 지시를 했다.
- 실행 순서:
  - 기준 작업트리에서 `git switch main`
  - `git pull --ff-only`
  - `git status -sb`로 `main...origin/main` 기준 clean 상태 확인
- 예외:
  - 기준 작업트리에 사용자가 만든 미커밋 변경이 있으면 임의로 stash, reset, checkout하지 않고 상태와 충돌 가능성을 먼저 보고한다.
  - 다른 Issue 전용 worktree는 해당 Issue 완료 또는 정리 전까지 건드리지 않는다.

이 게이트를 통과한 뒤 완료 요약 댓글, `재발 방지 기록`, Project `Done`, Issue close를 처리합니다.

## 완료 후 Issue worktree·브랜치 정리 게이트

Issue 완료 책임 창은 Project `Done`과 Issue close까지 끝낸 뒤 로컬 Issue worktree와 머지된 feature 브랜치 정리 여부를 확인합니다. `git worktree remove`는 작업 폴더만 지우고 브랜치 ref는 남기므로, worktree 정리와 브랜치 정리를 같이 처리합니다.

- 삭제 대상 조건:
  - GitHub Issue가 `Closed` 상태다.
  - GitHub Project `PaceLAB Development`의 Status가 `Done`이다.
  - 해당 worktree에서 `git status --short`가 비어 있다.
  - feature 브랜치가 `main`에 머지 완료됐다.
  - 해당 worktree가 배포 확인, 사용자 확인, 후속 디버깅, handoff에 더 이상 필요하지 않다.
- 실행 순서:
  - 기준 작업트리 `/Users/smart-tn-083/practice/run-ai`에서 `git worktree list`로 대상 경로를 확인한다.
  - 대상 worktree에서 `git status -sb`로 미커밋 변경이 없는지 확인한다.
  - `git worktree remove <경로>`를 실행한다.
  - `git worktree prune`을 실행한다.
  - `git worktree list`로 제거 결과를 확인한다.
  - 머지된 브랜치를 정리한다. 원격은 저장소 `deleteBranchOnMerge=true`로 PR 머지 시 자동 삭제되는 것이 정상 경로다. 설정 이전에 머지된 옛 브랜치 등 원격에 남은 ref를 수동으로 지울 때는 `gh api -X DELETE repos/<owner>/<repo>/git/refs/heads/<branch>`를 쓴다. 기준 작업트리가 `main`에 있으면 pre-push 가드가 `git push origin --delete <branch>`(delete push)도 main push로 보고 차단하므로, `git push --delete` 대신 `gh api` 경로를 기본으로 한다.
  - 로컬 브랜치는 기준 작업트리에서 `git branch -d <branch>`로 지운다(머지 완료라 `-d`로 충분하고, `-D` 강제 삭제는 미머지 확신이 있을 때만).
  - `git branch --merged main | grep issue-`로 남은 머지된 브랜치를 확인한다.
- PR 머지 시 기본 동작:
  - `gh pr merge <번호> --merge --delete-branch`처럼 `--delete-branch`를 기본으로 붙여 머지 직후 브랜치를 정리한다.
  - 저장소 설정은 `deleteBranchOnMerge=true`를 유지한다(`gh repo edit <repo> --delete-branch-on-merge`). 이 설정이 원격 브랜치 누적을 막는 1차 방어선이다.
- 보류 조건:
  - Issue가 `Open`, Project Status가 `Deployed`, `Review`, `Verify`, `In Progress` 중 하나면 기본적으로 삭제하지 않는다.
  - 미커밋 변경이 있으면 임의로 삭제하지 않고 변경 파일과 삭제 위험을 보고한다.
  - 사용자가 특정 worktree 삭제를 명시하면 미커밋 변경이 있어도 해당 지시를 우선하되, 실행 전 변경 소실을 짧게 알린다.
  - 브랜치가 `main`에 머지되지 않았으면 로컬/원격 브랜치를 임의로 삭제하지 않는다.

완료 댓글 또는 후속 정리 댓글에는 worktree와 브랜치 제거 여부를 남깁니다. 정리하지 않았다면 `Open/Deployed`, 미커밋 변경, 미머지, 후속 확인 필요 같은 보류 사유를 적습니다.

작업 유형별 시작 문서:

| 작업 유형 | 먼저 읽을 문서 |
| --- | --- |
| 전체 목록 | `.harness/session/workstreams/README.md` |
| 백로그/이슈/프로젝트 운영 | `.harness/project/github-issue-management-guide.md`, `.harness/project/github-tracking-rules.md`, `.harness/project/workflow-rules.md`, `.harness/project/commit-push-rules.md` |
| 제품/기획/범위 | `.harness/project/project-charter.md`, `.harness/project/scope-contract.md`, `.harness/session/decision-log.md` |
| 버그픽스/회귀 | `.harness/session/active-context.md`, `.harness/project/workflow-rules.md`, 관련 `critical-paths.md` 항목 |
| UI/UX | `.harness/project/ui-system-contract.md`, `.harness/project/workflow-rules.md`, 영향 화면의 공통 컴포넌트 |
| 코칭/훈련 로직 | `.harness/project/ai-coaching-goal.md`, `.harness/project/running-coaching-standards.md`, `.harness/project/domain-rules.md` |
| HealthKit/iOS | `.harness/project/healthkit-data-contract.md`, `/Users/smart-tn-083/practice/RunningCoach` |
| Supabase/OpenAI Edge Function | `.harness/project/config-contract.md`, `.harness/project/ai-coaching-goal.md`, `supabase/functions/coach-run/index.ts` |
| 부상관리 도메인 | `.harness/project/domain-rules.md`, `.harness/project/ai-coaching-goal.md`, `src/shared/ui/InjuryBodySelector.vue` |
| 하네스/정책 | `.harness/policy/context-protocol.md`, `.harness/project/workflow-rules.md`, `.harness/session/decision-log.md` |

새 작업 유형을 추가할 때는 `.harness/session/workstreams/README.md`의 `새 workstream 추가 기준`을 따른다.

대화창 종료 또는 분기 전 기록 기준:

| 기록 위치 | 기록할 내용 |
| --- | --- |
| `.harness/session/active-context.md` | 현재 가장 최신 제품/작업 상태와 새 대화가 먼저 볼 인수인계 |
| `.harness/session/next-session-reminder.md` | 다음 대화창에서 바로 실행할 확인 순서와 작업 후보 |
| `.harness/session/decision-log.md` | 이후에도 영향을 주는 구조 결정, 예외, 기준 충돌 해결 |
| `.harness/session/project-memory.md` | 세션이 바뀌어도 오래 유지되는 안정적인 프로젝트 사실 |
| `.harness/session/developer-input-queue.md` | 사용자 확인 없이는 확정할 수 없는 질문 |

## 리뷰 기준
- 원본 파일 또는 secret이 브라우저 저장소에 남지 않는지 확인한다.
- FIT import 결과가 거리, 시간, 페이스, 심박, 케이던스를 일관되게 계산하는지 확인한다.
- 저장 데이터 스키마 변경은 기존 로컬 데이터 호환성을 검토한다.
- Supabase 스키마 변경은 migration, repository 매핑, RLS/중복 방지, Edge Function 컨텍스트를 함께 확인한다.
- Vue 앱 부트스트랩은 인증/DB/HealthKit 같은 외부 I/O가 완료될 때까지 mount를 막지 않는다. 초기 인증은 짧은 timeout으로 제한하고, RunLog/Memory 동기화는 화면 mount 이후 store error 상태로 처리한다.
- HealthKit 자동 동기화 변경 시 `runStore` 로딩 완료 대기, 중복 외부 ID 처리, 일부 후보 실패 시 부분 성공 처리, 사용자 토스트 메시지를 함께 확인한다.
- HealthKit 데이터 표시나 추론 변경 시 `.harness/project/healthkit-data-contract.md`와 실제 타입(`HealthKitRunCandidate`, `Lap`, `RunMetricSample`, `RunRoutePoint`)이 일치하는지 확인한다. 특히 lap은 Workoutdoors step이 아니라 1km 전후 split일 수 있고, 랩 최대심박은 원본에 없으면 `metricSamples` 기반 보정 표시라는 점을 리뷰한다.
- 코칭 규칙 변경은 사용자 목표, 최근 기록, 부상/더위 제약과 충돌하지 않는지 확인한다.
- AI 코칭 변경은 선택 기록 날짜와 코칭 생성 시각을 혼동하지 않는지 확인한다.
- RunLog 기반 화면 변경은 Dashboard, Run Log, Coach가 같은 저장소 데이터를 일관되게 읽는지 확인한다.
- 목표 관련 계산은 현재 목표 `2026-11-21까지 10km 59:59`를 기준으로 검토한다.

## 릴리스 절차
- GitHub Pages 같은 정적 배포를 기준으로 `npm run build` 결과물을 사용한다.
- AI 에이전트/하네스 운영 파일만 변경된 push는 GitHub Pages 배포를 트리거하지 않는다. `.github/workflows/pages.yml`의 `paths-ignore`는 `.harness/**`, `.codex/**`, `.agents/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, Copilot instructions, commit template, Issue template에만 적용하고, `src/**`, `public/**`, `package.json`, `.nvmrc`, Vite 설정, workflow 자체, Supabase 함수는 배포 영향 후보로 유지한다.
- 배포 전 정적 라우팅과 PWA manifest가 유지되는지 확인한다.
- GitHub Pages 배포 직후 iOS WebView는 캐시/전파 지연이 있을 수 있다. 새 배포 후 첫 실행 이슈는 Pages 배포 완료, WebView 캐시, 앱 재시작, 네이티브 진단 로직 순서로 확인한다.

## 장애 대응
- 파일 import 실패 시 원본 파일을 저장하지 않고 사용자에게 수동 입력 경로를 제공한다.
- 저장 데이터 손상 가능성이 있으면 export/import 백업 기능을 우선 검토한다.
- Strava 연동 장애는 로컬 FIT import fallback을 유지한다.
- Dashboard가 0km 또는 빈 목록을 보이면 먼저 `run_logs` 저장 여부, 인증 세션, `runStore.load()` 호출 여부, 화면 로딩 오류 표시 여부를 순서대로 확인한다.
- 수정/삭제가 안 된다고 보고되면 API 실패와 UX 오해를 분리한다. 버튼 상태, 확인창, 오류 메시지, 수정 폼 위치를 먼저 점검한다.

## 검증 명령
- 아래 검증 명령은 `CLAUDE.md`의 완료 승인 게이트에 따라 사용자의 최종화 승인 뒤 실행한다.
- 검증 명령을 실행하기 전에는 프로젝트 루트의 `.nvmrc` 존재를 확인하고, 존재하면 반드시 `nvm use`를 먼저 실행한다. `nvm use` 없이 하네스/빌드/테스트를 돌려 Node 버전 오류가 나면 검증 절차 미준수로 본다.
- Codex 또는 새 터미널 셸에서 Node 버전이 낮아 npm 스크립트가 실패하면 작업을 포기하지 않는다. 프로젝트 루트에서 `. "$HOME/.nvm/nvm.sh" && nvm use`로 `.nvmrc` 버전을 활성화한 뒤 같은 npm 명령을 재시도한다.
- Codex hook이 세션 시작 시 `nvm use`를 실행해도 이후 shell 명령에 영구 적용되지 않는다. 에이전트가 npm/tsc/build/test/harness 명령을 실행하는 실제 shell에서 다시 `nvm use`를 적용한다.
- Issue worktree에서 `node_modules`가 없으면 검증 실패로 해석하지 않고 먼저 `npm ci`로 의존성을 준비한다. `node_modules` 복사나 symlink는 캐시/경로 문제를 만들 수 있으므로 기본값으로 쓰지 않는다.
- 기본 검증: `npm run build`
- 단위/컴포넌트 회귀 검증: `npm run test:run`
- 모바일 E2E smoke 검증: `npm run e2e`
- Supabase Edge Function 검증: `npm run supabase:functions:check`
- 하네스 검증: `npm run harness:check`
- 하네스 문맥 확인이 필요한 큰 변경: `npm run harness:context -- "<작업 설명>"`
- 검증 순서는 변경 성격에 맞는 단위/컴포넌트 테스트 또는 E2E 테스트 추가 여부를 먼저 판단하고, 필요한 테스트를 추가/갱신해 통과시킨 뒤 `npm run harness:check`로 간다. 하네스 체크는 테스트 필요성 판단을 대체하지 않는다.
- `supabase/functions/**`를 변경하면 `npm run harness:check`가 `supabase:functions:check`를 자동 호출한다. 그래도 Edge Function만 빠르게 확인할 때는 같은 Node 준비 절차 후 `npm run supabase:functions:check`를 직접 실행한다.
- Edge Function의 인증·세션·토큰·서명·rate limit 같은 보안 경계를 추가/변경하면 `deno check`/`build`/unit test 통과만으로 완료로 보지 않는다. 배포 후 승인 사용자 로그인 상태에서 실제 보호 대상 호출(예: AI 코칭 1회)을 스모크 검증하는 것이 완료 조건이다. 캐시된 옛 토큰이 있으면 클라이언트 캐시(sessionStorage 등)를 비운 뒤 검증한다. 근거: #93에서 동기 throw 폴백 무력화·토큰 구분자 `.` 충돌 2건이 정적 검사를 통과하고 프로덕션에서야 403/에러로 드러났다(`.harness/session/decision-log.md` 2026-06-04 참고).

## 테스트 전략 선택지
테스트 루트나 `test` script가 없다면 아래 중 하나를 선택해 이 문서 또는 `decision-log.md`에 기록합니다.

1. 초기 단계: lint + build + 수동 확인
2. 단위 테스트: 프로젝트 스택에 맞는 unit test 도구 도입
3. 통합 테스트: API, 저장소, 외부 연동 경계 검증
4. E2E 테스트: 주요 사용자/운영 흐름 검증
5. 테스트 보류: 사유와 재검토 조건을 `decision-log.md`에 기록

## 회귀 테스트 기준
- 계산/포맷/추천 로직을 바꾸면 Vitest 단위 테스트를 먼저 추가하거나 갱신한다.
- 반복 UI 버그가 있었던 `BottomSheetSelect`, 날짜 표시, 페이스/시간 표시, Run Log action, stack header는 컴포넌트 테스트 대상이다.
- stack header와 sticky 요소를 함께 수정하면 모바일 viewport에서 실제 좌표를 계측한다. 최소 `headerBottom`, `scrollContainerTop`, `stickyTop`, `stickyTop - headerBottom`을 기록하고, 헤더와 맞물려야 하는 화면은 차이가 0px인지 확인한다. `top: 0`, 고정 헤더 높이, 음수 offset 같은 추정값만으로 완료하지 않는다.
- stack 화면의 page-specific padding override는 공통 `.memory-stack-content` 선언과 CSS 순서/선택자 특이성을 같이 검증한다. sticky 간격 문제는 `top`이 아니라 부모 padding이 다시 적용된 회귀일 수 있다.
- sticky 지도와 상태/정보바를 함께 고정하면 지도 bottom과 정보바 top의 실제 차이를 계측한다. 둘이 붙어야 하는 UI는 `barTop - cardBottom = 0px`, sticky group gap `0px`, group `overflow: hidden`을 확인해 뒤 스크롤 콘텐츠가 틈으로 보이지 않게 한다.
- drawer 또는 stack의 sticky header를 수정하면 scroll container top과 header top의 차이, panel padding, header background를 함께 계측한다. header 아래로 폼 label/input이 비치는 구조면 회귀로 본다.
- 코칭/채팅 입력 UI는 한 줄 기본, 최대 3줄 자동 확장, 입력 지우기 버튼, 원형 아이콘 전송 버튼을 기본 패턴으로 검토한다. 텍스트 전송 버튼이나 2줄 고정 textarea로 돌아가면 모바일 공간을 낭비하는 회귀로 본다.
- 스플릿/랩 목록처럼 모바일 폭이 좁은 표는 모든 주요 컬럼이 한 화면에서 최소한 일부 보이는지 확인한다. 컬럼 폭, gap, 숫자 폰트가 커져 케이던스/심박 같은 후행 컬럼이 사라지면 회귀로 본다.
- 목록/그룹 화면의 집계(합계·평균·요약·횟수)는 무한스크롤·페이지네이션으로 잘린 visible slice가 아니라 필터된 전체 데이터로 계산한다. 점진 렌더링(slice)은 표시할 행에만 적용하고 집계엔 적용하지 않는다. 순수 집계 로직은 컴포넌트에서 모듈로 분리하고, "부분 표시 상태에서도 집계가 전체 기준과 같은지"를 Vitest로 검증한다. 근거: #190에서 기록 월별 요약이 `groupRunsByMonth(visibleRuns)`로 부분 집계돼 스크롤 전 값이 틀렸다(`src/pages/run-log/runLogSummary.ts`의 `groupRunsByMonth` + `buildVisibleRunGroups` 분리 패턴 참고).
- 라우팅/접근 제어/모바일 셸이 바뀌면 Playwright E2E smoke를 갱신한다.
- 하단 네비, lazy route import, GitHub Pages/iOS WebView 배포 캐시 복구를 건드리면 `요약 -> 기록 -> 기억 -> 요약` route 이동 E2E를 통과시킨다. 하단 네비 위치나 breakpoint를 바꾸면 900px 경계에서도 실제 좌표를 계측해 네비가 의도한 하단 fixed 위치를 유지하는지 확인한다.
- Supabase, HealthKit, OpenAI 같은 외부 경계는 직접 호출하지 않고 adapter/mock 경계로 테스트한다. store 단위 테스트가 로컬 저장 동작을 검증한다면 `VITE_SUPABASE_*` 환경변수 유무에 결과가 달라지지 않도록 Supabase 설정 모듈이나 repository 경계를 명시적으로 mock한다.
- 신규 기능이 회귀 위험이 높은 화면 흐름을 추가하면 `build`만으로 완료하지 않고 `test:run` 또는 `e2e` 중 최소 하나를 함께 통과시킨다.

## 변경 규칙
- 작업 흐름이 바뀌면 README, CI, hook, `harness:check` 명령과 함께 검토합니다.
- 임시 예외는 `waivers.json` 또는 `decision-log.md`에 범위와 만료 조건을 남깁니다.
- `npm run hooks:install`은 `core.hooksPath`를 `.githooks`로 설정합니다. 기존 `.git/hooks/*` 또는 기존 `core.hooksPath`의 hook은 삭제하지 않고 `harness.previousHooksPath`에 저장해 `.githooks/*`에서 먼저 체인 실행합니다.
