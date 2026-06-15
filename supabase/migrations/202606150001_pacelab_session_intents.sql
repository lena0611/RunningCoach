-- 세션 의도(SessionIntent) 저장 (#308, AI 코치 목표관리형 진화 에픽 #307 기반).
--
-- 목적: 코치가 "오늘 이 훈련을 왜 하는가"와 성공 기준을 하루 단위로 영속한다.
--   Phase 1(생성) → Phase 2(의도 달성률) → Phase 5(신뢰 레이어)의 전제 데이터.
--
-- 약결합 원칙:
--   - goal_id: training_memory.goals[] 는 jsonb 임베드라 테이블이 없다 → FK 없이 uuid 약결합.
--   - run_id: 실행 후 가장 가까운 의도와 매칭되어 채워진다. RunLog 삭제 시 null 로 끊김(의도는 보존).
--   - targets: 심박 상한/범위·RPE 범위·페이스 유지 의도를 jsonb 로 둔다(run_logs.laps 선례).

create table if not exists public.pacelab_session_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- training_memory.goals[].id 약결합(테이블 아님, FK 없음).
  goal_id uuid,
  planned_date date not null,
  session_type text not null,
  title text not null default '',
  why text not null default '',
  -- { hrCeilingBpm, hrRange:[min,max], rpeRange:[min,max], paceHold }
  targets jsonb not null default '{}'::jsonb,
  success_criteria text[] not null default '{}',
  source text not null default 'coach' check (source in ('coach', 'user')),
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped', 'superseded')),
  -- 실행 후 매칭된 정본 RunLog. 삭제 시 null 로 끊김.
  run_id uuid references public.run_logs(id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pacelab_session_intents_user_date_idx
  on public.pacelab_session_intents(user_id, planned_date desc);
create index if not exists pacelab_session_intents_user_status_idx
  on public.pacelab_session_intents(user_id, status);
create index if not exists pacelab_session_intents_run_id_idx
  on public.pacelab_session_intents(run_id) where run_id is not null;

alter table public.pacelab_session_intents enable row level security;

-- 본인 행만 read/write.
create policy "pacelab_session_intents_select_own" on public.pacelab_session_intents
  for select using (user_id = auth.uid());
create policy "pacelab_session_intents_insert_own" on public.pacelab_session_intents
  for insert with check (user_id = auth.uid());
create policy "pacelab_session_intents_update_own" on public.pacelab_session_intents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pacelab_session_intents_delete_own" on public.pacelab_session_intents
  for delete using (user_id = auth.uid());
