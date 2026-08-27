/**
 * 조정 이력 도출(#703 ①) — **반복 하향은 국소 조정이 아니라 루틴 문제다.**
 *
 * SSOT: `running-coaching-standards.md` §세션 변경 요청 판정 4번 —
 * *"같은 축 하향이 반복되면 §루틴 변경 기준('주간 루틴과 실제 수행이 계속 어긋난다')으로 **승격**한다.
 * 국소 조정을 무한 반복해 목표 특이성을 갉아먹지 않는다."*
 *
 * ## 새 컬럼이 필요 없다
 *
 * `더 쉽게` 는 원본을 `superseded` 로 두고 `source:'manual'` 드래프트를 새로 넣는다
 * (`CoachPage.onBriefingAlternative` → `alternativeSession.proposeAlternativeSession`).
 * 즉 **같은 날짜에 (superseded 원본, manual 대체) 쌍이 남는다** — 이미 `CoachPage.activeOriginal`
 * 이 같은 방식으로 원본을 찾아 "되돌리기"에 쓰고 있다. 그 도출을 재사용한다.
 *
 * ## 관측이지 게이트가 아니다
 *
 * 이 모듈은 **신호를 세기만 한다.** 무엇을 할지(루틴 하향 제안·코치 발화)는 상위가 정한다.
 * 하향을 막지 않는다 — 개별 조정은 여전히 정당하고, 다만 **반복되면 골격을 봐야 한다**는 뜻이다.
 */

// ⚠️ `RunType` 을 import 하지 않는다 — shared → entities 역방향 의존 래칫(#397).
// 이 모듈이 쓰는 건 타입 문자열뿐이라 구조적으로 받는다(RunType 이 이 유니온을 만족한다).
export type SessionTypeName = string

/** 강도 사다리(낮음→높음). `alternativeSession.INTENSITY_LADDER` 미러 — 순서가 바뀌면 함께 바꾼다. */
const INTENSITY_ORDER: SessionTypeName[] = ['Recovery', 'Easy', 'Easy + Strides', 'Tempo', 'Race']

/**
 * 두 세션 타입 사이가 하향인가. 롱런(LSD/Steady Long)은 볼륨 축이라 별도로 본다 —
 * `adjustSessionType` 이 롱런의 easier 를 `Easy` 로 보내므로 그 전이를 하향으로 인정한다.
 */
function isDowngrade(from: SessionTypeName, to: SessionTypeName): boolean {
  if (from === to) return false
  if (from === 'LSD' || from === 'Steady Long') return to === 'Easy' || to === 'Recovery'
  const fromIdx = INTENSITY_ORDER.indexOf(from)
  const toIdx = INTENSITY_ORDER.indexOf(to)
  if (fromIdx < 0 || toIdx < 0) return false
  return toIdx < fromIdx
}

export type AdjustmentSession = {
  id: string
  date: string
  sessionType: SessionTypeName
  status: string
  source: string
  goalId: string | null
  createdAt: string
  prescription: { distanceKm: number | null }
}

export type DowngradeSignal = {
  /** 창 안에서 확인된 하향 횟수. */
  count: number
  /** 하향이 일어난 날짜들(오래된 순). */
  dates: string[]
  /**
   * 루틴 변경 기준으로 **승격할 신호인가**.
   * SSOT §루틴 변경 기준은 반복의 기준을 **"2주 이상"** 으로 잡는다("2주 이상 핵심 세션 누락이
   * 반복된다", "주간 루틴과 실제 수행이 계속 어긋난다"). 그래서 창을 2주로 두고, **서로 다른
   * 주에 걸쳐** 반복될 때만 승격한다 — 한 주의 혼잡은 §주말 트리아지가 이미 "루틴 변경이 아니다"
   * 라고 못박았다. 새 임계를 발명하지 않고 기존 기준을 그대로 쓴다.
   */
  shouldPromoteToRoutine: boolean
}

/** 관측 창(일). SSOT §루틴 변경 기준의 "2주 이상"을 그대로 쓴다. */
export const DOWNGRADE_WINDOW_DAYS = 14

const EMPTY: DowngradeSignal = { count: 0, dates: [], shouldPromoteToRoutine: false }

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`)
  const to = Date.parse(`${toIso}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.round((to - from) / 86400000)
}

/** ISO 날짜의 월요일 시작 주 키. 서로 다른 주에 걸친 반복인지 판정한다. */
function weekKey(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

/**
 * 최근 창 안에서 **하향 조정이 반복됐는지** 센다.
 *
 * 판정: 같은 날짜에 `superseded` 원본(코치가 낸 것 — `source !== 'manual'`)과
 * `manual` 대체가 함께 있고, 타입이 사다리상 아래로 갔으면 1회 하향.
 */
export function detectRepeatedDowngrade(
  sessions: AdjustmentSession[],
  todayIso: string,
  goalId: string | null = null
): DowngradeSignal {
  if (!sessions.length) return EMPTY

  const inWindow = sessions.filter((s) => {
    if (goalId !== null && s.goalId !== goalId) return false
    const age = daysBetween(s.date, todayIso)
    return age !== null && age >= 0 && age <= DOWNGRADE_WINDOW_DAYS
  })

  const byDate = new Map<string, AdjustmentSession[]>()
  for (const s of inWindow) {
    const list = byDate.get(s.date) ?? []
    list.push(s)
    byDate.set(s.date, list)
  }

  const dates: string[] = []
  for (const [date, list] of byDate) {
    // 코치가 낸 원본(가장 먼저 만들어진 superseded, manual 아님)과 사용자가 적용한 manual 대체.
    const original = list
      .filter((s) => s.status === 'superseded' && s.source !== 'manual')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    const replacement = list.filter((s) => s.source === 'manual').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (!original || !replacement) continue
    if (isDowngrade(original.sessionType, replacement.sessionType)) dates.push(date)
  }

  dates.sort()
  // 서로 다른 주에 걸쳐 반복될 때만 루틴 문제로 본다(한 주의 혼잡 ≠ 루틴 변경 — §주말 트리아지).
  const weeks = new Set(dates.map(weekKey))
  return {
    count: dates.length,
    dates,
    shouldPromoteToRoutine: dates.length >= 2 && weeks.size >= 2
  }
}
