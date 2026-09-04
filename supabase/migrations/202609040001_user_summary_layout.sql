-- 요약 탭 구성 편집(#767 후속) — 무엇을 보이고 어떤 순서로 둘지.
--
-- **override 만 저장한다.** 기본 목록은 코드가 갖고(summaryBlocks.ts), 여기엔 사용자가 바꾼 것만 남는다.
-- 그래서 ① 나중에 기본 카드를 하나 추가해도 기존 사용자 화면에 자동으로 보이고,
-- ② 행이 없는 사용자는 코드 기본값 그대로 보인다(마이그레이션으로 시드할 필요가 없다).
-- 전체 목록을 통째로 저장하는 방식이면 위 둘 다 깨진다.
--
-- ⚠️ training_memory 에 얹지 않는다 — 그 테이블은 JSON 을 통째 저장해 마지막 쓰기가 이긴다
-- (2026-07-22 stale 탭이 폰의 휴식 상태를 지운 실사고). 이 표는 편집 화면만 쓰는 독립 행이다.
create table if not exists public.user_summary_layout (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  -- 숨긴 블록 id. 코드의 기본 숨김 목록을 **대체**한다(비어 있으면 전부 보임).
  hidden text[] not null default '{}',
  -- 지표 카드 순서(기본 카드 id + 사용자 카드 uuid 섞임). 목록에 없는 id 는 뒤에 기본 순서로 붙는다.
  card_order text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_summary_layout enable row level security;

create policy "user_summary_layout_select_own" on public.user_summary_layout
  for select using (user_id = auth.uid());
create policy "user_summary_layout_insert_own" on public.user_summary_layout
  for insert with check (user_id = auth.uid());
create policy "user_summary_layout_update_own" on public.user_summary_layout
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_summary_layout_delete_own" on public.user_summary_layout
  for delete using (user_id = auth.uid());

comment on table public.user_summary_layout is
  '요약 탭 구성 override(#767 후속). 기본 목록은 코드가 갖고 여기엔 사용자가 바꾼 것만 남는다 — 새 기본 카드가 자동 노출되고, 행 없는 사용자는 코드 기본값을 본다.';
