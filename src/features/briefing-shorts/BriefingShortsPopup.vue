<script setup lang="ts">
/**
 * 브리핑 쇼츠 화면(#898) — 유튜브 쇼츠처럼 보이게(사용자 결정 2026-11-05, 사용자가 보낸 쇼츠 화면 기준):
 * 위 = 노란 굵은 제목 · 가운데 = 3D 영상(자막은 영상 위에 흰 글자+검은 테) · 오른쪽 = 아이콘 줄(영상 아래쪽~밑 검은 칸)
 * · 영상 밑 = 코치 코멘트(쇼츠 편집 코멘트 자리 — 코치 탭 '오늘의 핵심' 앞 구절) · 왼쪽 아래 = 코치 프로필 + 대회 D-day 알약 · 설명(거리·페이스·해시태그)
 * · 맨 아래 = 진행 막대(읽은 문장만큼). 쇼츠 로고·구독 버튼 같은 남의 브랜드 요소는 쓰지 않는다.
 *
 * 흐름(사용자 결정 2026-11-05 — 말 걸기 탭은 없앴다):
 *  1. 카메라는 길에 서 있고, 러너가 멀리서 카메라 쪽으로 달려온다
 *  2. 다가오면 카메라맨이 5m 앞에서 뒤돌아 찍으며 같이 뛴다 — 이때부터 문장마다 기기 TTS 로 읽고 그 문장을 자막으로 띄운다
 *  3. 다 읽으면 카메라맨이 서서히 멈추고, 옆을 지나 멀어지는 러너를 바라보며 살짝 내려간다. 그사이 팝업이 천천히 사라진다
 *  언제든 "건너뛰기"로 바로 닫는다. 다시 보기 입구는 없다(하루 한 번).
 *
 * 쇼츠처럼(사용자 결정 2026-11-05): 영상 오른쪽 아래에 아이콘 줄(날씨 · 체감온도 · 건너뛰기, 예전 말 걸기 자리 — 글자는 기온 숫자만),
 * 오른쪽 위에 스피커. 소리는 처음엔 끔(자막만) — 스피커를 누르면 읽던 문장부터 목소리로 다시 읽는다.
 * 켜고 끈 건 설정 '소리 켜고 시작'에 그대로 저장돼 다음 브리핑에도 이어진다(사용자 결정: 한 번 켰으면 다음부터 나와야 한다).
 * 켜져 있으면 무음 모드여도 들린다 — 사용자가 직접 켠 소리다(앱이라 브라우저처럼 막히지도 않는다).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { TodayBriefingPayload } from '@/app/stores/briefingShortsStore'
import { useSettingsStore } from '@/app/stores/settingsStore'
import { buildBriefingScript, type ScriptLine } from './briefingScript'
import { sceneSfx, weatherBadge, type BriefingWeather } from './sceneOptions'
import { buildShortsMeta } from './shortsMeta'
import { estimateSpeechSec, speak, stopSpeech, unlockSpeech } from './speech'
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

const when = computed(() => props.payload.when ?? '오늘')
const script = computed(() =>
  buildBriefingScript({ title: props.payload.title, distanceKm: props.payload.distanceKm, briefing: props.payload.briefing, when: when.value })
)
const sfx = computed(() => sceneSfx(props.options.rn))
const badge = computed(() => weatherBadge(props.weather, props.options.wx, props.options.tm))
const feltC = computed(() => props.weather?.feltC ?? null)

const settingsStore = useSettingsStore()
/** 이 영상의 소리. 시작값 = 설정, 스피커를 누르면 설정에도 저장한다(다음 브리핑도 같은 상태로) */
const soundOn = ref(settingsStore.briefingSound)
/** 읽던 문장을 새 소리 상태로 처음부터 다시 */
let restartLine: (() => void) | null = null
const meta = computed(() => buildShortsMeta(props.payload))
/**
 * 코치 코멘트 = 코치 탭 '오늘의 핵심' 한 줄의 앞 구절(" — " 앞). 사용자 결정 2026-11-06: 훈련 효과는 길어서 말줄임표로 잘렸다
 * → 앱에 이미 나오는 짧은 한 줄을 쓰고, 말줄임표 없이 끝까지 보인다. 핵심은 포스트런이 채점하는 기준이기도 하다.
 */
