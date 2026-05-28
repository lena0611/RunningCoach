# Workstream 07: 데이터/Supabase

## 시작 문구

```text
이 대화창은 데이터 저장소와 Supabase 업무만 다룬다.
먼저 .harness/session/workstreams/07-data-supabase.md를 읽고, DB/repository/store/migration 범위에서만 작업해줘.
완료 승인 전에는 build/test/harness:check/db push/배포/commit/push/PR을 실행하지 말고 후보로만 보고해줘.
```

## 요청 처리 규칙
- 모든 사용자 요청을 처리하기 전에 이 창의 workstream이 `07-data-supabase`인지 먼저 확인한다.
- 현재 창의 workstream이 불명확하거나 요청이 담당 범위를 넘으면 넓은 작업을 진행하지 말고 대상 workstream과 인수인계 문구를 제안한다.
- 선행 결정/구현, 완료 처리 판단, 임시 인수인계 템플릿은 `.harness/session/workstreams/README.md`의 공통 창간 운영 기준을 따른다.
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

## 범위 밖 처리
- 저장된 데이터를 어떻게 보여줄지의 화면 판단은 `03-ui-ux`로 넘긴다.
- AI 코칭 컨텍스트나 Edge Function 응답 문제가 중심이면 `05-ai-coaching`으로 넘긴다.
- HealthKit 입력 계약이 바뀌면 `06-healthkit-ios`로 넘긴다.
- 넘길 때는 schema/repository 변경 필요성, 영향 테이블, 관련 store/API 파일, 마이그레이션 여부를 짧게 정리한 인수인계 문구를 작성한다.

## 종료 전 기록
- 저장 계약 변경은 `.harness/project/architecture-rules.md` 또는 `.harness/project/config-contract.md`
- migration/배포 수동 조치는 `.harness/session/manual-actions.md`
- 위험한 스키마 선택은 `.harness/session/decision-log.md`
