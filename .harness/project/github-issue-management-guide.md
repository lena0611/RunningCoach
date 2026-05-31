# GitHub 이슈 운영 가이드

PaceLAB의 정식 개발 작업은 GitHub Issues에 등록하고, 전체 진행 상태는 GitHub Project `PaceLAB Development`에서 관리합니다.

- Project: `https://github.com/users/lena0611/projects/1`
- Repository: `lena0611/RunningCoach`
- 기준 문서: [GitHub 작업 추적 규칙](./github-tracking-rules.md)

## 필수 체크리스트

GitHub Issue, Project, branch, PR, 댓글을 만들거나 수정하기 전에 에이전트는 아래를 먼저 확인합니다.

- 사용자 프롬프트에 Issue URL 또는 Issue 번호가 있으면 구현이나 라우팅 전에 해당 Issue 본문, labels, Project fields를 먼저 조회한다.
- Issue 조회 결과의 `Workstream`, `Completion Owner`, `Target`, `Verification`을 기준으로 필요한 workstream 파일과 프로젝트 문서를 고른다.
- 사용자 프롬프트가 새 정식 업무 요청이면 원문을 그대로 Issue에 붙이지 않고 한글 우선 제목, 문제/목표, 범위, 제외 범위, 완료 조건, 검증 후보, Project fields, label 후보로 구체화한다.
- 새 Issue를 만들기 전 `gh issue list` 또는 `gh issue view`/검색으로 같은 목표의 기존 Issue가 있는지 확인한다.
- 이 요청이 Issue 생성 대상인지 판단한다.
- Issue가 필요하면 본문에 문제/목표, 범위, 완료 조건, 검증 후보, 관련 문서 링크를 남긴다.
- Project 필드 `Status`, `Workstream`, `Type`, `Priority`, `Completion Owner`, `Target`, `Verification`, `Blocked`, `업무 피로도`를 맞춘다.
- 모바일 스캔용 label을 함께 맞춘다. 최소 `type:*` label은 항상 붙이고, 확실한 경우에만 `ws:*`, `target:*`, `verify:*` label을 붙인다.
- 정식 Issue 작업은 `main`이 아니라 Issue 전용 git worktree와 `issue-<번호>/<짧은-설명>` branch에서 진행한다.
- 동시에 여러 Issue를 진행하면 같은 로컬 작업트리에 변경을 섞지 않는다.
- 댓글은 실제 Markdown 줄바꿈으로 작성한다. 문자열 `\n`이 보이게 만들지 않는다.
- Issue 본문은 실행 범위와 상태를, `.harness/project/*`는 장기 기준을 담는다. 둘을 서로 대체하지 않는다.
- 같은 목표 안의 다영역 요청은 현재 요청 창이 풀스택으로 관리하고, 독립 목표나 동시 업무는 Issue/worktree/branch를 분리한다.
- 긴 대화창이나 혼합 맥락에서 작업하면 `업무 피로도`를 자가진단하고, 값이 바뀌면 Issue 댓글에 이유와 권장을 남긴다.

## 기본 원칙

- 머릿속 아이디어, 대화 중 나온 후보, 버그 의심은 바로 구현하지 말고 먼저 Issue로 정리합니다.
- 정식 개발 작업의 단일 출처는 GitHub Issue입니다. `.harness/project/*`에는 개별 할 일 목록을 누적하지 않습니다.
- Project는 상태판입니다. Issue의 목표, 완료 조건, 검증 후보가 바뀌면 Issue 본문이나 댓글에 남기고 Project 필드를 맞춥니다.
- 작업 중 기준이 생기면 Issue만 닫지 말고 `.harness/project/*` 또는 `.harness/session/decision-log.md`에 승격합니다.
- 완료 책임 창은 Issue마다 하나만 둡니다. 기본값은 현재 요청 창이며, 같은 목표 안의 기획/디자인/웹/네이티브/Supabase 작업까지 함께 소유합니다.
- 에이전트가 Issue나 Project를 실제 등록/수정할 때는 로컬 `gh` CLI를 먼저 사용합니다. GitHub App connector의 write 권한 부족이 확인된 작업에서는 connector 시도 후 fallback하는 흐름을 반복하지 않습니다.
- Codex 창끼리는 직접 대화하지 못합니다. 동시에 여러 독립 업무를 진행하거나 handoff가 필요한 업무는 GitHub Issue, PR, Project를 공용 작업판으로 사용합니다.

## GitHub와 프로젝트 문서의 역할

GitHub Issue와 Project는 작업을 관리하고, `.harness/project/*` 문서는 오래 유지될 기준을 관리합니다. 둘은 서로 대체하지 않습니다.