const comment = computed(() => props.payload.briefing.keyPoint.split(' — ')[0])
const avatarUrl = `${import.meta.env.BASE_URL}pacelab-icon.svg`
/** 진행 막대: 문장을 시작할 때 그 문장 끝 위치까지 그 문장 길이만큼 차오른다 */
const progress = ref({ to: 0, ms: 0 })

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
    await Promise.race([speak(line.speech, () => scene?.setSpeech({ speaking: true, last }), { muted: !soundOn.value, loud: soundOn.value }), restarted])
    restartLine = null
    if (!again || finished) return
    stopSpeech()
  }
}

function toggleSound() {
  soundOn.value = !soundOn.value
  settingsStore.setBriefingSound(soundOn.value)
  if (soundOn.value) unlockSpeech() // 브라우저는 이 탭 안에서 소리를 열어야 이후 발화가 난다(앱은 필요 없다)
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
    progress.value = { to: (i + 1) / lines.length, ms: estimateSpeechSec(lines[i].speech) * 1000 }
    await sayLine(lines[i], last)
    scene?.setSpeech({ speaking: false, last })
    if (!last) await wait(LINE_GAP_MS)
  }
  if (finished) return
  subtitle.value = ''
  progress.value = { to: 1, ms: 300 }
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
    :aria-label="`${when} 훈련 브리핑`"
    data-no-swipe
  >
    <!-- 닫기(사용자 요청: 위쪽 검은 띠 오른쪽 위에 앱 닫기 X — 직관적으로 닫게). 불러오는 중에도 닫을 수 있다 -->
    <button class="briefing-shorts-close" type="button" aria-label="브리핑 닫기" @click="finish()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>

    <div class="briefing-shorts-frame">
      <header class="briefing-shorts-top">
        <p class="briefing-shorts-title">{{ when }}은 {{ payload.title }} <span aria-hidden="true">{{ sfx }}</span></p>
      </header>

      <div class="briefing-shorts-stage">
        <canvas ref="canvasEl" class="briefing-shorts-canvas" :class="{ on: phase !== 'loading' }" />
        <p v-if="phase === 'loading'" class="briefing-shorts-loading">러너가 오고 있어요…</p>
        <!-- 자막: 쇼츠처럼 영상 위에 흰 굵은 글자 + 검은 테 -->
        <p class="briefing-shorts-subtitle" aria-live="polite">{{ subtitle }}</p>

        <!-- 스피커(오른쪽 위): 기본 끔 — 누르면 읽던 문장부터 목소리로 -->
        <button
          v-if="phase !== 'loading'"
          class="briefing-shorts-sound"
          type="button"
          :aria-label="soundOn ? '소리 끄기' : '소리 켜기'"
          :aria-pressed="soundOn"
          @click="toggleSound"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
      </div>

      <!-- 아이콘 줄(쇼츠 오른쪽 레일 — 영상 아래쪽에서 밑 검은 칸까지): 날씨 · 체감온도 · 건너뛰기. 글자는 기온 숫자만(사용자 결정) -->
      <div v-if="phase !== 'loading'" class="briefing-shorts-rail">
        <div v-if="weather" class="briefing-shorts-rail-item" role="img" :aria-label="`날씨 ${badge.label}`">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
        </div>
        <div v-if="feltC !== null" class="briefing-shorts-rail-item" role="img" :aria-label="`체감 ${feltC}도`">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" />
            <path d="M12 9v7.2" />
          </svg>
          <span>{{ feltC }}°</span>
        </div>
        <button v-if="phase !== 'leaving'" class="briefing-shorts-rail-item" type="button" aria-label="건너뛰기" @click="finish()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 5.5l9 6.5-9 6.5z" />
            <path d="M18.5 5.5v13" />
          </svg>
        </button>
      </div>

      <footer class="briefing-shorts-bottom">
        <!-- 쇼츠 '편집 코멘트' 자리 = 코치 코멘트(훈련 효과) -->
        <div v-if="comment" class="briefing-shorts-comment">
          <p class="briefing-shorts-comment-label">코치 코멘트</p>
          <p class="briefing-shorts-comment-text">{{ comment }}</p>
        </div>
        <div class="briefing-shorts-channel">
          <p class="briefing-shorts-profile">
            <img class="briefing-shorts-avatar" :src="avatarUrl" alt="" />
            <span class="briefing-shorts-handle">@pacelab.coach</span>
            <span v-if="meta.dDay" class="briefing-shorts-dday">{{ meta.dDay }}</span>
          </p>
          <p class="briefing-shorts-desc">
            <span v-if="meta.caption">{{ meta.caption }}</span>
            <span v-for="tag in meta.tags" :key="tag" class="briefing-shorts-tag">{{ tag }}</span>
          </p>
        </div>
        <div class="briefing-shorts-progress" aria-hidden="true">
          <i :style="{ transform: `scaleX(${progress.to})`, transitionDuration: `${progress.ms}ms` }" />
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* 쇼츠 영상처럼 늘 어두운 한 톤. 틀 밖(세로가 긴 폰의 위아래)도 같은 검정으로 이어 붙인다 */
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

