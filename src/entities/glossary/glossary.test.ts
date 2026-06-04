import { describe, expect, it } from 'vitest'
import {
  GLOSSARY_CATEGORY_LABEL,
  GLOSSARY_CATEGORY_ORDER,
  filterGlossaryTerms,
  groupGlossaryByCategory,
  matchesGlossaryQuery,
  type GlossaryTerm
} from '@/entities/glossary/model'
import { GLOSSARY_FALLBACK_TERMS } from '@/entities/glossary/glossaryTerms'

const sample: GlossaryTerm[] = [
  {
    id: 'pace',
    slug: 'pace',
    term: '페이스',
    aka: ['pace', '분/km'],
    category: 'basics',
    shortDef: '1km를 달리는 데 걸리는 시간.',
    detail: '숫자가 작을수록 빠릅니다.',
    relatedSlugs: [],
    orderIndex: 10
  },
  {
    id: 'lthr',
    slug: 'lthr',
    term: '역치심박 (LTHR)',
    aka: ['lthr', '역치'],
    category: 'heart_rate',
    shortDef: '젖산이 쌓이기 시작하는 심박.',
    detail: '30분 단독주 마지막 20분 평균.',
    relatedSlugs: [],
    orderIndex: 10
  }
]

describe('matchesGlossaryQuery', () => {
  it('빈 검색어는 모든 용어를 통과시킨다', () => {
    expect(matchesGlossaryQuery(sample[0], '')).toBe(true)
    expect(matchesGlossaryQuery(sample[0], '   ')).toBe(true)
  })

  it('용어명·동의어·정의를 대소문자/공백 무시로 검색한다', () => {
    expect(matchesGlossaryQuery(sample[1], 'LTHR')).toBe(true)
    expect(matchesGlossaryQuery(sample[1], '역치')).toBe(true)
    expect(matchesGlossaryQuery(sample[0], '걸리는 시간')).toBe(true)
    expect(matchesGlossaryQuery(sample[0], 'cadence')).toBe(false)
  })
})

describe('filterGlossaryTerms', () => {
  it('카테고리로 필터한다', () => {
    const result = filterGlossaryTerms(sample, { category: 'heart_rate' })
    expect(result.map((term) => term.slug)).toEqual(['lthr'])
  })

  it("'all' 카테고리는 모두 포함한다", () => {
    expect(filterGlossaryTerms(sample, { category: 'all' })).toHaveLength(2)
  })

  it('카테고리와 검색을 함께 적용한다', () => {
    expect(filterGlossaryTerms(sample, { category: 'basics', query: 'lthr' })).toHaveLength(0)
    expect(filterGlossaryTerms(sample, { category: 'basics', query: '페이스' })).toHaveLength(1)
  })
})

describe('groupGlossaryByCategory', () => {
  it('정의된 카테고리 순서를 유지하고 빈 그룹은 제거한다', () => {
    const groups = groupGlossaryByCategory(sample)
    expect(groups.map((group) => group.category)).toEqual(['basics', 'heart_rate'])
  })

  it('카테고리 안에서 orderIndex로 정렬한다', () => {
    const terms: GlossaryTerm[] = [
      { ...sample[0], slug: 'b', orderIndex: 20 },
      { ...sample[0], slug: 'a', orderIndex: 10 }
    ]
    const [group] = groupGlossaryByCategory(terms)
    expect(group.terms.map((term) => term.slug)).toEqual(['a', 'b'])
  })
})

describe('GLOSSARY_FALLBACK_TERMS 정합성', () => {
  it('slug가 중복되지 않는다', () => {
    const slugs = GLOSSARY_FALLBACK_TERMS.map((term) => term.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('모든 용어는 정의된 카테고리에 속한다', () => {
    for (const term of GLOSSARY_FALLBACK_TERMS) {
      expect(GLOSSARY_CATEGORY_ORDER).toContain(term.category)
    }
  })

  it('필수 텍스트 필드가 비어 있지 않다', () => {
    for (const term of GLOSSARY_FALLBACK_TERMS) {
      expect(term.term.trim().length).toBeGreaterThan(0)
      expect(term.shortDef.trim().length).toBeGreaterThan(0)
      expect(term.detail.trim().length).toBeGreaterThan(0)
    }
  })

  it('relatedSlugs는 존재하는 slug만 가리킨다', () => {
    const slugs = new Set(GLOSSARY_FALLBACK_TERMS.map((term) => term.slug))
    for (const term of GLOSSARY_FALLBACK_TERMS) {
      for (const related of term.relatedSlugs) {
        expect(slugs.has(related)).toBe(true)
      }
    }
  })

  it('모든 카테고리 라벨이 정의돼 있다', () => {
    for (const category of GLOSSARY_CATEGORY_ORDER) {
      expect(GLOSSARY_CATEGORY_LABEL[category]).toBeTruthy()
    }
  })
})
