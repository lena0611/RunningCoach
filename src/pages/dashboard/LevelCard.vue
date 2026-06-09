<script setup lang="ts">
import { computed } from 'vue'
import { runnerProgressLabel, type RunnerProgress } from '@/shared/lib/level/levelModel'

const props = defineProps<{ progress: RunnerProgress; hideEyebrow?: boolean }>()

const label = computed(() => runnerProgressLabel(props.progress))

// VO2max 추정 기반이면 '추정' 배지. 측정(PB)·미산정은 배지 없음(아래 문구로 안내).
const estimated = computed(() => props.progress.confidence === 'estimate')

// 현재 등급 안에서 다음 등급까지의 진행률(%).
const gradePercent = computed(() => {
  const p = props.progress
  if (!p.grade || !p.nextGrade || p.vdot === null) return null
  const span = p.nextGrade.minVdot - p.grade.minVdot
  if (span <= 0) return 100
  return Math.max(0, Math.min(100, Math.round(((p.vdot - p.grade.minVdot) / span) * 100)))
})

const gradeLine = computed(() => {
  const p = props.progress
  if (p.vdot === null) return '최근 기록/PB를 입력하면 등급이 정해져요'
  if (!p.nextGrade) return `최고 등급 · VDOT ${p.vdot}`
  return `${p.grade?.label} → ${p.nextGrade.label} · VDOT ${p.vdot} (+${p.vdotToNextGrade})`
})
</script>

<template>
  <article class="level-card">
    <header class="level-card-head">
      <span v-if="!hideEyebrow" class="level-eyebrow">내 레벨</span>
      <div class="level-identity">
        <strong class="level-label">{{ label }}</strong>
        <span v-if="progress.provisional" class="level-badge">잠정</span>
        <span v-if="estimated" class="level-badge">추정</span>
      </div>
    </header>

    <div class="level-row">
      <div class="level-row-head">
        <span>등급</span>
        <small>{{ gradeLine }}</small>
      </div>
      <div v-if="gradePercent !== null" class="gauge">
        <span class="gauge-fill" :style="{ width: `${gradePercent}%` }" />
      </div>
    </div>

    <div v-if="progress.nextClass && progress.gate1" class="level-row">
      <div class="level-row-head">
        <span>{{ progress.nextClass.label }} 도전 자격</span>
        <small :class="{ 'level-ok': progress.gate1.eligible }">
          {{ progress.gate1.eligible ? '🔓 도전 가능' : `${progress.gate1.percent}%` }}
        </small>
      </div>
      <div class="gauge">
        <span
          class="gauge-fill"
          :class="{ 'gauge-fill-ok': progress.gate1.eligible }"
          :style="{ width: `${progress.gate1.percent}%` }"
        />
      </div>
      <small v-if="!progress.gate1.eligible && progress.gate1.reasons.length" class="level-hint">
        {{ progress.gate1.reasons.join(' · ') }}
      </small>
      <small v-if="progress.gate1.hardWarn" class="level-warn">
        ⚠️ 풀마라톤은 부상 위험이 커요 — 충분히 준비한 뒤 도전하세요
      </small>
    </div>
    <p v-else class="level-hint">최고 거리 클래스 달성 — 풀 러너 🏅</p>

    <p v-if="progress.maintenanceDue" class="level-hint level-maintenance">
      폼 점검 권장 — 타임트라이얼로 등급을 갱신하세요(유지 퀘스트)
    </p>
  </article>
</template>

<style scoped>
.level-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: var(--space-4, 16px);
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
}

.level-card-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.level-eyebrow {
  font-size: 12px;
  color: var(--color-muted);
  letter-spacing: 0.02em;
}

.level-identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.level-label {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.level-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
  color: var(--color-muted);
  border: 1px dashed currentColor;
}

.level-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.level-row-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text);
}

.level-row-head small {
  color: var(--color-muted);
  font-size: 12px;
  text-align: right;
}

.level-ok {
  color: #22a06b;
  font-weight: 600;
}

.gauge {
  height: 8px;
  border-radius: 999px;
  background: rgba(120, 120, 120, 0.18);
  overflow: hidden;
}

.gauge-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.gauge-fill-ok {
  background: #22a06b;
}

.level-hint {
  font-size: 12px;
  color: var(--color-muted);
  margin: 0;
}

.level-warn {
  font-size: 12px;
  color: #c2710c;
}

.level-maintenance {
  padding-top: 2px;
}
</style>
