-- PaceLAB 용어 사전: Tempo 심박 상한 적응 (#301).
-- 정본(source of truth)은 이 시드이며, 웹 번들 fallback(src/entities/glossary/glossaryTerms.ts)이 같은 내용을 미러링한다.
-- 기존 'tempo-ceiling'의 설명을 "검증·적응" 반영으로 갱신하고, 상향 후보·신뢰도와 템포 등급(A/B/C/D)을 추가한다.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('tempo-ceiling', '템포·이지·회복 상한', array['ceiling','상한','tempo cap','easy cap'], 'heart_rate',
    '세션 유형별로 넘지 않도록 권하는 심박 상한.',
    '고정 숫자(예: 165)가 아니라 개인 역치심박에서 파생합니다. 나이·심박·기록이 모두 없으면 상한을 만들지 않고 미설정으로 두고 페이스·RPE로 평가합니다. 템포 상한은 고정값이 아니라 최근 수행으로 검증·적응합니다.',
    array['lthr','hr-zones','tempo-ceiling-adaptation','tempo-grade'], 50, true),
  ('tempo-ceiling-adaptation', '템포 상한 적응 (상향 후보·신뢰도)', array['상향 후보','상한 적응','tempo ceiling adaptation','신뢰도'], 'heart_rate',
    '템포 상한을 추정값에 고정하지 않고, 실제 수행으로 검증해 위로만 조정하는 방식.',
    '나이(Tanaka)·역치 추정은 안전한 시작값(신뢰도 낮음)입니다. 최근 템포에서 상한을 넘겨도 RPE가 낮고 후반이 안정적이며 다음날 회복이 좋은 패턴이 2회 모이면 "상향 후보"로 관찰하고, 3회 이상 확인되면 상한을 한 단계 올려 적용합니다(신뢰도 높음, 출처=최근 템포 분석). 추정보다 실제 수행을 우선하되, 상한을 내리지는 않고 부상 중에는 올리지 않습니다.',
    array['tempo-ceiling','tempo-grade','lthr'], 55, true),
  ('tempo-grade', '템포 등급 (A·B·C·D)', array['tempo grade','템포 평가','A B C D'], 'heart_rate',
    '템포를 성공/실패 이진이 아니라 자극 확보 × 처방 준수로 나눈 등급.',
    'A는 처방 완전 준수, B는 템포 자극은 확보했고 상한을 일부 초과, C는 상한을 크게/반복 초과, D는 세션 목적(템포 자극) 자체를 못 이룬 경우입니다. 상한을 몇 bpm 넘겼다고 곧바로 "실패"로 보지 않고, 자극·후반 유지·회복을 함께 봅니다.',
    array['tempo-ceiling','tempo-ceiling-adaptation'], 56, true)
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
