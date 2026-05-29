# Workstream 05: AI 코칭/Supabase Edge Function

## 시작 문구

```text
이 대화창은 AI 코칭과 Supabase Edge Function 업무만 다룬다.
먼저 .harness/session/workstreams/05-ai-coaching.md를 읽고, 코칭 프롬프트/스트리밍/Edge Function 범위에서만 작업해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 모든 사용자 요청을 처리하기 전에 이 창의 workstream이 `05-ai-coaching`인지 먼저 확인한다.
- 현재 창의 workstream이 불명확하거나 요청이 담당 범위를 넘으면 넓은 작업을 진행하지 말고 대상 workstream과 인수인계 문구를 제안한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 공통 창간 운영 기준을 따른다.
- 완료 전 후속 창으로 넘길 때는 커밋하지 않고, 인수인계 문구에 `git status --short`, `git diff`, 필요 시 `git diff --staged` 확인 지시를 포함한다.

## 담당 범위
- `coach-run` Edge Function
- OpenAI 코칭 프롬프트와 판단 보드
- 코칭 스트리밍/응답 파싱
- 코칭 메모리와 훈련 지식 컨텍스트
- Supabase Edge Function 배포 필요성 판단

## 먼저 읽을 문서
1. `.harness/session/active-context.md`
2. `.harness/project/ai-coaching-goal.md`
3. `.harness/project/running-coaching-standards.md`
4. `.harness/project/config-contract.md`
5. `.harness/project/training-knowledge-ops.md`

## 관련 파일
- `supabase/functions/coach-run/index.ts`
- `supabase/functions/coach-run/injuryTemporalFilter.ts`
- `src/shared/api/coachRepository.ts`
- `src/features/generate-ai-context/buildPrompt.ts`
- `src/features/generate-ai-context/ruleBasedCoach.ts`
- `src/pages/run-log/RunLogPage.vue`

## 제외 범위
- UI 전체 리디자인
- HealthKit native bridge
- DB schema 변경 자체
- 러닝 계산 공식의 근본 변경

## 범위 밖 처리
- 코칭 화면 구조가 커지면 `03-ui-ux`로 넘긴다.
- 훈련 공식이나 세션 판정 기준이 바뀌면 `04-running-logic`으로 넘긴다.
- DB schema나 migration이 필요하면 `07-data-supabase`로 넘긴다.
- 넘길 때는 코칭 컨텍스트, 프롬프트 요구, 현재 문제 증상, 관련 파일을 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 코칭 말투/판단 기준은 `.harness/project/ai-coaching-goal.md`
- 배포/검증 예외는 `.harness/session/decision-log.md`
- 수동 배포 필요는 `.harness/session/manual-actions.md`