| 위치 | 역할 | 남길 내용 |
| --- | --- | --- |
| GitHub Issue | 실행 단위 | 문제, 목표, 범위, 완료 조건, 검증 후보, 현재 상태, 후속 작업 |
| GitHub Project | 상태판 | Status, Workstream, Type, Priority, Completion Owner, Target, Verification, Blocked, 업무 피로도 |
| GitHub Labels | 모바일 스캔 보조 | type, workstream, target, verification, blocked/fatigue 예외 신호 |
| `.harness/project/*` | 장기 기준 | 제품/도메인/아키텍처/운영 규칙, 화면 정보 구조, 데이터 계약 |
| `.harness/session/decision-log.md` | 결정 이력 | 왜 그렇게 결정했는지, 포기한 대안, 후속 기준 |

Issue에 프로젝트 문서 내용을 길게 복사하지 않습니다. Issue에는 관련 문서 링크와 이번 작업의 완료 조건을 남깁니다.

프로젝트 문서에 Issue 진행 상태를 누적하지 않습니다. 진행 상태는 GitHub Issue와 Project에서 관리합니다.

문서 변경이 소스 코드 변경이 아니더라도 `.harness/project/*`의 장기 기준 문서는 형상관리 대상입니다. `.gitignore`에 넣지 않습니다. 반대로 스캔 결과, 임시 handoff, 로컬 설정, secret, 빌드 산출물은 `.gitignore` 대상입니다.

## Workstream과 Assignee

GitHub의 `Assignees`는 GitHub 사용자 계정을 의미합니다. `03-ui-ux` 같은 workstream은 GitHub 사용자 계정이 아니므로 Assignee에 자동으로 들어가지 않습니다.

PaceLAB에서 `Workstream`은 담당 창 분리 기준이 아니라 업무 성격과 읽을거리 라우팅 기준입니다. `Completion Owner`는 최종 완료 판단을 맡는 요청 창입니다.

- `Workstream`: 주요 업무 유형과 먼저 읽을 문서 라우팅
- `Completion Owner`: 최종 완료 조건, 리뷰, 검증 후보 정리를 책임질 요청 창
- `Assignees`: 실제 GitHub 사용자 담당자가 필요할 때만 사용

## 모바일 스캔 라벨

GitHub 모바일 앱에서 Project field가 많이 보이면 Issue 카드 높이가 커집니다. Project field는 관리 원본으로 유지하고, 모바일에서 빠르게 훑을 값만 label로 짧게 복제합니다.

원칙:

- Project field가 원본입니다. label은 모바일 스캔과 검색 보조입니다.
- label과 Project field가 다르면 Project field를 기준으로 label을 고칩니다.
- 최소 `type:*` label은 항상 붙입니다.
- `ws:*`, `target:*`, `verify:*` label은 값이 확실할 때만 붙입니다.
- `blocked` label은 `Blocked=yes`일 때만 붙이고, 해소되면 제거합니다.
- `fatigue:tired`, `fatigue:reset` label은 `업무 피로도`가 예외 상태일 때만 붙입니다. `fresh`나 `normal`은 label로 붙이지 않습니다.
- `Completion Owner`는 보통 label로 만들지 않습니다. 독립 목표 분리나 parent/child Issue에서 라우팅 workstream과 완료 책임이 다를 때 Issue 본문이나 댓글에 명시합니다.

권장 label:

| 그룹 | Label |
| --- | --- |
| Type | `type:idea`, `type:feature`, `type:bug`, `type:chore`, `type:decision`, `type:research`, `type:release` |
| Workstream | `ws:01-harness`, `ws:02-product`, `ws:03-ui`, `ws:04-running`, `ws:05-ai`, `ws:06-ios`, `ws:07-data`, `ws:08-injury` |
| Target | `target:mvp`, `target:beta`, `target:app-store`, `target:later` |
| Verification | `verify:none`, `verify:unit`, `verify:e2e`, `verify:build`, `verify:harness`, `verify:manual` |
| Exception | `blocked`, `fatigue:tired`, `fatigue:reset` |

모바일에서 Project field를 줄여 보고 싶으면 기본적으로 `Status`, `Priority`, `Labels`만 남기고 나머지 상세 field는 필요할 때 펼쳐 봅니다. 현재 GitHub CLI와 공개 GraphQL mutation으로 Project view의 모바일 표시 field를 안정적으로 자동 설정하지 않으므로, view 표시는 GitHub 앱 또는 웹 UI에서 수동으로 조정합니다.

## Parent/Child Issue

같은 목표 안에서 여러 영역이 필요하다는 이유만으로 parent/child Issue를 만들지 않습니다. 현재 요청 창이 풀스택으로 관리하고, 관련 workstream 문서를 읽을거리로만 좁힙니다.

parent/child Issue는 아래처럼 목표가 실제로 분리될 때 사용합니다.

- 사용자가 동시에 여러 독립 업무를 요청했다.
- 한 요청 안에 서로 다른 완료 조건, 검증, 배포 경로가 섞였다.
- 한 Issue에서 진행하면 worktree/branch/PR 범위가 섞일 위험이 크다.
- 외부 대기, 수동 검수, 별도 선행 결정 때문에 일부만 독립적으로 진행해야 한다.

