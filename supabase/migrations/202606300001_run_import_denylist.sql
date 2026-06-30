-- 삭제된 HealthKit 워크아웃 재유입 차단 deny-list (#235 후속 G3).
--
-- 문제: 사용자가 RunLog 를 삭제해도 HealthKit 원본 워크아웃은 그대로 남아, 다음 자동 sync/단건 유입이
--   같은 externalId 를 다시 들여온다(특히 잘못 들어온 self-race 를 지워도 부활). run_logs 행이 사라지면
--   isAlreadySaved 의 externalId 중복판정도 못 막는다.
-- 해법: 삭제 시 그 externalId 를 이 영속 deny-list 에 적재하고, 유입 게이트(isAlreadySaved / importCompetitionRun)
--   가 deny 된 externalId 를 건너뛴다.
--
-- 제품 결정(설계 §G3): 자동 sync·단건 유입은 deny-list 를 존중한다. 사용자가 명시적으로 기간을 골라 부르는
--   과거 마이그레이션(handleHistoricalMigrationRuns)은 "직접 다시 부른" 의사로 보아 deny 를 무시하고 해제한다
--   ("자동 재유입은 막되, 직접 다시 부르면 허용"). 해제는 웹이 deleteDeniedExternalId 로 수행.

create table if not exists public.run_import_denylist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  external_id text not null,
  deleted_at timestamptz not null default now(),
  unique (user_id, external_id)
);

create index if not exists run_import_denylist_user_idx
  on public.run_import_denylist(user_id);

alter table public.run_import_denylist enable row level security;

-- 본인 행만 read/write.
create policy "run_import_denylist_select_own" on public.run_import_denylist
  for select using (user_id = auth.uid());
create policy "run_import_denylist_insert_own" on public.run_import_denylist
  for insert with check (user_id = auth.uid());
create policy "run_import_denylist_delete_own" on public.run_import_denylist
  for delete using (user_id = auth.uid());
