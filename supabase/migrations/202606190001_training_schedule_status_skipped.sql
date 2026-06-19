-- 제안훈련 응답(포기/조정) + 주간 정산 (에픽 #362): ScheduledSessionStatus 에 'skipped'(사용자 의도적 포기) 추가.
-- 기존 202606160001_training_schedule.sql 의 인라인 CHECK 는 Postgres 가 training_schedule_status_check 로
-- 자동 명명한다. 과거 마이그레이션은 append-only 이므로 수정하지 않고, 여기서 drop 후 재생성한다.
-- (인라인 제약 명명 패턴 <table>_<column>_check 확인됨. 형제 모델 session_intents 는 이미 'skipped' 허용.)

alter table public.training_schedule
  drop constraint if exists training_schedule_status_check;

alter table public.training_schedule
  add constraint training_schedule_status_check
  check (status in ('planned', 'done', 'superseded', 'missed', 'skipped'));
