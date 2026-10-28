/**
 * 완전 초보의 걷기·뛰기 시작 프로그램 (#870) — NHS Couch to 5K 9주 사다리.
 *
 * SSOT: running-coaching-standards.md §목표 타입별 건강·습관("초보는 run-walk·점진")·§시작점 앵커링 신규 사용자 항목.
 * 부상 복귀 walk-run(walkRunReturn.ts, OSU RTR)과는 대상이 다르다 — 그쪽은 통증이 단계를 정하고, 이쪽은 아직
 * 연속으로 뛰어 본 적 없는 사람이 "뛸 수 있는 몸"을 만드는 과정이다. 둘 다 해당하면 부상 쪽이 먼저다.
 *
 * 대상: 아직 5K 를 완주해 본 적 없는 러너(레벨 거리 클래스 '입문' — 온보딩 자기보고·실제 런 모두 5km 미만).
 * 단계: 완료한 런 수로 C25K 순서를 따라간다(주 3회 × 9주 = 27회). NHS 는 "필요하면 회차·주차를 반복해도
 * 괜찮다"고 하므로 자동 진행은 **제안**이고, 화면이 반복해도 된다고 함께 말한다.
 * 27회를 마치면(연속 30분) 일반 이지 지침으로 넘어간다.
 *
 * 출처(2026-10-26 원문 대조): https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/
 * 모든 회차 = 걷기 5분 → 본세트 → 걷기 5분.
 */

export type BeginnerWalkRunStage = {
  /** C25K 주차(1~9)·회차(1~3). */
  week: number
  run: number
  /** 본세트 한 줄(걷기 5분 앞뒤 제외). */
  mainSet: string
  /** 앞뒤 걷기 포함 총 시간(분, NHS 표기). */
  totalMin: number
}

export type WalkRunSession = { mainSet: string; totalMin: number }

const W = (mainSet: string, totalMin: number): WalkRunSession => ({ mainSet, totalMin })

/** 주차별 3회차. 1~4·7~9주는 세 회차가 같고 5·6주만 다르다. 코치 탭 '9주 과정' 시트도 이 표를 그대로 보여준다. */
export const C25K: WalkRunSession[][] = [
  [W('뛰기 1분 → 걷기 1분 30초를 7번, 마지막에 뛰기 1분', 28.5)],
  [W('뛰기 1분 30초 → 걷기 2분을 5번, 마지막에 뛰기 1분 30초', 29)],
  [W('뛰기 1분 30초 → 걷기 1분 30초 → 뛰기 3분 → 걷기 3분 → 뛰기 1분 30초 → 걷기 1분 30초 → 뛰기 3분', 25)],
  [W('뛰기 3분 → 걷기 1분 30초 → 뛰기 5분 → 걷기 2분 30초 → 뛰기 3분 → 걷기 1분 30초 → 뛰기 5분', 31.5)],
  [
    W('뛰기 5분 → 걷기 3분 → 뛰기 5분 → 걷기 3분 → 뛰기 5분', 31),
    W('뛰기 8분 → 걷기 5분 → 뛰기 8분', 31),
    W('쉬지 않고 20분 뛰기', 30)
  ],
  [
    W('뛰기 5분 → 걷기 3분 → 뛰기 8분 → 걷기 3분 → 뛰기 5분', 34),
    W('뛰기 10분 → 걷기 3분 → 뛰기 10분', 33),
    W('쉬지 않고 25분 뛰기', 35)
  ],
  [W('쉬지 않고 25분 뛰기', 35)],
  [W('쉬지 않고 28분 뛰기', 38)],
  [W('쉬지 않고 30분 뛰기', 40)]
]

const RUNS_PER_WEEK = 3
export const C25K_TOTAL_RUNS = C25K.length * RUNS_PER_WEEK

/**
 * 지금 해당하는 단계. 초보가 아니면(5K 완주 경험 있음 · 27회 완료) null.
 * runs 는 완료한 러닝 기록 — 개수가 진행도, 최장 거리가 5K 완주 여부다.
 */
export function beginnerWalkRunStage(
  selfReportedMaxDistanceM: number | null,
  // 엔티티 타입(RunLog)을 직접 import 하지 않는다 — shared→entities 역방향 의존을 늘리지 않기 위함(#397 래칫).
  runs: Array<{ distanceKm: number | null }>
): BeginnerWalkRunStage | null {
  const longestM = runs.reduce((max, run) => Math.max(max, (run.distanceKm ?? 0) * 1000), 0)
  const completedM = Math.max(selfReportedMaxDistanceM ?? 0, longestM)
  if (completedM >= 5000 || runs.length >= C25K_TOTAL_RUNS) return null
  const weekIndex = Math.floor(runs.length / RUNS_PER_WEEK)
  const runIndex = runs.length % RUNS_PER_WEEK
  const week = C25K[weekIndex]
  const session = week[Math.min(runIndex, week.length - 1)]
  return { week: weekIndex + 1, run: runIndex + 1, mainSet: session.mainSet, totalMin: session.totalMin }
}

/** "어떻게 뛰나" — 저강도 세션의 연속주 지침을 대신한다. 거리는 참고, 기준은 시간이다. */
export function beginnerWalkRunSteps(stage: BeginnerWalkRunStage, distanceKm: number | null): Array<{ label: string; detail: string }> {
  const steps = [
    { label: '웜업', detail: '빠르게 걷기 5분' },
    { label: '본세트', detail: `${stage.mainSet} — 뛰는 구간도 대화가 될 만큼 천천히. 숨이 차면 걷기를 늘려도 괜찮아요` },
    { label: '쿨다운', detail: '걷기 5분으로 마무리' },
    {
      label: '오늘의 기준',
      detail: `시간이에요(앞뒤 걷기 포함 약 ${Math.round(stage.totalMin)}분)${distanceKm ? ` — 거리(약 ${distanceKm}km)는 참고만` : ''}`
    },
    {
      label: '단계',
      detail: `Couch to 5K ${stage.week}주차 ${stage.run}회차예요. 버거웠으면 같은 회차를 한 번 더 해도 괜찮아요 — 단계는 달력이 아니라 몸이 정해요`
    }
  ]
  return steps
}

export const BEGINNER_WALK_RUN_KEY_POINT = '걷기를 섞는 게 정답이에요 — 뛰는 구간도 숨차지 않게, 힘들면 걷기를 늘려요.'
