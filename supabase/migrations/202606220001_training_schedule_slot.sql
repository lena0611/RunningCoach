-- #455 같은 날 2세션(더블 AM/PM): training_schedule 에 slot 추가.
-- null = 단일 세션 날(레거시·기본값). 'AM'/'PM' = 더블 슬롯. 강도는 AM, 둘째(PM)는 이지
-- (SSOT §같은 날 2세션). 기존 행은 모두 null 로 남아 동작이 바뀌지 않는다.
--
-- ⚠ UNIQUE(user_id, goal_id, session_date, slot) 제약은 두지 않는다 —
--   reschedule/supersede 가 같은 (date, slot) 에 superseded 행을 누적으로 남기므로
--   유니크 제약이면 재배치/되돌리기가 깨진다. 슬롯 중복 방지는 앱 레이어(add 가드)가 맡는다.

alter table public.training_schedule
  add column if not exists slot text check (slot is null or slot in ('AM', 'PM'));

-- 더블 날 조회 시 (날짜 → 슬롯) 정렬을 돕는 보조 인덱스(선택적, 멱등).
create index if not exists training_schedule_user_date_slot_idx
  on public.training_schedule(user_id, session_date, slot);
