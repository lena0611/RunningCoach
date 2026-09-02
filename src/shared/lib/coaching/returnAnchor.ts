/**
 * 복귀 앵커(주간 볼륨) — 공백이 목적지를 지우지 않게 한다.
 *
 * ## 무엇이 잘못됐었나 (2026-08-18 실사고)
 * 주간 볼륨 앵커가 `최근 30일 평균` 하나였다. 한 달을 쉬면 그 공백이 그대로 평균을 끌어내려
 * 플랜 전체가 축소되고, 축소된 처방을 뛰면 다음 30일 평균이 더 작아져 **양의 피드백 루프**가 된다.
 * 실측: 같은 날 처방이 6.5km(6/17) → 1.7km(8/04) → 0.9km(8/07) → **0.2km**(8/12)로 무너졌고
 * LSD(장거리)가 1.4km까지 내려갔다. 하한도, 부상 전 체력에 대한 기억도 없었다.
 *
 * ## 2층 구조 (SSOT §휴식과 복귀의 원래 의도)
 * - **앵커 = 돌아갈 목적지.** 부상 전 볼륨에 디트레이닝 계수를 곱한다(이 모듈).
 * - **세션 상한 = 도달 속도.** 직전 30일 최장 +10%(`returnRamp.ts`, BJSM 2025).
 *
 * 앵커가 낙관적이어도 세션 상한이 실제 세션 길이를 막으므로 위험하지 않다. SSOT 가 그대로 말한다 —
 * *"이 상한이 주차별 %를 따로 정하지 않아도 램프를 스스로 통제한다"*. 반대로 앵커까지 무너지면
 * 두 층이 같은 방향(축소)으로만 작동해 복원 경로가 사라진다. 그게 이 버그였다.
 *
 * ## 왜 주차별 복원 %를 만들지 않는가
 * SSOT 가 명시적으로 금지한다 — *"'첫 주 -X%, 주당 +Y%' 같은 단일 권위 수치는 검증된 출처에 없다"*.
 * 그래서 여기서는 **감소(디트레이닝)만** SSOT 의 문서화된 값으로 계산하고, 복원 속도는 세션 상한에 맡긴다.
 */

export function detrainingRetention(layoffDays: number): number {
  if (layoffDays < 14) return 1
  if (layoffDays < 28) return 0.94
  if (layoffDays >= 56) return 0.84
  // 4주(-7%)→8주(-16%) 선형 보간.
  const t = (layoffDays - 28) / (56 - 28)
  return Math.round((0.93 - t * (0.93 - 0.84)) * 100) / 100
}

/** 공백으로 볼 최소 무런 일수. 이 미만은 평상시 변동이라 복귀로 보지 않는다(returnRamp 와 같은 경계). */
const LAYOFF_MIN_DAYS = 7
/** 공백을 찾는 되돌아보기 창(일). 이보다 오래된 공백은 이미 복원이 끝났다고 본다. */
const LAYOFF_LOOKBACK_DAYS = 120
/** 부상 전 볼륨을 재는 창(일) — 공백 시작 직전 4주. */
const PRE_LAYOFF_WINDOW_DAYS = 28

/**
 * 만성부하 비교가 보는 창(일). 최근 30일 vs 직전 30일이므로 60일이다 — 이 안에 공백이 있으면
 * 분모가 눌려 증가율이 폭증한다(#743).
 */
const CHRONIC_BASELINE_WINDOW_DAYS = 60

export type RecentLayoff = { startMs: number; days: number }

/**
 * 만성부하 비교 기준선(직전 30일)이 **공백에 눌렸는가**(#743).
 *
 * SSOT §휴식과 복귀: *"휴식 직후 만성부하(분모)≈0이라 ACWR이 기계적으로 폭증하는 **비율
 * 인공물**이고, 대형 코호트(BJSM 2025)에선 ACWR 스파이크가 오히려 부상 감소와 연관됐다.
 * 복귀 게이트로 신뢰 금지."*
 *
 * 이게 참이면 "볼륨 급증" 경고를 띄우지 않는다 — 부상으로 쉬고 돌아온 사람에게 다시 쉬라는
 * 말이 되기 때문이다(2026-09-02 실사고). 복귀기의 진짜 가드레일은 단일 세션 +10% 상한이다.
 */
export function isChronicBaselineAfterLayoff(runDates: string[], today: Date): boolean {
  return Boolean(findRecentLayoff(runDates, today, CHRONIC_BASELINE_WINDOW_DAYS))
}

/**
 * 되돌아보기 창 안에서 **가장 최근의 유의미한 공백**(≥7일 무런)을 찾는다.
 *
 * "지금 며칠 안 뛰었나"가 아니라 **끝난 공백**을 찾는 것이 핵심이다. 복귀 후엔 현재 공백이 1~2일이라
 * 그걸로 계수를 매기면 보정이 사라진다(2026-08-18 1차 구현의 오류 — 실데이터 검산에서 잡았다).
 */
