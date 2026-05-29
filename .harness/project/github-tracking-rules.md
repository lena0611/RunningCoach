# GitHub 작업 추적 규칙

PaceLAB의 정식 개발 작업은 GitHub Issues를 단일 출처로 두고, 전체 상태판은 GitHub Projects로 관리합니다.

## 원칙

- 정식 개발 작업은 GitHub Issue로 등록한 뒤 진행합니다.
- GitHub Project `PaceLAB Development`는 전체 상태, 우선순위, workstream, 완료 책임 창을 조감하는 보드입니다.
- `.harness/project/*`는 장기 기준, 결정, 계약 문서를 보존합니다. 개별 작업 상태와 할 일 목록은 이 폴더에 누적하지 않습니다.
- Notion은 당장 핵심 이슈트래커로 사용하지 않습니다. 향후 사업화, 인터뷰, 레퍼런스 노트 보조 도구로만 재검토합니다.
- Issue가 기준 변경을 낳으면 구현 PR/커밋과 함께 `.harness/project/*` 또는 `.harness/session/decision-log.md`로 승격합니다.

## GitHub Project

- 이름: `PaceLAB Development`
- 소유자: `lena0611`
- 저장소: `lena0611/RunningCoach`

권장 필드:

| 필드 | 값 |
| --- | --- |
| `Status` | `Inbox`, `Backlog`, `Ready`, `In Progress`, `Review`, `Verify`, `Done`, `Deferred`, `Rejected` |
| `Workstream` | `01-harness-ops`, `02-product-planning`, `03-ui-ux`, `04-running-logic`, `05-ai-coaching`, `06-healthkit-ios`, `07-data-supabase`, `08-injury-domain` |
| `Type` | `idea`, `feature`, `bug`, `chore`, `decision`, `research`, `release` |
| `Priority` | `P0`, `P1`, `P2`, `P3` |
| `Completion Owner` | 완료 책임 workstream |
| `Target` | `MVP`, `Beta`, `App Store`, `Later` |
| `Verification` | `none`, `unit`, `e2e`, `build`, `harness-check`, `manual` |
| `Blocked` | `yes`, `no` |

기본 view:

- `Board by Status`: `Status` 기준 칸반 보드
- `Backlog by Priority`: `Status != Done/Rejected`, `Priority` 정렬
- `By Workstream`: `Workstream` 그룹
- `Verification`: `Status in Review/Verify`, `Verification` 확인

## Issue 상태 흐름

| 상태 | 의미 |
| --- | --- |
| `Inbox` | 막 들어온 아이디어, 버그, 요청입니다. 범위와 완료 책임 창을 아직 확정하지 않았습니다. |
| `Backlog` | 언젠가 할 수 있지만 지금 착수 조건은 아닙니다. |
| `Ready` | 목표, 완료 조건, 담당 workstream, 검증 후보가 정리되어 착수 가능합니다. |
| `In Progress` | 구현, 문서화, 조사 중입니다. |
| `Review` | 변경은 끝났고 검토가 필요합니다. |
| `Verify` | 검증 후보를 실행하거나 수동 확인하는 단계입니다. |
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

GitHub 기본 `Status` 필드는 생성된 뒤 UI에서 `Inbox`, `Backlog`, `Ready`, `In Progress`, `Review`, `Verify`, `Done`, `Deferred`, `Rejected` 옵션으로 정리합니다.
