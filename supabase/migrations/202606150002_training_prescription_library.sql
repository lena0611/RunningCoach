-- #327 훈련법 라이브러리 완전 데이터화
-- 코드 defaultPrescriptionTemplates 8종을 DB에 시드하고, 워크아웃 프로토콜을 구조화(jsonb)한다.
-- template_slug로 코드 템플릿과 DB rule을 1:1 매핑한다(코드↔DB 동기화 기준).

alter table public.training_prescription_rules
  add column if not exists protocol jsonb not null default '{}'::jsonb;

alter table public.training_prescription_rules
  add column if not exists template_slug text;

create index if not exists training_prescription_rules_template_slug_idx
  on public.training_prescription_rules(template_slug);

with lib_source as (
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
    'PaceLAB prescription template library',
    'PaceLAB / coaching baseline',
    'internal_prescription_library',
    null,
    'user_confirmed',
    'PaceLAB 코드(defaultPrescriptionTemplates)와 동기화되는 기본 처방 템플릿 라이브러리다. 영구 고정값이 아니라 누적 수행 데이터와 회복/부상 신호에 따라 AI가 조정할 수 있는 기준이다.',
    'Easy/Recovery/Easy+Strides/Tempo/LSD/Steady Long/5km TT/Cruise Interval 8종의 구조화 처방 템플릿을 담는다. 각 rule은 template_slug로 코드 템플릿과 매핑되고 protocol(jsonb)에 워크아웃 구조를 저장한다.',
    true
  )
  on conflict do nothing
  returning id
),
source_row as (
  select id from lib_source
  union
  select id from public.training_knowledge_sources
  where title = 'PaceLAB prescription template library'
  limit 1
),
lib_method as (
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
    (select id from source_row),
    'PaceLAB Prescription Library',
    'pacelab-prescription-library',
    'prescription_library',
    'PaceLAB 기본 처방 템플릿 8종을 구조화한 라이브러리다. 코드 defaultPrescriptionTemplates와 1:1 동기화되며, 온보딩 초기 루틴과 적응형 처방의 후보 풀로 사용한다.',
    array['all'],
    array['beginner', 'recreational', 'returning', 'advanced'],
    2,
    6,
    '템플릿은 시작 기준이다. 단일 세션이 아니라 반복 수행 품질, 회복, 부상 신호, 목표일까지 남은 기간으로 조정한다.',
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
),
method_row as (
  select id, source_id from lib_method
  union
  select id, source_id from public.training_methods
  where slug = 'pacelab-prescription-library'
  limit 1
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
  protocol,
  template_slug,
  approved
)
select
  method_row.id,
  method_row.source_id,
  rule.goal_distance,
  rule.phase,
  rule.session_type,
  rule.rule_type,
  rule.metric,
  rule.prescription,
  rule.raise_condition,
  rule.lower_condition,
  rule.contraindications,
  rule.evidence_summary,
  rule.priority,
  rule.protocol::jsonb,
  rule.template_slug,
  true
