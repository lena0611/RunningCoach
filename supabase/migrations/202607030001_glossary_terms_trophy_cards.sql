-- PaceLAB 용어 사전: 전리품 카드 추가 + 거리별 PB 정의 갱신 (리디자인 ② 업적 홈·트로피 카드).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.
-- 거리별 PB 는 5km 버킷에 더해 하프·풀 캐노니컬 거리도 산출하도록 확장되어 정의를 함께 갱신한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('distance-pb', '거리별 PB', array['distance pb','거리별 개인최고','5K PB','10K PB','하프 PB','풀 PB'], 'achievement',
    '출발선부터 5K·10K·하프·풀 같은 기준 거리에 가장 빨리 도달한 기록.',
    '전체 기록에서 자동 산출하며, 훈련과 레이싱(자기와의 대결)을 분리해 각각 관리합니다. 세션 기록의 페이스 흐름을 적분해 거리별 도달 시간을 추정하고, 5km 단위 버킷에 더해 하프(21.0975km)·풀(42.195km)도 산출합니다.',
    array['pb','run-streak','trophy-card'], 20, true),
  ('trophy-card', '전리품 카드', array['트로피 카드','trophy card','컬렉션','홀로그래픽 카드'], 'achievement',
    '업적을 수집형 홀로그래픽 카드로 발급한 트로피.',
    '거리별 PB와 첫 5K·10K·하프·풀 완주는 골드, 스트릭·주/월 최다 거리는 실버, 누적 거리 클럽(100/500/1000km)은 브론즈 카드로 발급됩니다. 기록을 갱신하면 해당 카드에 NEW 배지가 다시 켜지고, 미획득 카드는 잠금 상태로 진행률을 보여줍니다. 업적 화면(계정 메뉴)에서 컬렉션으로 모아볼 수 있습니다.',
    array['distance-pb','run-streak'], 40, true)
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
