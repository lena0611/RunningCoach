<script setup lang="ts">
import type { LevelUpEvent } from '@/shared/lib/level/levelModel'

defineProps<{ events: LevelUpEvent[]; coins: number }>()
defineEmits<{ (e: 'dismiss'): void }>()

function headline(kind: LevelUpEvent['kind']): string {
  return kind === 'class' ? '전직' : '등급 업'
}
</script>

<template>
  <div class="celebration" role="dialog" aria-modal="true" aria-label="레벨업 축하">
    <div class="celebration-card">
      <p class="celebration-emoji">🎉</p>
      <h2 class="celebration-title">
        {{ events.map((event) => headline(event.kind)).join(' + ') }}!
      </h2>
      <div class="celebration-badges">
        <span v-for="event in events" :key="event.kind + event.toKey" class="celebration-badge">
          {{ event.toLabel }}
        </span>
      </div>
      <p class="celebration-reward">+{{ coins }} 🪙</p>
      <button class="celebration-cta" type="button" @click="$emit('dismiss')">계속</button>
    </div>
  </div>
</template>

<style scoped>
.celebration {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.6);
}

.celebration-card {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  padding: 28px 24px;
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-float, 0 12px 40px rgba(0, 0, 0, 0.4));
}

.celebration-emoji {
  font-size: 40px;
  margin: 0;
}

.celebration-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
  margin: 0;
}

.celebration-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.celebration-badge {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary);
  padding: 8px 16px;
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-card, 20px);
}

.celebration-reward {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  margin: 4px 0 0;
}

.celebration-cta {
  margin-top: 8px;
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 14px;
  background: var(--color-primary);
  color: #08130d;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
</style>
