alter table public.run_logs
  add column if not exists route_points jsonb not null default '[]'::jsonb;
