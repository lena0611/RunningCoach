alter table public.coach_reports
  drop constraint if exists coach_reports_selected_run_id_fkey;

alter table public.coach_reports
  add constraint coach_reports_selected_run_id_fkey
  foreign key (selected_run_id)
  references public.run_logs(id)
  on delete cascade;

alter table public.coach_memory_items
  drop constraint if exists coach_memory_items_source_report_id_fkey;

alter table public.coach_memory_items
  add constraint coach_memory_items_source_report_id_fkey
  foreign key (source_report_id)
  references public.coach_reports(id)
  on delete cascade;
