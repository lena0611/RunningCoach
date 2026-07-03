import { computed, ref, watch } from 'vue'
import { useLevelStore } from '@/app/stores/levelStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useSessionIntentStore } from '@/app/stores/sessionIntentStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { isInjuryProbeEligible } from '@/entities/training-memory/model'
import type { TrainingMemory } from '@/entities/training-memory/model'
import { selectNextProbe, type InjuryProbeDef } from '@/entities/training-memory/injuryKnowledge'
import { shouldOfferRecoveryRun } from '@/entities/training-memory/restWindow'
import { resolveRunnerProgress } from '@/shared/lib/level/levelModel'
import { collectCoachMoments, type CoachMomentOption } from '@/shared/lib/coaching/coachMoments'
import { detectScheduleDeviation } from '@/shared/lib/coaching/scheduleRealign'
import { assessGoalFeasibility, buildWeekSummary, goalArchetype } from '@/shared/lib/coaching/periodizedSchedule'
import { weekEndTriage } from '@/shared/lib/coaching/weeklyTriage'
import { buildDoubleSuggestion, evaluateDoubleEligibility, type DoubleEligibility } from '@/shared/lib/coaching/doubleSession'
import type { CriterionStatus } from '@/shared/lib/coaching/progressionCriteria'
import { sessionTypeLabel } from '@/shared/lib/coaching/sessionBriefing'
import { dateOnly, diffDaysIso, type useTrainingWeek } from '@/pages/dashboard/useTrainingWeek'
import { loadMomentDismissals, persistMomentDismissal, type MomentDismissalMap } from './momentDismissal'

/*
 * 코치 모먼트 상태 공유 composable (리디자인 ①b — CoachPage 에서 추출, 값 의미 무변경).
 * 요약 홈(CoachInsights 1장)과 코치 탭(모먼트 카드 + 트리아지/더블 시트 데이터)이
 * 같은 모먼트 엔진(collectCoachMoments)·같은 입력으로 top 모먼트를 계산한다 — 두 탭 간 코치 발화 불일치 방지.
 */

type TrainingWeek = ReturnType<typeof useTrainingWeek>

// dismiss 는 모듈 스코프(세션 공유) — 요약·코치 어느 탭에서 닫아도 같은 모먼트가 다른 탭에 재노출되지 않는다.
// + 로컬 영속(momentDismissal, 7일 쿨다운): 닫거나 답한 모먼트는 앱을 다시 열어도 재노출하지 않는다
//   ("한 번 응답하면 다시 닦달하지 않는다" — SSOT §주말 트리아지의 모먼트 일반화. 기존엔 메모리에만 있어
//   앱 재시작마다 같은 질문이 반복됐다).
let dismissalMap: MomentDismissalMap = loadMomentDismissals(new Date())
const dismissedMomentKeys = ref(new Set<string>(Object.keys(dismissalMap)))
// 프로브 답 영속 in-flight 가드(두 탭 인스턴스 공유) — memoryStore.update 중복 쓰기 방지.
const probeSaving = ref(false)

