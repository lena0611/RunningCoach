-- PaceLAB 용어 사전: 완전 초보 걷기·뛰기(Couch to 5K) 추가 (#870 — 5K 완주 전 러너의 저강도 브리핑이 걷기·뛰기가 됨).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('walk-run', '걷기·뛰기 (Couch to 5K)', array['walk-run','런워크','couch to 5k','c25k','카우치 투 5K'], 'session_type',
    '걷기와 뛰기를 섞어 9주에 걸쳐 쉬지 않고 30분 뛰는 몸을 만드는 초보 프로그램.',
    E'왜: 처음 뛰는 사람은 볼륨이 작은 러너가 아니라 아직 연속으로 뛸 몸이 없는 사람이에요. 걷기를 섞으면 숨과 다리에 무리 없이 뛰는 시간을 늘릴 수 있어요.\n본질·유래: 영국 NHS 의 Couch to 5K. 주 3회·9주 — 1주차 뛰기 1분·걷기 1분30초에서 시작해 5주차에 처음 20분 연속, 9주차에 연속 30분.\n실행: 매번 걷기 5분으로 시작해 걷기 5분으로 끝내요. 뛰는 구간도 대화가 될 만큼 천천히, 숨차면 걷기를 늘려도 괜찮아요. 버거우면 같은 회차를 반복해도 돼요 — 걷기를 섞는 건 실패가 아니라 이 프로그램의 방식이에요. 5K 를 완주하거나 9주를 마치면 일반 이지 러닝으로 넘어가요.',
    array['easy','recovery'], 25, true)
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
