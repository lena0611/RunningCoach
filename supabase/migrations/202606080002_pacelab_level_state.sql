-- 성장형 RPG 레벨 시스템 저장 계약 (#260 설계 / #262 토대).
--
-- 원칙: 거리 클래스·VDOT 등급·도전 자격은 프로필 + run_logs 에서 결정적으로 파생한다(업적과 동일,
-- achievements.ts). 따라서 "파생 가능"한 값은 저장하지 않는다. 저장은 run_logs 로 복원 불가능한
-- 상태에만 둔다:
--   1) 온보딩 자기보고 초기 배치(아직 GPS 주행으로 인증되기 전 잠정 값)
--   2) 퀘스트(루틴/승급/유지) 진행·완료 기록
--   3) XP·코인 ledger (참여 보상; 무결성상 등급에는 영향 없음)
--
-- 모두 웹 클라이언트가 RLS(auth.uid())로 직접 읽고 쓴다.

-- 1) 레벨 상태(사용자당 1행): 온보딩 잠정 배치 + 마지막 축하 확인 상태.
create table if not exists public.pacelab_level_state (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  -- 온보딩 자기보고: GPS 주행으로 인증되기 전 잠정 클래스/등급의 근거.
  self_reported_max_distance_m numeric,
  self_reported_vdot numeric,
  placement_source text not null default 'self_report' check (placement_source in ('self_report', 'verified')),
  placed_at timestamptz,
  -- 마지막으로 축하 모달을 보여준(사용자가 확인한) 클래스/등급. 재노출 방지용.
  acknowledged_class text,
  acknowledged_grade text,
  updated_at timestamptz not null default now()
);

-- 2) 퀘스트 로그: 루틴/승급/유지 퀘스트의 진행·완료.
create table if not exists public.pacelab_quest_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  quest_type text not null check (quest_type in ('routine', 'promotion', 'maintenance')),
  quest_key text not null,
  target_class text,
  status text not null default 'active' check (status in ('active', 'completed', 'skipped', 'expired')),
  -- 완료를 입증한 run_logs.id (승급/유지 퀘스트의 self-race 등). FK 없이 약결합.
  run_id text,
  xp_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists pacelab_quest_log_user_created_idx
  on public.pacelab_quest_log(user_id, created_at desc);

-- 3) 보상 ledger: XP·코인 적립(append-only). 등급(실력)과 분리된 참여 보상.
create table if not exists public.pacelab_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('xp', 'coin')),
  amount integer not null,
  reason text,
  source_quest_id uuid references public.pacelab_quest_log(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pacelab_reward_ledger_user_created_idx
  on public.pacelab_reward_ledger(user_id, created_at desc);

alter table public.pacelab_level_state enable row level security;
alter table public.pacelab_quest_log enable row level security;
alter table public.pacelab_reward_ledger enable row level security;

-- 레벨 상태: 본인 행만 read/write.
create policy "pacelab_level_state_select_own" on public.pacelab_level_state
  for select using (user_id = auth.uid());
create policy "pacelab_level_state_insert_own" on public.pacelab_level_state
  for insert with check (user_id = auth.uid());
create policy "pacelab_level_state_update_own" on public.pacelab_level_state
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 퀘스트 로그: 본인 행만 read/write.
create policy "pacelab_quest_log_select_own" on public.pacelab_quest_log
  for select using (user_id = auth.uid());
create policy "pacelab_quest_log_insert_own" on public.pacelab_quest_log
  for insert with check (user_id = auth.uid());
create policy "pacelab_quest_log_update_own" on public.pacelab_quest_log
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 보상 ledger: append-only. 본인 행 read/insert 만 허용(수정·삭제 정책 없음).
create policy "pacelab_reward_ledger_select_own" on public.pacelab_reward_ledger
  for select using (user_id = auth.uid());
create policy "pacelab_reward_ledger_insert_own" on public.pacelab_reward_ledger
  for insert with check (user_id = auth.uid());
