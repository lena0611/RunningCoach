/**
 * 부상 감별 → 코치 주입 어댑터 (§2-A 데이터 신호 + §4 redFlag + §5 coach-run 소비).
 *
 * 역할: 활성 부상 + 보유 런 데이터로 (1) §2-A 데이터 신호를 결정론으로 산출하고,
 *       (2) KB(injuryKnowledge)의 rankInjuryHypotheses 로 상위 1~2 과사용 가설을 좁혀,
 *       (3) 체크인에서 모은 신호로 evaluateRedFlags 를 돌려, coach-run client-summary 로 주입할 묶음을 만든다.
 *
 * 위치: 도메인(entities) 레이어 — KB·model 과 같은 층이고, 런 집계는 하위 shared(runStats)에서 가져온다(FSD 정방향).
 *       (이 어댑터는 도메인 로직이라 shared 에 두지 않는다 — 아키텍처 경계 래칫 #397.)
 * 경계:
 *  - KB(injuryKnowledge)가 감별·레버의 단일 SSOT. 이 어댑터는 "런 데이터 → KB 입력" 변환 + coach 주입 포맷만 담당(이중구현 금지).
 *  - redFlag 가 켜지면 가설·레버보다 의뢰가 우선(소비측 instruction 에서 강제). 의사 흉내 금지·"가능성"으로만.
 *  - do-not 가드(§6): 성별·정적 생체역학·BMI·strike·"근력=RRI감소" 는 데이터 신호에 넣지 않는다. 케이던스는 보조(저가중).
 */
import type { RunLog } from '@/entities/run/model'
import { getAcwr, getCadenceTrend, getChronicLoadTrend, getRunsWithinDays, sumDistance } from '@/shared/lib/runStats'
import type { TrainingInjuryItem, TrainingMemory } from './model'
import { getActiveInjuryItem, getInjuryNoImprovementWeeks } from './model'
import {
  INJURY_LEVER_LABEL,
  evaluateRedFlags,
  injuryAreaBase,
  injuryProbes,
  rankInjuryHypotheses,
  type InjuryDataSignals,
  type InjuryHypothesis,
  type RedFlagSignals
} from './injuryKnowledge'

// §2-A 임계: 족저근막 비선형↑ 절대 고볼륨(≥41km/주, 숙련 맥락), 주간 급증(ITBS >15%·종아리 ~25% → 일반 임계 15%).
const HIGH_WEEKLY_VOLUME_KM = 41
const WEEKLY_INCREASE_HIGH_PCT = 15
// 직전 주 베이스가 너무 작으면 %가 노이즈 → 미평가(저볼륨에서 +몇 km가 수백 %로 잡히는 것 방지).
const WEEKLY_INCREASE_MIN_BASELINE_KM = 10

/**
 * 런 데이터에서 §2-A 부상 데이터 신호를 결정론으로 산출한다(코드가 아는 것만, 안 물어봄).
 * 켜진 신호만 true 로 채운다(없으면 미설정 → rankInjuryHypotheses 가 자연히 무시).
 * ⚠ 지면(groundUphill/Downhill)·페이스(paceSpike)는 신뢰할 만한 per-run 베이스라인이 필요해 이번 증분에서 보류한다
 *    (랭킹은 누락 신호 없이도 graceful degrade). 부하/케이던스/재발만 산출.
 */
export function buildInjuryDataSignals(
  memory: TrainingMemory,
  runs: RunLog[],
  activeInjury: TrainingInjuryItem | null,
  today = new Date()
): InjuryDataSignals {
  const signals: InjuryDataSignals = {}

  const acwr = getAcwr(runs, today)
  if (acwr !== null && acwr > 1.5) signals.acwrSpike = true

  const chronic = getChronicLoadTrend(runs, today)
  if (chronic.status === 'spike' || chronic.status === 'rising') signals.chronicRising = true

  const cadence = getCadenceTrend(runs, today)
  if (cadence.status === 'low' || cadence.status === 'dropping') signals.cadenceLow = true

  const last7Runs = getRunsWithinDays(runs, 7, today)
  const last7 = sumDistance(last7Runs)
  if (last7 >= HIGH_WEEKLY_VOLUME_KM) signals.highWeeklyVolume = true

  const prev7 = sumDistance(getRunsWithinDays(runs, 14, today).filter((run) => !last7Runs.some((recent) => recent.id === run.id)))
  if (prev7 >= WEEKLY_INCREASE_MIN_BASELINE_KM && (last7 - prev7) / prev7 >= WEEKLY_INCREASE_HIGH_PCT / 100) {
    signals.weeklyIncreaseHigh = true
  }

  if (activeInjury && hasSameAreaRecurrence(memory, activeInjury)) signals.recurrence = true

  return signals
}

