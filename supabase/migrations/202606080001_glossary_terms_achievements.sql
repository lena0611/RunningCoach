-- PaceLAB 용어 사전: 업적·기록 카테고리 추가 (#257 업적 표시 UI).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.
-- 기존 'pb'를 데이터→업적 카테고리로 재분류하고, 거리별 PB·연속 러닝(스트릭)을 추가한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('pb', 'PB (개인 최고기록)', array['pb','personal best','개인 기록'], 'achievement',
    '거리별 개인 최고기록.',
    '목표 가능성과 러너 레벨 판정, 당일 평가 문구에 반영됩니다.',
    array['distance-pb','riegel','race-tt'], 10, true),
  ('distance-pb', '거리별 PB', array['distance pb','거리별 개인최고','5K PB','10K PB'], 'achievement',
    '출발선부터 5km 단위 거리에 가장 빨리 도달한 기록.',
    '전체 기록에서 자동 산출하며, 훈련과 레이싱(자기와의 대결)을 분리해 각각 관리합니다. 세션 기록의 페이스 흐름을 적분해 5K·10K처럼 거리별 도달 시간을 추정합니다.',
    array['pb','run-streak'], 20, true),
  ('run-streak', '연속 러닝 (스트릭)', array['streak','스트릭','최장 연속'], 'achievement',
    '끊김 없이 이어진 러닝 일수.',
    '하루라도 빠지면 끊기며, 전체 기록에서 가장 길었던 연속 일수를 업적으로 보여줍니다. 주·월 최다 누적 거리와 함께 꾸준함 지표로 쓰입니다.',
    array['distance-pb'], 30, true)
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
