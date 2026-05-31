# Workstream 08: 부상관리/컨디션 도메인

## 시작 문구

```text
이 요청은 부상관리/컨디션 도메인 중심으로 처리해줘.
먼저 .harness/session/workstreams/08-injury-domain.md를 읽고, 같은 목표 안에 필요한 관련 영역은 이 창에서 함께 관리해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 이 파일은 담당 창 고정 기준이 아니라 `08-injury-domain` 읽을거리 라우팅 기준이다.
- 요청 목표가 부상관리/컨디션 도메인 중심인지 확인하고, 같은 목표 안의 UI/DB/AI 코칭 영향 검토는 현재 요청 창에서 함께 처리한다.
- 독립 목표나 동시 업무가 섞이면 넓히지 말고 별도 Issue/worktree/branch로 분리한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 요청 단위 운영 기준을 따른다.
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

## 인접 영역 처리와 분리 기준
- 현재 부상관리/컨디션 요청을 완료하는 데 필요한 입력 화면 구조, 저장 schema, 코칭 프롬프트 반영 검토는 관련 workstream 파일을 추가로 읽고 같은 창에서 처리한다.
- 부상 도메인 변경과 별개인 UI/DB/AI 목표가 생기면 별도 Issue/worktree/branch로 분리한다.
- 분리할 때는 부상 도메인 결정, 정규화 항목, painLevel/severity 의미, 필요한 화면/저장 요구를 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 도메인 규칙은 `.harness/project/domain-rules.md`
- 코칭 반영 기준은 `.harness/project/ai-coaching-goal.md`
- 의료 진단 금지/보수적 판단 이유는 `.harness/session/decision-log.md`
