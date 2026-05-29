# GitHub 작업 추적 규칙

PaceLAB의 정식 개발 작업은 GitHub Issues를 단일 출처로 두고, 전체 상태판은 GitHub Projects로 관리합니다.

일상 운영 절차는 [GitHub 이슈 운영 가이드](./github-issue-management-guide.md)를 따릅니다.

## 원칙

- 정식 개발 작업은 GitHub Issue로 등록한 뒤 진행합니다.
- GitHub Project `PaceLAB Development`는 전체 상태, 우선순위, workstream, 완료 책임 창을 조감하는 보드입니다.
- `.harness/project/*`는 장기 기준, 결정, 계약 문서를 보존합니다. 개별 작업 상태와 할 일 목록은 이 폴더에 누적하지 않습니다.
- Notion은 당장 핵심 이슈트래커로 사용하지 않습니다. 향후 사업화, 인터뷰, 레퍼런스 노트 보조 도구로만 재검토합니다.
- Issue가 기준 변경을 낳으면 구현 PR/커밋과 함께 `.harness/project/*` 또는 `.harness/session/decision-log.md`로 승격합니다.
- 에이전트가 GitHub Issue 또는 Project를 생성/수정할 때는 로컬 `gh` CLI를 1차 경로로 사용합니다. 현재 GitHub App connector는 Issue/Project write 권한이 부족해 403이 발생할 수 있으므로, connector-first 시도 후 fallback하는 흐름을 반복하지 않습니다.

## GitHub Project

- 이름: `PaceLAB Development`
- 소유자: `lena0611`
- 저장소: `lena0611/RunningCoach`
- URL: `https://github.com/users/lena0611/projects/1`
- Project number: `1`

권장 필드:

| 필드 | 값 |
| --- | --- |
| `Status` | `Inbox`, `Backlog`, `Ready`, `In Progress`, `Review`, `Verify`, `Deployed`, `Done`, `Deferred`, `Rejected` |
| `Workstream` | `01-harness-ops`, `02-product-planning`, `03-ui-ux`, `04-running-logic`, `05-ai-coaching`, `06-healthkit-ios`, `07-data-supabase`, `08-injury-domain` |
| `Type` | `idea`, `feature`, `bug`, `chore`, `decision`, `research`, `release` |
| `Priority` | `P0`, `P1`, `P2`, `P3` |
| `Completion Owner` | 완료 책임 workstream |
| `Target` | `MVP`, `Beta`, `App Store`, `Later` |
| `Verification` | `none`, `unit`, `e2e`, `build`, `harness-check`, `manual` |
| `Blocked` | `yes`, `no` |

GitHub `Assignees`는 사람 계정 배정용입니다. PaceLAB의 담당 workstream은 `Assignees`가 아니라 Project의 `Workstream`과 `Completion Owner` 필드로 관리합니다.

기본 view:

- `Board by Status`: `Status` 기준 칸반 보드
- `Backlog by Priority`: `Status != Done/Rejected`, `Priority` 정렬
- `By Workstream`: `Workstream` 그룹
- `Verification`: `Status in Review/Verify`, `Verification` 확인

현재 GitHub CLI와 공개 GraphQL mutation에서는 Project view 생성/정렬/그룹 설정을 안정적으로 자동화하지 않습니다. 필드와 Status 옵션은 자동 설정했으며, 위 view 구성은 GitHub 웹 UI에서 필요할 때 수동으로 추가합니다.

## 브랜치와 메인라인

- `main`은 머지와 배포 기준 브랜치입니다.
- 정식 Issue 작업은 `main`에서 직접 진행하지 않고 Issue 단위 git worktree와 feature branch에서 진행합니다.
- feature branch 이름은 `issue-<번호>/<짧은-설명>` 형식을 기본으로 합니다. 예: `issue-1/memory-page-ia`.
- Issue worktree 경로는 `/Users/smart-tn-083/practice/run-ai.worktrees/issue-<번호>-<짧은-설명>` 형식을 기본으로 합니다.
- 동시에 여러 요청이 들어오면 각 Issue별 worktree와 branch를 분리합니다.
- PR은 feature branch에서 `main`으로 열고, `main`에 머지된 뒤 배포 대상으로 봅니다.
- `main`에 머지되지 않은 branch의 변경은 배포 완료로 보지 않습니다.

## Issue 상태 흐름

| 상태 | 의미 |
| --- | --- |
| `Inbox` | 막 들어온 아이디어, 버그, 요청입니다. 범위와 완료 책임 창을 아직 확정하지 않았습니다. |
| `Backlog` | 언젠가 할 수 있지만 지금 착수 조건은 아닙니다. |
| `Ready` | 목표, 완료 조건, 담당 workstream, 검증 후보가 정리되어 착수 가능합니다. |
| `In Progress` | 구현, 문서화, 조사 중입니다. |
| `Review` | 변경은 끝났고 검토가 필요합니다. |
| `Verify` | 검증 후보를 실행하거나 수동 확인하는 단계입니다. |
| `Deployed` | `main` 머지와 배포가 끝났고 사용자 최종 확인을 기다리는 단계입니다. |
| `Done` | 완료 조건과 검증 기준을 만족했고 필요한 문서/결정 기록이 반영됐습니다. |
| `Deferred` | 의도적으로 미뤘습니다. 재검토 조건을 남깁니다. |
| `Rejected` | 하지 않기로 결정했습니다. 이유를 남깁니다. |