| 구분 | 소유 | 역할 |
| --- | --- | --- |
| parent Issue | 완료 책임 요청 창 | 전체 목표, 완료 조건, child Issue 목록, 최종 통합, merge/deploy 판단, 사용자 완료 확인 후 Done/close |
| child Issue | 해당 요청 창 또는 후속 요청 창 | 자기 범위 구현/조사/문서화, worktree/branch/PR, 검증 결과 보고 |
| GitHub Project | 전체 | Status, Workstream, Completion Owner, Blocked 상태 조감 |
| Issue 댓글/PR | 각 요청 창 | 전달, 결과 보고, 차단 조건, 검증 기록 |

parent Issue에는 아래를 남깁니다.

```markdown
## 전체 목표
- ...

## Child Issues
- [ ] #12 03-ui-ux: ...
- [ ] #13 07-data-supabase: ...

## 통합 조건
- 모든 필수 child Issue가 Done이거나 parent에 명시적으로 handoff됐다.
- merge/deploy 전 충돌이나 누락된 검증이 없다.

## 완료 책임 창
- 현재 요청 창
```

child Issue에는 parent 링크와 자기 범위만 남깁니다.

```markdown
Parent: #11
Workstream: 03-ui-ux
Completion Owner: 현재 요청 창

## 범위
- ...

## 완료 시 parent에 남길 것
- PR 링크
- 검증 결과
- 남은 리스크 또는 handoff 조건
```

child Issue를 맡은 요청 창은 자기 child Issue를 끝내면 parent Issue 댓글에도 짧게 handoff를 남깁니다.

```markdown
Child #12 완료 보고.

- Workstream: 03-ui-ux
- PR: #20
- 검증: ...
- Parent 통합 시 주의: ...
```

완료 책임 요청 창은 GitHub에서 child Issue와 PR 상태를 읽고 최종 통합합니다. 다른 Codex 창을 직접 깨우거나 상태를 추측하지 않습니다.

## 언제 Issue를 만드나

Issue를 만듭니다:

- 실제 구현, 문서 변경, 운영 변경으로 이어질 가능성이 있다.
- 나중에 다시 판단해야 할 아이디어나 제품 가설이다.
- 버그, 회귀, 깨진 사용자 흐름을 추적해야 한다.
- 여러 독립 업무가 이어서 처리되어야 한다.
- 완료 조건과 검증 후보를 남겨야 한다.

Issue를 만들지 않아도 됩니다:

- 단순 질문 답변으로 끝난다.
- 이미 진행 중인 Issue의 작은 세부 작업이다.
- 한 번 쓰고 버릴 임시 인수인계 문구다.
- 장기 기준 문서에 바로 반영해야 하는 확정 규칙이다.

## 템플릿 선택

| 상황 | 템플릿 | Type |
| --- | --- | --- |
| 제품 기능, UX, 데이터 흐름, 코칭 동작을 추가하거나 개선 | `Feature` | `feature` |
| 기대 동작과 실제 동작이 다름 | `Bug` | `bug` |
| 아직 정식 작업은 아니지만 보존할 가치가 있음 | `Idea` | `idea` |
| 기술/제품/운영 판단 자체가 산출물 | 일반 Issue 또는 `Feature` 템플릿 변형 | `decision` |
| 조사, 비교, 가능성 검토 | 일반 Issue 또는 `Idea` 템플릿 변형 | `research` |
| 배포, 출시, 검수, App Store 준비 | 일반 Issue 또는 `Feature` 템플릿 변형 | `release` |
| 하네스, 문서, 의존성, 정리 작업 | 일반 Issue 또는 `Feature` 템플릿 변형 | `chore` |

## 필드 작성 기준

| 필드 | 작성 기준 |
| --- | --- |
| `Status` | 처음 등록하면 보통 `Inbox`, 바로 착수 가능하면 `Ready` |
| `Workstream` | 주요 업무 유형과 먼저 읽을 문서 라우팅 |
| `Type` | 작업의 성격 |
| `Priority` | 지금 안 하면 큰 손실이면 `P0`, MVP 핵심이면 `P1`, 중요하지만 미룰 수 있으면 `P2`, 나중 후보면 `P3` |
| `Completion Owner` | 최종 리뷰와 완료 조건을 책임질 요청 창 |
| `Target` | `MVP`, `Beta`, `App Store`, `Later` 중 목표 시점 |
| `Verification` | 완료 전 필요한 검증 후보 |
| `Blocked` | 막힌 외부 의존성이나 선행 결정이 있으면 `yes` |
| `업무 피로도` | 해당 Issue를 맡은 대화창의 컨텍스트 부하 자가진단 |

Priority는 긴급도와 제품 영향도를 함께 봅니다.

- `P0`: 현재 핵심 흐름을 막거나 데이터 손상, 배포 실패, 심각한 회귀를 만든다.
- `P1`: MVP 또는 현재 목표 달성에 직접 필요하다.
- `P2`: 제품 품질이나 운영 안정성에 중요하지만 즉시 착수하지 않아도 된다.
- `P3`: 아이디어, 개선 후보, 장기 백로그다.

## Status 흐름

