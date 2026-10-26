-- PaceLAB 용어 사전: 사용자 문구에서 '처방'을 '훈련'·'지침'으로 바꾼다(2026-10-26 사용자 지적 — "다른 처방"처럼 어색함).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('tempo-grade', '템포 등급 (A·B·C·D)', array['tempo grade','템포 평가','A B C D']::text[], 'heart_rate',
    '템포를 성공/실패 이진이 아니라 자극 확보 × 지침 준수로 나눈 등급.',
    'A는 지침 완전 준수, B는 템포 자극은 확보했고 상한을 일부 초과, C는 상한을 크게/반복 초과, D는 세션 목적(템포 자극) 자체를 못 이룬 경우입니다. 상한을 몇 bpm 넘겼다고 곧바로 "실패"로 보지 않고, 자극·후반 유지·회복을 함께 봅니다.',
    array['tempo-ceiling','tempo-ceiling-adaptation']::text[], 56, true),
  ('interval', '인터벌 (Interval)', array['interval','인터벌']::text[], 'session_type',
    '고강도 구간과 회복 구간을 번갈아 반복하는 세션.',
    E'왜: 심폐(VO2max)와 속도를 강하게 자극하는 품질 훈련입니다.\n본질·유래: 트랙의 반복훈련 전통(Iglói, 다니엘스의 I/R 페이스). 80–20에서 "20"에 해당하는 고강도 축.\n실행: 고강도 구간과 회복 구간을 번갈아 반복. 회복·부상 게이트가 막히지 않을 때만 넣고, 폼이 무너지면 중단합니다.',
    array['race-tt','strides']::text[], 70, true),
  ('trend-lens', '추세 Lens', array['trend lens','lens','렌즈']::text[], 'trend',
    '누적 기록을 특정 질문 기준으로 다시 해석하는 분석 관점.',
    '“추세” 화면에서 목표 진전·유산소 효율·강도 분포·세션 품질·회복 비용 같은 Lens로 발전/퇴보와 다음 훈련에 주는 영향을 봅니다.',
    array['goal-progress','aerobic-efficiency']::text[], 10, true),
  ('session-quality', '세션 품질', array['session quality','세션 품질']::text[], 'trend',
    '세션이 의도한 훈련대로 수행됐는지 보는 Lens.',
    '예: 템포가 상한 안에서 안정적으로 유지됐는지, Easy가 충분히 쉬웠는지.',
    array['trend-lens','tempo']::text[], 50, true),
  ('solo-race', '한계 시험 / 고스트 대전', array['solo race','한계 시험','고스트 대전','TT','타임트라이얼']::text[], 'competition',
    '상대 없이 전력 측정(TT)하거나, 과거의 나(고스트)와 겨뤄 한계를 갱신.',
    '타겟이 “없음”이면 순수 한계 시험(TT, 측정만), “내 베스트(고스트)”면 게임화된 측정입니다 — 둘 다 결과가 VDOT·등급으로 이어집니다. 스케줄은 단계 블록 끝에 한계 시험을 재측정 관문으로 넣습니다.',
    array['racing','ghost','my-best']::text[], 20, true)
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
