-- 테스트 계정을 "가입 직후" 상태로 되돌린다 — 신규 사용자 경험을 언제든 처음부터 다시 보기 위해.
--
-- 왜 필요한가: 신규 유저 테스트(2026-10-26)에서 온보딩 답이 플랜에 반영되지 않는 문제를 찾았는데,
-- 고친 뒤 다시 보려면 새 계정이 또 필요했다. 가입 확인 메일은 기본 메일 서버의 발송 제한에 걸려
-- 막혔다. 계정은 그대로 두고 **데이터만** 지우면, 다음 접속이 곧 신규 사용자의 첫 화면이 된다.
--
-- 안전장치: 아무 계정이나 지울 수 있으면 실계정이 한 번의 오조작으로 사라진다. 그래서
--   ① 지울 수 있는 계정을 이 표(test_reset_accounts)에 등록된 user_id 로 한정하고(서버 판정),
--   ② 함수는 호출한 본인(auth.uid())의 데이터만 지운다 — 남의 id 를 인자로 받지 않는다.
-- 표에는 클라이언트 정책을 두지 않는다(RLS 전면 차단). 등록·해제는 대시보드 SQL 로만 한다.

create table if not exists public.test_reset_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text not null default '',
  -- 기기 HealthKit 기록을 가져오지 않는다. 완전 초보 시나리오를 폰에서 보려면 필요하다 — 폰 주인의 실제 러닝이
  -- 들어오면 첫 접속에 바로 기록 26건짜리 계정이 된다(2026-10-26 실측).
  skip_healthkit_import boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.test_reset_accounts enable row level security;

comment on table public.test_reset_accounts is
  '데이터 초기화(reset_test_account)를 허용한 테스트 계정. RLS 정책을 의도적으로 두지 않는다(클라이언트 전면 차단) — 등록은 대시보드 SQL 로만.';

-- 화면이 초기화 버튼을 보여줄지 정하는 판정. 본인 것만 답한다.
create or replace function public.can_reset_test_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.test_reset_accounts where user_id = auth.uid());
$$;

-- HealthKit 자동 동기화를 건너뛸 계정인가. 본인 것만 답한다.
create or replace function public.test_account_skips_healthkit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select skip_healthkit_import from public.test_reset_accounts where user_id = auth.uid()), false);
$$;

-- 본인 데이터를 전부 지운다. 계정(auth.users)·로그인은 남는다.
-- 지우지 않는 것: app_sessions(기기 세션 토큰)·edge_function_rate_limits(호출 제한 — 초기화로 우회되면 안 된다).
-- 표 사이 참조는 전부 on delete cascade / set null 이라 순서와 무관하다.
create or replace function public.reset_test_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.test_reset_accounts where user_id = uid) then
    raise exception '초기화가 허용된 테스트 계정이 아닙니다.' using errcode = '42501';
  end if;

  delete from public.coach_memory_items where user_id = uid;
  delete from public.coach_data_gaps where user_id = uid;
  delete from public.coach_reports where user_id = uid;
  delete from public.pacelab_session_intents where user_id = uid;
  delete from public.training_schedule where user_id = uid;
  delete from public.training_phase_history where user_id = uid;
  delete from public.weekly_patterns where user_id = uid;
  delete from public.adaptive_training_metrics where user_id = uid;
  delete from public.injury_treatments where user_id = uid;
  delete from public.competition_results where user_id = uid;
  delete from public.cross_training_sessions where user_id = uid;
  delete from public.run_import_denylist where user_id = uid;
  delete from public.run_logs where user_id = uid;
  delete from public.pacelab_reward_ledger where user_id = uid;
  delete from public.pacelab_quest_log where user_id = uid;
  delete from public.pacelab_level_state where user_id = uid;
  delete from public.training_knowledge_requests where user_id = uid;
  delete from public.user_data_cards where user_id = uid;
  delete from public.user_summary_layout where user_id = uid;
  delete from public.training_memory where user_id = uid;
end;
$$;

-- Supabase 는 새 함수에 anon/authenticated execute 를 자동 부여한다(202609080001 참고).
-- 로그인 사용자만 부르게 anon 에서 회수한다. 판정은 함수 안에서 user_id 로 한다.
revoke execute on function public.can_reset_test_account() from public, anon;
revoke execute on function public.test_account_skips_healthkit() from public, anon;
revoke execute on function public.reset_test_account() from public, anon;
grant execute on function public.can_reset_test_account() to authenticated;
grant execute on function public.test_account_skips_healthkit() to authenticated;
grant execute on function public.reset_test_account() to authenticated;

-- 신규 유저 테스트용 완전 초보 계정(2026-10-26 사용자 지정). 그 계정이 없는 DB(로컬 등)에선 건너뛴다.
insert into public.test_reset_accounts (user_id, note, skip_healthkit_import)
select id, '완전 초보 신규 유저 테스트 계정', true from auth.users where id = 'ddaabf4c-c1cf-4157-9ffc-9b0c4f52451b'
on conflict (user_id) do nothing;
