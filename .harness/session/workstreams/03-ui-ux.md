# Workstream 03: UI/UX

## 시작 문구

```text
이 요청은 PaceLAB UI/UX 중심으로 처리해줘.
먼저 .harness/session/workstreams/03-ui-ux.md를 읽고, 같은 목표 안에 필요한 관련 영역은 이 창에서 함께 관리해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 이 파일은 담당 창 고정 기준이 아니라 `03-ui-ux` 읽을거리 라우팅 기준이다.
- 요청 목표가 UI/UX 중심인지 확인하고, 같은 목표 안의 도메인/DB/AI/HealthKit 영향 검토는 현재 요청 창에서 함께 처리한다.
- 독립 목표나 동시 업무가 섞이면 넓히지 말고 별도 Issue/worktree/branch로 분리한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 요청 단위 운영 기준을 따른다.
- 완료 전 후속 창으로 넘길 때는 커밋하지 않고, 인수인계 문구에 `git status --short`, `git diff`, 필요 시 `git diff --staged` 확인 지시를 포함한다.

## 담당 범위
- Dashboard, Run Log, Memory, 세션 상세 화면
- 모바일 반복 사용 UX
- 공통 UI 컴포넌트와 디자인 토큰
- 차트/지도 표시 품질과 화면 구조

## 먼저 읽을 문서
1. `.harness/session/active-context.md`
2. `.harness/project/ui-system-contract.md`
3. `.harness/project/ui-guidelines.md`
4. `.harness/project/workflow-rules.md`

## 관련 파일
- `src/pages/dashboard/DashboardPage.vue`
- `src/pages/run-log/RunLogPage.vue`
- `src/pages/memory/MemoryPage.vue`
- `src/shared/ui/**`
- `src/widgets/**`
- `src/app/styles.css`

## 제외 범위
- AI 코칭 프롬프트/Edge Function 로직
- HealthKit 네이티브 브리지
- Supabase migration
- 훈련 계산 공식 자체 변경

## 인접 영역 처리와 분리 기준
- 현재 UI/UX 요청을 완료하는 데 필요한 도메인 판정, DB 저장 정책, AI 코칭, HealthKit 계약 판단은 관련 workstream 파일을 추가로 읽고 같은 창에서 처리한다.
- 화면 변경과 별개인 도메인/DB/AI/HealthKit 목표가 생기면 별도 Issue/worktree/branch로 분리한다.
- 분리할 때는 화면에서 필요한 데이터, 현재 UI 완료 조건, 막힌 판단 기준을 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 반복 UI 패턴은 `.harness/project/ui-system-contract.md`
- 모바일 회귀 기준은 `.harness/project/workflow-rules.md`
- 화면 흐름 결정은 `.harness/session/decision-log.md`
