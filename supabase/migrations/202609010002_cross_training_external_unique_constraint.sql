-- 교차훈련 dedupe 키를 **부분 인덱스에서 유니크 제약으로** 바꾼다(#739, 라이브에서 잡힘).
--
-- 앞선 마이그레이션은 `create unique index ... where external_id is not null` 로 만들었는데,
-- 이러면 삽입이 이렇게 실패한다:
--   there is no unique or exclusion constraint matching the ON CONFLICT specification
-- 부분 인덱스는 `on conflict (user_id, external_id)` 의 대상이 되지 못하기 때문이다
-- (supabase-js 는 컬럼 이름만 넘길 수 있어 WHERE 절을 붙일 수단이 없다).
--
-- 부분 조건은 애초에 불필요했다 — **Postgres 유니크 제약은 NULL 을 서로 다른 값으로 본다.**
-- 따라서 일반 유니크 제약으로도 수동 입력(external_id IS NULL) 여러 건이 문제없이 공존한다.
--
-- ⚠️ 단위 테스트는 저장소를 모킹하므로 이 계열 결함을 잡지 못한다. 실제 삽입을 태워봐야 나온다.
drop index if exists public.cross_training_sessions_external_uniq;

alter table public.cross_training_sessions
  drop constraint if exists cross_training_sessions_user_external_key;

alter table public.cross_training_sessions
  add constraint cross_training_sessions_user_external_key
  unique (user_id, external_id);
