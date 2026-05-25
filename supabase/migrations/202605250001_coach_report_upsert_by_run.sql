alter table public.coach_reports
  add column if not exists updated_at timestamptz not null default now();

update public.coach_reports
set updated_at = created_at
where updated_at is null;

with ranked_reports as (
  select
    id,
    first_value(id) over (
      partition by user_id, selected_run_id
      order by created_at desc, id desc
    ) as keep_id,
    row_number() over (
      partition by user_id, selected_run_id
      order by created_at desc, id desc
    ) as rn
  from public.coach_reports
  where selected_run_id is not null
)
update public.coach_memory_items item
set source_report_id = ranked_reports.keep_id
from ranked_reports
where item.source_report_id = ranked_reports.id
  and ranked_reports.rn > 1;

with ranked_reports as (
  select
    id,
    row_number() over (
      partition by user_id, selected_run_id
      order by created_at desc, id desc
    ) as rn
  from public.coach_reports
  where selected_run_id is not null
)
delete from public.coach_reports report
using ranked_reports
where report.id = ranked_reports.id
  and ranked_reports.rn > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coach_reports_user_selected_run_unique'
  ) then
    alter table public.coach_reports
      add constraint coach_reports_user_selected_run_unique unique (user_id, selected_run_id);
  end if;
end $$;

create index if not exists coach_reports_user_updated_idx on public.coach_reports(user_id, updated_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_reports'
      and policyname = 'coach_reports_update_own'
  ) then
    create policy "coach_reports_update_own"
      on public.coach_reports
      for update
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;