| 상태 | 이동 기준 |
| --- | --- |
| `Inbox` | 새로 들어온 상태. 아직 범위, 우선순위, 완료 책임이 정리되지 않았다. |
| `Backlog` | 보존할 가치가 있지만 지금 착수하지 않는다. |
| `Ready` | 목표, 완료 조건, workstream, 검증 후보가 정리됐다. |
| `In Progress` | 실제 작업을 시작했다. 담당 창이나 담당자가 댓글로 현재 진행을 남긴다. |
| `Review` | 변경은 끝났고 완료 책임 창의 검토가 필요하다. |
| `Verify` | 검증 후보를 실행하거나 수동 확인 중이다. |
| `Deployed` | `main` 머지와 배포가 끝났고 사용자 최종 확인을 기다린다. |
| `Done` | 완료 조건, 검증, 필요한 기준 문서 반영이 끝났다. |
| `Deferred` | 의도적으로 미뤘다. 다시 볼 조건을 댓글에 남긴다. |
| `Rejected` | 하지 않기로 했다. 이유를 댓글에 남긴다. |

`Done`으로 닫기 전에 최소한 아래를 확인합니다.

- Issue의 완료 조건이 충족됐다.
- 필요한 검증 후보를 실행했거나, 실행하지 못한 이유를 남겼다.
- 작업 결과가 커밋/푸시/배포/문서 반영 중 어디까지 갔는지 댓글에 남겼다.
- 반복될 규칙이나 결정은 `.harness/project/*` 또는 `.harness/session/decision-log.md`에 반영했다.
- 재발 방지 기록 필요 여부를 판단하고 final comment에 `재발 방지 기록` 항목을 남겼다.
- 후속 독립 업무가 필요하면 새 Issue를 만들거나 기존 Issue에 연결했다.

## 새 Issue 작성 절차

1. 사용자 요청을 정식 업무, 단순 질문, 기존 Issue의 세부 작업, 장기 기준 문서 반영 중 어디에 해당하는지 분류합니다.
2. 정식 업무라면 같은 목표의 기존 Issue가 있는지 먼저 검색합니다.
3. 기존 Issue가 없으면 `Feature`, `Bug`, `Idea`, `Chore`, `Decision`, `Research`, `Release` 중 가장 가까운 유형으로 Issue 초안을 구체화합니다.
4. 제목은 가능하면 한글로, 결과 중심으로 씁니다.
   - 좋은 예: `[Feature] HealthKit 세션별 자동 갱신 안정화`
   - 좋은 예: `[Bug] 요약 화면 오늘 훈련 추천 카드가 재실행 후 로딩에 멈춤`
   - 피할 예: `[Feature] 코드 수정`
   - 예외: `HealthKit`, `Supabase`, API명, 라이브러리명, 에러 메시지처럼 고유명이나 원문 식별이 중요한 값은 영어를 유지합니다.
5. 본문에 문제/목표, 포함 범위, 제외 범위, 완료 조건, 검증 후보, 관련 문서/이슈를 채웁니다.
6. Project 필드 후보 `Status`, `Workstream`, `Type`, `Priority`, `Completion Owner`, `Target`, `Verification`, `Blocked`, `업무 피로도`를 함께 정합니다.
7. Issue를 생성한 뒤 Project `PaceLAB Development`에 들어갔는지 확인합니다.
8. Project 필드를 채웁니다.
9. 모바일 스캔용 label을 Project 필드와 충돌하지 않게 붙입니다.
10. 아직 불명확하면 `Status=Inbox`로 둡니다. 착수 가능하면 `Ready`로 옮깁니다.

Issue 템플릿에 적은 `Workstream`, `Priority`, `Completion Owner`, `Verification` 값은 Issue 본문에 남습니다. GitHub Project 필드는 별도 값이므로 Project 화면에서 같은 값으로 맞춥니다.

Issue가 Project에 자동으로 들어가지 않았으면 Project `PaceLAB Development`에서 `Add item`으로 Issue URL을 추가합니다.

Issue를 만든 뒤 모바일 스캔용 label도 맞춥니다. 에이전트는 확실한 값만 붙이고, 추측이 필요한 label은 붙이지 않습니다.

에이전트가 Issue 본문을 작성할 때는 아래 구조를 기본으로 씁니다.

```markdown
## 문제 또는 목표
- ...

## 범위
포함:
- ...

제외:
- ...

## 완료 조건
- [ ] ...

## 검증 후보
- ...

## 관련 문서/이슈
- ...
```

원문 요청이 짧아도 에이전트는 제품 흐름과 프로젝트 기준을 바탕으로 위 항목을 채웁니다. 단, 사용자 의도가 불명확하거나 제품 결정을 확정할 수 없으면 추측으로 구현 범위를 고정하지 말고 `Idea`/`Inbox`로 두거나 사용자 확인 질문을 남깁니다.

## 작업 시작 절차

Issue를 실제로 시작할 때는 아래 순서로 진행합니다.

