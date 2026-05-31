alter table public.run_logs
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz;
