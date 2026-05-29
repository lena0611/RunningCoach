# GitHub 이슈 운영 가이드

PaceLAB의 정식 개발 작업은 GitHub Issues에 등록하고, 전체 진행 상태는 GitHub Project `PaceLAB Development`에서 관리합니다.

- Project: `https://github.com/users/lena0611/projects/1`
- Repository: `lena0611/RunningCoach`
- 기준 문서: [GitHub 작업 추적 규칙](./github-tracking-rules.md)

## 기본 원칙

- 머릿속 아이디어, 대화 중 나온 후보, 버그 의심은 바로 구현하지 말고 먼저 Issue로 정리합니다.
- 정식 개발 작업의 단일 출처는 GitHub Issue입니다. `.harness/project/*`에는 개별 할 일 목록을 누적하지 않습니다.
- Project는 상태판입니다. Issue의 목표, 완료 조건, 검증 후보가 바뀌면 Issue 본문이나 댓글에 남기고 Project 필드를 맞춥니다.
- 작업 중 기준이 생기면 Issue만 닫지 말고 `.harness/project/*` 또는 `.harness/session/decision-log.md`에 승격합니다.
- 완료 책임 창은 Issue마다 하나만 둡니다. 여러 workstream이 참여해도 최종 완료 판단은 `Completion Owner`가 소유합니다.
- 에이전트가 Issue나 Project를 실제 등록/수정할 때는 로컬 `gh` CLI를 먼저 사용합니다. GitHub App connector의 write 권한 부족이 확인된 작업에서는 connector 시도 후 fallback하는 흐름을 반복하지 않습니다.

## GitHub와 프로젝트 문서의 역할

GitHub Issue와 Project는 작업을 관리하고, `.harness/project/*` 문서는 오래 유지될 기준을 관리합니다. 둘은 서로 대체하지 않습니다.

| 위치 | 역할 | 남길 내용 |
| --- | --- | --- |
| GitHub Issue | 실행 단위 | 문제, 목표, 범위, 완료 조건, 검증 후보, 현재 상태, 후속 작업 |
| GitHub Project | 상태판 | Status, Workstream, Type, Priority, Completion Owner, Target, Verification, Blocked |
| `.harness/project/*` | 장기 기준 | 제품/도메인/아키텍처/운영 규칙, 화면 정보 구조, 데이터 계약 |
| `.harness/session/decision-log.md` | 결정 이력 | 왜 그렇게 결정했는지, 포기한 대안, 후속 기준 |

Issue에 프로젝트 문서 내용을 길게 복사하지 않습니다. Issue에는 관련 문서 링크와 이번 작업의 완료 조건을 남깁니다.

프로젝트 문서에 Issue 진행 상태를 누적하지 않습니다. 진행 상태는 GitHub Issue와 Project에서 관리합니다.

문서 변경이 소스 코드 변경이 아니더라도 `.harness/project/*`의 장기 기준 문서는 형상관리 대상입니다. `.gitignore`에 넣지 않습니다. 반대로 스캔 결과, 임시 handoff, 로컬 설정, secret, 빌드 산출물은 `.gitignore` 대상입니다.

## Workstream과 Assignee

GitHub의 `Assignees`는 GitHub 사용자 계정을 의미합니다. `03-ui-ux` 같은 workstream은 GitHub 사용자 계정이 아니므로 Assignee에 자동으로 들어가지 않습니다.

PaceLAB에서 담당 창은 Project의 `Workstream` 필드와 `Completion Owner` 필드가 단일 기준입니다.

- `Workstream`: 주로 구현하거나 판단할 작업 창
- `Completion Owner`: 최종 완료 조건, 리뷰, 검증 후보 정리를 책임질 창
- `Assignees`: 실제 GitHub 사용자 담당자가 필요할 때만 사용

Issue 목록에서 workstream을 더 잘 보이게 하고 싶으면 별도 `ws:03-ui-ux` 같은 label을 추가로 도입할 수 있습니다. 기본 기준은 Project field를 우선합니다.

## 언제 Issue를 만드나

Issue를 만듭니다:

- 실제 구현, 문서 변경, 운영 변경으로 이어질 가능성이 있다.
- 나중에 다시 판단해야 할 아이디어나 제품 가설이다.
- 버그, 회귀, 깨진 사용자 흐름을 추적해야 한다.
- 여러 workstream이 이어서 처리해야 한다.
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
| `Workstream` | 주로 판단하거나 구현할 창 |
| `Type` | 작업의 성격 |
| `Priority` | 지금 안 하면 큰 손실이면 `P0`, MVP 핵심이면 `P1`, 중요하지만 미룰 수 있으면 `P2`, 나중 후보면 `P3` |
| `Completion Owner` | 최종 리뷰와 완료 조건을 책임질 workstream |
| `Target` | `MVP`, `Beta`, `App Store`, `Later` 중 목표 시점 |
| `Verification` | 완료 전 필요한 검증 후보 |
| `Blocked` | 막힌 외부 의존성이나 선행 결정이 있으면 `yes` |

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
- 후속 workstream이 필요하면 새 Issue를 만들거나 기존 Issue에 연결했다.

## 새 Issue 작성 절차

1. GitHub Issues에서 `New issue`를 누릅니다.
2. `Feature`, `Bug`, `Idea` 중 가장 가까운 템플릿을 고릅니다.
3. 제목은 결과 중심으로 씁니다.
   - 좋은 예: `[Feature] HealthKit 세션별 자동 갱신 안정화`
   - 피할 예: `[Feature] 코드 수정`
