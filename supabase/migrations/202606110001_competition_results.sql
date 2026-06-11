-- 가상레이싱 결과(경량 competition_result) 저장 (#233, competition-domain §10).
--
-- 원칙(확정, §10): 가상레이싱은 훈련 분류와 직교하는 "경쟁 주석"이다.
--   - 정본 활동 = run_logs (type 불변, inferRunType 유지). 레이싱 수행 세션은 run_logs.tags 의
--     'self-race' 태그로만 식별한다(별도 type 강제 금지 — Riegel/부하/추세 오염 방지).
--   - 레이싱 결과(타겟 PB·시간차·승패)는 이 테이블에 경량 주석으로 둔다.
--   - ⚠️ 이중계산 방지: 이 테이블은 볼륨·부하·추세 집계에 절대 미포함. 업적·동기부여·코칭 인용 전용.
--     PB 갱신은 #228 이 run_logs 재산출로 자동 반영하므로 여기서 PB 를 소유하지 않는다.
--
-- 모드: MVP 는 'self-pb'(나와의 대결 = 내 베스트 도전)만. 타겟 '없음'(자유 TT)은 결과가 없으므로
--   이 테이블에 행을 만들지 않고 run_logs.tags 에 'self-race' 태그만 붙는다(웹 처리).

create table if not exists public.competition_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  mode text not null default 'self-pb' check (mode in ('self-pb')),
  -- 타겟 = 거리별 내 베스트 PB. source_run_id 는 그 PB 를 소유한 RunLog(약결합, 삭제 시 NULL).
  target_distance_m numeric not null,
  target_elapsed_sec numeric not null,
  target_source_run_id uuid references public.run_logs(id) on delete set null,
  -- 이번 레이싱 실측(라이브 트래킹 기준). 정본 거리/시간은 linked_run_id 의 run_logs 가 소유.
  raced_distance_m numeric not null,
  raced_duration_sec numeric,
  -- 부호 약속(ghost.ts): 음수 = 타겟 PB 보다 빠름(win), 양수 = 느림(lose).
  result_gap_sec numeric not null,
  outcome text not null check (outcome in ('win', 'lose', 'tie')),
  -- 종료 후 import 된 정본 RunLog 와 시간·거리 근접 매칭으로 링크.
  linked_run_id uuid references public.run_logs(id) on delete set null,
  raced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists competition_results_user_raced_idx
  on public.competition_results(user_id, raced_at desc);

alter table public.competition_results enable row level security;

-- 본인 행만 read/write.
create policy "competition_results_select_own" on public.competition_results
  for select using (user_id = auth.uid());
create policy "competition_results_insert_own" on public.competition_results
  for insert with check (user_id = auth.uid());
create policy "competition_results_update_own" on public.competition_results
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "competition_results_delete_own" on public.competition_results
  for delete using (user_id = auth.uid());
