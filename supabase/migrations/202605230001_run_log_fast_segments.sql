alter table public.run_logs
  add column if not exists fast_segments jsonb not null default '[]'::jsonb;
