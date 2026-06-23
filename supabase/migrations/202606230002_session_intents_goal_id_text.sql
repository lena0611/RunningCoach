-- pacelab_session_intents.goal_id: uuid → text (#473 후속 버그픽스).
-- 목표 id 는 training_memory.goals[] 의 jsonb 임베드 문자열("goal-10k-60" 등)로, 별도 테이블·FK 가 없다.
-- training_schedule.goal_id 는 올바르게 text 인데(202606160001) 이 테이블만 uuid 로 만들어져, 코치 프리런 의도
-- 저장이 400(22P02 invalid input syntax for type uuid: "goal-10k-60")으로 실패해 왔다. text 로 정렬한다.
-- 기존 행은 uuid → text 캐스팅으로 보존(인덱스·RLS 는 goal_id 미참조라 영향 없음).

alter table public.pacelab_session_intents
  alter column goal_id type text using goal_id::text;
