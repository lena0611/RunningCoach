# Workstream 02: 제품/기획/범위

## 시작 문구

```text
이 요청은 PaceLAB 제품/기획/범위 중심으로 처리해줘.
먼저 .harness/session/workstreams/02-product-planning.md를 읽고, 같은 목표 안에 필요한 관련 영역은 이 창에서 함께 관리해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 이 파일은 담당 창 고정 기준이 아니라 `02-product-planning` 읽을거리 라우팅 기준이다.
- 요청 목표가 제품/기획/범위 중심인지 확인하고, 같은 목표 안의 UI/구현/데이터 영향 검토는 현재 요청 창에서 함께 처리한다.
- 독립 목표나 동시 업무가 섞이면 넓히지 말고 별도 Issue/worktree/branch로 분리한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 요청 단위 운영 기준을 따른다.
- 완료 전 후속 창으로 넘길 때는 커밋하지 않고, 인수인계 문구에 `git status --short`, `git diff`, 필요 시 `git diff --staged` 확인 지시를 포함한다.

## 담당 범위
- PaceLAB 제품 방향, MVP 범위, 비목표
- 기능 우선순위와 사용자 흐름
- 하네스 소비자 프로젝트로서 검증할 관찰 포인트
- 작업 유형 분리와 다음 작업 후보 정리

## 먼저 읽을 문서
1. `.harness/session/active-context.md`
2. `.harness/session/project-memory.md`
3. `.harness/project/project-charter.md`
4. `.harness/project/scope-contract.md`
5. `.harness/session/decision-log.md`

## 관련 파일
- `.harness/project/project-charter.md`
- `.harness/project/scope-contract.md`
- `.harness/project/critical-paths.md`
- `.harness/session/developer-input-queue.md`

## 제외 범위
- UI 구현 세부 CSS
- 코칭 프롬프트 작성
- DB migration 작성
- iOS bridge 구현

## 인접 영역 처리와 분리 기준
- 현재 제품/기획 요청을 완료하는 데 필요한 구현 세부 판단은 관련 workstream 파일을 추가로 읽고 같은 창에서 처리한다.
- 구현 자체가 별도 제품 목표이거나 동시 진행 업무가 되면 별도 Issue/worktree/branch로 분리한다.
- 분리할 때는 제품 결정, 비목표, 완료 조건, 관련 화면 또는 기능명을 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 제품 방향 변경은 `.harness/project/project-charter.md`
- 범위 변경은 `.harness/project/scope-contract.md`
- 중요한 선택 이유는 `.harness/session/decision-log.md`
