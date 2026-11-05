<script setup lang="ts">
/**
 * 브리핑 쇼츠 화면(#898) — 쇼츠식 9:16 틀(위 16% 타이틀 · 가운데 3D 무대 · 아래 20% 자막).
 *
 * 흐름(사용자 결정 2026-11-05 — 말 걸기 탭은 없앴다):
 *  1. 카메라는 길에 서 있고, 러너가 멀리서 카메라 쪽으로 달려온다
 *  2. 다가오면 카메라맨이 5m 앞에서 뒤돌아 찍으며 같이 뛴다 — 이때부터 문장마다 기기 TTS 로 읽고 그 문장을 자막으로 띄운다
 *  3. 다 읽으면 카메라맨이 서서히 멈추고, 옆을 지나 멀어지는 러너를 바라보며 살짝 내려간다. 그사이 팝업이 천천히 사라진다
 *  언제든 "건너뛰기"로 바로 닫는다. 다시 보기 입구는 없다(하루 한 번).
 *
 * 쇼츠처럼(사용자 결정 2026-11-05): 영상 오른쪽 아래에 아이콘 줄(날씨 · 체감온도 · 건너뛰기, 예전 말 걸기 자리),
 * 오른쪽 위에 스피커. 소리는 기본 끔(자막만) — 스피커를 누르면 읽던 문장부터 목소리로 다시 읽는다.
 * 설정 '소리 켜고 시작'이면 켜진 채로 시작한다(무음 스위치는 따른다). 직접 눌러 켜면 무음 모드여도 들린다.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { TodayBriefingPayload } from '@/app/stores/briefingShortsStore'
import { useSettingsStore } from '@/app/stores/settingsStore'
import { buildBriefingScript, type ScriptLine } from './briefingScript'
import { sceneSfx, weatherBadge, type BriefingWeather } from './sceneOptions'
import { speak, stopSpeech, unlockSpeech } from './speech'
import type { BriefingScene, BriefingSceneOptions } from './scene/briefingScene'
import femaleModelUrl from './assets/female.vrm?url'
import maleModelUrl from './assets/male.vrm?url'

const props = defineProps<{
  payload: TodayBriefingPayload
  options: BriefingSceneOptions
  weather: BriefingWeather | null
}>()

const emit = defineEmits<{
  ready: []
  failed: []
  done: []
}>()

/** 다 읽은 뒤 팝업이 사라지기 시작할 때까지 — 카메라맨이 서는 동안(2.4초) 러너가 옆을 지나(~3초) 멀어지는 뒷모습까지 */
const FADE_AFTER_FINISH_MS = 4800
/** 팝업 전체가 사라지는 시간. 건너뛰기는 짧게 */
const FADE_OUT_MS = 1200
const SKIP_FADE_OUT_MS = 350
const LINE_GAP_MS = 250

type Phase = 'loading' | 'approaching' | 'talking' | 'leaving'
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
const badge = computed(() => weatherBadge(props.weather, props.options.wx, props.options.tm))
const feltC = computed(() => props.weather?.feltC ?? null)

const settingsStore = useSettingsStore()
/** 이번 영상의 소리. 시작값 = 설정, 스피커를 누르면 이번에만 바뀐다 */
const soundOn = ref(settingsStore.briefingSound)
/** 사용자가 스피커를 직접 눌러 켰다 → 앱은 무음 스위치를 넘어 들려준다 */
let loud = false
/** 읽던 문장을 새 소리 상태로 처음부터 다시 */
let restartLine: (() => void) | null = null
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
    phase.value = 'approaching'
    await nextPaint()
    emit('ready')
  } catch (error) {
    if (abort.signal.aborted) return
    console.warn('[briefing-shorts] 장면을 못 띄웠어요', error)
    emit('failed')
  }
})

/** 한 문장: 소리 상태대로 읽는다(끔이면 자막 길이만큼). 도중에 스피커를 누르면 그 문장을 새 상태로 다시 */
async function sayLine(line: ScriptLine, last: boolean) {
  for (;;) {
    let again = false
    const restarted = new Promise<void>((resolve) => {
      restartLine = () => {
        again = true
        resolve()
      }
    })
    await Promise.race([speak(line.speech, () => scene?.setSpeech({ speaking: true, last }), { muted: !soundOn.value, loud }), restarted])
    restartLine = null
    if (!again || finished) return
    stopSpeech()
  }
}

function toggleSound() {
  soundOn.value = !soundOn.value
  if (soundOn.value) {
    loud = true
    unlockSpeech() // 브라우저는 이 탭 안에서 소리를 열어야 이후 발화가 난다
  }
  restartLine?.()
}

