-- 범용 휴식 선언 + 닦달 차단 (#473 Phase 1): ScheduledSessionStatus 에 'rested'(사용자가 선언한 의도된 휴식) 추가.
-- 능동 휴식 ≠ missed — 그 기간 세션은 정산(missed 확정)·트리아지·재정렬·런 매칭에서 자동 제외된다(SSOT §휴식과 복귀).
-- 기존 인라인 CHECK 는 Postgres 가 training_schedule_status_check 로 자동 명명. append-only 이므로 과거 마이그레이션은
-- 수정하지 않고, 202606190001(skipped) 선례대로 drop 후 재생성한다(drop+recreate 는 full-replace — 기존 5개 값 전부 재나열 필수).

alter table public.training_schedule
  drop constraint if exists training_schedule_status_check;

alter table public.training_schedule
  add constraint training_schedule_status_check
  check (status in ('planned', 'done', 'superseded', 'missed', 'skipped', 'rested'));