from method_row
cross join (
  values
    (
      'all', 'any', 'Easy', 'library_template', 'workout_structure',
      'Easy 기반주: 유산소 기반 유지와 회복 가능한 볼륨 확보. 대화 가능한 강도, 심박 145bpm 이하 우선, 페이스는 컨디션/날씨에 맡긴다.',
      '심박 145 이하로 2~3회 안정되고 다음날 피로가 낮으면 거리나 시간을 소폭 증가한다.',
      '통증이 뛰면서 커지거나 더위로 심박이 쉽게 튈 때는 거리보다 시간으로 축소한다.',
      array['pain_flare', 'heat_stress'],
      'PaceLAB 기본 처방 템플릿 라이브러리(#327). 코드 defaultPrescriptionTemplates와 동기화.',
      30,
      '{"segments":[{"kind":"main","detail":"대화 가능한 강도","intensity":"Easy / 대화 가능"},{"kind":"note","detail":"심박 145bpm 이하 우선"},{"kind":"note","detail":"페이스는 컨디션과 날씨에 맡김"}]}',
      'easy-base'
    ),
    (
      'all', 'any', 'Recovery', 'library_template', 'workout_structure',
      'Recovery 회복주: 롱런/템포 다음날 혈류 회복과 피로 확인. 심박 130bpm 전후, RPE 1~2, 거리 욕심 없이 착지감을 확인한다.',
      '회복주 심박이 반복적으로 낮고 통증이 없으면 다음 핵심 세션을 정상 진행한다.',
      '통증이 달리며 커지거나 회복주가 Easy 강도로 올라가면 강도를 더 낮춘다.',
      array['pain_flare'],
      'PaceLAB 기본 처방 템플릿 라이브러리(#327). 코드 defaultPrescriptionTemplates와 동기화.',
      31,
      '{"segments":[{"kind":"main","detail":"심박 130bpm 전후","intensity":"Recovery / 심박 130 전후"},{"kind":"note","detail":"RPE 1~2"},{"kind":"note","detail":"거리 욕심 없이 착지감 확인"}]}',
      'recovery-reset'
    ),
    (
      'all', 'base', 'Easy + Strides', 'library_template', 'workout_structure',
      'Easy + Strides: 낮은 심박 기반에 짧은 신경근 자극 추가. 워밍업 10분 + 20초 가속/1분40초 회복 x8 + 쿨다운 15분.',
      '가속이 선명하고 회복 구간 심박이 안정되면 횟수보다 질을 유지하고 Tempo 품질로 연결한다.',
      '햄스트링/발바닥 신호가 active이거나 가속 회복 구간에서 호흡이 내려오지 않으면 횟수/강도를 낮춘다.',
      array['active_injury', 'poor_recovery', 'heat_stress'],
      'PaceLAB 기본 처방 템플릿 라이브러리(#327). 코드 defaultPrescriptionTemplates와 동기화.',
      32,
      '{"segments":[{"kind":"warmup","detail":"워밍업 10분","durationMin":10},{"kind":"interval","detail":"20초 가속 + 1분40초 회복 x 8","reps":8,"onText":"20초 가속","offText":"1분40초 회복"},{"kind":"cooldown","detail":"쿨다운 15분","durationMin":15}]}',
      'easy-strides-8x'
    ),
    (
      'all', 'build', 'Tempo', 'library_template', 'workout_structure',
      'Tempo 상한주: 역치 지속력 확보. 워밍업 후 Tempo, 최대 심박 165bpm을 넘기지 않고 후반 페이스 급락 없이 마무리한다.',
      '2회 이상 165 이하로 안정되면 Tempo 지속 시간을 소폭 늘리거나 구간형 Tempo를 검토한다.',
      '최근 7일 강훈련이 많거나 Tempo 중반 전에 165를 넘기거나 통증 신호가 있으면 초반 진입을 낮춘다.',
      array['active_injury', 'heat_stress', 'poor_recovery'],
      'PaceLAB 기본 처방 템플릿 라이브러리(#327). 코드 defaultPrescriptionTemplates와 동기화.',
      33,
      '{"segments":[{"kind":"warmup","detail":"워밍업 후 Tempo"},{"kind":"main","detail":"최대 심박 165bpm 넘기지 않기","intensity":"Tempo / max 165bpm 이내"},{"kind":"note","detail":"후반 페이스 급락 없이 마무리"}]}',
      'tempo-ceiling-165'
    ),
    (
      'all', 'base', 'LSD', 'library_template', 'workout_structure',
      'Easy LSD: 긴 시간 움직이는 기반과 지방대사/지속성 확보. 초반 억제, 대화 가능한 강도, 후반 심박 드리프트를 관찰한다.',
      '후반 급락 없이 마치고 다음날 회복주가 잘 눌리면 거리를 소폭 증가한다.',
      '전날/당일 통증 신호가 있거나 더위로 심박이 쉽게 오르면 거리를 줄인다.',
      array['pain_flare', 'heat_stress'],
      'PaceLAB 기본 처방 템플릿 라이브러리(#327). 코드 defaultPrescriptionTemplates와 동기화.',
      34,
      '{"segments":[{"kind":"main","detail":"초반 억제","intensity":"LSD / 초반 억제"},{"kind":"main","detail":"대화 가능한 강도","intensity":"대화 가능"},{"kind":"note","detail":"후반 심박 드리프트 관찰"}]}',
      'lsd-easy-long'
    ),
    (
      'all', 'build', 'Steady Long', 'library_template', 'workout_structure',
      'Steady Long: 롱런 안에서 목표 지속력과 후반 효율 확보. 초반 Easy, 후반 자연스러운 Steady, 무리한 레이스 페이스는 금지한다.',
      '후반 효율과 다음날 회복이 안정되면 Steady 구간을 아주 조금 확장한다.',
      '최근 Tempo가 흔들렸거나 회복/부상 게이트가 watch 이상이면 Steady 비중을 낮춘다.',
      array['poor_recovery', 'watch_gate'],
      'PaceLAB 기본 처방 템플릿 라이브러리(#327). 코드 defaultPrescriptionTemplates와 동기화.',
      35,
      '{"segments":[{"kind":"main","detail":"초반 Easy","intensity":"Easy"},{"kind":"main","detail":"후반 자연스러운 Steady","intensity":"Steady"},{"kind":"note","detail":"무리한 레이스 페이스 금지"}]}',
      'steady-long'
    ),
    (
      'all', 'threshold', 'Race', 'library_template', 'workout_structure',
      '5km TT 체크: 10km 예측과 훈련 단계 점검. 충분한 워밍업 후 5km 지속 가능한 최고 노력, 회복 주간 안에서 배치한다.',
      '예상 기록과 회복 반응을 보고 Tempo/Long Run 처방을 재조정한다.',
      '통증/피로 신호가 있거나 최근 강훈련이 누적됐으면 TT를 미룬다.',
      array['active_injury', 'poor_recovery'],
      'PaceLAB 기본 처방 템플릿 라이브러리(#327). 코드 defaultPrescriptionTemplates와 동기화.',
      36,
      '{"segments":[{"kind":"warmup","detail":"충분한 워밍업"},{"kind":"main","detail":"5km 지속 가능한 최고 노력","intensity":"Race / 5km TT"},{"kind":"note","detail":"회복 주간 안에서 배치"}]}',
      '5k-check'
    ),
    (
      'all', 'threshold', 'Tempo', 'library_template', 'workout_structure',
      'Cruise Interval: 연속 Tempo 전 단계 또는 Tempo 품질 상향. 짧은 Tempo 반복, 반복 사이 짧은 회복, 심박 상한 165를 유지한다.',
      '반복별 심박 상한과 페이스 안정성이 확인되면 연속 Tempo 지속 시간으로 연결한다.',
      '초반부터 심박이 튀거나 회복이 충분하지 않으면 반복 수/강도를 낮춘다.',
      array['poor_recovery', 'heat_stress'],
      'PaceLAB 기본 처방 템플릿 라이브러리(#327). 코드 defaultPrescriptionTemplates와 동기화.',
      37,
      '{"segments":[{"kind":"interval","detail":"짧은 Tempo 반복","onText":"짧은 Tempo 반복","intensity":"Tempo"},{"kind":"interval","detail":"반복 사이 짧은 회복","offText":"짧은 회복"},{"kind":"note","detail":"심박 상한 165 유지"}]}',
      'cruise-interval'
    )
) as rule(
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
  protocol,
  template_slug
)
where not exists (
  select 1
  from public.training_prescription_rules existing
  where existing.method_id = method_row.id
    and existing.template_slug = rule.template_slug
);
