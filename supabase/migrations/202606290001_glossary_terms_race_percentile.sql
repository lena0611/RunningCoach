-- PaceLAB 용어 사전: 대회 퍼센타일 (#531 대회 기준 현주소 표현 보정).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('race-percentile', '대회 퍼센타일', array['percentile','퍼센타일','빠른 순서','대회 현주소'], 'competition',
    '특정 대회 완주자 분포에서 내 예상 기록이 빠른 순서로 어느 지점인지 보는 참고값.',
    '예를 들어 “빠른 순서 76퍼센타일”은 상위권 24%라는 뜻이 아니라, 전체 완주자 중 빠른 순서로 약 76% 지점이라는 뜻입니다. 실제 참가 순위가 아니라 해당 연도·거리의 비식별 분포 컷에 내 목표 예상을 대입한 참고 벤치마크입니다.',
    array['racing','distance-pb'], 60, true)
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