/* 닫기 X: 화면 오른쪽 위(위쪽 검은 띠 — 상태 표시줄 아래). 틀 밖이라 영상·제목을 가리지 않는다(위 띠가 없는 화면에선 제목 칸 오른쪽 위) */
.briefing-shorts-close {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 6px);
  right: 8px;
  z-index: 2;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  background: none;
  border: 0;
  color: var(--briefing-shorts-ink);
}

.briefing-shorts-close svg {
  width: 26px;
  height: 26px;
}

.briefing-shorts-close:focus-visible {
  outline: 2px solid var(--briefing-shorts-cool);
  outline-offset: 2px;
}

/* 9:16 틀 = 위 15% 제목 · 55% 영상 · 30% 코멘트·프로필·설명·진행 막대. 아이콘 줄은 틀 기준(영상 아래쪽~밑 검은 칸) */
.briefing-shorts-frame {
  /* 아이콘 줄 = 오른쪽 끝에서 rail-inset 떨어진 rail-w 폭(누르는 칸은 44px 아래로 안 줄인다).
     가운데 정렬 글(자막·코치 코멘트)은 양옆을 똑같이 side 만큼 비운다 — 오른쪽만 비우면 글이 왼쪽으로 쏠린다(사용자 지적 2026-11-06) */
  --shorts-rail-inset: 2cqw;
  --shorts-rail-w: max(44px, 10cqw);
  --shorts-side: calc(var(--shorts-rail-inset) + var(--shorts-rail-w) + 1.5cqw);
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(100vw, calc(100dvh * 9 / 16));
  aspect-ratio: 9 / 16;
  container-type: inline-size;
  overflow: hidden;
}

.briefing-shorts-top {
  flex: 0 0 15%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4cqw;
}

/* 쇼츠 제목: 노란 아주 굵은 고딕 */
.briefing-shorts-title {
  margin: 0;
  font-size: 10.5cqw;
  font-weight: 900;
  line-height: 1.08;
  letter-spacing: -0.03em;
  color: var(--briefing-shorts-title);
  text-align: center;
  word-break: keep-all;
}

