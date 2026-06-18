-- PaceLAB 용어 사전: 레이싱 → '한계 도전' 리프레임 (#411).
-- 고스트 대전=게임화된 한계 시험(TT), 다자간 보류. 정본 시드 = 이 파일, 웹 번들 fallback(glossaryTerms.ts) 미러.
-- DB가 런타임 우선이라 TS 갱신만으론 부족 → 여기서 행을 upsert (glossary-update-gate).

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('racing', '한계 도전', array['한계 도전','레이싱','racing','한계 시험','타임트라이얼','TT'], 'competition',
    '과거의 나(고스트)와 겨루거나 한계 시험(TT)으로 현재 체력을 측정·갱신하는 모드.',
    '훈련 계획의 재측정 관문이자 등급 승급의 계기입니다. 상대가 “없음”이면 한계 시험(TT, 순수 전력 측정), 과거의 나(고스트)면 게임화된 측정 — 같은 거리를 그때의 나처럼 달리는 고스트와 실시간 격차를 음성으로 안내받습니다. 결과(기록)는 현재 체력(VDOT)·등급을 갱신합니다. (다자간 실시간 경쟁은 후속·보류)',
    array['solo-race','ghost'], 10, true),
  ('solo-race', '한계 시험 / 고스트 대전', array['solo race','한계 시험','고스트 대전','TT','타임트라이얼'], 'competition',
    '상대 없이 전력 측정(TT)하거나, 과거의 나(고스트)와 겨뤄 한계를 갱신.',
    '타겟이 “없음”이면 순수 한계 시험(TT, 측정만), “내 베스트(고스트)”면 게임화된 측정입니다 — 둘 다 결과가 VDOT·등급으로 이어집니다. 스케줄은 단계 블록 끝에 한계 시험을 재측정 관문으로 처방합니다.',
    array['racing','ghost','my-best'], 20, true),
  ('crew-race', '크루와 대결', array['crew race','여러명이서','크루와 대결','다자간'], 'competition',
    '여러 명이 각자의 장소에서 동시에 겨루는 모드 — 현재 보류(시장 차별성 낮음).',
    '떨어져 있어도 함께 달리는 경험을 목표로 한 모드이나, 시중 앱에 흔해 경쟁력이 낮다고 보아 현재 보류입니다. 지금은 한계 도전(고스트 대전·한계 시험)에 집중합니다.',
    array['racing','solo-race'], 30, true)
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
