-- PaceLAB 용어 사전: 대회 퍼센타일 표현을 "상위 N%"로 보정 (#531 후속).
-- 사용자가 "빠른 순서 N퍼센타일" 표현을 상위/하위 방향으로 헷갈려, 표시 문구를 "상위 N%"로 변경.
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('race-percentile', '대회 상위 %', array['percentile','퍼센타일','빠른 순서','상위 퍼센트','대회 현주소'], 'competition',
    '특정 대회 완주자 분포에서 내 예상 기록이 빠른 순서로 상위 몇 %에 드는지 보는 참고값.',
    '예를 들어 “상위 10%”는 완주자를 빠른 순서로 줄 세웠을 때 가장 빠른 10% 안에 든다는 뜻이고, “상위 76%”는 나보다 빠른 사람이 약 76%여서 느린 편(완주자의 약 24%만 나보다 느림)이라는 뜻입니다. 숫자가 작을수록 빠릅니다. 실제 참가 순위가 아니라 해당 연도·거리의 비식별 분포 컷에 내 목표 예상을 대입한 참고 벤치마크입니다.',
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
