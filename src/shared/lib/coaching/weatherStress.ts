import { feltTemperatureC } from '@/shared/lib/runningWeather'

/**
 * 세션 평가용 **날씨 교란 판정**(#713).
 *
 * SSOT: `.harness/project/running-coaching-standards.md` §외부 조건 코칭
 *
 * 왜 필요한가 — 실사용(2026-08-22): 고온다습에 "심박 138 이하로 하려면 거의 걸어야" 하는 조건에서
 * 시킨 대로 뛰었는데 사후 코칭이 심박 드리프트를 그대로 지적했다. **말로는 더위를 감안한다면서
 * 판정은 안 바뀌는** 자가당착이고(`[[brief-debrief-consistency]]`), 뛰는 중 의문이 안 풀린 채
 * 40분을 달리게 만든다.
 *
 * ⚠️ 이것은 **보정값이 아니라 비교가능성 플래그다.** SSOT 금지 목록에 따라
 * `기온 X → 심박 +N bpm` / `→ 페이스 +N초/km` 같은 수치 보정은 만들지 않는다. 여기서 하는 일은
 * "이 조건에서는 심박·페이스를 평소와 같은 잣대로 비교할 수 없다"를 표시하는 것뿐이다.
 *
 * ⚠️ **날씨는 면죄부가 아니다.** 이 플래그가 켜져도 심박·RPE·대화가 **함께** 높으면 강도 실패
 * 판정은 유지된다 — 그 결합 판단은 호출부(evaluateLsd·evaluateEasyRecovery)가 한다.
 */
export type WeatherStress = {
  /** 더위로 심박·페이스 비교가 유효하지 않은 조건인가. */
  heatConfounded: boolean
  /** 체감온도(℃). 기온이 없으면 null. */
  feltC: number | null
  /** 사후 서술에 붙일 조건 문구. 교란이 아니면 null. */
  note: string | null
}

const NO_STRESS: WeatherStress = { heatConfounded: false, feltC: null, note: null }

/**
 * 열교란 임계 = **날씨 카드의 '더위 주의' 임계와 같은 값**(`runningWeather.getRunningSafety`).
 *
 * 새로 발명한 숫자가 아니다. SSOT 가 요구하는 **"브리핑에서 말한 조건과 사후 채점이 같은 값을
 * 봐야 한다"** 를 지키려면, 사전 안내가 "더위 주의"라고 말한 조건은 사후 채점도 더위로 봐야 한다.
 * 이 값을 바꾸려면 두 곳을 함께 바꾼다.
 */
export const HEAT_CONFOUND_FELT_C = 28

/**
 * 기온·습도·풍속으로 열교란 여부를 판정한다.
 *
 * 습도는 **기온과 결합해서만** 본다(SSOT: 상대습도를 기온과 독립 가산하지 않는다) —
 * `feltTemperatureC` 가 기온 20℃ 이상에서 Stull 습구온도를 거쳐 체감온도를 산출하므로
 * 그 결합을 그대로 쓴다.
 *
 * ⚠️ 체감온도는 **WBGT 가 아니다.** 복사열·일사를 포함하지 않아 직사광선의 열부담을
 * 과소평가할 수 있다. 그래서 이 값은 **안전 판정에 쓰지 않고** 비교가능성 표시에만 쓴다
 * (SSOT §안전 밴드 도입 3단계 — 현재 1단계).
 */
export type WeatherStressInput = {
  /** 기온(℃). */
  temperature: number | null
  /** 상대습도(**0~100 퍼센트** — RunLog 스케일. WeatherSnapshot 의 0~1 분수와 다르다). */
  humidity: number | null
  /** 풍속(m/s). */
  windMps: number | null
}

// ⚠️ `RunLog` 를 import 하지 않는다 — shared → entities 역방향 의존 래칫(#397).
// 필요한 건 숫자 3개뿐이라 구조적 타입으로 받는다(RunLog 가 이 모양을 만족한다).
export function assessWeatherStress(run: WeatherStressInput): WeatherStress {
  const feltC = feltTemperatureC(run.temperature, run.humidity, run.windMps)
  if (feltC === null) return NO_STRESS
  if (feltC < HEAT_CONFOUND_FELT_C) return { heatConfounded: false, feltC, note: null }

  const humid = run.humidity !== null && Number.isFinite(run.humidity) && run.humidity >= 70
  return {
    heatConfounded: true,
    feltC,
    note: humid
      ? `체감 ${Math.round(feltC)}도·습도 ${Math.round(run.humidity as number)}% — 이 조건에선 같은 강도라도 심박이 쉽게 오르고 페이스는 느려진다`
      : `체감 ${Math.round(feltC)}도 — 이 조건에선 같은 강도라도 심박이 쉽게 오르고 페이스는 느려진다`
  }
}
