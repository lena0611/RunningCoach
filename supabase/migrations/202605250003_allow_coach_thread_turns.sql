alter table public.coach_reports
  drop constraint if exists coach_reports_user_selected_run_unique;

create index if not exists coach_reports_user_run_created_idx
  on public.coach_reports(user_id, selected_run_id, created_at asc);
