-- 요약 탭 사용자 정의 데이터 카드(#767).
--
-- 코치방에서 임의 데이터 질문에 답할 수 있지만(queryRuns, #652) **매번 물어야** 해서 실사용에서
-- 순수 데이터 질문은 21건 중 1건뿐이었다. 수요가 없는 게 아니라 묻는 비용이 매번 든 것이다.
-- 카드로 고정하면 묻는 비용이 한 번으로 끝나고 보는 건 공짜가 된다.
--
-- ⚠️ **training_memory 에 얹지 않는다.** 그 테이블은 JSON 을 통째로 저장해 마지막 쓰기가 이깁니다 —
-- 2026-07-22 에 stale 탭이 폰의 휴식 상태를 지운 실사고가 있었다. 카드는 행 단위로 독립 저장한다.
--
-- ⚠️ spec 은 **닫힌 어휘로 검증된 뒤** 저장된다(_shared/dataCard.ts). 임의 SQL 이 아니라 필드·연산자·
-- 그룹·지표 화이트리스트 조합이라, 저장된 값으로 매번 결정론 재계산이 가능하다. 그래서 LLM 은
-- 등록 때 한 번만 부른다(요약을 열 때마다 부르면 원가도, 숫자의 일관성도 무너진다).
create table if not exists public.user_data_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- 카드 제목(사용자 말 그대로가 아니라 코치가 다듬어 제안한 짧은 이름).
  title text not null,
  -- 사용자가 실제로 한 말. 나중에 "왜 이 카드가 이렇게 계산되나"를 되짚고, 스펙 확장 근거로도 쓴다.
  request_text text,
  -- 검증 통과한 DataCardSpec(single | ratio). 계산은 이 값만 보면 된다.
  spec jsonb not null,
  -- 요약 탭 표시 순서. 작은 값이 위.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_data_cards_user_position_idx
  on public.user_data_cards (user_id, position, created_at);

alter table public.user_data_cards enable row level security;

create policy "user_data_cards_select_own" on public.user_data_cards
  for select using (user_id = auth.uid());
create policy "user_data_cards_insert_own" on public.user_data_cards
  for insert with check (user_id = auth.uid());
create policy "user_data_cards_update_own" on public.user_data_cards
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_data_cards_delete_own" on public.user_data_cards
  for delete using (user_id = auth.uid());

comment on table public.user_data_cards is
  '요약 탭 사용자 정의 데이터 카드(#767). spec 은 닫힌 어휘로 검증된 DataCardSpec — 저장 후 LLM 없이 결정론 재계산한다. training_memory 에 얹지 않는 이유는 통째 덮어쓰기 사고 이력 때문이다.';
