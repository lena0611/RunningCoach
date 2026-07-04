import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useSessionIntentStore } from '@/app/stores/sessionIntentStore'
import { useToastStore } from '@/app/stores/toastStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { getActiveGoal, getActiveInjuryItem } from '@/entities/training-memory/model'
import type { ActiveRest, TrainingGoal } from '@/entities/training-memory/model'
import { deriveRestState } from '@/entities/training-memory/restWindow'
import { isActiveSession, type ScheduledSession } from '@/entities/training-schedule/model'
import { isSelfRaceRun } from '@/entities/competition/model'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { getAgeLoadWeight, getChronicLoadTrend, getLongestRunKmWithinDays, getNextSessionRecommendation, type NextSessionRecommendation } from '@/shared/lib/runStats'
import { getRaceProjection } from '@/shared/lib/performanceProjection'
import { deriveHeartRateModel, deriveObservedMaxHr } from '@/shared/lib/heartRateZones'
import { returnRampWindowSessions, returnSessionCapKm } from '@/shared/lib/coaching/returnRamp'
import { buildCoachAdaptiveProgress } from '@/shared/lib/coaching/coachAdaptiveProgress'
import { buildPeriodizedSchedule, buildSteadyWeeklyRhythm, goalArchetype, prescriptionFor, trainingWeekRange, withObservedEasy } from '@/shared/lib/coaching/periodizedSchedule'
import { deriveObservedEasyPace } from '@/shared/lib/coaching/observedEasyPace'
import { buildRealignedSchedule } from '@/shared/lib/coaching/scheduleRealign'
import { buildSessionBriefing, sessionTypeLabel, type SessionBriefing } from '@/shared/lib/coaching/sessionBriefing'
import { resolvePaceModel } from '@/shared/lib/vdotPaces'
import { buildSessionIntentDraft, type BuildSessionIntentArgs } from '@/features/build-session-intent/buildSessionIntentDraft'
import { formatDuration } from '@/shared/lib/format'
import type { CarouselDay } from '@/pages/coach/WeekTrainingCarousel.vue'

/*
 * 훈련 주간 상태 공유 composable (리디자인 ①b — 요약/코치 탭 분리, #275 이후 구조).
 * 대시보드(요약 히어로·휴식 컨트롤)와 코치 탭(주간 캐러셀·브리핑·시트)이 같은 스케줄 진실(store)을
 * 서로 독립 인스턴스의 computed 로 읽는다. 단 **쓰기 성 부트 절차(재추론→ensure→오늘 의도)는 모듈
 * 스코프 in-flight 가드로 단일 비행**을 보장한다 — 두 탭이 동시에 마운트돼도 골격 이중 생성이 없다.
 */

export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

export function dateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function diffDaysIso(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000)
}

export function dayAfterIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return dateOnly(d)
}

export function dayBeforeIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return dateOnly(d)
}

const EASY_FAMILY_TYPES = new Set(['Easy', 'Easy + Strides', 'Recovery', 'LSD', 'Steady Long'])

// === 모듈 스코프 쓰기 가드(요약·코치 두 인스턴스가 공유) ===
// in-flight 가드(B1): watch 가 여러 번(또는 두 탭에서) fire 해도 골격을 이중 생성하지 않는다.
let ensureInFlight: Promise<void> | null = null
// 과거 오분류 롱런 라벨 자가치유(로드당 1회·멱등·목표 비종속).
let reinferDone = false
let reinferInFlight: Promise<void> | null = null
// (#235 후속 S3) self-race 부하 제외로 인한 앵커 재수렴 deviation 토스트를 첫 빌드 1회만 억제하는 세션 플래그.
let selfRaceAnchorSettledOnce = false
// expireRestMetaIfOver 이중 발화(두 인스턴스 focus 리스너) 가드 — setActiveRest(null) 중복 쓰기 방지.
let expireRestInFlight = false

export type UseTrainingWeekOptions = {
  /** 이 인스턴스가 속한 탭 라우트('/', '/coach'). 해당 경로 재진입 시 컨텍스트를 새로고침한다. */
  routePath: string
  /** 새로고침 훅(예: 대시보드의 날씨 갱신). refreshContext 뒤에 호출된다. */
  onRefresh?: () => void
}

