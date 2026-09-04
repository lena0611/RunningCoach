import { defineStore } from 'pinia'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { fetchSummaryLayout, saveSummaryLayout } from '@/shared/api/summaryLayoutRepository'
import { orderSummaryCards, SUMMARY_DEFAULT_HIDDEN } from '@/pages/dashboard/summaryBlocks'

/**
 * 요약 탭 구성(#767 후속) — 무엇을 보이고 어떤 순서로 둘지.
 *
 * `edited` 가 false 면 **코드 기본값**을 쓴다. 저장된 행이 있는 사용자만 그 값을 따른다 —
 * 그래야 나중에 기본 카드를 추가해도 자동으로 보이고, 아무도 시드가 필요 없다.
 *
 * 저장은 편집할 때마다 즉시 한다(별도 저장 버튼 없음). 화면은 낙관적으로 먼저 바뀌고,
 * 실패하면 되돌린다 — 토글 하나 누를 때마다 스피너를 보는 건 편집이 아니라 심문이다.
 */
export const useSummaryLayoutStore = defineStore('summaryLayoutStore', {
  state: () => ({
    hidden: [...SUMMARY_DEFAULT_HIDDEN] as string[],
    cardOrder: [] as string[],
    edited: false,
    loaded: false,
    loading: false
  }),
  getters: {
    isVisible: (state) => (id: string) => !state.hidden.includes(id)
  },
  actions: {
    async load() {
      if (!isSupabaseConfigured || this.loading) return
      this.loading = true
      try {
        const layout = await fetchSummaryLayout()
        if (layout) {
          this.hidden = layout.hidden
          this.cardOrder = layout.cardOrder
          this.edited = true
        }
        this.loaded = true
      } catch {
        // 구성은 부가 정보다 — 못 불러와도 요약 탭은 기본값으로 열려야 한다.
      } finally {
        this.loading = false
      }
    },
    /** 저장된 순서를 카드 목록에 입힌다(모르는 id 는 뒤에 기본 순서로). */
    orderedCardIds(customCardIds: string[]): string[] {
      return orderSummaryCards(customCardIds, this.cardOrder)
    },
    /** 다시 붙이기 — **맨 뒤**로 보낸다. 사용자가 방금 고른 것이 어디 갔는지 찾게 하면 안 된다. */
    async show(id: string, customCardIds: string[]) {
      const beforeHidden = [...this.hidden]
      const beforeOrder = [...this.cardOrder]
      this.hidden = this.hidden.filter((item) => item !== id)
      const ordered = this.orderedCardIds(customCardIds)
      if (ordered.includes(id)) this.cardOrder = [...ordered.filter((item) => item !== id), id]
      if (!(await this.persist())) {
        this.hidden = beforeHidden
        this.cardOrder = beforeOrder
      }
    },
    async toggle(id: string) {
      const before = [...this.hidden]
      this.hidden = this.hidden.includes(id) ? this.hidden.filter((item) => item !== id) : [...this.hidden, id]
      if (!(await this.persist())) this.hidden = before
    },
    async persist(): Promise<boolean> {
      if (!isSupabaseConfigured) return true
      try {
        await saveSummaryLayout({ hidden: this.hidden, cardOrder: this.cardOrder })
        this.edited = true
        return true
      } catch {
        return false
      }
    }
  }
})