1. Issue의 `Status`를 `Ready`에서 `In Progress`로 바꿉니다.
2. `main` 기준으로 Issue 단위 git worktree와 feature branch를 만듭니다.
3. 작업할 Codex 창은 해당 worktree 경로에서만 진행합니다.
4. 현재 요청 창에서 `Workstream` 값에 맞는 읽을거리와 완료 책임을 확인합니다.
5. 첫 댓글이나 작업 시작 메시지에 완료 책임 창, branch 이름, worktree 경로를 명시합니다.
6. 독립 목표나 동시 업무가 확인되면 현재 Issue에 섞지 말고 별도 Issue/worktree/branch로 분리합니다.
7. 구현이나 문서 변경이 끝나면 Issue 댓글에 변경 요약과 검증 후보를 남깁니다.

여러 독립 목표나 동시 업무라면 필요할 때 parent Issue를 먼저 만들고, child Issue를 만든 뒤 각 child Issue에 Workstream, Completion Owner, parent 링크를 남깁니다. 각 child Issue는 별도 worktree와 branch를 사용합니다.

## Issue 단위 worktree

동시에 여러 Issue를 진행할 수 있으므로, 정식 작업은 branch만 분리하지 않고 로컬 worktree도 분리합니다.

기본 경로:

```text
기준 작업트리: /Users/smart-tn-083/practice/run-ai
Issue 작업트리: /Users/smart-tn-083/practice/run-ai.worktrees/issue-<번호>-<짧은-설명>
```

새 Issue 작업을 시작할 때:

```bash
cd /Users/smart-tn-083/practice/run-ai
git status --short
git switch main
git pull --ff-only
mkdir -p ../run-ai.worktrees
git worktree add ../run-ai.worktrees/issue-4-github-issue-guard -b issue-4/github-issue-guard main
cd ../run-ai.worktrees/issue-4-github-issue-guard
. "$HOME/.nvm/nvm.sh" && nvm use
npm ci
```

이미 branch가 있으면:

```bash
cd /Users/smart-tn-083/practice/run-ai
mkdir -p ../run-ai.worktrees
git worktree add ../run-ai.worktrees/issue-4-github-issue-guard issue-4/github-issue-guard
cd ../run-ai.worktrees/issue-4-github-issue-guard
. "$HOME/.nvm/nvm.sh" && nvm use
[ -d node_modules ] || npm ci
```

Codex 창을 열 때는 해당 worktree 경로를 작업 루트로 사용합니다.

```text
/Users/smart-tn-083/practice/run-ai.worktrees/issue-4-github-issue-guard
```

작업 완료 후 `main`에 머지되고 더 이상 필요 없으면:

```bash
cd /Users/smart-tn-083/practice/run-ai
git worktree remove ../run-ai.worktrees/issue-4-github-issue-guard
git worktree prune
```

worktree 운영 기준:

- 기준 작업트리 `run-ai`는 `main` 확인, Issue 생성, Project 정리, 최종 merge/deploy 기준으로 둡니다.
- Issue 구현/문서 수정은 Issue 전용 worktree에서만 수행합니다.
- 한 worktree에는 한 Issue의 변경만 둡니다.
- 다른 Issue 변경이 보이면 커밋하지 말고 먼저 worktree/branch를 분리합니다.
- Issue worktree는 git ignored 파일인 `node_modules`를 자동으로 가져오지 않습니다. 새 worktree를 만들거나 들어간 뒤 `. "$HOME/.nvm/nvm.sh" && nvm use`를 실행하고, `node_modules`가 없으면 `npm ci`로 의존성을 준비합니다.
- `node_modules` 복사나 symlink는 기본값으로 쓰지 않습니다. 이 프로젝트는 `package-lock.json` 기준 npm 프로젝트이므로 `npm ci`가 TypeScript/build/test 로컬 바이너리 누락을 막는 1차 준비 절차입니다.
- stash는 예외적 임시 조치입니다. 정상 운영에서는 Issue worktree로 분리해 stash 사용을 최소화합니다.

branch 이름은 `issue-<번호>/<짧은-설명>`을 기본으로 합니다.

```text
issue-1/memory-page-ia
issue-12/healthkit-refresh
issue-27/coach-streaming-regression
```

작업 중 다른 요청이 들어오면 기존 branch에 섞지 않습니다. 새 Issue가 필요하면 새 branch를 만듭니다.

대화창에 붙여넣을 때는 이렇게 시작합니다.

```text
이 창은 요청 단위 풀스택 작업 창이다.

Issue: <GitHub Issue URL>
Workstream 라우팅: <workstream 또는 후보>
완료 책임 창: 현재 요청 창
요청:
<이번에 처리할 내용>

주의:
- MVP 기본 완료 흐름을 따른다. 단순 확인/검토/조사 요청이거나 사용자가 중단점을 지정한 경우에만 해당 지점에서 멈춘다.
- 같은 목표 안의 다영역 작업은 이 창에서 관리하되, 동시 독립 업무는 별도 Issue/worktree/branch로 분리한다.
```

## 진행 중 업데이트

작업 중 의미 있는 변화가 있으면 Issue 댓글에 짧게 남깁니다.

