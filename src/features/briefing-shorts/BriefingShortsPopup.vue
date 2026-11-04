<script setup lang="ts">
/**
 * 브리핑 쇼츠 화면(#898) — 쇼츠식 9:16 틀(위 16% 타이틀 · 가운데 3D 무대 · 아래 20% 자막).
 *
 * 흐름(사용자 결정 2026-11-04):
 *  1. 러너가 달리고 있다. 러너(무대)를 탭하면 = 말을 걸면
 *  2. 감속해 서서 카메라를 보고, 문장마다 기기 TTS 로 읽으며 그 문장을 자막으로 띄운다
 *  3. 다 읽으면 돌아서 다시 달려 나간다. 카메라는 그 자리에서 바닥까지 내려가고, 팝업이 천천히 사라진다
 *  언제든 "건너뛰기"로 바로 닫는다. 다시 보기 입구는 없다(하루 한 번).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { TodayBriefingPayload } from '@/app/stores/briefingShortsStore'
import { buildBriefingScript } from './briefingScript'
import { sceneSfx } from './sceneOptions'
import { speak, stopSpeech, unlockSpeech } from './speech'
import type { BriefingScene, BriefingSceneOptions } from './scene/briefingScene'
import femaleModelUrl from './assets/female.vrm?url'
import maleModelUrl from './assets/male.vrm?url'

const props = defineProps<{
  payload: TodayBriefingPayload
  options: BriefingSceneOptions
  weatherChip: string
}>()

const emit = defineEmits<{
  ready: []
  failed: []
  done: []
}>()

/** 러너가 떠나기 시작해서 팝업이 사라지기 시작할 때까지 — 뒤로 돌기 1.1초 + 가속 1.4초 즈음(러너가 멀어지는 게 보인 뒤) */
const FADE_AFTER_RUN_OFF_MS = 2600
/** 팝업 전체가 사라지는 시간. 건너뛰기는 짧게 */
const FADE_OUT_MS = 1200
const SKIP_FADE_OUT_MS = 350
const LINE_GAP_MS = 250

type Phase = 'loading' | 'running' | 'stopping' | 'talking' | 'leaving'
const phase = ref<Phase>('loading')
const subtitle = ref('')
/** 사라지는 중이면 그 시간(ms). 다 사라진 뒤에야 done 을 보낸다 — 장면은 끝까지 그려야 같이 사라진다 */
const fadeMs = ref(0)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const abort = new AbortController()
let scene: BriefingScene | null = null
let finished = false

const script = computed(() =>
  buildBriefingScript({ title: props.payload.title, distanceKm: props.payload.distanceKm, briefing: props.payload.briefing })
)
const sfx = computed(() => sceneSfx(props.options.rn))
const subLine = computed(() =>
  [props.payload.distanceKm ? `${props.payload.distanceKm}km` : '', props.payload.metaLine].filter(Boolean).join(' · ')
)

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

onMounted(async () => {
  try {
    const { createBriefingScene } = await import('./scene/briefingScene.js')
    await nextTick()
    if (!canvasEl.value) throw new Error('canvas 없음')
    scene = await createBriefingScene({
      canvas: canvasEl.value,
      modelUrl: props.options.sx === 'f' ? femaleModelUrl : maleModelUrl,
      options: props.options,
      onReadyToTalk: () => void readAloud(),
      signal: abort.signal
    })
    phase.value = 'running'
    await nextPaint()
    emit('ready')
  } catch (error) {
    if (abort.signal.aborted) return
    console.warn('[briefing-shorts] 장면을 못 띄웠어요', error)
    emit('failed')
  }
})

function talk() {
  if (phase.value !== 'running' || !scene) return
  unlockSpeech() // iOS 는 탭 안에서 소리를 한 번 열어야 이후 발화가 난다
  phase.value = 'stopping'
  scene.beginTalk()
}

async function readAloud() {
  if (finished || !scene) return
  phase.value = 'talking'
  const lines = script.value
  for (let i = 0; i < lines.length; i++) {
    if (finished) return
    const last = i === lines.length - 1
    subtitle.value = lines[i].text
    await speak(lines[i].speech, () => scene?.setSpeech({ speaking: true, last }))
    scene?.setSpeech({ speaking: false, last })
    if (!last) await wait(LINE_GAP_MS)
  }
  if (finished) return
  subtitle.value = ''
  phase.value = 'leaving'
  scene.runOff()
  await wait(FADE_AFTER_RUN_OFF_MS)
  finish(FADE_OUT_MS)
}

/**
 * 팝업 전체를 페이드아웃하고, 완전히 투명해진 뒤 done(= 지우기).
 * 페이드를 바깥 <Transition> 에 맡기면 Vue 가 leave 시작과 동시에 이 컴포넌트를 언마운트해
 * 3D 캔버스(WebGL)가 먼저 꺼진다 — 시뮬레이터 녹화에서 장면만 툭 사라지는 걸로 확인(2026-11-04).
 */
function finish(ms = SKIP_FADE_OUT_MS) {
  if (finished) return
  finished = true
  stopSpeech()
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  fadeMs.value = reduce ? Math.min(ms, 300) : ms
  window.setTimeout(() => emit('done'), fadeMs.value)
}

onBeforeUnmount(() => {
  finished = true
  stopSpeech()
  abort.abort()
  scene?.dispose()
  scene = null
})
</script>

