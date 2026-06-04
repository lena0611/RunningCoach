-- 코칭 장기기억 2계층화(#179): 활성(항상 탑재) / 되새김(관련 시 소환).
-- coach_memory_items에 중요도와 참조 이력을 추가한다.
-- 보존 모델: 중요도가 높으면 오래돼도 남고, 낮으면 시간이 지나며 잊힌다(회수 점수는 coach-run에서 계산).

alter table public.coach_memory_items
  add column if not exists importance smallint not null default 3,
  add column if not exists last_referenced_at timestamptz,
  add column if not exists reference_count integer not null default 0;

-- 활성 기억 선택용: 중요도·참조 최근성·생성 최근성 순 조회.
create index if not exists coach_memory_items_user_importance_idx
  on public.coach_memory_items(user_id, importance desc, last_referenced_at desc nulls last, created_at desc);