/** 같은 부위 재발 이력(§2-A) — 활성 부상에 재발 표시(lastFlareDate)가 있거나, 같은 부위 base 의 다른 부상 에피소드가 있으면 true. */
function hasSameAreaRecurrence(memory: TrainingMemory, active: TrainingInjuryItem): boolean {
  if (active.lastFlareDate) return true
  const activeBases = new Set(active.normalizedAreas.map((selection) => injuryAreaBase(selection.areaId)))
  if (!activeBases.size) return false
  return memory.injuryItems.some(
    (item) =>
      item.id !== active.id &&
      item.status !== 'archived' &&
      item.normalizedAreas.some((selection) => activeBases.has(injuryAreaBase(selection.areaId)))
  )
}

/**
 * grill 프로브 답변(§5 Phase C)에서 red-flag 자가검사 신호를 뽑는다. probeAnswers[probeId]=value 를
 * KB(injuryProbes)에서 역조회해 그 옵션의 redFlagSelfTest 키를 켠다. KB가 SSOT — 저장은 value 만, redFlag 는 읽기 시 파생.
 */
function redFlagSignalsFromProbeAnswers(active: TrainingInjuryItem): RedFlagSignals {
  const out: RedFlagSignals = {}
  const answers = active.probeAnswers
  if (!answers) return out
  for (const [probeId, value] of Object.entries(answers)) {
    const option = injuryProbes.find((probe) => probe.id === probeId)?.options.find((opt) => opt.value === value)
    for (const key of option?.redFlagSelfTest ?? []) (out as Record<string, boolean>)[key] = true // 프로브 자가검사는 모두 boolean 키
  }
  return out
}

/**
 * 체크인 + grill 프로브에서 구조화된 redFlag 입력을 모은다(§4). 체크인: 체중부하 통증·진행성 악화.
 * 프로브: 화끈/저림·점통+hop·부종·고위험 골부위·체중부하 곤란/잠김 등 부위특이 자가검사(§5 Phase C).
 */
function redFlagSignalsFromInjury(active: TrainingInjuryItem, today: Date, slowRecovery: boolean): RedFlagSignals {
  const probeSignals = redFlagSignalsFromProbeAnswers(active)
  const latest = active.checkInHistory[0] ?? null
  // ⚠ worseningOverTime 은 §4 "활동·시간이 갈수록 심해지고"(여러 날 진행성)다 — 단발 체크인의
  //   worsenedDuringOrAfterRun(지난 1회 러닝에서 더 신경 쓰임)을 그대로 넣으면 피로골절 경계가 과발동한다.
  //   최근 2회 연속 체크인이 모두 "악화"여야 진행성으로 본다(트렌드, 단일 러닝 신호 아님 — 코치리뷰 should-fix).
  const [first, second] = active.checkInHistory.slice(0, 2)
  const progressiveWorsening =
    active.checkInHistory.length >= 2 && !!first?.worsenedDuringOrAfterRun && !!second?.worsenedDuringOrAfterRun
  return {
    // 프로브 자가검사 신호를 먼저 깔고, 체크인 신호는 OR 로 합친다(둘 중 하나라도 켜지면 켬).
    ...probeSignals,
    dailyActivityPain: (latest?.dailyActivityPain || probeSignals.dailyActivityPain) || undefined,
    worseningOverTime: (progressiveWorsening || probeSignals.worseningOverTime) || undefined,
    // §4 "6주(연부조직)~3개월(난치) 무호전". 이 값을 **채우는 곳이 없어서** 해당 redFlag 는 지금까지
    // 한 번도 켜질 수 없었다(#817, 2026-09-16). 임계(≥6주)는 evaluateRedFlags 가 갖는다 — 한 곳에.
    noImprovementWeeks: getInjuryNoImprovementWeeks(active, today) ?? undefined,
    slowRecovery: slowRecovery || undefined
  }
}

/** 가설의 prevention 레버를 사람이 읽는 라벨로(중복 제거). */
function uniqueLeverLabels(hypothesis: InjuryHypothesis): string[] {
  const levers = hypothesis.prevention.flatMap((prevention) => prevention.levers)
  return [...new Set(levers)].map((lever) => INJURY_LEVER_LABEL[lever])
}

/** coach-run 으로 보낼 가설 1건. 진단이 아니라 "가능성" — possibility=가설명, why=감별 단서, levers=조절 레버. */
export type CoachInjuryHypothesis = { possibility: string; levers: string[]; why: string }

