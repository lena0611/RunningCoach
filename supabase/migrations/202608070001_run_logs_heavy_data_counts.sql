-- 런 목록에서 무거운 컬럼을 빼기 위한 준비(#661).
--
-- 문제: fetchRunLogs 가 select('*') 로 **모든 런의 경로 좌표까지** 받아온다. 실측 203개 런 = 4.7MB 를
-- 앱 열 때마다 내려받는데, 경로는 세션 상세 화면 하나에서만 쓴다(런당 23KB 중 route_points 18KB).
--
-- 목록에서 무거운 배열 자체는 필요 없고 **있는지 없는지(개수)만** 필요하다:
--   - runMetaChips: "경로 있음"·"스플릿 있음"·"차트 데이터 있음" 배지
-- 그래서 개수만 생성 컬럼으로 둔다. 생성 컬럼이라 기존 행은 자동 백필되고, 이후 쓰기에서도 자동으로 맞는다
-- (앱이 따로 관리하지 않으므로 값이 어긋날 수 없다).
--
-- jsonb_typeof 가드: 컬럼 기본값이 '[]' 라 항상 배열이지만, 배열이 아닌 값이 한 행이라도 있으면
-- jsonb_array_length 가 에러를 던져 마이그레이션 자체가 실패한다. 방어적으로 0 으로 떨어뜨린다.

alter table public.run_logs
  add column if not exists lap_count integer
    generated always as (case when jsonb_typeof(laps) = 'array' then jsonb_array_length(laps) else 0 end) stored,
  add column if not exists metric_sample_count integer
    generated always as (case when jsonb_typeof(metric_samples) = 'array' then jsonb_array_length(metric_samples) else 0 end) stored,
  add column if not exists route_point_count integer
    generated always as (case when jsonb_typeof(route_points) = 'array' then jsonb_array_length(route_points) else 0 end) stored;

-- 날씨의 "마지막 러닝 위치"는 경로가 있는 **가장 최근 런 1건**만 필요하다(목록 전체가 아니라).
-- 그 1건을 싸게 찾기 위한 부분 인덱스.
create index if not exists run_logs_user_with_route_idx
  on public.run_logs(user_id, date desc)
  where route_point_count > 0;
