with pacelab_source as (
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
    'PaceLAB current user session prescriptions',
    'PaceLAB / user-confirmed coaching baseline',
    'internal_user_prescription',
    null,
    'user_confirmed',
    '사용자와의 대화 및 개인 처방 기준을 구조화한 내부 기준이다. 영구 고정값이 아니라 누적 수행 데이터에 따라 AI가 조정할 수 있는 현재 처방 기준으로만 사용한다.',
    '현재 사용자가 Workoutdoors에 세팅해 수행하는 세션별 기준이다. Easy는 145bpm 상한, Tempo는 max 165bpm 상한, Easy + Strides는 10분 워밍업 + 20초 가속/1분40초 회복 x8 + 15분 쿨다운 구조를 초기 기준으로 둔다.',
    true
  )
  on conflict do nothing
  returning id
),
source_row as (
  select id from pacelab_source
  union
  select id from public.training_knowledge_sources
  where title = 'PaceLAB current user session prescriptions'
  limit 1
),
pacelab_method as (
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
    'PaceLAB Current 10K Prescriptions',
    'pacelab-current-10k-prescriptions',
    'personalized_10k',
    '10km 60분 목표를 향한 현재 사용자별 실행 처방 기준이다. AI 코칭은 이 기준을 먼저 평가하고, 반복 데이터와 회복 반응이 충분하면 사용자가 실행할 새 기준을 주도적으로 제안한다.',
    array['10K'],
    array['recreational', 'returning'],
    3,
    5,
    '현재 기준은 영구 고정값이 아니다. 단일 세션이 아니라 반복 수행 품질, 회복, 부상 신호, 목표일까지 남은 기간을 보고 조정한다.',
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
  select id, source_id from pacelab_method
  union
  select id, source_id from public.training_methods
  where slug = 'pacelab-current-10k-prescriptions'
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
  true
from method_row
cross join (
  values
    (
      '10K',
      'current',
      'Easy',
      'current_heart_rate_cap',
      'max_heart_rate',
      '현재 Easy 처방은 페이스보다 심박을 우선하고, max/lap 심박이 145bpm을 넘지 않게 달리는 것이다. 평균심박만 낮다고 통과로 보지 않는다.',
      '최근 2~3회 Easy에서 max/lap 심박 145 이하, 낮은 RPE, 다음날 회복 안정이 반복되면 거리나 지속 시간을 소폭 늘린다.',
      'Easy에서 max/lap 심박 145 초과가 반복되거나 다음날 피로/통증이 남으면 페이스를 낮추고 회복 목적을 강화한다.',
      array['pain_flare', 'heat_stress', 'single_avg_hr_only'],
      '사용자 확인 기준: Easy는 145bpm을 넘기지 말라는 현재 처방이다. 향후 반복 데이터로 조정 가능하다.',
      5
    ),
    (
      '10K',
      'current',
      'Tempo',
      'current_max_heart_rate_cap',
      'max_heart_rate',
      '현재 Tempo 처방의 핵심은 max 165bpm을 넘기지 않는 것이다. 페이스는 보조 지표이고, 랩별 심박이 165를 넘었는지 먼저 평가한다.',
      '최근 2~3회 Tempo에서 max 165 이하, 후반 유지, 다음날 회복 안정이 반복되면 지속 시간 또는 품질을 하나만 소폭 올린다.',
      'Tempo에서 165 초과가 반복되면 다음 템포는 초반 진입을 낮추거나 지속 시간을 줄인다.',
      array['active_injury', 'heat_stress', 'poor_recovery'],
      '사용자 확인 기준: Tempo는 다른 복잡한 처방보다 max 165bpm 상한을 우선한다.',
      4
    ),
    (
      '10K',
      'current',
      'Easy + Strides',
      'current_workout_structure',
      'schedule_pattern',
      '현재 Easy + Strides 처방은 워밍업 10분 + 20초 가속/1분40초 회복 x8 + 쿨다운 15분이다. GPS/HealthKit 데이터는 관용적으로 해석하고, 정확히 20초/100초를 기계적으로 요구하지 않는다.',
      '가속이 짧고 선명하며 회복 구간에서 심박/호흡이 내려오는 패턴이 반복되면 횟수, 가속 품질, 회복 밀도 중 하나만 소폭 조정한다.',
      '가속 후 회복이 내려오지 않거나 이지 구간 심박이 높으면 횟수 또는 가속 강도를 낮춘다.',
      array['active_injury', 'poor_recovery', 'heat_stress'],
      '사용자 제공 Workoutdoors 스케줄: 10분 워밍업, 20초 가속/1분40초 회복 x8, 15분 쿨다운.',
      3
    )
) as rule(goal_distance, phase, session_type, rule_type, metric, prescription, raise_condition, lower_condition, contraindications, evidence_summary, priority)
where not exists (
  select 1
  from public.training_prescription_rules existing
  where existing.method_id = method_row.id
    and existing.goal_distance = rule.goal_distance
    and existing.phase = rule.phase
    and existing.session_type = rule.session_type
    and existing.rule_type = rule.rule_type
);