.briefing-shorts-stage {
  position: relative;
  flex: 0 0 55%;
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

/* 자막: 영상 위 흰 굵은 글자 + 검은 테(8방향 그림자). 양옆을 아이콘 줄 자리만큼 똑같이 비워 진짜 가운데 */
.briefing-shorts-subtitle {
  --o: 0.07em;
  position: absolute;
  left: var(--shorts-side);
  right: var(--shorts-side);
  bottom: 5cqw;
  margin: 0;
  font-size: max(var(--text-body-size), 6cqw);
  font-weight: 800;
  line-height: 1.3;
  text-align: center;
  word-break: keep-all;
  color: var(--briefing-shorts-ink);
  text-shadow:
    var(--o) 0 0 var(--briefing-shorts-outline),
    calc(var(--o) * -1) 0 0 var(--briefing-shorts-outline),
    0 var(--o) 0 var(--briefing-shorts-outline),
    0 calc(var(--o) * -1) 0 var(--briefing-shorts-outline),
    var(--o) var(--o) 0 var(--briefing-shorts-outline),
    calc(var(--o) * -1) var(--o) 0 var(--briefing-shorts-outline),
    var(--o) calc(var(--o) * -1) 0 var(--briefing-shorts-outline),
    calc(var(--o) * -1) calc(var(--o) * -1) 0 var(--briefing-shorts-outline),
    0 0 0.3em var(--briefing-shorts-outline);
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
  right: var(--shorts-rail-inset);
  width: var(--shorts-rail-w);
  height: var(--shorts-rail-w);
  display: grid;
  place-items: center;
}

/* 아이콘 그림 크기(스피커·아이콘 줄 같게). 누르는 칸은 그대로 44px 이상 */
.briefing-shorts-sound svg,
.briefing-shorts-rail-item svg {
  width: max(24px, 7cqw);
  height: max(24px, 7cqw);
}

.briefing-shorts-rail {
  position: absolute;
  right: var(--shorts-rail-inset);
  bottom: 14%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4cqw;
}

.briefing-shorts-rail-item {
  width: var(--shorts-rail-w);
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6cqw;
  font: inherit;
  font-size: max(var(--text-caption-size), 3.8cqw);
  font-weight: 700;
  line-height: 1.2;
}

.briefing-shorts-sound:focus-visible,
.briefing-shorts-rail-item:focus-visible {
  outline: 2px solid var(--briefing-shorts-cool);
  outline-offset: 2px;
}

.briefing-shorts-bottom {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 3.5cqw;
}

/* 쇼츠 '편집 코멘트' 자리 = 코치 코멘트(짧은 한 줄이라 말줄임표 없이 끝까지). 자막처럼 양옆을 똑같이 비워 진짜 가운데 */
.briefing-shorts-comment {
  padding-inline: var(--shorts-side);
  text-align: center;
}

.briefing-shorts-comment-label {
  margin: 0;
  font-size: max(var(--text-micro-size), 3.2cqw);
  font-weight: 600;
  color: var(--briefing-shorts-ink-dim);
}

.briefing-shorts-comment-text {
  margin: 1cqw 0 0;
  font-size: max(var(--text-caption-size), 4.3cqw);
  font-weight: 700;
  line-height: 1.35;
  color: var(--briefing-shorts-ink-soft);
  word-break: keep-all;
  text-wrap: balance;
}

/* 프로필·설명은 쇼츠처럼 왼쪽 정렬 — 오른쪽만 아이콘 줄 자리를 비운다 */
.briefing-shorts-channel {
  margin-top: auto;
  padding: 0 var(--shorts-side) 5cqw 5cqw;
}

.briefing-shorts-profile {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 2.4cqw;
}

.briefing-shorts-avatar {
  width: max(32px, 9cqw);
  height: max(32px, 9cqw);
  border-radius: 50%;
  object-fit: cover;
}

.briefing-shorts-handle {
  font-size: max(var(--text-caption-size), 4cqw);
  font-weight: 700;
}

/* 쇼츠 '구독' 자리 = 대회 D-day(누르는 버튼이 아니라 정보 알약) */
.briefing-shorts-dday {
  padding: 1.2cqw 3.2cqw;
  border-radius: 999px;
  background: var(--briefing-shorts-ink);
  color: var(--briefing-shorts-frame);
  font-size: max(var(--text-caption-size), 3.6cqw);
  font-weight: 800;
}

.briefing-shorts-desc {
  margin: 2.2cqw 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0 1.8cqw;
  font-size: max(var(--text-caption-size), 3.8cqw);
  line-height: 1.4;
  color: var(--briefing-shorts-ink);
}

.briefing-shorts-tag {
  color: var(--briefing-shorts-cool);
  font-weight: 600;
}

/* 진행 막대(맨 아래): 읽은 문장만큼 — 문장마다 그 길이만큼 차오른다 */
.briefing-shorts-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: color-mix(in srgb, var(--briefing-shorts-ink) 28%, transparent);
}

.briefing-shorts-progress i {
  display: block;
  height: 100%;
  background: var(--briefing-shorts-ink);
  transform: scaleX(0);
  transform-origin: left center;
  transition-property: transform;
  transition-timing-function: linear;
}

@media (prefers-reduced-motion: reduce) {
  .briefing-shorts-progress i {
    transition-duration: 0ms !important;
  }
}
</style>
