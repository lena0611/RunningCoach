create extension if not exists pgcrypto;

create table if not exists public.run_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  type text not null,
  distance_km numeric not null,
  duration_sec numeric,
  avg_pace_sec numeric,
  avg_heart_rate numeric,
  max_heart_rate numeric,
  cadence numeric,
  temperature numeric,
  rpe numeric,
  memo text not null default '',
  laps jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_memory (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  memory jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  selected_run_id uuid references public.run_logs(id) on delete set null,
  user_note text not null default '',
  report text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  content text not null,
  source_report_id uuid references public.coach_reports(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists run_logs_user_date_idx on public.run_logs(user_id, date desc);
create index if not exists coach_reports_user_created_idx on public.coach_reports(user_id, created_at desc);
create index if not exists coach_memory_items_user_created_idx on public.coach_memory_items(user_id, created_at desc);

alter table public.run_logs enable row level security;
alter table public.training_memory enable row level security;
alter table public.coach_reports enable row level security;
alter table public.coach_memory_items enable row level security;

create policy "run_logs_select_own" on public.run_logs for select using (user_id = auth.uid());
create policy "run_logs_insert_own" on public.run_logs for insert with check (user_id = auth.uid());
create policy "run_logs_update_own" on public.run_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "run_logs_delete_own" on public.run_logs for delete using (user_id = auth.uid());

create policy "training_memory_select_own" on public.training_memory for select using (user_id = auth.uid());
create policy "training_memory_insert_own" on public.training_memory for insert with check (user_id = auth.uid());
create policy "training_memory_update_own" on public.training_memory for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "coach_reports_select_own" on public.coach_reports for select using (user_id = auth.uid());
create policy "coach_reports_insert_own" on public.coach_reports for insert with check (user_id = auth.uid());

create policy "coach_memory_items_select_own" on public.coach_memory_items for select using (user_id = auth.uid());
create policy "coach_memory_items_insert_own" on public.coach_memory_items for insert with check (user_id = auth.uid());
