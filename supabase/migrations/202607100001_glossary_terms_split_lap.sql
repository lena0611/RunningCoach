-- PaceLAB 용어 사전: 스플릿/랩 구분 추가 (세션 상세 구간 기록 랩|스플릿 탭 도입).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('split', '스플릿', array['split','1km 스플릿','km 스플릿'], 'basics',
    '1km마다 균등하게 자른 구간 기록.',
    '거리 기준으로 페이스 흐름을 비교하기 위한 계산 구간입니다. 랩이 사실상 1km 균등이면 스플릿만 보여주고, 인터벌처럼 랩이 다르게 쪼개져 있으면 세션 상세의 구간 기록에서 랩과 스플릿을 탭으로 구분해 볼 수 있습니다.',
    array['lap','pace'], 50, true),
  ('lap', '랩', array['lap','랩 구간','인터벌 구간'], 'basics',
    '워치나 앱이 실제로 끊은 구간 기록.',
    '인터벌 훈련의 반복 구간처럼 러너나 기기가 의도적으로 나눈 구간입니다. FIT 가져오기는 파일의 랩을 그대로 보존하며, 랩 길이가 제각각이면 세션 상세 구간 기록이 랩 탭을 기본으로 열리고 1km 스플릿과 전환해 볼 수 있습니다.',
    array['split','fit'], 60, true)
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
