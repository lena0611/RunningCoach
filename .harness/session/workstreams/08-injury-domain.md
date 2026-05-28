# Workstream 08: 부상관리/컨디션 도메인

## 시작 문구

```text
이 대화창은 부상관리/컨디션 도메인 업무만 다룬다.
먼저 .harness/session/workstreams/08-injury-domain.md를 읽고, 부상 부위 정규화/통증/회복 신호/보강운동 범위에서만 작업해줘.
완료 승인 전에는 build/test/harness:check/commit/push/PR을 실행하지 말고 후보로만 보고해줘.
```

## 요청 처리 규칙
- 모든 사용자 요청을 처리하기 전에 이 창의 workstream이 `08-injury-domain`인지 먼저 확인한다.
- 현재 창의 workstream이 불명확하거나 요청이 담당 범위를 넘으면 넓은 작업을 진행하지 말고 대상 workstream과 인수인계 문구를 제안한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 공통 창간 운영 기준을 따른다.
- 완료 전 후속 창으로 넘길 때는 커밋하지 않고, 인수인계 문구에 `git status --short`, `git diff`, 필요 시 `git diff --staged` 확인 지시를 포함한다.

## 담당 범위
- 부상 부위 정규화
- painLevel, severity, 회복/수면 신호 분리
- 부상 선택 UI의 도메인 입력 구조
- 코칭에서 부상/회복 게이트 반영
- 보수적 보강운동 기준

## 먼저 읽을 문서
1. `.harness/session/active-context.md`
2. `.harness/project/domain-rules.md`
3. `.harness/project/ai-coaching-goal.md`
4. `.harness/project/running-coaching-standards.md`

## 관련 파일
- `src/entities/training-memory/injuryAreas.ts`
- `src/entities/training-memory/model.ts`
- `src/shared/ui/InjuryBodySelector.vue`
- `src/pages/memory/MemoryPage.vue`
- `supabase/functions/coach-run/injuryTemporalFilter.ts`
- `supabase/functions/coach-run/index.ts`

## 제외 범위
- 일반 UI 리디자인
- HealthKit bridge 구현
- Supabase schema 전반 변경
- 러닝 페이스 공식 조사

## 범위 밖 처리
- 부상 입력 화면 구조가 커지면 `03-ui-ux`로 넘긴다.
- 부상 데이터 저장 schema가 바뀌면 `07-data-supabase`로 넘긴다.
- 코칭 프롬프트 반영이 중심이면 `05-ai-coaching`으로 넘긴다.
- 넘길 때는 부상 도메인 결정, 정규화 항목, painLevel/severity 의미, 필요한 화면/저장 요구를 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 도메인 규칙은 `.harness/project/domain-rules.md`
- 코칭 반영 기준은 `.harness/project/ai-coaching-goal.md`
- 의료 진단 금지/보수적 판단 이유는 `.harness/session/decision-log.md`
