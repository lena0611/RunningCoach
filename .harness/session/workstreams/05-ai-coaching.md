# Workstream 05: AI 코칭/Supabase Edge Function

## 시작 문구

```text
이 요청은 AI 코칭과 Supabase Edge Function 중심으로 처리해줘.
먼저 .harness/session/workstreams/05-ai-coaching.md를 읽고, 같은 목표 안에 필요한 관련 영역은 이 창에서 함께 관리해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 이 파일은 담당 창 고정 기준이 아니라 `05-ai-coaching` 읽을거리 라우팅 기준이다.
- 요청 목표가 AI 코칭/Edge Function 중심인지 확인하고, 같은 목표 안의 UI/훈련 로직/DB 영향 검토는 현재 요청 창에서 함께 처리한다.
- 독립 목표나 동시 업무가 섞이면 넓히지 말고 별도 Issue/worktree/branch로 분리한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 요청 단위 운영 기준을 따른다.
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

## 인접 영역 처리와 분리 기준
- 현재 AI 코칭 요청을 완료하는 데 필요한 코칭 화면 구조, 훈련 공식, 세션 판정, DB schema/migration 검토는 관련 workstream 파일을 추가로 읽고 같은 창에서 처리한다.
- 코칭 변경과 별개인 UI/러닝 로직/DB 목표가 생기면 별도 Issue/worktree/branch로 분리한다.
- 분리할 때는 코칭 컨텍스트, 프롬프트 요구, 현재 문제 증상, 관련 파일을 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 코칭 말투/판단 기준은 `.harness/project/ai-coaching-goal.md`
- 배포/검증 예외는 `.harness/session/decision-log.md`
- 수동 배포 필요는 `.harness/session/manual-actions.md`
