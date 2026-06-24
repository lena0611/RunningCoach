-- 코치 리포트에 "코칭 생성 시점의 부상 컨텍스트 스냅샷"을 보존한다.
-- 기존: 부상은 training_memory(현재값)에만 있어 과거 리포트가 그때 부상 상태(상태/심각도)를 재현 못 함.
-- coach-run 이 생성 시점에 (selectedRun 날짜로 시점필터된) 부상 컨텍스트를 jsonb 로 얼려 저장한다.
-- shape: { capturedForRunDate: string|null, activeInjuryItemId: string|null,
--          items: [{ id, title, area, status, severity, onsetDate }] }
-- nullable — 과거 리포트(이 마이그 이전)는 null(스냅샷 없음).

alter table public.coach_reports
  add column if not exists injury_context_snapshot jsonb;
