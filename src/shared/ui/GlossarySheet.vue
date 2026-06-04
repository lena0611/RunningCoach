<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useGlossaryStore } from '@/app/stores/glossaryStore'
import {
  GLOSSARY_CATEGORY_LABEL,
  GLOSSARY_CATEGORY_ORDER,
  filterGlossaryTerms,
  groupGlossaryByCategory,
  type GlossaryCategory
} from '@/entities/glossary/model'
import ClearableField from '@/shared/ui/ClearableField.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const glossaryStore = useGlossaryStore()
const query = ref('')
const activeCategory = ref<GlossaryCategory | 'all'>('all')

watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle('memory-stack-open', open)
    if (open) void glossaryStore.load()
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
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
  <Teleport to="body">
    <Transition name="stack-page">
      <div v-if="open" class="memory-stack-layer" data-no-swipe>
        <section class="memory-stack-page">
          <header class="memory-stack-header">
            <button class="stack-icon-button" type="button" aria-label="계정 정보로 돌아가기" @click="emit('close')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <h2>용어 안내</h2>
            </div>
          </header>

          <main class="memory-stack-content glossary-content">
            <p class="helper glossary-intro">PaceLAB의 코칭·추세·기록 화면에서 쓰는 러닝 용어를 한곳에 모았습니다.</p>

            <div class="glossary-search">
              <ClearableField v-model="query" type="search" inputmode="search" placeholder="용어 검색 (예: 페이스, LTHR, 템포)" />
            </div>

            <div class="glossary-chips" role="tablist" aria-label="용어 분류">
              <button
                v-for="chip in categoryChips"
                :key="chip.value"
                class="glossary-chip"
                :class="{ active: activeCategory === chip.value }"
                type="button"
                role="tab"
                :aria-selected="activeCategory === chip.value"
                @click="activeCategory = chip.value"
              >
                {{ chip.label }}
              </button>
            </div>

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
                <div v-for="term in group.terms" :key="term.slug" class="glossary-term">
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
          </main>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.glossary-content {
  gap: 18px;
  padding-top: 20px;
}

.glossary-intro {
  margin: 0;
}

.glossary-search {
  margin: 0;
}

.glossary-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.glossary-chip {
  border: 1px solid var(--color-border);
  background: var(--color-subtle);
  color: var(--color-muted);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.82rem;
  cursor: pointer;
}

.glossary-chip.active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-text);
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
  font-size: 0.74rem;
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
  font-size: 0.86rem;
  color: var(--color-muted);
  line-height: 1.5;
}

.glossary-empty {
  margin: 8px 0;
}
</style>
