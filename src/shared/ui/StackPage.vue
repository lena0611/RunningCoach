<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * 화면 스택(stack) 공유 컴포넌트 (#275).
 *
 * 8+개 화면이 손으로 반복하던 `memory-stack-layer / memory-stack-page /
 * memory-stack-header / memory-stack-content` 마크업 + Teleport + Transition +
 * 헤더 버튼 규칙을 한 곳에 모은다. 전역 CSS(styles.css의 .memory-stack-*,
 * .stack-action-bar, .stack-page / .stack-page-up 트랜지션)를 그대로 재사용하므로
 * 클래스 이름 계약은 반드시 유지한다:
 *   - App.vue의 swipe 차단(`.memory-stack-layer` 감지)
 *   - RunDetailContent의 sticky 오프셋(`.memory-stack-page` / `.memory-stack-header` 조회)
 *
 * ui-guidelines 56/58/62/146(스택 패턴) · 64/144(FixedBottomCTA) ·
 * data-no-swipe 계약(38-39)을 컴포넌트 한 곳에서 강제한다.
 */
const props = withDefaults(
  defineProps<{
    /** 표시 여부. 내부 Transition(enter/leave)을 구동한다. */
    open: boolean
    /** 헤더 h2 타이틀. 커스텀 헤더가 필요하면 #title 슬롯 사용. */
    title?: string
    /**
     * 진입 트랜지션. 미지정 시 `back`으로 자동 결정한다(스택 등장 규칙):
     *  - 진입(첫 스택, back=false, 우상단 닫기 X) → 'rise' = 아래→위(stack-page-up)
     *  - 전진(상세→상세, back=true, 좌측 뒤로 ←) → 'push' = 우→좌(stack-page)
     * 명시하면 그 값을 강제한다.
     */
    transition?: 'push' | 'rise'
    /** true면 헤더 좌측 뒤로(chevron) 버튼, false면 우측 닫기(X) 버튼. */
    back?: boolean
    /** dismiss 버튼 노출 여부. false면 #actions 등 커스텀만 렌더. */
    dismissible?: boolean
    /** dismiss 버튼 aria-label. 기본: back이면 '뒤로', 아니면 '닫기'. */
    dismissLabel?: string
    /**
     * 우측에 액션 버튼을 2개 이상 둘 때(예: 설정+닫기) 헤더 그리드를
     * actions 레이아웃(.memory-stack-header-actions)으로 전환.
     */
    wideActions?: boolean
    /** 본문을 .memory-stack-content로 감싸지 않고 슬롯을 그리드 행에 직접 배치(예: RunDetailContent). */
    bare?: boolean
    /** .memory-stack-content 추가 클래스(예: glossary-content). */
    contentClass?: string
    /** .memory-stack-page 추가 클래스(예: memory-stack-detail). */
    pageClass?: string
    /** .memory-stack-layer 추가 클래스(예: stack-layer-top — 중첩 스택). */
    layerClass?: string
    /** 푸터(.stack-action-bar) 추가 클래스(예: run-detail-cta). */
    footerClass?: string
    /** Teleport 타깃. false면 Teleport를 비활성화(부모가 layer를 제공하는 경우). */
    teleport?: string | false
  }>(),
  {
    title: '',
    back: false,
    dismissible: true,
    dismissLabel: '',
    wideActions: false,
    bare: false,
    contentClass: '',
    pageClass: '',
    layerClass: '',
    footerClass: '',
    teleport: 'body'
  }
)

const emit = defineEmits<{ close: [] }>()

// 스택 등장 규칙: 명시값 우선, 없으면 back으로 결정 — 진입(back=false)=rise(밑→위), 전진(back=true)=push(우→좌).
const effectiveTransition = computed(() => props.transition ?? (props.back ? 'push' : 'rise'))
const transitionName = computed(() => (effectiveTransition.value === 'rise' ? 'stack-page-up' : 'stack-page'))
const leftButton = computed(() => props.dismissible && props.back)
const rightButton = computed(() => props.dismissible && !props.back)
const dismissAria = computed(() => props.dismissLabel || (props.back ? '뒤로' : '닫기'))

/** 본문 스크롤 컨테이너(예: 채팅 자동 스크롤이 필요한 화면에서 사용). */
const contentEl = ref<HTMLElement | null>(null)
defineExpose({ contentEl })
</script>

<template>
  <Teleport :to="teleport || 'body'" :disabled="teleport === false">
    <Transition :name="transitionName">
      <div v-if="open" class="memory-stack-layer" :class="layerClass" data-no-swipe>
        <section class="memory-stack-page" :class="pageClass">
          <header class="memory-stack-header" :class="{ 'memory-stack-header-actions': wideActions }">
            <!-- 좌측 뒤로 버튼: CSS :has(> .stack-icon-button:first-child)로 3열 그리드 전환되므로 반드시 첫 자식 -->
            <button
              v-if="leftButton"
              class="stack-icon-button"
              type="button"
              :aria-label="dismissAria"
              @click="emit('close')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>

            <div>
              <slot name="title">
                <h2 v-if="title">{{ title }}</h2>
              </slot>
            </div>

            <!-- 우측: 커스텀 액션 슬롯이 있으면 그것이, 없으면 기본 닫기(X) 버튼이 마지막 자식 -->
            <slot name="actions">
              <button
                v-if="rightButton"
                class="stack-icon-button"
                type="button"
                :aria-label="dismissAria"
                @click="emit('close')"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </slot>
          </header>

          <slot v-if="bare" />
          <main v-else ref="contentEl" class="memory-stack-content" :class="contentClass">
            <slot />
          </main>

          <footer v-if="$slots.footer" class="stack-action-bar" :class="footerClass">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
