-- PaceLAB 용어 사전: '심박존' 설명에서 고정 bpm(100~130/131~145/…/156~165)을 걷어낸다(#878 B2).
-- 그 숫자는 개발자 한 사람의 심박 모델이었다. 앱은 역치심박(LTHR) 비율로 존을 계산한다(src/shared/lib/heartRateZones.ts ZONE_TOP_FRACTION_OF_LTHR).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('hr-zones', '심박존 (Z0~Z5)', array['heart rate zone','zone','존','z2','z4']::text[], 'heart_rate',
    '심박을 강도별로 나눈 구간.',
    '고정 숫자가 아니라 내 역치심박(LTHR)을 기준으로 사람마다 다르게 계산합니다. Z0은 역치의 60% 이하(훈련 전 단계), Z1 회복 61~79%, Z2 이지 80~88%, Z3 89~94%, Z4 템포 95~100%, Z5 고강도는 역치보다 높은 구간입니다. 역치를 직접 넣지 않으면 나이와 실제 최고 심박으로 추정하고, 그것도 없으면 심박 대신 페이스·체감강도로 봅니다.',
    array['lthr','tempo-ceiling']::text[], 10, true)
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