export function useCoachMoments(week: TrainingWeek) {
  const memoryStore = useMemoryStore()
  const levelStore = useLevelStore()
  const scheduleStore = useTrainingScheduleStore()
  const sessionIntentStore = useSessionIntentStore()

  const {
    runs,
    today,
    todayDate,
    activeGoal,
    activeInjury,
    chronicLoad,
    currentWeeklyKm,
    raceProjection,
    restState,
    hasSchedule,
    adaptiveProgress
  } = week

  const runnerProgress = computed(() =>
    resolveRunnerProgress(memoryStore.memory.athleteProfile, runs.value, today.value, {
      maxDistanceM: levelStore.selfReportedMaxDistanceM
    })
  )
  // 최근 한계 시험(TT) 결과(#411): self-race 태그 또는 type 'Race' 런 중 가장 최근. 3일 내면 승급 연결 메시지.
  const timeTrialResult = computed(() => {
    const tt = runs.value.find((r) => r.tags?.includes('self-race') || r.type === 'Race')
    if (!tt) return null
    const daysAgo = Math.round((today.value.getTime() - new Date(`${tt.date}T00:00:00`).getTime()) / 86400000)
    if (daysAgo < 0 || daysAgo > 3) return null
    const p = runnerProgress.value
    return {
      daysAgo,
      nextClassLabel: p.nextClass?.label ?? null,
      gatePercent: p.gate1?.percent ?? null,
      eligible: Boolean(p.gate1?.eligible)
    }
  })

  // #395 목표 실현가능성: 현재 체력 대비 목표가 무리면 코치가 솔직히 경고+대안(coach-moment로 노출).
  const goalFeasibility = computed(() =>
    activeGoal.value
      ? assessGoalFeasibility({
          goal: activeGoal.value,
          profile: memoryStore.memory.athleteProfile,
          today: today.value,
          currentWeeklyKm: currentWeeklyKm.value
        })
      : null
  )

  // 코치 보이스(#473 PR3)용 휴식 컨텍스트: active 중 닦달 억제 + "푹 쉬세요"(선언 직후 회복주 1회) /
  // 복귀 전후(0~2일) "회복 후 정리" / 긴 휴식(>4주) 목표 재점검. coachMoments 가 톤·억제를 담당한다.
  const restMomentCtx = computed(() => {
    const meta = memoryStore.memory.activeRest
    if (!meta) return null
    const s = restState.value
    const todayIso = todayDate.value
    // declaredAt 은 UTC ISO 타임스탬프 → 로컬 캘린더 날짜로 환산해 todayIso(로컬)와 같은 기준으로 비교(TZ 어긋남 방지).
    const daysSinceDeclared = diffDaysIso(todayIso, dateOnly(new Date(meta.declaredAt)))
    return {
      active: s.active,
      reason: s.reason,
      daysUntilReturn: s.daysUntilReturn,
      justDeclared: daysSinceDeclared >= 0 && daysSinceDeclared <= 1,
      // 회복주 게이트(이유·공존 부상 severity)는 엔티티 도메인 함수에서 판정해 플래그로 넘긴다(#397 — shared 에 도메인 안 쌓기).
      offerRecoveryRun: shouldOfferRecoveryRun(s.reason, activeInjury.value?.severity ?? null)
    }
  })

  // 위크 요약(이번 주 단계·포커스·핵심·볼륨·D-day) — "이번 주가 통째로 뭘 위한 주인지"
  const activeArchetype = computed(() => (activeGoal.value ? goalArchetype(activeGoal.value.category) : 'performance'))
  const weekSummary = computed(() =>
    buildWeekSummary(scheduleStore.sessions, today.value, activeGoal.value?.targetDate ?? null, activeArchetype.value)
  )

  // 플랜 시작일(가장 이른 세션 날짜). 이 날짜 이전 런은 "플랜 없던 시절"이라 추가런 판정에서 제외.
  const scheduleStartDate = computed(() =>
    scheduleStore.sessions.reduce<string | null>((min, s) => (!min || s.date < min ? s.date : min), null)
  )

  // §5 Phase C — 부상 감별 grill "1문항" 능동 코치 모먼트. 활성 부상의 미답 프로브를 부상 id 변경 시 1회 스냅샷한다.
  // "한 세션 1문항(피로 방지)": 답해도 같은 포커스 동안 다음 문항으로 자동 전진하지 않게 probeAnswers 변화엔 재계산하지 않는다
  // (스냅샷이 고정 → 답을 골라도 그 프로브 모먼트가 응답을 계속 보여주고, 다음 프로브는 다음 앱 열림/부상 변경 때).
  const injuryProbeSnapshot = ref<InjuryProbeDef | null>(null)
  watch(
    () => activeInjury.value?.id ?? null,
    () => {
      const inj = activeInjury.value
      // #3 monitoring 게이트: active=항상, monitoring=재발 시만, resolved/archived=안 띄움(감별은 급성기 도구).
      injuryProbeSnapshot.value =
        inj && isInjuryProbeEligible(inj, today.value)
          ? selectNextProbe(inj.normalizedAreas.map((a) => a.areaId), Object.keys(inj.probeAnswers ?? {}))
          : null
    },
    { immediate: true }
  )
  const painProbeCtx = computed(() => {
    const probe = injuryProbeSnapshot.value
    const inj = activeInjury.value
    if (!probe || !inj) return null
    return {
      injuryItemId: inj.id,
      probeId: probe.id,
      question: probe.question,
      options: probe.options.map((o) => ({ label: o.label, response: o.response, sentiment: o.sentiment, value: o.value, subtype: o.subtype }))
    }
  })

  // === 주말 트리아지 ===
  const weekendTriageData = computed(() =>
    activeGoal.value
      ? weekEndTriage(scheduleStore.sessions.filter((s) => s.goalId === activeGoal.value!.id), today.value)
      : null
  )

  // === 같은 날 더블(#455) ===
  // 단일 quality 적응 신호(tempo-ceiling-quality) — 적격 게이트 입력. 없으면 'n/a'.
  const qualityAdaptationStatus = computed<CriterionStatus>(
    () => adaptiveProgress.value.criteria.find((c) => c.id === 'tempo-ceiling-quality')?.status ?? 'n/a'
  )
  const doubleEligibility = computed<DoubleEligibility>(() =>
    evaluateDoubleEligibility({
      memory: memoryStore.memory,
      runs: runs.value,
      qualityAdaptation: qualityAdaptationStatus.value,
      today: today.value
    })
  )
  // 코치 자동제안 신호(따라잡기 — 주말 트리아지의 자매 갈래). 적격·급성부하·백로그를 라이브러리가 판단.
  const doubleSuggestionData = computed(() =>
    buildDoubleSuggestion({
      sessions: scheduleStore.sessions,
      memory: memoryStore.memory,
      runs: runs.value,
      qualityAdaptation: qualityAdaptationStatus.value,
      chronicSpike: chronicLoad.value.status === 'spike',
      today: today.value
    })
  )

  // 코치 모먼트 엔진(#382): 유의미한 순간(부상·부하·추가런 등) 감지 → 우선순위로 적시 노출.
  const attributedRunIds = computed(() => {
    const ids = new Set<string>()
    for (const s of scheduleStore.sessions) if (s.runId) ids.add(s.runId)
    for (const i of sessionIntentStore.intents) if (i.runId) ids.add(i.runId)
    return ids
  })
  const coachMoments = computed(() =>
    collectCoachMoments(
      {
        runs: runs.value,
        attributedRunIds: attributedRunIds.value,
        chronic: chronicLoad.value,
        injury: activeInjury.value,
        today: today.value,
        painProbe: painProbeCtx.value,
        scheduleExists: hasSchedule.value,
        scheduleStartDate: scheduleStartDate.value,
        deviation: detectScheduleDeviation(scheduleStore.sessions, today.value),
        weekendTriage: weekendTriageData.value
          ? {
              saveLabel: sessionTypeLabel(weekendTriageData.value.saveSession.sessionType),
              releaseCount: weekendTriageData.value.releaseSessions.length
            }
          : null,
        goalProgress: raceProjection.value
          ? {
              readinessScore: raceProjection.value.readinessScore,
              readinessLevel: raceProjection.value.readinessLevel,
              dDayText: weekSummary.value?.dDayText ?? ''
            }
          : null,
        goalFeasibility: goalFeasibility.value,
        timeTrialResult: timeTrialResult.value,
        doubleSuggestion: doubleSuggestionData.value
          ? { backlogLabel: doubleSuggestionData.value.backlogLabel, amDayLabel: doubleSuggestionData.value.amDayLabel }
          : null,
        rest: restMomentCtx.value
      },
      dismissedMomentKeys.value
    )
  )
  const topCoachMoment = computed(() => coachMoments.value[0] ?? null)
  function dismissMoment(key: string) {
    dismissalMap = persistMomentDismissal(dismissalMap, key, new Date())
    dismissedMomentKeys.value = new Set([...dismissedMomentKeys.value, key])
  }

  /**
   * 부상 감별 grill 프로브 답(§5 Phase C)을 부상 항목에 영속한다 — probeAnswers[probeId]=value + (있으면) subtypeResolved.
   * App.vue submitInjuryCheckIn 패턴 미러(clone → 항목 갱신 → memoryStore.update). 모먼트는 닫지 않아 코치 응답이 계속 보인다.
   * ⚠ 비파괴 add 전용(probeAnswers 1키 추가 + subtypeResolved 1개). 다른 메모리 라이터와 겹친 덮어쓰기를 막으려 in-flight 가드를 둔다 —
   *    이 액션을 destructive(기존 항목 삭제/덮어쓰기)하게 확장하지 말 것.
   */
  async function onMomentSelect(option: CoachMomentOption, momentKey?: string) {
    // 답변한 모먼트는 재닦달 금지 대상 — 영속만 하고 reactive set 은 안 건드려
    // 이번 세션의 코치 응답 표시는 유지한다(다음 앱 실행부터 쿨다운 동안 숨김).
    if (momentKey) dismissalMap = persistMomentDismissal(dismissalMap, momentKey, new Date())
    const probe = option.probe
    if (!probe || probeSaving.value) return
    probeSaving.value = true
    try {
      const memory = cloneMemory(memoryStore.memory)
      const item = memory.injuryItems.find((entry) => entry.id === probe.injuryItemId)
      if (!item) return
      item.probeAnswers = { ...(item.probeAnswers ?? {}), [probe.probeId]: probe.value }
      if (probe.subtype) item.subtypeResolved = probe.subtype
      item.updatedAt = new Date().toISOString()
      await memoryStore.update(memory)
    } finally {
      probeSaving.value = false
    }
  }
  function cloneMemory(memory: TrainingMemory): TrainingMemory {
    return JSON.parse(JSON.stringify(memory))
  }

  return {
    runnerProgress,
    timeTrialResult,
    goalFeasibility,
    weekSummary,
    scheduleStartDate,
    weekendTriageData,
    doubleEligibility,
    doubleSuggestionData,
    coachMoments,
    topCoachMoment,
    dismissMoment,
    onMomentSelect
  }
}