export type CoachInjurySignals = {
  /**
   * 이 신호가 **어느 부상을 평가한 것인가**. 서버는 선택 세션 날짜 기준으로 당시 부상을 고르므로
   * (getActiveInjuryItemForRunDate), 현재 부상과 다를 수 있다. 그때 이 신호를 그대로 쓰면 **다른 부상에
   * 통증 허용 규칙이 붙는다**(Codex 교차검증 4차 지적). 서버가 id 를 대조해 일치할 때만 적용한다.
   */
  injuryId: string
  areaLabel: string
  severity: number | null
  hypotheses: CoachInjuryHypothesis[]
  redFlag: { tripped: boolean; reasons: string[] }
  /**
   * Pain-Monitoring Model(§3-B "기준선 복귀면 견딘 것")을 이 부상에 적용해도 되는가.
   * 부하성 건/근막 질환에서만 true — MTSS 처럼 **무통증 게이트**를 쓰는 질환에 주면 §3 과 충돌한다.
   */
  painMonitoringApplies: boolean
}

/**
 * 활성 부상 + 데이터로 상위 1~2 과사용 가설 + 레버 + redFlag 를 산출(coach-run client-summary 주입용, §5).
 * 활성 부상이 없거나(active null) 보낼 게 전혀 없으면(가설·redFlag 모두 없음) null — currentWeather/restState 게이팅 패턴.
 * coach-run 은 이 결과만 받아 narrative 를 만든다(KB 전문 미전송, 프롬프트 크기 절약).
 */
export function buildInjuryCoachSignals(memory: TrainingMemory, runs: RunLog[], today = new Date()): CoachInjurySignals | null {
  const active = getActiveInjuryItem(memory)
  if (!active) return null

  const areaIds = active.normalizedAreas.map((selection) => selection.areaId)
  const signals = buildInjuryDataSignals(memory, runs, active, today)
  // grill 답변(§2-B)을 랭킹에 반영 — 사용자가 고른 결정적 지문이 상위 "가능성"을 좁힌다(물어본 답을 무시하지 않음).
  // 표시용은 상위 2개지만, **안전 판정은 후보 전체**로 한다(Codex 교차검증 2026-09-16 2차 지적).
  // 다부위 부상(발바닥+아킬레스+정강이)에서 동점이면 카탈로그 순서로 MTSS 가 top-2 밖으로 밀리는데,
  // 그 잘린 목록으로 "전부 느린 경과"라 읽으면 MTSS 의 8주 무호전 의뢰 신호가 사라진다.
  const rankedAll = rankInjuryHypotheses(areaIds, signals, active.probeAnswers ?? {})
  const ranked = rankedAll.slice(0, 2)
  /**
   * 부하성 건/근막 질환인가 — **every** 다(some 아님, Codex 교차검증 지적 수용 2026-09-16).
   *
   * top-2 는 comorbid 를 보존하는 **동반 표시 목록**이지 확정이 아니다(§2-B). some() 으로 읽으면
   * 햄스트링에서 좌상(빠른 경과)이 1위여도 PHT 가 항상 2위에 남아 좌상까지 임계가 12주로 늘어난다
   * — 8주 무호전 좌상의 의뢰 신호가 사라진다. **빠른 경과 후보가 하나라도 남아 있으면 보수적으로 간다.**
   */
  // ⚠ 후보 목록만 보면 **KB 밖 부위(발목·대퇴사두·요추)가 조용히 사라진다** — rankInjuryHypotheses 는
  // 매핑되는 부위만 돌려주므로, 발바닥+발목을 함께 등록하면 발목이 빠진 채 "전부 느린 경과"가 된다
  // (Codex 교차검증 3차 지적). 선택한 **모든 부위**가 부하성 후보로 설명될 때만 완화한다.
  const coveredBases = new Set(rankedAll.flatMap((entry) => entry.hypothesis.areaBases))
  const everyAreaExplained = areaIds.length > 0 && areaIds.every((areaId) => coveredBases.has(injuryAreaBase(areaId)))
  const loadTolerant =
    rankedAll.length > 0 &&
    everyAreaExplained &&
    rankedAll.every((entry) => entry.hypothesis.loadTolerantTendinopathy === true)
  const redFlag = evaluateRedFlags(redFlagSignalsFromInjury(active, today, loadTolerant))

  // 부위가 KB 스코프 밖(ankle/quad/lower-back)이라 가설이 없고 redFlag 도 없으면 보낼 게 없다.
  if (!ranked.length && !redFlag.tripped) return null

  const hypotheses = ranked.map((entry) => {
    // grill 로 아형이 해소됐고(§5 Phase C) 그게 이 가설의 아형이면 가능성 라벨을 정밀화한다(예 "아킬레스 건병증(부착부)").
    const subtype = active.subtypeResolved
      ? entry.hypothesis.subtypeSplit?.find((split) => split.id === active.subtypeResolved)
      : undefined
    return {
      possibility: subtype ? `${entry.hypothesis.label}(${subtype.label})` : entry.hypothesis.label,
      levers: uniqueLeverLabels(entry.hypothesis),
      why: entry.hypothesis.hallmark
    }
  })

  return { injuryId: active.id, areaLabel: active.area, severity: active.severity, hypotheses, redFlag, painMonitoringApplies: loadTolerant }
}
