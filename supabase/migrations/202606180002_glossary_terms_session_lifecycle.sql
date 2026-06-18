-- PaceLAB 용어 사전: 세션 유형(훈련법) 해설을 '왜 / 본질·유래 / 실행' 리치 콘텐츠로 보강 (#402).
-- 목적: 러너가 "이 앱 훈련은 근본(과학·코칭 전통)이 있구나"를 느끼도록, 각 훈련법의 유래(Lydiard·Daniels 등)와
-- 본질을 용어집에 담는다. 세션 카드 제목 탭 → 해당 항목으로 deep-link.
-- 정본 시드 = 이 파일, 웹 번들 fallback(glossaryTerms.ts) 미러 (glossary-update-gate).
-- detail은 줄바꿈(\n)으로 왜/본질·유래/실행을 구분 — 시트는 white-space:pre-line으로 렌더.

insert into public.glossary_terms
  (slug, term, aka, category, short_def, detail, related_slugs, order_index, approved)
values
  ('easy', 'Easy (이지)', array['easy','이지런'], 'session_type',
    '대화가 가능한 편안한 저강도 러닝.',
    E'왜: 유산소 베이스(모세혈관·미토콘드리아·심장)를 쌓고 회복을 도와 다음 강한 세션의 토대가 됩니다.\n본질·유래: "훈련의 대부분은 저강도"라는 폴라라이즈드/80–20(Seiler) 원칙의 핵심 축. 마페토네(MAF)도 같은 맥락이에요.\n실행: 대화가 가능한 편한 강도. 페이스보다 심박 안정이 핵심이고, 강도 판정은 RPE·호흡을 우선합니다(심박·페이스는 보조).',
    array['recovery','easy-strides','hr-zones'], 10, true),
  ('recovery', 'Recovery (회복주)', array['recovery','회복런'], 'session_type',
    'Easy보다도 더 낮은 강도의 회복용 러닝.',
    E'왜: 강훈련·롱런 다음, 부하를 더하지 않고 혈류를 돌려 회복을 촉진합니다.\n본질·유래: "회복도 훈련의 일부" — 적응은 자극이 아니라 회복 구간에서 일어납니다.\n실행: Easy보다도 더 느리게, 짧게. 무리면 걷기를 섞어도 좋아요. 여기서 욕심내면 회복이 아니라 또 다른 부하가 됩니다.',
    array['easy','recovery-cost'], 20, true),
  ('long-run', 'Long Run (롱런)', array['long run','롱런','장거리'], 'session_type',
    '낮은 강도로 오래 달려 지구력을 쌓는 세션.',
    E'왜: 낮은 강도로 오래 달려 지구력의 토대(유산소 베이스)를 만듭니다.\n본질·유래: 아서 리디아드의 "유산소 베이스" 철학을 상징하는 세션. 강도보다 지속 시간/거리를 우선합니다.\n실행: 보통 주말에 배치. 세부 성격은 LSD(느리고 길게) / Steady Long(일정 강도)으로 갈립니다.',
    array['lsd','steady-long'], 30, true),
  ('lsd', 'LSD', array['lsd','long slow distance'], 'session_type',
    'Long Slow Distance — 느리고 길게 달리는 저강도 롱런.',
    E'왜: 낮은 강도로 오래 달려 유산소 베이스·지방 대사·모세혈관을 키웁니다.\n본질·유래: 아서 리디아드(1960s 뉴질랜드)가 체계화한 "유산소 베이스" 철학의 상징 세션 — Long Slow Distance.\n실행: 느리고 길게, 대화 가능 강도. 평균/랩 심박이 Z1~Z2 중심이고 후반 드리프트가 작으면 후반 페이스가 조금 올라가도 LSD로 봅니다.',
    array['long-run','steady-long'], 40, true),
  ('steady-long', 'Steady Long', array['steady long','스테디 롱런'], 'session_type',
    '의도적으로 일정 페이스를 유지하는 롱런.',
    E'왜: 긴 거리에서 일정 강도를 유지해 후반 지속력을 만들어 레이스 후반을 버티게 합니다.\n본질·유래: 리디아드 계열 롱런의 변형 — 순수 LSD보다 약간 높은, 통제된 일정 강도(Pfitzinger의 "endurance/medium-long"과 같은 결).\n실행: 의도적으로 일정 페이스, 후반 효율 위주. 잘 통제된 네거티브 스플릿(후반 살짝 가속) 환영. Z3 비중·후반 심박 상승이 함께면 LSD가 아니라 Steady Long으로 봅니다.',
    array['lsd','long-run'], 50, true),
  ('tempo', 'Tempo (템포)', array['tempo','템포런','threshold run'], 'session_type',
    '역치 부근 강도를 꾸준히 유지하는 세션.',
    E'왜: 젖산 역치(LT)를 끌어올려 "편하게 힘든" 페이스를 더 오래 유지하게 만듭니다.\n본질·유래: 잭 다니엘스의 Threshold/Tempo(VDOT 기반) — "comfortably hard(편하게 힘든)" 강도. 끝나고 10~15분 더 갈 수 있을 정도가 기준.\n실행: 심박 상한 준수, 페이스는 보조. 무너지면 중단 — 자극 확보가 목적이지 기록 경신이 아니에요. 정식 웜업(조깅+드릴+스트라이드)과 조깅 쿨다운을 붙입니다.',
    array['tempo-ceiling','lthr'], 60, true),
  ('interval', '인터벌 (Interval)', array['interval','인터벌'], 'session_type',
    '고강도 구간과 회복 구간을 번갈아 반복하는 세션.',
    E'왜: 심폐(VO2max)와 속도를 강하게 자극하는 품질 훈련입니다.\n본질·유래: 트랙의 반복훈련 전통(Iglói, 다니엘스의 I/R 페이스). 80–20에서 "20"에 해당하는 고강도 축.\n실행: 고강도 구간과 회복 구간을 번갈아 반복. 회복·부상 게이트가 막히지 않을 때만 처방하고, 폼이 무너지면 중단합니다.',
    array['race-tt','strides'], 70, true),
  ('strides', '스트라이드 (Strides)', array['strides','스트라이드','윈드스프린트'], 'session_type',
    '20초 안팎의 짧은 가속을 여러 번 반복하는 것.',
    E'왜: 신경근·러닝 이코노미를 자극해 다리 속도와 폼을 다듬습니다 — 유산소/대사 부하 없이.\n본질·유래: 아서 리디아드가 대중화하고 잭 다니엘스가 "strides"로 정식화한 세계 표준. 트랙의 windsprint에서 유래했어요. 앱이 만든 게 아닙니다.\n실행: 15~20초(70~100m)를 최고 "속도"의 ~90%로 여유 있게(전력 질주 아님), 사이는 완전 걷기 회복. 강도 게이지가 심박이 아니라 속도라, 너무 짧아 이지 심박 상한과는 무관(잠깐 올라도 정상).',
    array['easy-strides','easy'], 80, true),
  ('easy-strides', 'Easy + Strides', array['easy strides','이지 스트라이드'], 'session_type',
    'Easy 본주에 스트라이드를 더한 세션.',
    E'왜: 이지런(유산소·회복)에 짧은 스트라이드를 더해, 회복 성격을 깨지 않으면서 다리 속도·폼·순발력을 유지합니다.\n본질·유래: 세계 표준 조합 — 이지런만 계속하면 둔해지는 속도 감각을, 대사 부하 없는 짧은 자극으로 보완. Daniels/Lydiard 전통.\n실행: 본런(이지·심박 상한 이하)을 다 한 뒤 끝에 스트라이드 몇 회. 스트라이드는 속도 기준(전력 아님)이라 그때 심박이 잠깐 오르는 건 정상입니다.',
    array['easy','strides'], 90, true),
  ('race-tt', 'Race / Time Trial', array['race','time trial','tt','레이스','타임트라이얼'], 'session_type',
    '대회 또는 전력으로 기록을 재는 시험주.',
    E'왜: 전력으로 현재 체력을 "실측"해, 추정이 아닌 데이터로 다음 블록의 페이스·등급을 정합니다.\n본질·유래: 타임트라이얼(TT) — 코치들이 대회 없이 체력을 점검하는 표준 방법. 우리 앱에선 "한계 도전"으로, 과거의 나(고스트)와 겨루거나 순수 측정(TT)합니다.\n실행: 충분한 웜업(조깅+드릴+스트라이드) 후 일정 페이스로 끝까지 — 초반 오버페이스 금물. 결과(기록)가 VDOT·등급·페이스를 갱신합니다.',
    array['riegel','pb'], 100, true)
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