4. 본문에 목표, 범위, 완료 조건, 검증 후보를 채웁니다.
5. Issue를 생성한 뒤 Project `PaceLAB Development`에 들어갔는지 확인합니다.
6. Project 필드를 채웁니다.
7. 아직 불명확하면 `Status=Inbox`로 둡니다. 착수 가능하면 `Ready`로 옮깁니다.

Issue 템플릿에 적은 `Workstream`, `Priority`, `Completion Owner`, `Verification` 값은 Issue 본문에 남습니다. GitHub Project 필드는 별도 값이므로 Project 화면에서 같은 값으로 맞춥니다.

Issue가 Project에 자동으로 들어가지 않았으면 Project `PaceLAB Development`에서 `Add item`으로 Issue URL을 추가합니다.

## 작업 시작 절차

Issue를 실제로 시작할 때는 아래 순서로 진행합니다.

1. Issue의 `Status`를 `Ready`에서 `In Progress`로 바꿉니다.
2. `main` 기준으로 Issue 단위 feature branch를 만듭니다.
3. 작업할 대화창이 `Workstream`과 맞는지 확인합니다.
4. 첫 댓글이나 작업 시작 메시지에 완료 책임 창과 branch 이름을 명시합니다.
5. 다른 workstream 판단이 필요하면 현재 창에서 넓히지 말고 해당 workstream으로 넘깁니다.
6. 구현이나 문서 변경이 끝나면 Issue 댓글에 변경 요약과 검증 후보를 남깁니다.

branch 이름은 `issue-<번호>/<짧은-설명>`을 기본으로 합니다.

```text
issue-1/memory-page-ia
issue-12/healthkit-refresh
issue-27/coach-streaming-regression
```

작업 중 다른 요청이 들어오면 기존 branch에 섞지 않습니다. 새 Issue가 필요하면 새 branch를 만듭니다.

대화창에 붙여넣을 때는 이렇게 시작합니다.

```text
이 창은 <workstream> workstream이다.

Issue: <GitHub Issue URL>
완료 책임 창: <workstream>
요청:
<이번에 처리할 내용>

주의:
- 완료 승인 전에는 build/test/harness:check/commit/push/PR을 실행하지 않는다.
```

## 진행 중 업데이트

작업 중 의미 있는 변화가 있으면 Issue 댓글에 짧게 남깁니다.

- 범위가 바뀜
- 완료 책임 창이 바뀜
- 선행 이슈나 차단 요소가 생김
- 검증 후보가 바뀜
- 구현은 끝났지만 수동 확인이 남음
- 후속 Issue가 필요함

댓글은 상태 보고서처럼 길게 쓰지 않아도 됩니다. 나중에 왜 그렇게 판단했는지 복원할 수 있으면 충분합니다.

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

후속:
- 없음
```

검증을 못 했다면 `검증`에 실행하지 못한 이유와 남은 확인 방법을 씁니다. 후속이 있으면 새 Issue를 만들고 링크합니다.

## 커밋, PR, 배포 흐름

사용자 요청과 Project Status는 아래처럼 연결합니다.

| 사용자 말 | 에이전트 동작 | Project Status |
| --- | --- | --- |
| `증상은 이래`, `검토해줘`, `이 기능 필요해` | Issue 필요 여부 판단, 필요 시 Issue/Project 등록 | `Inbox` 또는 `Ready` |
| `진행해` | feature branch 생성, 작업 시작 | `In Progress` |
| 작업 완료 보고 | branch에 커밋, PR 준비 또는 생성, 사용자 확인 요청 | `Review` |
| `검증해`, `배포해` | 승인된 검증 실행, PR merge 또는 main 반영, 배포 진행 | `Verify` |
| 배포 완료 | 배포 URL/확인 방법을 Issue 댓글에 남김 | `Deployed` |
| `완료처리해` | 완료 요약 댓글, Issue close | `Done` |

`main`은 머지와 배포 기준입니다. feature branch에서 작업이 끝났더라도 `main`에 머지되지 않으면 배포 완료로 보지 않습니다.

배포가 없는 문서/운영 작업은 `Deployed`를 건너뛰고, 사용자 확인과 필요한 검증이 끝나면 `Done`으로 닫을 수 있습니다.

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
이 창은 <workstream> workstream이다.
Issue <URL>를 처리해줘.
완료 책임 창은 <workstream>이다.
먼저 Issue 내용과 관련 하네스 문서를 확인하고, 완료 승인 전에는 build/test/harness:check/commit/push/PR을 실행하지 마.
```

커밋/푸시까지 원하면 마지막에 명시적으로 말합니다.

```text
최종 승인한다. 커밋푸시.
```

이 경우 hook이 설치되어 있으면 에이전트는 별도 선행 `harness:check`를 중복 실행하지 않고 commit/push hook 검증에 맡깁니다.

## 에이전트 등록 경로

이 프로젝트에서 에이전트가 GitHub Issue/Project를 등록할 때는 아래 순서를 따릅니다.

1. 로컬 `gh auth status`로 인증과 scope를 확인합니다.
2. `gh issue create`로 Issue를 만듭니다.
3. `gh project item-add` 또는 `gh api graphql`로 Project `PaceLAB Development`에 추가합니다.
4. `gh api graphql`로 `Status`, `Workstream`, `Type`, `Priority`, `Completion Owner`, `Target`, `Verification`, `Blocked` 필드를 설정합니다.
5. 완료 결과로 Issue URL과 Project 반영 상태를 보고합니다.

`gh` 인증이 없거나 scope가 부족하면 사용자에게 아래 명령을 요청합니다.

```bash
gh auth status
gh auth refresh -s repo -s project
```

GitHub App connector는 이슈/프로젝트 쓰기 작업의 1차 경로로 쓰지 않습니다. 조회나 요약처럼 권한이 확인된 작업에만 우선 사용합니다.
