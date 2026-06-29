import type { GlossaryTerm } from '@/entities/glossary/model'

// 번들 fallback 용어 데이터.
// 정본은 Supabase `glossary_terms` 마이그레이션 시드이며, 이 배열은 Supabase 미설정/오프라인일 때
// 화면이 비지 않도록 같은 내용을 담는다. 시드를 바꾸면 이 배열도 함께 갱신한다(완료 게이트 강제).
// id는 fallback 용도로 slug를 그대로 사용한다(DB는 uuid).
export const GLOSSARY_FALLBACK_TERMS: GlossaryTerm[] = [
  // 기초 지표
  {
    id: 'pace',
    slug: 'pace',
    term: '페이스',
    aka: ['pace', '분/km'],
    category: 'basics',
    shortDef: '1km를 달리는 데 걸리는 시간(분:초/km).',
    detail: '숫자가 작을수록 빠릅니다. 5:30/km는 1km를 5분 30초에 달린다는 뜻입니다.',
    relatedSlugs: ['cadence', 'hr-drift'],
    orderIndex: 10
  },
  {
    id: 'cadence',
    slug: 'cadence',
    term: '케이던스',
    aka: ['cadence', 'spm'],
    category: 'basics',
    shortDef: '1분당 걸음 수(spm).',
    detail: '같은 페이스라도 케이던스가 높으면 보폭이 짧아 착지 충격과 부상 부담이 줄어드는 경향이 있습니다.',
    relatedSlugs: ['pace'],
    orderIndex: 20
  },
  {
    id: 'rpe',
    slug: 'rpe',
    term: 'RPE (체감 운동강도)',
    aka: ['rpe', 'perceived exertion', '체감강도'],
    category: 'basics',
    shortDef: '스스로 느낀 힘듦 정도를 0~10으로 매긴 값.',
    detail: '심박·페이스 숫자로 다 잡히지 않는 피로나 컨디션을 보완하는 주관 지표입니다. 코칭이 세션을 해석할 때 함께 봅니다.',
    relatedSlugs: ['hr-drift', 'recovery-cost'],
    orderIndex: 30
  },
  {
    id: 'hr-drift',
    slug: 'hr-drift',
    term: '심박 드리프트',
    aka: ['drift', 'cardiac drift', '드리프트'],
    category: 'basics',
    shortDef: '같은 페이스인데도 후반에 심박이 올라가는 정도.',
    detail: '전반 평균 심박과 후반 평균 심박의 차이로 봅니다. 더위·탈수·피로의 신호일 수 있습니다.',
    relatedSlugs: ['hr-zones', 'recovery-cost'],
    orderIndex: 40
  },

  // 심박존·상한
  {
    id: 'hr-zones',
    slug: 'hr-zones',
    term: '심박존 (Z0~Z5)',
    aka: ['heart rate zone', 'zone', '존', 'z2', 'z4'],
    category: 'heart_rate',
    shortDef: '심박을 강도별로 나눈 구간.',
    detail:
      '기본값은 Z1 회복 100~130, Z2 이지 131~145, Z3 146~155, Z4 템포 156~165, Z5 고강도 166bpm 이상입니다. 개인 역치심박이 입력되면 개인화한 존을 우선합니다.',
    relatedSlugs: ['lthr', 'tempo-ceiling'],
    orderIndex: 10
  },
  {
    id: 'lthr',
    slug: 'lthr',
    term: '역치심박 (LTHR)',
    aka: ['lthr', 'lactate threshold', '젖산역치', '역치'],
    category: 'heart_rate',
    shortDef: '젖산이 빠르게 쌓이기 시작하는 심박.',
    detail:
      '30분 단독 전력주의 마지막 20분 평균 심박이 추정값입니다. PaceLAB 심박 상한 개인화의 1순위 기준이며, 직접 입력하면 가장 정확합니다.',
    relatedSlugs: ['max-hr', 'tempo-ceiling', 'hr-zones'],
    orderIndex: 20
  },
  {
    id: 'max-hr',
    slug: 'max-hr',
    term: '최대심박 (HRmax)',
    aka: ['max hr', 'hrmax', '최대심박수'],
    category: 'heart_rate',
    shortDef: '도달할 수 있는 가장 높은 심박.',
    detail: '측정값을 입력하거나, 없으면 나이로 추정합니다. 실제 러닝에서 더 높은 심박이 찍히면 그 값으로 끌어올려 보정합니다.',
    relatedSlugs: ['tanaka', 'lthr'],
    orderIndex: 30
  },
  {
    id: 'tanaka',
    slug: 'tanaka',
    term: 'Tanaka 공식',
    aka: ['tanaka', '208-0.7'],
    category: 'heart_rate',
    shortDef: '나이로 최대심박을 추정하는 식 (208 − 0.7 × 나이).',
    detail: '개인차가 ±10bpm 수준으로 크기 때문에 보수 신호로만 쓰고, 정확히 하려면 역치심박이나 측정 최대심박을 입력합니다.',
    relatedSlugs: ['max-hr', 'lthr'],
    orderIndex: 40
  },
  {
    id: 'tempo-ceiling',
    slug: 'tempo-ceiling',
    term: '템포·이지·회복 상한',
    aka: ['ceiling', '상한', 'tempo cap', 'easy cap'],
    category: 'heart_rate',
    shortDef: '세션 유형별로 넘지 않도록 권하는 심박 상한.',
    detail:
      '고정 숫자(예: 165)가 아니라 개인 역치심박에서 파생합니다. 나이·심박·기록이 모두 없으면 상한을 만들지 않고 미설정으로 두고 페이스·RPE로 평가합니다. 템포 상한은 고정값이 아니라 최근 수행으로 검증·적응합니다.',
    relatedSlugs: ['lthr', 'hr-zones', 'tempo-ceiling-adaptation', 'tempo-grade'],
    orderIndex: 50
  },
  {
    id: 'tempo-ceiling-adaptation',
    slug: 'tempo-ceiling-adaptation',
    term: '템포 상한 적응 (상향 후보·신뢰도)',
    aka: ['상향 후보', '상한 적응', 'tempo ceiling adaptation', '신뢰도'],
    category: 'heart_rate',
    shortDef: '템포 상한을 추정값에 고정하지 않고, 실제 수행으로 검증해 위로만 조정하는 방식.',
    detail:
      '나이(Tanaka)·역치 추정은 안전한 시작값(신뢰도 낮음)입니다. 최근 템포에서 상한을 넘겨도 RPE가 낮고 후반이 안정적이며 다음날 회복이 좋은 패턴이 2회 모이면 "상향 후보"로 관찰하고, 3회 이상 확인되면 상한을 한 단계 올려 적용합니다(신뢰도 높음, 출처=최근 템포 분석). 추정보다 실제 수행을 우선하되, 상한을 내리지는 않고 부상 중에는 올리지 않습니다.',
    relatedSlugs: ['tempo-ceiling', 'tempo-grade', 'lthr'],
    orderIndex: 55
  },
  {
    id: 'tempo-grade',
    slug: 'tempo-grade',
    term: '템포 등급 (A·B·C·D)',
    aka: ['tempo grade', '템포 평가', 'A B C D'],
    category: 'heart_rate',
    shortDef: '템포를 성공/실패 이진이 아니라 자극 확보 × 처방 준수로 나눈 등급.',
    detail:
      'A는 처방 완전 준수, B는 템포 자극은 확보했고 상한을 일부 초과, C는 상한을 크게/반복 초과, D는 세션 목적(템포 자극) 자체를 못 이룬 경우입니다. 상한을 몇 bpm 넘겼다고 곧바로 "실패"로 보지 않고, 자극·후반 유지·회복을 함께 봅니다.',
    relatedSlugs: ['tempo-ceiling', 'tempo-ceiling-adaptation'],
    orderIndex: 56
  },

  // 세션 유형
  {
    id: 'easy',
    slug: 'easy',
    term: 'Easy (이지)',
    aka: ['easy', '이지런'],
    category: 'session_type',
    shortDef: '대화가 가능한 편안한 저강도 러닝.',
    detail:
      '왜: 유산소 베이스(모세혈관·미토콘드리아·심장)를 쌓고 회복을 도와 다음 강한 세션의 토대가 됩니다.\n본질·유래: "훈련의 대부분은 저강도"라는 폴라라이즈드/80–20(Seiler) 원칙의 핵심 축. 마페토네(MAF)도 같은 맥락이에요.\n실행: 대화가 가능한 편한 강도. 페이스보다 심박 안정이 핵심이고, 강도 판정은 RPE·호흡을 우선합니다(심박·페이스는 보조).',
    relatedSlugs: ['recovery', 'easy-strides', 'hr-zones'],
    orderIndex: 10
  },
  {
    id: 'recovery',
    slug: 'recovery',
    term: 'Recovery (회복주)',
    aka: ['recovery', '회복런'],
    category: 'session_type',
    shortDef: 'Easy보다도 더 낮은 강도의 회복용 러닝.',
    detail:
      '왜: 강훈련·롱런 다음, 부하를 더하지 않고 혈류를 돌려 회복을 촉진합니다.\n본질·유래: "회복도 훈련의 일부" — 적응은 자극이 아니라 회복 구간에서 일어납니다.\n실행: Easy보다도 더 느리게, 짧게. 무리면 걷기를 섞어도 좋아요. 여기서 욕심내면 회복이 아니라 또 다른 부하가 됩니다.',
    relatedSlugs: ['easy', 'recovery-cost'],
    orderIndex: 20
  },
  {
    id: 'long-run',
    slug: 'long-run',
    term: 'Long Run (롱런)',
    aka: ['long run', '롱런', '장거리'],
    category: 'session_type',
    shortDef: '낮은 강도로 오래 달려 지구력을 쌓는 세션.',
    detail:
      '왜: 낮은 강도로 오래 달려 지구력의 토대(유산소 베이스)를 만듭니다.\n본질·유래: 아서 리디아드의 "유산소 베이스" 철학을 상징하는 세션. 강도보다 지속 시간/거리를 우선합니다.\n실행: 보통 주말에 배치. 세부 성격은 LSD(느리고 길게) / Steady Long(일정 강도)으로 갈립니다.',
    relatedSlugs: ['lsd', 'steady-long'],
    orderIndex: 30
  },
  {
    id: 'lsd',
    slug: 'lsd',
    term: 'LSD',
    aka: ['lsd', 'long slow distance'],
    category: 'session_type',
    shortDef: 'Long Slow Distance — 느리고 길게 달리는 저강도 롱런.',
    detail:
      '왜: 낮은 강도로 오래 달려 유산소 베이스·지방 대사·모세혈관을 키웁니다.\n본질·유래: 아서 리디아드(1960s 뉴질랜드)가 체계화한 "유산소 베이스" 철학의 상징 세션 — Long Slow Distance.\n실행: 느리고 길게, 대화 가능 강도. 평균/랩 심박이 Z1~Z2 중심이고 후반 드리프트가 작으면 후반 페이스가 조금 올라가도 LSD로 봅니다.',
    relatedSlugs: ['long-run', 'steady-long'],
    orderIndex: 40
  },
  {
    id: 'steady-long',
    slug: 'steady-long',
    term: 'Steady Long',
    aka: ['steady long', '스테디 롱런'],
    category: 'session_type',
    shortDef: '의도적으로 일정 페이스를 유지하는 롱런.',
    detail:
      '왜: 긴 거리에서 일정 강도를 유지해 후반 지속력을 만들어 레이스 후반을 버티게 합니다.\n본질·유래: 리디아드 계열 롱런의 변형 — 순수 LSD보다 약간 높은, 통제된 일정 강도(Pfitzinger의 "endurance/medium-long"과 같은 결).\n실행: 의도적으로 일정 페이스, 후반 효율 위주. 잘 통제된 네거티브 스플릿(후반 살짝 가속) 환영. Z3 비중·후반 심박 상승이 함께면 LSD가 아니라 Steady Long으로 봅니다.',
    relatedSlugs: ['lsd', 'long-run'],
    orderIndex: 50
  },
  {
    id: 'tempo',
    slug: 'tempo',
    term: 'Tempo (템포)',
    aka: ['tempo', '템포런', 'threshold run'],
    category: 'session_type',
    shortDef: '역치 부근 강도를 꾸준히 유지하는 세션.',
    detail:
      '왜: 젖산 역치(LT)를 끌어올려 "편하게 힘든" 페이스를 더 오래 유지하게 만듭니다.\n본질·유래: 잭 다니엘스의 Threshold/Tempo(VDOT 기반) — "comfortably hard(편하게 힘든)" 강도. 끝나고 10~15분 더 갈 수 있을 정도가 기준.\n실행: 심박 상한 준수, 페이스는 보조. 무너지면 중단 — 자극 확보가 목적이지 기록 경신이 아니에요. 정식 웜업(조깅+드릴+스트라이드)과 조깅 쿨다운을 붙입니다.',
    relatedSlugs: ['tempo-ceiling', 'lthr'],
    orderIndex: 60
  },
  {
    id: 'interval',
    slug: 'interval',
    term: '인터벌 (Interval)',
    aka: ['interval', '인터벌'],
    category: 'session_type',
    shortDef: '고강도 구간과 회복 구간을 번갈아 반복하는 세션.',
    detail:
      '왜: 심폐(VO2max)와 속도를 강하게 자극하는 품질 훈련입니다.\n본질·유래: 트랙의 반복훈련 전통(Iglói, 다니엘스의 I/R 페이스). 80–20에서 "20"에 해당하는 고강도 축.\n실행: 고강도 구간과 회복 구간을 번갈아 반복. 회복·부상 게이트가 막히지 않을 때만 처방하고, 폼이 무너지면 중단합니다.',
    relatedSlugs: ['race-tt', 'strides'],
    orderIndex: 70
  },
  {
    id: 'strides',
    slug: 'strides',
    term: '스트라이드 (Strides)',
    aka: ['strides', '스트라이드', '윈드스프린트'],
    category: 'session_type',
    shortDef: '20초 안팎의 짧은 가속을 여러 번 반복하는 것.',
    detail:
      '왜: 신경근·러닝 이코노미를 자극해 다리 속도와 폼을 다듬습니다 — 유산소/대사 부하 없이.\n본질·유래: 아서 리디아드가 대중화하고 잭 다니엘스가 "strides"로 정식화한 세계 표준. 트랙의 windsprint에서 유래했어요. 앱이 만든 게 아닙니다.\n실행: 15~20초(70~100m)를 최고 "속도"의 ~90%로 여유 있게(전력 질주 아님), 사이는 완전 걷기 회복. 강도 게이지가 심박이 아니라 속도라, 너무 짧아 이지 심박 상한과는 무관(잠깐 올라도 정상).',
    relatedSlugs: ['easy-strides', 'easy'],
    orderIndex: 80
  },
  {
    id: 'easy-strides',
    slug: 'easy-strides',
    term: 'Easy + Strides',
    aka: ['easy strides', '이지 스트라이드'],
    category: 'session_type',
    shortDef: 'Easy 본주에 스트라이드를 더한 세션.',
    detail:
      '왜: 이지런(유산소·회복)에 짧은 스트라이드를 더해, 회복 성격을 깨지 않으면서 다리 속도·폼·순발력을 유지합니다.\n본질·유래: 세계 표준 조합 — 이지런만 계속하면 둔해지는 속도 감각을, 대사 부하 없는 짧은 자극으로 보완. Daniels/Lydiard 전통.\n실행: 본런(이지·심박 상한 이하)을 다 한 뒤 끝에 스트라이드 몇 회. 스트라이드는 속도 기준(전력 아님)이라 그때 심박이 잠깐 오르는 건 정상입니다.',
    relatedSlugs: ['easy', 'strides'],
    orderIndex: 90
  },
  {
    id: 'race-tt',
    slug: 'race-tt',
    term: 'Race / Time Trial',
    aka: ['race', 'time trial', 'tt', '레이스', '타임트라이얼'],
    category: 'session_type',
    shortDef: '대회 또는 전력으로 기록을 재는 시험주.',
    detail:
      '왜: 전력으로 현재 체력을 "실측"해, 추정이 아닌 데이터로 다음 블록의 페이스·등급을 정합니다.\n본질·유래: 타임트라이얼(TT) — 코치들이 대회 없이 체력을 점검하는 표준 방법. 우리 앱에선 "한계 도전"으로, 과거의 나(고스트)와 겨루거나 순수 측정(TT)합니다.\n실행: 충분한 웜업(조깅+드릴+스트라이드) 후 일정 페이스로 끝까지 — 초반 오버페이스 금물. 결과(기록)가 VDOT·등급·페이스를 갱신합니다.',
    relatedSlugs: ['riegel', 'pb'],
    orderIndex: 100
  },
  {
    id: 'strength',
    slug: 'strength',
    term: '보강운동',
    aka: ['strength', '근력운동', '재활운동'],
    category: 'session_type',
    shortDef: '부상 예방·재활을 돕는 참고용 근력 운동.',
    detail:
      '통증 0~2/5 범위에서만 하고 다음날 악화되면 강도를 낮춥니다. 치료를 보장하지 않으며, 통증이 커지면 운동보다 중단·전문가 상담을 먼저 권합니다.',
    relatedSlugs: ['pain-level', 'injury-status'],
    orderIndex: 110
  },

  // 부하·적응·준비도
  {
    id: 'weekly-volume',
    slug: 'weekly-volume',
    term: '주간 거리',
    aka: ['weekly volume', '주간 볼륨', 'mileage'],
    category: 'load',
    shortDef: '한 주 동안 누적한 러닝 거리.',
    detail: '훈련량의 기본 척도입니다. 갑작스러운 증가는 회복 보수 신호로 봅니다.',
    relatedSlugs: ['load-spike', 'acute-load'],
    orderIndex: 10
  },
  {
    id: 'acute-load',
    slug: 'acute-load',
    term: '급성 부하 (최근 7일)',
    aka: ['acute load', '최근 7일', 'atl'],
    category: 'load',
    shortDef: '최근 7일에 쌓은 단기 훈련 부하.',
    detail: '최근 7일과 직전 7일을 비교한 급격한 증가는 단정적 부상 예측이 아니라 보수적 경고로만 사용합니다.',
    relatedSlugs: ['chronic-load', 'load-spike'],
    orderIndex: 20
  },
  {
    id: 'chronic-load',
    slug: 'chronic-load',
    term: '만성 부하 (최근 30일)',
    aka: ['chronic load', '최근 30일', 'ctl'],
    category: 'load',
    shortDef: '꾸준히 쌓아온 중장기 적응 부하.',
    detail: '최근 30일과 직전 30일(31~60일)을 비교해 부하 추세를 봅니다. 단일 세션보다 반복 흐름을 우선합니다.',
    relatedSlugs: ['acute-load', 'load-spike'],
    orderIndex: 30
  },
  {
    id: 'load-spike',
    slug: 'load-spike',
    term: '부하 급증 (spike / rising)',
    aka: ['spike', 'rising', '부하 급증'],
    category: 'load',
    shortDef: '부하가 평소보다 가파르게 늘어난 상태.',
    detail: '최근 30일이 직전 30일 대비 +50% 이상이면 spike, +30% 이상이면 rising으로 봅니다. 통증 신호와 겹칠 때만 강도를 강제로 낮춥니다.',
    relatedSlugs: ['overtraining', 'chronic-load'],
    orderIndex: 40
  },
  {
    id: 'readiness',
    slug: 'readiness',
    term: '목표 준비도',
    aka: ['readiness', '준비도'],
    category: 'load',
    shortDef: '목표를 달성할 준비가 얼마나 됐는지 종합한 점수.',
    detail:
      '수행능력 신호, 역치/템포 자극, 유산소 베이스, 롱런 기반, 일관성/회복 여유, 부상/회복 게이트를 가중평균해 보여줍니다. 단일 환산 기록만으로 판단하지 않습니다.',
    relatedSlugs: ['riegel', 'overtraining'],
    orderIndex: 50
  },
  {
    id: 'overtraining',
    slug: 'overtraining',
    term: '과훈련 위험',
    aka: ['overtraining', '과훈련', 'overreaching'],
    category: 'load',
    shortDef: '회복보다 부하가 앞서 누적된 위험 신호.',
    detail: '부하 급증과 회복 부족, 통증·높은 RPE·낮은 컨디션이 겹칠 때 보수적으로 경고합니다.',
    relatedSlugs: ['load-spike', 'recovery-cost'],
    orderIndex: 60
  },

  // 추세 Lens
  {
    id: 'trend-lens',
    slug: 'trend-lens',
    term: '추세 Lens',
    aka: ['trend lens', 'lens', '렌즈'],
    category: 'trend',
    shortDef: '누적 기록을 특정 질문 기준으로 다시 해석하는 분석 관점.',
    detail: '“추세” 화면에서 목표 진전·유산소 효율·강도 분포·세션 품질·회복 비용 같은 Lens로 발전/퇴보와 다음 처방 영향을 봅니다.',
    relatedSlugs: ['goal-progress', 'aerobic-efficiency'],
    orderIndex: 10
  },
  {
    id: 'goal-progress',
    slug: 'goal-progress',
    term: '목표 진전',
    aka: ['goal progress', '목표 진척'],
    category: 'trend',
    shortDef: '활성 목표에 얼마나 가까워지고 있는지 보는 Lens.',
    detail: '최근 흐름과 수행능력 신호를 목표 기준으로 모아 발전 방향을 보여줍니다.',
    relatedSlugs: ['trend-lens', 'readiness'],
    orderIndex: 20
  },
  {
    id: 'aerobic-efficiency',
    slug: 'aerobic-efficiency',
    term: '유산소 효율',
    aka: ['aerobic efficiency', '유산소 효율'],
    category: 'trend',
    shortDef: '같은 심박대에서 페이스가 좋아지고 있는지 보는 Lens.',
    detail: '같은 심박대 샘플이 충분하고 기온·코스·고도 차이가 작을 때만 강한 개선 신호로 봅니다.',
    relatedSlugs: ['trend-lens', 'hr-drift'],
    orderIndex: 30
  },
  {
    id: 'intensity-distribution',
    slug: 'intensity-distribution',
    term: '강도 분포',
    aka: ['intensity distribution', '강도 분포', 'easy 비율'],
    category: 'trend',
    shortDef: 'Easy와 품질 훈련의 비중을 보는 Lens.',
    detail: '지구력 훈련은 저강도 비중이 큰 분포를 기본 기준으로 삼습니다. Easy 여부는 세션 유형이 아니라 실제 심박·페이스로 계산합니다.',
    relatedSlugs: ['trend-lens', 'easy'],
    orderIndex: 40
  },
  {
    id: 'session-quality',
    slug: 'session-quality',
    term: '세션 품질',
    aka: ['session quality', '세션 품질'],
    category: 'trend',
    shortDef: '세션이 의도한 처방대로 수행됐는지 보는 Lens.',
    detail: '예: 템포가 상한 안에서 안정적으로 유지됐는지, Easy가 충분히 쉬웠는지.',
    relatedSlugs: ['trend-lens', 'tempo'],
    orderIndex: 50
  },
  {
    id: 'recovery-cost',
    slug: 'recovery-cost',
    term: '회복 비용',
    aka: ['recovery cost', '회복 비용'],
    category: 'trend',
    shortDef: '세션 뒤 회복에 든 부담을 보는 Lens.',
    detail: '긴 공백 단독은 휴식/기록 누락일 수 있어 약하게 봅니다. 통증·높은 RPE·낮은 컨디션 같은 반응 신호와 겹칠 때 회복 비용을 높입니다.',
    relatedSlugs: ['trend-lens', 'rpe', 'overtraining'],
    orderIndex: 60
  },

  // 부상·몸 상태
  {
    id: 'pain-level',
    slug: 'pain-level',
    term: '통증 레벨 (0~5)',
    aka: ['pain level', '통증 점수', 'painLevel'],
    category: 'injury',
    shortDef: '부위별 통증을 0~5로 매긴 값.',
    detail: '0 없음, 1~2 관찰하며 보강 가능, 3 강훈련·롱런 상향 보류, 4~5 강도 하향·중단 검토가 필요한 강한 신호입니다.',
    relatedSlugs: ['severity', 'injury-checkin'],
    orderIndex: 10
  },
  {
    id: 'severity',
    slug: 'severity',
    term: '심각도 (severity)',
    aka: ['severity', '심각도'],
    category: 'injury',
    shortDef: '활성 부위 중 가장 높은 통증 레벨.',
    detail: '여러 부위가 있으면 가장 강한 부위가 훈련 제한을 결정합니다. 의료 진단이 아니라 훈련 부하 조절용 위험 신호입니다.',
    relatedSlugs: ['pain-level', 'injury-status'],
    orderIndex: 20
  },
  {
    id: 'injury-status',
    slug: 'injury-status',
    term: '부상 상태 (active / monitoring / resolved)',
    aka: ['injury status', 'active', 'monitoring', 'resolved', '완치'],
    category: 'injury',
    shortDef: '부상 항목의 관리 단계.',
    detail: 'active 관리 중, monitoring 관찰 중, resolved 해소. resolved는 앱이 후보를 제안해도 사용자가 직접 확정합니다.',
    relatedSlugs: ['injury-checkin', 'severity'],
    orderIndex: 30
  },
  {
    id: 'injury-area',
    slug: 'injury-area',
    term: '부상 부위',
    aka: ['injury area', '부위', 'normalizedAreas'],
    category: 'injury',
    shortDef: '근육·힘줄·관절 단위로 정규화된 부위 선택값.',
    detail: '햄스트링, 대퇴사두근, IT 밴드, 무릎, 정강이, 종아리, 아킬레스건, 발목, 족저근막, 고관절, 허리 등 신체 모델에서 선택합니다.',
    relatedSlugs: ['pain-level', 'injury-status'],
    orderIndex: 40
  },
  {
    id: 'injury-checkin',
    slug: 'injury-checkin',
    term: '부상 체크인',
    aka: ['injury check-in', '체크인'],
    category: 'injury',
    shortDef: '통증 변화와 완치 후보를 짧게 확인하는 절차.',
    detail: '새 러닝이 들어온 뒤 active/monitoring 부상이 있으면 하루 1회 통증·악화 여부를 묻습니다. 결과는 사용자가 승인해야 상태에 반영됩니다.',
    relatedSlugs: ['injury-status', 'pain-level'],
    orderIndex: 50
  },

  // 목표
  {
    id: 'active-goal',
    slug: 'active-goal',
    term: '활성 목표',
    aka: ['active goal', '활성 목표'],
    category: 'goal',
    shortDef: '코칭의 1차 판단 기준이 되는 현재 목표.',
    detail: '시작일, 목표일, 성공 기준, 전략을 함께 가집니다. 추천과 분석은 이 목표를 기준으로 합니다.',
    relatedSlugs: ['secondary-goal', 'target-date', 'success-criteria'],
    orderIndex: 10
  },
  {
    id: 'secondary-goal',
    slug: 'secondary-goal',
    term: '보조 목표',
    aka: ['secondary goal', '보조 목표'],
    category: 'goal',
    shortDef: '활성 목표를 바꾸지 않고 맥락으로만 참고하는 목표.',
    detail: '예: “7:00/km로 Zone 2에서 편하게”처럼 장기·보조 목표는 활성 목표를 교체하지 않고 코칭 맥락으로 반영됩니다.',
    relatedSlugs: ['active-goal'],
    orderIndex: 20
  },
  {
    id: 'success-criteria',
    slug: 'success-criteria',
    term: '성공 기준',
    aka: ['success criteria', '성공 기준'],
    category: 'goal',
    shortDef: '목표 달성 여부를 판정하는 기준.',
    detail: '예: “10km 59:59 이내 완주”. 코칭은 성공 기준과 남은 기간을 보고 스케줄 유지/수정을 판단합니다.',
    relatedSlugs: ['active-goal', 'target-date'],
    orderIndex: 30
  },
  {
    id: 'target-date',
    slug: 'target-date',
    term: '목표일',
    aka: ['target date', '목표 날짜', 'd-day'],
    category: 'goal',
    shortDef: '목표를 완성하려는 날짜.',
    detail: '남은 기간에 맞춰 코칭이 주간 스케줄과 강도를 조정합니다.',
    relatedSlugs: ['active-goal', 'success-criteria'],
    orderIndex: 40
  },

  // 데이터·연동
  {
    id: 'run-log',
    slug: 'run-log',
    term: 'Run Log (러닝 기록)',
    aka: ['run log', 'runlog', '기록'],
    category: 'data',
    shortDef: '한 번의 러닝 세션을 구조화해 저장한 단위.',
    detail: '거리·시간·페이스·심박·케이던스·랩·경로 샘플·태그 등을 담습니다. “기록” 탭이 이 원장을 관리합니다.',
    relatedSlugs: ['healthkit', 'fit'],
    orderIndex: 10
  },
  {
    id: 'healthkit',
    slug: 'healthkit',
    term: 'HealthKit',
    aka: ['healthkit', '건강 앱', 'apple health'],
    category: 'data',
    shortDef: 'Apple 건강 데이터 연동.',
    detail: '로그인 상태에서 앱을 켜거나 다시 활성화하면 최신 기록 이후의 러닝만 자동으로 동기화합니다.',
    relatedSlugs: ['run-log', 'fit'],
    orderIndex: 20
  },
  {
    id: 'fit',
    slug: 'fit',
    term: 'FIT import',
    aka: ['fit', 'workoutdoors', '.fit'],
    category: 'data',
    shortDef: 'Workoutdoors 등에서 내보낸 .fit 파일 가져오기.',
    detail: '브라우저에서 로컬로 파싱해 러닝 기록 후보를 만듭니다. 원본 파일은 저장하지 않습니다.',
    relatedSlugs: ['run-log', 'healthkit'],
    orderIndex: 30
  },
  {
    id: 'weather',
    slug: 'weather',
    term: '날씨 (기상청 단기예보)',
    aka: ['weather', '기상청', '단기예보', '날씨'],
    category: 'data',
    shortDef: '기상청 단기예보로 받는 국내 날씨 요약.',
    detail: '현위치나 마지막 러닝 위치 기준으로 체감온도·강수확률·강수량·복장을 러닝 준비에 씁니다. 오늘부터 약 3일까지 제공하며, 더위·강추위·비·강풍은 페이스보다 안전·강도 조절 근거로 씁니다.',
    relatedSlugs: ['rpe', 'outfit'],
    orderIndex: 40
  },
  {
    id: 'outfit',
    slug: 'outfit',
    term: '복장 추천',
    aka: ['outfit', '복장', '옷차림'],
    category: 'data',
    shortDef: '러닝 체감온도 기준 옷차림 가이드.',
    detail: '러닝 중엔 정지 상태보다 덥게 느껴져 체감온도 기준으로 한 단계 가볍게 입도록 5℃ 단위로 상·하의와 액세서리를 제안합니다. 비·강풍이면 방수·바람막이를 더합니다.',
    relatedSlugs: ['weather', 'rpe'],
    orderIndex: 45
  },
  {
    id: 'pb',
    slug: 'pb',
    term: 'PB (개인 최고기록)',
    aka: ['pb', 'personal best', '개인 기록'],
    category: 'achievement',
    shortDef: '거리별 개인 최고기록.',
    detail: '목표 가능성과 러너 레벨 판정, 당일 평가 문구에 반영됩니다.',
    relatedSlugs: ['distance-pb', 'riegel', 'race-tt'],
    orderIndex: 10
  },
  {
    id: 'course-type',
    slug: 'course-type',
    term: '코스 타입',
    aka: ['course type', '코스', 'flat', 'hilly', 'trail'],
    category: 'data',
    shortDef: '러닝 코스의 지형 분류.',
    detail: 'Flat, Mixed, Hilly, Trail, Track, Treadmill로 나눕니다. 고도·거리로 추론한 제안값이며 사용자가 수정할 수 있습니다.',
    relatedSlugs: ['run-log'],
    orderIndex: 60
  },
  {
    id: 'riegel',
    slug: 'riegel',
    term: 'Riegel 예측',
    aka: ['riegel', '리겔', '기록 환산'],
    category: 'data',
    shortDef: '한 거리 기록으로 다른 거리 기록을 환산하는 공식.',
    detail: '수행능력 신호가 있는 기록에 한해 목표 가능성의 참고 지표로만 씁니다. 확정 규칙이 아닙니다.',
    relatedSlugs: ['readiness', 'pb', 'race-tt'],
    orderIndex: 70
  },
  {
    id: 'vo2max',
    slug: 'vo2max',
    term: 'VO2max (심폐 체력)',
    aka: ['vo2max', 'vo2 max', '심폐 체력', '심폐지구력'],
    category: 'data',
    shortDef: '체중 1kg당 1분 동안 쓸 수 있는 최대 산소량(mL/kg·min).',
    detail: 'Apple Watch가 야외 러닝에서 자동 추정해 건강 앱에 저장합니다. PaceLAB은 있으면 VDOT 페이스 추정의 보조 신호로만 쓰고, 심박 상한은 만들지 않습니다. 없으면 사용하지 않습니다.',
    relatedSlugs: ['vdot', 'healthkit', 'pb'],
    orderIndex: 80
  },
  {
    id: 'vdot',
    slug: 'vdot',
    term: 'VDOT (페이스 추정)',
    aka: ['vdot', 'daniels', '다니엘스'],
    category: 'data',
    shortDef: '경기력 또는 VO2max로 환산한 체력 지표. 강도별 목표 페이스를 만든다.',
    detail: 'PB/레이스가 있으면 그 기록에서, 없으면 VO2max에서 추정합니다(추정은 신뢰도가 낮음). 템포·이지 페이스와 레이스 예상에 쓰되, 실제 강도 기준은 심박 상한이고 페이스는 보조입니다.',
    relatedSlugs: ['vo2max', 'pb', 'riegel'],
    orderIndex: 90
  },
  // 업적·기록
  {
    id: 'distance-pb',
    slug: 'distance-pb',
    term: '거리별 PB',
    aka: ['distance pb', '거리별 개인최고', '5K PB', '10K PB'],
    category: 'achievement',
    shortDef: '출발선부터 5km 단위 거리에 가장 빨리 도달한 기록.',
    detail: '전체 기록에서 자동 산출하며, 훈련과 레이싱(자기와의 대결)을 분리해 각각 관리합니다. 세션 기록의 페이스 흐름을 적분해 5K·10K처럼 거리별 도달 시간을 추정합니다.',
    relatedSlugs: ['pb', 'run-streak'],
    orderIndex: 20
  },
  {
    id: 'run-streak',
    slug: 'run-streak',
    term: '연속 러닝 (스트릭)',
    aka: ['streak', '스트릭', '최장 연속'],
    category: 'achievement',
    shortDef: '끊김 없이 이어진 러닝 일수.',
    detail: '하루라도 빠지면 끊기며, 전체 기록에서 가장 길었던 연속 일수를 업적으로 보여줍니다. 주·월 최다 누적 거리와 함께 꾸준함 지표로 쓰입니다.',
    relatedSlugs: ['distance-pb'],
    orderIndex: 30
  },

  // 한계 도전
  {
    id: 'racing',
    slug: 'racing',
    term: '한계 도전',
    aka: ['한계 도전', '레이싱', 'racing', '한계 시험', '타임트라이얼', 'TT'],
    category: 'competition',
    shortDef: '과거의 나(고스트)와 겨루거나 한계 시험(TT)으로 현재 체력을 측정·갱신하는 모드.',
    detail: '훈련 계획의 재측정 관문이자 등급 승급의 계기입니다. 상대가 “없음”이면 한계 시험(TT, 순수 전력 측정), 과거의 나(고스트)면 게임화된 측정 — 같은 거리를 그때의 나처럼 달리는 고스트와 실시간 격차를 음성으로 안내받습니다. 결과(기록)는 현재 체력(VDOT)·등급을 갱신합니다. (다자간 실시간 경쟁은 후속·보류)',
    relatedSlugs: ['solo-race', 'ghost'],
    orderIndex: 10
  },
  {
    id: 'solo-race',
    slug: 'solo-race',
    term: '한계 시험 / 고스트 대전',
    aka: ['solo race', '한계 시험', '고스트 대전', 'TT', '타임트라이얼'],
    category: 'competition',
    shortDef: '상대 없이 전력 측정(TT)하거나, 과거의 나(고스트)와 겨뤄 한계를 갱신.',
    detail: '타겟이 “없음”이면 순수 한계 시험(TT, 측정만), “내 베스트(고스트)”면 게임화된 측정입니다 — 둘 다 결과가 VDOT·등급으로 이어집니다. 스케줄은 단계 블록 끝에 한계 시험을 재측정 관문으로 처방합니다.',
    relatedSlugs: ['racing', 'ghost', 'my-best'],
    orderIndex: 20
  },
  {
    id: 'crew-race',
    slug: 'crew-race',
    term: '크루와 대결',
    aka: ['crew race', '여러명이서', '크루와 대결', '다자간'],
    category: 'competition',
    shortDef: '여러 명이 각자의 장소에서 동시에 겨루는 모드 — 현재 보류(시장 차별성 낮음).',
    detail: '떨어져 있어도 함께 달리는 경험을 목표로 한 모드이나, 시중 앱에 흔해 경쟁력이 낮다고 보아 현재 보류입니다. 지금은 한계 도전(고스트 대전·한계 시험)에 집중합니다.',
    relatedSlugs: ['racing', 'solo-race'],
    orderIndex: 30
  },
  {
    id: 'ghost',
    slug: 'ghost',
    term: '고스트',
    aka: ['ghost', '고스트', '가상 경쟁자'],
    category: 'competition',
    shortDef: '과거 기록의 페이스 곡선을 재생한 가상 경쟁 상대.',
    detail: '선택한 과거 레이싱이나 내 베스트의 거리별 도달 시간을 그대로 따라 달립니다. 레이싱 중에는 고스트와의 실시간 거리 격차와 추월·역전을 음성으로 안내합니다.',
    relatedSlugs: ['solo-race', 'my-best', 'racing'],
    orderIndex: 40
  },
  {
    id: 'my-best',
    slug: 'my-best',
    term: '내 베스트',
    aka: ['my best', '내 베스트', '베스트 도전'],
    category: 'competition',
    shortDef: '해당 거리에서 가장 빨랐던 내 기록을 타겟으로 삼는 도전.',
    detail: '훈련·레이싱을 가리지 않고 그 거리의 전체 통합 최속 기록 1개를 고스트로 만들어 겨룹니다. “내 한계에 다시 도전”하는 타겟입니다.',
    relatedSlugs: ['ghost', 'solo-race', 'distance-pb'],
    orderIndex: 50
  },
  {
    id: 'race-percentile',
    slug: 'race-percentile',
    term: '대회 상위 %',
    aka: ['percentile', '퍼센타일', '빠른 순서', '상위 퍼센트', '대회 현주소'],
    category: 'competition',
    shortDef: '특정 대회 완주자 분포에서 내 예상 기록이 빠른 순서로 상위 몇 %에 드는지 보는 참고값.',
    detail:
      '예를 들어 “상위 10%”는 완주자를 빠른 순서로 줄 세웠을 때 가장 빠른 10% 안에 든다는 뜻이고, “상위 76%”는 나보다 빠른 사람이 약 76%여서 느린 편(완주자의 약 24%만 나보다 느림)이라는 뜻입니다. 숫자가 작을수록 빠릅니다. 실제 참가 순위가 아니라 해당 연도·거리의 비식별 분포 컷에 내 목표 예상을 대입한 참고 벤치마크입니다.',
    relatedSlugs: ['racing', 'distance-pb'],
    orderIndex: 60
  }
]
