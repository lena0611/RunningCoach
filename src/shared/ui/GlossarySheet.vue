<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useGlossaryStore } from '@/app/stores/glossaryStore'
import {
  GLOSSARY_CATEGORY_LABEL,
  GLOSSARY_CATEGORY_ORDER,
  filterGlossaryTerms,
  groupGlossaryByCategory,
  type GlossaryCategory
} from '@/entities/glossary/model'
import ClearableField from '@/shared/ui/ClearableField.vue'
import SegmentTabs from '@/shared/ui/SegmentTabs.vue'
import StackPage from '@/shared/ui/StackPage.vue'

const props = defineProps<{ open: boolean; focusSlug?: string }>()
const emit = defineEmits<{ close: [] }>()

const glossaryStore = useGlossaryStore()
const query = ref('')
const activeCategory = ref<GlossaryCategory | 'all'>('all')
const highlightedSlug = ref('')
let highlightTimer: number | null = null

// 특정 용어로 진입(세션 카드 탭 등): 필터 초기화 후 해당 항목으로 스크롤 + 잠깐 하이라이트.
async function focusTerm(slug: string) {
  if (!slug) return
  query.value = ''
  activeCategory.value = 'all'
  await glossaryStore.load()
  await nextTick()
  const el = document.querySelector(`[data-glossary-slug="${slug}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  highlightedSlug.value = slug
  if (highlightTimer !== null) window.clearTimeout(highlightTimer)
  highlightTimer = window.setTimeout(() => {
    highlightedSlug.value = ''
    highlightTimer = null
  }, 2200)
}

watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle('memory-stack-open', open)
    if (open) {
      void glossaryStore.load()
      if (props.focusSlug) void focusTerm(props.focusSlug)
    } else {
      highlightedSlug.value = ''
    }
  }
)

// 시트가 이미 열린 상태에서 focusSlug가 바뀌면(다른 세션 카드 탭) 그 항목으로 이동.
watch(
  () => props.focusSlug,
  (slug) => {
    if (props.open && slug) void focusTerm(slug)
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
  if (highlightTimer !== null) window.clearTimeout(highlightTimer)
})

const categoryChips = computed(() => [
  { value: 'all' as const, label: '전체' },
  ...GLOSSARY_CATEGORY_ORDER.map((category) => ({ value: category, label: GLOSSARY_CATEGORY_LABEL[category] }))
])

const filteredGroups = computed(() =>
  groupGlossaryByCategory(
    filterGlossaryTerms(glossaryStore.terms, { query: query.value, category: activeCategory.value })
  )
)

const totalCount = computed(() => glossaryStore.terms.length)
const resultCount = computed(() => filteredGroups.value.reduce((sum, group) => sum + group.terms.length, 0))
</script>

<template>
  <StackPage
    :open="open"
    back
    title="용어 안내"
    dismiss-label="계정 정보로 돌아가기"
    content-class="glossary-content"
    @close="emit('close')"
  >
    <p class="helper glossary-intro">PaceLAB의 코칭·추세·기록 화면에서 쓰는 러닝 용어를 한곳에 모았습니다.</p>

    <div class="glossary-search">
      <ClearableField v-model="query" type="search" inputmode="search" placeholder="용어 검색 (예: 페이스, LTHR, 템포)" />
    </div>

    <SegmentTabs
      variant="chips"
      tone="accent"
      aria-label="용어 분류"
      :items="categoryChips"
      :active="activeCategory"
      @change="activeCategory = $event as GlossaryCategory | 'all'"
    />

    <p class="glossary-count helper">
      <template v-if="query.trim() || activeCategory !== 'all'">{{ resultCount }}개 표시 / 전체 {{ totalCount }}개</template>
      <template v-else>전체 {{ totalCount }}개 용어</template>
    </p>

    <p v-if="resultCount === 0" class="glossary-empty helper">검색 결과가 없습니다. 다른 단어로 찾아보세요.</p>

    <section v-for="group in filteredGroups" :key="group.category" class="glossary-group">
      <div class="glossary-group-heading">
        <h3>{{ group.label }}</h3>
        <p class="helper">{{ group.description }}</p>
      </div>
      <dl class="glossary-list">
        <div
          v-for="term in group.terms"
          :key="term.slug"
          class="glossary-term"
          :class="{ 'glossary-term-highlight': highlightedSlug === term.slug }"
          :data-glossary-slug="term.slug"
        >
          <dt>
            {{ term.term }}
            <span v-if="term.aka.length" class="glossary-aka">{{ term.aka.join(' · ') }}</span>
          </dt>
          <dd>
            <strong class="glossary-short">{{ term.shortDef }}</strong>
            <span class="glossary-detail">{{ term.detail }}</span>
          </dd>
        </div>
      </dl>
    </section>
  </StackPage>
</template>

<style scoped>
.glossary-intro {
  margin: 0;
}

.glossary-search {
  margin: 0;
}

.glossary-count {
  margin: 0;
}

.glossary-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.glossary-group-heading h3 {
  margin: 0;
  font-size: 1.02rem;
}

.glossary-group-heading .helper {
  margin: 2px 0 0;
}

.glossary-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.glossary-term {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px 18px;
  background: var(--color-surface);
  transition: border-color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease;
  scroll-margin-top: 16px;
}

.glossary-term-highlight {
  border-color: var(--color-accent, var(--color-primary));
  background: var(--color-accent-soft, var(--color-primary-soft));
  box-shadow: 0 0 0 2px var(--color-accent-soft, rgba(34, 160, 107, 0.2));
}

.glossary-term dt {
  font-weight: 700;
  font-size: 0.98rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.glossary-aka {
  font-weight: 500;
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}

.glossary-term dd {
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.glossary-short {
  font-size: 0.9rem;
}

.glossary-detail {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
  line-height: 1.5;
  white-space: pre-line; /* detail의 줄바꿈(왜/본질·유래/실행)을 그대로 렌더 */
}

.glossary-empty {
  margin: 8px 0;
}
</style>
