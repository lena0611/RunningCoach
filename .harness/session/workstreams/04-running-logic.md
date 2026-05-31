# Workstream 04: 러닝 도메인/훈련 로직

## 시작 문구

```text
이 요청은 러닝 도메인/훈련 로직 중심으로 처리해줘.
먼저 .harness/session/workstreams/04-running-logic.md를 읽고, 같은 목표 안에 필요한 관련 영역은 이 창에서 함께 관리해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 이 파일은 담당 창 고정 기준이 아니라 `04-running-logic` 읽을거리 라우팅 기준이다.
- 요청 목표가 러닝 도메인/훈련 로직 중심인지 확인하고, 같은 목표 안의 UI/AI/DB/HealthKit 영향 검토는 현재 요청 창에서 함께 처리한다.
- 독립 목표나 동시 업무가 섞이면 넓히지 말고 별도 Issue/worktree/branch로 분리한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 요청 단위 운영 기준을 따른다.
- 완료 전 후속 창으로 넘길 때는 커밋하지 않고, 인수인계 문구에 `git status --short`, `git diff`, 필요 시 `git diff --staged` 확인 지시를 포함한다.

## 담당 범위
- 세션 유형 추론
- 코스 타입 추론
- 목표 가능성, 페이스 기준, 심박/강도 기준
- 피로도, 훈련 추천 계산
- 검증 가능한 러닝 도메인 룰 승격

## 먼저 읽을 문서
1. `.harness/session/active-context.md`
2. `.harness/project/domain-rules.md`
3. `.harness/project/running-coaching-standards.md`
4. `.harness/project/workflow-rules.md`

## 관련 파일
- `src/features/infer-run-type/inferRunType.ts`
- `src/features/infer-course-type/inferCourseType.ts`
- `src/shared/lib/performanceProjection.ts`
- `src/shared/lib/heartRateZones.ts`
- `src/shared/lib/runStats.ts`
- `src/entities/run/model.ts`

## 제외 범위
- AI 답변 문체와 프롬프트
- UI 레이아웃 수정
- HealthKit native bridge 구현
- Supabase migration 작성

## 인접 영역 처리와 분리 기준
- 현재 러닝 로직 요청을 완료하는 데 필요한 화면화, AI 코칭 판단, 저장 스키마, HealthKit 계약 검토는 관련 workstream 파일을 추가로 읽고 같은 창에서 처리한다.
- 로직 변경과 별개인 UI/AI/DB/HealthKit 목표가 생기면 별도 Issue/worktree/branch로 분리한다.
- 분리할 때는 만든/수정한 계산 기준, 입력/출력, 필요한 표시나 저장 요구를 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 반복 도메인 규칙은 `.harness/project/domain-rules.md`
- 훈련 기준선은 `.harness/project/running-coaching-standards.md`
- 공식 선택 이유는 `.harness/session/decision-log.md`
