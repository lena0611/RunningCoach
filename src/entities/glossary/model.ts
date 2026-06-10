// PaceLAB 앱 사용자용 용어 사전 모델.
// 정본(source of truth)은 Supabase 마이그레이션 시드(`glossary_terms`)이며,
// 이 모듈의 타입/카테고리 메타와 번들 fallback(`glossaryTerms.ts`)은 그 시드와 함께 갱신한다.

export type GlossaryCategory =
  | 'basics'
  | 'heart_rate'
  | 'session_type'
  | 'load'
  | 'trend'
  | 'injury'
  | 'goal'
  | 'achievement'
  | 'competition'
  | 'data'

export type GlossaryTerm = {
  id: string
  slug: string
  term: string
  aka: string[]
  category: GlossaryCategory
  shortDef: string
  detail: string
  relatedSlugs: string[]
  orderIndex: number
}

export const GLOSSARY_CATEGORY_ORDER: GlossaryCategory[] = [
  'basics',
  'heart_rate',
  'session_type',
  'load',
  'trend',
  'injury',
  'goal',
  'achievement',
  'competition',
  'data'
]

export const GLOSSARY_CATEGORY_LABEL: Record<GlossaryCategory, string> = {
  basics: '기초 지표',
  heart_rate: '심박존·상한',
  session_type: '세션 유형',
  load: '부하·적응·준비도',
  trend: '추세 Lens',
  injury: '부상·몸 상태',
  goal: '목표',
  achievement: '업적·기록',
  competition: '레이싱',
  data: '데이터·연동'
}

export const GLOSSARY_CATEGORY_DESCRIPTION: Record<GlossaryCategory, string> = {
  basics: '러닝 기록을 읽을 때 가장 자주 보는 기본 지표',
  heart_rate: '강도 기준이 되는 심박존과 개인화 심박 상한',
  session_type: '훈련 처방에 쓰이는 세션 종류',
  load: '얼마나 많이·세게 달렸고 목표에 얼마나 준비됐는지',
  trend: '누적 데이터를 질문별로 다시 해석하는 분석 관점',
  injury: '통증·부상 상태를 훈련 강도에 반영하는 기준',
  goal: '코칭의 판단 기준이 되는 목표 구조',
  achievement: '전체 기록에서 자동 산출되는 개인 최고·꾸준함 기록',
  competition: '과거의 나(고스트)나 다른 러너와 같은 거리를 겨루는 레이싱 기능',
  data: 'HealthKit·FIT·날씨 등 기록이 들어오는 경로와 예측'
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

// 검색은 용어명, 동의어/약어, 한 줄 정의, 상세 설명을 함께 본다(공백 무시).
export function matchesGlossaryQuery(term: GlossaryTerm, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const needle = normalize(trimmed)
  const haystacks = [term.term, term.shortDef, term.detail, ...term.aka]
  return haystacks.some((value) => normalize(value).includes(needle))
}

export function filterGlossaryTerms(
  terms: GlossaryTerm[],
  options: { query?: string; category?: GlossaryCategory | 'all' } = {}
): GlossaryTerm[] {
  const { query = '', category = 'all' } = options
  return terms.filter((term) => {
    if (category !== 'all' && term.category !== category) return false
    return matchesGlossaryQuery(term, query)
  })
}

export type GlossaryCategoryGroup = {
  category: GlossaryCategory
  label: string
  description: string
  terms: GlossaryTerm[]
}

// 카테고리 순서를 고정하고, 각 카테고리 안에서는 orderIndex -> 용어명으로 정렬한다.
export function groupGlossaryByCategory(terms: GlossaryTerm[]): GlossaryCategoryGroup[] {
  return GLOSSARY_CATEGORY_ORDER.map((category) => ({
    category,
    label: GLOSSARY_CATEGORY_LABEL[category],
    description: GLOSSARY_CATEGORY_DESCRIPTION[category],
    terms: terms
      .filter((term) => term.category === category)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.term.localeCompare(b.term, 'ko'))
  })).filter((group) => group.terms.length > 0)
}
