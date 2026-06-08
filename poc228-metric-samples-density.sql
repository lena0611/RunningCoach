-- PoC② (#228): metricSamples 밀도 측정 — distancePb.ts 구현 전 선행 게이트
-- 목적: 기존 RunLog 중 metricSamples(offsetSec/paceSec) 적분으로 '현실적 PB 곡선'을
--       만들 수 있는 비율을 측정. 너무 낮으면 균등 fallback 비중/고스트(#67) 품질 재검토.
-- 실행: Supabase Dashboard > SQL Editor (읽기 전용, 집계만 반환 / 원시 PII 미반출)
-- 컨텍스트 분리: tags @> ARRAY['self-race'] → 'race', else 'training' (#233/#228 확정)

-- ── Query 1: 컨텍스트별 커버리지 요약 (PoC 핵심 수치) ──────────────────────────
with b as (
  select
    rl.id,
    rl.source,
    rl.distance_km,
    rl.duration_sec,
    case when 'self-race' = any(rl.tags) then 'race' else 'training' end as ctx,
    jsonb_array_length(coalesce(rl.metric_samples, '[]'::jsonb)) as n,
    (select count(*) from jsonb_array_elements(coalesce(rl.metric_samples,'[]'::jsonb)) e
       where nullif(e->>'paceSec','null') is not null) as n_pace,
    (select count(*) from jsonb_array_elements(coalesce(rl.metric_samples,'[]'::jsonb)) e
       where (e->>'offsetSec') is not null) as n_off,
    (select max((e->>'offsetSec')::numeric) from jsonb_array_elements(coalesce(rl.metric_samples,'[]'::jsonb)) e) as max_off
  from public.run_logs rl
),
s as (
  select b.*,
    case when n > 0 and distance_km > 0 then n::numeric / distance_km end as samples_per_km,
    case when n > 1 and duration_sec > 0 then duration_sec::numeric / (n - 1) end as gap_sec,
    case when n_pace > 0 then n_pace::numeric / nullif(n,0) end as pace_cov,
    case when max_off is not null and duration_sec > 0 then max_off / duration_sec end as off_cov,
    -- '현실적 PB 곡선 가능' 정의: 샘플 존재 + pace 80%+ + 밀도 ≥10/km + 시간커버 ≥90%
    (n > 0
      and distance_km >= 5
      and n_pace::numeric / nullif(n,0) >= 0.8
      and n::numeric / nullif(distance_km,0) >= 10
      and coalesce(max_off,0) / nullif(duration_sec,0) >= 0.9) as usable_pb_curve
  from b
)
select
  coalesce(ctx, '(ALL)') as ctx,
  count(*)                                                   as runs,
  count(*) filter (where distance_km >= 5)                   as runs_ge5k,
  count(*) filter (where n > 0)                              as with_samples,
  count(*) filter (where distance_km >= 5 and n > 0)         as ge5k_with_samples,
  count(*) filter (where usable_pb_curve)                    as ge5k_usable_curve,
  round(100.0 * count(*) filter (where usable_pb_curve)
        / nullif(count(*) filter (where distance_km >= 5),0), 1) as usable_pct_of_ge5k,
  round(avg(samples_per_km) filter (where n>0)::numeric, 1)  as avg_samples_per_km,
  round(percentile_cont(0.5) within group (order by samples_per_km)::numeric, 1) as median_samples_per_km,
  round(percentile_cont(0.5) within group (order by gap_sec)::numeric, 1)        as median_gap_sec,
  round(avg(pace_cov) filter (where n>0), 2)                 as avg_pace_coverage,
  round(avg(off_cov)  filter (where n>0), 2)                 as avg_time_coverage
from s
group by rollup(ctx)
order by ctx nulls last;

-- ── Query 2: source별 분해 (metricSamples 가용성은 source와 강한 상관) ──────────
select
  rl.source,
  count(*) as runs,
  count(*) filter (where jsonb_array_length(coalesce(rl.metric_samples,'[]'::jsonb)) > 0) as with_samples,
  round(avg(jsonb_array_length(coalesce(rl.metric_samples,'[]'::jsonb))), 0) as avg_n_samples
from public.run_logs rl
group by rl.source
order by runs desc;

-- ── Query 3: samples_per_km 히스토그램 (밀도 분포 — 임계값 민감도 확인용) ──────
with d as (
  select
    case when jsonb_array_length(coalesce(rl.metric_samples,'[]'::jsonb)) > 0 and rl.distance_km > 0
         then jsonb_array_length(rl.metric_samples)::numeric / rl.distance_km end as spk
  from public.run_logs rl
  where rl.distance_km >= 5
)
select
  case
    when spk is null      then '0 (no samples)'
    when spk <  5         then '01. <5 /km'
    when spk < 10         then '02. 5-10 /km'
    when spk < 20         then '03. 10-20 /km'
    when spk < 60         then '04. 20-60 /km'
    else                       '05. >=60 /km'
  end as samples_per_km_bucket,
  count(*) as runs
from d
group by 1
order by 1;
