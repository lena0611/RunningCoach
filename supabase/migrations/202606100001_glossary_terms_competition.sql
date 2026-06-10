-- PaceLAB 용어 사전: 레이싱(competition) 카테고리 추가 (#232 나와의 대결 UI).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.
-- 레이싱하기/나와의 대결/크루와 대결/고스트/내 베스트 — 사용자 노출 신규 용어(glossary-update-gate).

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('racing', '레이싱하기', array['racing','레이싱','대결'], 'competition',
    '같은 거리를 두고 과거의 나(고스트)나 다른 러너와 겨루는 모드.',
    '훈련과 직교하는 경쟁 경험입니다. 혼자 겨루는 “나와의 대결”과 여러 명이 각자의 장소에서 동시에 겨루는 “크루와 대결”(후속 공개)로 나뉩니다. 결과는 러닝 기록에 레이싱 주석으로 연결됩니다.',
    array['solo-race','crew-race','ghost'], 10, true),
  ('solo-race', '나와의 대결', array['solo race','혼자하기','나와의 대결'], 'competition',
    '과거의 내 기록(고스트)이나 내 베스트와 혼자 겨루는 레이싱.',
    '지금 내 실력을 가볍게 시험해 보고 싶을 때 씁니다. 타겟은 “없음”(고스트 없이 측정만)이거나 “내 베스트”입니다. 같은 거리를 그때의 나처럼 달리는 고스트와 실시간 격차를 음성으로 안내받습니다.',
    array['racing','ghost','my-best'], 20, true),
  ('crew-race', '크루와 대결', array['crew race','여러명이서','크루와 대결'], 'competition',
    '여러 명이 각자의 장소에서 동시에 같은 거리를 겨루는 레이싱(후속 공개).',
    '떨어져 있어도 함께 달리는 경험을 목표로 한 모드입니다. 아직 준비 중이며 공개 전까지는 “나와의 대결”만 사용할 수 있습니다.',
    array['racing','solo-race'], 30, true),
  ('ghost', '고스트', array['ghost','고스트','가상 경쟁자'], 'competition',
    '과거 기록의 페이스 곡선을 재생한 가상 경쟁 상대.',
    '선택한 과거 레이싱이나 내 베스트의 거리별 도달 시간을 그대로 따라 달립니다. 레이싱 중에는 고스트와의 실시간 거리 격차와 추월·역전을 음성으로 안내합니다.',
    array['solo-race','my-best','racing'], 40, true),
  ('my-best', '내 베스트', array['my best','내 베스트','베스트 도전'], 'competition',
    '해당 거리에서 가장 빨랐던 내 기록을 타겟으로 삼는 도전.',
    '훈련·레이싱을 가리지 않고 그 거리의 전체 통합 최속 기록 1개를 고스트로 만들어 겨룹니다. “내 한계에 다시 도전”하는 타겟입니다.',
    array['ghost','solo-race','distance-pb'], 50, true)
on conflict (slug) do update
  set term = excluded.term,
      aka = excluded.aka,
      category = excluded.category,
      short_def = excluded.short_def,
      detail = excluded.detail,
      related_slugs = excluded.related_slugs,
      order_index = excluded.order_index,
      approved = excluded.approved,
      updated_at = now();
