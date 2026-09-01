-- 교차훈련(러닝 대체 운동) 기록 (#739 1단계).
--
-- 장마·더위·부상 복귀로 러닝을 못 할 때 사용자는 실내 자전거 등으로 대체하는데, 앱엔 러닝 세션
-- 개념밖에 없어 **그 운동이 어디에도 남지 않았다**. 실제로는 운동을 했는데 앱은 "안 한 주"로 봤다.
--
-- ⚠️ **run_logs 에 넣지 않는다.** run_logs 는 정의상 러닝 전용이고(네이티브 임포터가
-- predicateForWorkouts(with: .running) 로 하드 필터), 여기에 자전거가 섞이면 inferRunType·VDOT·
-- 주간 볼륨·returnAnchor 가 전부 오염된다. 2026-08-18 앵커 오염 사고의 거울상 위험이다.
--
-- ⚠️ **거리·페이스를 담지 않는다.** 검증된 "자전거 X분 = 러닝 Y km" 환산 공식은 존재하지 않는다
-- (sRPE·TRIMP 모두 종목 간 non-interchangeable, MET Compendium 은 저자들이 개인 산출용이 아니라고
-- 명시). 그래서 이 테이블은 **사실만** 담는다 — 무엇을, 얼마나 오래, 심박·칼로리는 어땠나.
-- 근거: #739 (Wilber 1996 PMID 8871917 · Bushman 1997 PMID 9140909 · Tanaka 1994 PMID 7871294)
create table if not exists public.cross_training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- HealthKit workout uuid. 같은 워크아웃 재유입을 막는 dedupe 키(수동 입력이면 null).
  external_id text,
  -- 종목. 러닝 특이성 위계가 다르므로(아쿠아조깅 > 일립티컬 > 자전거 > 수영) 나중에 코칭이 가른다.
  modality text not null check (modality in ('cycling', 'swimming', 'elliptical', 'aqua_jog', 'rowing', 'other')),
  -- 실내 여부(HKMetadataKeyIndoorWorkout). 실내는 GPS 거리가 없다.
  indoor boolean,
  date date not null,
  start_at timestamptz,
  end_at timestamptz,
  -- 유일한 필수 부하 입력. 종목 간 비교 가능한 건 시간뿐이다.
  duration_sec integer,
  avg_heart_rate integer,
  max_heart_rate integer,
  active_energy_kcal integer,
  -- 세션 RPE(0~10). 있으면 sRPE(분×RPE)로 종목 불문 내부부하를 쌓을 수 있다(환산 아님).
  rpe integer check (rpe is null or (rpe >= 0 and rpe <= 10)),
  source text not null default 'healthkit',
  source_name text,
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 HealthKit 워크아웃이 두 번 들어오지 않게. external_id 가 null 인 수동 입력은 제약 밖이다.
create unique index if not exists cross_training_sessions_external_uniq
  on public.cross_training_sessions (user_id, external_id)
  where external_id is not null;

create index if not exists cross_training_sessions_user_date_idx
  on public.cross_training_sessions (user_id, date desc);

alter table public.cross_training_sessions enable row level security;

create policy "cross_training_select_own" on public.cross_training_sessions
  for select using (user_id = auth.uid());
create policy "cross_training_insert_own" on public.cross_training_sessions
  for insert with check (user_id = auth.uid());
create policy "cross_training_update_own" on public.cross_training_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cross_training_delete_own" on public.cross_training_sessions
  for delete using (user_id = auth.uid());

comment on table public.cross_training_sessions is
  '러닝 대체 운동 기록(#739). run_logs 와 분리 — 러닝 볼륨·VDOT·처방 앵커 입력에 절대 섞지 않는다. 거리·페이스를 담지 않는 것은 검증된 종목 간 환산 공식이 없기 때문이다.';
