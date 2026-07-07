<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SessionBriefing } from '@/shared/lib/coaching/sessionBriefing'
import EvidenceSheet from '@/shared/ui/EvidenceSheet.vue'

/**
 * 프리런 "작전 브리핑" 카드 (#370). 4요소(목표·효과·이행지침·조심할 점)를 보여주고,
 * 근거는 인라인이 아닌 "근거" 버튼 → EvidenceSheet 로만 노출(코칭 신뢰 원칙).
 * 액션: 이 훈련으로 갈게요 / 작전 바꾸기(쉽게·어렵게).
 */
const props = defineProps<{
  briefing: SessionBriefing
  sessionType: string
  ceilingText?: string | null
  busy?: boolean
  /** 한계 시험(TT) 세션이면 기본 액션을 '한계 도전으로 측정'으로 바꾼다(#411). */
  timeTrial?: boolean
  /** 이 세션 타입의 용어집 슬러그(있으면 제목 탭 → 훈련법 해설 열기). */
  methodSlug?: string
  /** 변경(쉽게/어렵게)된 세션이면 코치의 원래 제안 라벨(예: "Tempo 8km"). 있으면 원본 표시+되돌리기 노출. */
  originalLabel?: string | null
  /** 적격이면 '오후 이지 추가'(같은 날 더블, #455) 수동 진입 노출(결정 D — 미달이면 숨김). */
  canAddDouble?: boolean
}>()

const emit = defineEmits<{
  acknowledge: []
  'request-alternative': [direction: 'easier' | 'harder']
  'start-time-trial': []
  'open-method': []
  skip: []
  reschedule: []
  revert: []
  'add-double': []
}>()

const evidenceOpen = ref(false)
const hasEvidence = computed(() => props.briefing.evidence.length > 0)
</script>

<template>
  <article class="brief-card">
    <header class="brief-head">
      <span class="brief-eyebrow">📋 오늘의 작전</span>
      <span v-if="ceilingText" class="brief-badge">{{ ceilingText }}</span>
    </header>

    <button v-if="methodSlug" type="button" class="brief-title brief-title-button" @click="emit('open-method')">
      🏃 {{ sessionType }}<span class="brief-title-info" aria-hidden="true">ⓘ</span>
      <span class="sr-only">훈련법 설명 보기</span>
    </button>
    <strong v-else class="brief-title">🏃 {{ sessionType }}</strong>
    <p class="brief-goal">🎯 {{ briefing.goalLine }}</p>
    <p v-if="briefing.targetsLine" class="brief-goal">🎯 타겟 {{ briefing.targetsLine }}</p>

    <div v-if="originalLabel" class="brief-orig">
      <span class="brief-orig-text">원래 제안 <strong>{{ originalLabel }}</strong> · 변경됨</span>
      <button type="button" class="brief-revert" :disabled="busy" @click="emit('revert')">되돌리기</button>
    </div>

    <p v-if="briefing.keyPoint" class="brief-keypoint"><span class="brief-keypoint-tag">오늘의 핵심</span>{{ briefing.keyPoint }}</p>

    <div v-if="briefing.why" class="brief-block">
      <span class="brief-label">왜 오늘 이걸</span>
      <p class="brief-text">{{ briefing.why }}</p>
    </div>

    <div class="brief-block">
      <span class="brief-label">훈련 효과</span>
      <p class="brief-text">{{ briefing.effect }}</p>
    </div>

    <div class="brief-block">
      <span class="brief-label">어떻게 뛰나</span>
      <ul class="brief-list brief-lifecycle">
        <li v-for="(step, i) in briefing.execution" :key="i">
          <span class="brief-step-label">{{ step.label }}</span>
          <span class="brief-step-detail">{{ step.detail }}</span>
        </li>
      </ul>
      <p v-if="briefing.paceBasis" class="brief-pace-basis">{{ briefing.paceBasis }}</p>
    </div>

    <div v-if="briefing.successCriteria.length" class="brief-block">
      <span class="brief-label">성공 기준</span>
      <ul class="brief-list">
        <li v-for="(c, i) in briefing.successCriteria" :key="i">{{ c }}</li>
      </ul>
    </div>

    <div v-if="briefing.cautions.length" class="brief-block brief-caution">
      <span class="brief-label">⚠ 조심할 점</span>
      <ul class="brief-list">
        <li v-for="(c, i) in briefing.cautions" :key="i">{{ c }}</li>
      </ul>
    </div>

    <button v-if="hasEvidence" type="button" class="brief-evidence-btn" @click="evidenceOpen = true">
      ⓘ 이 코칭의 근거
    </button>

    <footer class="brief-actions">
      <template v-if="timeTrial">
        <button type="button" class="brief-primary" :disabled="busy" @click="emit('start-time-trial')">
          🏁 한계 도전으로 측정하기
        </button>
        <button type="button" class="brief-secondary" :disabled="busy" @click="emit('acknowledge')">
          오늘은 기록만(측정 생략)
        </button>
      </template>
      <template v-else>
        <button type="button" class="brief-primary" :disabled="busy" @click="emit('acknowledge')">
          이 훈련으로 갈게요
        </button>
        <div class="brief-alt">
          <button type="button" class="brief-secondary" :disabled="busy" @click="emit('request-alternative', 'easier')">
            더 쉽게
          </button>
          <button type="button" class="brief-secondary" :disabled="busy" @click="emit('request-alternative', 'harder')">
            더 강하게
          </button>
        </div>
        <div class="brief-alt">
          <button type="button" class="brief-secondary" :disabled="busy" @click="emit('reschedule')">
            📅 다른 날로
          </button>
          <button type="button" class="brief-secondary brief-skip" :disabled="busy" @click="emit('skip')">
            건너뛰기
          </button>
        </div>
        <button v-if="canAddDouble" type="button" class="brief-add-double" :disabled="busy" @click="emit('add-double')">
          ＋ 오후 이지 추가 (같은 날 더블)
        </button>
      </template>
    </footer>

    <EvidenceSheet :open="evidenceOpen" :evidence="briefing.evidence" @close="evidenceOpen = false" />
  </article>
