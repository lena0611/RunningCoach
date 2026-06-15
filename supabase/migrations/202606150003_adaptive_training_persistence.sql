-- #328 적응값 영속화 스키마
-- training_memory(JSONB 단일 컬럼)에 묻혀 있던 적응값/이력을 정규화 테이블로 분리한다.
-- weekly_patterns: weeklyPattern 변경 이력
-- adaptive_training_metrics: Tempo/Easy HR/Long Run drift/Recovery cycle 적응 상태(추정→검증→적응)
-- training_phase_history: phase 전환 타임라인

create table if not exists public.weekly_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  version integer not null default 1,
  -- TrainingMemory.weeklyPattern(string[]) 미러.
  weekly_pattern jsonb not null default '[]'::jsonb,
  -- 'onboarding' | 'ai_evolution' | 'manual'
  derived_from text not null default 'manual',
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create table if not exists public.adaptive_training_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- 'tempo_ceiling' | 'easy_ceiling' | 'long_run_drift' | 'recovery_cycle'
  metric_type text not null,
  base_value numeric,
  adopted_value numeric,
  -- 'bpm' | 'percent' | 'days'
  unit text not null default 'bpm',
  evidence_run_ids uuid[] not null default '{}',
  -- 추정(estimated) → 검증중(watch) → 채택(adopted)
  status text not null default 'estimated' check (status in ('estimated', 'watch', 'adopted')),
  adopted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 사용자별 metric_type는 현재값 1행만 유지(이력은 evidence_run_ids/updated_at으로).
  unique (user_id, metric_type)
);

create table if not exists public.training_phase_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- 'Base' | 'Build' | 'Threshold' | 'Race Specific' | 'Taper' | 'Recovery'
  phase_name text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transition_reason text not null default '',
  -- ProgressionCriterion[] status 스냅샷(id → status).
  progression_criteria_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists weekly_patterns_user_status_idx
  on public.weekly_patterns(user_id, status, version desc);
create index if not exists adaptive_training_metrics_user_idx
  on public.adaptive_training_metrics(user_id, metric_type);
create index if not exists training_phase_history_user_started_idx
  on public.training_phase_history(user_id, started_at desc);

alter table public.weekly_patterns enable row level security;
alter table public.adaptive_training_metrics enable row level security;
alter table public.training_phase_history enable row level security;

-- 본인 행만 read/write.
create policy "weekly_patterns_select_own" on public.weekly_patterns
  for select using (user_id = auth.uid());
create policy "weekly_patterns_insert_own" on public.weekly_patterns
  for insert with check (user_id = auth.uid());
create policy "weekly_patterns_update_own" on public.weekly_patterns
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "weekly_patterns_delete_own" on public.weekly_patterns
  for delete using (user_id = auth.uid());

create policy "adaptive_training_metrics_select_own" on public.adaptive_training_metrics
  for select using (user_id = auth.uid());
create policy "adaptive_training_metrics_insert_own" on public.adaptive_training_metrics
  for insert with check (user_id = auth.uid());
create policy "adaptive_training_metrics_update_own" on public.adaptive_training_metrics
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "adaptive_training_metrics_delete_own" on public.adaptive_training_metrics
  for delete using (user_id = auth.uid());

create policy "training_phase_history_select_own" on public.training_phase_history
  for select using (user_id = auth.uid());
create policy "training_phase_history_insert_own" on public.training_phase_history
  for insert with check (user_id = auth.uid());
create policy "training_phase_history_update_own" on public.training_phase_history
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "training_phase_history_delete_own" on public.training_phase_history
  for delete using (user_id = auth.uid());

-- 기존 tempoCeiling(#301) 적응값을 adaptive_training_metrics로 백필.
-- training_memory.memory->adaptiveTrainingProfile->tempoCeiling = {adoptedBpm, baseBpm, adoptedAt}
insert into public.adaptive_training_metrics (user_id, metric_type, base_value, adopted_value, unit, status, adopted_at)
select
  tm.user_id,
  'tempo_ceiling',
  nullif(tm.memory->'adaptiveTrainingProfile'->'tempoCeiling'->>'baseBpm', '')::numeric,
  nullif(tm.memory->'adaptiveTrainingProfile'->'tempoCeiling'->>'adoptedBpm', '')::numeric,
  'bpm',
  case
    when nullif(tm.memory->'adaptiveTrainingProfile'->'tempoCeiling'->>'adoptedBpm', '') is not null then 'adopted'
    else 'estimated'
  end,
  nullif(tm.memory->'adaptiveTrainingProfile'->'tempoCeiling'->>'adoptedAt', '')::timestamptz
from public.training_memory tm
where tm.memory->'adaptiveTrainingProfile'->'tempoCeiling' is not null
  and (
    nullif(tm.memory->'adaptiveTrainingProfile'->'tempoCeiling'->>'adoptedBpm', '') is not null
    or nullif(tm.memory->'adaptiveTrainingProfile'->'tempoCeiling'->>'baseBpm', '') is not null
  )
on conflict (user_id, metric_type) do nothing;
