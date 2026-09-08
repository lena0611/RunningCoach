-- consume_edge_function_rate_limit 을 클라이언트 역할에서 회수한다 (Supabase security advisor WARN 0028/0029).
--
-- 원 마이그레이션(202606020001)은 `revoke all ... from public` 을 이미 하고 있었다. 그런데 그걸로는
-- 못 막는다 — Supabase 는 `alter default privileges in schema public grant execute on functions
-- to anon, authenticated, service_role` 를 걸어두기 때문에, 함수가 만들어지는 순간 두 역할에
-- **명시적 grant** 가 붙는다. PUBLIC 에서 회수해도 그 명시 grant 는 그대로 남는다.
--
-- 그래서 실제로는 웹 번들에 들어 있는 anon 키만으로 아래가 가능했다:
--   POST /rest/v1/rpc/consume_edge_function_rate_limit
--     { p_user_id: <피해자 uuid>, p_function_name: 'coach-run', p_window_start: <현재 창>, p_limit: 1 }
-- 이걸 반복하면 **그 사용자의 AI 코칭이 남은 시간 동안 차단된다**(카운터를 대신 태워버림).
-- 자기 자신의 제한을 우회하지는 못한다 — window_start 는 coach-run 이 서버에서 직접 계산한다.
--
-- 정당한 호출자는 Edge Function(coach-run · _shared/appSession)뿐이고 둘 다 service_role 로 붙는다.
-- service_role 은 아래 회수 대상이 아니므로 동작 변화는 없다.
revoke execute on function public.consume_edge_function_rate_limit(uuid, text, timestamptz, integer)
  from anon, authenticated;

comment on function public.consume_edge_function_rate_limit(uuid, text, timestamptz, integer) is
  '호출 제한 카운터 증가(security definer). service_role 전용 — anon/authenticated 에 execute 를 다시 부여하지 마라. 부여하면 임의 사용자의 코칭 호출 제한을 남이 태울 수 있다.';

-- 아래 두 테이블은 정책 없이 RLS 만 켜둔 상태가 **정답**이다(= 클라이언트 전면 차단, service_role 만 접근).
-- 의도를 스키마에 남겨, 나중에 "정책이 없네" 하며 읽기 정책을 붙이는 사고를 막는다.
comment on table public.app_sessions is
  '앱 세션 토큰 해시. service_role(Edge Function) 전용이라 RLS 정책을 의도적으로 두지 않는다(전면 차단). 클라이언트에서 조회하면 에러 없이 빈 결과가 온다.';

comment on table public.edge_function_rate_limits is
  'Edge Function 호출 제한 카운터. service_role 전용이라 RLS 정책을 의도적으로 두지 않는다(전면 차단).';
