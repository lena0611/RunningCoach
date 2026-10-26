-- #878 A1: 개발자(오너) 개인 처방이 '승인된 훈련 지식'으로 모든 사용자에게 실리던 것 정리.
--
-- coach-run 은 approved=true 인 지식을 프롬프트의 "처방 판단 1차 근거"로 싣는다. 그런데 그중 일부가
-- 한 사람의 기기 세팅이었다 — "현재 사용자가 Workoutdoors 에 세팅한 Easy 145bpm·Tempo 165bpm",
-- "10km 60분 목표", "20초 가속/1분40초 회복 ×8", "햄스트링/발바닥 신호". 걷기·뛰기 2주차 초보에게도
-- 145/165bpm 가 근거로 실렸다(2026-08-04 145/165 환각 사고와 같은 뿌리). 개인 상한은 이제 심박 모델이 정한다.

-- ① 오너 개인 처방(방법·규칙·출처)은 승인 해제 — 지우지 않는다(기록 보존, 프롬프트·기억 탭에서만 빠진다).
update public.training_prescription_rules
set approved = false, updated_at = now()
where method_id in (select id from public.training_methods where slug = 'pacelab-current-10k-prescriptions');

update public.training_methods
set approved = false, updated_at = now()
where slug = 'pacelab-current-10k-prescriptions';

update public.training_knowledge_sources
set approved = false, updated_at = now()
where title = 'PaceLAB current user session prescriptions';

-- ② 공용 템플릿 라이브러리에서 고정 bpm·고정 반복수·특정 부위를 걷어낸다.
--    template_slug 는 코드(initialWeeklyPattern.ts)와 같은 식별자라 바꾸지 않는다 — 숫자는 옛 흔적일 뿐.
--    스트라이드 구조는 코칭 SSOT §Easy + Strides(본런 끝 15~20초·60~90초 걷기 회복·반복수는 단계별 산출)를 따른다.
with library as (
  select id from public.training_methods where slug = 'pacelab-prescription-library'
)
update public.training_prescription_rules as rule
set prescription = patch.prescription,
    raise_condition = patch.raise_condition,
    lower_condition = patch.lower_condition,
    protocol = patch.protocol::jsonb,
    evidence_summary = 'PaceLAB 기본 처방 템플릿 라이브러리(#327). 심박 수치는 사용자별 심박 모델의 상한을 쓴다(#878).',
    updated_at = now()
from (
  values
    (
      'easy-base',
      'Easy 기반주: 유산소 기반 유지와 회복 가능한 볼륨 확보. 대화 가능한 강도, 개인 Easy 심박 상한 이하 우선, 페이스는 컨디션/날씨에 맡긴다.',
      '개인 Easy 상한 이하로 2~3회 안정되고 다음날 피로가 낮으면 거리나 시간을 소폭 늘린다.',
      '통증이 뛰면서 커지거나 더위로 심박이 쉽게 튈 때는 거리보다 시간으로 축소한다.',
      '{"segments":[{"kind":"main","detail":"대화 가능한 강도","intensity":"Easy / 대화 가능"},{"kind":"note","detail":"개인 Easy 심박 상한 이하 우선"},{"kind":"note","detail":"페이스는 컨디션과 날씨에 맡김"}]}'
    ),
    (
      'recovery-reset',
      'Recovery 회복주: 롱런/템포 다음날 혈류 회복과 피로 확인. 개인 회복 심박 상한 이하, RPE 1~2, 거리 욕심 없이 착지감을 확인한다.',
      '회복주 심박이 반복적으로 낮고 통증이 없으면 다음 핵심 세션을 정상 진행한다.',
      '통증이 달리며 커지거나 회복주가 Easy 강도로 올라가면 강도를 더 낮춘다.',
      '{"segments":[{"kind":"main","detail":"개인 회복 심박 상한 이하","intensity":"Recovery / 아주 편하게"},{"kind":"note","detail":"RPE 1~2"},{"kind":"note","detail":"거리 욕심 없이 착지감 확인"}]}'
    ),
    (
      'easy-strides-8x',
      'Easy + Strides: 낮은 심박 기반에 짧은 신경근 자극 추가. Easy 본런 끝에 15~20초 가속(최고 속도의 85~95%, 전력 질주 아님) + 60~90초 걷기 회복. 반복수는 훈련 단계·부상·적응에 따라 정한다.',
      '가속이 선명하고 회복 구간에서 호흡이 내려오면 횟수보다 질을 유지하고 Tempo 품질로 연결한다.',
      '활성 부상 신호가 있거나 가속 뒤 회복 구간에서 호흡이 내려오지 않으면 횟수/강도를 낮춘다.',
      '{"segments":[{"kind":"main","detail":"Easy 본런","intensity":"Easy / 대화 가능"},{"kind":"interval","detail":"15~20초 가속 + 60~90초 걷기 회복","onText":"15~20초 가속","offText":"60~90초 걷기"},{"kind":"note","detail":"반복수는 훈련 단계·부상·적응에 따라"}]}'
    ),
    (
      'tempo-ceiling-165',
      'Tempo 상한주: 역치 지속력 확보. 워밍업 후 Tempo, 개인 Tempo 심박 상한을 넘기지 않고 후반 페이스 급락 없이 마무리한다.',
      '2회 이상 개인 상한 이하로 안정되면 Tempo 지속 시간을 소폭 늘리거나 구간형 Tempo를 검토한다.',
      '최근 7일 강훈련이 많거나 Tempo 중반 전에 개인 상한을 넘기거나 통증 신호가 있으면 초반 진입을 낮춘다.',
      '{"segments":[{"kind":"warmup","detail":"워밍업 후 Tempo"},{"kind":"main","detail":"개인 Tempo 심박 상한 넘기지 않기","intensity":"Tempo / 개인 상한 이내"},{"kind":"note","detail":"후반 페이스 급락 없이 마무리"}]}'
    ),
    (
      '5k-check',
      '5km TT 체크: 목표 기록 예측과 훈련 단계 점검. 충분한 워밍업 후 5km 지속 가능한 최고 노력, 회복 주간 안에서 배치한다.',
      '예상 기록과 회복 반응을 보고 Tempo/Long Run 처방을 재조정한다.',
      '통증/피로 신호가 있거나 최근 강훈련이 누적됐으면 TT를 미룬다.',
      '{"segments":[{"kind":"warmup","detail":"충분한 워밍업"},{"kind":"main","detail":"5km 지속 가능한 최고 노력","intensity":"Race / 5km TT"},{"kind":"note","detail":"회복 주간 안에서 배치"}]}'
    ),
    (
      'cruise-interval',
      'Cruise Interval: 연속 Tempo 전 단계 또는 Tempo 품질 상향. 짧은 Tempo 반복, 반복 사이 짧은 회복, 개인 Tempo 심박 상한을 유지한다.',
      '반복별 심박 상한과 페이스 안정성이 확인되면 연속 Tempo 지속 시간으로 연결한다.',
      '초반부터 심박이 튀거나 회복이 충분하지 않으면 반복 수/강도를 낮춘다.',
      '{"segments":[{"kind":"interval","detail":"짧은 Tempo 반복","onText":"짧은 Tempo 반복","intensity":"Tempo"},{"kind":"interval","detail":"반복 사이 짧은 회복","offText":"짧은 회복"},{"kind":"note","detail":"개인 Tempo 심박 상한 유지"}]}'
    )
) as patch(template_slug, prescription, raise_condition, lower_condition, protocol)
where rule.template_slug = patch.template_slug
  and rule.method_id in (select id from library);
