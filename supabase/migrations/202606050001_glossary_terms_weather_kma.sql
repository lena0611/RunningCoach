-- PaceLAB 용어 사전: 날씨 출처를 기상청 단기예보로 교체하고 복장 추천 개념을 추가한다 (#219).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('weather', '날씨 (기상청 단기예보)', array['weather','기상청','단기예보','날씨'], 'data',
    '기상청 단기예보로 받는 국내 날씨 요약.',
    '현위치나 마지막 러닝 위치 기준으로 체감온도·강수확률·강수량·복장을 러닝 준비에 씁니다. 오늘부터 약 3일까지 제공하며, 더위·강추위·비·강풍은 페이스보다 안전·강도 조절 근거로 씁니다.',
    array['rpe','outfit'], 40, true),
  ('outfit', '복장 추천', array['outfit','복장','옷차림'], 'data',
    '러닝 체감온도 기준 옷차림 가이드.',
    '러닝 중엔 정지 상태보다 덥게 느껴져 체감온도 기준으로 한 단계 가볍게 입도록 5℃ 단위로 상·하의와 액세서리를 제안합니다. 비·강풍이면 방수·바람막이를 더합니다.',
    array['weather','rpe'], 45, true)
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
