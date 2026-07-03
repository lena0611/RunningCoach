<script setup lang="ts">
/**
 * 오늘의 처방 히어로 배경 삽화 (리디자인 ①b — 디자인 핸드오프 Row6 확정 SVG 세트 이식).
 * 추상 라인/모티프가 카드 우하단(토픽별 위치)에 깔려 카드만 봐도 세션 성격이 읽히게 한다.
 * 색은 currentColor 단일 — 토픽별 색은 이 컴포넌트의 클래스가 타입 색 토큰으로 지정한다.
 * (히어로 엠블럼(포어그라운드) 대안은 미채택 — 배경 모티프만.)
 */
export type HeroIllustrationTopic = 'easy' | 'tempo' | 'lsd' | 'interval' | 'recovery' | 'race'

defineProps<{ topic: HeroIllustrationTopic }>()
</script>

<template>
  <svg class="hero-illustration" :class="`hero-illustration-${topic}`" viewBox="0 0 220 170" aria-hidden="true">
    <!-- Easy · 물결 + 잎 -->
    <template v-if="topic === 'easy'">
      <path d="M-10 122 Q45 100 100 116 T240 106" fill="none" stroke="currentColor" stroke-width="2" opacity=".5" />
      <path d="M-10 138 Q45 116 100 132 T240 122" fill="none" stroke="currentColor" stroke-width="2" opacity=".28" />
      <path d="M162 30c33 2 48 22 46 55-33-2-48-22-46-55z" fill="currentColor" fill-opacity=".18" />
      <path d="M171 42c16 7 25 20 29 38" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".45" />
    </template>
    <!-- Tempo · 속도선 + 전진 셰브론 -->
    <template v-else-if="topic === 'tempo'">
      <g stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".5">
        <path d="M110 34h78" />
        <path d="M126 56h64" />
        <path d="M100 78h92" />
        <path d="M136 100h54" />
      </g>
      <path d="M132 122l22 14-22 14zM160 122l22 14-22 14z" fill="currentColor" fill-opacity=".32" />
    </template>
    <!-- LSD · 지평선까지 굽은 길 + 해 -->
    <template v-else-if="topic === 'lsd'">
      <circle cx="168" cy="40" r="20" fill="currentColor" fill-opacity=".22" />
      <path d="M40 168 C74 128 128 156 140 100 S164 60 208 58" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".5" />
      <path d="M54 168 C88 132 134 158 146 104" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".28" />
    </template>
    <!-- Interval · 반복 트랙 바 + 번개 -->
    <template v-else-if="topic === 'interval'">
      <g fill="currentColor" fill-opacity=".26">
        <rect x="120" y="74" width="12" height="70" rx="3" />
        <rect x="140" y="44" width="12" height="100" rx="3" />
        <rect x="160" y="86" width="12" height="58" rx="3" />
        <rect x="180" y="54" width="12" height="90" rx="3" />
        <rect x="200" y="94" width="12" height="50" rx="3" />
      </g>
      <path d="M150 24l-12 20h10l-3 16 13-22h-9z" fill="currentColor" fill-opacity=".65" />
    </template>
    <!-- Recovery · 잔잔한 달 + 밤 -->
    <template v-else-if="topic === 'recovery'">
      <path d="M188 34a22 22 0 1 1-16-8 17 17 0 0 0 16 8z" fill="currentColor" fill-opacity=".22" />
      <g fill="currentColor" fill-opacity=".45">
        <circle cx="120" cy="96" r="2" />
        <circle cx="146" cy="118" r="2.5" />
        <circle cx="176" cy="104" r="2" />
        <circle cx="134" cy="80" r="1.6" />
      </g>
    </template>
    <!-- Race · 결승선 + 깃발 -->
    <template v-else>
      <g fill="currentColor" fill-opacity=".24">
        <rect x="126" y="74" width="13" height="13" />
        <rect x="152" y="74" width="13" height="13" />
        <rect x="139" y="87" width="13" height="13" />
        <rect x="165" y="87" width="13" height="13" />
        <rect x="126" y="100" width="13" height="13" />
        <rect x="152" y="100" width="13" height="13" />
      </g>
      <path d="M182 40v76M182 44h28l-5 9 5 9h-28" fill="none" stroke="currentColor" stroke-width="2.2" opacity=".55" />
    </template>
  </svg>
</template>

<style scoped>
/* 카드 우하단 기본 배치. 본문(.hero-body 텍스트 max-width)과 겹치지 않게 pointer-events 차단. */
.hero-illustration {
  position: absolute;
  right: -6px;
  bottom: -8px;
  width: 220px;
  max-width: 62%;
  height: auto;
  pointer-events: none;
  color: var(--color-primary);
}

/* 토픽별 색(타입 토큰) + 디자인 확정 위치(Row6). */
.hero-illustration-tempo {
  right: -4px;
  top: 6px;
  bottom: auto;
  width: 210px;
  color: var(--color-perf);
}
.hero-illustration-lsd {
  right: -8px;
  bottom: -10px;
  color: var(--color-warning);
}
.hero-illustration-interval {
  right: -4px;
  bottom: 0;
  width: 210px;
  color: var(--color-warning);
}
.hero-illustration-recovery {
  right: 2px;
  top: 6px;
  bottom: auto;
  width: 200px;
  color: var(--color-accent);
}
.hero-illustration-race {
  right: -6px;
  bottom: -6px;
  width: 210px;
  color: var(--color-race);
}
</style>
