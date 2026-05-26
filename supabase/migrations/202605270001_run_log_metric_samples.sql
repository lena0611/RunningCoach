alter table public.run_logs
  add column if not exists metric_samples jsonb not null default '[]'::jsonb;