export function findRecentLayoff(runDates: string[], today: Date, lookbackDays = LAYOFF_LOOKBACK_DAYS): RecentLayoff | null {
  const todayMs = startOfDayMs(today)
  const days = runDates
    .map((date) => startOfDayMs(new Date(`${date}T00:00:00`)))
    .filter((ms) => Number.isFinite(ms) && ms <= todayMs && todayMs - ms <= lookbackDays * MS_PER_DAY)
    .sort((a, b) => b - a)
  if (days.length < 2) return null
  // 최신에서 과거로 인접 런 간격을 보며 첫 번째 큰 공백을 찾는다.
  for (let i = 0; i < days.length - 1; i++) {
    const gapDays = Math.round((days[i] - days[i + 1]) / MS_PER_DAY)
    if (gapDays >= LAYOFF_MIN_DAYS) return { startMs: days[i + 1], days: gapDays }
  }
  return null
}

/** 공백 시작 직전 4주의 주당 볼륨 — "돌아갈 곳"은 시즌 최고가 아니라 **멈추기 직전** 수준이다. */
export function preLayoffWeeklyKm(runs: Array<{ date: string; distanceKm: number }>, layoffStartMs: number): number {
  const windowStart = layoffStartMs - PRE_LAYOFF_WINDOW_DAYS * MS_PER_DAY
  const sum = runs
    .map((run) => ({ ms: startOfDayMs(new Date(`${run.date}T00:00:00`)), km: run.distanceKm || 0 }))
    .filter((run) => Number.isFinite(run.ms) && run.ms > windowStart && run.ms <= layoffStartMs)
    .reduce((total, run) => total + run.km, 0)
  return Math.round((sum / 4) * 10) / 10
}

/** "지금 감당 가능한 주간 볼륨"을 재는 창(일). 최근 3주 안에서 가장 좋았던 7일을 본다. */
const RECENT_CAPABLE_LOOKBACK_DAYS = 21

/**
 * 최근 감당 볼륨 — 최근 3주 안 **가장 큰 7일 이동 합**.
 *
 * 기존 `최근 30일 합 × 7/30` 은 공백과 훈련을 한 평균에 섞는다. 복귀 러너에겐 체계적으로 과소평가다:
 * 이 사용자는 최근 6일에 18.8km 를 뛰었는데 30일 평균은 4.39km/주로 나왔다(2026-08-18 실측).
 * 그 4.39가 플랜 앵커로 들어가 Easy 처방이 1km 가 됐다.
 *
 * 이동 최대를 쓰는 이유: 현재 주가 아직 진행 중이면(월요일 재생성 등) 합이 작아 앵커가 튄다.
 * 최근 3주 최고 7일이면 "최근에 실제로 해낸 최대 부하"를 잡으면서 단일 가벼운 주에 흔들리지 않는다.
 */
export function recentCapableWeeklyKm(runs: Array<{ date: string; distanceKm: number }>, today: Date): number {
  const todayMs = startOfDayMs(today)
  const windowed = runs
    .map((run) => ({ ms: startOfDayMs(new Date(`${run.date}T00:00:00`)), km: run.distanceKm || 0 }))
    .filter((run) => Number.isFinite(run.ms) && run.ms <= todayMs && todayMs - run.ms < RECENT_CAPABLE_LOOKBACK_DAYS * MS_PER_DAY)
  if (!windowed.length) return 0
  let best = 0
  for (let offset = 0; offset < RECENT_CAPABLE_LOOKBACK_DAYS; offset++) {
    const end = todayMs - offset * MS_PER_DAY
    const start = end - 7 * MS_PER_DAY
    const sum = windowed.filter((run) => run.ms > start && run.ms <= end).reduce((total, run) => total + run.km, 0)
    if (sum > best) best = sum
  }
  return Math.round(best * 10) / 10
}

/**
 * 플랜의 주간 볼륨 앵커. 최근 실제 볼륨과 "공백 직전 볼륨 × 디트레이닝 계수" 중 **큰 쪽**.
 *
 * max 인 이유: 공백이 목적지를 지우면 안 되고(이 버그), 반대로 최근에 더 많이 뛰고 있으면 그 향상을
 * 깎을 이유도 없다(§시작점 앵커링 "이미 피크 이상이면 피크를 올려 유지"와 정합).
 * 유의미한 공백이 없으면 보정하지 않는다 — 평상시 변동을 복귀로 오해하지 않는다.
 */
export function deriveWeeklyVolumeAnchorKm(
  runs: Array<{ date: string; distanceKm: number }>,
  today: Date
): { anchorKm: number; recentKm: number; layoffDays: number; retention: number; preLayoffKm: number; restored: boolean } {
  const recent = recentCapableWeeklyKm(runs, today)
  const layoff = findRecentLayoff(runs.map((run) => run.date), today)
  if (!layoff) return { anchorKm: recent, recentKm: recent, layoffDays: 0, retention: 1, preLayoffKm: 0, restored: false }

  const preLayoffKm = preLayoffWeeklyKm(runs, layoff.startMs)
  const retention = detrainingRetention(layoff.days)
  const restoredKm = Math.round(preLayoffKm * retention * 10) / 10
  const anchorKm = Math.max(recent, restoredKm)
  return { anchorKm, recentKm: recent, layoffDays: layoff.days, retention, preLayoffKm, restored: anchorKm > recent }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function startOfDayMs(date: Date): number {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}