<template>
  <div
    class="briefing-shorts"
    :class="{ 'is-fading': fadeMs > 0 }"
    :style="fadeMs > 0 ? { transitionDuration: `${fadeMs}ms` } : undefined"
    role="dialog"
    aria-modal="true"
    aria-label="오늘 훈련 브리핑"
    data-no-swipe
  >
    <div class="briefing-shorts-frame">
      <header class="briefing-shorts-bar briefing-shorts-top">
        <p class="briefing-shorts-title">
          <span>오늘은 {{ payload.title }}</span><span class="briefing-shorts-sfx" aria-hidden="true">{{ sfx }}</span>
        </p>
        <p v-if="subLine || weatherChip" class="briefing-shorts-sub">
          <span v-if="weatherChip" class="briefing-shorts-chip">{{ weatherChip }}</span>
          <span v-if="subLine">{{ subLine }}</span>
        </p>
      </header>

      <div class="briefing-shorts-stage" @click="talk">
        <canvas ref="canvasEl" class="briefing-shorts-canvas" :class="{ on: phase !== 'loading' }" />
        <p v-if="phase === 'loading'" class="briefing-shorts-loading">러너가 오고 있어요…</p>
        <button
          v-if="phase === 'running'"
          class="briefing-shorts-talk"
          type="button"
          aria-label="러너에게 말 걸기"
          @click.stop="talk"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.5 11.6a8.4 8.4 0 0 1-12.2 7.5L3.5 20.5l1.4-4.6a8.4 8.4 0 1 1 15.6-4.3z" />
            <path d="M8.6 11.8h.01M12.1 11.8h.01M15.6 11.8h.01" />
          </svg>
        </button>
      </div>

      <footer class="briefing-shorts-bar briefing-shorts-bottom">
        <p class="briefing-shorts-subtitle" aria-live="polite">
          <template v-if="subtitle">{{ subtitle }}</template>
          <span v-else-if="phase === 'running'" class="briefing-shorts-hint">러너를 눌러 말 걸기</span>
        </p>
        <button v-if="phase !== 'leaving'" class="briefing-shorts-skip" type="button" @click="finish()">건너뛰기</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* 쇼츠 영상처럼 늘 어두운 한 톤. 틀 밖(세로가 긴 폰의 위아래)도 같은 검정으로 이어 붙인다 */
@font-face {
  font-family: 'East Sea Dokdo Briefing';
  src: url('/fonts/EastSeaDokdo-briefing.woff2') format('woff2');
  font-display: swap;
}

.briefing-shorts {
  transition: opacity ease;
  position: fixed;
  inset: 0;
  z-index: var(--z-briefing-shorts);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--briefing-shorts-frame);
  color: var(--briefing-shorts-ink);
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}

/* 사라지는 동안 3D 는 계속 그린다(러너가 멀어지는 게 같이 흐려진다). 시간은 인라인 transitionDuration */
.briefing-shorts.is-fading {
  opacity: 0;
  pointer-events: none;
}

.briefing-shorts-frame {
  display: flex;
  flex-direction: column;
  width: min(100vw, calc(100dvh * 9 / 16));
  aspect-ratio: 9 / 16;
  container-type: inline-size;
  overflow: hidden;
}

.briefing-shorts-bar {
  flex: 0 0 auto;
  box-sizing: border-box;
  padding: 0 6cqw;
}

.briefing-shorts-top {
  height: 16%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5cqw;
}

.briefing-shorts-title {
  margin: 0;
  font-family: 'East Sea Dokdo Briefing', var(--font-sans);
  font-size: 10cqw;
  line-height: 0.95;
  text-align: center;
  word-break: keep-all;
}

.briefing-shorts-sfx {
  margin-left: 2.5cqw;
  font-size: 14cqw;
  color: var(--briefing-shorts-accent);
}

.briefing-shorts-sub {
  margin: 0;
  display: flex;
  gap: 2cqw;
  font-size: max(var(--text-caption-size), 3.6cqw);
  color: var(--briefing-shorts-ink-soft);
}

.briefing-shorts-chip {
  color: var(--briefing-shorts-cool);
}

.briefing-shorts-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  cursor: pointer;
  background: var(--briefing-shorts-frame);
}

.briefing-shorts-canvas {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.briefing-shorts-canvas.on {
  opacity: 1;
}

.briefing-shorts-loading {
  position: absolute;
  inset: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--briefing-shorts-ink-dim);
  font-size: max(var(--text-caption-size), 4cqw);
}

/* 말 걸기: 영상 안 오른쪽 아래, 흰 선 아이콘만. 낮 배경에서도 보이게 옅은 그림자 */
.briefing-shorts-talk {
  position: absolute;
  right: 4cqw;
  bottom: 4cqw;
  width: max(44px, 11cqw);
  height: max(44px, 11cqw);
  padding: 0;
  background: none;
  border: 0;
  color: var(--briefing-shorts-ink);
  filter: drop-shadow(var(--shadow-text));
  animation: briefing-shorts-pulse 1.2s ease-in-out infinite;
}

.briefing-shorts-talk svg {
  display: block;
  width: 100%;
  height: 100%;
}

@keyframes briefing-shorts-pulse {
  50% {
    opacity: 0.4;
  }
}

.briefing-shorts-bottom {
  height: 20%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2cqw;
}

.briefing-shorts-subtitle {
  margin: 0;
  min-height: 2.8em;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: max(var(--text-body-size), 5cqw);
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
  word-break: keep-all;
}

.briefing-shorts-hint {
  color: var(--briefing-shorts-ink-dim);
  font-size: max(var(--text-caption-size), 4cqw);
}

.briefing-shorts-skip {
  align-self: flex-end;
  min-height: 44px;
  padding: 0 2cqw;
  background: none;
  border: 0;
  color: var(--briefing-shorts-ink-soft);
  font-size: max(var(--text-caption-size), 3.8cqw);
}

.briefing-shorts-talk:focus-visible,
.briefing-shorts-skip:focus-visible {
  outline: 2px solid var(--briefing-shorts-cool);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .briefing-shorts-talk {
    animation: none;
    opacity: 0.7;
  }
}
</style>
