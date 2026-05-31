# Workstream 07: 데이터/Supabase

## 시작 문구

```text
이 요청은 데이터 저장소와 Supabase 중심으로 처리해줘.
먼저 .harness/session/workstreams/07-data-supabase.md를 읽고, 같은 목표 안에 필요한 관련 영역은 이 창에서 함께 관리해줘.
MVP 단계에서는 단순 확인/검토/조사 요청이 아닌 한 중간 확인을 기다리지 말고 완료까지 진행해줘. 사용자가 중단점을 지정하면 그 지점에서 멈춰.
```

## 요청 처리 규칙
- 이 파일은 담당 창 고정 기준이 아니라 `07-data-supabase` 읽을거리 라우팅 기준이다.
- 요청 목표가 데이터/Supabase 중심인지 확인하고, 같은 목표 안의 UI/AI/HealthKit 영향 검토는 현재 요청 창에서 함께 처리한다.
- 독립 목표나 동시 업무가 섞이면 넓히지 말고 별도 Issue/worktree/branch로 분리한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 요청 단위 운영 기준을 따른다.
- 완료 전 후속 창으로 넘길 때는 커밋하지 않고, 인수인계 문구에 `git status --short`, `git diff`, 필요 시 `git diff --staged` 확인 지시를 포함한다.

## 담당 범위
- Supabase migration
- repository/store 데이터 매핑
- RunLog, TrainingMemory, TrainingKnowledge 저장 구조
- RLS, 중복 방지, 삭제/수정 흐름
- 인증/DB 설정 계약

## 먼저 읽을 문서
1. `.harness/session/active-context.md`
2. `.harness/project/architecture-rules.md`
3. `.harness/project/config-contract.md`
4. `.harness/project/critical-paths.md`
5. `.harness/project/scope-contract.md`

## 관련 파일
- `supabase/migrations/**`
- `src/shared/api/runRepository.ts`
- `src/shared/api/memoryRepository.ts`
- `src/shared/api/trainingKnowledgeRepository.ts`
- `src/shared/api/supabase.ts`
- `src/app/stores/runStore.ts`
- `src/app/stores/memoryStore.ts`
- `src/entities/**`

## 제외 범위
- AI 프롬프트 품질
- iOS native bridge
- 화면 디자인
- 훈련 공식 자체

## 인접 영역 처리와 분리 기준
- 현재 데이터/Supabase 요청을 완료하는 데 필요한 화면 표시 판단, AI 코칭 컨텍스트, Edge Function 응답, HealthKit 입력 계약 검토는 관련 workstream 파일을 추가로 읽고 같은 창에서 처리한다.
- 데이터 변경과 별개인 UI/AI/HealthKit 목표가 생기면 별도 Issue/worktree/branch로 분리한다.
- 분리할 때는 schema/repository 변경 필요성, 영향 테이블, 관련 store/API 파일, 마이그레이션 여부를 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 저장 계약 변경은 `.harness/project/architecture-rules.md` 또는 `.harness/project/config-contract.md`
- migration/배포 수동 조치는 `.harness/session/manual-actions.md`
- 위험한 스키마 선택은 `.harness/session/decision-log.md`