</template>

<style scoped>
.brief-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
}

.brief-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brief-eyebrow {
  font-size: 12px;
  color: var(--color-muted);
  letter-spacing: 0.02em;
}

.brief-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
  color: var(--color-muted);
  border: 1px dashed currentColor;
}

.brief-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.brief-title-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 0;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
}

.brief-title-info {
  font-size: var(--text-caption-size);
  color: var(--color-primary);
  font-weight: 600;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.brief-goal {
  margin: 0;
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}

.brief-keypoint {
  margin: 4px 0 0;
  padding: 10px 12px;
  border-radius: var(--radius-button, 12px);
  background: var(--color-primary-soft, rgba(34, 160, 107, 0.12));
  border-left: 3px solid var(--color-primary);
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.brief-keypoint-tag {
  display: inline-block;
  margin-right: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
}

.brief-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brief-label {
  font-size: 12px;
  color: var(--color-muted);
}

.brief-text {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
}

.brief-list {
  margin: 0;
  padding-left: 1.1em;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
}

.brief-caution .brief-list {
  color: var(--color-text);
}

/* 라이프사이클(웜업→본훈련→쿨다운): 불릿 대신 단계 라벨 + 본문 2열. */
.brief-lifecycle {
  list-style: none;
  padding-left: 0;
  gap: 6px;
}

.brief-lifecycle li {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.brief-step-label {
  flex: 0 0 auto;
  min-width: 3.8em;
  font-weight: 700;
  font-size: 12px;
  color: var(--color-primary);
}

.brief-step-detail {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.brief-pace-basis {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--color-muted);
}

.brief-evidence-btn {
  align-self: flex-start;
  background: transparent;
  border: none;
  padding: 0;
  font-size: 12px;
  color: var(--color-primary);
  cursor: pointer;
}

.brief-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.brief-alt {
  display: flex;
  gap: 8px;
}

.brief-primary,
.brief-secondary {
  flex: 1;
  padding: 10px 12px;
  border-radius: var(--radius-button, 12px);
  font-size: var(--text-caption-size);
  font-weight: 600;
  cursor: pointer;
}

.brief-primary {
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  border: none;
}

.brief-secondary {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.3));
}

.brief-primary:disabled,
.brief-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}

.brief-orig {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
  padding: 8px 10px;
  border-radius: var(--radius-button, 12px);
  background: var(--color-field, rgba(120, 120, 120, 0.08));
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.18));
}

.brief-orig-text {
  font-size: 12px;
  color: var(--color-muted);
  min-width: 0;
  overflow-wrap: anywhere;
}

.brief-revert {
  flex: 0 0 auto;
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
}

.brief-revert:disabled {
  opacity: 0.5;
  cursor: default;
}

.brief-skip {
  color: var(--color-warning-text, var(--color-muted));
}

.brief-add-double {
  padding: 9px 12px;
  border-radius: var(--radius-button, 12px);
  border: 1px dashed var(--color-primary);
  background: var(--color-primary-soft, rgba(34, 160, 107, 0.1));
  color: var(--color-primary);
  font-size: var(--text-caption-size);
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}
.brief-add-double:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
