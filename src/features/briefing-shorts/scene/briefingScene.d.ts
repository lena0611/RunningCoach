// briefingScene.js 의 공개 API(#898). 장면 내부는 PoC 이식 JS 라 타입을 두지 않고, 앱이 만지는 면만 묶는다.

export type SceneRunKind = 'easy' | 'tempo' | 'lsd' | 'race' | 'interval'
export type SceneWeather = 'clear' | 'cloudy' | 'rain' | 'snow'
export type SceneOutfit = 'summer' | 'mild' | 'winter'

export type BriefingSceneOptions = {
  /** 모델 성별(표현 전용 — 처방과 무관) */
  sx: 'f' | 'm'
  rn: SceneRunKind
  /** 1~365, 해 위치(서울) 계산용 */
  dy: number
  /** 시(0~24, 0.25 단위 소수 허용) — 밤이면 가로등이 켜진다 */
  tm: number
  wx: SceneWeather
  tp: SceneOutfit
  /** 악세사리를 '-' 로 이은 것(cap·sun·watch·glove·mask·buff·vest), 빈 문자열 = 없음 */
  ac: string
}

export type BriefingScene = {
  /** 감속해 서서 카메라를 본다. 다 서면 onReadyToTalk 가 불린다. */
  beginTalk(): void
  /** 지금 말하는 중인지(입모양)·마지막 문장인지(더 활짝 웃음) */
  setSpeech(state: { speaking: boolean; last: boolean }): void
  /** 돌아서서 다시 달려 나간다. 카메라는 그 자리에 남는다. */
  runOff(): void
  dispose(): void
}

export const SCENE_DEFAULTS: Readonly<Record<string, string | number>>

/**
 * 모델을 불러오고 첫 프레임까지 그린 뒤 resolve 한다(= 인트로를 걷어도 되는 시점).
 * WebGL 이 없거나 모델을 못 받으면 reject. signal 로 취소하면 AbortError 로 reject 하고 GPU 자원을 풀어 둔다.
 */
export function createBriefingScene(args: {
  canvas: HTMLCanvasElement
  modelUrl: string
  options: BriefingSceneOptions
  onReadyToTalk?: () => void
  signal?: AbortSignal
}): Promise<BriefingScene>