async function readAloud() {
  if (finished || !scene) return
  phase.value = 'talking'
  const lines = script.value
  for (let i = 0; i < lines.length; i++) {
    if (finished) return
    const last = i === lines.length - 1
    subtitle.value = lines[i].text
    await sayLine(lines[i], last)
    scene?.setSpeech({ speaking: false, last })
    if (!last) await wait(LINE_GAP_MS)
  }
  if (finished) return
  subtitle.value = ''
  phase.value = 'leaving'
  scene.finish()
  await wait(FADE_AFTER_FINISH_MS)
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
        <p v-if="subLine" class="briefing-shorts-sub">{{ subLine }}</p>
      </header>

      <div class="briefing-shorts-stage">
        <canvas ref="canvasEl" class="briefing-shorts-canvas" :class="{ on: phase !== 'loading' }" />
        <p v-if="phase === 'loading'" class="briefing-shorts-loading">러너가 오고 있어요…</p>

        <!-- 스피커(오른쪽 위): 기본 끔 — 누르면 읽던 문장부터 목소리로 -->
        <button
          v-if="phase !== 'loading'"
          class="briefing-shorts-sound"
          type="button"
          :aria-label="soundOn ? '소리 끄기' : '소리 켜기'"
          :aria-pressed="soundOn"
          @click="toggleSound"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
            <template v-if="soundOn">
              <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
              <path d="M18.2 6.5a8 8 0 0 1 0 11" />
            </template>
            <template v-else>
              <path d="M16 9.5l5 5M21 9.5l-5 5" />
            </template>
          </svg>
        </button>

        <!-- 아이콘 줄(쇼츠 오른쪽 레일, 예전 말 걸기 자리): 날씨 · 체감온도 · 건너뛰기 -->
        <div v-if="phase !== 'loading'" class="briefing-shorts-rail">
          <div v-if="weather" class="briefing-shorts-rail-item" role="img" :aria-label="`날씨 ${badge.label}`">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <template v-if="badge.icon === 'clear'">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2.8v2.2M12 19v2.2M2.8 12h2.2M19 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M5.5 18.5l1.6-1.6M16.9 7.1l1.6-1.6" />
              </template>
              <path v-else-if="badge.icon === 'night'" d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" />
              <template v-else>
                <path d="M7 17.5h10.2a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.9 1.3A3.4 3.4 0 0 0 7 17.5z" :transform="badge.icon === 'cloudy' ? undefined : 'translate(0 -2.5)'" />
                <path v-if="badge.icon === 'rain'" d="M8.5 18.5l-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5" />
                <path v-if="badge.icon === 'snow'" d="M8 19.5h.01M12 21h.01M16 19.5h.01M10 22h.01M14 22h.01" stroke-width="2.6" />
              </template>
            </svg>
            <span>{{ badge.label }}</span>
          </div>
          <div v-if="feltC !== null" class="briefing-shorts-rail-item" role="img" :aria-label="`체감 ${feltC}도`">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" />
              <path d="M12 9v7.2" />
            </svg>
            <span>{{ feltC }}°</span>
          </div>
          <button v-if="phase !== 'leaving'" class="briefing-shorts-rail-item" type="button" @click="finish()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 5.5l9 6.5-9 6.5z" />
              <path d="M18.5 5.5v13" />
            </svg>
            <span>건너뛰기</span>
          </button>
        </div>
      </div>

      <footer class="briefing-shorts-bar briefing-shorts-bottom">
        <p class="briefing-shorts-subtitle" aria-live="polite">{{ subtitle }}</p>
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
  font-size: max(var(--text-caption-size), 3.6cqw);
  color: var(--briefing-shorts-ink-soft);
}

.briefing-shorts-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
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

/* 영상 위 아이콘: 흰 선 아이콘 + 옅은 그림자(낮 하늘에서도 보이게), 쇼츠처럼 배경 없이 */
.briefing-shorts-sound,
.briefing-shorts-rail-item {
  padding: 0;
  background: none;
  border: 0;
  color: var(--briefing-shorts-ink);
  filter: drop-shadow(var(--shadow-text));
}

.briefing-shorts-sound {
  position: absolute;
  top: 3cqw;
  right: 3cqw;
  width: max(44px, 11cqw);
  height: max(44px, 11cqw);
  display: grid;
  place-items: center;
}

.briefing-shorts-sound svg {
  width: 70%;
  height: 70%;
}

.briefing-shorts-rail {
  position: absolute;
  right: 2cqw;
  bottom: 4cqw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4cqw;
}

.briefing-shorts-rail-item {
  min-width: max(44px, 13cqw);
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8cqw;
  font: inherit;
  font-size: max(var(--text-micro-size), 3.3cqw);
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.briefing-shorts-rail-item svg {
  width: max(28px, 8.5cqw);
  height: max(28px, 8.5cqw);
}

.briefing-shorts-sound:focus-visible,
.briefing-shorts-rail-item:focus-visible {
  outline: 2px solid var(--briefing-shorts-cool);
  outline-offset: 2px;
}
</style>
