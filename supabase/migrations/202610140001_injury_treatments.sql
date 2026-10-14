-- 사용자가 받은 처치(주사·충격파)를 날짜와 함께 남긴다 (#850).
--
-- 왜 필요한가: "어제 스테로이드 주사를 맞았다"가 장기기억·부상 기록 어디에도 남지 않았다(2026-10-14).
-- 2주 뒤 코치는 "주사 후 며칠째"를 모른 채 복귀를 안내한다.
--
-- 왜 training_memory(부상 항목) 안이 아니라 별도 표인가: training_memory 는 JSON 을 통째로 저장해
-- 나중 쓰기가 이긴다(LWW). 코치(Edge)가 거기에 쓰면 열려 있던 웹 탭의 저장이 지워버린다(7/22 실사고 계열).
-- 이 표는 코치가 감지해 행 단위로만 넣는다.
create table if not exists public.injury_treatments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- treatmentMention.ts 의 TreatmentKind.
  kind text not null check (kind in ('corticosteroid', 'eswt', 'pdrn', 'prp', 'injection')),
  -- 처치 받은 날(한국 날짜). "어제 맞았다"는 코드가 풀어 넣는다.
  treated_on date not null,
  created_at timestamptz not null default now()
);

-- 같은 처치를 두 번 말해도 한 번만 남긴다.
create unique index if not exists injury_treatments_user_kind_day_key
  on public.injury_treatments(user_id, kind, treated_on);

alter table public.injury_treatments enable row level security;

create policy "injury_treatments_select_own" on public.injury_treatments
  for select using (user_id = auth.uid());
create policy "injury_treatments_insert_own" on public.injury_treatments
  for insert with check (user_id = auth.uid());
create policy "injury_treatments_delete_own" on public.injury_treatments
  for delete using (user_id = auth.uid());