## Issue 유형

- `idea`: 아직 정식 작업이 아닌 가능성입니다. 충분한 신호가 생기면 다른 유형으로 승격합니다.
- `feature`: 사용자 가치나 제품 동작을 추가하거나 개선합니다.
- `bug`: 기대 동작과 실제 동작이 다릅니다.
- `chore`: 제품 기능은 아니지만 운영, 정리, 의존성, 하네스 관리가 필요합니다.
- `decision`: 구현보다 제품/기술/운영 판단을 확정하는 작업입니다.
- `research`: 조사, 검증, 비교가 필요한 작업입니다.
- `release`: 배포, 출시, 검수, 스토어 제출 같은 릴리스 작업입니다.

## 등록 기준

정식 작업으로 진행하려면 Issue에 최소한 아래가 있어야 합니다.

- 목표 또는 문제
- `Workstream`
- `Type`
- `Priority`
- `Completion Owner`
- `Target`
- 완료 조건
- 검증 후보

불명확한 요청은 `Idea`로 남기고 `Inbox`에 둡니다. 기획 판단이 필요하면 `02-product-planning`을 완료 책임 창으로 둡니다. 하네스/운영 절차 자체를 바꾸는 일은 `01-harness-ops`를 완료 책임 창으로 둡니다.

## 초기 이슈 등록 후보

아래 후보는 현재 문서화된 맥락에서 GitHub Issues로 옮길 가치가 있습니다. 한 번에 모두 등록하기보다 MVP 진행에 필요한 것부터 5~10개만 `Inbox` 또는 `Backlog`로 시작합니다.

- `Feature`: HealthKit 자동 동기화와 세션별 새로고침 안정화
- `Feature`: AI 코칭 스트리밍 응답의 저장/표시 회귀 방지
- `Feature`: 부상 체크인 전역 bottom sheet와 완치 후보 승인 흐름
- `Feature`: 10km 59:59 목표 가능성/다음 훈련 추천 기준 정교화
- `Bug`: Dashboard 또는 Run Log가 0km/빈 목록으로 보이는 저장/로드 회귀
- `Research`: App Store 출시 전 TestFlight 베타와 유료 가설 검증
- `Research`: Strava 연동의 OAuth/서버리스 경계 검토
- `Decision`: 사업화 전환 시 무료/유료 기능 경계

## GitHub CLI 생성 명령

GitHub Project 작업에는 `project` scope가 필요합니다.

에이전트 자동 등록 경로:

- Issue 생성, Project item 추가, Project 필드 수정은 로컬 `gh` CLI와 `gh api graphql`을 우선 사용합니다.
- GitHub App connector는 조회, PR/Issue 요약, 댓글/라벨처럼 권한이 확인된 작업에 우선 사용합니다.
- 로컬 `gh` 인증이 없거나 scope가 부족하면 쓰기 작업을 추측으로 진행하지 않고 사용자에게 `gh auth status`와 `gh auth refresh -s repo -s project` 실행을 요청합니다.
- 같은 요청에서 connector write 403을 예상할 수 있으면 connector write를 먼저 시도하지 않습니다.

```bash
gh auth refresh -s project
gh project create --owner lena0611 --title "PaceLAB Development"
gh project link <project-number> --owner lena0611 --repo RunningCoach
```

필드 생성 예:

```bash
gh project field-create <project-number> --owner lena0611 --name "Workstream" --data-type SINGLE_SELECT --single-select-options "01-harness-ops,02-product-planning,03-ui-ux,04-running-logic,05-ai-coaching,06-healthkit-ios,07-data-supabase,08-injury-domain"
gh project field-create <project-number> --owner lena0611 --name "Type" --data-type SINGLE_SELECT --single-select-options "idea,feature,bug,chore,decision,research,release"
gh project field-create <project-number> --owner lena0611 --name "Priority" --data-type SINGLE_SELECT --single-select-options "P0,P1,P2,P3"
gh project field-create <project-number> --owner lena0611 --name "Completion Owner" --data-type TEXT
gh project field-create <project-number> --owner lena0611 --name "Target" --data-type SINGLE_SELECT --single-select-options "MVP,Beta,App Store,Later"
gh project field-create <project-number> --owner lena0611 --name "Verification" --data-type SINGLE_SELECT --single-select-options "none,unit,e2e,build,harness-check,manual"
gh project field-create <project-number> --owner lena0611 --name "Blocked" --data-type SINGLE_SELECT --single-select-options "no,yes"
```

GitHub 기본 `Status` 필드는 `Inbox`, `Backlog`, `Ready`, `In Progress`, `Review`, `Verify`, `Deployed`, `Done`, `Deferred`, `Rejected` 옵션으로 정리합니다.
