// briefingScene.js 의 공개 API(#898). 장면 내부는 PoC 이식 JS 라 타입을 두지 않고, 앱이 만지는 면만 묶는다.

export type SceneRunKind = 'easy' | 'tempo' | 'lsd' | 'race' | 'interval'
export type SceneWeather = 'clear' | 'cloudy' | 'rain' | 'snow'
/** 옷 단계 = 체감온도 5°C 단위(-10 … 35). 장면은 옛 이름(summer=30·mild=15·winter=0)도 받는다(스튜디오) */
export type SceneBand = -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35

export type BriefingSceneOptions = {
  /** 모델 성별(표현 전용 — 처방과 무관) */
  sx: 'f' | 'm'
  rn: SceneRunKind
  /** 1~365, 해 위치(서울) 계산용 */
  dy: number
  /** 시(0~24, 0.25 단위 소수 허용) — 밤이면 가로등이 켜진다 */
  tm: number
  wx: SceneWeather
  tp: SceneBand
  /** 악세사리를 '-' 로 이은 것(cap·beanie·sun·watch·glove·mask·buff·vest=물병 조끼 · 겉옷 thermo=보온 재킷·jacket=바람막이·padvest=패딩 조끼 · hood=후드 올림), 빈 문자열 = 없음 */
  ac: string
}

export type BriefingScene = {
  /** 지금 말하는 중인지(입모양)·마지막 문장인지(더 활짝 웃음) */
  setSpeech(state: { speaking: boolean; last: boolean }): void
  /** 다 읽었다 — 카메라맨이 서서히 멈추고, 옆을 지나 멀어지는 러너를 바라보며 살짝 내려간다. */
  finish(): void
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
  /** 러너가 카메라까지 달려와 카메라맨이 5m 앞에서 같이 뛰기 시작하면 — 이때부터 읽는다 */
  onReadyToTalk?: () => void
  signal?: AbortSignal
}): Promise<BriefingScene>
