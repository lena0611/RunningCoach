# Workstream 02: 제품/기획/범위

## 시작 문구

```text
이 대화창은 PaceLAB 제품/기획/범위 업무만 다룬다.
먼저 .harness/session/workstreams/02-product-planning.md를 읽고, 기능 방향과 우선순위 정리 중심으로 진행해줘.
완료 승인 전에는 build/test/harness:check/commit/push/PR을 실행하지 말고 후보로만 보고해줘.
```

## 요청 처리 규칙
- 모든 사용자 요청을 처리하기 전에 이 창의 workstream이 `02-product-planning`인지 먼저 확인한다.
- 현재 창의 workstream이 불명확하거나 요청이 담당 범위를 넘으면 넓은 작업을 진행하지 말고 대상 workstream과 인수인계 문구를 제안한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 공통 창간 운영 기준을 따른다.
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

## 범위 밖 처리
- 구현 세부 판단이 필요하면 해당 구현 workstream 창으로 넘긴다.
- 넘길 때는 제품 결정, 비목표, 완료 조건, 관련 화면 또는 기능명을 짧게 정리한 인수인계 문구를 작성한다.
- 직접 새 창을 열 수는 없으므로 사용자에게 붙여넣을 문구를 제공한다.

## 종료 전 기록
- 제품 방향 변경은 `.harness/project/project-charter.md`
- 범위 변경은 `.harness/project/scope-contract.md`
- 중요한 선택 이유는 `.harness/session/decision-log.md`
