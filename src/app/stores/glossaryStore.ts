import { defineStore } from 'pinia'
import type { GlossaryTerm } from '@/entities/glossary/model'
import { GLOSSARY_FALLBACK_TERMS } from '@/entities/glossary/glossaryTerms'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { fetchGlossaryTerms } from '@/shared/api/glossaryRepository'

// 정본은 Supabase `glossary_terms` 시드다. Supabase 미설정/오프라인/조회 실패 시에는
// 번들 fallback으로 화면이 비지 않게 한다. DB 조회가 비어 있어도 fallback을 유지한다.
export const useGlossaryStore = defineStore('glossaryStore', {
  state: () => ({
    terms: [...GLOSSARY_FALLBACK_TERMS] as GlossaryTerm[],
    loading: false,
    loaded: false,
    usingFallback: true,
    error: '',
    // 다른 화면(세션 카드 등)에서 용어집을 특정 항목으로 열어달라는 요청. AppHeader가 소비한다.
    // null=요청 없음, ''=항목 지정 없이 열기, 'slug'=해당 항목으로 열고 스크롤.
    pendingOpenSlug: null as string | null
  }),
  actions: {
    /** 용어집 열기 요청(슬러그 지정 시 그 항목으로 포커스). */
    requestOpen(slug = '') {
      this.pendingOpenSlug = slug
    },
    clearPendingOpen() {
      this.pendingOpenSlug = null
    },
    async load(force = false) {
      if (this.loaded && !force) return
      this.error = ''
      if (!isSupabaseConfigured) {
        this.usingFallback = true
        this.loaded = true
        return
      }
      this.loading = true
      try {
        const terms = await fetchGlossaryTerms()
        if (terms.length > 0) {
          this.terms = terms
          this.usingFallback = false
        } else {
          this.terms = [...GLOSSARY_FALLBACK_TERMS]
          this.usingFallback = true
        }
        this.loaded = true
      } catch (err) {
        // 조회 실패 시 번들 fallback을 유지하고 조용히 사용 가능 상태로 둔다.
        this.terms = [...GLOSSARY_FALLBACK_TERMS]
        this.usingFallback = true
        this.error = err instanceof Error ? err.message : '용어를 불러오지 못했습니다.'
      } finally {
        this.loading = false
      }
    }
  }
})
