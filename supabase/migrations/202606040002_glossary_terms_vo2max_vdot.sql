-- PaceLAB 용어 사전 추가 시드: VO2max, VDOT (#165 VO2max→VDOT 페이스 추정 활용).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.
-- 심폐 체력(VO2max)과 VDOT는 사용자에게 새로 노출되는 개념이므로 용어 안내에 추가한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('vo2max', 'VO2max (심폐 체력)', array['vo2max','vo2 max','심폐 체력','심폐지구력'], 'data',
    '체중 1kg당 1분 동안 쓸 수 있는 최대 산소량(mL/kg·min).',
    'Apple Watch가 야외 러닝에서 자동 추정해 건강 앱에 저장합니다. PaceLAB은 있으면 VDOT 페이스 추정의 보조 신호로만 쓰고, 심박 상한은 만들지 않습니다. 없으면 사용하지 않습니다.',
    array['vdot','healthkit','pb'], 80, true),
  ('vdot', 'VDOT (페이스 추정)', array['vdot','daniels','다니엘스'], 'data',
    '경기력 또는 VO2max로 환산한 체력 지표. 강도별 목표 페이스를 만든다.',
    'PB/레이스가 있으면 그 기록에서, 없으면 VO2max에서 추정합니다(추정은 신뢰도가 낮음). 템포·이지 페이스와 레이스 예상에 쓰되, 실제 강도 기준은 심박 상한이고 페이스는 보조입니다.',
    array['vo2max','pb','riegel'], 90, true)
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
