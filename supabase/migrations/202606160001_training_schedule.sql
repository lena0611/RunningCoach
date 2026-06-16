-- #363 (에픽 #362) 날짜축 주기화 스케줄 영속화
-- weeklyPattern(요일 반복)과 달리, 목표(D-day)까지 날짜별 계획 세션을 담는다.
-- F2 생성기가 write, A1 재정렬이 superseded→재구축, A2 작전 바꾸기가 대체안 insert.

create table if not exists public.training_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- training_memory.goals[].id 약결합(jsonb 임베드, FK 없음). 활성 목표 없으면 null.
  goal_id text,
  session_date date not null,
  -- TrainingPhaseName: 'Base'|'Build'|'Threshold'|'Race Specific'|'Taper'|'Recovery'
  phase text not null,
  -- RunType: 'Easy'|'Recovery'|'Easy + Strides'|'Tempo'|'LSD'|'Steady Long'|'Race'|'Unknown'
  session_type text not null,
  key_session boolean not null default false,
  -- ScheduledSessionPrescription { distanceKm, durationMin, paceRange, note }
  prescription jsonb not null default '{}'::jsonb,
  status text not null default 'planned' check (status in ('planned', 'done', 'superseded', 'missed')),
  -- 'generator' | 'realign' | 'manual'
  source text not null default 'generator',
  run_id uuid references public.run_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_schedule_user_date_idx
  on public.training_schedule(user_id, session_date);
create index if not exists training_schedule_user_goal_status_idx
  on public.training_schedule(user_id, goal_id, status);

alter table public.training_schedule enable row level security;

create policy "training_schedule_select_own" on public.training_schedule
  for select using (user_id = auth.uid());
create policy "training_schedule_insert_own" on public.training_schedule
  for insert with check (user_id = auth.uid());
create policy "training_schedule_update_own" on public.training_schedule
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "training_schedule_delete_own" on public.training_schedule
  for delete using (user_id = auth.uid());
