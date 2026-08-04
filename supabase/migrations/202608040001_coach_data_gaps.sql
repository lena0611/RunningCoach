-- 답하지 못한 데이터 질문을 자산으로 남긴다(#652 PR2).
--
-- 지금 "어떤 필드를 늘릴까"는 개발자의 추측이다. 이 표가 쌓이면 그 우선순위가 데이터가 된다.
-- 더 나아가 **데이터 모델 로드맵의 입력**이 된다 — "비 온 날" 질문이 반복되면 런 로그에 강수 정보를
-- 저장할 이유가 생긴다. 즉 *무엇을 기록해야 하는지*를 사용자 질문이 알려주는 구조다.
--
-- 답변 품질을 좌우하지 않는 관측 표라서 삽입 실패는 삼킨다(코칭이 로깅 때문에 죽지 않게).

create table if not exists public.coach_data_gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- dataGap.ts 의 DataGapKind. 코드가 판정한 실패 종류(①~⑥ + 게이트).
  kind text not null,
  -- 사용자의 원 질문(userNote). 무엇을 물었는지 없으면 확장 근거로 못 쓴다.
  question text not null default '',
  -- 코드가 관측한 맥락(걸린 필드·적용된 조건 요약 등).
  detail text not null default '',
  -- 모델이 "이게 있어야 답할 수 있다"고 선언한 것(reportDataGap.needed).
  needed text not null default '',
  matched_runs integer,
  created_at timestamptz not null default now()
);

create index if not exists coach_data_gaps_user_created_idx
  on public.coach_data_gaps(user_id, created_at desc);
-- 확장 우선순위 집계는 종류별로 센다.
create index if not exists coach_data_gaps_kind_created_idx
  on public.coach_data_gaps(kind, created_at desc);

alter table public.coach_data_gaps enable row level security;

create policy "coach_data_gaps_select_own" on public.coach_data_gaps
  for select using (user_id = auth.uid());
create policy "coach_data_gaps_insert_own" on public.coach_data_gaps
  for insert with check (user_id = auth.uid());