- 범위가 바뀜
- 완료 책임 창이 바뀜
- 선행 이슈나 차단 요소가 생김
- 검증 후보가 바뀜
- 구현은 끝났지만 수동 확인이 남음
- 후속 Issue가 필요함
- 업무 피로도가 `tired` 또는 `reset-needed`로 바뀜

댓글은 상태 보고서처럼 길게 쓰지 않아도 됩니다. 나중에 왜 그렇게 판단했는지 복원할 수 있으면 충분합니다.

에이전트가 `gh issue comment` 또는 GitHub API로 댓글을 남길 때는 실제 줄바꿈이 들어간 Markdown 본문을 stdin, temp file, 또는 JSON body로 전달합니다. 명령 인자 안에 `\n`을 문자열로 이어 붙이면 GitHub 모바일/웹에서 `\n`이 그대로 보이므로 사용하지 않습니다.

권장 댓글 형태:

```markdown
작업 시작합니다.

- 완료 책임 창: 03-ui-ux
- Worktree: /Users/smart-tn-083/practice/run-ai.worktrees/issue-1-memory-page-ia
- Branch: issue-1/memory-page-ia
- Status: In Progress
```

```markdown
배포 완료.

완료 요약:
- ...

검증:
- ...

배포:
- ...

후속:
- 사용자 확인 후 완료처리 가능
```

## 업무 피로도

`업무 피로도`는 GitHub Project의 별도 single-select 필드입니다. Issue lifecycle을 나타내는 `Status`와 분리합니다. 이 값은 내부 토큰 수나 기억 품질을 정확히 측정하는 값이 아니라, 에이전트가 현재 대화창을 계속 써도 되는지 판단하는 자가진단입니다.

값은 아래처럼 사용합니다.

| 값 | 기준 | 동작 |
| --- | --- | --- |
| `fresh` | 새 창이거나 짧고 단일 주제인 맥락 | 그대로 진행 |
| `normal` | 현재 Issue를 안정적으로 처리할 수 있음 | 그대로 진행 |
| `tired` | 대화가 길거나 여러 작업/결정이 섞여 실수 위험이 올라감 | 새 작업을 섞지 말고 현재 Issue 마무리 또는 짧은 handoff 준비 |
| `reset-needed` | Issue/branch/worktree/목표 혼선, 반복 재확인, 규칙 누락 같은 컨텍스트 오염 신호가 큼 | 넓은 새 작업을 시작하지 않고 Issue 댓글과 handoff를 남긴 뒤 새 요청 창이나 분리된 Issue worktree에서 재개 |

자가진단 신호:

- 긴 대화 끝에 다른 Issue나 독립 목표 내용이 반복적으로 끼어든다.
- 같은 파일, branch, worktree, 완료 조건을 여러 번 다시 확인한다.
- 현재 요청의 목표와 다른 판단을 계속 확장하려 한다.
- Issue/PR/Project 댓글 작성 규칙, worktree 분리, 완료 책임 창 같은 운영 규칙을 놓친다.
- 사용자가 응답 지연, 컨텍스트 오염, 리셋 필요, 새 창 전환을 언급한다.

정식 Issue 작업 중 값이 바뀌면 Project 필드를 갱신하고 아래 형식으로 댓글을 남깁니다.

```markdown
업무 피로도 업데이트:

- 상태: tired
- 이유: 대화가 길어지고 다른 Issue 맥락이 반복적으로 섞임
- 권장: 현재 Issue만 마무리하고 새 작업은 새 요청 창 또는 별도 Issue worktree에서 시작
```

parent/child 업무에서는 각 child Issue를 맡은 요청 창이 자기 Issue의 `업무 피로도`를 갱신합니다. 피로도가 parent 통합 판단에 영향을 주면 parent Issue에도 짧게 handoff 댓글을 남깁니다. parent 완료 책임 창은 child 창의 피로도를 직접 추측하지 않고 Project 필드와 Issue 댓글을 읽어 판단합니다.

## 아이디어 승격

`Idea`는 바로 구현하지 않습니다. 아래 중 하나가 생기면 정식 작업으로 승격합니다.

- 사용자 가치가 명확해졌다.
- MVP, Beta, App Store 중 어느 목표에 들어갈지 정해졌다.
- 완료 조건과 검증 후보를 쓸 수 있다.
- 관련 버그나 기능과 연결되어 우선순위가 생겼다.

승격할 때는 새 `Feature`, `Bug`, `Decision`, `Research` Issue를 만들고 기존 `Idea`를 링크합니다. 기존 Idea는 `Done` 또는 `Deferred`로 정리합니다.

## 버그 처리

Bug Issue에는 재현 조건을 가장 먼저 채웁니다.

- 어떤 화면 또는 흐름에서 발생했는지
- 기대 동작
- 실제 동작
- 재현 단계
- 브라우저, 기기, 계정 상태, 데이터 조건
- 관련 로그나 스크린샷

재현이 불확실하면 `Status=Inbox` 또는 `Backlog`에 두고, `Type=research` 성격의 조사 Issue로 나눌 수 있습니다.

