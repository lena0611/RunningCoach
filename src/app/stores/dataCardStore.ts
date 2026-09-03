import { defineStore } from 'pinia'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import {
  deleteUserDataCard,
  fetchUserDataCards,
  insertUserDataCard,
  type UserDataCard,
  type UserDataCardDraft
} from '@/shared/api/dataCardRepository'
import { computeDataCardFromRuns, type DataCardRunInput, type DataCardValue } from '@/shared/lib/coaching/dataCardAdapter'

/**
 * 요약 탭 사용자 정의 데이터 카드(#767).
 *
 * 값 계산은 **여기서 하지 않는다** — 스토어는 스펙만 갖고 있고, 숫자는 화면이 그릴 때 러닝을 넘겨
 * 코어(Edge 와 같은 파일)로 뽑는다. 그래야 코치 답변과 카드가 같은 계산을 쓴다.
 */
export const useDataCardStore = defineStore('dataCardStore', {
  state: () => ({
    cards: [] as UserDataCard[],
    loaded: false,
    loading: false,
    saving: false
  }),
  actions: {
    async load() {
      if (!isSupabaseConfigured || this.loading) return
      this.loading = true
      try {
        this.cards = await fetchUserDataCards()
        this.loaded = true
      } catch {
        // 카드는 부가 정보다 — 못 불러와도 요약 탭 자체는 열려야 한다.
        this.cards = []
      } finally {
        this.loading = false
      }
    },
    async add(draft: Omit<UserDataCardDraft, 'position'>): Promise<UserDataCard | null> {
      if (!isSupabaseConfigured || this.saving) return null
      this.saving = true
      try {
        const position = this.cards.length
        const card = await insertUserDataCard({ ...draft, position })
        this.cards = [...this.cards, card]
        return card
      } finally {
        this.saving = false
      }
    },
    async remove(id: string) {
      if (!isSupabaseConfigured) return
      await deleteUserDataCard(id)
      this.cards = this.cards.filter((card) => card.id !== id)
    }
  }
})

/** 카드 값 계산 — 화면이 러닝을 넘긴다. 순수 함수라 스토어 상태를 건드리지 않는다. */
export function valueOfCard(card: UserDataCard, runs: DataCardRunInput[]): DataCardValue {
  return computeDataCardFromRuns(card.spec, runs)
}
