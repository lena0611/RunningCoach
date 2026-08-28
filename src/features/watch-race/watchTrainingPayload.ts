import { buildSessionTimeline, type TimelineStep } from '@/shared/lib/coaching/sessionTimeline'

/**
 * 워치 **본훈련 모드** 페이로드(#711).
 *
 * ## 왜 레이싱과 나누나
 *
 * 워치 앱은 지금 레이싱만 있다(첫 화면 "나와의 레이스", 진입이 거리 피커). 고스트 없이 뛰는
 * "자유 측정"은 되지만 그건 **홀로 레이스**지 훈련이 아니다 — 비교 대상이 기록이지 처방이 아니고,
 * 훈련의 **의도**도 **단계**도 표현할 자리가 없다.
 *
 * `GhostRaceEngine` 이 "커브 vs 나"를 비교한다면, 본훈련은 **"처방 vs 나"** 를 비교한다.
 * 비교 대상만 바뀌고 워크아웃 세션·음성·백그라운드·에어팟 라우팅은 그대로 재사용한다.
 *
 * ## 결정론 층은 오프라인에서 100% 돈다
 *
 * Series 4 는 GPS 모델이라 워치 단독이면 네트워크가 없다. 그래서 **처방·타임라인·심박 상한을
 * 미리 내려두고**, 워치는 받은 값으로 스스로 판정·발화한다. LLM 왕복이 없다 —
 * "LLM 은 나가기 전에 설계하고, 러닝 중엔 결정론 엔진이 말한다".
 *
 * ## ⚠️ 집행은 돕되 채점은 하지 않는다
 *
 * 타임라인으로 실제 랩이 남더라도 **스트라이드 선명도·개수를 채점하지 않는다**
 * (`[[coach-not-data-referee]]`). 이 페이로드는 실행 안내용이다.
 */

export type WatchTrainingPayload = {
  generatedAt: string
  /** 오늘(또는 다음) 예정 세션. 없으면 null — 워치는 본훈련 모드를 비활성으로 둔다. */
  session: {
    date: string
    /** RunType 문자열. */
    type: string
    /** 사람이 읽는 세션 이름(예: "Easy + Strides"). */
    label: string
    distanceKm: number | null
    durationMin: number | null
    keySession: boolean
  } | null
  /**
   * 시작 시 읽어줄 **의도**(#711 요구 1) — 초보는 처방을 받아도 뛰는 동안 잊는다.
   * `SessionIntent.why` / 브리핑 keyPoint 에서 온다. 없으면 빈 문자열.
   */
  intent: { why: string; keyPoint: string }
  /**
   * 외부 조건 보정 안내(#711 요구 2) — **"감안하고 있다"와 "그래도 문제없다"를 명시한다.**
   * 침묵이 아니라 명시가 신뢰를 만든다. 보정이 없으면 `adjusted:false` 로 그 사실을 말한다.
   */
  conditions: {
    adjusted: boolean
    /** 워치가 읽어줄 한 줄. 예: "습도가 높아 심박이 쉽게 올라요. 페이스가 느린 건 정상입니다." */
    note: string
  }
  /** 실행 타임라인(#711 요구 4) — 랩/구간 집행. 빈 배열이면 집행 모드로 들어가지 않는다. */
  timeline: TimelineStep[]
  /**
   * 러닝 중 warning 판정용 임계(#711 요구 3). **상시 낭독이 아니라 알려야 할 때만** 쓴다.
   * 값이 null 이면 그 경고를 하지 않는다 — 없는 기준으로 판정하지 않는다.
   */
  guards: {
    /** 이지 심박 상한(bpm). 더워도 **올리지 않는다**(SSOT §외부 조건). */
    easyCeilingBpm: number | null
    /** 상한 초과가 이만큼 지속되면 1회 안내(초). 단발 스파이크는 말하지 않는다. */
    hrOverSustainSec: number
    /** 이지 초반 오버페이스 경고 기준(초/km, 밴드보다 이만큼 빠르면). null 이면 판정 안 함. */
    earlyFastPaceSec: number | null
  }
}

/** 상한 초과 지속 임계(초). 단발 상승(언덕·신호)에 말 걸지 않기 위한 최소 지속. */
const HR_OVER_SUSTAIN_SEC = 180

export type TrainingPayloadInput = {
  generatedAt: string
  session: WatchTrainingPayload['session']
  why?: string
  keyPoint?: string
  /** `computeStrides` 산출 회수. Easy + Strides 가 아니면 무시된다. */
  strideReps?: number
  easyCeilingBpm?: number | null
  /** 더위 등으로 조건 보정이 있는가(웹 판정 — `assessWeatherStress`). */
  weatherNote?: string | null
}

/**
 * 워치에 내릴 본훈련 페이로드를 만든다.
 *
 * 세션이 없으면 `session:null` 로 내려 워치가 본훈련 모드를 **비활성**으로 두게 한다 —
 * 없는 훈련을 지어내지 않는다.
 */
export function buildWatchTrainingPayload(input: TrainingPayloadInput): WatchTrainingPayload {
  const { generatedAt, session } = input
  if (!session) {
    return {
      generatedAt,
      session: null,
      intent: { why: '', keyPoint: '' },
      conditions: { adjusted: false, note: '' },
      timeline: [],
      guards: { easyCeilingBpm: null, hrOverSustainSec: HR_OVER_SUSTAIN_SEC, earlyFastPaceSec: null }
    }
  }

  const timeline = buildSessionTimeline({
    sessionType: session.type,
    distanceKm: session.distanceKm,
    durationMin: session.durationMin,
    strideReps: input.strideReps ?? 0
  })

  // 보정이 있으면 그 사실과 "그래도 프로그램상 문제없다"를 함께, 없으면 없다고 명시한다.
  const note = input.weatherNote
    ? `${input.weatherNote} 오늘은 숫자보다 숨 편안함으로 보세요. 페이스가 느린 건 정상이고, 프로그램상 문제없습니다.`
    : '오늘 조건은 평소와 비슷해요. 계획대로 갑니다.'

  return {
    generatedAt,
    session,
    intent: { why: input.why ?? '', keyPoint: input.keyPoint ?? '' },
    conditions: { adjusted: Boolean(input.weatherNote), note },
    timeline,
    guards: {
      easyCeilingBpm: input.easyCeilingBpm ?? null,
      hrOverSustainSec: HR_OVER_SUSTAIN_SEC,
      // 초반 오버페이스는 저강도에서만 본다(SSOT: Easy/LSD 는 초반 통제가 핵심).
      earlyFastPaceSec:
        session.type === 'Easy' || session.type === 'Easy + Strides' || session.type === 'Recovery' ? 30 : null
    }
  }
}