## 완료와 종료

완료 책임 창은 Issue를 닫기 전에 아래 형식으로 마지막 댓글을 남깁니다.

```text
완료 요약:
- ...

검증:
- ...

문서/결정 반영:
- ...

재발 방지 기록:
- 반영: ...

후속:
- 없음
```

검증을 못 했다면 `검증`에 실행하지 못한 이유와 남은 확인 방법을 씁니다. 후속이 있으면 새 Issue를 만들고 링크합니다.

`재발 방지 기록`은 생략하지 않습니다. 남길 장기 기준이 없으면 아래처럼 이유를 남깁니다.

```text
재발 방지 기록:
- 해당 없음: 일회성 문구 수정이며 반복 규칙이나 공유 계약 변경 없음
```

아래 중 하나라도 해당하면 `해당 없음`으로 처리하지 말고 장기 기억을 갱신합니다.

- 여러 번의 수정, PR, merge, deploy를 거쳐 어렵게 해결했다.
- 같은 회귀나 사용자 지적이 반복될 가능성이 있다.
- 데이터 계약, UI 공통 패턴, 배포 기준, worktree/Issue 운영 기준 같은 공유 규칙이 바뀌었다.
- 독립 업무 분리, handoff, 완료 책임 판단에서 문제가 있었다.
- 에이전트가 스스로 해야 할 확인을 놓쳤고, 다음에는 먼저 떠올려야 한다.

기록 위치는 아래를 기준으로 고릅니다.

| 위치 | 기준 |
| --- | --- |
| `.harness/session/project-memory.md` | 세션이 바뀌어도 반복 참고해야 하는 안정적인 프로젝트 사실 |
| `.harness/session/decision-log.md` | 원인, 선택 이유, 포기한 대안, 기준 변경 이유 |
| `.harness/project/*.md` | 반복 적용할 도메인/아키텍처/워크플로우/검증 규칙 |

## 커밋, PR, 배포 흐름

PaceLAB MVP 단계에서는 사용자가 단순 확인, 검토, 조사, 기획 질문만 요청한 경우가 아니라면 중간 확인을 기본 대기점으로 두지 않습니다. 정식 Issue의 `Target`이 `MVP`이고 현재 요청 창 안에서 해결 가능한 업무라면, 에이전트는 가능한 경우 작업 시작부터 검증, commit, push, PR, main 머지, 배포 확인까지 이어서 진행한 뒤 사용자에게 완료 확인을 요청합니다. GitHub Issue/Project를 `Done`, `Closed`, 또는 이에 준하는 최종 완료 상태로 변경하는 것은 사용자의 명시 지시가 있을 때만 수행합니다.

이 자동 완료 흐름은 Issue별 worktree/branch 원칙을 대체하지 않습니다. 동시에 여러 일을 할 수 있도록 모든 정식 Issue는 먼저 고유 worktree와 branch를 분리하고, 완료까지 이어갈 때도 해당 worktree 안의 변경만 커밋합니다.

parent Issue는 예외적으로 child Issue 상태를 기다립니다. 완료 책임 창은 모든 필수 child Issue가 Done이거나 parent에 handoff된 뒤에만 parent Issue를 닫을 수 있으며, 이 조건을 만족해도 사용자의 명시 완료 지시 전에는 `Done` 또는 `Closed`로 바꾸지 않습니다.

아래 경우에는 자동 최종화를 멈춥니다.

- 사용자가 `검토만`, `조사만`, `PR까지만`, `커밋하지 마`, `배포하지 마`, `여기서 멈춰`처럼 중단점을 지정했다.
- 완료 책임 창이나 요청 목표가 불명확하다.
- 별도 Issue로 분리해야 할 독립 목표나 동시 업무가 현재 변경에 섞이려 한다.
- 비밀값, DB migration, 외부 결제, App Store 제출처럼 별도 수동 조치가 필요한 단계가 있다.
- 검증 실패, merge conflict, 배포 실패처럼 사용자가 알아야 할 차단점이 생겼다.

사용자 요청과 Project Status는 아래처럼 연결합니다.

| 사용자 말 | 에이전트 동작 | Project Status |
| --- | --- | --- |
| `증상은 이래`, `검토해줘`, `이 기능 필요해` | Issue 필요 여부 판단, 필요 시 Issue/Project 등록 | `Inbox` 또는 `Ready` |
| `진행해` 또는 구현/버그/운영 작업 위임 | Issue worktree/feature branch 생성 후, 중단 지시가 없으면 검증/commit/push/PR/merge/deploy 확인까지 진행하고 사용자 완료 확인 요청 | `In Progress` -> `Deployed` 또는 `Review` |
| 작업 완료 보고가 필요한 예외 | 사용자가 `검토만`, `PR까지만` 등 중단점을 지정한 경우 그 지점에서 요약 | `Review` |
| `검증해`, `배포해` | 보류 중인 branch/PR을 검증하고 main 반영, 배포 확인까지 진행한 뒤 사용자 완료 확인 요청 | `Verify` -> `Deployed` |
| 배포 완료 | 배포 URL/확인 방법 또는 배포 생략 사유를 Issue 댓글에 남기고 사용자 완료 확인 요청 | `Deployed` |
| `완료처리해` | 이미 배포/검증된 Issue에서 기준 작업트리 `main` 최신화, 완료 요약 댓글, Project `Done`, Issue close | `Done` |

