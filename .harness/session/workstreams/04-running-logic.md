# Workstream 04: 러닝 도메인/훈련 로직

## 시작 문구

```text
이 대화창은 러닝 도메인/훈련 로직 업무만 다룬다.
먼저 .harness/session/workstreams/04-running-logic.md를 읽고, 세션 판정/목표 계산/훈련 기준 범위에서만 작업해줘.
완료 승인 전에는 build/test/harness:check/commit/push/PR을 실행하지 말고 후보로만 보고해줘.
```

## 요청 처리 규칙
- 모든 사용자 요청을 처리하기 전에 이 창의 workstream이 `04-running-logic`인지 먼저 확인한다.
- 현재 창의 workstream이 불명확하거나 요청이 담당 범위를 넘으면 넓은 작업을 진행하지 말고 대상 workstream과 인수인계 문구를 제안한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 공통 창간 운영 기준을 따른다.
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

## 범위 밖 처리
- 로직 결과를 크게 화면화해야 하면 `03-ui-ux`로 넘긴다.
- AI 코칭 말투나 Edge Function 판단이 필요하면 `05-ai-coaching`으로 넘긴다.
- 저장 스키마나 HealthKit 계약이 바뀌면 각각 `07-data-supabase`, `06-healthkit-ios`로 넘긴다.
- 넘길 때는 만든/수정한 계산 기준, 입력/출력, 필요한 표시나 저장 요구를 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 반복 도메인 규칙은 `.harness/project/domain-rules.md`
- 훈련 기준선은 `.harness/project/running-coaching-standards.md`
- 공식 선택 이유는 `.harness/session/decision-log.md`
