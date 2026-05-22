alter table public.run_logs
  add column if not exists external_id text;

create unique index if not exists run_logs_user_external_id_idx
  on public.run_logs(user_id, external_id)
  where external_id is not null;