`main`은 머지와 배포 기준입니다. Issue worktree의 feature branch에서 작업이 끝났더라도 `main`에 머지되지 않으면 배포 완료로 보지 않습니다.

사용자 완료 확인을 받은 뒤 Issue를 `Done` 또는 `Closed`로 바꾸기 전에는 기준 작업트리 `/Users/smart-tn-083/practice/run-ai`에서 `git switch main`, `git pull --ff-only`, `git status -sb`를 실행해 local `main`이 `origin/main` 최신 상태인지 확인합니다. 기준 작업트리에 미커밋 변경이 있으면 임의로 stash/reset하지 않고 상태를 보고합니다.

배포가 없는 문서/운영 작업은 `Deployed`를 건너뛰고, 사용자 확인과 필요한 검증, 기준 `main` 최신화가 끝나면 `Done`으로 닫을 수 있습니다.

커밋 대상은 해당 Issue를 해결하는 소스코드와 장기 기준 문서만 포함합니다. GitHub Issue/Project 진행 상태 자체는 커밋 대상이 아닙니다.

## 주간 정리 루틴

주기적으로 Project를 열어 아래만 정리합니다.

- `Inbox`: 버릴 것, 보류할 것, Ready로 올릴 것 구분
- `Blocked=yes`: 차단 사유가 아직 유효한지 확인
- `In Progress`: 실제로 진행 중인지 확인
- `Review`, `Verify`: 완료 책임 창이 닫을 수 있는지 확인
- `P0`, `P1`: 현재 목표와 맞는지 확인

이 정리는 새 개발을 시작하기 전 5~10분 안에 끝내는 운영 작업으로 둡니다.

## 에이전트에게 맡길 때

에이전트에게는 Issue URL과 원하는 범위를 같이 줍니다.

```text
이 창은 요청 단위 풀스택 작업 창이다.
Issue <URL>를 처리해줘.
Workstream 라우팅은 <workstream 또는 후보>이다.
완료 책임 창은 현재 요청 창이다.
먼저 Issue 내용과 관련 하네스 문서를 확인하고, MVP 기본 완료 흐름에 따라 중단 지시가 없으면 완료까지 진행해줘.
동시에 들어온 독립 업무는 별도 Issue/worktree/branch로 분리해줘.
```

중단점을 지정하려면 마지막에 명시적으로 말합니다.

```text
PR까지만 진행해.
```

이 경우 hook이 설치되어 있으면 에이전트는 별도 선행 `harness:check`를 중복 실행하지 않고 commit/push hook 검증에 맡깁니다.

사용자가 Issue 없이 업무 내용만 적어도 됩니다.

```text
HealthKit 동기화 완료 토스트가 앱 켤 때마다 떠서 거슬린다. 새 기록이 없으면 안 뜨게 하고, 실제 저장된 경우만 알려줘.
```

이 경우 에이전트는 먼저 요청을 Issue 초안으로 구체화하고, 같은 목표의 기존 Issue가 있는지 검색한 뒤 새 Issue 생성 또는 기존 Issue 재사용을 결정합니다. 생성 또는 재사용 후에는 Project 필드와 label을 맞추고 Issue worktree/branch에서 진행합니다.

## 에이전트 등록 경로

이 프로젝트에서 에이전트가 GitHub Issue/Project를 등록할 때는 아래 순서를 따릅니다.

1. 로컬 `gh auth status`로 인증과 scope를 확인합니다.
2. 사용자 요청을 한글 우선 제목, 문제/목표, 범위, 제외 범위, 완료 조건, 검증 후보, Project fields, label 후보로 구체화합니다.
3. `gh issue list` 또는 검색으로 같은 목표의 기존 Issue가 있는지 확인합니다.
4. 기존 Issue가 있으면 재사용하고, 없으면 `gh issue create`로 Issue를 만듭니다.
5. `gh project item-add` 또는 `gh api graphql`로 Project `PaceLAB Development`에 추가합니다.
6. `gh api graphql`로 `Status`, `Workstream`, `Type`, `Priority`, `Completion Owner`, `Target`, `Verification`, `Blocked`, `업무 피로도` 필드를 설정합니다.
7. `gh issue edit --add-label`로 모바일 스캔용 label을 설정합니다.
8. 완료 결과로 Issue URL과 Project 반영 상태를 보고합니다.

`gh` 인증이 없거나 scope가 부족하면 사용자에게 아래 명령을 요청합니다.

```bash
gh auth status
gh auth refresh -s repo -s project
```

GitHub App connector는 이슈/프로젝트 쓰기 작업의 1차 경로로 쓰지 않습니다. 조회나 요약처럼 권한이 확인된 작업에만 우선 사용합니다.
