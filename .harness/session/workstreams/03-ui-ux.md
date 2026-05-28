# Workstream 03: UI/UX

## 시작 문구

```text
이 대화창은 PaceLAB UI/UX 업무만 다룬다.
먼저 .harness/session/workstreams/03-ui-ux.md를 읽고, 화면/공통 UI/모바일 UX 범위에서만 작업해줘.
완료 승인 전에는 build/test/harness:check/commit/push/PR을 실행하지 말고 후보로만 보고해줘.
```

## 요청 처리 규칙
- 모든 사용자 요청을 처리하기 전에 이 창의 workstream이 `03-ui-ux`인지 먼저 확인한다.
- 현재 창의 workstream이 불명확하거나 요청이 담당 범위를 넘으면 넓은 작업을 진행하지 말고 대상 workstream과 인수인계 문구를 제안한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 공통 창간 운영 기준을 따른다.
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

## 범위 밖 처리
- 화면 작업 중 도메인 판정, DB 저장 정책, AI 코칭, HealthKit 계약 판단이 필요하면 해당 workstream 창으로 넘긴다.
- 넘길 때는 화면에서 필요한 데이터, 현재 UI 완료 조건, 막힌 판단 기준을 짧게 정리한 인수인계 문구를 작성한다.
- 직접 새 창을 열 수는 없으므로 사용자에게 붙여넣을 문구를 제공한다.

## 종료 전 기록
- 반복 UI 패턴은 `.harness/project/ui-system-contract.md`
- 모바일 회귀 기준은 `.harness/project/workflow-rules.md`
- 화면 흐름 결정은 `.harness/session/decision-log.md`