export function useTrainingWeek(options: UseTrainingWeekOptions) {
  const runStore = useRunStore()
  const memoryStore = useMemoryStore()
  const scheduleStore = useTrainingScheduleStore()
  const sessionIntentStore = useSessionIntentStore()
  const toastStore = useToastStore()

  const today = ref(new Date())
  const todayDate = computed(() => dateOnly(today.value))

  const runs = computed(() => runStore.sortedRuns)
  // #235/§10: 레이싱(self-race)을 제외한 '훈련용' 런. 부하·추세·예측·세션상태·디브리핑·주간미션 등
  // "레이싱은 훈련을 소비하지 않는다" 소비처가 전부 이걸 쓴다(레이싱 카드·TT 승급만 runs 유지).
  const trainingRuns = computed(() => runs.value.filter((run) => !isSelfRaceRun(run)))

  const activeGoal = computed(() => getActiveGoal(memoryStore.memory))
  const activeInjury = computed(() => getActiveInjuryItem(memoryStore.memory))
  const ageLoadWeight = computed(() => getAgeLoadWeight(memoryStore.memory.athleteProfile.birthYear, today.value))
  const observedMaxHr = computed(() => deriveObservedMaxHr(runs.value.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })), today.value))
  const heartRateModel = computed(() => deriveHeartRateModel(memoryStore.memory.athleteProfile, today.value.getFullYear(), observedMaxHr.value))
  // 관측 Easy 페이스(#405, A안): 실제 Easy 심박 이하에서 뛴 페이스. 있으면 VDOT 추정 대신 이걸로 처방(심박과 충돌 방지).
  const observedEasyPace = computed(() =>
    deriveObservedEasyPace(trainingRuns.value, heartRateModel.value.easyCeilingBpm, today.value, heartRateModel.value.recoveryCeilingBpm)
  )
  // 보정 PaceModel: Easy 계열 페이스를 관측값으로 덮은 모델(브리핑 표시 즉시 보정용).
  const calibratedPaceModel = computed(() => withObservedEasy(resolvePaceModel(memoryStore.memory.athleteProfile), observedEasyPace.value))

  const raceProjection = computed(() =>
    getRaceProjection(trainingRuns.value, activeGoal.value, today.value, activeInjury.value, ageLoadWeight.value, {
      easyCeilingBpm: heartRateModel.value.easyCeilingBpm,
      tempoCeilingBpm: heartRateModel.value.tempoCeilingBpm
    })
  )
  const nextSession = computed(() => getNextSessionRecommendation(memoryStore.memory, runs.value, today.value))

  // #235/§10: 부하·추세는 레이싱을 소비하지 않는다(이중계산·오염 방지) → 훈련용 런만 투입.
  const chronicLoad = computed(() => getChronicLoadTrend(trainingRuns.value, today.value, ageLoadWeight.value))
  // #395 시작 볼륨 앵커: 최근 30일 총거리 → 주간 평균(데이터 없으면 null → 엔진이 보수적 기본값).
  const currentWeeklyKm = computed(() => (chronicLoad.value.last30Km > 0 ? (chronicLoad.value.last30Km * 7) / 30 : null))

  // 휴식 선언 상태(#473): activeRest + 오늘 기준 파생(active·복귀 D-N·복귀일 등). 차분 배너·복귀 컨트롤이 쓴다.
  const restState = computed(() => deriveRestState(memoryStore.memory.activeRest, todayDate.value))

  // #339/#337: 훈련 단계 진행 평가 + 전환 제안(브리핑 progression 입력이자 코치 탭 단계 카드 데이터).
  const adaptiveProgress = computed(() => buildCoachAdaptiveProgress(runs.value, memoryStore.memory))

  /** 목표에 targetDate+거리가 있으면 골격 생성, 없으면 재정렬 점검(best-effort, no-op 안전). */
  function ensureSchedule(): Promise<void> {
    if (ensureInFlight) return ensureInFlight
    ensureInFlight = doEnsureSchedule().finally(() => {
      ensureInFlight = null
    })
    return ensureInFlight
  }

  /**
   * 스케줄 앵커(scheduleAnchorWeeklyKm)를 현재 체력으로 영속한다 — 매 (재)빌드·재앵커·최초 초기화 시.
   * tempoCeiling 채택 영속과 동일 메커니즘(memoryStore.update + adaptiveTrainingProfile 머지)을 쓴다.
   * 같은 값이면 no-op(불필요한 메모리 write·정규화 방지). null/≤0 은 저장하지 않는다.
   */
  async function persistScheduleAnchor(weeklyKm: number | null) {
    if (weeklyKm == null || weeklyKm <= 0) return
    const memory = memoryStore.memory
    if (memory.adaptiveTrainingProfile.scheduleAnchorWeeklyKm === weeklyKm) return
    await memoryStore.update({
      ...memory,
      adaptiveTrainingProfile: {
        ...memory.adaptiveTrainingProfile,
        scheduleAnchorWeeklyKm: weeklyKm,
        updatedAt: new Date().toISOString()
      }
    })
  }

  async function doEnsureSchedule() {
    if (!isSupabaseConfigured) return
    const goal = activeGoal.value
    if (!goal) return
    const archetype = goalArchetype(goal.category)
    // 성과는 목표일+거리 필요. 비성과(체중·체형/건강·습관)는 마감 없이 상시 리듬(#398).
    if (archetype === 'performance' && (!goal.targetDate || !goal.distanceKm)) return
    try {
      // 미로딩이거나 '다른 목표'가 로딩돼 있으면 활성 목표 세션으로 재로딩(#398 — 탭 복귀·목표 전환 stale 방지).
      if (!scheduleStore.loaded || scheduleStore.loadedGoalId !== goal.id) await scheduleStore.load(goal.id)
      // #235 후속 G4: self-race 가 점유한 세션·의도를 먼저 비운다(무태그·늦은태깅 잔재 치유, 멱등).
      // ⚠️ 순서 절대조건: heal → reconcile → settle. 또 reconcile/repoint 입력에서 self-race 를 빼야 멱등 수렴한다
      //    (안 그러면 heal 이 떼도 reconcile 이 self-race 를 곧장 다시 붙이는 도돌이).
      await runStore.healSelfRaceLinks()
      const trainingRunsForSchedule = runs.value.filter((r) => !isSelfRaceRun(r))
      // 이미 들어온 런(특히 매칭이 안 돌던 시절의 HealthKit 인입)을 예정 세션에 정합(done 치유).
      // 정산 전에 돌려야 수행했는데 planned 로 남은 세션이 missed 로 오확정되지 않는다.
      await scheduleStore.reconcileRuns(trainingRunsForSchedule)
      // 라벨 재추론(reinferRunTypesOnce)으로 타입이 바뀐 런이 같은 날 더 맞는 세션(예: LSD)에 잘못 연결돼 있으면
      // 그쪽으로 재연결(정산 전). "같은 날 Easy done·LSD missed" 더블 오매칭 치유.
      await scheduleStore.repointReinferredRuns(trainingRunsForSchedule)
      const mine = scheduleStore.sessions.filter((s) => s.goalId === goal.id)
      const hasActive = mine.some(isActiveSession)
      // 앵커 드리프트 기준선(영속). 빌드/재앵커 때마다 currentWeeklyKm 로 갱신해 ratio≈1 로 수렴(멱등).
      const anchor = memoryStore.memory.adaptiveTrainingProfile.scheduleAnchorWeeklyKm
      if (archetype !== 'performance') {
        // 비성과: 비주기화 상시 주간 리듬. 롤링 소진(활성 없음) 시 재생성. 재정렬 없음.
        if (!hasActive) {
          const drafts = buildSteadyWeeklyRhythm({
            archetype,
            profile: memoryStore.memory.athleteProfile,
            today: today.value,
            currentWeeklyKm: currentWeeklyKm.value,
            observedEasyPace: observedEasyPace.value,
            goalId: goal.id
          })
          if (drafts.length) {
            await scheduleStore.insertMany(drafts)
            await persistScheduleAnchor(currentWeeklyKm.value)
          }
        }
      } else if (!hasActive) {
        // 성과·콜드스타트: 주기화 골격 생성(currentWeeklyKm 앵커, #395).
        const drafts = buildPeriodizedSchedule({
          goal,
          profile: memoryStore.memory.athleteProfile,
          today: today.value,
          currentWeeklyKm: currentWeeklyKm.value,
          observedEasyPace: observedEasyPace.value
        })
        if (drafts.length) {
          await scheduleStore.insertMany(drafts)
          await persistScheduleAnchor(currentWeeklyKm.value)
        }
      } else {
        const rest = memoryStore.memory.activeRest
        const todayIso = dateOnly(today.value)
        if (rest && rest.untilDate < todayIso && !rest.returnRampApplied) {
          // 복귀 램프(#473 Phase 2) 자연 만료 경로: 휴식이 끝났는데 아직 강제 적용 안 했으면, drift 유무와 무관하게
          // 현재 체력 재앵커 + 초반 세션 Easy·캡으로 "회복 후 정리"를 1회 강제(SSOT 라인 89는 무조건적 복귀 처방).
          // 짧은 휴식(<7일, returnRampPayload=null)은 무램프 — 원래 계획대로 이어간다(단기 손실 무시 수준).
          // 자매 버그 가드(#473 후속): realign 의 supersedeSessionsFrom 은 planned/missed 만 비우고 rested 는 건드리지
          // 않는다. 그래서 자연만료 경로에서 오늘 이후의 옛 rested 행이 살아남아 복귀 후에도 💤 가 잔존하거나 같은
          // 날 rested+planned 가 공존할 수 있다. manual("지금 복귀") 경로(returnFromRestNow)는 unrestFrom 을 먼저
          // 호출해 이를 피하므로, 자연만료 경로도 동일하게 오늘 이후 rested 를 먼저 풀어(planned 화) realign 이 정리하게 한다.
          await scheduleStore.unrestFrom(goal.id, todayIso)
          const payload = returnRampPayload(rest)
          if (payload) await applyReturnRampDrafts(goal, payload)
          await memoryStore.setActiveRest({ ...rest, returnRampApplied: true })
        } else {
          // 성과·운영중: 누적 이탈/앵커 드리프트 시 forward 재정렬.
          // 복귀 윈도(메타 살아있는 isOver) 동안엔 returnRamp 를 재전달해 캡을 보존하고 generic 닦달 토스트를 억제한다.
          const returnRamp = rest && restState.value.isOver ? returnRampPayload(rest) : null
          // 앵커 미초기화(기존 사용자 첫 부팅 등) → 현재 체력으로 조용히 초기화하고 그 값을 기준선으로 넘긴다.
          // ratio≈1 이 되어 앵커 드리프트가 발동하지 않으므로 재정렬·토스트 없이 초기화만 일어난다.
          let anchorForCheck = anchor
          if (anchorForCheck == null) {
            await persistScheduleAnchor(currentWeeklyKm.value)
            anchorForCheck = currentWeeklyKm.value
          }
          const plan = buildRealignedSchedule(mine, goal, memoryStore.memory.athleteProfile, today.value, currentWeeklyKm.value, anchorForCheck, observedEasyPace.value, returnRamp)
          if (plan.drafts.length) {
            await scheduleStore.realign(goal.id, plan.fromDate, plan.drafts)
            // 재앵커 발생 → 기준선을 현재 체력으로 갱신(다음 부팅부터 ratio≈1 로 수렴, 영구 재발동 방지).
            await persistScheduleAnchor(currentWeeklyKm.value)
            // (#235 후속 S3) self-race 를 부하에서 제외한 '첫 빌드'에선 weeklyKm 이 한 단계 낮아져 "체력 변화 감지"
            // 토스트가 1회 오발할 수 있다. 사용자가 레이싱 기록을 가진 첫 수렴 빌드의 deviation 토스트만 1회 억제한다
            // (앵커가 새 값으로 수렴한 뒤의 진짜 deviation 은 정상 노출). 세션 1회.
            const suppressSelfRaceDrift = !selfRaceAnchorSettledOnce && runs.value.some((r) => isSelfRaceRun(r))
            if (plan.deviation.reason && !returnRamp && !suppressSelfRaceDrift) toastStore.success(plan.deviation.reason)
            selfRaceAnchorSettledOnce = true
          }
        }
      }
      // 주간 정산(무조건·멱등): 닫힌 주(월~일)의 미수행 planned → missed 확정. realign 시도 뒤에 둬서
      // 닫힌 주 누락이 재정렬 트리거로 먼저 평가되게 한다. 현재 주의 지난 날은 'open'(따라잡기 가능)으로 유지.
      await scheduleStore.settleClosedWeeks(goal.id, trainingWeekRange(today.value).start)
      // 휴식 선언(#473) 보존: realign/콜드스타트가 휴식 구간에 planned 를 새로 깔았으면 다시 rested 로 되돌린다
      // (builder 를 건드리지 않고 멱등 재적용 — 휴식 중 닦달 재발/중복카드 방지). 복귀일이 지나면 건너뛴다.
      // (만료 메타 해제는 expireRestMetaIfOver 가 스케줄 게이트와 무관하게 항상 처리한다.)
      const rest = memoryStore.memory.activeRest
      if (rest && rest.untilDate >= dateOnly(today.value)) {
        await scheduleStore.declareRest(goal.id, rest.startDate, rest.untilDate)
      }
    } catch {
      // best-effort: 스케줄 생성 실패가 대시보드를 막지 않는다.
    }
  }

  /**
   * 복귀 램프(#473 Phase 2) 페이로드 — 휴식 '기간'으로 초반 캡 세션 수·세션 거리 상한을 계산한다.
   * layoffDays = 휴식 기간(durationDays = untilDate-startDate+1) — '앱을 언제 다시 열었나'(경과일)가 아니라
   * 디트레이닝 손실 추정이어야 하므로(SSOT 라인 84). longLayoff(restWindow durationDays)와 동일 측정으로 통일.
   * 짧은 휴식(<7일)이면 windowSessions=0 → null(무램프, 원래 계획대로). capKm = 직전30일 최장+10%(자기조절).
   */
  function returnRampPayload(rest: ActiveRest): { capKm: number; windowSessions: number } | null {
    const layoffDays = diffDaysIso(rest.untilDate, rest.startDate) + 1
    const windowSessions = returnRampWindowSessions(layoffDays)
    if (windowSessions === 0) return null
    return { capKm: returnSessionCapKm(getLongestRunKmWithinDays(runs.value, 30, today.value)), windowSessions }
  }

  /**
   * 복귀 램프 강제 적용 — 현재(낮아진) 체력으로 forward 재앵커 + 초반 windowSessions 개 Easy·캡으로 점진 복원.
   * shouldRealign 게이트와 무관하게 항상 적용해 SSOT 라인 89 "복귀 초반 세션들 Easy·상한"을 보장한다(F1 수정).
   * generic 닦달 토스트 없음 — "회복 후 정리" 톤은 복귀 토스트/rest-return 모먼트가 담당.
   */
  async function applyReturnRampDrafts(goal: TrainingGoal, payload: { capKm: number; windowSessions: number }) {
    const drafts = buildPeriodizedSchedule({
      goal,
      profile: memoryStore.memory.athleteProfile,
      today: today.value,
      currentWeeklyKm: currentWeeklyKm.value,
      observedEasyPace: observedEasyPace.value,
      returnRamp: payload
    }).map((d) => ({ ...d, source: 'realign' as const }))
    if (drafts.length) await scheduleStore.realign(goal.id, dateOnly(today.value), drafts)
  }

  // 주 고정 데이-스트립(월~일) ± weekOffset 주. 오늘 중심 롤링이 아니라 "이번 주"를 한눈에 조망·조정(설계 2026-06-19).
  const weekOffset = ref(0)
  const todayWeekdayIndex = computed(() => (new Date(today.value).getDay() + 6) % 7) // 월=0
  function weekMonday(offsetWeeks: number): Date {
    const base = new Date(today.value)
    base.setDate(base.getDate() + offsetWeeks * 7)
    return new Date(`${trainingWeekRange(base).start}T00:00:00`)
  }
  const scheduleDays = computed<CarouselDay[]>(() => {
    const monday = weekMonday(weekOffset.value)
    const todayStr = dateOnly(today.value)
    const out: CarouselDay[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(d.getDate() + i)
      const date = dateOnly(d)
      // #235/§10 (M4): self-race 만 있는 날을 'done'(✅)으로 표시하지 않는다(레이싱≠훈련 완료). 세션 state/칩/더블
      // 판정 모두 이 run 을 보므로 trainingRuns 기준으로 도출하면 일관 정합(레이싱한 날은 세션 유무에 따라 today/rest).
      const run = trainingRuns.value.find((r) => r.date === date) ?? null
      // 그 날의 표시 세션(폐기 제외). 우선순위 planned(active) > missed > skipped.
      const onDay = scheduleStore.sessions.filter((s) => s.date === date && s.status !== 'superseded')
      const planned = onDay.find((s) => s.status === 'planned')
      const missed = onDay.find((s) => s.status === 'missed')
      const skipped = onDay.find((s) => s.status === 'skipped')
      const rested = onDay.find((s) => s.status === 'rested')
      const display = planned ?? missed ?? skipped ?? null
      let state: CarouselDay['state']
      if (run) state = 'done'
      else if (planned) state = date === todayStr ? 'today' : date < todayStr ? 'open' : 'future'
      else if (missed) state = 'missed'
      else if (skipped) state = 'skipped'
      else if (rested) state = 'rested' // 선언한 휴식(#473) — 차분한 💤, 'rest' fall-through 전에 명시 분기
      else state = 'rest'
      const chip = run ? sessionTypeLabel(run.type) : display ? sessionTypeLabel(display.sessionType) : rested ? '💤' : '휴식'
      // WeekStrip(요약 홈) 타입색 dot 용 원시 타입 — chip 라벨과 같은 우선순위(런 > 표시 세션).
      const type = run ? run.type : display ? display.sessionType : null
      // 같은 날 더블(#455): 실슬롯(planned/missed/done, 포기·휴식 제외) 2개 이상이면 ×2 배지.
      const double = onDay.filter((s) => s.status !== 'skipped' && s.status !== 'rested').length >= 2
      out.push({ date, label: `${WEEKDAY_KO[d.getDay()]} ${d.getDate()}`, state, chip, type, double })
    }
    return out
  })
  const weekLabel = computed(() => {
    const base = new Date(today.value)
    base.setDate(base.getDate() + weekOffset.value * 7)
    const r = trainingWeekRange(base)
    const fmt = (s: string) => { const p = s.split('-'); return `${Number(p[1])}/${Number(p[2])}` }
    const range = `${fmt(r.start)}~${fmt(r.end)}`
    if (weekOffset.value === 0) return `이번 주 · ${range}`
    if (weekOffset.value === -1) return `지난주 · ${range}`
    if (weekOffset.value === 1) return `다음주 · ${range}`
    return range
  })
  function navWeek(delta: number) {
    weekOffset.value = Math.max(-8, Math.min(8, weekOffset.value + delta))
  }
  // 실제 주기화 스케줄(목표+targetDate로 생성된 세션)이 있을 때만 캐러셀. 완료런만으론 표시 안 함(무계획 오인 방지).
  const hasSchedule = computed(() => scheduleStore.sessions.length > 0)
  // 목표 아키타입(#398): 성과만 주기화·예측·단계카드, 비성과는 상시 리듬.
  const isPerformanceGoal = computed(() => (activeGoal.value ? goalArchetype(activeGoal.value.category) === 'performance' : false))
  // 스케줄이 곧 생성될 목표면 로딩 중 옛 히어로 폴백을 깜빡이지 말고 플레이스홀더(FOUC 방지).
  // 성과=목표일+거리, 비성과=활성 목표만 있으면(마감 불필요).
  const expectsSchedule = computed(
    () =>
      isSupabaseConfigured &&
      (isPerformanceGoal.value
        ? Boolean(activeGoal.value?.targetDate && activeGoal.value?.distanceKm)
        : Boolean(activeGoal.value))
  )
  // 스케줄/메모리가 아직 정착 중이면 목표 없는 히어로(화살표만 보이는 폴백)를 깜빡이지 말고 플레이스홀더로.
  const scheduleLoadingPlaceholder = computed(
    () =>
      !hasSchedule.value &&
      !scheduleStore.error &&
      (expectsSchedule.value || scheduleStore.loading || memoryStore.loading || !memoryStore.loaded)
  )
  const activeDayIndex = ref((new Date(today.value).getDay() + 6) % 7) // 기본 = 이번 주 오늘(월=0)
  // 활성 일자를 마지막으로 만진 달력일 — 자정이 지나면(앱이 살아있는 채 날이 바뀌면) 오늘로 재앵커하기 위함.
  let activeDayAnchorDate = dateOnly(today.value)
  // 주를 넘기면 활성 일자를 그 주 첫날로(현재 주면 오늘로) 맞춘다.
  watch(weekOffset, (v) => {
    activeDayIndex.value = v === 0 ? todayWeekdayIndex.value : 0
  })
  // 사용자가 날짜를 고르면(캐러셀 등) 그 시점 달력일을 앵커로 — 당일 내 탐색은 재진입에도 보존된다.
  watch(activeDayIndex, () => {
    activeDayAnchorDate = dateOnly(new Date())
  })
  const activeDay = computed(() => scheduleDays.value[activeDayIndex.value] ?? null)
  const activeSession = computed<ScheduledSession | null>(() =>
    activeDay.value ? scheduleStore.sessionOnDate(activeDay.value.date) : null
  )
  // 같은 날 더블(#455): 그 날 활성 세션 전부(AM→PM). 2건이면 더블 패널을 렌더한다.
  const activeSessions = computed<ScheduledSession[]>(() =>
    activeDay.value ? scheduleStore.sessionsOnDate(activeDay.value.date) : []
  )
  const isActiveDayDouble = computed(() => activeSessions.value.length >= 2)
  // 안 뛴 날/포기(open·missed·skipped) 슬라이드용 세션(폐기 제외, planned>missed>skipped).
  const activeOpenSession = computed<ScheduledSession | null>(() => {
    const day = activeDay.value
    if (!day || !(day.state === 'open' || day.state === 'missed' || day.state === 'skipped')) return null
    const onDay = scheduleStore.sessions.filter((s) => s.date === day.date && s.status !== 'superseded')
    return (
      onDay.find((s) => s.status === 'planned') ??
      onDay.find((s) => s.status === 'missed') ??
      onDay.find((s) => s.status === 'skipped') ??
      null
    )
  })
  // #235/§10: 디브리핑/완료 카드는 훈련 런만 대상(세션 unlink 만으론 date-keyed 디브리핑이 안 사라진다).
  // 레이싱한 날엔 디브리핑 대신 이지 브리핑 등 본래 처방이 그대로 보이도록 trainingRuns 로 도출.
  const activeDoneRun = computed(() =>
    activeDay.value ? trainingRuns.value.find((r) => r.date === activeDay.value!.date) ?? null : null
  )
  // 디브리핑/완료 히어로 공용 요약 한 줄(타입 · 거리 · 시간).
  const activeDoneSummary = computed(() => {
    const run = activeDoneRun.value
    if (!run) return ''
    const distance = Number.isFinite(run.distanceKm) ? `${Math.round(run.distanceKm * 10) / 10}km` : ''
    const dur = run.durationSec ? formatDuration(run.durationSec) : ''
    return [run.type, distance, dur].filter(Boolean).join(' · ')
  })

  // 오늘 날짜의 planned 의도(브리핑 흡수용) — 최신순 activePlannedIntent가 미래 stale 의도를 집는 것 방지(#398 후속).
  const activePlannedIntent = computed(() => sessionIntentStore.activePlannedIntent)
  const todayPlannedIntent = computed(
    () => sessionIntentStore.intents.find((i) => i.plannedDate === todayDate.value && i.status === 'planned') ?? null
  )

  // 표시용 활성 세션 — Easy 계열이면 관측 보정 페이스로 처방을 재계산(#405, 저장된 VDOT 추정 페이스 대신).
  // 브리핑(코치 탭)과 오늘 히어로(요약 탭)가 같은 처방 표기를 쓰도록 단일 소스로 둔다.
  const activeDisplaySession = computed<ScheduledSession | null>(() => {
    const base = activeSession.value
    if (!base) return null
    return observedEasyPace.value && EASY_FAMILY_TYPES.has(base.sessionType)
      ? { ...base, prescription: prescriptionFor(base.sessionType, base.prescription.distanceKm ?? 0, calibratedPaceModel.value) }
      : base
  })

  const activeBriefing = computed<SessionBriefing | null>(() => {
    const base = activeSession.value
    if (!base || activeDoneRun.value) return null
    const session = activeDisplaySession.value ?? base
    // 오늘 세션이면 SessionIntent(의도·성공기준·타겟)를 흡수해 단일 카드로(중복 의도 카드 제거).
    // 단 의도가 '오늘 + 스케줄 세션 타입과 일치'할 때만 흡수한다 — 옛 추천엔진으로 만든 다른 날/다른 타입
    // 의도(예: 목요일 Tempo)가 오늘 이지 브리핑에 모순된 타겟(심박 146~158·RPE 6~7)을 섞는 것 방지(#398 후속).
    const planned = todayPlannedIntent.value
    const intentMatchesToday = planned && (!base || planned.sessionType === base.sessionType)
    const intent =
      activeDay.value?.state === 'today' && planned && intentMatchesToday
        ? {
            why: planned.why,
            successCriteria: planned.successCriteria,
            targets: planned.targets
          }
        : null
    return buildSessionBriefing(session, {
      goal: activeGoal.value,
      injury: activeInjury.value,
      chronic: chronicLoad.value,
      vdot: resolvePaceModel(memoryStore.memory.athleteProfile).vdot,
      adaptiveProfile: memoryStore.memory.adaptiveTrainingProfile,
      progression: adaptiveProgress.value.criteria,
      intent,
      // 페이스 근거 투명화(#405) — 관측 보정이면 표본 수, 아니면 추정 안내. (나중에 "나의 통계"로 흡수)
      easyPaceBasis: observedEasyPace.value
        ? `내 Easy 런 ${observedEasyPace.value.sampleCount}건 기준 (심박 ${heartRateModel.value.easyCeilingBpm ?? '-'} 이하)`
        : 'VDOT 추정 — Easy 심박 이하 런 3건 모이면 내 데이터로 보정돼요',
      nonPeriodized: !isPerformanceGoal.value
    })
  })
  const briefingCeilingText = computed(() =>
    heartRateModel.value.easyCeilingBpm ? `심박 상한 ${heartRateModel.value.easyCeilingBpm}` : null
  )

  // === 스케줄 변경 액션 공통 래퍼(중복 쓰기 방지 busy + 실패 토스트) ===
  const intentBusy = ref(false)
  async function runScheduleOp(fn: () => Promise<void>) {
    if (intentBusy.value) return
    intentBusy.value = true
    try {
      await fn()
    } catch {
      toastStore.error('일정을 바꾸지 못했어요.')
    } finally {
      intentBusy.value = false
    }
  }

  /**
   * 지금 복귀(#473 Phase 2): 오늘 이후 rested→planned 복원 + 휴식 메타를 "어제 종료된 복귀 윈도"로 전환한 뒤
   * ensure 를 돌린다. 명시 복귀와 자연 만료를 **같은 자연만료 경로**(doEnsureSchedule 의 untilDate<today &&
   * !returnRampApplied 분기)로 통일한다 — 그래야 복귀 윈도(isOver) 동안 후속 재정렬도 returnRamp 를 재전달해
   * 캡이 up-drift 재정렬에 소실되지 않고 generic 닦달 토스트도 억제된다(F1). 메타 정리는 expireRestMetaIfOver 가 맡는다.
   * 짧은 휴식(<7일)은 returnRampPayload=null 이라 램프 미적용(원래 계획대로).
   */
  async function returnFromRestNow() {
    const goal = activeGoal.value
    const rest = memoryStore.memory.activeRest
    await runScheduleOp(async () => {
      if (goal) await scheduleStore.unrestFrom(goal.id, todayDate.value)
      if (rest) {
        // untilDate=어제 → isOver=true(복귀 윈도). 1일 휴식 당일 복귀 같은 퇴화 케이스(어제<시작일)는 메타 해제.
        const endIso = dayBeforeIso(todayDate.value)
        await memoryStore.setActiveRest(endIso >= rest.startDate ? { ...rest, untilDate: endIso } : null)
      }
      // 진행 중 ensure(이전 메타로 시작됐을 수 있음)를 비운 뒤 새 ensure 가 새 메타로 자연만료 램프를 강제한다.
      // drain 으로 충분한 이유: ensure 를 fire 하는 watcher 는 loaded 플래그·activeGoal.id 뿐이라 setActiveRest 로 재발화되지 않는다.
      // (향후 activeRest 변화에 ensure 를 묶으면 이 직렬화 가정이 깨지므로 가드를 다시 도입해야 한다.)
      if (ensureInFlight) await ensureInFlight.catch(() => {})
      await ensureSchedule()
      weekOffset.value = 0
      activeDayIndex.value = todayWeekdayIndex.value
      toastStore.success('돌아온 걸 환영해요. 오늘부터 가볍게 다시 시작해요.')
    })
  }

  // === Pre-Run 의도(#309): 결정론 신호를 조합해 오늘 의도를 만들고 하루 1건 영속한다 ===
  const weakestFactorLabel = computed(() => {
    const factors = raceProjection.value?.factors ?? []
    if (!factors.length) return null
    return [...factors].sort((a, b) => a.score - b.score)[0]?.label ?? null
  })
  function intentArgs(overrideType?: BuildSessionIntentArgs['overrideType']): BuildSessionIntentArgs {
    // 스케줄이 있으면 오늘 의도를 '스케줄 세션'에서 만든다(옛 추천엔진 대신) — 타입·타겟·날짜 정합(#398 후속).
    const s = hasSchedule.value ? activeSession.value : null
    const recommendation: NextSessionRecommendation = s
      ? {
          title: sessionTypeLabel(s.sessionType),
          reason: s.prescription.note || '오늘 계획된 세션을 수행합니다.',
          intensity: '',
          plannedDate: s.date,
          dayName: '',
          injuryAdjusted: false,
          injuryNote: '',
          loadCaution: false,
          loadNote: ''
        }
      : nextSession.value
    return {
      recommendation,
      heartRateModel: {
        easyCeilingBpm: heartRateModel.value.easyCeilingBpm,
        tempoCeilingBpm: heartRateModel.value.tempoCeilingBpm,
        recoveryCeilingBpm: heartRateModel.value.recoveryCeilingBpm
      },
      weakestFactorLabel: weakestFactorLabel.value,
      activeGoalId: activeGoal.value?.id ?? null,
      overrideType: overrideType ?? (s ? s.sessionType : undefined)
    }
  }
  async function ensureTodayIntent() {
    if (!isSupabaseConfigured || !runStore.loaded || !memoryStore.loaded) return
    try {
      await sessionIntentStore.ensureIntentFor(buildSessionIntentDraft(intentArgs()))
    } catch {
      // best-effort: 의도 생성 실패가 대시보드를 막지 않는다.
    }
  }

  // 과거 오분류 롱런 라벨 자가치유(로드당 1회·멱등·목표 비종속). runs+memory 로딩 후 1회 돈다.
  // 스케줄 reconcile 전에 끝내야 매칭이 교정된 타입을 보고 같은 날 LSD 등으로 올바로 연결된다.
  function reinferRunTypesOnce(): Promise<void> {
    if (!isSupabaseConfigured || reinferDone) return Promise.resolve()
    if (reinferInFlight) return reinferInFlight
    reinferInFlight = runStore
      .reinferMislabeledLongRuns(heartRateModel.value)
      .then(() => {
        reinferDone = true
      })
      .catch(() => {
        // best-effort: 라벨 치유 실패가 대시보드를 막지 않는다.
      })
      .finally(() => {
        reinferInFlight = null
      })
    return reinferInFlight
  }
  watch(
    () => [runStore.loaded, memoryStore.loaded] as const,
    async () => {
      // ⚠️ 순서 중요: 스케줄(복귀 램프·realign 등 그날 세션 타입 재작성 포함)을 먼저 정산한 **뒤**
      // 오늘 의도를 만든다. 안 그러면 램프가 세션을 Easy 로 낮추기 전의 타입("Easy + Strides")으로
      // 의도가 박제돼 디브리핑이 폐기된 처방으로 채점·표시된다(#473 후속 라벨 비일관 버그).
      // ensureTodayIntent 의 ensureIntentFor 는 타입 불일치 시 옛 planned 의도를 재동기화하므로
      // 옛 부팅에서 남은 화석도 함께 치유된다.
      await reinferRunTypesOnce()
      await ensureSchedule()
      void ensureTodayIntent()
    },
    { immediate: true }
  )

  // 활성 목표가 바뀌면 그 목표의 스케줄로 교체·재생성(수동 새로고침 불필요, #398 증분3).
  // 초기(undefined→id)는 위 loaded-watch가 처리하므로 prev==null은 건너뛴다 — 진짜 '전환'만 반응.
  watch(
    () => activeGoal.value?.id ?? null,
    async (id, prev) => {
      if (!id || id === prev || prev == null) return
      await scheduleStore.load(id)
      void ensureSchedule()
    }
  )

  // === 컨텍스트 새로고침(탭 재진입·포커스·가시성) ===
  function refreshContext() {
    today.value = new Date()
    // 달력일이 넘어갔으면 활성 일자를 오늘로 스냅(2026-07-04: 금요일에 마운트된 코치 캐러셀이
    // 토요일 '상세 브리핑 보기' 진입에서도 금요일에 머문 버그). 같은 날 안의 탐색은 건드리지 않는다.
    if (activeDayAnchorDate !== dateOnly(today.value)) {
      weekOffset.value = 0
      activeDayIndex.value = todayWeekdayIndex.value
      activeDayAnchorDate = dateOnly(today.value)
    }
    expireRestMetaIfOver()
    if (!runStore.loaded && !runStore.loading) {
      void runStore.load()
    }
    if (!memoryStore.loading) {
      void memoryStore.load()
    }
    options.onRefresh?.()
  }

  // 복귀 정리(#473): 복귀 모먼트 창(복귀일+2일)이 지나면 휴식 메타 해제 → 정상 흐름 복귀.
  // 단 복귀 램프(Phase 2)가 아직 강제 적용되지 않았으면(returnRampApplied=false) 메타를 보존해, 늦게(복귀일+3 이후)
  // 처음 접속해도 자연 만료 램프가 1회 걸리게 한다(F3). 그래도 14일이 지나면 하드캡으로 정리한다.
  // doEnsureSchedule(스케줄 게이트)과 분리해 목표 종류·targetDate 무관하게 정리. 과거 rested 세션은 보존(닦달 금지).
  function expireRestMetaIfOver() {
    const rest = memoryStore.memory.activeRest
    if (!rest || expireRestInFlight) return
    const daysSinceReturn = diffDaysIso(dateOnly(today.value), dayAfterIso(rest.untilDate))
    if ((rest.returnRampApplied && daysSinceReturn > 2) || daysSinceReturn > 14) {
      expireRestInFlight = true
      void memoryStore.setActiveRest(null).finally(() => {
        expireRestInFlight = false
      })
    }
  }

  function refreshContextWhenVisible() {
    if (document.visibilityState === 'visible') refreshContext()
  }

  // 자기 탭 라우트 재진입 시 컨텍스트 새로고침(기존 대시보드 route.path==='/' watch 일반화).
  const route = useRoute()
  watch(
    () => route.path,
    (path) => {
      if (path === options.routePath) refreshContext()
    },
    { immediate: true }
  )

  onMounted(() => {
    refreshContext()
    window.addEventListener('focus', refreshContext)
    window.addEventListener('pageshow', refreshContext)
    document.addEventListener('visibilitychange', refreshContextWhenVisible)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('focus', refreshContext)
    window.removeEventListener('pageshow', refreshContext)
    document.removeEventListener('visibilitychange', refreshContextWhenVisible)
  })

  return {
    // 시간 축
    today,
    todayDate,
    todayWeekdayIndex,
    weekMonday,
    refreshContext,
    // 런 데이터
    runs,
    trainingRuns,
    // 메모리 파생
    activeGoal,
    activeInjury,
    ageLoadWeight,
    heartRateModel,
    observedEasyPace,
    calibratedPaceModel,
    chronicLoad,
    currentWeeklyKm,
    raceProjection,
    nextSession,
    restState,
    adaptiveProgress,
    // 주간 스트립·세션 상태
    weekOffset,
    weekLabel,
    navWeek,
    scheduleDays,
    hasSchedule,
    isPerformanceGoal,
    expectsSchedule,
    scheduleLoadingPlaceholder,
    activeDayIndex,
    activeDay,
    activeSession,
    activeSessions,
    isActiveDayDouble,
    activeOpenSession,
    activeDoneRun,
    activeDoneSummary,
    activeDisplaySession,
    activeBriefing,
    briefingCeilingText,
    activePlannedIntent,
    todayPlannedIntent,
    // 액션
    intentBusy,
    runScheduleOp,
    returnFromRestNow,
    ensureSchedule,
    intentArgs
  }
}
