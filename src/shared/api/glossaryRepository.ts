import { requireSupabase } from '@/shared/api/supabase'
import type { GlossaryCategory, GlossaryTerm } from '@/entities/glossary/model'

type GlossaryRow = {
  id: string
  slug: string
  term: string
  aka: string[] | null
  category: string
  short_def: string
  detail: string
  related_slugs: string[] | null
  order_index: number
}

export async function fetchGlossaryTerms(): Promise<GlossaryTerm[]> {
  const { data, error } = await requireSupabase()
    .from('glossary_terms')
    .select('*')
    .eq('approved', true)
    .order('category')
    .order('order_index')

  if (error) throw error
  return (data ?? []).map(fromRow)
}

function fromRow(row: GlossaryRow): GlossaryTerm {
  return {
    id: row.id,
    slug: row.slug,
    term: row.term,
    aka: row.aka ?? [],
    category: row.category as GlossaryCategory,
    shortDef: row.short_def,
    detail: row.detail,
    relatedSlugs: row.related_slugs ?? [],
    orderIndex: row.order_index
  }
}
