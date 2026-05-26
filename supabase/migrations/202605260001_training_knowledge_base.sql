create extension if not exists vector;

create table if not exists public.training_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null default '',
  source_type text not null default 'web',
  url text,
  reliability text not null default 'secondary',
  license_note text not null default '',
  summary text not null default '',
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_methods (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.training_knowledge_sources(id) on delete set null,
  name text not null,
  slug text not null unique,
  family text not null default 'general',
  summary text not null default '',
  target_distances text[] not null default '{}',
  suitable_levels text[] not null default '{}',
  weekly_days_min integer,
  weekly_days_max integer,
  caution_notes text not null default '',
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_prescription_rules (
  id uuid primary key default gen_random_uuid(),
  method_id uuid references public.training_methods(id) on delete cascade,
  source_id uuid references public.training_knowledge_sources(id) on delete set null,
  goal_distance text not null default 'all',
  phase text not null default 'any',
  session_type text not null default 'Any',
  rule_type text not null default 'guideline',
  metric text not null default '',
  prescription text not null default '',
  raise_condition text not null default '',
  lower_condition text not null default '',
  contraindications text[] not null default '{}',
  evidence_summary text not null default '',
  priority integer not null default 100,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.training_knowledge_sources(id) on delete cascade,
  method_id uuid references public.training_methods(id) on delete cascade,
  chunk_title text not null,
  chunk_summary text not null default '',
  chunk_text_short text not null default '',
  tags text[] not null default '{}',
  distance_scope text[] not null default '{}',
  phase_scope text[] not null default '{}',
  embedding vector(1536),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_knowledge_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  source_url text,
  input_text text not null default '',
  status text not null default 'requested',
  extracted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_methods_slug_idx on public.training_methods(slug);
create index if not exists training_methods_distance_idx on public.training_methods using gin(target_distances);
create index if not exists training_prescription_rules_lookup_idx on public.training_prescription_rules(goal_distance, session_type, priority);
create index if not exists training_knowledge_chunks_scope_idx on public.training_knowledge_chunks using gin(distance_scope);
create index if not exists training_knowledge_requests_user_created_idx on public.training_knowledge_requests(user_id, created_at desc);
create index if not exists training_knowledge_chunks_embedding_idx
  on public.training_knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

alter table public.training_knowledge_sources enable row level security;
alter table public.training_methods enable row level security;
alter table public.training_prescription_rules enable row level security;
alter table public.training_knowledge_chunks enable row level security;
alter table public.training_knowledge_requests enable row level security;

create policy "training_knowledge_sources_select_approved"
  on public.training_knowledge_sources for select
  to authenticated
  using (approved = true);

create policy "training_methods_select_approved"
  on public.training_methods for select
  to authenticated
  using (approved = true);

create policy "training_prescription_rules_select_approved"
  on public.training_prescription_rules for select
  to authenticated
  using (approved = true);

create policy "training_knowledge_chunks_select_approved"
  on public.training_knowledge_chunks for select
  to authenticated
  using (approved = true);

create policy "training_knowledge_requests_select_own"
  on public.training_knowledge_requests for select
  using (user_id = auth.uid());

create policy "training_knowledge_requests_insert_own"
  on public.training_knowledge_requests for insert
  with check (user_id = auth.uid());

with maf_source as (
  insert into public.training_knowledge_sources (
    title,
    author,
    source_type,
    url,
    reliability,
    license_note,
    summary,
    approved
  )
  values (
    'The MAF 180 Formula: Heart-rate monitoring for real aerobic training',
    'Phil Maffetone',
    'web',
    'https://philmaffetone.com/180-formula/',
    'method_author_primary',
    '원문/표/훈련계획 전문 저장 금지. PaceLAB에는 요약과 처방 규칙만 저장한다.',
    'MAF는 180-나이 기반의 보수적 유산소 심박 상한을 사용해 Easy 강도가 과열되지 않게 돕는 방식이다. 개인차가 크므로 절대 규칙이 아니라 Easy/Recovery 보조 기준으로 사용한다.',
    true
  )
  on conflict do nothing
  returning id
),
maf_method as (
  insert into public.training_methods (
    source_id,
    name,
    slug,
    family,
    summary,
    target_distances,
    suitable_levels,
    weekly_days_min,
    weekly_days_max,
    caution_notes,
    approved
  )
  values (
    (select id from maf_source union select id from public.training_knowledge_sources where url = 'https://philmaffetone.com/180-formula/' limit 1),
    'MAF Training',
    'maf-training',
    'aerobic_base',
    '나이 기반 MAF 심박 상한을 참고해 유산소 기반을 쌓고 Easy 강도를 낮추는 훈련 접근이다. PaceLAB에서는 더위/회복기/Easy 판정의 보수적 기준으로 쓴다.',
    array['all', '5K', '10K', 'Half', 'Marathon'],
    array['beginner', 'recreational', 'returning'],
    3,
    6,
    '최대심박, 역치, 러닝경력 차이를 충분히 반영하지 못할 수 있다. Tempo/Race 처방을 MAF 하나로 대체하지 않는다.',
    true
  )
  on conflict (slug) do update
    set summary = excluded.summary,
        target_distances = excluded.target_distances,
        suitable_levels = excluded.suitable_levels,
        caution_notes = excluded.caution_notes,
        approved = true,
        updated_at = now()
  returning id, source_id
)
insert into public.training_prescription_rules (
  method_id,
  source_id,
  goal_distance,
  phase,
  session_type,
  rule_type,
  metric,
  prescription,
  raise_condition,
  lower_condition,
  contraindications,
  evidence_summary,
  priority,
  approved
)
values
  (
    (select id from maf_method),
    (select source_id from maf_method),
    'all',
    'base',
    'Easy',
    'heart_rate_cap',
    'heart_rate',
    'Easy는 페이스보다 심박 안정성을 우선한다. MAF 180-나이 기준은 보수적 유산소 상한 참고값으로 사용하고, 더위/피로/부상 신호가 있으면 더 낮게 본다.',
    '최근 2~3회 Easy에서 심박이 낮고 RPE/통증/다음날 피로가 안정적이면 페이스보다 지속 시간 또는 빈도를 소폭 늘린다.',
    'Easy 평균심박이 반복적으로 높거나 RPE/통증/피로가 동반되면 Easy 처방을 더 보수적으로 낮춘다.',
    array['medical_diagnosis', 'tempo_replacement', 'single_session_override'],
    'MAF 180 공식은 Easy 강도 과열 방지에는 유용하지만 개인별 역치 차이를 대체하지 않는다.',
    20,
    true
  ),
  (
    (select id from maf_method),
    (select source_id from maf_method),
    '10K',
    'base',
    'Recovery',
    'recovery_cap',
    'heart_rate',
    '10K 목표 훈련 중 회복주는 MAF 기준보다도 낮은 심박 안정과 낮은 RPE를 우선한다. 전날 Long Run/Tempo 후에는 거리보다 회복 반응을 본다.',
    'Recovery가 반복적으로 심박 낮게 유지되고 다음날 회복이 좋으면 다음 품질훈련을 예정대로 진행한다.',
    '회복주에서도 심박이 높거나 통증 메모가 반복되면 다음 Tempo/Strides를 보류하거나 Easy로 낮춘다.',
    array['pain_flare', 'heat_stress'],
    '회복 세션은 부하 추가가 아니라 다음 적응을 위한 회복 신호 확인 세션이다.',
    18,
    true
  )
on conflict do nothing;
