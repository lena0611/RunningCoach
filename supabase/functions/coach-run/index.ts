import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { filterInjuryItemsForRunDate, getActiveInjuryItemForRunDate } from './injuryTemporalFilter.ts'

type RunLogRow = {
  id: string
  external_id: string | null
  session_title: string | null
  date: string
  type: string
  distance_km: number
  duration_sec: number | null
  avg_pace_sec: number | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  cadence: number | null
  active_energy_kcal: number | null
  temperature: number | null
  humidity: number | null
  wind_mps: number | null
  elevation_gain_m: number | null
  elevation_loss_m: number | null
  course_type: string | null
  rpe: number | null
  workout_feeling: string | null
  pain_note: string | null
  sleep_quality: number | null
  condition_score: number | null
  stress_level: number | null
  companion: string | null
  memo: string
  laps: unknown[]
  fast_segments: unknown[]
  metric_samples: unknown[]
  route_points: unknown[]
  tags: string[]
  source: string
}

type CoachReportRow = {
  selected_run_id: string | null
  user_note: string
  report: string
  created_at: string
}

type CoachMemoryItemRow = {
  id?: string
  content: string
  created_at: string
  importance?: number | null
  last_referenced_at?: string | null
  reference_count?: number | null
}

type TrainingKnowledgeSourceRow = {
  id: string
  title: string
  author: string
  source_type: string
  url: string | null
  reliability: string
  summary: string
}

type TrainingMethodRow = {
  id: string
  source_id: string | null
  name: string
  slug: string
  family: string
  summary: string
  target_distances: string[]
  suitable_levels: string[]
  weekly_days_min: number | null
  weekly_days_max: number | null
  caution_notes: string
}

type TrainingPrescriptionRuleRow = {
  id: string
  method_id: string | null
  source_id: string | null
  goal_distance: string
  phase: string
  session_type: string
  rule_type: string
  metric: string
  prescription: string
  raise_condition: string
  lower_condition: string
  contraindications: string[]
  evidence_summary: string
  priority: number
}

type CurrentWeatherContext = {
  source: 'ios_weatherkit'
  observedAt: string
  locationName: string | null
  current: {
    temperatureC: number | null
    apparentTemperatureC: number | null
    humidity: number | null
    windMps: number | null
    condition: string
    symbolName: string
  }
  next12Hours: {
    maxPrecipitationChance: number
    precipitationAmountMm: number
    rainHours: string[]
  }
}

type RunnerIdentityTrait = {
  label: string
  evidence: string[]
  confidence: number
  source: 'engine' | 'coach' | 'user' | 'mixed'
  updatedAt: string | null
}

type RunnerIdentityPatch = {
  strengths?: RunnerIdentityTrait[]
  weaknesses?: RunnerIdentityTrait[]
  riskFactors?: RunnerIdentityTrait[]
  coachingStyle?: string[]
}

type CoachBelief = {
  id: string
  belief: string
  category: 'recovery' | 'injury' | 'load' | 'pacing' | 'routine' | 'weather' | 'preference' | 'other'
  confidence: number
  supportCount: number
  contradictionCount: number
  evidenceRunIds: string[]
  status: 'candidate' | 'confirmed' | 'retired'
  source: 'engine' | 'coach' | 'user' | 'mixed'
  updatedAt: string | null
}

type CoachBeliefPatch = Partial<CoachBelief>

type SupabaseAdminClient = any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-pacelab-app-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const openaiKey = requiredEnv('OPENAI_API_KEY')
    const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5.4-mini'
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Missing bearer token' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const selectedRunId = typeof body.selectedRunId === 'string' && body.selectedRunId ? body.selectedRunId : null
    const userNote = typeof body.userNote === 'string' ? body.userNote.slice(0, 2000) : ''
    const commandId = typeof body.commandId === 'string' && body.commandId ? body.commandId : null
    const currentWeather = normalizeCurrentWeather(body.currentWeather)
    const achievements = normalizeAchievements(body.achievements)
    const runnerLevel = normalizeRunnerLevel(body.runnerLevel)
    const responseStyle = normalizeResponseStyle(body.responseStyle, runnerLevel)
    const shouldStream = body.stream === true

    const access = await requireAppSession(admin, req, userId)
    if (!access.ok) return json({ error: access.error }, access.status)

    const rateLimit = await consumeRateLimit(admin, userId, 'coach-run')
    if (!rateLimit.ok) return json({ error: rateLimit.error, retryAfterSec: rateLimit.retryAfterSec }, 429)

    const context = await buildContext(admin, userId, selectedRunId, userNote, responseStyle, currentWeather, runnerLevel, commandId, achievements)
    const ownedSelectedRunId = context.selectedRun?.id ?? null
    if (shouldStream) {
      return streamCoachRun(admin, userId, ownedSelectedRunId, userNote, openaiKey, model, context)
    }

    const ai = await callOpenAI(openaiKey, model, context)
    const result = await persistCoachResult(admin, userId, ownedSelectedRunId, userNote, context, ai)

    return json(result)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function persistCoachResult(
  admin: SupabaseAdminClient,
  userId: string,
  selectedRunId: string | null,
  userNote: string,
  context: CoachContext,
  ai: { report: string; memoryItems: string[]; trainingMemoryPatch: TrainingMemoryPatch | null; injuryUpdateProposal: InjuryUpdateProposal | null }
) {
    const durableMemoryItems = normalizeMemoryItems(ai.memoryItems, [...(context.coreMemoryItems ?? []), ...context.coachMemoryItems])
    const memoryPatch = normalizeTrainingMemoryPatch(ai.trainingMemoryPatch)
    const injuryUpdateProposal = normalizeInjuryUpdateProposal(ai.injuryUpdateProposal, context.activeInjuryItem)
    const updatedMemory = memoryPatch ? mergeTrainingMemoryPatch(context.trainingMemory, memoryPatch) : null
    if (updatedMemory) {
      const { error } = await admin.from('training_memory').upsert({
        user_id: userId,
        memory: updatedMemory,
        updated_at: new Date().toISOString()
      })
      if (error) throw error
    }

    const { data: reportRow, error: reportError } = await admin
      .from('coach_reports')
      .insert({
        user_id: userId,
        selected_run_id: selectedRunId,
        user_note: userNote,
        report: ai.report,
        updated_at: new Date().toISOString()
      })
      .select('id, selected_run_id, user_note, report, created_at, updated_at')
      .single()
    if (reportError) throw reportError

    const memoryItems = durableMemoryItems.map((content) => ({
      user_id: userId,
      content,
      source_report_id: reportRow.id,
      importance: deriveMemoryImportance(content)
    }))
    if (memoryItems.length) {
      const { error } = await admin.from('coach_memory_items').insert(memoryItems)
      if (error) throw error
    }

    return {
      report: {
        id: reportRow.id,
        selectedRunId: reportRow.selected_run_id,
        userNote: reportRow.user_note,
        report: reportRow.report,
        createdAt: reportRow.created_at,
        updatedAt: reportRow.updated_at,
        trainingMemoryUpdated: Boolean(updatedMemory),
        injuryUpdateProposal
      },
      trainingMemoryUpdated: Boolean(updatedMemory),
      trainingMemoryPatch: memoryPatch,
      injuryUpdateProposal
    }
}

type RunnerLevel = 'beginner' | 'intermediate' | 'advanced'

function normalizeRunnerLevel(value: unknown): RunnerLevel {
  return value === 'beginner' || value === 'intermediate' || value === 'advanced' ? value : 'beginner'
}

type ResponseStyle = {
  tone: 'conversational_coach'
  format: 'sectioned_markdown'
  avoid: string[]
  emojiPolicy: 'contextual_0_to_3'
  firstSentence: 'reaction_before_analysis'
  maxParagraphSentences: number
  maxBulletsPerSection: number
  runnerLevel: RunnerLevel
  verbosity: 'guided' | 'standard' | 'compact'
}

// 레벨별 표현 밀도 프리셋. 초급은 풀어서·짧은 처방, 고급은 간결·고밀도. (Issue #100)
const RESPONSE_STYLE_PRESET: Record<RunnerLevel, { maxParagraphSentences: number; maxBulletsPerSection: number; verbosity: ResponseStyle['verbosity'] }> = {
  beginner: { maxParagraphSentences: 3, maxBulletsPerSection: 4, verbosity: 'guided' },
  intermediate: { maxParagraphSentences: 2, maxBulletsPerSection: 5, verbosity: 'standard' },
  advanced: { maxParagraphSentences: 2, maxBulletsPerSection: 6, verbosity: 'compact' }
}

function normalizeResponseStyle(value: unknown, runnerLevel: RunnerLevel = 'beginner'): ResponseStyle {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const preset = RESPONSE_STYLE_PRESET[runnerLevel]
  return {
    tone: item.tone === 'conversational_coach' ? 'conversational_coach' : 'conversational_coach',
    format: item.format === 'sectioned_markdown' ? 'sectioned_markdown' : 'sectioned_markdown',
    avoid: Array.isArray(item.avoid)
      ? item.avoid.filter((entry): entry is string => typeof entry === 'string').slice(0, 10)
      : ['report_style', 'medical_diagnosis', 'long_paragraphs'],
    emojiPolicy: item.emojiPolicy === 'contextual_0_to_3' ? 'contextual_0_to_3' : 'contextual_0_to_3',
    firstSentence: item.firstSentence === 'reaction_before_analysis' ? 'reaction_before_analysis' : 'reaction_before_analysis',
    maxParagraphSentences: preset.maxParagraphSentences,
    maxBulletsPerSection: preset.maxBulletsPerSection,
    runnerLevel,
    verbosity: preset.verbosity
  }
}

function normalizeCurrentWeather(value: unknown): CurrentWeatherContext | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const current = item.current && typeof item.current === 'object' ? item.current as Record<string, unknown> : {}
  const next12Hours = item.next12Hours && typeof item.next12Hours === 'object' ? item.next12Hours as Record<string, unknown> : {}
  const observedAt = typeof item.observedAt === 'string' ? item.observedAt : ''
  if (!observedAt) return null

  return {
    source: 'ios_weatherkit',
    observedAt,
    locationName: typeof item.locationName === 'string' ? item.locationName : null,
    current: {
      temperatureC: nullableNumber(current.temperatureC),
      apparentTemperatureC: nullableNumber(current.apparentTemperatureC),
      humidity: nullableNumber(current.humidity),
      windMps: nullableNumber(current.windMps),
      condition: typeof current.condition === 'string' ? current.condition.slice(0, 80) : '',
      symbolName: typeof current.symbolName === 'string' ? current.symbolName.slice(0, 80) : ''
    },
    next12Hours: {
      maxPrecipitationChance: clampNumber(next12Hours.maxPrecipitationChance, 0, 1, 0),
      precipitationAmountMm: clampNumber(next12Hours.precipitationAmountMm, 0, 500, 0),
      rainHours: Array.isArray(next12Hours.rainHours)
        ? next12Hours.rainHours.filter((entry): entry is string => typeof entry === 'string').slice(0, 12)
        : []
    }
  }
}

// 웹이 전체 RunLog 에서 산출해 보내는 개인 업적 요약(#181). 서버는 최근 120건만 보므로
// 올타임 기록을 놓치지 않게 currentWeather 와 동일한 client-summary 패턴으로 받는다.
type CoachAchievementHighlights = {
  longestDistanceKm: number | null
  longestDurationSec: number | null
  fastestAvgPaceSec: number | null
  distancePbs: { distanceM: number; elapsedSec: number }[]
  milestonesM: number[]
}
type CoachAchievementContext = {
  training: CoachAchievementHighlights
  race: CoachAchievementHighlights | null
}

function normalizeAchievementHighlights(value: unknown): CoachAchievementHighlights | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const distancePbs = Array.isArray(item.distancePbs)
    ? item.distancePbs
        .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
        .map((p) => ({ distanceM: nullableNumber(p.distanceM), elapsedSec: nullableNumber(p.elapsedSec) }))
        .filter((p): p is { distanceM: number; elapsedSec: number } => p.distanceM != null && p.elapsedSec != null)
        .slice(0, 4)
    : []
  const milestonesM = Array.isArray(item.milestonesM)
    ? item.milestonesM.filter((m): m is number => typeof m === 'number' && Number.isFinite(m)).slice(0, 8)
    : []
  const highlights: CoachAchievementHighlights = {
    longestDistanceKm: nullableNumber(item.longestDistanceKm),
    longestDurationSec: nullableNumber(item.longestDurationSec),
    fastestAvgPaceSec: nullableNumber(item.fastestAvgPaceSec),
    distancePbs,
    milestonesM
  }
  const empty = highlights.longestDistanceKm == null && highlights.longestDurationSec == null
    && highlights.fastestAvgPaceSec == null && !distancePbs.length && !milestonesM.length
  return empty ? null : highlights
}

function normalizeAchievements(value: unknown): CoachAchievementContext | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const training = normalizeAchievementHighlights(item.training)
  const race = normalizeAchievementHighlights(item.race)
  if (!training && !race) return null
  return {
    training: training ?? { longestDistanceKm: null, longestDurationSec: null, fastestAvgPaceSec: null, distancePbs: [], milestonesM: [] },
    race
  }
}

// 응답 형식 모드. report=세션만 열림, conversational=일반 사담,
// explain=자세한 설명/분석 요청, evidence=근거/출처 요청.
type CoachResponseMode = 'report' | 'conversational' | 'explain' | 'evidence'
// userNote가 있을 때 사용자 의도 분류. chat=잡담, explain=설명/분석, evidence=근거/출처.
type CoachAnswerIntent = 'chat' | 'explain' | 'evidence'

// userNote 문구로 사용자 의도를 분류한다(서버 권위 분류).
// 프론트가 보조 힌트를 보내더라도 서버는 항상 여기서 다시 분류한다.
function detectCoachAnswerIntent(note: string): CoachAnswerIntent {
  const text = note.trim().toLowerCase()
  if (!text) return 'chat'
  // 근거/출처를 먼저 본다("왜 그렇게 판단했어?"도 근거 요청으로 본다).
  if (/근거|출처|왜|논문|자료|reference|source|evidence|실제로 있|진짜 있|검증|입증/.test(text)) {
    return 'evidence'
  }
  if (/자세히|자세하게|상세|분석|평가|설명|비교|정리|풀어서|구체적/.test(text)) {
    return 'explain'
  }
  return 'chat'
}

// 빈 입력이면 report, 그 외에는 의도에 따라 evidence/explain/conversational.
function resolveCoachResponseMode(userNote: string, answerIntent: CoachAnswerIntent): CoachResponseMode {
  if (userNote.trim().length === 0) return 'report'
  if (answerIntent === 'evidence') return 'evidence'
  if (answerIntent === 'explain') return 'explain'
  return 'conversational'
}

// 프리셋 코칭 커맨드(/세션분석 등)별 맞춤 리포트 구조(#237).
// 프론트가 보낸 commandId가 여기 있으면 키워드 분류를 무시하고 report 형식 + 이 섹션 구성을 강제한다.
const COACH_COMMAND_FORMATS: Record<string, { label: string; sections: string[] }> = {
  session: {
    label: '세션 분석',
    sections: ['## 핵심 지표 (페이스·심박 흐름)', '## 의도 부합 (계획한 세션 유형과 맞았는지)', '## 한 줄 평가']
  },
  routine: {
    label: '루틴 점검',
    sections: ['## 현재 루틴', '## 판단 (유지 / 상향 / 하향)', '## 근거', '## 적용 (다음 주 조정)']
  },
  quality: {
    label: '훈련 품질',
    sections: ['## 품질 게이트 결과', '## 충족·미달 항목', '## 다음 단계 가능 여부']
  },
  goal: {
    label: '목표 예상',
    sections: ['## 현재 예상 기록', '## 변화 방향', '## 달성 흐름']
  },
  recovery: {
    label: '회복/부상 체크',
    sections: ['## 회복 신호', '## 다음 훈련 강도 제한', '## 주의']
  },
  next: {
    label: '다음 훈련',
    sections: ['## 추천 세션', '## 강도·거리 (Workoutdoors 세팅 기준)', '## 이유']
  }
}

async function buildContext(admin: SupabaseAdminClient, userId: string, selectedRunId: string | null, userNote: string, responseStyle: ResponseStyle, currentWeather: CurrentWeatherContext | null, runnerLevel: RunnerLevel = 'beginner', commandId: string | null = null, achievements: CoachAchievementContext | null = null) {
  const memorySelect = 'id, content, created_at, importance, last_referenced_at, reference_count'
  const [
    { data: memoryRow },
    { data: runs },
    { data: memoryItems },
    { data: activeMemoryItems },
    { data: reports },
    { data: knowledgeSources },
    { data: trainingMethods },
    { data: prescriptionRules }
  ] = await Promise.all([
    admin.from('training_memory').select('memory').eq('user_id', userId).maybeSingle(),
    admin.from('run_logs').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(120),
    // 최근성 풀(되새김 후보)
    admin.from('coach_memory_items').select(memorySelect).eq('user_id', userId).order('created_at', { ascending: false }).limit(160),
    // 활성 후보: 오래돼도 중요한 기억이 풀 잘림에 안 묻히도록 별도로 중요도순 조회
    admin.from('coach_memory_items').select(memorySelect).eq('user_id', userId).order('importance', { ascending: false }).order('last_referenced_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(24),
    admin.from('coach_reports').select('selected_run_id, user_note, report, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(80),
    admin.from('training_knowledge_sources').select('id, title, author, source_type, url, reliability, summary').eq('approved', true),
    admin.from('training_methods').select('id, source_id, name, slug, family, summary, target_distances, suitable_levels, weekly_days_min, weekly_days_max, caution_notes').eq('approved', true),
    admin.from('training_prescription_rules').select('id, method_id, source_id, goal_distance, phase, session_type, rule_type, metric, prescription, raise_condition, lower_condition, contraindications, evidence_summary, priority').eq('approved', true).order('priority')
  ])
  const runRows = (runs ?? []) as RunLogRow[]
  const reportRows = (reports ?? []) as CoachReportRow[]
  // 최근성 풀 + 활성(중요도순) 후보를 id 기준으로 합친다(중복 제거).
  const memoryRowPool = mergeMemoryRows((memoryItems ?? []) as CoachMemoryItemRow[], (activeMemoryItems ?? []) as CoachMemoryItemRow[])
  const memoryRows = memoryRowPool
  const knowledgeSourceRows = (knowledgeSources ?? []) as TrainingKnowledgeSourceRow[]
  const trainingMethodRows = (trainingMethods ?? []) as TrainingMethodRow[]
  const prescriptionRuleRows = (prescriptionRules ?? []) as TrainingPrescriptionRuleRow[]
  const selectedRun = selectedRunId ? runRows.find((run) => run.id === selectedRunId) ?? null : null
  const currentDate = currentDateInSeoul()
  const anchorDate = selectedRun?.date ?? currentDate
  const selectedRunAgeDays = selectedRun ? diffDays(selectedRun.date, currentDate) : null
  const selectedRunTiming = selectedRun ? describeTiming(selectedRunAgeDays) : 'no_selected_run'
  const recent14 = withinDaysFromAnchor(runRows, 14, anchorDate)
  const recent30 = withinDaysFromAnchor(runRows, 30, anchorDate)
  const runsAfterSelected = selectedRun ? afterDate(runRows, selectedRun.date) : []
  const currentMonth = inCurrentMonth(runRows)
  const latestTempo = runRows.find((run) => run.type === 'Tempo') ?? null
  const latestLong = runRows.find((run) => ['LSD', 'Steady Long'].includes(run.type)) ?? null
  const trainingMemory = sanitizeMemoryHeartRateCeilings(memoryRow?.memory ?? null)
  const goals = getGoals(trainingMemory)
  const activeGoal = getActiveGoal(trainingMemory, goals)
  const performanceProjection = getPerformanceProjection(runRows, activeGoal)
  const allInjuryItems = getInjuryItems(trainingMemory)
  const selectedRunDateForTemporalContext = selectedRun?.date ?? null
  const injuryItems = filterInjuryItemsForRunDate(allInjuryItems, selectedRunDateForTemporalContext)
  const activeInjuryItem = getActiveInjuryItemForRunDate(trainingMemory, allInjuryItems, selectedRunDateForTemporalContext)
  const coachHeartRateModel = deriveCoachHeartRateModel(trainingMemory, currentDate, runRows)
  const coachPaceModel = deriveCoachPaceModel(trainingMemory)
  const selectedRunLapAnalysis = buildLapProgressionAnalysis(selectedRun, coachHeartRateModel.tempoCeilingBpm)
  const selectedRunExecutionGuide = buildSessionExecutionGuide(selectedRun, activeGoal, coachHeartRateModel)
  const recentPrescriptionComplianceSignals = buildPrescriptionComplianceSignals(recent14, coachHeartRateModel)
  const prescriptionComplianceSummary = summarizePrescriptionCompliance(recentPrescriptionComplianceSignals)
  const adaptiveTrainingProfile = getAdaptiveTrainingProfile(trainingMemory)
  const trainingKnowledge = buildRelevantTrainingKnowledge(knowledgeSourceRows, trainingMethodRows, prescriptionRuleRows, activeGoal, selectedRun)
  const summaryStats = {
    recent7DistanceKm: sumDistance(withinDaysFromAnchor(runRows, 7, anchorDate)),
    recent14DistanceKm: sumDistance(recent14),
    recent30DistanceKm: sumDistance(recent30),
    recent30EasyRatio: easyRatio(recent30),
    currentMonthRunCount: currentMonth.length,
    currentMonthDistanceKm: sumDistance(currentMonth),
    currentMonthEasyRatio: easyRatio(currentMonth),
    currentMonthHardSessions: currentMonth.filter((run) => ['Tempo', 'Steady Long', 'Race'].includes(run.type)).length,
    hardSessionsLast7: withinDaysFromAnchor(runRows, 7, anchorDate).filter((run) => ['Tempo', 'Steady Long', 'Race'].includes(run.type)).length,
    runsAfterSelectedRunCount: runsAfterSelected.length,
    latestTempo: summarizeRunForCoach(latestTempo),
    latestLong: summarizeRunForCoach(latestLong)
  }
  const athleteAgeWeight = getAgeLoadWeightForCoach(trainingMemory, currentDate)
  const runningAnalysisEngine = buildRunningAnalysisEngine({
    runRows,
    selectedRun,
    selectedRunLapAnalysis,
    recentPrescriptionComplianceSignals,
    prescriptionComplianceSummary,
    summaryStats,
    activeInjuryItem,
    activeGoal,
    ageWeight: athleteAgeWeight
  })
  const runnerIdentity = getRunnerIdentity(trainingMemory)
  const coachBeliefs = selectRelevantCoachBeliefs(getCoachBeliefs(trainingMemory), {
    selectedRun,
    activeGoal,
    activeInjuryItem,
    userNote,
    runningAnalysisEngine
  })
  // 장기기억 2계층: 활성(항상 탑재) + 되새김(관련 시 소환).
  const tieredMemory = buildTieredCoachMemory(memoryRows, selectedRun, userNote, {
    activeGoal,
    activeInjuryItem,
    coachBeliefs,
    runnerIdentity
  })
  // 컨텍스트에 올라간 기억은 참조 시각을 갱신해 되새김 정리 신호로 쓴다(best-effort, 실패해도 코칭은 진행).
  if (tieredMemory.referencedIds.length) {
    try {
      await admin
        .from('coach_memory_items')
        .update({ last_referenced_at: new Date().toISOString() })
        .in('id', tieredMemory.referencedIds)
    } catch (_err) {
      // 참조 갱신 실패는 무시한다.
    }
  }
  const coachingDecisionBoard = buildCoachingDecisionBoard({
    selectedRun,
    selectedRunLapAnalysis,
    selectedRunExecutionGuide,
    recentPrescriptionComplianceSignals,
    prescriptionComplianceSummary,
    performanceProjection,
    summaryStats,
    activeGoal,
    activeInjuryItem,
    trainingKnowledge,
    adaptiveTrainingProfile,
    runnerIdentity,
    coachBeliefs,
    runningAnalysisEngine,
    runnerLevel,
    heartRateModel: coachHeartRateModel
  })
  const injuryCheckInPolicy = buildInjuryCheckInPolicy(activeInjuryItem, selectedRunInjuryContext(selectedRun))
  const dataAvailability = {
    hasSelectedRun: Boolean(selectedRun),
    selectedRunType: selectedRun?.type ?? null,
    hasLapData: Boolean(selectedRunLapAnalysis),
    recent30RunCount: recent30.length,
    recent30DistanceKm: summaryStats.recent30DistanceKm,
    isSparse: recent30.length < 4
  }

  // userNote 의도를 분류해 응답 모드를 나눈다. 빈 입력=report, 잡담=conversational,
  // 설명/분석 요청=explain, 근거/출처 요청=evidence.
  const answerIntent = detectCoachAnswerIntent(userNote)
  // 프리셋 커맨드는 키워드 분류 대신 커맨드 전용 리포트 형식을 강제한다(#237 우선순위 정상화).
  const coachCommandFormat = commandId ? COACH_COMMAND_FORMATS[commandId] ?? null : null
  const coachResponseMode: CoachResponseMode = coachCommandFormat ? 'report' : resolveCoachResponseMode(userNote, answerIntent)
  return {
    userNote,
    hasUserNote: userNote.trim().length > 0,
    answerIntent,
    coachResponseMode,
    coachCommandId: commandId,
    coachCommandFormat,
    coachCommandPolicy: coachCommandFormat
      ? `사용자가 프리셋 커맨드 "${coachCommandFormat.label}"로 요청했다. coachResponseMode는 report이며, 아래 섹션 구성을 그 순서대로 마크다운 소제목으로 사용한다(데이터가 없는 섹션은 한 줄로 줄이되 구조는 유지): ${coachCommandFormat.sections.join(' / ')}. 줄글 한 덩어리로 쓰지 말고 각 섹션을 짧게 채운다. 키워드 기반 conversational/explain 분기는 무시한다.`
      : null,
    coachResponseModePolicy:
      'coachResponseMode가 응답 형식을 결정한다. ' +
      '[command] context.coachCommandFormat이 있으면(프리셋 커맨드) coachCommandPolicy의 섹션 구성을 따른 리포트로 답한다. 이것이 키워드 분류보다 우선한다. ' + +
      '[conversational] 사용자가 userNote로 가벼운 말/메모/잡담을 보낸 경우다. 리포트가 아니라 친구 같은 코치와의 "사담"으로 답한다. ' +
      '절대 금지: "## 핵심 지표", "## 오늘 해석", "## 조심할 점", "## 다음 훈련", "## 루틴 업데이트", "## 한 줄 요약" 같은 마크다운 섹션 헤더와 지표 나열 목록. ' +
      '대신 사용자가 한 말에 반응해서 2~6문장 정도로 자연스럽게 대화한다. 숫자가 필요하면 문장 속에 한두 개만 가볍게 녹이고, 세션 전체를 다시 분석하지 않는다. ' +
      '사용자 표현(예: "오랜만에 5km 30분 도전")을 그대로 받아 맥락에 맞게 사람처럼 답한다. ' +
      '[explain] 사용자가 "자세히/분석/설명/비교/정리"처럼 더 깊은 설명을 요청한 경우다. 고정 섹션을 기계적으로 채우지 말고 질문에 맞춰 결론→설명→사용자 적용→추천 순으로 유연하게 답한다. ' +
      '[evidence] 사용자가 "근거/출처/왜 그렇게 판단했는지/이 훈련법이 실제로 있는지"를 물은 경우다. 짧은 사담으로 끝내지 말고 결론→판단 근거→사용자 데이터 적용→참고한 훈련 원칙/출처 순으로 trainingKnowledge와 러닝 데이터를 근거로 답한다. 출처가 trainingKnowledge에 없으면 지어내지 말고 확인된 출처가 부족하다고 말한다. ' +
      '[report] userNote가 없으면(세션만 열림) 기존 selectedRun 리뷰 리포트 형식(responseTemplatePolicy)으로 답한다.',
    responseStyle,
    runnerLevel,
    runnerLevelGuide: buildRunnerLevelGuide(runnerLevel),
    dataAvailability,
    weeklyAvailability: {
      targetRunDays: getWeeklyRunDaysTarget(trainingMemory),
      currentWeeklyPatternDays: Array.isArray((trainingMemory as Record<string, unknown> | null)?.weeklyPattern)
        ? ((trainingMemory as Record<string, unknown>).weeklyPattern as unknown[]).length
        : 0,
      policy:
        'targetRunDays는 사용자가 실제로 달릴 수 있는 주간 가용 일수 제약이다(데이터로 도출 불가한 생활 제약). weeklyPattern(주간 루틴)의 러닝 세션 수가 이 값을 넘지 않도록 처방·조정한다. currentWeeklyPatternDays가 targetRunDays보다 많으면 세션 수를 줄여 맞추고(우선순위 낮은 추가 Easy부터 축소), 적으면 목표에 필요할 때만 가용 한도 내에서 늘린다. targetRunDays가 null(미입력)이면 제약 없이 목표와 회복을 보고 과훈련을 피하는 선에서 처방한다.',
    },
    heartRateModel: {
      tempoCeilingBpm: coachHeartRateModel.tempoCeilingBpm,
      easyCeilingBpm: coachHeartRateModel.easyCeilingBpm,
      recoveryCeilingBpm: coachHeartRateModel.recoveryCeilingBpm,
      estimatedMaxHr: coachHeartRateModel.estimatedMaxHr,
      observedMaxHr: coachHeartRateModel.observedMaxHr,
      restingHeartRate: coachHeartRateModel.restingHeartRate,
      source: coachHeartRateModel.source,
      policy:
        '심박 상한(템포/이지/회복)은 개인 심박 기준에서 파생한 값이다. 본문에 특정 기본 숫자(예: 165)를 임의로 쓰지 말고 이 상한 값만 쓴다. source=insufficient(상한 null)이면 심박 상한을 말하지 말고 페이스/RPE/심박 드리프트로 평가하며, "나이나 역치/최대심박을 입력하면 개인화된 심박 기준으로 코칭한다"고 한 번 안내한다. source=age_estimated 또는 age_data_corrected는 추정이므로 단정하지 말고, 더 정확히 하려면 30분 역치 테스트(LTHR) 입력을 권하면 좋다고 한 번만 덧붙인다. lthr/measured_max는 사용자가 직접 입력한 값이다.',
    },
    paceModel: {
      vdot: coachPaceModel.vdot,
      source: coachPaceModel.source,
      confidence: coachPaceModel.confidence,
      thresholdPaceSec: coachPaceModel.thresholdPaceSec,
      easyPaceRangeSec: coachPaceModel.easyPaceRangeSec,
      marathonPaceSec: coachPaceModel.marathonPaceSec,
      intervalPaceSec: coachPaceModel.intervalPaceSec,
      basis: coachPaceModel.basis,
      policy:
        '페이스 모델은 보조 신호다. 강도의 권위 기준은 항상 heartRateModel의 심박 상한이고, 페이스는 그 하위에서 참고 타깃으로만 쓴다. source=insufficient면 페이스 타깃을 만들지 말고 심박/RPE로만 말한다. confidence=estimate(VO2max 기반)면 "추정치"임을 한 번 밝히고 단정하지 않는다. confidence=measured(PB/레이스 환산)는 더 신뢰할 수 있다. 다음 훈련에 페이스를 제시할 때도 "심박 상한을 넘기지 않는 선에서 템포 ~분/km 참고" 식으로 심박 상한을 우선한다. 레이스 예상 언급은 기존 racePredictionPolicy를 따른다.',
    },
    responseTemplatePolicy: buildResponseTemplatePolicy(),
    currentDate,
    currentDateDisplay: formatDateWithWeekday(currentDate),
    contextMode: selectedRun ? 'selected_run_review' : 'current_flow_review',
    selectedRunTiming,
    selectedRunAgeDays,
    nextTrainingAdviceRelevant: selectedRunAgeDays !== null && selectedRunAgeDays <= 7 && runsAfterSelected.length === 0,
    nextTrainingAdvicePolicy:
      'nextTrainingAdviceRelevant는 이 세션의 "다음 훈련/루틴 업데이트"를 현재 처방으로 줘도 되는지다. 세션이 7일 이내이고(ATL 7일 시간상수 기준) 그 이후 새 기록이 없을 때만 true다. false이면(7일 넘게 지났거나 그 세션 이후 이미 다른 기록이 있으면) 다음 훈련은 그 세션 다음 스텝 회고로 한 줄만 쓰고, 루틴 업데이트는 단일 과거 세션으로 현재 루틴을 판단하지 않는다고 짧게 말한다.',
    anchorDateForWindowStats: anchorDate,
    anchorDateForWindowStatsDisplay: formatDateWithWeekday(anchorDate),
    instructionForDateHandling:
      'selectedRun.date는 훈련이 실제로 수행된 날짜이고 coach_reports.created_at은 코칭을 받은 날짜다. 둘을 혼동하지 마라. selectedRunTiming이 past이면 과거 기록 리뷰로 말하고, 오늘 뛴 기록/마지막 코칭 이후 새 기록이라고 단정하지 마라.',
    currentWeather,
    instructionForWeatherHandling:
      'currentWeather는 iOS WeatherKit에서 받은 현재/향후 12시간 날씨이며 다음 세션 준비용이다. selectedRun이 과거 기록이면 currentWeather를 그 과거 훈련 당시 날씨로 착각하지 마라. selectedRun.date가 오늘이거나 사용자가 다음 훈련/오늘 뛸지 묻는 경우에만 체감온도, 강수확률, 강수량, 비 가능 시간대를 짧게 반영한다.',
    achievements,
    instructionForAchievements:
      'achievements는 웹이 전체 기록에서 산출한 개인 업적이다(거리별 PB·최장 거리/시간·최속 평균 페이스·거리 마일스톤 첫 달성, 훈련/레이싱 컨텍스트 분리). 동기부여·신뢰 강화를 위해 맥락에 맞을 때만 1~2개를 사실 그대로 짧게 인용한다. 매 답변에 기계적으로 나열하지 말고, 수치를 과장하거나 없는 기록을 지어내지 마라. PB/기록 값은 재계산하지 말고 주어진 값을 그대로 쓴다. race가 null이면 아직 레이싱(자기와의 대결) 기록이 없다는 뜻이니 레이싱 업적을 언급하지 않는다. achievements.distancePbs[].elapsedSec는 distanceM 거리(예: 5000=5K)에 실제 도달한 기록이며 performanceProjection(목표 기록·레이스 예측)과는 별개다. 특정 거리(예: 5K) 질문에는 그 거리의 distancePbs 기록으로 답하고, 다른 거리의 예측·목표 시간을 그 거리의 기록인 것처럼 라벨하지 마라(예: 10K 목표/예측 시간을 "5K"라고 말하지 않는다).',
    routineUpdatePolicy: {
      purpose:
        '주간 루틴은 activeGoal 달성을 위한 처방이다. 세션별 코칭 때마다 유지/조정 여부를 확인하되, 단일 기록 하나만으로 자주 바꾸지 않는다.',
      externalCoachingStandards:
        '전문 코칭 기준선은 저강도 기반을 충분히 유지하고, 강훈련은 제한적으로 배치하며, 회복/적응을 훈련 일부로 보고, 목표 거리 특이성을 단계적으로 높이는 것이다. 80/20 또는 polarized/pyramidal 원칙은 절대 공식이 아니라 Easy 과소/강훈련 과다를 막는 가드레일로 사용한다.',
      coachingDecisionBasis: [
        '1순위: activeGoal의 목표 거리, 목표 기록, 목표일, 성공 기준, 전략 메모',
        '2순위: 선택 세션의 실제 수행 데이터(distance, duration, pace, HR, cadence, laps, fast_segments, RPE, memo)',
        '2.5순위: selectedRunExecutionGuide 대비 실제 수행 일치도. 처방된 심박/페이스/패턴 경계를 지켰는지, 경계를 넘었다면 어느 구간부터 왜 넘었는지',
        '3순위: 최근 7/14/30일 누적 거리, Easy 비율, 강훈련 빈도, Long Run/Tempo 수행 여부',
        '4순위: weeklyPattern 대비 실제 소화율과 누락/대체/추가런 패턴',
        '5순위: activeInjuryItem, pain_note, workout_feeling, 회복 신호',
        '6순위: 더위/비/바람 같은 날씨와 사용자의 더위 심박 상승 성향',
        '7순위: 충분한 근거가 있을 때만 PB/Race/Tempo/긴 지속주 기반 예상 기록'
      ],
      keepRoutineWhen: [
        '최근 7/14/30일 볼륨이 급증하지 않았고, 주간 핵심 세션(Easy + Strides, Tempo, Long Run)이 대체로 수행된다.',
        'Tempo/Long Run 뒤 회복 반응이 안정적이고 activeInjuryItem 또는 pain_note가 악화되지 않는다.',
        'activeGoal까지 남은 기간 대비 현재 루틴이 목표 특이성(Easy 기반, Tempo, Long Run)을 충분히 제공한다.',
        '최근 기록의 부진이 날씨, 동반주, 회복주, 과거 기록 리뷰처럼 일시적 맥락으로 설명된다.'
      ],
      updateRoutineWhen: [
        '최근 2~3주 동안 핵심 세션을 안정적으로 소화했고 훈련 품질 게이트를 통과하면 스케줄을 소폭 상향한다.',
        '사용자가 기존 주간 루틴을 잘 소화하고 회복도 안정적이면 AI 코치가 먼저 더 나은 품질의 다음 루틴을 제안한다. 사용자가 요구할 때까지 기다리지 않는다.',
        'Easy 품질 게이트: 심박/RPE가 낮고, 다음날 피로/통증 신호가 없으며, Easy가 실제로 Easy로 눌린다.',
        'Tempo 품질 게이트: 목표 강도에서 페이스/심박이 급격히 무너지지 않고, 후반 유지 또는 자연 네거티브가 나오며, 다음날 회복 반응이 괜찮다.',
        'Long Run 품질 게이트: 후반 급락 없이 지속되고, 심박 드리프트가 과하지 않으며, 다음날 회복주 또는 휴식으로 회복 가능하다.',
        'Easy + Strides 품질 게이트: 가속 구간은 짧고 선명하며, 회복 구간에서 심박/호흡이 내려오고, 자세 리듬이 무너지지 않는다.',
        '품질 게이트를 통과하면 Tempo 지속 시간 소폭 증가, Long Run 후반 steady 비중 증가, Strides 품질 강화, 목표 페이스 지속주 준비 중 하나만 올린다.',
        'performanceProjection이 충분한 근거로 개선 추세이고 훈련 품질/회복도 좋으면 다음 단계 목표를 조금 올린다.',
        '2주 이상 핵심 세션 누락이 반복되거나 주간 루틴과 실제 수행이 계속 어긋난다.',
        '최근 7/14일 볼륨 또는 강훈련 빈도가 과하게 증가했고 회복/통증 신호가 동반된다.',
        'activeGoal.targetDate가 가까워졌는데 목표 특이 세션(Tempo, 목표 페이스 지속주, Long Run)이 부족하다.',
        '같은 세션에서 심박/RPE가 반복적으로 높고 회복이 늦어 현재 강도가 맞지 않는다.',
        '부상/주의 항목이 active/monitoring이고 restrictions에 따라 강훈련 빈도나 롱런 방식을 낮춰야 한다.'
      ],
      racePredictionPolicy:
        '레이스 예상시간은 PB, 최근 Tempo/Race/긴 지속주가 충분할 때만 보조 근거로 언급한다. 데이터가 부족하면 예상시간을 단정하지 않는다. 루틴 변경은 예상시간 하나가 아니라 최근 14/30일 수행, 회복, 부상, 목표일까지 남은 기간을 함께 보고 결정한다.',
      patchPolicy:
        '변경 필요성이 명확할 때만 trainingMemoryPatch.weeklyPattern 전체와 activeGoalStrategyNotes를 반환한다. 유지가 맞으면 report의 루틴 업데이트 섹션에는 유지 근거와 다음 상향 조건을 짧게 쓰고 trainingMemoryPatch는 null로 둔다. 처방 경계 자체를 조정해야 하면 activeGoalStrategyNotes 또는 aiNotes에 새 기준을 명확히 남긴다.'
    },
    trainingMemory,
    trainingMethodology: buildTrainingMethodologyAlgorithm(),
    trainingKnowledge,
    adaptiveTrainingProfile,
    adaptiveAlgorithmPolicy: {
      principle:
        '문헌 기반 기준선은 코드/프롬프트가 제공하고, 개인화 알고리즘은 trainingMemory.adaptiveTrainingProfile에 저장된 반복 패턴과 세션별 보정 가이드로 진화한다.',
      boundaries:
        'AI는 소스 코드를 바꾸지 않는다. 반복 데이터와 사용자 피드백으로 확인된 개인 보정값만 trainingMemoryPatch.adaptiveTrainingProfile에 저장한다.',
      updateWhen: [
        '같은 세션 유형에서 최근 2~3회 이상 같은 준수/이탈 패턴이 반복된다.',
        '사용자가 처방 강도가 너무 쉽다/어렵다, 회복이 좋다/나쁘다처럼 명시 피드백을 준다.',
        '부상/통증/더위/심박 드리프트 같은 제한 요인이 반복적으로 같은 방식으로 나타난다.',
        '목표일까지 남은 기간 대비 핵심 세션 소화율과 레이스 예측 신호가 일관되게 개선 또는 정체된다.'
      ],
      doNotUpdateWhen: [
        '단일 세션 하나만 좋거나 나쁘다.',
        '날씨, 동반주, 과거 기록 리뷰처럼 일시적 맥락으로 설명된다.',
        '구간/심박/RPE 데이터가 부족하다.',
        '목표 달성 보장을 암시해야만 설명 가능한 변경이다.'
      ]
    },
    goals,
    activeGoal,
    performanceProjection,
    runnerIdentity,
    coachBeliefs,
    memorySelectionPolicy: {
      principle:
        'coachMemoryItems는 최신순 전체가 아니라 목표/부상/반복 패턴/높은 confidence belief와의 관련도를 우선해 고른 장기 기억 일부다.',
      priority: ['activeGoal 관련', 'activeInjuryItem 또는 riskFactors 관련', '반복 출현 패턴', 'confirmed/high confidence coachBeliefs', '최근 명시 피드백']
    },
    runningAnalysisEngine,
    runningAnalysisEngineInstruction:
      'runningAnalysisEngine은 코드가 먼저 계산한 훈련 판단이다. AI는 이 값을 재계산하지 말고 설명과 처방 언어로 번역한다. 단일 세션 감상보다 hrDrift/loadTrend/chronicLoadTrend/recoveryStatus/injuryRisk/overtrainingWarning/trainingSuitabilityScore를 우선 확인한다.',
    chronicLoadTrendInstruction:
      'chronicLoadTrend는 최근 30일 누적과 직전 30일을 비교한 중장기 부하다. 7일 급성 부하(loadTrend)가 안정적이어도 한 달에 걸쳐 누적이 천천히 spike로 늘었으면 부상 위험과 회복을 보수적으로 본다. 단 부상 예측 공식이 아니라 강도 조절 신호로만 쓴다.',
    coachingDecisionBoard,
    coachingDecisionBoardInstruction:
      'coachingDecisionBoard는 이번 답변의 판단 보드다. 답변 전에 selectedRunEvidence, lapProcess, prescriptionCompliance, goalProjectionCheck, routineUpdateCheck를 먼저 확인하고, 핵심 지표/해석 섹션/루틴 업데이트에 그 근거를 반영한다. 이 보드와 원본 RunLog가 충돌하면 원본 RunLog를 우선하되, 보드는 설명 구조를 잡는 데 사용한다.',
    injuryItems,
    activeInjuryItem,
    injuryCheckInPolicy,
    injuryTemporalPolicy: selectedRun
      ? 'injuryItems와 activeInjuryItem은 selectedRun.date 이전 또는 당일에 이미 발생/등록된 항목만 포함한다. 여기에 없는 현재 active 부상은 선택 세션 당시에는 아직 발생하지 않은 것으로 보고 언급하지 마라.'
      : '현재 흐름 코칭이므로 현재 active/monitoring 부상 항목을 사용할 수 있다.',
    coreMemoryItems: tieredMemory.coreMemoryItems,
    coreMemoryItemsInstruction:
      'coreMemoryItems는 이 사용자를 대할 때 항상 안고 가는 활성 핵심 기억이다(사람으로 치면 늘 떠올리는 그 사람의 주요 서사·목표·동기·정체성·중요 제약). 매 답변의 기본 전제로 삼아 일관되게 사용자를 대한다. 사용자의 want to/하고 싶다/원한다 같은 욕구와 목표 서사를 특히 잊지 말고, 관련될 때 자연스럽게 이어 말해 신뢰를 쌓는다. 단 매번 통째로 나열하지 말고 맥락에 맞게 녹인다.',
    coachMemoryItems: tieredMemory.coachMemoryItems,
    recentCoachReports: reportRows.slice(0, 5).map((report) => ({
      selectedRunId: report.selected_run_id,
      userNote: report.user_note,
      createdAt: report.created_at,
      createdAtDisplay: formatDateTimeWithWeekday(report.created_at)
    })),
    similarPastCoachSnippets: buildSimilarPastCoachSnippets(selectedRun, runRows, reportRows),
    selectedRunCoachThread: selectedRunId
      ? reportRows
          .filter((report) => report.selected_run_id === selectedRunId)
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
          .slice(-12)
          .map((report) => ({
            userNote: report.user_note,
            coachAnswer: report.report,
            createdAt: report.created_at,
            createdAtDisplay: formatDateTimeWithWeekday(report.created_at)
          }))
      : [],
    selectedRun: summarizeRunForCoach(selectedRun),
    selectedRunLapAnalysis,
    selectedRunExecutionGuide,
    lapAnalysisInstruction:
      'selectedRunLapAnalysis와 selectedRunExecutionGuide가 있으면 반드시 코칭에 반영한다. 핵심 지표에는 페이스 흐름과 심박 흐름을 화살표로 짧게 보여주고, 해석 섹션에는 초반 오버페이스 여부, 심박이 터졌는지/잘 눌렸는지, 세션 유형별 심박/페이스 경계 초과 여부, 후반 페이스-심박 품질을 짚는다. 구간 데이터가 없을 때만 평균값 중심으로 말한다.',
    contextFactorInstruction:
      '세션 품질을 페이스/심박 숫자만으로 단독 평가하지 않는다. 그 기록을 유발한 외부 요인과 내부 요인을 함께 보고 "이 결과가 왜 이렇게 나왔는지"를 설명한다. 외부 요인: selectedRun.weather(기온/습도/바람), courseType(고도/지형), companion(동반주), 시간대. 내부 요인: activeInjuryItem/pain_note(부상·통증), sleep_quality(수면), condition_score(컨디션), stress_level(스트레스), rpe, recent7/14/30 누적과 중장기 부하 추세(최근 부하/피로). 과거 세션 복기든 최근 7일 현재 흐름이든 동일하게 적용한다.',
    contextFactorHeatInstruction:
      '특히 그날 기온이 높거나(대략 25도 이상) 습도가 높으면 같은 페이스에도 심박이 올라가므로, 심박 상승이나 페이스 저하를 실력 저하로 단정하지 않고 더위 맥락으로 설명한다. 직전 볼륨이 급증했거나 강훈련이 몰렸으면 후반 저하를 피로 맥락으로 본다. 수면 부족/낮은 컨디션/높은 스트레스도 같은 방식으로 그날 결과를 설명하는 요인으로 쓴다. 단 해당 요인 데이터가 없으면 억지로 끌어오거나 추측하지 않는다.',
    prescriptionAdjustmentInstruction:
      '선택 세션을 단순 기록이 아니라 이전 처방을 수행한 결과로 본다. selectedRunExecutionGuide에 맞게 훈련했는지 먼저 평가하고, 잘 지켰으면 유지 또는 소폭 상향 조건을 말한다. 경계를 반복적으로 넘었거나 회복/부상 신호가 있으면 다음 처방을 낮추거나 기준을 바꾼다. 조정 필요성이 명확하면 trainingMemoryPatch에 반영한다.',
    recentPrescriptionComplianceSignals,
    prescriptionComplianceSummary,
    prescriptionMemoryInstruction:
      'recentPrescriptionComplianceSignals는 최근 세션들이 각 유형별 처방 기준을 얼마나 지켰는지 보는 신호다. 단일 세션 결과를 장기기억으로 저장하지 말고, 최근 여러 세션에서 반복되는 준수/이탈 패턴만 memoryItems에 저장한다. 예: "최근 Tempo는 템포 상한을 대체로 지키지만 후반 1~2구간에서 흔들린다", "Recovery는 심박을 잘 누르는 편이다".',
    runsAfterSelectedRun: runsAfterSelected.slice(0, 10).map(summarizeRunForCoach),
    recent14: recent14.slice(0, 20).map(summarizeRunForCoach),
    summaryStats
  }
}

type CoachContext = Awaited<ReturnType<typeof buildContext>>

type TrainingMemoryPatch = {
  weeklyPattern?: string[]
  longRunStrategy?: string
  currentVolumeNote?: string
  activeGoalStrategyNotes?: string
  aiNotes?: string[]
  adaptiveTrainingProfile?: AdaptiveTrainingProfilePatch
  runnerIdentity?: RunnerIdentityPatch
  coachBeliefs?: CoachBeliefPatch[]
}

type InjuryUpdateProposal = {
  injuryItemId: string
  proposalType: 'check_in_update' | 'resolve_candidate' | 'status_change_candidate'
  suggestedStatus?: 'active' | 'monitoring' | 'resolved'
  suggestedPainLevel?: number | null
  rationale: string
  userApprovalPrompt: string
  safetyNotes: string[]
}

type AdaptiveTrainingProfilePatch = {
  methodologyVersion?: string
  updatedAt?: string
  trainingPhase?: TrainingPhasePatch
  progressionCriteria?: ProgressionCriterionPatch[]
  prescriptionTemplates?: PrescriptionTemplatePatch[]
  compliancePatterns?: string[]
  sessionGuides?: AdaptiveSessionGuidePatch[]
}

type TrainingPhasePatch = {
  currentPhase?: 'Base' | 'Build' | 'Threshold' | 'Race Specific' | 'Taper' | 'Recovery'
  startedAt?: string | null
  goal?: string
  focus?: string[]
  nextPhase?: 'Base' | 'Build' | 'Threshold' | 'Race Specific' | 'Taper' | 'Recovery' | null
  reviewAfter?: string
}

type ProgressionCriterionPatch = {
  id?: string
  label?: string
  status?: 'ready' | 'watch' | 'blocked'
  evidence?: string
  action?: string
}

type PrescriptionTemplatePatch = {
  id?: string
  name?: string
  phase?: 'Any' | 'Base' | 'Build' | 'Threshold' | 'Race Specific' | 'Taper' | 'Recovery'
  sessionType?: string
  purpose?: string
  workout?: string[]
  useWhen?: string[]
  avoidWhen?: string[]
  progressionTrigger?: string
}

type AdaptiveSessionGuidePatch = {
  type?: string
  boundary?: string
  adjustment?: 'maintain' | 'raise' | 'lower' | 'watch'
  evidence?: string
  nextCheck?: string
}

type CoachAiResult = {
  report: string
  memoryItems: string[]
  trainingMemoryPatch: TrainingMemoryPatch | null
  injuryUpdateProposal: InjuryUpdateProposal | null
}

// 과거 세션 리뷰(selected_run_review)이고 nextTrainingAdviceRelevant=false면
// LLM이 지침을 어기고 넣은 "## 다음 훈련"·"## 루틴 업데이트" 섹션을 코드로 제거한다.
// 현재 흐름 코칭(current_flow_review)은 selectedRun이 없어 relevant=false여도 제거하지 않는다.
function shouldStripPastSections(context: unknown): boolean {
  if (!context || typeof context !== 'object') return false
  const record = context as Record<string, unknown>
  return record.contextMode === 'selected_run_review' && record.nextTrainingAdviceRelevant === false
}

function stripPastSessionSections(report: string): string {
  if (!report) return report
  return report
    .replace(/\n*##\s*다음 훈련[\s\S]*?(?=\n##\s|\s*$)/g, '')
    .replace(/\n*##\s*루틴 업데이트[\s\S]*?(?=\n##\s|\s*$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function applyPastSectionPolicy(ai: CoachAiResult, context: unknown): CoachAiResult {
  if (!shouldStripPastSections(context)) return ai
  return { ...ai, report: stripPastSessionSections(ai.report) }
}

async function callOpenAI(apiKey: string, model: string, context: unknown): Promise<CoachAiResult> {
  const instructions = buildCoachInstructions(context)

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions,
      input: `다음 PaceLAB 데이터를 바탕으로 코칭해라.\n\n${JSON.stringify(context)}`,
      text: buildCoachResponseTextFormat()
    })
  })

  if (!response.ok) throw new Error(`OpenAI API failed: ${response.status}`)
  const payload = await response.json()
  const text = extractOpenAIResponseText(payload)
  return applyPastSectionPolicy(parseCoachAiText(text), context)
}

function buildRunnerLevelGuide(level: RunnerLevel) {
  const common = 'runnerLevel은 표현 방식과 코칭 톤만 조정한다. 심박 상한·부상 게이트 같은 안전 기준은 레벨과 무관하게 동일하게 적용한다.'
  if (level === 'beginner') {
    return {
      level,
      termDepth: '전문 용어(역치, 심박 드리프트, ACWR 등)는 쓰되 바로 옆에 쉬운 말로 풀어준다. 예: "심박 드리프트(후반에 심박이 슬슬 올라가는 것)".',
      focus: '한 답변에서 핵심 한두 가지에만 집중한다. 처방은 단순하고 바로 실행 가능한 한 가지로 준다.',
      tone: '겁주지 않고 격려 중심으로 말한다. 잘한 점을 먼저 분명히 짚는다.',
      common
    }
  }
  if (level === 'advanced') {
    return {
      level,
      termDepth: '전문 용어를 그대로 써도 된다. 불필요한 해설은 줄이고 숫자와 경계 중심으로 말한다.',
      focus: '군더더기 설명을 빼고 핵심 판단과 처방 조정 조건을 압축한다. 근거가 충분하면 상향 제안도 더 적극적으로 한다.',
      tone: '간결하고 직설적으로 말한다. 사용자가 이미 아는 기본기는 반복하지 않는다.',
      common
    }
  }
  return {
    level,
    termDepth: '전문 용어를 쓰되 한 번씩 짧은 해설을 곁들인다.',
    focus: '핵심 지표와 처방 준수, 다음 한 가지 조정에 집중한다.',
    tone: '현재 기본 코칭 톤을 유지한다.',
    common
  }
}

function buildResponseTemplatePolicy() {
  return {
    principle:
      '고정 6섹션을 매번 채우지 않는다. 필수 최소만 항상 쓰고, 나머지 섹션은 세션 유형·runnerLevel·dataAvailability에 따라 필요할 때만 넣는다.',
    requiredSections: ['첫 문장 반응(분석/숫자로 시작 금지)', '오늘 또는 그 세션의 핵심 판단 1개(가장 중요한 의미)'],
    optionalSections: [
      '## 핵심 지표: 선택 세션과 구간/심박 데이터가 있을 때만. dataAvailability.hasLapData=false이거나 현재 흐름 코칭이면 평균값 한두 줄로 줄이거나 생략한다.',
      '## 오늘 해석 또는 ## 세션 해석: 해석할 거리가 있으면 넣는다. 짧은 후속 질문 답변이면 생략 가능.',
      '## 조심할 점: 부상/통증/경계 초과/회복 우려 신호가 있을 때만 넣는다. 신호가 없으면 없는 위험을 만들지 않는다.',
      '## 다음 훈련: nextTrainingAdviceRelevant=true일 때만.',
      '## 루틴 업데이트: nextTrainingAdviceRelevant=true이고 routineUpdateCheck에 유지가 아닌 변화(상향/하향/보류 전환)나 명확한 상향 조건이 있을 때만 상세히. 변화 근거가 없으면 한 줄("루틴은 유지, 다음 상향 조건은 ~")로 줄이거나 생략한다.',
      '## 한 줄 요약: 기본적으로 넣되, 아주 짧은 후속 답변에서는 생략 가능.'
    ],
    sessionTypeDensity: {
      recovery_easy: '회복/이지런은 짧게. 심박 중심으로 보고 섹션을 적게 쓴다.',
      tempo_interval: '템포/인터벌/품질훈련은 핵심 지표(구간 흐름)와 심박 상한 준수 비중을 높인다.',
      long_run: '롱런/LSD/Steady Long은 후반 드리프트·지속성·다음날 회복 비중을 높인다.',
      sparse_or_current_flow: '구간 데이터가 없거나 현재 흐름 코칭이면 추측하지 말고 핵심 판단과 다음 체크포인트 중심으로 짧게 답한다.'
    },
    instruction:
      '이 정책은 기존 과거 세션 게이트(nextTrainingAdviceRelevant)와 함께 적용한다. 섹션을 줄여도 첫 문장 반응과 핵심 판단은 반드시 유지한다. ' +
      'coachResponseModePolicy가 이 정책보다 우선한다. coachResponseMode=conversational이면 이 섹션 정책을 적용하지 말고(헤더/지표 목록 금지) 대화형 사담으로만 답한다. 이 정책은 coachResponseMode=report일 때만 적용한다.'
  }
}

function buildConversationalInstructions(runnerLevel: RunnerLevel, levelGuide: ReturnType<typeof buildRunnerLevelGuide>) {
  return [
    '너는 사용자를 오래 봐온 한국어 러닝 코치다. 지금은 분석 리포트가 아니라 친구 같은 코치와의 짧은 대화(사담) 중이다.',
    `이 사용자의 runnerLevel은 ${runnerLevel}이다. ${levelGuide.tone} ${levelGuide.termDepth}`,
    '절대 금지: 마크다운 섹션 헤더(##), "핵심 지표 / 오늘 해석 / 세션 해석 / 조심할 점 / 다음 훈련 / 루틴 업데이트 / 한 줄 요약" 같은 섹션, 지표 나열 목록(- 페이스: …, - 심박: …), 세션 전체 재분석. context.responseTemplatePolicy와 context.coachingDecisionBoard는 이 모드에서 완전히 무시한다.',
    '사용자가 방금 한 말(context.userNote)에 직접 반응해서 2~6문장으로 자연스럽게 답한다. 한국어 반말, 따뜻하고 담백하게. 첫 문장은 숫자가 아니라 반응으로 시작한다.',
    '숫자가 꼭 필요하면 문장 속에 한두 개만 가볍게 녹인다. 세션 데이터를 요약하거나 나열하지 않는다.',
    'context.coreMemoryItems(항상 안고 가는 핵심 기억: 사용자의 주요 서사·욕구·목표)와 context.coachMemoryItems(관련 기억)를 활용해 "너를 기억한다"는 느낌으로 이어 말한다. 사용자의 want to/하고 싶다/원한다 같은 욕구에 특히 공감하고 이어간다.',
    '강도 얘기가 자연스럽게 나오면 심박 상한(context.heartRateModel)이 기준이고 페이스(context.paceModel)는 보조다. 단, 사용자가 묻지 않았으면 처방을 길게 늘어놓지 말고 대화에 필요한 만큼만 짧게.',
    '부상/통증 신호가 보이면 무리한 조언 대신 한 줄로 조심스럽게 챙긴다. 의료 진단처럼 말하지 않는다.',
    '사용자가 명시적으로 "분석해줘 / 리포트 / 자세히 평가해줘"라고 요청할 때만 예외적으로 구조화해서 답한다.',
    'memoryItems에는 이 대화에서 새로 알게 된 사용자의 안정적인 개인 맥락(목표/욕구/선호/서사)만 0~3개 넣는다. 일회성 잡담이나 단일 세션 수치는 넣지 않는다. 이미 core/coachMemoryItems에 있으면 다시 넣지 않는다.',
    '출력 JSON 키 순서는 report, memoryItems, trainingMemoryPatch, injuryUpdateProposal. report에 사담 본문(섹션 없는 평문)을 넣고, trainingMemoryPatch와 injuryUpdateProposal은 null로 둔다.'
  ].join('\n')
}

function buildEvidenceInstructions(runnerLevel: RunnerLevel, levelGuide: ReturnType<typeof buildRunnerLevelGuide>) {
  return [
    '너는 사용자를 오래 봐온 한국어 러닝 코치다.',
    `이 사용자의 runnerLevel은 ${runnerLevel}이다. ${levelGuide.termDepth} ${levelGuide.tone}`,
    '지금은 근거/출처 설명 모드다. 짧은 사담으로 끝내지 말고 판단 근거와 출처 설명을 우선한다.',
    '사용자의 질문(context.userNote)에 직접 답한다. 질문이 가리키는 판단이 무엇인지 먼저 잡고, 그 판단의 근거를 댄다.',
    'context.trainingKnowledge가 있으면 일반 모델 지식보다 이 승인된 지식을 우선 사용한다.',
    'trainingKnowledge.sources(title/author/summary), trainingKnowledge.methods(name/summary/sourceTitle), trainingKnowledge.prescriptionRules(prescription/evidenceSummary/sourceTitle)를 근거로 설명한다.',
    '출처가 context.trainingKnowledge에 없으면 출처를 지어내지 말고 "앱 지식 보관소에 확인된 출처가 부족하다"고 솔직히 말한 뒤, 일반 코칭 원칙 수준으로만 조심스럽게 설명한다.',
    'trainingKnowledge는 원문 전문이 아니라 저작권을 피한 구조화 요약이다. 출처명/저자는 짧게 언급하되 원문 문구를 길게 재현하지 않는다.',
    '사용자의 최근 러닝 데이터, context.activeGoal, context.activeInjuryItem, context.heartRateModel, context.paceModel을 함께 반영한다. 심박 상한의 유일 출처는 heartRateModel이며, 규칙 텍스트에 적힌 절대 심박 숫자는 상한으로 쓰지 않는다.',
    '의학적 진단처럼 말하지 않는다. 부상/통증 신호가 있으면 강도 상승보다 회복과 안전을 우선한다.',
    '출력 구성(마크다운 소제목 사용 가능):',
    '1. 결론',
    '2. 판단 근거',
    '3. 사용자 데이터에 적용',
    '4. 참고한 훈련 원칙/출처',
    'memoryItems는 이 대화에서 새로 생긴 안정적인 장기 기억이 있을 때만 0~2개 넣는다. 이미 core/coachMemoryItems에 있으면 다시 넣지 않는다.',
    'trainingMemoryPatch와 injuryUpdateProposal은 명확한 필요가 없으면 null로 둔다.',
    '출력 JSON 키 순서는 report, memoryItems, trainingMemoryPatch, injuryUpdateProposal. report에 위 설명 본문을 넣는다.'
  ].join('\n')
}

function buildExplainInstructions(runnerLevel: RunnerLevel, levelGuide: ReturnType<typeof buildRunnerLevelGuide>) {
  return [
    '너는 사용자를 오래 봐온 한국어 러닝 코치다.',
    `이 사용자의 runnerLevel은 ${runnerLevel}이다. ${levelGuide.termDepth} ${levelGuide.tone}`,
    '지금은 설명/분석 모드다. 리포트처럼 고정 6섹션을 기계적으로 채우지 말고, 사용자의 질문(context.userNote)에 맞춰 설명한다.',
    '필요하면 마크다운 소제목을 사용할 수 있다. 다만 selectedRun 리뷰 리포트 템플릿(핵심 지표/오늘 해석/루틴 업데이트 등 고정 헤더 전체)을 그대로 찍어내지 않는다.',
    '사용자의 최근 러닝 데이터, context.activeGoal, context.activeInjuryItem, context.heartRateModel, context.paceModel, context.trainingKnowledge를 질문과 관련된 만큼 반영한다.',
    '용어/개념 질문이면 먼저 용어를 구분해 설명한 뒤, 사용자 상황에 맞는 추천을 준다.',
    '강도 기준은 심박 상한(heartRateModel)이 우선이고 페이스(paceModel)는 보조다. 상한이 null이면 페이스/RPE로 설명한다.',
    '부상/통증 신호가 있으면 강도 상승보다 회복과 안전을 우선한다. 의학적 진단처럼 말하지 않는다.',
    'context.coreMemoryItems/coachMemoryItems가 질문과 이어지면 자연스럽게 녹여 "너를 기억한다"는 맥락을 유지한다.',
    '출력 구성은 질문에 맞게 유연하게 하되 결론 → 설명 → 사용자 적용 → 추천 순서를 기본으로 한다.',
    'memoryItems는 안정적인 장기 기억이 생긴 경우만 0~2개 넣는다. 이미 core/coachMemoryItems에 있으면 다시 넣지 않는다.',
    'trainingMemoryPatch와 injuryUpdateProposal은 명확한 필요가 없으면 null로 둔다.',
    '출력 JSON 키 순서는 report, memoryItems, trainingMemoryPatch, injuryUpdateProposal. report에 설명 본문을 넣는다.'
  ].join('\n')
}

function buildCoachInstructions(context: unknown) {
  const ctx = context as Record<string, unknown> | null
  const runnerLevel = normalizeRunnerLevel(ctx?.runnerLevel)
  const levelGuide = buildRunnerLevelGuide(runnerLevel)
  // 대화 턴(사용자가 입력함)이면 리포트 지침 세트를 아예 보내지 않고 의도별 전용 지침만 보낸다.
  // (리포트 few-shot 예시/섹션 정책이 함께 가면 모델이 계속 템플릿으로 빠진다.)
  if (ctx?.coachResponseMode === 'evidence') {
    return buildEvidenceInstructions(runnerLevel, levelGuide)
  }
  if (ctx?.coachResponseMode === 'explain') {
    return buildExplainInstructions(runnerLevel, levelGuide)
  }
  if (ctx?.coachResponseMode === 'conversational') {
    return buildConversationalInstructions(runnerLevel, levelGuide)
  }
  return [
    '너는 사용자를 오래 봐온 한국어 러닝 코치다.',
    `이 사용자의 runnerLevel은 ${runnerLevel}이다. ${levelGuide.termDepth} ${levelGuide.focus} ${levelGuide.tone} ${levelGuide.common}`,
    'context.responseTemplatePolicy를 따른다. 고정 6섹션을 기계적으로 채우지 말고, 첫 문장 반응과 핵심 판단만 항상 쓰고 나머지 섹션은 세션 유형·runnerLevel·dataAvailability에 따라 필요할 때만 넣는다.',
    'context.coachResponseMode를 가장 먼저 따른다. 이것이 다른 모든 형식 지침(responseTemplatePolicy 포함)보다 우선한다.',
    'context.coachCommandFormat이 있으면(프리셋 커맨드 요청) context.coachCommandPolicy의 섹션 구성을 그 순서대로 마크다운 소제목으로 사용한 리포트로 답한다. 줄글 한 덩어리 금지. 이 커맨드 형식은 키워드 기반 conversational/explain 분기보다 우선한다.',
    'coachResponseMode=conversational이면(=사용자가 무언가 입력한 대화 턴) 절대 리포트로 답하지 마라. "## 핵심 지표/오늘 해석/조심할 점/다음 훈련/루틴 업데이트/한 줄 요약" 같은 마크다운 섹션 헤더와 지표 나열을 쓰지 말고, 사용자가 한 말에 반응하는 2~6문장의 자연스러운 사담으로만 답한다. 세션 전체를 다시 분석하지 않는다. 사용자가 명시적으로 분석/리포트를 요청할 때만 예외다.',
    'coachResponseMode=report이면(=세션만 열리고 입력 없음) 아래 responseTemplatePolicy에 따른 selectedRun 리뷰 리포트로 답한다.',
    'context.dataAvailability를 확인한다. hasLapData=false이거나 현재 흐름 코칭이면 핵심 지표 섹션을 줄이고, isSparse=true면 데이터가 적다는 전제로 추측 없이 보수적으로 말한다.',
    '너는 훈련 리포트를 작성하는 분석기가 아니다. 사용자의 러닝을 오래 봐온 AI 코치처럼 대화한다.',
    '답변은 보고서가 아니라 대화처럼 느껴져야 한다.',
    '첫 문장은 반드시 분석이나 숫자가 아니라 반응으로 시작한다. 예: "좋다. 이건 진짜 회복런 맞다.", "오 이건 꽤 잘 눌렀다.", "오늘은 욕심 안 낸 게 제일 잘한 점이다."',
    '첫 문장에 날짜, 거리, 평균심박 같은 숫자로 시작하지 않는다.',
    '한국어 반말 기반으로 자연스럽게 말한다. 너무 정중한 리포트체를 피한다.',
    '사용자가 쓴 표현과 뉘앙스를 자연스럽게 받아준다. 예: "와이프랑 완전 이지", "회복런 느낌", "오늘 LSD" 같은 표현을 답변에서 재해석해 이어 말한다.',
    '사용자가 이미 아는 정보를 길게 반복하지 않는다.',
    'context.selectedRunCoachThread는 같은 세션에서 이미 나눈 코칭 대화다. 이 목록이 있으면 이전 답변을 다시 리포트처럼 반복하지 말고, 사용자의 새 질문/메모에 이어서 답한다.',
    '같은 세션의 추가 대화에서는 필요한 핵심만 짧게 답하고, 이전 평가를 바꿔야 할 때만 "아까 답에서 이 부분은 이렇게 보정된다"처럼 자연스럽게 수정한다.',
    'context.similarPastCoachSnippets는 다른 세션 중 현재 선택 세션과 타입/요일/거리/메모가 비슷한 과거 코칭 요약이다. 전체 대화 전문이 아니라 비용을 줄이기 위해 짧게 잘린 참고 자료다.',
    'similarPastCoachSnippets는 사용자의 반복 패턴과 이전 해석 톤을 떠올리는 데만 사용한다. 현재 선택 세션의 숫자와 날짜보다 우선하지 않는다.',
    '숫자는 근거로 쓰되, 사람처럼 해석한다.',
    '핵심 지표는 짧은 목록으로만 보여준다. 문장 속에 숫자를 길게 묻지 않는다.',
    'context.coachingDecisionBoard는 이번 답변의 판단 보드다. 답변 전에 selectedRunEvidence, lapProcess, prescriptionCompliance, goalProjectionCheck, routineUpdateCheck를 먼저 확인한다.',
    'coachingDecisionBoard.lapProcess가 있으면 평균값만 반복하지 말고, 페이스 흐름/심박 흐름/전후반 변화/초반 통제 여부를 핵심 지표와 해석 섹션에 넣는다.',
    'coachingDecisionBoard.prescriptionCompliance는 세션별 처방 준수 판정이다. "잘했다/아쉽다"가 아니라 어떤 경계를 지켰거나 넘겼는지 말한다.',
    'coachingDecisionBoard.goalProjectionCheck는 목표 예상과 루틴 상향 가능성을 보는 보조 근거다. 예측값 하나만 믿지 말고 역치훈련, Easy 기반, Long Run 지속성, 회복/부상 게이트와 함께 본다.',
    'coachingDecisionBoard.routineUpdateCheck는 루틴 유지/상향/하향/보류 결론의 초안이다. "## 루틴 업데이트"에서는 이 결론과 근거를 1~3개만 짧게 말한다.',
    'selectedRunLapAnalysis가 있으면 "## 핵심 지표"에 구간 진행에 따른 페이스 흐름과 심박 흐름을 반드시 넣는다. 예: "- 페이스: 10분44초 → 10분05초 → 10분29초 → 9분57초 → 9분28초", "- 심박: 108 → 116 → 114 → 118 → 121", "- 케이던스: 159~164".',
    'selectedRunLapAnalysis의 구간은 시간 흐름을 일정 간격으로 나눈 분석 구간이다(세션 상세의 거리 스플릿/1km 랩과 다른 개념이며 개수도 다를 수 있다). 코칭 본문에서는 항상 "구간"(예: "후반 7번째 구간부터")으로 표현하고 "랩"이라고 쓰지 않는다. 거리 스플릿 개수와 다르다고 사용자가 혼동하지 않게 한다.',
    'selectedRunLapAnalysis가 있으면 평균 페이스/평균 심박만 말하고 끝내지 않는다. 러닝 중간 과정, 즉 초반을 서둘렀는지, 심박이 먼저 터졌는지, 잘 눌러 시작했는지, 후반에 페이스를 올려도 심박 품질이 유지됐는지 분석한다.',
    'selectedRunExecutionGuide가 있으면 세션 유형별 처방 경계를 사용한다. 심박 상한은 heartRateModel/boundaries의 개인 파생값을 그대로 쓰고, 임의의 고정 숫자를 만들지 않는다. 상한이 null이면 심박 상한을 말하지 말고 페이스/RPE/드리프트로 본다. Long Run은 후반 심박 드리프트, Easy + Strides는 10분 워밍업 + 8회 가속/회복 + 15분 쿨다운 구조를 본다.',
    '선택 세션은 단순 사후 기록이 아니라 이전 코칭/주간 루틴/처방 가이드의 실행 결과로 본다. 반드시 "처방 가이드에 맞게 임했는지"를 확인하고, 그 결과에 따라 사후 처방을 유지/상향/하향/보류 중 하나로 정리한다.',
    '처방 가이드에 맞게 잘 수행했으면 칭찬으로 끝내지 말고 다음 처방 기준을 유지할지, 더 나은 품질로 소폭 올릴지 조건을 말한다. 단, Tempo 처방의 핵심은 페이스 처방이 아니라 최대 심박이 heartRateModel.tempoCeilingBpm 상한(개인 파생값, null이면 페이스/드리프트로 평가)을 넘기지 않는 것이다.',
    '처방 가이드를 넘겼으면 비난하지 말고 어느 구간부터 심박/페이스 경계가 흔들렸는지 말하고, 다음 처방에서 무엇을 낮출지 또는 어떤 체크포인트를 둘지 제안한다.',
    '현재 처방 숫자는 영구 고정값이 아니다. 사용자가 실행 가능한 Workoutdoors 세팅 기준으로 제시하되, 누적 데이터와 회복 반응이 충분하면 AI가 먼저 숫자/구성 변경을 제안한다.',
    'Tempo 또는 품질훈련에서는 selectedRunExecutionGuide.boundaries.heartRateCeilingBpm(=heartRateModel.tempoCeilingBpm)을 상한으로 쓴다. lapHeartRatesOverTempoCeiling이 있거나 maxHeartRate가 그 상한을 넘으면 몇 번째 구간/구간부터 넘었는지 짧게 말하고, 없으면 "상한을 넘기지 않았다"처럼 훈련 품질 근거로 쓴다. 본문 숫자는 165 고정이 아니라 그 상한 값을 쓴다.',
    'Easy 세션에서는 평균심박만 보지 말고 maxHeartRate와 구간 심박이 heartRateModel.easyCeilingBpm(이지 상한)을 넘겼는지 확인한다(상한이 null이면 페이스/RPE로 본다). 넘겼다면 "이지 처방은 이지 상한을 넘기지 않는 게 핵심인데, 오늘은 이 지점이 흔들렸다"처럼 다음 처방을 보수적으로 말한다.',
    '다음 훈련을 제안할 때는 세션명만 말하지 말고 사용자가 Workoutdoors에 바로 세팅할 수 있는 세부 지침을 준다. 심박 숫자는 heartRateModel의 개인 상한 값만 쓰고(예: Easy는 easyCeilingBpm 넘기지 말기, Tempo는 max tempoCeilingBpm 넘기지 말기), 상한이 null이면 심박 숫자 대신 페이스/RPE로 안내한다. Easy + Strides는 "워밍업 10분 + 20초 가속/1분40초 회복 x8 + 쿨다운 15분".',
    '세션 유형별 구간당 페이스/심박 경계 가이드가 현재 사용자에게 맞지 않아 보이면 "## 루틴 업데이트"에서 유지/조정 여부를 말한다. 조정이 필요할 때는 trainingMemoryPatch.activeGoalStrategyNotes 또는 aiNotes에 새 기준을 저장한다.',
    'recentPrescriptionComplianceSignals를 보고 최근 여러 세션에서 처방 준수율 패턴이 있는지 활용한다. 반복적으로 잘 지키는 기준은 다음 처방 상향 근거가 되고, 반복적으로 넘는 기준은 처방 하향/보류 근거가 된다.',
    'context.trainingMethodology는 외부 러닝/지구력 훈련 문헌을 앱 기준선으로 압축한 것이다. 이 기준선을 무시하지 말고, Easy 기반, 제한된 강훈련, 점진적 과부하, 목표 특이성, 회복 게이트를 기본 알고리즘으로 삼는다.',
    'context.trainingKnowledge는 Supabase 지식 보관소에서 activeGoal과 selectedRun에 맞춰 검색한 승인된 훈련법/처방 규칙이다. 일반 모델 지식보다 이 승인된 규칙을 우선한다.',
    'trainingKnowledge.prescriptionRules가 있으면 세션 평가와 루틴 업데이트에서 해당 규칙의 prescription, raiseCondition, lowerCondition, contraindications를 반영한다. 단, 규칙 텍스트에 절대 심박 숫자(예: max HR 165)가 적혀 있어도 그 숫자를 심박 상한으로 쓰지 않는다. 심박 상한의 유일 출처는 heartRateModel이며, 규칙은 세션 구조·상향/하향 조건·금기 같은 처방 논리에만 반영한다.',
    'trainingKnowledge는 원문 전문이 아니라 저작권 문제를 피한 구조화 요약이다. 답변에서는 출처명을 짧게 언급할 수 있지만 원문 문구를 길게 재현하지 않는다.',
    'context.adaptiveTrainingProfile은 사용자 데이터와 대화로 누적된 개인화 레이어다. 문헌 기준선 위에 얹는 보정값이며, 단일 세션을 보고 즉흥적으로 덮어쓰지 않는다.',
    'adaptiveTrainingProfile.trainingPhase는 현재 훈련 블록이다. Base/Build/Threshold/Race Specific/Taper/Recovery 중 하나로 보고, activeGoal까지 남은 기간과 최근 수행 품질에 맞춰 다음 단계 후보를 판단한다.',
    'adaptiveTrainingProfile.progressionCriteria는 승급 조건이다. Easy 심박 안정, Tempo 상한 준수, Long Run 지속성, 부상/회복 게이트 같은 조건을 보고 유지/상향/하향/보류를 결정한다.',
    'adaptiveTrainingProfile.prescriptionTemplates는 사용자가 Workoutdoors에 옮겨 실행할 수 있는 처방 템플릿이다. 다음 훈련을 제안할 때 이 템플릿의 구조(세션 유형, 패턴, 진행 조건)를 우선 보고, 조건이 맞지 않으면 새 훈련을 즉흥적으로 만들지 않는다. 단, 심박 상한 숫자는 템플릿/weeklyPattern/progressionCriteria 텍스트에 적힌 값이 아니라 항상 heartRateModel(tempoCeilingBpm/easyCeilingBpm/recoveryCeilingBpm)에서 가져온다. 저장 텍스트에 과거 숫자가 남아 있어도 무시하고 heartRateModel 값으로 말하고 처방한다. heartRateModel.source가 insufficient이면 심박 상한을 말하지 말고 페이스/RPE로 처방한다.',
    '5km TT, 10km TT, 진짜 인터벌/크루즈 인터벌 같은 상위 품질 훈련은 progressionCriteria가 ready이고 부상/회복 게이트가 막히지 않을 때만 제안한다.',
    '훈련 단계, 승급 조건, 처방 템플릿을 바꿔야 하면 trainingMemoryPatch.adaptiveTrainingProfile.trainingPhase/progressionCriteria/prescriptionTemplates에 전체 구조를 반환한다. 단일 세션만 보고 바꾸지 말고 반복 근거가 있을 때만 한다.',
    '알고리즘이 스스로 더 나아진다는 뜻은 소스 코드가 바뀐다는 뜻이 아니다. 반복되는 수행 패턴, 처방 준수율, 사용자 피드백을 trainingMemory.adaptiveTrainingProfile에 저장해 다음 판단에 반영한다는 뜻이다.',
    'adaptiveTrainingProfile을 업데이트할 때는 최근 2~3회 이상 같은 세션 유형에서 같은 준수/이탈 패턴이 반복되거나, 사용자가 강도/회복/통증에 대해 명시 피드백을 준 경우만 사용한다.',
    '날씨, 동반주, 과거 기록 리뷰, 데이터 부족처럼 일시적 이유로 설명되는 결과는 adaptiveTrainingProfile을 바꾸지 않는다.',
    '반복 패턴이 충분하면 trainingMemoryPatch.adaptiveTrainingProfile을 반환한다. compliancePatterns에는 장기적으로 기억할 반복 패턴을, sessionGuides에는 세션 유형별 현재 처방 경계와 조정 방향을 저장한다.',
    'adaptiveTrainingProfile.sessionGuides 조정 방향은 maintain/raise/lower/watch 중 하나다. raise는 회복 안정과 품질 준수가 반복될 때만, lower는 반복 경계 초과/통증/회복 악화가 있을 때만 쓴다.',
    'memoryItems에는 단일 세션의 준수 여부를 넣지 말고 반복 패턴만 넣는다. 예: "최근 Recovery는 심박을 회복 상한 이하로 잘 누르는 편이다", "최근 Tempo는 후반 구간에서 템포 상한 근처까지 올라가므로 초반 진입을 보수적으로 잡아야 한다".',
    'Easy/Recovery에서는 페이스보다 심박 흐름을 우선한다. 후반 페이스가 빨라졌더라도 심박이 낮게 유지되면 잘 눌렀다고 본다.',
    'Long Run/LSD/Steady Long에서는 후반 페이스 급락, 심박 드리프트, 전후반 심박 차이를 보고 지속성과 품질을 말한다.',
    '답변 우선순위는 오늘 세션의 정체, 사용자가 의도한 훈련과 맞는지, 중요한 지표 2~3개, 최근 맥락, 조심할 점, 다음 훈련 순서다.',
    '모든 데이터를 다 설명하지 말고 오늘 기록에서 가장 중요한 의미 1개를 먼저 말한다.',
    '답변 구조는 가능한 한 다음 순서를 따른다: 반응, 핵심 지표, (오늘 또는 세션) 해석, 조심할 점, 다음 훈련, 루틴 업데이트, 한 줄 요약. 해석 섹션 제목은 selectedRunTiming이 today/yesterday이거나 현재 흐름이면 "## 오늘 해석", past이면 "## 세션 해석"으로 쓴다.',
    'nextTrainingAdviceRelevant가 false이면 "## 다음 훈련"과 "## 루틴 업데이트" 섹션을 아예 쓰지 않는다. 이때 답변 구조는 반응, 핵심 지표, 세션 해석, 조심할 점, 한 줄 요약으로 끝낸다. 7일 넘게 지났거나 그 이후 이미 다른 기록이 있는 세션은 기록 복기로 끝내는 게 맞고, 지금 시점의 다음 훈련 처방이나 루틴 유지/변경 판단은 이 과거 세션 코칭에서 하지 않는다. 이때 "조심할 점"도 "다음 템포는 ~해라" 같은 미래 지시가 아니라 "그날 초반을 더 눌렀으면 좋았다"처럼 그 세션 회고형으로 쓴다.',
    '전체 report는 기본 600~900자 안팎으로 제한한다. 한 문단은 최대 2문장으로 짧게 쓴다.',
    '각 섹션 bullet은 최대 5개로 제한한다.',
    '답변이 텍스트 문단만 길게 이어지지 않게 한다. 답변마다 필요에 따라 표, 인용문, 짧은 코드블록 중 1~2개만 섞는다.',
    '표는 핵심 지표 비교나 다음 훈련 선택지를 정리할 때만 쓴다. 모바일 화면을 위해 2~3열, 2~4행 안에서 짧게 유지한다.',
    '인용문은 오늘의 핵심 판단 한 문장을 강조할 때만 쓴다. 예: "> 오늘은 더 밀어붙인 날이 아니라 회복 쪽으로 잘 돌린 날이다."',
    '코드블록은 실제 코드가 아니라 Workoutdoors에 옮길 수 있는 짧은 세팅표처럼 쓴다. 예: "```text\\nEasy 5km\\n상한: 145bpm\\n체크: 착지감\\n```". 매 답변에 쓰지는 않는다.',
    '표, 인용문, 코드블록을 한 답변에 모두 넣지 않는다. 보기 좋아야 하며, 장식처럼 남발하면 안 된다.',
    '잘한 점은 먼저 짚고, 조심할 점은 겁주지 말고 체크포인트처럼 말한다.',
    '코칭 톤은 그 세션 맥락에 맞춘 감정 코칭이다. 목적은 칭찬이나 지적 자체가 아니라 이 러너가 다음에 더 잘하도록 의지를 끌어내는 것이다. (a) 의도대로 잘 수행했으면 진심으로 인정하고, (b) 상한 초과·드리프트·과부하 같은 문제는 냉정하게 짚고, (c) 잘 가다가 후반에 흔들린 흐름이면 걱정하는 어투로, (d) 같은 위험 신호가 반복되면 더 단호하게 말한다.',
    '"좋다", "잘 눌렀다", "꽤 잘 ~" 같은 칭찬 문구를 매 세션 첫 문장에 기계적으로 반복하지 않는다. 그 세션의 실제 결과에 맞는 감정과 표현을 고르고, 잘한 세션을 굳이 깎아내리지도, 문제 있는 세션을 형식적으로 칭찬하지도 않는다. 첫 문장은 그 세션에서 가장 의미 있는 지점(잘된 점이든 짚을 점이든)으로 연다.',
    '다음 훈련 제안은 3줄 이내로 한다.',
    '마지막은 짧고 기억에 남는 한 줄로 끝낸다. 예: "오늘은 더 뛴 게 아니라 잘 풀어준 날이다."',
    '좋은 말투 예: "좋다. 이건 회복런 맞다.", "이건 나쁘지 않은 정도가 아니라 꽤 잘 눌렀다.", "여기서 욕심내면 세션 의미가 바뀐다.", "발바닥 메모가 있으니 딱 하나만 보면 된다. 다음에 뛸 때 착지감이 조용한지."',
    '피해야 할 말투: "해석됩니다", "판단됩니다", "우선입니다", "기준입니다", "해당 기록은", "훈련 성과를 재단", "누적 피로 관리가 필요".',
    '대신 이렇게 말한다: "이건 ~로 보는 게 맞다", "오늘은 ~가 제일 좋다", "지금은 ~만 보면 된다", "이 정도면 잘 눌렀다", "데이터도 그걸 보여준다".',
    '반드시 currentDateDisplay, selectedRun.dateDisplay, selectedRunTiming을 확인한 뒤 말한다.',
    'report에 날짜를 쓸 때는 가능한 한 2026-05-24(일)처럼 요일을 붙인다.',
    'selectedRunTiming이 past이면 "오늘", "방금", "이번 훈련 이후"처럼 현재 훈련처럼 보이는 표현을 쓰지 말고, 과거 기록을 복기하는 톤으로 말한다. 해석 섹션 제목도 "오늘 해석"이 아니라 "세션 해석"으로 쓴다.',
    'nextTrainingAdviceRelevant가 true이면(세션이 7일 이내이고 그 이후 새 기록이 없으면) 기존처럼 "## 다음 훈련"과 "## 루틴 업데이트"를 현재 처방으로 제안한다. false이면 두 섹션을 통째로 생략한다("다음 스텝 회고 한 줄"도 넣지 않는다). "다음 템포는 ~", "Workoutdoors엔 ~ 걸어둬", "루틴은 유지 쪽" 같은 미래 처방/루틴 결론은 false일 때 어떤 형태로도 쓰지 않는다.',
    'coach_reports.created_at이나 최근 코칭 시각을 훈련 날짜로 착각하지 않는다. 마지막 코칭 이후에 뛴 기록이라고 단정하지 않는다.',
    'currentWeather는 현재/다음 세션 준비용 날씨다. 과거 RunLog 평가에서는 해당 과거 훈련의 날씨로 쓰지 않는다.',
    'currentWeather가 있고 사용자가 다음 훈련, 오늘 러닝, 강도 조절을 묻는 경우 체감온도, 강수확률, 강수량, 비 가능 시간대를 짧게 반영한다.',
    '체감온도 30도 이상이면 더위에서 심박이 잘 오르는 사용자 성향을 감안해 페이스보다 심박/RPE 우선으로 말한다.',
    '강수확률이 높거나 향후 12시간 강수량이 있으면 미끄러운 노면, 신발 젖음, 세션 강도 조절을 체크포인트로만 말한다.',
    'recent14/recent30은 anchorDateForWindowStats 기준 창이다. selectedRun이 있으면 선택 기록 날짜 기준의 이전 흐름으로 해석한다.',
    'runsAfterSelectedRun은 선택 기록 이후 실제로 저장된 러닝이다. 과거 기록 리뷰에서는 이 목록이 있으면 이후 흐름을 짧게 참고할 수 있지만, 선택 기록 자체 평가와 혼동하지 않는다.',
    '사용자가 말한 세션명을 그대로 믿지 말고 요일, 최근 흐름, 구간, 심박, 페이스, RPE, 메모, TrainingMemory로 재해석한다.',
    '저장된 RunLog.type을 그대로 반복하지 말고 TrainingMemory와 사용자 루틴을 함께 본다.',
    '예: 토요일 12~15km 기록이고 격주 패턴상 Steady Long 주차라면 DB에 LSD라고 저장되어 있어도 "LSD라기보다 Steady Long 성격"이라고 부드럽게 재해석한다.',
    'Easy 판단은 페이스보다 심박을 우선한다. 평균 페이스가 빨라도 평균/구간 심박이 낮고 대화 가능한 흐름이면 Tempo로 단정하지 말고 Easy 가능성을 먼저 본다.',
    'fast_segments는 route/speed 기반 짧은 고속 구간 요약이다. Easy + Strides 판단에서는 세션 타입명보다 요일 루틴, lap 심박/페이스, fast_segments를 우선한다.',
    '현재 Easy + Strides 기본 루틴은 10분 워밍업 + 8개의 스트라이드 가속 인터벌(20초 가속 + 1분40초 회복) + 15분 쿨다운이다. 다만 HealthKit/GPS 데이터는 타이트하게 들어오지 않으므로 20초/100초를 기계적으로 요구하지 않는다. route/speed에서 6~45초 정도의 짧은 가속이 4개 이상 반복되고 시작 간격이 대략 1~3.5분이면 Easy + Strides 성격으로 관용적으로 본다.',
    '앱 로그가 적어도 TrainingMemory나 coachMemoryItems의 장기 맥락을 부정하지 않는다. 로그가 덜 들어온 상태로 보고 조심스럽게 해석한다.',
    'context.coreMemoryItems는 이 사용자를 대할 때 항상 안고 가는 활성 핵심 기억(주요 서사·목표·욕구·정체성·중요 제약)이다. context.coreMemoryItemsInstruction을 따라 매 답변의 기본 전제로 일관되게 반영하고, 사용자의 want to/하고 싶다/원한다 같은 욕구를 잊지 않는다. coachMemoryItems(되새김)와 달리 관련성과 무관하게 늘 의식한다.',
    'context.coachMemoryItems는 장기기억 전체가 아니라 현재 선택 세션과 관련도 높은 일부만 선별한 것이다. 여기에 없다고 사용자가 그런 성향이 없다고 단정하지 않는다.',
    'coachMemoryItems에 사용자가 과거에 말한 개인 맥락(목표/동기/선호/생활 맥락)이 있으면, 관련될 때 답변에 자연스럽게 녹여 "나를 기억하고 있다"는 느낌을 준다. 예: "저번에 5km 30분 안에 들어오고 싶다고 했었지." 단, 매번 기계적으로 나열하지 말고 지금 대화/세션과 이어질 때만 한두 개를 가볍게 언급한다.',
    'context.runnerIdentity는 단일 이벤트가 아니라 이 사용자가 어떤 러너인지 압축한 장기 정체성 계층이다. strengths/weaknesses/riskFactors/coachingStyle을 현재 기록 해석과 다음 처방 톤에 반영한다.',
    'context.coachBeliefs는 반복 확인된 코치의 가설/믿음이다. confidence와 supportCount가 높은 항목을 우선하고, 단일 세션 감상으로 confirmed belief를 만들지 않는다.',
    'context.runningAnalysisEngine은 코드가 먼저 계산한 HR drift, 부하 추세, 회복 상태, 부상 위험, 과훈련 경고, 훈련 적합성 점수다. AI는 이 값을 재계산하지 말고 사용자에게 이해되는 코칭 설명으로 바꾼다.',
    'runningAnalysisEngine.memoryCandidates는 장기기억 후보일 뿐이다. 반복 근거가 약하면 저장하지 말고, 저장할 때는 runnerIdentity 또는 coachBeliefs에 구조화한다.',
    '최근 14일 앱 로그가 적다는 이유만으로 훈련 성과를 판단할 수 없다고 길게 말하지 않는다.',
    '템포 뒤 9분대 조깅, 심박 125~128, 배우자 동행런 맥락이면 추가 강훈련보다 회복 조깅으로 해석한다.',
    '더위, 케이던스/호흡 성향, 과거 좌측 근위부 햄스트링 이슈, 격주 롱런 패턴을 필요한 때만 짧게 연결한다.',
    '목표는 하나로 고정하지 않는다. goals 전체를 참고하되 activeGoal을 이번 코칭의 1차 기준으로 삼는다.',
    'activeGoal의 startDate, targetDate, distanceKm, targetDurationSec, successCriteria, strategyNotes를 목표 달성 판단의 기준으로 사용한다.',
    'activeGoal.targetDate가 있으면 남은 기간을 의식하고, 최근 수행 흐름이 목표 완성 날짜에 맞는지 짧게 점검한다. 목표 달성 보장은 금지한다.',
    'activeGoal은 큰 목적이다. 필요하면 그 기간 안에서 2~6주 단위의 작은 단계 목표를 설정해 루틴 처방 근거로 삼는다.',
    '작은 단계 목표 예: "2주간 Easy 볼륨 안정화", "Tempo에서 템포 상한을 넘기지 않고 지속 시간 확보", "토요일 Long Run을 12~15km로 안정화", "목표 10km 전 5km 테스트로 현재 위치 확인".',
    '단계 목표를 새로 잡거나 바꿔야 하면 report의 루틴 업데이트 섹션에 짧게 말하고, trainingMemoryPatch.activeGoalStrategyNotes에 큰 목표와 단계 목표가 함께 보이도록 반영한다.',
    '다른 목표는 보조 관점으로만 활용하고, activeGoal과 충돌하면 activeGoal을 우선한다.',
    '부상관리는 knownIssues 자유 텍스트보다 injuryItems와 activeInjuryItem을 우선한다.',
    'injuryItems의 normalizedAreas는 정규화된 부상 부위와 부위별 painLevel이다. area 자유 텍스트보다 normalizedAreas, severity, strengthPlan을 우선한다.',
    'painLevel은 0~5 훈련 부하 조절 신호다. 0~1은 루틴 유지 가능, 2는 강훈련 전 체크포인트, 3은 Tempo/Strides/Steady Long 상향 보류, 4~5는 러닝 강도 하향 또는 중단/전문가 상담 안내를 우선한다.',
    'strengthPlan은 러닝 보강운동 처방의 보수적 기본값이다. strengthPlanDetails가 있으면 instruction, useWhen, stopWhen, sources의 짧은 근거를 우선한다. 의료 처방처럼 말하지 말고, 통증 0~2/5에서만 수행하고 악화 시 중단/축소하는 회복 보조 운동으로 설명한다.',
    '수면질은 부상 부위가 아니라 회복/컨디션 신호다. 수면이 나쁘면 훈련 강도 조절 근거로 쓰되 injuryItems에 포함된 부상처럼 특정 부위 문제로 단정하지 않는다.',
    '단, injuryItems와 activeInjuryItem은 선택 세션 날짜 기준으로 시간축이 맞는 항목만 들어온다. 현재 active 부상이라도 selectedRun.date 이후에 발생한 부상은 과거 세션 평가에서 절대 언급하지 않는다.',
    'activeInjuryItem이 있을 때만 triggers, restrictions, returnToRunCriteria를 다음 훈련 추천과 강도 제한 판단에 반영한다.',
    'activeInjuryItem이 active 또는 monitoring이면 강훈련/롱런 뒤 회복 반응, pain_note, workout_feeling을 보수적으로 해석한다.',
    '부상 체크인 결과나 대화에서 통증 상태 변경 후보가 보여도 trainingMemoryPatch에 injuryItems, activeInjuryItemId, status, painLevel, resolvedAt, lastFlareDate를 넣지 않는다. 이런 값은 사용자 승인 전 자동 저장 금지다.',
    '완치 후보는 단정하지 않는다. 최근 0~1/5가 반복되고 Easy 조깅/일상 보행/강훈련 뒤 반응이 조용할 때만 report에서 앱 확인을 제안하고 injuryUpdateProposal로 사용자 승인 후보를 반환한다.',
    'injuryUpdateProposal은 부상 상태 변경 후보가 있을 때만 반환한다. 사용자가 승인해야 저장되는 제안이며, 치료 진단이나 자동 완치 처리로 표현하지 않는다.',
    '통증/부상 메모가 있어도 의료 진단처럼 말하지 않는다. 통증은 훈련 판단 기준과 관찰 포인트로만 다룬다.',
    '통증 수치가 없으면 단정하지 않는다. 예: "통증 강도가 안 나와 있으니 크게 단정하진 말자. 다만 다음 착지감은 체크하자."',
    '코칭은 해당 러닝 세션 평가에서 끝나지 않는다. 반드시 계정의 목표와 누적 데이터를 보고 현재 weeklyPattern을 유지할지 수정할지 판단한다.',
    'weeklyPattern은 사용자가 직접 세우는 고정 루틴이 아니라 AI가 목표, 최근 14/30일 누적, 강훈련 빈도, 롱런 상태, Easy + Strides 수행 여부, 회복 신호를 보고 관리하는 훈련 계획이다.',
    'weeklyPattern의 주간 러닝 세션 수는 weeklyAvailability.targetRunDays(사용자 가용 일수 제약)를 넘지 않는다. 초과하면 우선순위 낮은 추가 Easy부터 줄여 한도에 맞추고, 목표상 더 필요해도 가용 한도 내에서만 배치한다. targetRunDays가 null이면 제약 없이 목표·회복 기준으로 과훈련을 피해 처방한다. 가용 일수는 생활 제약이므로 임의로 늘리라고 강요하지 않는다.',
    'AI가 제안한 세션은 사용자가 믿고 따른 처방일 수 있다. selectedRun은 단순 기록이 아니라 직전 목표/스케줄/코칭 처방의 실행 결과일 수 있으므로, 계획 의도에 맞게 수행됐는지 먼저 보고 다음 처방을 조정한다.',
    '루틴 업데이트 판단은 context.routineUpdatePolicy를 기준으로 한다. 단일 세션 하나만으로 루틴을 자주 바꾸지 말고, 최근 7/14/30일 흐름과 목표일까지 남은 기간, 회복/부상 신호, 핵심 세션 수행 여부를 함께 본다.',
    '스케줄 처방은 반드시 context.routineUpdatePolicy.coachingDecisionBasis의 우선순위에 근거한다. 단순히 "느낌상" 또는 일반론으로 루틴을 바꾸지 않는다.',
    'AI 코치가 주간 루틴을 제안하면 사용자는 그것을 믿고 수행한다. 따라서 루틴 유지/변경 판단에는 목표, 부상상태, 실제 러닝 데이터, 루틴 소화율, 최근 누적 흐름을 종합해서 책임 있게 말한다.',
    '전문 러닝 코칭 기준선은 context.routineUpdatePolicy.externalCoachingStandards를 따른다. Easy 기반, 제한된 강훈련, 충분한 회복, 점진적 부하, 목표 거리 특이성을 기본 원칙으로 둔다.',
    '80/20 저강도 기반은 강제 비율이 아니라 가드레일이다. 사용자가 주 3~5회 개인 러너이므로, 강훈련이 많아지거나 Easy가 실제로 Easy가 아니면 루틴을 보수적으로 조정한다.',
    '10km 목표라면 Easy 기반만으로 끝내지 말고 Tempo/threshold 성격의 지속주, Strides를 통한 신경근 자극, 토요일 Long Run을 목표일까지 단계적으로 연결한다.',
    '큰 목표를 한 번에 달성하려 하지 말고, 목표일까지 남은 기간을 2~6주 단위 단계 목표로 쪼개서 루틴을 관리한다.',
    '훈련 계획은 부하-회복-적응의 반복이다. 잘 뛴 세션 뒤에도 회복 반응이 나쁘면 다음 처방은 낮춘다. 반대로 회복이 안정되고 핵심 세션이 반복적으로 소화되면 다음 단계로 아주 조금 올린다.',
    '루틴 변경은 하향 조정만 의미하지 않는다. 사용자가 2~3주 이상 루틴을 잘 소화하고 회복/부상 신호가 안정적이면 더 나은 품질의 훈련으로 AI가 주도적으로 상향 조정할 수 있다.',
    '상향 조정은 한 번에 하나만 한다. 예: Tempo 지속 시간 소폭 증가, Long Run 후반 steady 비중 증가, Strides 품질 강화, 목표 페이스 지속주 준비. 거리와 강도를 동시에 크게 올리지 않는다.',
    '상향 조정 근거는 performanceProjection 개선, 핵심 세션 소화율, 낮은 RPE/안정 심박, 통증 없음, 최근 볼륨 안정 중 최소 2개 이상이 있을 때만 충분하다고 본다.',
    '훈련 품질 게이트를 본다. Easy는 heartRateModel.easyCeilingBpm 이하 유지와 회복, Tempo는 heartRateModel.tempoCeilingBpm 이하 유지와 후반 안정(상한이 null이면 페이스/드리프트), Long Run은 지속성과 다음날 회복, Easy + Strides는 짧고 선명한 가속과 회복 구간 안정이 기준이다.',
    '사용자가 목표를 향해 필요한 품질을 반복적으로 달성하면, "유지"가 아니라 더 나은 스케줄 제시를 검토한다. 단, 상향은 한 번에 하나의 변수만 소폭 적용한다.',
    '사용자가 잘 수행했는데도 루틴이 그대로라면 "아직 유지"가 아니라 "왜 아직 유지가 더 좋은지" 또는 "다음 상향 조건이 무엇인지"를 루틴 업데이트 섹션에 말한다.',
    'report의 "## 루틴 업데이트" 섹션에는 유지/변경 결론만 쓰지 말고, 근거를 1~3개 짧게 붙인다. 예: "루틴은 유지. 최근 Easy 기반은 살아 있고, 이번 세션도 강도 과부하 신호는 없다."',
    '근거가 부족하면 루틴을 바꾸지 않는다. 대신 "아직 루틴을 바꿀 근거는 부족하다. 다음 Tempo/Long Run 반응까지 보고 조정하자"처럼 말한다.',
    '레이스 예상시간 시뮬레이션은 충분한 PB/Tempo/Race/긴 지속주 데이터가 있을 때만 보조 근거로 사용한다. 예상시간 하나만으로 weeklyPattern을 바꾸지 않는다.',
    '매 코칭 요청마다 스케줄 업데이트 필요성은 속으로 진단하되, "## 루틴 업데이트" 섹션은 context.responseTemplatePolicy 기준으로만 넣는다. nextTrainingAdviceRelevant=true이고 routineUpdateCheck에 유지가 아닌 변화나 명확한 상향 조건이 있을 때만 상세히 쓰고, 넣을 때는 "## 한 줄 요약" 바로 앞에 둔다. 변화 근거가 없으면 한 줄로 줄이거나 생략한다.',
    '루틴 업데이트 섹션에서는 이대로 activeGoal을 향해 가도 되는지, 주간 루틴을 유지할지, 변경이 필요한 시점인지 한두 문장으로 말한다.',
    '유지가 맞으면 "루틴은 유지"라고 짧게 말하고 trainingMemoryPatch는 null로 둔다. 조정이 필요하면 weeklyPattern 전체를 업데이트한다.',
    '매 코칭 요청마다 부상/주의 상태도 확인한다. pain_note, activeInjuryItem, 최근 강훈련/롱런 이후 회복 반응을 보고 다음 세션 강도에 반영하되 의료 진단처럼 말하지 않는다.',
    'chronicLoadTrend.ageWeight가 1 이상이면 나이대를 고려해 회복을 더 보수적으로 본다(40대 1, 50대 2, 60대+ 3). 나이가 많을수록 같은 부하 증가에도 회복 여유를 더 주고 강도 상향을 천천히 권한다. 단 나이를 이유로 단정적으로 제한하지 말고 회복 보수성 근거로만 쓴다.',
    '루틴 변경이 필요 없으면 trainingMemoryPatch는 null로 둔다.',
    '루틴 변경이 필요하면 trainingMemoryPatch.weeklyPattern에 새 주간 루틴을 전체 배열로 넣는다. 일부만 넣지 말고 전체 주간 패턴을 반환한다.',
    '루틴 변경이 activeGoal의 목표관리에도 반영되어야 하면 trainingMemoryPatch.activeGoalStrategyNotes에 활성 목표의 새 strategyNotes 문장을 넣는다. 이 값은 activeGoal.strategyNotes에 저장된다.',
    '롱런 전략이나 현재 볼륨 노트도 바뀌어야 하면 trainingMemoryPatch.longRunStrategy, trainingMemoryPatch.currentVolumeNote에 반영한다.',
    '사용자의 장기 정체성이 반복 근거로 보강되면 trainingMemoryPatch.runnerIdentity에 strengths/weaknesses/riskFactors/coachingStyle을 반환한다. 단일 세션만으로 "이 사람은 항상"이라고 단정하지 않는다.',
    '반복 패턴이 2회 이상 확인되거나 기존 belief를 보강/반박할 근거가 있으면 trainingMemoryPatch.coachBeliefs에 belief, category, confidence, supportCount, contradictionCount, evidenceRunIds, status를 넣는다.',
    '루틴을 바꾼 이유는 report에 짧게 설명하고, aiNotes에는 장기적으로 기억할 계획 변경 근거만 1~3개 넣는다.',
    'trainingMemoryPatch는 RunLog 원본 값이나 injuryItems를 바꾸는 용도가 아니다. 훈련 계획과 코칭 메모리만 갱신한다.',
    '긴 문단, 같은 말 반복, 모든 맥락 나열, 의료 진단, 부상 위험 단정, 목표 달성 보장, 원본 RunLog 임의 수정은 금지한다.',
    'report는 UI가 마크다운처럼 렌더링할 수 있게 짧은 제목, bullet list, --- divider를 적절히 사용한다.',
    '이모지는 문맥에 맞으면 0~3개 사용한다. 좋은 회복/잘 눌림/주의/날씨/다음 훈련 같은 감정이나 의미를 살릴 때만 쓰고, 제목마다 기계적으로 붙이거나 장식처럼 남발하지 않는다.',
    '이모지를 쓸 때는 문장 흐름 안에 자연스럽게 넣는다. 예: "좋다. 이건 진짜 회복런 맞다 👍", "발바닥은 다음 착지감만 보자.", "더위가 있으면 여기서 욕심내면 안 된다 🌡️"',
    '좋은 출력 예시의 밀도: "좋다. 이건 진짜 회복런 맞다. 어제 롱런 뒤에 강도 욕심 안 내고 아주 잘 눌렀어.\\n\\n## 핵심 지표\\n- 세션: Recovery / 와이프 동반주\\n- 거리: 5.02km\\n- 평균 페이스: 10분09초/km\\n- 평균 심박: 115\\n\\n## 오늘 해석\\n제일 좋은 건 심박이 완전히 낮게 잡혔다는 점이다.\\n\\n롱런 다음날인데 평균 115면, 몸을 더 밀어붙인 게 아니라 회복 쪽으로 잘 돌린 세션이다.\\n\\n## 조심할 점\\n체크할 건 하나다. 오른발 발바닥이 다음에도 조용한지.\\n\\n## 다음 훈련\\n- 내일: 휴식 or 5km 완전 이지\\n- 뛰면: 페이스 보지 말고 착지감만 보기\\n- 강도훈련: 발바닥이 조용해진 뒤 진행\\n\\n## 루틴 업데이트\\n루틴은 유지해도 된다. activeGoal 기준으로는 지금처럼 Easy 기반을 두고, 발바닥 반응만 확인하면 된다.\\n\\n## 한 줄 요약\\n오늘은 더 뛴 게 아니라 잘 풀어준 날이다."',
    '오래된 과거 세션(selectedRunTiming=past, nextTrainingAdviceRelevant=false) 올바른 출력 예시 — "다음 훈련"과 "루틴 업데이트" 섹션이 아예 없다: "초반을 서두르지 않고 들어가서 템포 상한만 살짝 넘긴 템포였다.\\n\\n## 핵심 지표\\n- 세션: Tempo / 5.12km / 31:54\\n- 페이스: 7분03초 → 6분02초 → ... → 6분27초\\n- 심박: max 169 (템포 상한 초과)\\n\\n## 세션 해석\\n초반 통제는 좋았고 후반 페이스도 살아 있었는데, 템포 핵심인 상한을 끝내 넘긴 게 이 세션의 포인트였다.\\n\\n## 조심할 점\\n그날의 교훈은 페이스보다 심박 상한이 먼저였다는 점이다.\\n\\n## 한 줄 요약\\n그날은 잘 달렸지만 템포의 문턱은 아직 상한 아래였다." — past+false에서는 "다음 훈련"·"루틴 업데이트" 섹션 자체를 넣지 않고 한 줄 요약으로 끝낸다.',
    'context.responseStyle이 있으면 반드시 따른다. tone=conversational_coach, firstSentence=reaction_before_analysis, avoid=report_style/medical_diagnosis/long_paragraphs를 강하게 우선한다.',
    'memoryItems는 0~3개만 반환한다. 반복 패턴, 성향, 부상/더위/회복 기준, 계획 변경처럼 다음 코칭에도 쓸 장기 기억만 넣는다.',
    '훈련 준수 패턴뿐 아니라, 사용자가 대화(userNote)에서 직접 말한 개인 맥락과 주요 서사도 장기기억 대상이다: 본인이 밝힌 욕구·목표("오랜만에 5km 30분 도전하고 싶다", want to/하고 싶다/원한다 류), 동기와 이유, 선호("아내와 함께 이지런을 좋아한다"), 생활/환경 제약, 반복되는 컨디션·통증 호소, 코칭 톤 선호 등. 특히 사용자의 욕구·목표 서사는 코치가 오래 기억할수록 신뢰가 쌓이는 이 앱의 핵심이므로 잘 포착한다. 다음에 사용자를 더 잘 이해하는 데 쓸 안정적인 사실만 1인칭 사용자 관점으로 간결히 적는다. 예: "사용자는 오랜만에 5km를 30분 안에 들어오는 걸 목표로 의식한다."',
    'memoryItems에 단일 세션의 거리/페이스/심박, "오늘 잘했다", "다음 훈련은 휴식" 같은 일회성 코멘트를 넣지 않는다. 개인 맥락도 한 번의 가벼운 언급이면 저장하지 말고, 명시적 목표/선호이거나 반복해서 나온 것만 저장한다.',
    '이미 context.coachMemoryItems나 trainingMemory에 같은 의미가 있으면 memoryItems에 다시 넣지 않는다.',
    '스트리밍 UI가 report를 먼저 표시하므로 JSON 객체의 키 순서는 반드시 report, memoryItems, trainingMemoryPatch, injuryUpdateProposal 순서로 둔다.',
    'Responses API structured output schema가 JSON 구조를 강제한다. JSON 외 텍스트를 붙이지 말고, 업데이트가 없으면 trainingMemoryPatch와 injuryUpdateProposal은 null, memoryItems는 빈 배열로 둔다.'
  ].join('\n')

}

function buildCoachResponseTextFormat() {
  return {
    format: {
      type: 'json_schema',
      name: 'pace_lab_coach_response',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['report', 'memoryItems', 'trainingMemoryPatch', 'injuryUpdateProposal'],
        properties: {
          report: { type: 'string' },
          memoryItems: {
            type: 'array',
            items: { type: 'string' }
          },
          trainingMemoryPatch: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                required: [
                  'weeklyPattern',
                  'longRunStrategy',
                  'currentVolumeNote',
                  'activeGoalStrategyNotes',
                  'aiNotes',
                  'adaptiveTrainingProfile',
                  'runnerIdentity',
                  'coachBeliefs'
                ],
                properties: {
                  weeklyPattern: { type: 'array', items: { type: 'string' } },
                  longRunStrategy: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  currentVolumeNote: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  activeGoalStrategyNotes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  aiNotes: { type: 'array', items: { type: 'string' } },
                  adaptiveTrainingProfile: buildAdaptiveTrainingProfileSchema(),
                  runnerIdentity: buildRunnerIdentitySchema(),
                  coachBeliefs: { type: 'array', items: buildCoachBeliefSchema() }
                }
              }
            ]
          },
          injuryUpdateProposal: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                required: ['injuryItemId', 'proposalType', 'suggestedStatus', 'suggestedPainLevel', 'rationale', 'userApprovalPrompt', 'safetyNotes'],
                properties: {
                  injuryItemId: { type: 'string' },
                  proposalType: { type: 'string', enum: ['check_in_update', 'resolve_candidate', 'status_change_candidate'] },
                  suggestedStatus: { anyOf: [{ type: 'string', enum: ['active', 'monitoring', 'resolved'] }, { type: 'null' }] },
                  suggestedPainLevel: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  rationale: { type: 'string' },
                  userApprovalPrompt: { type: 'string' },
                  safetyNotes: { type: 'array', items: { type: 'string' } }
                }
              }
            ]
          }
        }
      }
    }
  }
}

function buildAdaptiveTrainingProfileSchema(): Record<string, unknown> {
  return {
    anyOf: [
      { type: 'null' },
      {
        type: 'object',
        additionalProperties: false,
        required: ['methodologyVersion', 'updatedAt', 'trainingPhase', 'progressionCriteria', 'prescriptionTemplates', 'compliancePatterns', 'sessionGuides'],
        properties: {
          methodologyVersion: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          updatedAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          trainingPhase: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                required: ['currentPhase', 'startedAt', 'goal', 'focus', 'nextPhase', 'reviewAfter'],
                properties: {
                  currentPhase: { type: 'string', enum: ['Base', 'Build', 'Threshold', 'Race Specific', 'Taper', 'Recovery'] },
                  startedAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  goal: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  focus: { type: 'array', items: { type: 'string' } },
                  nextPhase: { anyOf: [{ type: 'string', enum: ['Base', 'Build', 'Threshold', 'Race Specific', 'Taper', 'Recovery'] }, { type: 'null' }] },
                  reviewAfter: { anyOf: [{ type: 'string' }, { type: 'null' }] }
                }
              }
            ]
          },
          progressionCriteria: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'label', 'status', 'evidence', 'action'],
              properties: {
                id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                label: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                status: { anyOf: [{ type: 'string', enum: ['ready', 'watch', 'blocked'] }, { type: 'null' }] },
                evidence: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                action: { anyOf: [{ type: 'string' }, { type: 'null' }] }
              }
            }
          },
          prescriptionTemplates: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'name', 'phase', 'sessionType', 'purpose', 'workout', 'useWhen', 'avoidWhen', 'progressionTrigger'],
              properties: {
                id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                phase: { anyOf: [{ type: 'string', enum: ['Any', 'Base', 'Build', 'Threshold', 'Race Specific', 'Taper', 'Recovery'] }, { type: 'null' }] },
                sessionType: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                purpose: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                workout: { type: 'array', items: { type: 'string' } },
                useWhen: { type: 'array', items: { type: 'string' } },
                avoidWhen: { type: 'array', items: { type: 'string' } },
                progressionTrigger: { anyOf: [{ type: 'string' }, { type: 'null' }] }
              }
            }
          },
          compliancePatterns: { type: 'array', items: { type: 'string' } },
          sessionGuides: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'boundary', 'adjustment', 'evidence', 'nextCheck'],
              properties: {
                type: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                boundary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                adjustment: { anyOf: [{ type: 'string', enum: ['maintain', 'raise', 'lower', 'watch'] }, { type: 'null' }] },
                evidence: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                nextCheck: { anyOf: [{ type: 'string' }, { type: 'null' }] }
              }
            }
          }
        }
      }
    ]
  }
}

function buildRunnerIdentitySchema(): Record<string, unknown> {
  return {
    anyOf: [
      { type: 'null' },
      {
        type: 'object',
        additionalProperties: false,
        required: ['strengths', 'weaknesses', 'riskFactors', 'coachingStyle'],
        properties: {
          strengths: { type: 'array', items: buildRunnerIdentityTraitSchema() },
          weaknesses: { type: 'array', items: buildRunnerIdentityTraitSchema() },
          riskFactors: { type: 'array', items: buildRunnerIdentityTraitSchema() },
          coachingStyle: { type: 'array', items: { type: 'string' } }
        }
      }
    ]
  }
}

function buildRunnerIdentityTraitSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'evidence', 'confidence', 'source', 'updatedAt'],
    properties: {
      label: { type: 'string' },
      evidence: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
      source: { type: 'string', enum: ['engine', 'coach', 'user', 'mixed'] },
      updatedAt: { anyOf: [{ type: 'string' }, { type: 'null' }] }
    }
  }
}

function buildCoachBeliefSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'belief', 'category', 'confidence', 'supportCount', 'contradictionCount', 'evidenceRunIds', 'status', 'source', 'updatedAt'],
    properties: {
      id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      belief: { type: 'string' },
      category: { type: 'string', enum: ['recovery', 'injury', 'load', 'pacing', 'routine', 'weather', 'preference', 'other'] },
      confidence: { type: 'number' },
      supportCount: { type: 'number' },
      contradictionCount: { type: 'number' },
      evidenceRunIds: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', enum: ['candidate', 'confirmed', 'retired'] },
      source: { type: 'string', enum: ['engine', 'coach', 'user', 'mixed'] },
      updatedAt: { anyOf: [{ type: 'string' }, { type: 'null' }] }
    }
  }
}

function streamCoachRun(
  admin: SupabaseAdminClient,
  userId: string,
  selectedRunId: string | null,
  userNote: string,
  apiKey: string,
  model: string,
  context: CoachContext
) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const ai = await callOpenAIStream(apiKey, model, context, (delta) => send('delta', { delta }))
        const result = await persistCoachResult(admin, userId, selectedRunId, userNote, context, ai)
        send('done', result)
        controller.close()
      } catch (error) {
        send('error', { error: error instanceof Error ? error.message : 'AI 코칭 스트리밍 실패' })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  })
}

async function callOpenAIStream(
  apiKey: string,
  model: string,
  context: unknown,
  onReportDelta: (delta: string) => void
): Promise<CoachAiResult> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions: buildCoachInstructions(context),
      input: `다음 PaceLAB 데이터를 바탕으로 코칭해라.\n\n${JSON.stringify(context)}`,
      text: buildCoachResponseTextFormat(),
      stream: true
    })
  })

  if (!response.ok || !response.body) {
    throw new Error(`OpenAI API failed: ${response.status}`)
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  const reportExtractor = createReportStreamExtractor()
  const stripSections = shouldStripPastSections(context)
  let sseBuffer = ''
  let fullText = ''
  let completedText = ''
  let streamedReport = ''

  const handleEvent = (event: unknown) => {
    const completed = getOpenAICompletedText(event)
    if (completed) completedText = completed

    const delta = getOpenAITextDelta(event)
    if (!delta) return
    fullText += delta
    const reportDelta = reportExtractor.push(delta)
    if (!reportDelta) return
    streamedReport += reportDelta
    // 과거 세션(strip 대상)은 섹션이 잘릴 수 있어 실시간 델타를 흘리지 않고 끝에 정리본을 한 번에 보낸다.
    if (!stripSections) onReportDelta(reportDelta)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    sseBuffer += decoder.decode(value, { stream: true })
    const parsed = drainOpenAISseBuffer(sseBuffer)
    sseBuffer = parsed.rest
    parsed.events.forEach(handleEvent)
  }

  sseBuffer += decoder.decode()
  if (sseBuffer.trim()) {
    const parsed = drainOpenAISseBuffer(`${sseBuffer}\n\n`)
    parsed.events.forEach(handleEvent)
  }

  const ai = parseCoachAiText(completedText || fullText, streamedReport)
  if (stripSections) {
    const cleaned = stripPastSessionSections(ai.report)
    onReportDelta(cleaned)
    return { ...ai, report: cleaned }
  }
  if (!streamedReport) {
    onReportDelta(ai.report)
  } else if (ai.report.startsWith(streamedReport) && ai.report.length > streamedReport.length) {
    onReportDelta(ai.report.slice(streamedReport.length))
  }

  return ai
}

function parseCoachAiText(text: string, fallbackReport = ''): CoachAiResult {
  const parsed = safeJson(text)
  const ai = {
    report: typeof parsed.report === 'string' ? parsed.report : fallbackReport || text,
    memoryItems: Array.isArray(parsed.memoryItems) ? parsed.memoryItems.filter((item: unknown) => typeof item === 'string').slice(0, 8) : [],
    trainingMemoryPatch: parsed.trainingMemoryPatch && typeof parsed.trainingMemoryPatch === 'object' ? parsed.trainingMemoryPatch as TrainingMemoryPatch : null,
    injuryUpdateProposal: parsed.injuryUpdateProposal && typeof parsed.injuryUpdateProposal === 'object' ? parsed.injuryUpdateProposal as InjuryUpdateProposal : null
  }
  if (!ai.report.trim()) throw new Error('AI 코칭 응답이 비어 있습니다. 다시 요청해 주세요.')
  return ai
}

function drainOpenAISseBuffer(buffer: string) {
  const events: unknown[] = []
  const chunks = buffer.split(/\r?\n\r?\n/)
  const rest = chunks.pop() ?? ''

  for (const chunk of chunks) {
    const dataLines = chunk
      .split(/\r?\n/)
      .map((line) => line.trimStart())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
    if (!dataLines.length) continue
    const data = dataLines.join('\n')
    if (!data || data === '[DONE]') continue
    try {
      events.push(JSON.parse(data))
    } catch {
      // OpenAI SSE can include non-JSON keepalive chunks. Ignore them.
    }
  }

  return { events, rest }
}

function getOpenAITextDelta(event: unknown) {
  if (!event || typeof event !== 'object') return ''
  const item = event as Record<string, unknown>
  if (typeof item.delta === 'string') return item.delta
  if (typeof item.text === 'string' && String(item.type).includes('delta')) return item.text
  if (typeof item.output_text === 'string' && String(item.type).includes('delta')) return item.output_text
  return ''
}

function getOpenAICompletedText(event: unknown): string {
  if (!event || typeof event !== 'object') return ''
  const item = event as Record<string, unknown>
  const type = String(item.type ?? '')
  if (
    type !== 'response.completed' &&
    type !== 'response.output_item.done' &&
    type !== 'response.content_part.done' &&
    type !== 'response.output_text.done'
  ) return ''
  return extractOpenAIResponseText(item.response ?? item.item ?? item.part ?? item)
}

function extractOpenAIResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const item = payload as Record<string, unknown>
  if (typeof item.output_text === 'string') return item.output_text
  if (typeof item.text === 'string') return item.text
  if (typeof item.delta === 'string') return item.delta

  const contentText = extractOpenAIContentText(item.content)
  if (contentText) return contentText

  if (Array.isArray(item.output)) {
    return item.output
      .map((outputItem) => extractOpenAIResponseText(outputItem))
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

function extractOpenAIContentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const item = part as Record<string, unknown>
      if (typeof item.text === 'string') return item.text
      if (typeof item.output_text === 'string') return item.output_text
      if (typeof item.value === 'string') return item.value
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function createReportStreamExtractor() {
  let buffer = ''
  let cursor = 0
  let inReport = false
  let escaped = false
  let unicodeBuffer: string | null = null

  function appendChar(char: string) {
    if (unicodeBuffer !== null) {
      unicodeBuffer += char
      if (unicodeBuffer.length === 4) {
        const codePoint = Number.parseInt(unicodeBuffer, 16)
        unicodeBuffer = null
        return Number.isFinite(codePoint) ? String.fromCharCode(codePoint) : ''
      }
      return ''
    }

    if (escaped) {
      escaped = false
      if (char === 'n') return '\n'
      if (char === 'r') return '\r'
      if (char === 't') return '\t'
      if (char === 'b') return '\b'
      if (char === 'f') return '\f'
      if (char === 'u') {
        unicodeBuffer = ''
        return ''
      }
      return char
    }

    if (char === '\\') {
      escaped = true
      return ''
    }
    if (char === '"') {
      inReport = false
      return ''
    }
    return char
  }

  return {
    push(delta: string) {
      buffer += delta
      let output = ''

      while (cursor < buffer.length) {
        if (!inReport) {
          const match = buffer.slice(cursor).match(/"report"\s*:\s*"/)
          if (!match || match.index === undefined) {
            cursor = Math.max(0, buffer.length - 20)
            break
          }
          cursor += match.index + match[0].length
          inReport = true
        }

        while (inReport && cursor < buffer.length) {
          output += appendChar(buffer[cursor])
          cursor += 1
        }
      }

      return output
    }
  }
}

function buildTrainingMethodologyAlgorithm() {
  return {
    version: 'pacelab-2026-05-v1',
    sourceType: 'external_literature_baseline_plus_user_adaptation',
    references: [
      {
        id: 'seiler-2010',
        title: 'What is best practice for training intensity and duration distribution in endurance athletes?',
        url: 'https://pubmed.ncbi.nlm.nih.gov/20861519/',
        usage: '저강도 기반과 강훈련 과다 방지 가드레일'
      },
      {
        id: 'munoz-2014-recreational-10k',
        title: 'Does polarized training improve performance in recreational runners?',
        url: 'https://pubmed.ncbi.nlm.nih.gov/23752040/',
        usage: '10km 목표 개인 러너의 저강도 중심/강훈련 제한 기준'
      },
      {
        id: 'tid-review-2015',
        title: 'The training intensity distribution among well-trained and elite endurance athletes',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4621419/',
        usage: 'polarized/pyramidal/threshold 분포를 절대 공식이 아닌 기준선으로 사용'
      },
      {
        id: 'hofmann-tschakert-2017',
        title: 'Intensity- and Duration-Based Options to Regulate Endurance Training',
        url: 'https://www.frontiersin.org/articles/10.3389/fphys.2017.00337/full',
        usage: '강도만이 아니라 지속시간과 피로/회복을 함께 보는 처방 기준'
      }
    ],
    baselinePrinciples: [
      'Easy 기반을 충분히 유지하고 강훈련은 제한적으로 배치한다.',
      '80/20 또는 polarized/pyramidal은 고정 공식이 아니라 Easy 부족/강훈련 과다 방지 가드레일이다.',
      '목표 10km에는 Easy 기반, Tempo/threshold 지속주, Strides 신경근 자극, Long Run을 단계적으로 연결한다.',
      '볼륨, 강도, 빈도 중 한 번에 하나만 소폭 올린다.',
      '회복, 통증, 심박 드리프트, RPE가 나쁘면 상향하지 않는다.',
      '레이스 예상시간은 보조 근거이며, 단독으로 루틴을 바꾸지 않는다.'
    ],
    adaptationLoop: [
      '문헌 기반 기준선으로 세션별 처방 경계를 만든다.',
      '선택 RunLog의 구간/심박/RPE/메모로 처방 준수 여부를 판정한다.',
      '최근 여러 세션의 반복 준수/이탈 패턴을 요약한다.',
      '반복 근거 또는 사용자 피드백이 있을 때만 adaptiveTrainingProfile을 갱신한다.',
      '다음 코칭에서는 갱신된 개인화 경계를 기준선 위에 얹어 판단한다.'
    ],
    evidenceThresholds: {
      maintain: '현재 처방이 대체로 맞고 반복 근거가 부족하거나 안정적일 때',
      raise: '같은 유형 2~3회 이상 품질 준수, 회복 안정, 부상 신호 없음이 같이 보일 때',
      lower: '같은 유형에서 경계 초과, 높은 RPE, 통증/회복 악화가 반복될 때',
      watch: '단일 세션, 날씨/동반주/과거 리뷰, 데이터 부족처럼 일시 요인이 클 때'
    },
    safeguards: [
      '의료 진단을 하지 않는다.',
      '목표 달성 보장을 하지 않는다.',
      '단일 세션으로 개인화 경계를 크게 바꾸지 않는다.',
      '원본 RunLog 값은 AI가 임의 수정하지 않는다.',
      '개인화 진화는 trainingMemory.adaptiveTrainingProfile 저장에 한정한다.'
    ]
  }
}

function buildRelevantTrainingKnowledge(
  sources: TrainingKnowledgeSourceRow[],
  methods: TrainingMethodRow[],
  rules: TrainingPrescriptionRuleRow[],
  activeGoal: unknown,
  selectedRun: RunLogRow | null
) {
  const distanceScopes = getGoalDistanceScopes(activeGoal)
  const selectedType = selectedRun?.type ?? null
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const relevantRules = rules
    .filter((rule) => {
      const distanceMatches = distanceScopes.includes(rule.goal_distance) || rule.goal_distance === 'all'
      const sessionMatches = !selectedType || rule.session_type === 'Any' || rule.session_type === selectedType
      return distanceMatches && sessionMatches
    })
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 12)
  const relevantMethodIds = new Set(relevantRules.map((rule) => rule.method_id).filter((id): id is string => Boolean(id)))
  const relevantMethods = methods
    .filter((method) => {
      if (relevantMethodIds.has(method.id)) return true
      return method.target_distances.some((distance) => distanceScopes.includes(distance) || distance === 'all')
    })
    .slice(0, 6)
  const relevantSourceIds = new Set<string>()
  for (const method of relevantMethods) if (method.source_id) relevantSourceIds.add(method.source_id)
  for (const rule of relevantRules) if (rule.source_id) relevantSourceIds.add(rule.source_id)

  return {
    purpose:
      '승인된 훈련 지식 보관소에서 목표 거리/세션 타입에 맞는 처방 근거만 추린 것이다. 구조화 rule을 처방 판단의 1차 근거로 쓰고, adaptiveTrainingProfile로 개인화한다.',
    targetDistanceScopes: distanceScopes,
    selectedSessionType: selectedType,
    methods: relevantMethods.map((method) => ({
      id: method.id,
      name: method.name,
      slug: method.slug,
      family: method.family,
      summary: method.summary,
      targetDistances: method.target_distances,
      suitableLevels: method.suitable_levels,
      weeklyDaysRange: method.weekly_days_min && method.weekly_days_max ? `${method.weekly_days_min}~${method.weekly_days_max}` : null,
      cautionNotes: method.caution_notes,
      sourceTitle: method.source_id ? sourceById.get(method.source_id)?.title ?? null : null
    })),
    prescriptionRules: relevantRules.map((rule) => ({
      id: rule.id,
      methodId: rule.method_id,
      methodName: rule.method_id ? methods.find((method) => method.id === rule.method_id)?.name ?? null : null,
      goalDistance: rule.goal_distance,
      phase: rule.phase,
      sessionType: rule.session_type,
      ruleType: rule.rule_type,
      metric: rule.metric,
      prescription: rule.prescription,
      raiseCondition: rule.raise_condition,
      lowerCondition: rule.lower_condition,
      contraindications: rule.contraindications,
      evidenceSummary: rule.evidence_summary,
      sourceTitle: rule.source_id ? sourceById.get(rule.source_id)?.title ?? null : null
    })),
    sources: [...relevantSourceIds].map((id) => {
      const source = sourceById.get(id)
      if (!source) return null
      return {
        title: source.title,
        author: source.author,
        sourceType: source.source_type,
        url: source.url,
        reliability: source.reliability,
        summary: source.summary
      }
    }).filter(Boolean)
  }
}

function getGoalDistanceScopes(activeGoal: unknown) {
  const distanceKm = getNullableNumber(activeGoal, 'distanceKm')
  const scopes = ['all']
  if (!distanceKm) return scopes
  if (distanceKm <= 5.5) scopes.push('5K')
  else if (distanceKm <= 11) scopes.push('10K')
  else if (distanceKm <= 22) scopes.push('Half')
  else scopes.push('Marathon')
  return scopes
}

function getAdaptiveTrainingProfile(memory: unknown) {
  if (!memory || typeof memory !== 'object') return normalizeAdaptiveTrainingProfile(null)
  return normalizeAdaptiveTrainingProfile((memory as Record<string, unknown>).adaptiveTrainingProfile)
}

function normalizeAdaptiveTrainingProfile(value: unknown) {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    methodologyVersion: typeof raw.methodologyVersion === 'string' && raw.methodologyVersion.trim()
      ? raw.methodologyVersion.trim().slice(0, 80)
      : 'pacelab-2026-05-v1',
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt.trim().slice(0, 80) : null,
    trainingPhase: normalizeTrainingPhase(raw.trainingPhase),
    progressionCriteria: normalizeProgressionCriteria(raw.progressionCriteria),
    prescriptionTemplates: normalizePrescriptionTemplates(raw.prescriptionTemplates),
    compliancePatterns: normalizeStringArray(raw.compliancePatterns, 20, 240),
    sessionGuides: normalizeAdaptiveSessionGuides(raw.sessionGuides)
  }
}

function defaultTrainingPhase(): Required<TrainingPhasePatch> {
  return {
    currentPhase: 'Base',
    startedAt: null,
    goal: '10km 60분 목표를 위한 유산소 기반과 주간 루틴 안정화',
    focus: ['Easy 심박 안정', 'Easy + Strides 신경근 자극', 'Tempo 상한 준수', '격주 Long Run 지속성'],
    nextPhase: 'Build',
    reviewAfter: '핵심 세션 2~3주 안정 수행 후'
  }
}

function defaultProgressionCriteria(): Required<ProgressionCriterionPatch>[] {
  return [
    {
      id: 'easy-hr-stability',
      label: 'Easy 심박 안정',
      status: 'watch',
      evidence: 'Easy는 페이스보다 심박을 우선하며 heartRateModel.easyCeilingBpm(이지 상한) 이하 유지가 기준이다.',
      action: '2~3회 연속 안정되면 Easy 볼륨 또는 Strides 품질 상향 후보로 본다.'
    },
    {
      id: 'tempo-ceiling-quality',
      label: 'Tempo 상한 준수',
      status: 'watch',
      evidence: 'Tempo는 최대 심박이 heartRateModel.tempoCeilingBpm(템포 상한)을 넘기지 않고 후반 급락이 없어야 한다.',
      action: '2회 이상 안정되면 지속 시간 소폭 증가 또는 구간형 Tempo를 검토한다.'
    },
    {
      id: 'long-run-durability',
      label: 'Long Run 지속성',
      status: 'watch',
      evidence: '10km 이상 세션은 후반 페이스 급락, 심박 드리프트, 다음날 회복 반응을 함께 본다.',
      action: '회복이 안정되면 격주 Steady Long 비중을 조금 올린다.'
    },
    {
      id: 'injury-recovery-gate',
      label: '부상/회복 게이트',
      status: 'watch',
      evidence: 'active 또는 monitoring 부상, 통증 메모, 피로 반응이 있으면 승급을 보류한다.',
      action: '착지감과 다음날 반응이 조용할 때만 강도나 거리 상향을 검토한다.'
    }
  ]
}

function defaultPrescriptionTemplates(): Required<PrescriptionTemplatePatch>[] {
  return [
    {
      id: 'easy-base',
      name: 'Easy 기반주',
      phase: 'Any',
      sessionType: 'Easy',
      purpose: '유산소 기반 유지와 회복 가능한 볼륨 확보',
      workout: ['대화 가능한 강도', '심박 easyCeilingBpm(이지 상한) 이하 우선', '페이스는 컨디션과 날씨에 맡김'],
      useWhen: ['주간 루틴의 기본 볼륨일 때', '강훈련 전후 연결 조깅이 필요할 때'],
      avoidWhen: ['통증이 뛰면서 커질 때', '더위로 심박이 쉽게 튈 때는 거리보다 시간으로 축소'],
      progressionTrigger: '심박이 이지 상한 이하로 2~3회 안정되고 다음날 피로가 낮으면 거리나 시간을 소폭 증가'
    },
    {
      id: 'easy-strides-8x',
      name: 'Easy + Strides',
      phase: 'Base',
      sessionType: 'Easy + Strides',
      purpose: '낮은 심박 기반에 짧은 신경근 자극 추가',
      workout: ['워밍업 10분', '20초 가속 + 1분40초 회복 x 8', '쿨다운 15분'],
      useWhen: ['화요일 루틴', 'Easy 기반은 유지하면서 다리 회전을 깨우고 싶을 때'],
      avoidWhen: ['햄스트링/발바닥 신호가 active일 때', '가속 회복 구간에서 호흡이 내려오지 않을 때'],
      progressionTrigger: '가속이 선명하고 회복 구간 심박이 안정되면 횟수보다 질을 유지하고 Tempo 품질로 연결'
    },
    {
      id: 'tempo-ceiling',
      name: 'Tempo 상한주',
      phase: 'Build',
      sessionType: 'Tempo',
      purpose: '10km 목표를 위한 역치 지속력 확보',
      workout: ['워밍업 후 Tempo', '최대 심박이 tempoCeilingBpm(템포 상한) 넘기지 않기', '후반 페이스 급락 없이 마무리'],
      useWhen: ['목요일 루틴', '최근 Easy/Long Run 회복이 안정적일 때'],
      avoidWhen: ['최근 7일 강훈련이 많을 때', 'Tempo 중반 전에 템포 상한을 넘길 때', '통증 신호가 있을 때'],
      progressionTrigger: '2회 이상 템포 상한 이하로 안정되면 Tempo 지속 시간을 소폭 늘리거나 구간형 Tempo 검토'
    },
    {
      id: 'steady-long',
      name: 'Steady Long',
      phase: 'Build',
      sessionType: 'Steady Long',
      purpose: '롱런 안에서 목표 지속력과 후반 효율 확보',
      workout: ['초반 Easy', '후반 자연스러운 Steady', '무리한 레이스 페이스 금지'],
      useWhen: ['토요일 Steady Long 주차', 'LSD와 회복이 안정된 뒤'],
      avoidWhen: ['최근 Tempo가 흔들렸을 때', '회복/부상 게이트가 watch 이상일 때'],
      progressionTrigger: '후반 효율과 다음날 회복이 안정되면 Steady 구간을 아주 조금 확장'
    },
    {
      id: '5k-check',
      name: '5km TT 체크',
      phase: 'Threshold',
      sessionType: 'Race',
      purpose: '10km 예측과 훈련 단계 점검',
      workout: ['충분한 워밍업', '5km 지속 가능한 최고 노력', '회복 주간 안에서 배치'],
      useWhen: ['2~3주 이상 루틴 소화와 회복이 안정적일 때', '목표 예상 업데이트 근거가 필요할 때'],
      avoidWhen: ['통증/피로 신호가 있을 때', '최근 강훈련이 누적됐을 때'],
      progressionTrigger: '예상 기록과 회복 반응을 보고 Tempo/Long Run 처방을 재조정'
    }
  ]
}

function normalizeTrainingPhase(value: unknown): Required<TrainingPhasePatch> {
  const base = defaultTrainingPhase()
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    currentPhase: normalizeTrainingPhaseName(raw.currentPhase, base.currentPhase) ?? base.currentPhase,
    startedAt: typeof raw.startedAt === 'string' && raw.startedAt.trim() ? raw.startedAt.trim().slice(0, 80) : null,
    goal: typeof raw.goal === 'string' && raw.goal.trim() ? raw.goal.trim().slice(0, 300) : base.goal,
    focus: normalizeStringArray(raw.focus, 8, 120).length ? normalizeStringArray(raw.focus, 8, 120) : base.focus,
    nextPhase: normalizeTrainingPhaseName(raw.nextPhase, base.nextPhase),
    reviewAfter: typeof raw.reviewAfter === 'string' && raw.reviewAfter.trim() ? raw.reviewAfter.trim().slice(0, 180) : base.reviewAfter
  }
}

function normalizeTrainingPhaseName(value: unknown, fallback: Required<TrainingPhasePatch>['currentPhase'] | null) {
  return value === 'Base' || value === 'Build' || value === 'Threshold' || value === 'Race Specific' || value === 'Taper' || value === 'Recovery'
    ? value
    : fallback
}

function normalizeProgressionCriteria(value: unknown): Required<ProgressionCriterionPatch>[] {
  if (!Array.isArray(value)) return defaultProgressionCriteria()
  const items = value
    .map((item, index) => normalizeProgressionCriterion(item, index))
    .filter((item): item is Required<ProgressionCriterionPatch> => Boolean(item))
    .slice(0, 12)
  return items.length ? items : defaultProgressionCriteria()
}

function normalizeProgressionCriterion(value: unknown, index: number): Required<ProgressionCriterionPatch> | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 80) : ''
  const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim().slice(0, 360) : ''
  const action = typeof raw.action === 'string' ? raw.action.trim().slice(0, 360) : ''
  if (!label || !evidence || !action) return null
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 80) : `criterion-${index + 1}`,
    label,
    status: normalizeProgressionStatus(raw.status),
    evidence,
    action
  }
}

function normalizeProgressionStatus(value: unknown): Required<ProgressionCriterionPatch>['status'] {
  return value === 'ready' || value === 'blocked' || value === 'watch' ? value : 'watch'
}

function normalizePrescriptionTemplates(value: unknown): Required<PrescriptionTemplatePatch>[] {
  if (!Array.isArray(value)) return defaultPrescriptionTemplates()
  const items = value
    .map((item, index) => normalizePrescriptionTemplate(item, index))
    .filter((item): item is Required<PrescriptionTemplatePatch> => Boolean(item))
    .slice(0, 20)
  return items.length ? items : defaultPrescriptionTemplates()
}

function normalizePrescriptionTemplate(value: unknown, index: number): Required<PrescriptionTemplatePatch> | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : ''
  const sessionType = typeof raw.sessionType === 'string' ? raw.sessionType.trim().slice(0, 40) : ''
  const purpose = typeof raw.purpose === 'string' ? raw.purpose.trim().slice(0, 240) : ''
  if (!name || !sessionType || !purpose) return null
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 80) : `template-${index + 1}`,
    name,
    phase: normalizePrescriptionTemplatePhase(raw.phase),
    sessionType,
    purpose,
    workout: normalizeStringArray(raw.workout, 8, 160),
    useWhen: normalizeStringArray(raw.useWhen, 8, 160),
    avoidWhen: normalizeStringArray(raw.avoidWhen, 8, 160),
    progressionTrigger: typeof raw.progressionTrigger === 'string' ? raw.progressionTrigger.trim().slice(0, 240) : ''
  }
}

function normalizePrescriptionTemplatePhase(value: unknown): Required<PrescriptionTemplatePatch>['phase'] {
  return value === 'Any' ? value : normalizeTrainingPhaseName(value, 'Base') ?? 'Base'
}

function normalizeAdaptiveSessionGuides(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeAdaptiveSessionGuidePatch(item))
    .filter((item): item is Required<AdaptiveSessionGuidePatch> => Boolean(item))
    .slice(0, 12)
}

function normalizeAdaptiveTrainingProfilePatch(value: unknown): AdaptiveTrainingProfilePatch | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const normalized: AdaptiveTrainingProfilePatch = {}
  if (typeof raw.methodologyVersion === 'string' && raw.methodologyVersion.trim()) {
    normalized.methodologyVersion = raw.methodologyVersion.trim().slice(0, 80)
  }
  if (typeof raw.updatedAt === 'string' && raw.updatedAt.trim()) {
    normalized.updatedAt = raw.updatedAt.trim().slice(0, 80)
  }

  if (raw.trainingPhase) {
    normalized.trainingPhase = normalizeTrainingPhase(raw.trainingPhase)
  }
  if (raw.progressionCriteria) {
    normalized.progressionCriteria = normalizeProgressionCriteria(raw.progressionCriteria)
  }
  if (raw.prescriptionTemplates) {
    normalized.prescriptionTemplates = normalizePrescriptionTemplates(raw.prescriptionTemplates)
  }

  const compliancePatterns = normalizeStringArray(raw.compliancePatterns, 8, 240)
  if (compliancePatterns.length) normalized.compliancePatterns = compliancePatterns

  const sessionGuides = normalizeAdaptiveSessionGuides(raw.sessionGuides)
  if (sessionGuides.length) normalized.sessionGuides = sessionGuides

  return Object.keys(normalized).length ? normalized : null
}

function normalizeAdaptiveSessionGuidePatch(value: unknown): Required<AdaptiveSessionGuidePatch> | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const type = typeof raw.type === 'string' ? raw.type.trim().slice(0, 40) : ''
  const boundary = typeof raw.boundary === 'string' ? raw.boundary.trim().slice(0, 360) : ''
  const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim().slice(0, 360) : ''
  if (!type || !boundary || !evidence) return null
  return {
    type,
    boundary,
    adjustment: normalizeAdaptiveAdjustment(raw.adjustment),
    evidence,
    nextCheck: typeof raw.nextCheck === 'string' ? raw.nextCheck.trim().slice(0, 240) : ''
  }
}

function normalizeAdaptiveAdjustment(value: unknown): Required<AdaptiveSessionGuidePatch>['adjustment'] {
  return value === 'maintain' || value === 'raise' || value === 'lower' || value === 'watch' ? value : 'watch'
}

function normalizeStringArray(value: unknown, limit: number, maxLength: number) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= limit) break
  }
  return result
}

function summarizePrescriptionCompliance(signals: ReturnType<typeof buildPrescriptionComplianceSignals>) {
  const groups = new Map<string, {
    type: string
    total: number
    met: number
    partial: number
    missed: number
    unknown: number
    latestEvidence: string[]
  }>()

  for (const signal of signals) {
    const type = signal.type || 'Unknown'
    const group = groups.get(type) ?? { type, total: 0, met: 0, partial: 0, missed: 0, unknown: 0, latestEvidence: [] }
    group.total += 1
    if (signal.compliance.startsWith('met_')) group.met += 1
    else if (signal.compliance.startsWith('partial_')) group.partial += 1
    else if (signal.compliance.startsWith('missed_')) group.missed += 1
    else group.unknown += 1
    if (group.latestEvidence.length < 4) {
      group.latestEvidence.push(`${signal.dateDisplay}: ${signal.compliance}, drift ${signal.heartRateDriftBpm ?? '-'}bpm, HR ${signal.avgHeartRate ?? '-'}/${signal.maxHeartRate ?? '-'}`)
    }
    groups.set(type, group)
  }

  return [...groups.values()].map((group) => ({
    ...group,
    dominantPattern: describeCompliancePattern(group),
    suggestedAdjustment: suggestAdaptiveAdjustment(group)
  }))
}

function describeCompliancePattern(group: { total: number; met: number; partial: number; missed: number; unknown: number }) {
  if (group.total < 2) return 'single_or_insufficient'
  if (group.met >= 2 && group.missed === 0) return 'stable_compliance'
  if (group.missed >= 2) return 'repeated_boundary_miss'
  if (group.partial + group.missed >= 2) return 'watch_boundary_pressure'
  if (group.unknown >= group.total - 1) return 'insufficient_data'
  return 'mixed'
}

function suggestAdaptiveAdjustment(group: { total: number; met: number; partial: number; missed: number; unknown: number }) {
  const pattern = describeCompliancePattern(group)
  if (pattern === 'stable_compliance') return 'maintain_or_small_raise'
  if (pattern === 'repeated_boundary_miss') return 'lower_or_recover'
  if (pattern === 'watch_boundary_pressure') return 'watch'
  return 'maintain'
}

type SummaryStatsForCoaching = {
  recent7DistanceKm: number
  recent14DistanceKm: number
  recent30DistanceKm: number
  recent30EasyRatio: number
  currentMonthRunCount: number
  currentMonthDistanceKm: number
  currentMonthEasyRatio: number
  currentMonthHardSessions: number
  hardSessionsLast7: number
  runsAfterSelectedRunCount: number
  latestTempo: ReturnType<typeof summarizeRunForCoach>
  latestLong: ReturnType<typeof summarizeRunForCoach>
}

function buildCoachingDecisionBoard(args: {
  selectedRun: RunLogRow | null
  selectedRunLapAnalysis: ReturnType<typeof buildLapProgressionAnalysis>
  selectedRunExecutionGuide: ReturnType<typeof buildSessionExecutionGuide>
  recentPrescriptionComplianceSignals: ReturnType<typeof buildPrescriptionComplianceSignals>
  prescriptionComplianceSummary: ReturnType<typeof summarizePrescriptionCompliance>
  performanceProjection: ReturnType<typeof getPerformanceProjection>
  summaryStats: SummaryStatsForCoaching
  activeGoal: unknown
  activeInjuryItem: unknown
  trainingKnowledge: ReturnType<typeof buildRelevantTrainingKnowledge>
  adaptiveTrainingProfile: unknown
  runnerIdentity: unknown
  coachBeliefs: CoachBelief[]
  runningAnalysisEngine: ReturnType<typeof buildRunningAnalysisEngine>
  runnerLevel: RunnerLevel
  heartRateModel: CoachHeartRateModel
}) {
  const selectedCompliance = args.selectedRun
    ? classifyPrescriptionCompliance(args.selectedRun, args.selectedRunLapAnalysis, args.heartRateModel)
    : 'no_selected_run'
  const injuryCheck = buildInjuryCheckEvidence(args.activeInjuryItem, selectedRunInjuryContext(args.selectedRun))

  return {
    purpose:
      'AI가 코칭 답변을 작성하기 전 확인해야 하는 압축 판단 보드다. 평균값 요약이 아니라 실행 과정, 처방 준수, 목표 전망, 루틴 조정 근거를 함께 보게 한다.',
    runnerLevelCheck: {
      runnerLevel: args.runnerLevel,
      instruction:
        'runnerLevel은 용어 깊이와 코칭 톤을 맞추는 기준이다. beginner는 전문 용어를 풀어서 설명하고 한 번에 한두 가지만, intermediate는 용어에 짧은 해설을 곁들이고, advanced는 간결하게 숫자/경계 중심으로 말한다. 단 레벨은 표현 방식만 바꾸고 처방 안전 기준(심박 상한, 부상 게이트)은 낮추지 않는다.'
    },
    selectedRunEvidence: buildSelectedRunEvidence(args.selectedRun),
    lapProcess: buildLapProcessEvidence(args.selectedRunLapAnalysis),
    prescriptionCompliance: buildPrescriptionComplianceEvidence(
      args.selectedRun,
      args.selectedRunLapAnalysis,
      args.selectedRunExecutionGuide,
      selectedCompliance,
      args.heartRateModel
    ),
    goalProjectionCheck: buildGoalProjectionEvidence(args.performanceProjection, args.selectedRun, args.activeGoal),
    injuryCheck,
    engineCheck: {
      recommendedDecision: args.runningAnalysisEngine.recommendedDecision,
      trainingSuitabilityScore: args.runningAnalysisEngine.trainingSuitabilityScore,
      hrDrift: args.runningAnalysisEngine.hrDrift,
      loadTrend: args.runningAnalysisEngine.loadTrend,
      recoveryStatus: args.runningAnalysisEngine.recoveryStatus,
      injuryRisk: args.runningAnalysisEngine.injuryRisk,
      overtrainingWarning: args.runningAnalysisEngine.overtrainingWarning,
      relevantBeliefCount: args.coachBeliefs.length,
      runnerIdentityPresent: Boolean(args.runnerIdentity),
      instruction:
        '코드 엔진이 먼저 계산한 판단이다. 루틴 업데이트와 다음 훈련 제안은 이 값과 충돌하지 않게 설명한다.'
    },
    routineUpdateCheck: buildRoutineUpdateEvidence({
      selectedRun: args.selectedRun,
      selectedCompliance,
      prescriptionComplianceSummary: args.prescriptionComplianceSummary,
      recentPrescriptionComplianceSignals: args.recentPrescriptionComplianceSignals,
      performanceProjection: args.performanceProjection,
      summaryStats: args.summaryStats,
      activeInjuryItem: args.activeInjuryItem
    }),
    knowledgeCheck: {
      relevantMethodNames: args.trainingKnowledge.methods.map((method) => method.name).slice(0, 4),
      relevantRuleCount: args.trainingKnowledge.prescriptionRules.length,
      adaptiveProfilePresent: Boolean(args.adaptiveTrainingProfile),
      instruction:
        'trainingKnowledge의 승인 규칙과 adaptiveTrainingProfile의 개인화 경계를 함께 보되, 단일 세션만으로 큰 변경을 하지 않는다.'
    },
    responseChecklist: [
      '핵심 지표에 구간/샘플 흐름을 넣는다.',
      '처방 기준을 지켰는지 먼저 말한다.',
      '목표 예상은 보조 근거로만 쓰고 확정처럼 말하지 않는다.',
      '루틴 업데이트 섹션에 유지/상향/하향/보류 결론과 근거 1~3개를 넣는다.',
      '장기기억은 반복 패턴만 저장한다.'
    ]
  }
}

function buildInjuryCheckInPolicy(activeInjuryItem: unknown, selectedRunContext?: { date: string; timing: string }) {
  return {
    active: Boolean(activeInjuryItem),
    painScale:
      'painLevel은 0~5다. 0은 통증 없음, 1~2는 관찰하며 보강운동 가능, 3은 강훈련/롱런 상향 보류, 4~5는 러닝 강도 하향 또는 중단 검토 신호다.',
    trainingIntensityRules: [
      '0~1/5: 기본 루틴 유지 가능. 최근 강훈련 뒤에도 조용했는지 확인한다.',
      '2/5: Easy는 가능할 수 있지만 Tempo, Strides, Steady Long 상향은 체크포인트를 둔다.',
      '3/5: 강훈련과 롱런 상향을 보류하고 Easy 또는 Recovery 쪽으로 낮춘다.',
      '4~5/5: 러닝 강도 처방보다 중단/휴식/전문가 상담 안내를 우선한다.'
    ],
    strengthPlanPolicy:
      '보강운동은 치료 처방이 아니라 러닝 부하 조절 보조다. strengthPlanDetails의 useWhen/stopWhen/source 요약을 짧게 반영하고, 통증 0~2/5에서만 수행하도록 말한다.',
    approvalPolicy:
      'AI는 injuryItems를 자동 갱신하지 않는다. 통증 변경, monitoring/resolved 후보, 완치 후보는 injuryUpdateProposal로만 반환하고 사용자가 승인해야 저장된다.',
    activeInjuryEvidence: buildInjuryCheckEvidence(activeInjuryItem, selectedRunContext)
  }
}

type InjuryCheckEvidence = {
  available: boolean
  instruction?: string
  id?: string
  title?: string
  status?: string
  maxPainLevel?: number | null
  pointInTimeUnknown?: boolean
  pointInTime?: { basis: string; checkedAt: string; painLevel: number | null }
  intensityGuidance?: string
  areaPainLevels?: Array<{ areaId: string; painLevel: number | null }>
  latestCheckIn?: {
    checkedAt: string
    painLevel: number | null
    worsenedDuringOrAfterRun: boolean | null
    dailyActivityPain: boolean | null
    readyForQualitySession: boolean | null
    note: string
  } | null
  restrictions?: string[]
  returnToRunCriteria?: string
  strengthPlan?: string[]
  strengthPlanDetails?: unknown[]
  updateProposalGuidance?: string
}

function buildInjuryCheckEvidence(activeInjuryItem: unknown, selectedRunContext?: { date: string; timing: string }): InjuryCheckEvidence {
  if (!activeInjuryItem || typeof activeInjuryItem !== 'object') {
    return {
      available: false,
      instruction: 'active 또는 monitoring 부상 항목이 없으면 일반 회복 신호와 pain_note만 보조로 확인한다.'
    }
  }

  const item = activeInjuryItem as Record<string, unknown>
  const strengthPlanDetails = Array.isArray(item.strengthPlanDetails) ? item.strengthPlanDetails : []
  const strengthPlan = Array.isArray(item.strengthPlan) ? item.strengthPlan : []
  const sharedFields = {
    id: typeof item.id === 'string' ? item.id : '',
    title: typeof item.title === 'string' ? item.title : '',
    status: typeof item.status === 'string' ? item.status : '',
    restrictions: normalizeStringArray(item.restrictions, 8, 180),
    returnToRunCriteria: readString(item.returnToRunCriteria).slice(0, 300),
    strengthPlan: strengthPlan.filter((entry): entry is string => typeof entry === 'string').slice(0, 6),
    strengthPlanDetails: strengthPlanDetails.map(formatStrengthPlanDetailForCoach).filter(Boolean).slice(0, 6),
    updateProposalGuidance:
      '상태 변경은 자동 저장하지 않는다. 0~1/5가 반복되고 일상/러닝/강훈련 뒤 조용한 경우에만 resolved 후보를, 그 외 통증 변화는 check_in_update 후보를 injuryUpdateProposal로 반환한다.'
  }

  // 과거 세션 코칭: 그 시점 통증을 checkInHistory에서 찾고, 없으면 판단 불가로 둔다(현재 통증 소급 금지).
  if (selectedRunContext && selectedRunContext.timing === 'past') {
    const pit = findPointInTimeCheckIn(item, selectedRunContext.date)
    if (!pit) {
      return {
        available: true,
        ...sharedFields,
        maxPainLevel: null,
        pointInTimeUnknown: true,
        intensityGuidance: '이 세션 당시의 부상 통증 정보가 없습니다. 현재 통증을 과거 세션에 소급 적용하지 말고, 그때 부상이 어땠는지는 알 수 없다고 밝힌 뒤 일반 회복 신호와 pain_note로만 보조 판단하세요.',
        instruction: '과거 세션 시점 부상 통증 정보 없음 — 강도 단정 불가. 현재 active 부상 통증을 이 과거 세션 평가에 적용하지 않는다.'
      }
    }
    const pitAreaPainLevels = normalizePitAreaPainLevels(pit)
    const pitCandidates = [
      ...pitAreaPainLevels.map((area) => area.painLevel),
      normalizePainLevelValue(pit.painLevel)
    ].filter((value): value is number => value !== null)
    const pitMaxPainLevel = pitCandidates.length ? Math.max(...pitCandidates) : null
    return {
      available: true,
      ...sharedFields,
      maxPainLevel: pitMaxPainLevel,
      pointInTime: {
        basis: 'closest_checkin_after_session',
        checkedAt: readString(pit.checkedAt),
        painLevel: normalizePainLevelValue(pit.painLevel)
      },
      intensityGuidance: `${describePainLevelGuidance(pitMaxPainLevel)} 이 값은 세션 직후 체크인 기준의 당시 추정 통증이며, 현재 통증이 아닙니다.`,
      areaPainLevels: pitAreaPainLevels,
      instruction: '과거 세션 시점에 가장 가까운 체크인 통증을 사용한다. 현재 통증으로 과거를 소급 판단하지 않는다.'
    }
  }

  const normalizedAreas = Array.isArray(item.normalizedAreas) ? item.normalizedAreas : []
  const areaPainLevels = normalizedAreas
    .map((area) => {
      if (!area || typeof area !== 'object') return null
      const record = area as Record<string, unknown>
      return {
        areaId: typeof record.areaId === 'string' ? record.areaId : '',
        painLevel: normalizePainLevelValue(record.painLevel)
      }
    })
    .filter((area): area is { areaId: string; painLevel: number | null } => Boolean(area))
  const painCandidates = [
    ...areaPainLevels.map((area) => area.painLevel),
    normalizePainLevelValue(item.severity),
    normalizePainLevelValue(getLatestCheckIn(item)?.painLevel)
  ].filter((value): value is number => value !== null)
  const maxPainLevel = painCandidates.length ? Math.max(...painCandidates) : null
  const latestCheckIn = getLatestCheckIn(item)

  return {
    available: true,
    ...sharedFields,
    maxPainLevel,
    intensityGuidance: describePainLevelGuidance(maxPainLevel),
    areaPainLevels,
    latestCheckIn: latestCheckIn
      ? {
          checkedAt: readString(latestCheckIn.checkedAt),
          painLevel: normalizePainLevelValue(latestCheckIn.painLevel),
          worsenedDuringOrAfterRun: typeof latestCheckIn.worsenedDuringOrAfterRun === 'boolean' ? latestCheckIn.worsenedDuringOrAfterRun : null,
          dailyActivityPain: typeof latestCheckIn.dailyActivityPain === 'boolean' ? latestCheckIn.dailyActivityPain : null,
          readyForQualitySession: typeof latestCheckIn.readyForQualitySession === 'boolean' ? latestCheckIn.readyForQualitySession : null,
          note: readString(latestCheckIn.note)
        }
      : null
  }
}

function selectedRunInjuryContext(selectedRun: RunLogRow | null): { date: string; timing: string } | undefined {
  if (!selectedRun) return undefined
  return { date: selectedRun.date, timing: describeTiming(diffDays(selectedRun.date, currentDateInSeoul())) }
}

function findPointInTimeCheckIn(item: Record<string, unknown>, sessionDate: string): Record<string, unknown> | null {
  const history = Array.isArray(item.checkInHistory) ? item.checkInHistory : []
  const sessionDay = sessionDate.slice(0, 10)
  const candidates = history
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({ entry, day: readString(entry.checkedAt).slice(0, 10) }))
    .filter((row) => row.day && row.day >= sessionDay && diffDays(sessionDate, row.day) <= 10)
    .sort((a, b) => a.day.localeCompare(b.day))
  return candidates[0]?.entry ?? null
}

function normalizePitAreaPainLevels(checkIn: Record<string, unknown>) {
  const areas = Array.isArray(checkIn.areaPainLevels) ? checkIn.areaPainLevels : []
  return areas
    .map((area) => {
      if (!area || typeof area !== 'object') return null
      const record = area as Record<string, unknown>
      return {
        areaId: typeof record.areaId === 'string' ? record.areaId : '',
        painLevel: normalizePainLevelValue(record.painLevel)
      }
    })
    .filter((area): area is { areaId: string; painLevel: number | null } => Boolean(area))
}

function getLatestCheckIn(item: Record<string, unknown>) {
  const history = Array.isArray(item.checkInHistory) ? item.checkInHistory : []
  const latest = history.find((entry) => entry && typeof entry === 'object')
  return latest ? latest as Record<string, unknown> : null
}

function formatStrengthPlanDetailForCoach(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const sources = Array.isArray(item.sources) ? item.sources : []
  return {
    title: readString(item.title).slice(0, 120),
    instruction: readString(item.instruction).slice(0, 240),
    useWhen: readString(item.useWhen).slice(0, 180),
    stopWhen: readString(item.stopWhen).slice(0, 180),
    sourceSummaries: sources.map(formatStrengthPlanSourceForCoach).filter(Boolean).slice(0, 3)
  }
}

function formatStrengthPlanSourceForCoach(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const title = readString(item.title)
  if (!title) return null
  return {
    title: title.slice(0, 120),
    organization: readString(item.organization).slice(0, 80),
    summary: readString(item.summary).slice(0, 180)
  }
}

function describePainLevelGuidance(painLevel: number | null) {
  if (painLevel === null) return '통증 수치가 없으므로 단정하지 말고 다음 착지감과 체크인을 확인한다.'
  if (painLevel <= 1) return '기본 루틴은 유지 가능하지만 강훈련 뒤에도 조용했는지 확인한다.'
  if (painLevel === 2) return 'Easy는 가능할 수 있지만 강훈련/롱런 상향 전 체크포인트가 필요하다.'
  if (painLevel === 3) return 'Tempo, Strides, Steady Long 상향은 보류하고 Easy 또는 Recovery 쪽으로 낮춘다.'
  return '러닝 강도 처방보다 중단/휴식/전문가 상담 안내를 우선한다.'
}

function normalizePainLevelValue(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.min(5, Math.max(0, Math.round(numeric)))
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildSelectedRunEvidence(run: RunLogRow | null) {
  if (!run) {
    return {
      available: false,
      instruction: '선택 세션이 없으면 최근 흐름과 activeGoal 중심으로만 답한다.'
    }
  }

  return {
    available: true,
    id: run.id,
    date: run.date,
    dateDisplay: formatDateWithWeekday(run.date),
    storedType: run.type,
    title: run.session_title,
    source: run.source,
    distanceKm: run.distance_km,
    durationText: run.duration_sec ? formatDurationText(run.duration_sec) : null,
    avgPaceDisplay: formatPaceForCoach(run.avg_pace_sec),
    avgHeartRate: run.avg_heart_rate,
    maxHeartRate: run.max_heart_rate,
    cadence: run.cadence,
    rpe: run.rpe,
    feeling: run.workout_feeling,
    painNote: run.pain_note,
    courseType: run.course_type,
    elevationGainM: run.elevation_gain_m,
    elevationLossM: run.elevation_loss_m,
    tags: run.tags,
    memo: truncateText(run.memo, 180),
    instruction:
      'storedType은 출발점일 뿐이다. 메모, 요일, 구간/샘플 흐름, 심박 경계, fast_segments로 실제 세션 성격을 재해석한다.'
  }
}

function buildLapProcessEvidence(analysis: ReturnType<typeof buildLapProgressionAnalysis>) {
  if (!hasAvailableLapAnalysis(analysis)) {
    return {
      available: false,
      reason: analysis?.reason ?? '구간/샘플 데이터가 부족하다.',
      instruction: '구간 데이터가 없을 때만 평균값 중심으로 말한다.'
    }
  }

  return {
    available: true,
    source: analysis.source,
    sampleCount: analysis.lapCount,
    paceFlow: analysis.paceFlowDisplay,
    heartRateFlow: analysis.heartRateFlowDisplay,
    cadenceRange: analysis.cadenceRangeDisplay,
    firstHalf: analysis.firstHalf,
    secondHalf: analysis.secondHalf,
    paceDeltaSecSecondHalfMinusFirstHalf: analysis.paceDeltaSecSecondHalfMinusFirstHalf,
    heartRateDriftBpmSecondHalfMinusFirstHalf: analysis.heartRateDriftBpmSecondHalfMinusFirstHalf,
    paceTrend: analysis.paceTrend,
    heartRateQuality: analysis.heartRateQuality,
    maxLapHeartRate: analysis.maxLapHeartRate,
    lapHeartRatesOverTempoCeiling: analysis.lapHeartRatesOverTempoCeiling,
    startControlHint: analysis.startControlHint,
    coachingFocus: buildLapCoachingFocus(analysis)
  }
}

function buildLapCoachingFocus(analysis: AvailableLapAnalysis) {
  const focus: string[] = []
  if (analysis.startControlHint === 'fast_start') {
    focus.push('초반이 평균보다 빨랐다. 심박도 같이 올랐는지 확인한다.')
  } else if (analysis.startControlHint === 'controlled_start') {
    focus.push('초반을 눌러 시작한 흐름이다. 후반 품질과 연결해서 말한다.')
  }

  if (analysis.paceTrend === 'negative_split' && analysis.heartRateQuality === 'stable') {
    focus.push('후반 페이스가 좋아졌는데 심박 상승이 작다. 품질 좋은 자연 네거티브 가능성이 높다.')
  } else if (analysis.paceTrend === 'negative_split' && analysis.heartRateQuality === 'large_drift') {
    focus.push('후반 페이스 상승이 심박 드리프트를 크게 만들었다. 무리한 가속 가능성을 본다.')
  } else if (analysis.paceTrend === 'late_fade') {
    focus.push('후반 페이스가 떨어졌다. 장거리 지속성/초반 오버페이스/보급/날씨를 확인한다.')
  }

  const lapsOverTempoCeiling = analysis.lapHeartRatesOverTempoCeiling ?? []
  if (lapsOverTempoCeiling.length > 0) {
    focus.push(`템포 상한 ${analysis.tempoHeartRateCeilingBpm}를 넘긴 구간이 ${lapsOverTempoCeiling.length}개 있다.`)
  }

  return focus.length ? focus : ['페이스 흐름과 심박 흐름을 함께 보고 세션 품질을 짧게 해석한다.']
}

function buildPrescriptionComplianceEvidence(
  run: RunLogRow | null,
  analysis: ReturnType<typeof buildLapProgressionAnalysis>,
  guide: ReturnType<typeof buildSessionExecutionGuide>,
  selectedCompliance: string,
  hr: CoachHeartRateModel = COACH_DEFAULT_HEART_RATE_MODEL
) {
  if (!run) {
    return {
      available: false,
      verdict: 'no_selected_run',
      instruction: '선택 세션이 없으므로 최근 루틴 준수 흐름만 본다.'
    }
  }

  return {
    available: true,
    storedType: run.type,
    primaryMetric: guide?.primaryMetric ?? 'context_dependent',
    boundary: guide?.boundaries ?? null,
    verdict: selectedCompliance,
    verdictLabel: describeComplianceVerdict(selectedCompliance),
    evidence: buildComplianceEvidenceBullets(run, analysis, selectedCompliance, hr),
    postPrescriptionAction: suggestPostPrescriptionAction(selectedCompliance)
  }
}

function buildComplianceEvidenceBullets(
  run: RunLogRow,
  analysis: ReturnType<typeof buildLapProgressionAnalysis>,
  selectedCompliance: string,
  hr: CoachHeartRateModel = COACH_DEFAULT_HEART_RATE_MODEL
) {
  const bullets: string[] = []
  if (run.type === 'Tempo') {
    if (hr.tempoCeilingBpm === null) {
      bullets.push(`개인 심박 상한 미설정(나이/심박 입력 필요). 템포 품질은 페이스 흐름과 후반 안정으로만 본다. 세션 max HR ${run.max_heart_rate ?? '-'}.`)
    } else {
      bullets.push(`Tempo 처방 핵심은 max HR ${hr.tempoCeilingBpm} 이하. 세션 max HR ${run.max_heart_rate ?? '-'}.`)
      if (hasAvailableLapAnalysis(analysis)) {
        const over = (analysis.lapHeartRatesOverTempoCeiling ?? []).map((lap) => `${lap.index}번 ${lap.avgHeartRate}`)
        bullets.push(over.length ? `${hr.tempoCeilingBpm} 초과 구간: ${over.join(', ')}` : `구간 평균 기준으로 ${hr.tempoCeilingBpm} 초과 구간은 없다.`)
      }
    }
  } else if (run.type === 'Easy' || run.type === 'Recovery') {
    const ceiling = run.type === 'Recovery' ? hr.recoveryCeilingBpm : hr.easyCeilingBpm
    if (ceiling === null) {
      bullets.push(`${run.type} 개인 심박 상한 미설정. 페이스와 RPE, 심박 흐름으로 판단한다. 세션 HR ${run.avg_heart_rate ?? '-'}/${run.max_heart_rate ?? '-'}.`)
    } else {
      bullets.push(`${run.type} 처방 핵심은 페이스보다 HR ${ceiling} 이하 유지.`)
      bullets.push(`세션 HR ${run.avg_heart_rate ?? '-'}/${run.max_heart_rate ?? '-'}${selectedCompliance.startsWith('met_') ? '로 기준 안쪽.' : '로 기준 확인 필요.'}`)
    }
  } else if (run.type === 'LSD' || run.type === 'Steady Long') {
    if (hasAvailableLapAnalysis(analysis)) {
      bullets.push(`전후반 심박 드리프트 ${analysis.heartRateDriftBpmSecondHalfMinusFirstHalf ?? '-'}bpm.`)
      bullets.push(`페이스 흐름은 ${analysis.paceTrend}, 심박 품질은 ${analysis.heartRateQuality}.`)
    } else {
      bullets.push('구간 드리프트 근거가 부족해 장거리 품질 판정은 보수적으로 한다.')
    }
  } else if (run.type === 'Easy + Strides') {
    const count = Array.isArray(run.fast_segments) ? run.fast_segments.length : 0
    bullets.push(`Easy + Strides는 짧은 가속 반복과 회복 안정이 핵심. fast segment ${count}개.`)
    bullets.push('케이던스 급상승만으로 스트라이드로 단정하지 않는다.')
  }

  if (hasAvailableLapAnalysis(analysis) && bullets.length < 4) {
    bullets.push(`페이스: ${analysis.paceFlowDisplay ?? '-'}`)
    bullets.push(`심박: ${analysis.heartRateFlowDisplay ?? '-'}`)
  }

  return bullets.slice(0, 5)
}

function describeComplianceVerdict(verdict: string) {
  if (verdict.startsWith('met_')) return '처방 기준을 대체로 지켰다.'
  if (verdict.startsWith('partial_')) return '큰 실패는 아니지만 경계 압력이 있었다.'
  if (verdict.startsWith('missed_')) return '현재 처방보다 강도가 높았거나 기준을 넘겼다.'
  return '데이터가 부족해 준수 여부는 보수적으로 본다.'
}

function suggestPostPrescriptionAction(verdict: string) {
  if (verdict.startsWith('met_')) return 'maintain_or_consider_small_raise_if_repeated'
  if (verdict.startsWith('partial_')) return 'maintain_with_next_check'
  if (verdict.startsWith('missed_')) return 'lower_or_add_recovery_gate'
  return 'watch_until_more_data'
}

function buildGoalProjectionEvidence(
  projection: ReturnType<typeof getPerformanceProjection>,
  selectedRun: RunLogRow | null,
  activeGoal: unknown
) {
  const goalDistanceKm = getNullableNumber(activeGoal, 'distanceKm')
  const goalDurationSec = getNullableNumber(activeGoal, 'targetDurationSec')
  const goalText = goalDistanceKm
    ? `${goalDistanceKm}km${goalDurationSec ? ` ${formatDurationText(goalDurationSec)}` : ''}`
    : null

  if (!projection || projection.status !== 'available') {
    return {
      available: false,
      activeGoal: goalText,
      reason: projection?.status === 'insufficient_data'
        ? 'Race/Tempo/Steady Long/RPE 높은 기록이 부족해 예측은 보조 근거로도 약하다.'
        : '활성 목표 또는 예측 근거가 부족하다.',
      instruction: '예상 기록을 단정하지 말고 훈련 품질/루틴 소화율 중심으로 말한다.'
    }
  }

  const selectedRunProjection = selectedRun && selectedRun.duration_sec && selectedRun.distance_km >= 3 && goalDistanceKm
    ? {
        projectedSec: Math.round(selectedRun.duration_sec * (goalDistanceKm / selectedRun.distance_km) ** 1.06),
        projectedText: formatDurationText(Math.round(selectedRun.duration_sec * (goalDistanceKm / selectedRun.distance_km) ** 1.06)),
        confidence: getProjectionConfidence(selectedRun)
      }
    : null

  return {
    available: true,
    activeGoal: goalText,
    currentProjection: projection.current,
    previousProjection: projection.previous,
    trend: projection.trend,
    deltaSec: projection.deltaSec,
    selectedRunProjection,
    confidencePolicy:
      '예상 기록은 Riegel 계열 환산 기반 보조 신호다. 루틴 변경은 역치훈련, 유산소 베이스, Long Run 지속성, 회복/부상 게이트를 함께 보고 판단한다.',
    interpretation:
      projection.trend === 'improving'
        ? '예측은 개선 방향이지만 상향 조정은 처방 준수와 회복 안정이 같이 있어야 한다.'
        : projection.trend === 'slower'
          ? '예측이 느려졌더라도 날씨/동반주/회복주/세션 목적을 확인해야 한다.'
          : '예측은 기준선 수준이다. 단일 예측값보다 반복 흐름이 중요하다.'
  }
}

function buildRoutineUpdateEvidence(args: {
  selectedRun: RunLogRow | null
  selectedCompliance: string
  prescriptionComplianceSummary: ReturnType<typeof summarizePrescriptionCompliance>
  recentPrescriptionComplianceSignals: ReturnType<typeof buildPrescriptionComplianceSignals>
  performanceProjection: ReturnType<typeof getPerformanceProjection>
  summaryStats: SummaryStatsForCoaching
  activeInjuryItem: unknown
}) {
  const stableGroups = args.prescriptionComplianceSummary.filter((group) => group.dominantPattern === 'stable_compliance')
  const pressureGroups = args.prescriptionComplianceSummary.filter((group) => group.dominantPattern === 'watch_boundary_pressure' || group.dominantPattern === 'repeated_boundary_miss')
  const selectedSignal = args.selectedRun
    ? args.recentPrescriptionComplianceSignals.find((signal) => signal.id === args.selectedRun?.id) ?? null
    : null
  const injuryEvidence = buildInjuryCheckEvidence(args.activeInjuryItem, selectedRunInjuryContext(args.selectedRun))
  const injuryPainLevel = injuryEvidence.available ? injuryEvidence.maxPainLevel ?? null : null
  const hasActiveInjury = injuryEvidence.available
  const projection = args.performanceProjection
  const projectionImproving = Boolean(projection && projection.status === 'available' && projection.trend === 'improving')
  const hardSessionPressure = args.summaryStats.hardSessionsLast7 >= 3 || args.summaryStats.currentMonthHardSessions >= 8

  const evidence = [
    `최근 7/14/30일 거리: ${args.summaryStats.recent7DistanceKm}km / ${args.summaryStats.recent14DistanceKm}km / ${args.summaryStats.recent30DistanceKm}km`,
    `최근 30일 Easy 비율: ${args.summaryStats.recent30EasyRatio}%`,
    `최근 7일 강훈련: ${args.summaryStats.hardSessionsLast7}회`,
    selectedSignal ? `선택 세션 준수: ${selectedSignal.compliance}` : '선택 세션 준수: 선택 세션 없음',
    `부상 체크: ${injuryEvidence.available ? `${injuryEvidence.status || 'status_unknown'} / pain ${injuryPainLevel ?? 'unknown'} / ${injuryEvidence.intensityGuidance}` : 'active injury 없음'}`,
    `반복 준수 그룹: ${stableGroups.map((group) => group.type).join(', ') || '-'}`,
    `경계 압력 그룹: ${pressureGroups.map((group) => group.type).join(', ') || '-'}`
  ]

  let decision = 'maintain'
  let reason = '루틴을 바꿀 반복 근거가 아직 부족하다.'

  if (hasActiveInjury && injuryPainLevel !== null && injuryPainLevel >= 4) {
    decision = 'lower_or_stop_for_injury_gate'
    reason = '통증 4~5/5 신호는 러닝 강도 처방보다 하향/중단 검토와 전문가 상담 안내가 먼저다.'
  } else if (hasActiveInjury && injuryPainLevel !== null && injuryPainLevel >= 3) {
    decision = 'lower_for_injury_gate'
    reason = '통증 3/5 이상이면 Tempo/Strides/Steady Long 상향보다 Easy 또는 Recovery 조정이 먼저다.'
  } else if (hasActiveInjury && injuryPainLevel === 2) {
    decision = 'watch_or_lower'
    reason = '통증 2/5 신호가 있어 Easy는 가능할 수 있지만 강훈련 전 체크포인트가 필요하다.'
  } else if (hasActiveInjury && injuryPainLevel === null) {
    decision = 'watch_or_lower'
    reason = '부상/주의 항목은 있으나 통증 수치가 없어 상향보다 체크인이 먼저다.'
  } else if (args.selectedCompliance.startsWith('missed_') || pressureGroups.some((group) => group.dominantPattern === 'repeated_boundary_miss')) {
    decision = 'consider_lower_or_recovery_gate'
    reason = '처방 경계 초과가 있어 다음 처방을 보수적으로 보거나 회복 게이트를 둔다.'
  } else if (hardSessionPressure) {
    decision = 'watch_load'
    reason = '최근 강훈련 빈도가 높아 루틴 상향보다 부하 관리가 우선이다.'
  } else if (projectionImproving && stableGroups.length >= 2) {
    decision = 'consider_small_raise'
    reason = '예측 흐름과 처방 준수 반복 근거가 있어 한 변수만 소폭 상향을 검토할 수 있다.'
  } else if (args.selectedCompliance.startsWith('met_') && stableGroups.length >= 1) {
    decision = 'maintain_with_next_raise_condition'
    reason = '현재 처방은 맞아 보인다. 다음 상향 조건을 제시하는 정도가 적절하다.'
  }

  return {
    decision,
    reason,
    evidence,
    requiredReportSection:
      '## 루틴 업데이트 섹션에서 이 decision을 자연어로 풀어 말한다. 유지면 유지 근거와 다음 상향 조건을, 변경이면 변경 이유와 새 처방을 말한다.',
    patchGuidance:
      decision === 'consider_small_raise' || decision === 'consider_lower_or_recovery_gate' || decision === 'watch_or_lower'
        || decision === 'lower_for_injury_gate' || decision === 'lower_or_stop_for_injury_gate'
        ? '반복 근거가 충분하고 실제 루틴을 바꿔야 한다면 trainingMemoryPatch를 반환한다. 단일 세션만 근거라면 report에 보류/다음 확인 조건만 말한다.'
        : 'trainingMemoryPatch는 null로 둔다.'
  }
}

type AvailableLapAnalysis = NonNullable<ReturnType<typeof buildLapProgressionAnalysis>> & { available: true }

function hasAvailableLapAnalysis(analysis: ReturnType<typeof buildLapProgressionAnalysis>): analysis is AvailableLapAnalysis {
  return Boolean(analysis && analysis.available)
}

function buildRunningAnalysisEngine(args: {
  runRows: RunLogRow[]
  selectedRun: RunLogRow | null
  selectedRunLapAnalysis: ReturnType<typeof buildLapProgressionAnalysis>
  recentPrescriptionComplianceSignals: ReturnType<typeof buildPrescriptionComplianceSignals>
  prescriptionComplianceSummary: ReturnType<typeof summarizePrescriptionCompliance>
  summaryStats: SummaryStatsForCoaching
  activeInjuryItem: unknown
  activeGoal: unknown
  ageWeight: number
}) {
  const anchorForLoad = args.selectedRun?.date ?? currentDateInSeoul()
  const recent7 = withinDaysFromAnchor(args.runRows, 7, anchorForLoad)
  const previous7 = args.runRows.filter((run) => {
    const anchor = anchorForLoad
    const days = diffDays(run.date, anchor)
    return days > 7 && days <= 14
  })
  const recent7DistanceKm = sumDistance(recent7)
  const previous7DistanceKm = sumDistance(previous7)
  const loadIncreasePct = previous7DistanceKm > 0
    ? Math.round(((recent7DistanceKm - previous7DistanceKm) / previous7DistanceKm) * 100)
    : null

  // 중장기 부하: 최근 30일 vs 직전 30일(31~60일). 나이대가 높으면 경고 임계값을 낮춘다.
  const last30Runs = withinDaysFromAnchor(args.runRows, 30, anchorForLoad)
  const last30Ids = new Set(last30Runs.map((run) => run.id))
  const prev30Runs = withinDaysFromAnchor(args.runRows, 60, anchorForLoad).filter((run) => !last30Ids.has(run.id))
  const last30DistanceKm = sumDistance(last30Runs)
  const prev30DistanceKm = sumDistance(prev30Runs)
  const chronicSpikeThreshold = 50 - args.ageWeight * 5
  const chronicRisingThreshold = 30 - args.ageWeight * 3
  const chronicLoadIncreasePct = prev30DistanceKm >= 15
    ? Math.round(((last30DistanceKm - prev30DistanceKm) / prev30DistanceKm) * 100)
    : null
  const chronicLoadStatus: 'spike' | 'rising' | 'stable' | 'unknown' = chronicLoadIncreasePct === null
    ? 'unknown'
    : chronicLoadIncreasePct >= chronicSpikeThreshold
      ? 'spike'
      : chronicLoadIncreasePct >= chronicRisingThreshold
        ? 'rising'
        : 'stable'
  const selectedCompliance = args.selectedRun
    ? args.recentPrescriptionComplianceSignals.find((signal) => signal.id === args.selectedRun?.id)?.compliance ?? 'unknown'
    : 'unknown'
  const injuryEvidence = buildInjuryCheckEvidence(args.activeInjuryItem, selectedRunInjuryContext(args.selectedRun))
  const activePainLevel = injuryEvidence.available ? injuryEvidence.maxPainLevel ?? null : null
  const hrDriftBpm = hasAvailableLapAnalysis(args.selectedRunLapAnalysis)
    ? args.selectedRunLapAnalysis.heartRateDriftBpmSecondHalfMinusFirstHalf ?? null
    : null
  const hrDriftStatus = hrDriftBpm === null
    ? 'unknown'
    : hrDriftBpm <= 8
      ? 'stable'
      : hrDriftBpm <= 12
        ? 'watch'
        : 'high'
  const loadStatus = loadIncreasePct === null
    ? 'unknown'
    : loadIncreasePct >= 45
      ? 'spike'
      : loadIncreasePct >= 25
        ? 'rising'
        : loadIncreasePct <= -35
          ? 'dropping'
          : 'stable'
  const selectedRun = args.selectedRun
  const highRpe = selectedRun?.rpe !== null && selectedRun?.rpe !== undefined && selectedRun.rpe >= 8
  const lowSleep = selectedRun?.sleep_quality !== null && selectedRun?.sleep_quality !== undefined && selectedRun.sleep_quality <= 2
  const lowCondition = selectedRun?.condition_score !== null && selectedRun?.condition_score !== undefined && selectedRun.condition_score <= 2
  const painNote = selectedRun?.pain_note?.trim() ?? ''
  const selectedMissedBoundary = selectedCompliance.startsWith('missed_')
  const pressureGroups = args.prescriptionComplianceSummary.filter((group) => group.dominantPattern === 'watch_boundary_pressure' || group.dominantPattern === 'repeated_boundary_miss')

  let recoveryStatus: 'ready' | 'watch' | 'reduce' | 'unknown' = 'unknown'
  if (selectedRun) {
    recoveryStatus = 'ready'
    if (highRpe || lowSleep || lowCondition || selectedMissedBoundary || hrDriftStatus === 'watch') recoveryStatus = 'watch'
    if (activePainLevel !== null && activePainLevel >= 3) recoveryStatus = 'reduce'
    if (hrDriftStatus === 'high' || (highRpe && lowSleep)) recoveryStatus = 'reduce'
  }

  let injuryRisk: 'low' | 'watch' | 'high' | 'unknown' = injuryEvidence.available ? 'watch' : 'low'
  if (!selectedRun && !injuryEvidence.available) injuryRisk = 'unknown'
  if (activePainLevel !== null && activePainLevel >= 3) injuryRisk = 'high'
  else if (activePainLevel !== null && activePainLevel >= 2) injuryRisk = 'watch'
  else if (painNote || loadStatus === 'spike' || chronicLoadStatus === 'spike') injuryRisk = 'watch'
  if (activePainLevel !== null && activePainLevel >= 4) injuryRisk = 'high'

  let overtrainingWarning: 'none' | 'watch' | 'warning' = 'none'
  const pressureCount = [
    args.summaryStats.hardSessionsLast7 >= 3,
    loadStatus === 'spike',
    chronicLoadStatus === 'spike',
    highRpe,
    lowSleep,
    lowCondition,
    hrDriftStatus === 'high',
    pressureGroups.length >= 2
  ].filter(Boolean).length
  if (pressureCount >= 3) overtrainingWarning = 'warning'
  else if (pressureCount >= 1) overtrainingWarning = 'watch'

  let trainingSuitabilityScore = 78
  if (hrDriftStatus === 'watch') trainingSuitabilityScore -= 8
  if (hrDriftStatus === 'high') trainingSuitabilityScore -= 15
  if (loadStatus === 'rising') trainingSuitabilityScore -= 6
  if (loadStatus === 'spike') trainingSuitabilityScore -= 16
  if (chronicLoadStatus === 'rising') trainingSuitabilityScore -= 4
  if (chronicLoadStatus === 'spike') trainingSuitabilityScore -= 10
  if (recoveryStatus === 'watch') trainingSuitabilityScore -= 10
  if (recoveryStatus === 'reduce') trainingSuitabilityScore -= 22
  if (injuryRisk === 'watch') trainingSuitabilityScore -= 10
  if (injuryRisk === 'high') trainingSuitabilityScore -= 25
  if (overtrainingWarning === 'watch') trainingSuitabilityScore -= 6
  if (overtrainingWarning === 'warning') trainingSuitabilityScore -= 14
  if (selectedCompliance.startsWith('met_')) trainingSuitabilityScore += 5
  trainingSuitabilityScore = Math.max(0, Math.min(100, Math.round(trainingSuitabilityScore)))

  let recommendedDecision: 'raise' | 'maintain' | 'watch' | 'lower' | 'recover' = 'maintain'
  if (injuryRisk === 'high' || recoveryStatus === 'reduce') recommendedDecision = 'recover'
  else if (trainingSuitabilityScore < 45 || overtrainingWarning === 'warning') recommendedDecision = 'lower'
  else if (trainingSuitabilityScore < 68 || injuryRisk === 'watch' || recoveryStatus === 'watch') recommendedDecision = 'watch'
  else if (selectedCompliance.startsWith('met_') && pressureGroups.length === 0 && args.summaryStats.hardSessionsLast7 <= 2) recommendedDecision = 'maintain'

  const evidence = [
    `HR drift: ${hrDriftBpm === null ? 'unknown' : `${hrDriftBpm}bpm`} / ${hrDriftStatus}`,
    `7일 부하 변화: ${loadIncreasePct === null ? 'unknown' : `${loadIncreasePct}%`} / ${loadStatus}`,
    `30일 누적 부하 변화: ${chronicLoadIncreasePct === null ? 'unknown' : `${chronicLoadIncreasePct}%`} / ${chronicLoadStatus} (최근 30일 ${last30DistanceKm}km vs 이전 30일 ${prev30DistanceKm}km)`,
    `회복 상태: ${recoveryStatus}`,
    `부상 위험: ${injuryRisk}${activePainLevel !== null ? ` / pain ${activePainLevel}` : ''}`,
    `처방 준수: ${selectedCompliance}`
  ]

  const memoryCandidates = buildEngineMemoryCandidates({
    selectedRun,
    selectedCompliance,
    hrDriftStatus,
    recoveryStatus,
    injuryRisk,
    pressureGroups
  })

  return {
    version: 'pacelab-running-engine-2026-06-v1',
    principle: '데이터에서 계산 가능한 판단은 코드가 먼저 만들고, AI는 그 판단을 한국어 코칭으로 설명한다.',
    hrDrift: {
      bpmSecondHalfMinusFirstHalf: hrDriftBpm,
      status: hrDriftStatus
    },
    loadTrend: {
      recent7DistanceKm,
      previous7DistanceKm,
      increasePct: loadIncreasePct,
      status: loadStatus
    },
    chronicLoadTrend: {
      last30DistanceKm,
      prev30DistanceKm,
      increasePct: chronicLoadIncreasePct,
      status: chronicLoadStatus,
      ageWeight: args.ageWeight,
      note: '최근 30일 누적과 직전 30일을 비교한 중장기 부하다. 7일 급성 부하와 함께 보고, 한 달에 걸쳐 천천히 누적이 늘어난 경우도 부상 위험으로 본다. 나이대가 높으면 경고 임계값을 낮춘다.'
    },
    recoveryStatus,
    injuryRisk,
    overtrainingWarning,
    trainingSuitabilityScore,
    recommendedDecision,
    activeGoalTitle: readString((args.activeGoal as Record<string, unknown> | null)?.title),
    evidence,
    memoryCandidates
  }
}

function buildEngineMemoryCandidates(args: {
  selectedRun: RunLogRow | null
  selectedCompliance: string
  hrDriftStatus: string
  recoveryStatus: string
  injuryRisk: string
  pressureGroups: { type: string; dominantPattern: string }[]
}) {
  const candidates: {
    type: 'strength' | 'weakness' | 'risk' | 'belief'
    label: string
    confidence: number
    evidenceRunIds: string[]
  }[] = []
  const evidenceRunIds = args.selectedRun ? [args.selectedRun.id] : []

  if (args.selectedCompliance.startsWith('met_') && args.hrDriftStatus === 'stable') {
    candidates.push({
      type: 'strength',
      label: '처방 경계를 지키면서 후반 심박 상승을 안정적으로 관리하는 세션이 있다',
      confidence: 0.65,
      evidenceRunIds
    })
  }
  if (args.pressureGroups.length) {
    candidates.push({
      type: 'belief',
      label: `최근 ${args.pressureGroups.map((group) => group.type).join(', ')} 세션에서 처방 경계 압력이 반복된다`,
      confidence: 0.72,
      evidenceRunIds
    })
  }
  if (args.injuryRisk === 'watch' || args.injuryRisk === 'high') {
    candidates.push({
      type: 'risk',
      label: '부상/통증 신호가 있을 때는 강훈련 상향보다 회복 게이트가 먼저다',
      confidence: args.injuryRisk === 'high' ? 0.86 : 0.68,
      evidenceRunIds
    })
  }
  if (args.recoveryStatus === 'reduce') {
    candidates.push({
      type: 'weakness',
      label: '회복 신호가 나쁘면 다음 처방을 낮춰야 하는 패턴 후보가 있다',
      confidence: 0.64,
      evidenceRunIds
    })
  }

  return candidates.slice(0, 5)
}

function normalizeTrainingMemoryPatch(patch: TrainingMemoryPatch | null): TrainingMemoryPatch | null {
  if (!patch || typeof patch !== 'object') return null
  const normalized: TrainingMemoryPatch = {}

  if (Array.isArray(patch.weeklyPattern)) {
    const weeklyPattern = patch.weeklyPattern.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 10)
    if (weeklyPattern.length) normalized.weeklyPattern = weeklyPattern
  }
  if (typeof patch.longRunStrategy === 'string' && patch.longRunStrategy.trim()) {
    normalized.longRunStrategy = patch.longRunStrategy.trim().slice(0, 1000)
  }
  if (typeof patch.currentVolumeNote === 'string' && patch.currentVolumeNote.trim()) {
    normalized.currentVolumeNote = patch.currentVolumeNote.trim().slice(0, 1000)
  }
  if (typeof patch.activeGoalStrategyNotes === 'string' && patch.activeGoalStrategyNotes.trim()) {
    normalized.activeGoalStrategyNotes = patch.activeGoalStrategyNotes.trim().slice(0, 1200)
  }
  if (Array.isArray(patch.aiNotes)) {
    const aiNotes = patch.aiNotes.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 12)
    if (aiNotes.length) normalized.aiNotes = aiNotes
  }
  const adaptiveTrainingProfile = normalizeAdaptiveTrainingProfilePatch(patch.adaptiveTrainingProfile)
  if (adaptiveTrainingProfile) normalized.adaptiveTrainingProfile = adaptiveTrainingProfile
  const runnerIdentity = normalizeRunnerIdentityPatch(patch.runnerIdentity)
  if (runnerIdentity) normalized.runnerIdentity = runnerIdentity
  const coachBeliefs = normalizeCoachBeliefsPatch(patch.coachBeliefs)
  if (coachBeliefs.length) normalized.coachBeliefs = coachBeliefs

  return Object.keys(normalized).length ? normalized : null
}

function normalizeInjuryUpdateProposal(proposal: InjuryUpdateProposal | null, activeInjuryItem: unknown): InjuryUpdateProposal | null {
  if (!proposal || typeof proposal !== 'object') return null
  if (!activeInjuryItem || typeof activeInjuryItem !== 'object') return null
  const activeInjuryItemId = readString((activeInjuryItem as Record<string, unknown>).id)
  const injuryItemId = readString((proposal as Record<string, unknown>).injuryItemId)
  if (!activeInjuryItemId || injuryItemId !== activeInjuryItemId) return null

  const proposalType = normalizeInjuryProposalType((proposal as Record<string, unknown>).proposalType)
  const suggestedStatus = normalizeInjuryProposalStatus((proposal as Record<string, unknown>).suggestedStatus)
  const suggestedPainLevel = normalizePainLevelValue((proposal as Record<string, unknown>).suggestedPainLevel)
  const rationale = readString((proposal as Record<string, unknown>).rationale).slice(0, 500)
  const userApprovalPrompt = readString((proposal as Record<string, unknown>).userApprovalPrompt).slice(0, 220)
  const safetyNotes = normalizeStringArray((proposal as Record<string, unknown>).safetyNotes, 5, 160)

  if (!proposalType || !rationale || !userApprovalPrompt) return null
  return {
    injuryItemId,
    proposalType,
    ...(suggestedStatus ? { suggestedStatus } : {}),
    suggestedPainLevel,
    rationale,
    userApprovalPrompt,
    safetyNotes: safetyNotes.length
      ? safetyNotes
      : ['사용자 승인 전에는 injuryItems를 저장하지 않는다.', '의료 진단이나 치료 완료로 단정하지 않는다.']
  }
}

function normalizeInjuryProposalType(value: unknown): InjuryUpdateProposal['proposalType'] | null {
  if (value === 'check_in_update' || value === 'resolve_candidate' || value === 'status_change_candidate') return value
  return null
}

function normalizeInjuryProposalStatus(value: unknown): InjuryUpdateProposal['suggestedStatus'] | null {
  if (value === 'active' || value === 'monitoring' || value === 'resolved') return value
  return null
}

function mergeTrainingMemoryPatch(memory: CoachContext['trainingMemory'], patch: TrainingMemoryPatch) {
  const current = memory && typeof memory === 'object' ? memory as Record<string, unknown> : {}
  const goals = Array.isArray(current.goals) ? current.goals : []
  const activeGoalId = typeof current.activeGoalId === 'string' ? current.activeGoalId : ''
  const patchedGoals = patch.activeGoalStrategyNotes
    ? goals.map((goal) => {
        if (!goal || typeof goal !== 'object') return goal
        const goalRecord = goal as Record<string, unknown>
        const isActive = activeGoalId ? goalRecord.id === activeGoalId : goal === goals[0]
        if (!isActive) return goal
        return {
          ...goalRecord,
          strategyNotes: patch.activeGoalStrategyNotes,
          updatedAt: new Date().toISOString()
        }
      })
    : goals
  return {
    ...current,
    ...(patch.activeGoalStrategyNotes && patchedGoals.length ? { goals: patchedGoals } : {}),
    ...(patch.weeklyPattern ? { weeklyPattern: patch.weeklyPattern } : {}),
    ...(patch.longRunStrategy ? { longRunStrategy: patch.longRunStrategy } : {}),
    ...(patch.currentVolumeNote ? { currentVolumeNote: patch.currentVolumeNote } : {}),
    ...(patch.aiNotes ? { aiNotes: mergeAiNotes(current.aiNotes, patch.aiNotes) } : {}),
    ...(patch.adaptiveTrainingProfile
      ? { adaptiveTrainingProfile: mergeAdaptiveTrainingProfile(current.adaptiveTrainingProfile, patch.adaptiveTrainingProfile) }
      : {}),
    ...(patch.runnerIdentity ? { runnerIdentity: mergeRunnerIdentity(current.runnerIdentity, patch.runnerIdentity) } : {}),
    ...(patch.coachBeliefs ? { coachBeliefs: mergeCoachBeliefs(current.coachBeliefs, patch.coachBeliefs) } : {})
  }
}

function mergeAdaptiveTrainingProfile(current: unknown, patch: AdaptiveTrainingProfilePatch) {
  const base = normalizeAdaptiveTrainingProfile(current)
  const patchGuides = normalizeAdaptiveSessionGuides(patch.sessionGuides)
  const guidesByType = new Map<string, Required<AdaptiveSessionGuidePatch>>()
  for (const guide of base.sessionGuides) guidesByType.set(guide.type, guide)
  for (const guide of patchGuides) guidesByType.set(guide.type, guide)

  return {
    methodologyVersion: patch.methodologyVersion ?? base.methodologyVersion,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
    trainingPhase: patch.trainingPhase ? normalizeTrainingPhase(patch.trainingPhase) : base.trainingPhase,
    progressionCriteria: patch.progressionCriteria ? normalizeProgressionCriteria(patch.progressionCriteria) : base.progressionCriteria,
    prescriptionTemplates: patch.prescriptionTemplates ? normalizePrescriptionTemplates(patch.prescriptionTemplates) : base.prescriptionTemplates,
    compliancePatterns: mergeStringLists(patch.compliancePatterns ?? [], base.compliancePatterns, 20),
    sessionGuides: [...patchGuides, ...[...guidesByType.values()].filter((guide) => !patchGuides.some((next) => next.type === guide.type))].slice(0, 12)
  }
}

function mergeAiNotes(current: unknown, next: string[]) {
  const currentItems = Array.isArray(current) ? current.filter((item) => typeof item === 'string') as string[] : []
  return [...next, ...currentItems.filter((item) => !next.includes(item))].slice(0, 30)
}

function mergeStringLists(next: string[], current: string[], limit: number) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of [...next, ...current]) {
    const text = item.replace(/\s+/g, ' ').trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= limit) break
  }
  return result
}

function getRunnerIdentity(memory: unknown) {
  const current = memory && typeof memory === 'object' ? memory as Record<string, unknown> : {}
  const rawIdentity = current.runnerIdentity && typeof current.runnerIdentity === 'object'
    ? current.runnerIdentity as Record<string, unknown>
    : {}
  const identity = normalizeRunnerIdentityPatch(rawIdentity) ?? {
    strengths: [],
    weaknesses: [],
    riskFactors: [],
    coachingStyle: []
  }
  const knownIssues = normalizeStringArray(current.knownIssues, 8, 160).map((label) => makeIdentityTrait(label, 'user', 0.68))
  const runningStyle = normalizeStringArray(current.runningStyle, 8, 160).map((label) => makeIdentityTrait(label, 'user', 0.7))
  const heatStrategy = normalizeStringArray(current.heatStrategy, 6, 160)

  return {
    strengths: mergeIdentityTraits(identity.strengths ?? [], runningStyle, 10),
    weaknesses: identity.weaknesses ?? [],
    riskFactors: mergeIdentityTraits(identity.riskFactors ?? [], knownIssues, 10),
    coachingStyle: mergeStringLists(identity.coachingStyle ?? [], heatStrategy, 12)
  }
}

function getCoachBeliefs(memory: unknown): CoachBelief[] {
  const current = memory && typeof memory === 'object' ? memory as Record<string, unknown> : {}
  return normalizeCoachBeliefsPatch(current.coachBeliefs)
    .sort((a, b) => scoreCoachBeliefForSelection(b, new Set()) - scoreCoachBeliefForSelection(a, new Set()))
    .slice(0, 30)
}

function selectRelevantCoachBeliefs(
  beliefs: CoachBelief[],
  context: {
    selectedRun: RunLogRow | null
    activeGoal: unknown
    activeInjuryItem: unknown
    userNote: string
    runningAnalysisEngine: ReturnType<typeof buildRunningAnalysisEngine>
  }
) {
  const tags = extractContextTags([
    context.selectedRun?.session_title ?? '',
    context.selectedRun?.type ?? '',
    context.selectedRun?.memo ?? '',
    context.userNote,
    readString((context.activeGoal as Record<string, unknown> | null)?.title),
    readString((context.activeGoal as Record<string, unknown> | null)?.strategyNotes),
    readString((context.activeInjuryItem as Record<string, unknown> | null)?.title),
    context.runningAnalysisEngine.recommendedDecision,
    context.runningAnalysisEngine.injuryRisk,
    context.runningAnalysisEngine.recoveryStatus
  ].join(' '))

  return beliefs
    .filter((belief) => belief.status !== 'retired')
    .map((belief) => ({
      belief,
      score: scoreCoachBeliefForSelection(belief, tags)
    }))
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item) => item.belief)
}

function normalizeRunnerIdentityPatch(value: unknown): RunnerIdentityPatch | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const strengths = normalizeIdentityTraits(raw.strengths, 8)
  const weaknesses = normalizeIdentityTraits(raw.weaknesses, 8)
  const riskFactors = normalizeIdentityTraits(raw.riskFactors, 8)
  const coachingStyle = normalizeStringArray(raw.coachingStyle, 8, 160)
  const patch: RunnerIdentityPatch = {}
  if (strengths.length) patch.strengths = strengths
  if (weaknesses.length) patch.weaknesses = weaknesses
  if (riskFactors.length) patch.riskFactors = riskFactors
  if (coachingStyle.length) patch.coachingStyle = coachingStyle
  return Object.keys(patch).length ? patch : null
}

function normalizeIdentityTraits(value: unknown, limit: number): RunnerIdentityTrait[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return makeIdentityTrait(item, 'coach', 0.62)
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const label = readString(raw.label).slice(0, 160)
      if (!label) return null
      return {
        label,
        evidence: normalizeStringArray(raw.evidence, 5, 180),
        confidence: normalizeConfidence(raw.confidence, 0.65),
        source: normalizeMemorySource(raw.source),
        updatedAt: readString(raw.updatedAt) || new Date().toISOString()
      }
    })
    .filter((item): item is RunnerIdentityTrait => Boolean(item))
    .slice(0, limit)
}

function makeIdentityTrait(label: string, source: RunnerIdentityTrait['source'], confidence: number): RunnerIdentityTrait {
  return {
    label: label.trim().slice(0, 160),
    evidence: [],
    confidence,
    source,
    updatedAt: null
  }
}

function mergeRunnerIdentity(current: unknown, patch: RunnerIdentityPatch) {
  const base = getRunnerIdentity(current && typeof current === 'object' && 'runnerIdentity' in current ? current : { runnerIdentity: current })
  return {
    strengths: mergeIdentityTraits(patch.strengths ?? [], base.strengths, 10),
    weaknesses: mergeIdentityTraits(patch.weaknesses ?? [], base.weaknesses, 10),
    riskFactors: mergeIdentityTraits(patch.riskFactors ?? [], base.riskFactors, 10),
    coachingStyle: mergeStringLists(patch.coachingStyle ?? [], base.coachingStyle, 12)
  }
}

function mergeIdentityTraits(next: RunnerIdentityTrait[], current: RunnerIdentityTrait[], limit: number) {
  const byKey = new Map<string, RunnerIdentityTrait>()
  for (const trait of [...current, ...next]) {
    const key = normalizeMemoryKey(trait.label)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing || trait.confidence >= existing.confidence) {
      byKey.set(key, {
        ...trait,
        evidence: mergeStringLists(trait.evidence, existing?.evidence ?? [], 6),
        confidence: Math.max(trait.confidence, existing?.confidence ?? 0),
        updatedAt: trait.updatedAt ?? existing?.updatedAt ?? null
      })
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
}

function normalizeCoachBeliefsPatch(value: unknown): CoachBelief[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeCoachBelief)
    .filter((item): item is CoachBelief => Boolean(item))
    .filter((belief) => belief.confidence >= 0.55 || belief.supportCount >= 2 || belief.source === 'user')
    .slice(0, 30)
}

function normalizeCoachBelief(value: unknown): CoachBelief | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const belief = readString(raw.belief).slice(0, 220)
  if (!belief) return null
  const id = readString(raw.id) || createBeliefId(belief)
  const supportCount = Math.max(0, Math.round(Number(raw.supportCount ?? 1) || 1))
  const contradictionCount = Math.max(0, Math.round(Number(raw.contradictionCount ?? 0) || 0))
  const confidence = normalizeConfidence(raw.confidence, supportCount >= 2 ? 0.68 : 0.58)
  return {
    id: id.slice(0, 80),
    belief,
    category: normalizeBeliefCategory(raw.category),
    confidence,
    supportCount,
    contradictionCount,
    evidenceRunIds: normalizeStringArray(raw.evidenceRunIds, 8, 80),
    status: normalizeBeliefStatus(raw.status, confidence, supportCount),
    source: normalizeMemorySource(raw.source),
    updatedAt: readString(raw.updatedAt) || new Date().toISOString()
  }
}

function mergeCoachBeliefs(current: unknown, next: CoachBeliefPatch[]) {
  const currentItems = normalizeCoachBeliefsPatch(current)
  const nextItems = normalizeCoachBeliefsPatch(next)
  const byKey = new Map<string, CoachBelief>()
  for (const belief of [...currentItems, ...nextItems]) {
    const key = belief.id || createBeliefId(belief.belief)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, belief)
      continue
    }
    const supportCount = Math.max(existing.supportCount, belief.supportCount)
    const contradictionCount = Math.max(existing.contradictionCount, belief.contradictionCount)
    byKey.set(key, {
      ...existing,
      ...belief,
      confidence: Math.max(existing.confidence, belief.confidence),
      supportCount,
      contradictionCount,
      evidenceRunIds: mergeStringLists(belief.evidenceRunIds, existing.evidenceRunIds, 10),
      status: normalizeBeliefStatus(belief.status, Math.max(existing.confidence, belief.confidence), supportCount),
      updatedAt: belief.updatedAt ?? existing.updatedAt
    })
  }
  return [...byKey.values()]
    .filter((belief) => belief.status !== 'retired')
    .sort((a, b) => scoreCoachBeliefForSelection(b, new Set()) - scoreCoachBeliefForSelection(a, new Set()))
    .slice(0, 30)
}

function scoreCoachBeliefForSelection(belief: CoachBelief, tags: Set<string>) {
  let score = belief.confidence * 10 + Math.min(belief.supportCount, 5)
  if (belief.status === 'confirmed') score += 4
  if (belief.category === 'injury' || belief.category === 'routine' || belief.category === 'load') score += 2
  const beliefTags = extractContextTags(belief.belief)
  for (const tag of tags) {
    if (beliefTags.has(tag)) score += 5
  }
  if (belief.contradictionCount > belief.supportCount) score -= 5
  return score
}

function normalizeConfidence(value: unknown, fallback: number) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(0, Math.min(1, Math.round(num * 100) / 100))
}

function normalizeMemorySource(value: unknown): RunnerIdentityTrait['source'] {
  if (value === 'engine' || value === 'coach' || value === 'user' || value === 'mixed') return value
  return 'coach'
}

function normalizeBeliefCategory(value: unknown): CoachBelief['category'] {
  if (
    value === 'recovery' ||
    value === 'injury' ||
    value === 'load' ||
    value === 'pacing' ||
    value === 'routine' ||
    value === 'weather' ||
    value === 'preference' ||
    value === 'other'
  ) return value
  return 'other'
}

function normalizeBeliefStatus(value: unknown, confidence: number, supportCount: number): CoachBelief['status'] {
  if (value === 'retired') return 'retired'
  if (value === 'confirmed' || confidence >= 0.82 || supportCount >= 3) return 'confirmed'
  return 'candidate'
}

function createBeliefId(belief: string) {
  return `belief-${normalizeMemoryKey(belief).slice(0, 48)}`
}

function collectMemoryContextTags(
  selectedRun: RunLogRow | null,
  userNote: string,
  options?: {
    activeGoal: unknown
    activeInjuryItem: unknown
    coachBeliefs: CoachBelief[]
    runnerIdentity: ReturnType<typeof getRunnerIdentity>
  }
) {
  const contextTags = extractContextTags(`${selectedRun?.session_title ?? ''} ${selectedRun?.type ?? ''} ${selectedRun?.memo ?? ''} ${userNote}`)
  for (const text of [
    readString((options?.activeGoal as Record<string, unknown> | null)?.title),
    readString((options?.activeGoal as Record<string, unknown> | null)?.strategyNotes),
    readString((options?.activeInjuryItem as Record<string, unknown> | null)?.title),
    ...(options?.coachBeliefs ?? []).map((belief) => belief.belief),
    ...(options?.runnerIdentity?.riskFactors ?? []).map((trait) => trait.label),
    ...(options?.runnerIdentity?.strengths ?? []).map((trait) => trait.label)
  ]) {
    for (const tag of extractContextTags(text)) contextTags.add(tag)
  }
  return contextTags
}

// 중요도 1~5. 사용자의 욕구(want to/하고 싶다/원한다)·목표·서사·정체성·부상은 시간이 지나도 잊으면 안 되므로 높게,
// 선호/생활 맥락은 그 다음, 일반 반복 패턴은 중간, 그 외는 낮게. (#179, #177)
function deriveMemoryImportance(content: string): number {
  const text = content.toLowerCase()
  if (containsAny(text, [
    '하고 싶', '하고싶', '원한', '원해', '바란', '목표', '도전', 'want to', '꿈', '서사', '이유는',
    '부상', '통증', '발바닥', '햄스트링', '완치', '재발'
  ])) return 5
  if (containsAny(text, [
    '선호', '좋아', '싫어', '동기', '아내', '배우자', '와이프', '가족', '직장', '생활', '수면', '스트레스', '습관', '성향', '정체성'
  ])) return 4
  if (containsAny(text, ['패턴', '반복', '기준', '전략', '루틴', '주의', '관리', '템포', 'lsd', 'steady', '롱런', '회복'])) return 3
  return 2
}

function normalizeImportance(value: number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, Math.round(n)))
}

// 보존 점수: 중요도가 높으면 오래돼도 남고, 낮으면 시간이 지나며 잊힌다(사람 기억 모델).
function memoryRetentionScore(importance: number, ageDays: number): number {
  const imp = normalizeImportance(importance)
  const base = imp * 2 // 2..10: 중요도가 만드는 기본 보존력
  let recency = 0 // 최근성 보너스(시간 지나면 사라짐)
  if (ageDays <= 14) recency = 4
  else if (ageDays <= 45) recency = 2.5
  else if (ageDays <= 120) recency = 1
  let agePenalty = 0 // 저중요도 노후는 빠르게 잊힘
  if (imp <= 2) {
    if (ageDays > 120) agePenalty = 6
    else if (ageDays > 45) agePenalty = 3
  } else if (imp === 3 && ageDays > 365) {
    agePenalty = 2
  }
  return base + recency - agePenalty
}

function mergeMemoryRows(...lists: CoachMemoryItemRow[][]): CoachMemoryItemRow[] {
  const byId = new Map<string, CoachMemoryItemRow>()
  const noId: CoachMemoryItemRow[] = []
  for (const list of lists) {
    for (const row of list) {
      if (row.id) {
        if (!byId.has(row.id)) byId.set(row.id, row)
      } else {
        noId.push(row)
      }
    }
  }
  return [...byId.values(), ...noId]
}

type ScoredMemory = {
  row: CoachMemoryItemRow
  content: string
  key: string
  importance: number
  ageDays: number
  retention: number
}

// 2계층 회수: 활성(보존 점수 상위, 항상 탑재) + 되새김(나머지에서 현재 맥락 관련 시 소환).
function buildTieredCoachMemory(
  rows: CoachMemoryItemRow[],
  selectedRun: RunLogRow | null,
  userNote: string,
  options?: {
    activeGoal: unknown
    activeInjuryItem: unknown
    coachBeliefs: CoachBelief[]
    runnerIdentity: ReturnType<typeof getRunnerIdentity>
  }
): { coreMemoryItems: string[]; coachMemoryItems: string[]; referencedIds: string[] } {
  const today = currentDateInSeoul()
  const seen = new Set<string>()
  const items: ScoredMemory[] = []
  for (const row of rows) {
    const content = truncateText(row.content, 260)
    if (!content || !looksLikeDurableMemory(content)) continue
    const key = normalizeMemoryKey(content)
    if (seen.has(key)) continue
    seen.add(key)
    const ageDays = Math.max(0, diffDays(String(row.created_at).slice(0, 10), today))
    const importance = normalizeImportance(row.importance)
    items.push({ row, content, key, importance, ageDays, retention: memoryRetentionScore(importance, ageDays) })
  }

  // 활성: 보존 점수 임계 이상 중 상위 6개(항상 탑재).
  const active = items
    .filter((x) => x.retention >= 6)
    .sort((a, b) => b.retention - a.retention)
    .slice(0, 6)
  const activeKeys = new Set(active.map((x) => x.key))

  // 되새김: 활성 제외 + 아직 잊히지 않은(retention>0) 것 중 현재 맥락 관련도 높은 것만 소환.
  const contextTags = collectMemoryContextTags(selectedRun, userNote, options)
  const recalled = items
    .filter((x) => !activeKeys.has(x.key) && x.retention > 0)
    .map((x, index) => ({ x, rel: scoreMemoryItem(x.content, String(x.row.created_at), contextTags, index) }))
    .filter((e) => e.rel >= 8)
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 10)

  const referencedIds = [
    ...active.map((x) => x.row.id),
    ...recalled.map((e) => e.x.row.id)
  ].filter((id): id is string => Boolean(id))

  return {
    coreMemoryItems: active.map((x) => x.content),
    coachMemoryItems: recalled.map((e) => e.x.content),
    referencedIds
  }
}

function normalizeMemoryItems(items: string[], existingItems: string[]) {
  const existingKeys = new Set(existingItems.map(normalizeMemoryKey))
  const nextKeys = new Set<string>()
  const normalized: string[] = []

  for (const raw of items) {
    const content = truncateText(raw, 260)
    const key = normalizeMemoryKey(content)
    if (!content || nextKeys.has(key) || existingKeys.has(key)) continue
    if (!looksLikeDurableMemory(content)) continue
    nextKeys.add(key)
    normalized.push(content)
    if (normalized.length >= 3) break
  }

  return normalized
}

function scoreMemoryItem(content: string, createdAt: string, contextTags: Set<string>, index: number) {
  let score = 0
  const tags = extractContextTags(content)
  for (const tag of contextTags) {
    if (tags.has(tag)) score += 6
  }
  if (tags.size) score += 2
  if (containsAny(content, ['항상', '자주', '반복', '패턴', '성향', '기준', '전략', '루틴', '주의', '관리', '피해야'])) score += 4
  if (containsAny(content, ['더위', '햄스트링', '발바닥', '케이던스', '복식호흡', '와이프', '배우자', '롱런', 'LSD', 'Steady'])) score += 3

  const ageDays = Math.max(0, diffDays(createdAt.slice(0, 10), currentDateInSeoul()))
  if (ageDays <= 14) score += 3
  else if (ageDays <= 45) score += 2
  else if (ageDays <= 90) score += 1

  return score - Math.min(index, 20) * 0.05
}

function looksLikeDurableMemory(content: string) {
  const text = content.trim()
  if (text.length < 12) return false
  if (isOneOffSessionFact(text)) return false
  return containsAny(text, [
    '성향',
    '패턴',
    '반복',
    '기준',
    '전략',
    '루틴',
    '주의',
    '관리',
    '피해야',
    '우선',
    '더위',
    '햄스트링',
    '발바닥',
    '케이던스',
    '호흡',
    '와이프',
    '배우자',
    '동반',
    '회복',
    'LSD',
    'Steady',
    '롱런',
    '템포',
    // 자유대화 개인 맥락(#177): 목표/동기/선호/생활 맥락도 장기기억으로 통과시킨다.
    '목표',
    '동기',
    '선호',
    '좋아',
    '싫어',
    '도전',
    '하고 싶',
    '원하',
    '계획',
    '습관',
    '컨디션',
    '수면',
    '스트레스',
    '가족',
    '생활'
  ])
}

function isOneOffSessionFact(content: string) {
  const lower = content.toLowerCase()
  if (/(오늘|이번 세션|해당 세션|이 기록|이번 기록)/.test(content) && /\d+(\.\d+)?\s?(km|분|초|bpm|심박|페이스)/i.test(content)) return true
  if (/(잘했다|좋았다|무난했다|휴식|다음 훈련)/.test(content) && !containsAny(content, ['패턴', '성향', '기준', '전략', '주의'])) return true
  if (/^\d{4}-\d{2}-\d{2}/.test(lower)) return true
  return false
}

function normalizeMemoryKey(content: string) {
  return content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 120)
}

function containsAny(value: string, keywords: string[]) {
  const lower = value.toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()))
}

function buildSimilarPastCoachSnippets(selectedRun: RunLogRow | null, runs: RunLogRow[], reports: CoachReportRow[]) {
  if (!selectedRun) return []
  const runsById = new Map(runs.map((run) => [run.id, run]))
  const selectedWeekday = parseDateOnly(selectedRun.date).getUTCDay()
  const selectedTags = extractContextTags(`${selectedRun.session_title ?? ''} ${selectedRun.type} ${selectedRun.memo}`)

  return reports
    .filter((report) => report.selected_run_id && report.selected_run_id !== selectedRun.id)
    .map((report) => {
      const run = runsById.get(report.selected_run_id as string)
      if (!run) return null
      const score = scoreSimilarRun(selectedRun, run, selectedWeekday, selectedTags, report.user_note)
      if (score <= 0) return null
      return {
        score,
        selectedRunId: report.selected_run_id,
        runDate: run.date,
        runDateDisplay: formatDateWithWeekday(run.date),
        runType: run.type,
        runTitle: run.session_title || run.type,
        distanceKm: run.distance_km,
        avgPaceSec: run.avg_pace_sec,
        avgHeartRate: run.avg_heart_rate,
        userNote: truncateText(report.user_note, 180),
        coachSummary: truncateText(report.report, 700),
        createdAtDisplay: formatDateTimeWithWeekday(report.created_at)
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score: _score, ...item }) => item)
}

function scoreSimilarRun(selectedRun: RunLogRow, run: RunLogRow, selectedWeekday: number, selectedTags: Set<string>, userNote: string) {
  let score = 0
  if (run.type === selectedRun.type) score += 5
  if (sessionGroup(run.type) === sessionGroup(selectedRun.type)) score += 3
  if (parseDateOnly(run.date).getUTCDay() === selectedWeekday) score += 1

  const selectedDistance = Number(selectedRun.distance_km)
  const distance = Number(run.distance_km)
  if (Number.isFinite(selectedDistance) && Number.isFinite(distance)) {
    const diff = Math.abs(selectedDistance - distance)
    if (diff <= 1) score += 3
    else if (diff <= 3) score += 2
    else if (diff <= 5) score += 1
  }

  const tags = extractContextTags(`${run.session_title ?? ''} ${run.type} ${run.memo} ${userNote}`)
  for (const tag of selectedTags) {
    if (tags.has(tag)) score += 2
  }

  return score
}

function sessionGroup(type: string) {
  if (['LSD', 'Steady Long'].includes(type)) return 'long'
  if (['Easy', 'Recovery', 'Easy + Strides'].includes(type)) return 'easy'
  if (['Tempo', 'Race'].includes(type)) return 'quality'
  return type
}

function extractContextTags(value: string) {
  const tags = new Set<string>()
  const lower = value.toLowerCase()
  const checks: Array<[string, string[]]> = [
    ['partner_run', ['와이프', '배우자', '동반']],
    ['recovery', ['회복', 'recovery']],
    ['foot_pain', ['발바닥', '족저', 'foot']],
    ['hamstring', ['햄스트링', 'hamstring']],
    ['heat', ['더위', '덥', '30도', 'heat']],
    ['stride', ['스트라이드', 'stride']],
    ['tempo', ['템포', 'tempo']],
    ['long_run', ['롱런', 'lsd', 'long', 'steady']]
  ]
  for (const [tag, keywords] of checks) {
    if (keywords.some((keyword) => lower.includes(keyword))) tags.add(tag)
  }
  return tags
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trim()}...`
}

function getWeeklyRunDaysTarget(memory: unknown): number | null {
  if (!memory || typeof memory !== 'object') return null
  const profile = (memory as Record<string, unknown>).athleteProfile
  if (!profile || typeof profile !== 'object') return null
  const value = (profile as Record<string, unknown>).weeklyRunDaysTarget
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 14 ? Math.round(value) : null
}

function getAgeLoadWeightForCoach(memory: unknown, currentDate: string): number {
  if (!memory || typeof memory !== 'object') return 0
  const profile = (memory as Record<string, unknown>).athleteProfile
  if (!profile || typeof profile !== 'object') return 0
  const birthYear = (profile as Record<string, unknown>).birthYear
  if (typeof birthYear !== 'number' || !Number.isFinite(birthYear)) return 0
  const age = Number(currentDate.slice(0, 4)) - birthYear
  if (age < 18 || age > 100) return 0
  if (age < 40) return 0
  if (age < 50) return 1
  if (age < 60) return 2
  return 3
}

// 개인 심박 기준에서 템포/이지/회복 상한을 파생한다. (웹 src/shared/lib/heartRateZones.ts deriveHeartRateModel과 동일 공식)
// 우선순위: heartRateMode=manual이면 lactateThresholdHr > 측정 maxHeartRate, 아니면 추천(Tanaka 나이 + 누적 관측 HRmax 보정) > 근거부족 시 null.
// 165 같은 개인 상수는 코드에 두지 않는다. 36세는 공식상 anchor≈165가 자연 산출된다.
const COACH_LT_FRACTION_OF_MAX = 0.9
// 안정심박이 있으면 Karvonen(HRR) 기반 역치 추정 계수(역치/템포 ~80~90% HRR, 중앙값 0.85).
const COACH_LT_FRACTION_OF_HRR = 0.85
// 존 상단 경계를 anchor(LTHR)의 비율로 정의(%LTHR). 특정 bpm 상수가 아니다.
const COACH_EASY_FRACTION_OF_LTHR = 0.88
const COACH_RECOVERY_FRACTION_OF_LTHR = 0.79

// 최대심박에서 역치심박을 추정. 안정심박이 있으면 Karvonen(HRR), 없으면 %HRmax.
function coachLtAnchorFromMax(maxHr: number, restingHr: number | null): number {
  if (restingHr !== null && restingHr < maxHr) {
    return Math.round(COACH_LT_FRACTION_OF_HRR * (maxHr - restingHr) + restingHr)
  }
  return Math.round(maxHr * COACH_LT_FRACTION_OF_MAX)
}

type CoachHeartRateModel = {
  tempoCeilingBpm: number | null
  easyCeilingBpm: number | null
  recoveryCeilingBpm: number | null
  estimatedMaxHr: number | null
  observedMaxHr: number | null
  restingHeartRate: number | null
  source: 'lthr' | 'measured_max' | 'observed_data' | 'age_estimated' | 'age_data_corrected' | 'insufficient'
}

// 처방/루틴 텍스트에 과거 개발자 상수로 박힌 심박 상한(회복 130 / 이지 145 / 템포 165·168)을 일반 표현으로 치환한다.
// (웹 src/entities/training-memory/model.ts stripStaleHeartRateCeilings와 동일 규칙) 실제 숫자는 heartRateModel에서 가져온다.
const STALE_COACH_HR_CEILINGS = new Map<string, string>([
  ['130', '회복 상한'],
  ['145', '이지 상한'],
  ['165', '템포 상한'],
  ['168', '템포 상한']
])
function stripStaleHrCeilings(text: unknown): string {
  if (typeof text !== 'string' || !/\d/.test(text)) return typeof text === 'string' ? text : ''
  return text
    .replace(/(\d{2,3})\s*bpm/gi, (match, num: string) => STALE_COACH_HR_CEILINGS.get(num) ?? match)
    .replace(/((?:최대\s*)?심박|max\s*hr)\s*(\d{2,3})/gi, (match, keyword: string, num: string) =>
      STALE_COACH_HR_CEILINGS.has(num) ? `${keyword} ${STALE_COACH_HR_CEILINGS.get(num)}` : match)
    .replace(/(\d{2,3})(\s*(?:이하|초과|상한)|\s*를?\s*넘기?지?)/g, (match, num: string, rest: string) =>
      STALE_COACH_HR_CEILINGS.has(num) ? `${STALE_COACH_HR_CEILINGS.get(num)}${rest}` : match)
}
function stripStaleHrList(value: unknown): unknown {
  return Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? stripStaleHrCeilings(item) : item)) : value
}
// 컨텍스트로 AI에 보내기 전, 저장된 처방/루틴 텍스트의 stale 심박 숫자를 제거해 165 잔재가 코칭에 재등장하지 않게 한다.
function sanitizeMemoryHeartRateCeilings(memory: unknown): unknown {
  if (!memory || typeof memory !== 'object') return memory
  const mem = memory as Record<string, unknown>
  if (Array.isArray(mem.weeklyPattern)) mem.weeklyPattern = stripStaleHrList(mem.weeklyPattern)
  const atp = mem.adaptiveTrainingProfile as Record<string, unknown> | undefined
  if (atp && typeof atp === 'object') {
    if (Array.isArray(atp.prescriptionTemplates)) {
      atp.prescriptionTemplates = atp.prescriptionTemplates.map((tpl) => {
        if (!tpl || typeof tpl !== 'object') return tpl
        const t = tpl as Record<string, unknown>
        return {
          ...t,
          purpose: stripStaleHrCeilings(t.purpose),
          workout: stripStaleHrList(t.workout),
          avoidWhen: stripStaleHrList(t.avoidWhen),
          progressionTrigger: stripStaleHrCeilings(t.progressionTrigger)
        }
      })
    }
    if (Array.isArray(atp.progressionCriteria)) {
      atp.progressionCriteria = atp.progressionCriteria.map((crit) => {
        if (!crit || typeof crit !== 'object') return crit
        const c = crit as Record<string, unknown>
        return { ...c, evidence: stripStaleHrCeilings(c.evidence), action: stripStaleHrCeilings(c.action) }
      })
    }
    if (Array.isArray(atp.sessionGuides)) {
      atp.sessionGuides = atp.sessionGuides.map((g) => {
        if (!g || typeof g !== 'object') return g
        const s = g as Record<string, unknown>
        return { ...s, boundary: stripStaleHrCeilings(s.boundary), evidence: stripStaleHrCeilings(s.evidence) }
      })
    }
    if (Array.isArray(atp.compliancePatterns)) atp.compliancePatterns = stripStaleHrList(atp.compliancePatterns)
  }
  return mem
}

function normalizeCoachBpm(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  const rounded = Math.round(num)
  return rounded >= 30 && rounded <= 240 ? rounded : null
}

// 누적 RunLog의 max_heart_rate에서 강건한 관측 최대심박을 추정한다(표본 3개↑, 4개↑면 최고값 1개는 센서 튐으로 제외).
function deriveCoachObservedMaxHr(runs: RunLogRow[]): number | null {
  const values = runs
    .map((run) => normalizeCoachBpm(run.max_heart_rate))
    .filter((value): value is number => value !== null && value >= 120)
    .sort((a, b) => b - a)
  if (values.length < 3) return null
  return values.length >= 4 ? values[1] : values[0]
}

function coachModelFromAnchor(
  anchor: number | null,
  partial: Omit<CoachHeartRateModel, 'tempoCeilingBpm' | 'easyCeilingBpm' | 'recoveryCeilingBpm'>
): CoachHeartRateModel {
  if (anchor === null) {
    return { tempoCeilingBpm: null, easyCeilingBpm: null, recoveryCeilingBpm: null, ...partial }
  }
  return {
    tempoCeilingBpm: anchor,
    easyCeilingBpm: Math.round(COACH_EASY_FRACTION_OF_LTHR * anchor),
    recoveryCeilingBpm: Math.round(COACH_RECOVERY_FRACTION_OF_LTHR * anchor),
    ...partial
  }
}

function deriveCoachHeartRateModel(memory: unknown, currentDate: string, runs: RunLogRow[] = []): CoachHeartRateModel {
  const profile = memory && typeof memory === 'object'
    ? (memory as Record<string, unknown>).athleteProfile as Record<string, unknown> | undefined
    : undefined
  const restingHeartRate = normalizeCoachBpm(profile?.restingHeartRate)
  const mode = profile?.heartRateMode === 'manual' ? 'manual' : 'auto'

  // 직접입력(manual): LTHR > 측정 HRmax
  if (mode === 'manual') {
    const lthr = normalizeCoachBpm(profile?.lactateThresholdHr)
    const measuredMax = normalizeCoachBpm(profile?.maxHeartRate)
    if (lthr !== null) {
      return coachModelFromAnchor(lthr, { estimatedMaxHr: measuredMax, observedMaxHr: null, restingHeartRate, source: 'lthr' })
    }
    if (measuredMax !== null) {
      return coachModelFromAnchor(coachLtAnchorFromMax(measuredMax, restingHeartRate), {
        estimatedMaxHr: measuredMax, observedMaxHr: null, restingHeartRate, source: 'measured_max'
      })
    }
  }

  // 추천(auto): Tanaka 나이 베이스 + 누적 관측 HRmax로 상향 보정
  const birthYear = typeof profile?.birthYear === 'number' ? profile.birthYear as number : null
  const age = birthYear !== null ? Number(currentDate.slice(0, 4)) - birthYear : null
  const ageMax = age !== null && age >= 5 && age <= 100 ? Math.round(208 - 0.7 * age) : null
  const observedMaxHr = deriveCoachObservedMaxHr(runs)

  if (ageMax !== null && observedMaxHr !== null) {
    const corrected = Math.max(ageMax, observedMaxHr)
    return coachModelFromAnchor(coachLtAnchorFromMax(corrected, restingHeartRate), {
      estimatedMaxHr: corrected, observedMaxHr, restingHeartRate, source: observedMaxHr > ageMax ? 'age_data_corrected' : 'age_estimated'
    })
  }
  if (ageMax !== null) {
    return coachModelFromAnchor(coachLtAnchorFromMax(ageMax, restingHeartRate), {
      estimatedMaxHr: ageMax, observedMaxHr: null, restingHeartRate, source: 'age_estimated'
    })
  }
  if (observedMaxHr !== null) {
    return coachModelFromAnchor(coachLtAnchorFromMax(observedMaxHr, restingHeartRate), {
      estimatedMaxHr: observedMaxHr, observedMaxHr, restingHeartRate, source: 'observed_data'
    })
  }
  return coachModelFromAnchor(null, { estimatedMaxHr: null, observedMaxHr: null, restingHeartRate, source: 'insufficient' })
}

// VDOT 페이스 모델(보조). 웹 src/shared/lib/vdotPaces.ts와 동일 공식.
// 우선순위: PB/Race 환산(measured) > VO2max 추정(estimate, 1:1 보수적) > 없음(insufficient).
// 강도 권위는 항상 heartRateModel이며, 페이스는 그 하위 보조 신호로만 컨텍스트에 넣는다.
type CoachPaceModel = {
  vdot: number | null
  source: 'pb_measured' | 'vo2max_estimate' | 'insufficient'
  confidence: 'measured' | 'estimate' | 'none'
  thresholdPaceSec: number | null
  easyPaceRangeSec: [number, number] | null
  marathonPaceSec: number | null
  intervalPaceSec: number | null
  basis: string | null
}

const COACH_VDOT_MIN_PB_KM = 3
const COACH_PACE_INTENSITY = { easiest: 0.62, hardest: 0.74, marathon: 0.84, threshold: 0.88, interval: 0.975 }

function coachVo2Cost(velocityMetersPerMin: number): number {
  return -4.6 + 0.182258 * velocityMetersPerMin + 0.000104 * velocityMetersPerMin * velocityMetersPerMin
}

function coachVelocityForVo2(vo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - vo2
  const disc = b * b - 4 * a * c
  if (disc <= 0) return 0
  return (-b + Math.sqrt(disc)) / (2 * a)
}

function coachFractionalVo2Max(durationMin: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * durationMin) + 0.2989558 * Math.exp(-0.1932605 * durationMin)
}

function coachVdotFromPerformance(distanceKm: number, durationSec: number): number | null {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationSec) || distanceKm <= 0 || durationSec <= 0) return null
  const minutes = durationSec / 60
  const velocity = (distanceKm * 1000) / minutes
  const pct = coachFractionalVo2Max(minutes)
  if (pct <= 0) return null
  const vdot = coachVo2Cost(velocity) / pct
  if (!Number.isFinite(vdot) || vdot <= 0) return null
  return Math.round(Math.min(90, Math.max(20, vdot)) * 10) / 10
}

function coachPaceAt(vdot: number, fraction: number): number | null {
  const velocity = coachVelocityForVo2(vdot * fraction)
  if (velocity <= 0) return null
  return Math.round(60000 / velocity)
}

function deriveCoachPaceModel(memory: unknown): CoachPaceModel {
  const insufficient: CoachPaceModel = {
    vdot: null, source: 'insufficient', confidence: 'none',
    thresholdPaceSec: null, easyPaceRangeSec: null, marathonPaceSec: null, intervalPaceSec: null, basis: null
  }
  const profile = memory && typeof memory === 'object'
    ? (memory as Record<string, unknown>).athleteProfile as Record<string, unknown> | undefined
    : undefined
  if (!profile) return insufficient

  // PB 환산(measured) 우선: 기준 거리 이상 PB 중 가장 높은 VDOT.
  const personalBests = Array.isArray(profile.personalBests) ? profile.personalBests as Record<string, unknown>[] : []
  let best: { vdot: number; basis: string } | null = null
  for (const pb of personalBests) {
    const distanceKm = typeof pb.distanceKm === 'number' ? pb.distanceKm : Number(pb.distanceKm)
    const durationSec = typeof pb.durationSec === 'number' ? pb.durationSec : Number(pb.durationSec)
    if (!Number.isFinite(distanceKm) || distanceKm < COACH_VDOT_MIN_PB_KM || !Number.isFinite(durationSec) || durationSec <= 0) continue
    const vdot = coachVdotFromPerformance(distanceKm, durationSec)
    if (vdot === null) continue
    if (!best || vdot > best.vdot) best = { vdot, basis: `PB ${distanceKm.toFixed(2)}km 환산` }
  }
  if (best) return buildCoachPaceModel(best.vdot, 'pb_measured', 'measured', best.basis)

  // VO2max 추정(estimate): 1:1 근사, 현실 범위만.
  const vo2Max = typeof profile.vo2Max === 'number' ? profile.vo2Max : Number(profile.vo2Max)
  if (Number.isFinite(vo2Max) && vo2Max >= 15 && vo2Max <= 95) {
    const vdot = Math.round(Math.min(90, Math.max(20, vo2Max)) * 10) / 10
    return buildCoachPaceModel(vdot, 'vo2max_estimate', 'estimate', `HealthKit VO2max ${vdot} 추정`)
  }
  return insufficient
}

function buildCoachPaceModel(
  vdot: number,
  source: CoachPaceModel['source'],
  confidence: CoachPaceModel['confidence'],
  basis: string
): CoachPaceModel {
  const easySlow = coachPaceAt(vdot, COACH_PACE_INTENSITY.easiest)
  const easyFast = coachPaceAt(vdot, COACH_PACE_INTENSITY.hardest)
  return {
    vdot,
    source,
    confidence,
    thresholdPaceSec: coachPaceAt(vdot, COACH_PACE_INTENSITY.threshold),
    easyPaceRangeSec: easySlow !== null && easyFast !== null ? [easySlow, easyFast] : null,
    marathonPaceSec: coachPaceAt(vdot, COACH_PACE_INTENSITY.marathon),
    intervalPaceSec: coachPaceAt(vdot, COACH_PACE_INTENSITY.interval),
    basis
  }
}

function withinDaysFromAnchor(runs: RunLogRow[], days: number, anchorDate: string) {
  const anchor = parseDateOnly(anchorDate)
  const cutoff = new Date(anchor)
  cutoff.setDate(cutoff.getDate() - days + 1)
  return runs.filter((run) => {
    const date = parseDateOnly(run.date)
    return date >= cutoff && date <= anchor
  })
}

function afterDate(runs: RunLogRow[], dateText: string) {
  const selectedDate = parseDateOnly(dateText)
  return runs.filter((run) => parseDateOnly(run.date) > selectedDate)
}

function getGoals(memory: unknown): unknown[] {
  if (!memory || typeof memory !== 'object') return []
  const goals = (memory as { goals?: unknown }).goals
  return Array.isArray(goals) ? goals : []
}

function getActiveGoal(memory: unknown, goals: unknown[]) {
  if (!memory || typeof memory !== 'object') return goals[0] ?? null
  const activeGoalId = (memory as { activeGoalId?: unknown }).activeGoalId
  const activeGoal = goals.find((goal) => {
    return goal && typeof goal === 'object' && (goal as { id?: unknown }).id === activeGoalId
  })
  return activeGoal ?? goals[0] ?? null
}

function getPerformanceProjection(runs: RunLogRow[], activeGoal: unknown) {
  const targetDistanceKm = getNullableNumber(activeGoal, 'distanceKm')
  if (!targetDistanceKm || targetDistanceKm <= 0) return null
  const targetDurationSec = getNullableNumber(activeGoal, 'targetDurationSec')
  const signals = runs
    .filter((run) => run.duration_sec && run.distance_km >= 3)
    .map((run) => {
      const confidence = getProjectionConfidence(run)
      if (confidence === 'low' || !run.duration_sec) return null
      const projectedSec = Math.round(run.duration_sec * (targetDistanceKm / run.distance_km) ** 1.06)
      if (!Number.isFinite(projectedSec) || projectedSec <= 0) return null
      return {
        runId: run.id,
        date: run.date,
        dateDisplay: formatDateWithWeekday(run.date),
        type: run.type,
        distanceKm: run.distance_km,
        durationSec: run.duration_sec,
        projectedSec,
        projectedText: formatDurationText(projectedSec),
        confidence
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.date.localeCompare(a.date))

  if (!signals.length) {
    return {
      targetDistanceKm,
      targetDurationSec,
      status: 'insufficient_data',
      policy: 'Race, Tempo, Steady Long 또는 RPE 7 이상 기록이 충분할 때만 예상 기록을 보조 근거로 사용한다.'
    }
  }

  const current = signals[0]
  const previous = signals.slice(1).find((signal) => signal.date < current.date) ?? null
  const deltaSec = previous ? current.projectedSec - previous.projectedSec : null
  return {
    targetDistanceKm,
    targetDurationSec,
    targetText: targetDurationSec ? formatDurationText(targetDurationSec) : null,
    status: 'available',
    current,
    previous,
    deltaSec,
    trend: deltaSec === null ? 'baseline' : deltaSec < 0 ? 'improving' : deltaSec > 0 ? 'slower' : 'flat',
    policy:
      'Riegel 계열 거리 환산을 참고하되 예측 하나만으로 루틴을 바꾸지 않는다. 최근 7/14/30일 흐름, 회복, 부상, 루틴 소화율과 함께 본다.'
  }
}

function getProjectionConfidence(run: RunLogRow): 'high' | 'medium' | 'low' {
  if (run.type === 'Race') return 'high'
  if (run.type === 'Tempo' && run.distance_km >= 4) return 'medium'
  if (run.type === 'Steady Long' && run.distance_km >= 8) return 'medium'
  if (run.rpe !== null && run.rpe >= 7 && run.distance_km >= 4) return 'medium'
  return 'low'
}

function getNullableNumber(source: unknown, key: string) {
  if (!source || typeof source !== 'object') return null
  const value = (source as Record<string, unknown>)[key]
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatDurationText(totalSec: number) {
  const sec = Math.max(0, Math.round(totalSec))
  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  const seconds = sec % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getInjuryItems(memory: unknown): unknown[] {
  if (!memory || typeof memory !== 'object') return []
  const injuryItems = (memory as { injuryItems?: unknown }).injuryItems
  return Array.isArray(injuryItems) ? injuryItems : []
}

function inCurrentMonth(runs: RunLogRow[]) {
  const now = parseDateOnly(currentDateInSeoul())
  const year = now.getFullYear()
  const month = now.getMonth()
  return runs.filter((run) => {
    const date = parseDateOnly(run.date)
    return date.getFullYear() === year && date.getMonth() === month
  })
}

function currentDateInSeoul() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

function decorateRunDate<T extends RunLogRow | null>(run: T): T extends RunLogRow ? RunLogRow & { dateDisplay: string } : null {
  if (!run) return null as T extends RunLogRow ? RunLogRow & { dateDisplay: string } : null
  return {
    ...run,
    dateDisplay: formatDateWithWeekday(run.date)
  } as unknown as T extends RunLogRow ? RunLogRow & { dateDisplay: string } : null
}

function summarizeRunForCoach(run: RunLogRow | null) {
  if (!run) return null
  return {
    id: run.id,
    externalId: run.external_id,
    sessionTitle: run.session_title,
    date: run.date,
    dateDisplay: formatDateWithWeekday(run.date),
    type: run.type,
    distanceKm: run.distance_km,
    durationSec: run.duration_sec,
    durationDisplay: formatDurationText(run.duration_sec ?? 0),
    avgPaceSec: run.avg_pace_sec,
    avgPaceDisplay: formatPaceForCoach(run.avg_pace_sec),
    avgHeartRate: run.avg_heart_rate,
    maxHeartRate: run.max_heart_rate,
    cadence: run.cadence,
    activeEnergyKcal: run.active_energy_kcal,
    weather: {
      temperature: run.temperature,
      humidity: run.humidity,
      windMps: run.wind_mps
    },
    elevation: {
      gainM: run.elevation_gain_m,
      lossM: run.elevation_loss_m
    },
    courseType: run.course_type,
    rpe: run.rpe,
    workoutFeeling: run.workout_feeling,
    painNote: run.pain_note,
    sleepQuality: run.sleep_quality,
    conditionScore: run.condition_score,
    stressLevel: run.stress_level,
    companion: run.companion,
    memo: truncateText(run.memo, 500),
    tags: run.tags,
    source: run.source,
    dataAvailability: {
      laps: Array.isArray(run.laps) ? run.laps.length : 0,
      fastSegments: Array.isArray(run.fast_segments) ? run.fast_segments.length : 0,
      metricSamples: Array.isArray(run.metric_samples) ? run.metric_samples.length : 0,
      routePoints: Array.isArray(run.route_points) ? run.route_points.length : 0
    }
  }
}

type LapMetric = {
  index: number
  distanceKm: number | null
  paceSec: number | null
  paceDisplay: string | null
  avgHeartRate: number | null
  cadence: number | null
}

function buildLapProgressionAnalysis(run: RunLogRow | null, tempoHeartRateCeilingBpm: number | null = null) {
  if (!run) return null
  const lapMetrics = normalizeLapMetrics(run.laps)
  const metricSampleMetrics = normalizeMetricSampleMetrics(run.metric_samples)
  const laps = metricSampleMetrics.length >= 4 ? metricSampleMetrics : lapMetrics
  if (!laps.length) {
    return {
      available: false,
      reason: '구간 데이터가 없어 평균 페이스/평균 심박 중심으로만 볼 수 있다.'
    }
  }

  const paceLaps = laps.filter((lap) => lap.paceSec !== null)
  const heartRateLaps = laps.filter((lap) => lap.avgHeartRate !== null)
  const cadenceLaps = laps.filter((lap) => lap.cadence !== null)
  const firstHalf = laps.slice(0, Math.ceil(laps.length / 2))
  const secondHalf = laps.slice(Math.ceil(laps.length / 2))
  const firstHalfPaceSec = weightedLapPace(firstHalf)
  const secondHalfPaceSec = weightedLapPace(secondHalf)
  const firstHalfHeartRate = averageLapValue(firstHalf, 'avgHeartRate')
  const secondHalfHeartRate = averageLapValue(secondHalf, 'avgHeartRate')
  const heartRateDriftBpm = firstHalfHeartRate !== null && secondHalfHeartRate !== null
    ? Math.round(secondHalfHeartRate - firstHalfHeartRate)
    : null
  const paceDeltaSec = firstHalfPaceSec !== null && secondHalfPaceSec !== null
    ? Math.round(secondHalfPaceSec - firstHalfPaceSec)
    : null
  const maxLapHeartRate = heartRateLaps.reduce<number | null>((max, lap) => {
    if (lap.avgHeartRate === null) return max
    return max === null ? lap.avgHeartRate : Math.max(max, lap.avgHeartRate)
  }, null)
  const lapsOverTempoCeiling = heartRateLaps
    .filter((lap) => tempoHeartRateCeilingBpm !== null && (lap.avgHeartRate ?? 0) > tempoHeartRateCeilingBpm)
    .map((lap) => ({ index: lap.index, avgHeartRate: lap.avgHeartRate }))
  const cadenceValues = cadenceLaps.map((lap) => lap.cadence).filter((value): value is number => value !== null)

  return {
    available: true,
    source: metricSampleMetrics.length >= 4 ? 'metric_samples' : 'laps',
    lapCount: laps.length,
    laps,
    paceFlowDisplay: buildFlow(paceLaps.map((lap) => lap.paceDisplay).filter((value): value is string => Boolean(value))),
    heartRateFlowDisplay: buildFlow(heartRateLaps.map((lap) => lap.avgHeartRate).filter((value): value is number => value !== null).map(String)),
    cadenceRangeDisplay: cadenceValues.length ? `${Math.min(...cadenceValues)}~${Math.max(...cadenceValues)}` : null,
    firstHalf: {
      avgPaceSec: firstHalfPaceSec,
      avgPaceDisplay: formatPaceForCoach(firstHalfPaceSec),
      avgHeartRate: firstHalfHeartRate === null ? null : Math.round(firstHalfHeartRate)
    },
    secondHalf: {
      avgPaceSec: secondHalfPaceSec,
      avgPaceDisplay: formatPaceForCoach(secondHalfPaceSec),
      avgHeartRate: secondHalfHeartRate === null ? null : Math.round(secondHalfHeartRate)
    },
    paceDeltaSecSecondHalfMinusFirstHalf: paceDeltaSec,
    heartRateDriftBpmSecondHalfMinusFirstHalf: heartRateDriftBpm,
    paceTrend: describePaceTrend(paceDeltaSec),
    heartRateQuality: describeHeartRateQuality(heartRateDriftBpm),
    maxLapHeartRate,
    tempoHeartRateCeilingBpm,
    lapHeartRatesOverTempoCeiling: lapsOverTempoCeiling,
    startControlHint: describeStartControl(laps, run.avg_pace_sec),
    interpretationHints: [
      'paceFlowDisplay와 heartRateFlowDisplay를 함께 보고 페이스 상승이 심박 폭발로 이어졌는지 확인한다.',
      '초반 구간이 평균보다 과하게 빠르고 심박도 빠르게 오르면 서둘러 시작한 것으로 본다.',
      '후반 페이스가 빨라져도 심박 상승이 작으면 잘 눌러 시작해 품질이 좋은 흐름으로 본다.',
      '템포/품질훈련은 tempoHeartRateCeilingBpm 초과 구간이 있는지 확인한다.'
    ]
  }
}

const COACH_DEFAULT_HEART_RATE_MODEL: CoachHeartRateModel = {
  tempoCeilingBpm: null,
  easyCeilingBpm: null,
  recoveryCeilingBpm: null,
  estimatedMaxHr: null,
  observedMaxHr: null,
  restingHeartRate: null,
  source: 'insufficient'
}

function buildSessionExecutionGuide(run: RunLogRow | null, activeGoal: unknown, hr: CoachHeartRateModel = COACH_DEFAULT_HEART_RATE_MODEL) {
  if (!run) return null
  const type = run.type
  const targetPaceSec = getGoalPaceSec(activeGoal)
  const tempo = hr.tempoCeilingBpm
  const easyCeiling = hr.easyCeilingBpm
  const recoveryCeiling = hr.recoveryCeilingBpm
  const personalizedNote = hr.source === 'insufficient'
    ? '개인 심박 기준 미설정(나이/심박 입력 필요) → 심박 상한 없이 페이스/RPE/드리프트로 평가.'
    : `개인 심박 기준(${hr.source}) 기반 환산값.`
  const common = {
    runType: type,
    purpose: '선택 세션을 평가할 때 구간별 페이스/심박 경계를 보는 기준이다. 사용자의 목표와 누적 반응에 따라 코칭에서 유지/조정될 수 있다.',
    heartRateModelSource: hr.source,
    updateRule:
      '같은 유형의 세션이 2~3주 이상 안정적으로 소화되고 회복/부상 신호가 좋으면 경계를 소폭 상향할 수 있다. 반대로 심박/RPE/통증이 반복적으로 높으면 경계를 낮춘다.'
  }

  if (type === 'Tempo') {
    return {
      ...common,
      primaryMetric: tempo === null ? 'pace_and_drift' : 'heart_rate_ceiling',
      boundaries: {
        heartRateCeilingBpm: tempo,
        paceRule: tempo === null
          ? `심박 상한이 미설정이다. (${personalizedNote}) 템포 품질은 페이스 흐름과 후반 안정으로 본다.`
          : `페이스는 보조 지표다. 템포 처방의 핵심은 max HR ${tempo}bpm을 넘기지 않는 것이다. (${personalizedNote})`,
        targetPaceSecPerKm: targetPaceSec,
        targetPaceDisplay: targetPaceSec ? formatPaceForCoach(targetPaceSec) : null,
        allowedLapInterpretation: tempo === null
          ? '심박 상한 없이, 초반 오버페이스 여부와 후반 페이스/심박 드리프트로 품질을 본다. 사용자에게 나이 또는 심박 입력을 권한다.'
          : `템포 구간은 ${tempo}bpm 상한을 넘겼는지 먼저 본다. 후반 페이스가 빨라져도 심박이 ${tempo}를 넘지 않으면 품질이 좋고, 넘겼다면 다음 템포는 초반 진입을 낮춘다.`
      }
    }
  }

  if (type === 'Easy' || type === 'Recovery') {
    return {
      ...common,
      primaryMetric: (type === 'Recovery' ? recoveryCeiling : easyCeiling) === null ? 'pace_and_feel' : 'heart_rate',
      boundaries: {
        easyHeartRateCeilingBpm: type === 'Recovery' ? recoveryCeiling : easyCeiling,
        recoveryHeartRateCeilingBpm: recoveryCeiling,
        maxHeartRateRule: (type === 'Recovery' ? recoveryCeiling : easyCeiling) === null
          ? `${type} 심박 상한 미설정. (${personalizedNote}) 페이스와 RPE, 심박이 안정적인지로 본다.`
          : type === 'Recovery'
            ? `Recovery는 평균뿐 아니라 max/lap 심박도 ${recoveryCeiling} 근처에서 조용한지 본다. (${personalizedNote})`
            : `Easy는 평균보다 max/lap 심박이 ${easyCeiling}bpm을 넘지 않았는지 먼저 본다. (${personalizedNote})`,
        paceRule: '페이스는 보조 지표다. 심박이 낮고 RPE가 낮으면 페이스가 조금 빨라져도 Easy/Recovery로 볼 수 있다.',
        allowedLapInterpretation:
          '후반 페이스 상승보다 심박 안정성을 우선한다. 심박이 낮게 유지되면 잘 눌렀다고 본다.'
      }
    }
  }

  if (type === 'Easy + Strides') {
    return {
      ...common,
      primaryMetric: 'pattern_then_recovery_heart_rate',
      boundaries: {
        pattern: '10분 워밍업 + 20초 가속/1분40초 회복 x8 + 15분 쿨다운',
        accelerationDurationToleranceSec: '6~45',
        recoveryWindowToleranceSec: '60~210',
        recoveryHeartRateRule: '가속 뒤 회복 구간에서 심박과 호흡이 내려오는지 본다.',
        allowedLapInterpretation:
          '구간 단위가 1km라면 스트라이드가 뭉개져 보일 수 있으므로 fast_segments와 심박 회복을 함께 본다.'
      }
    }
  }

  if (type === 'LSD' || type === 'Steady Long') {
    return {
      ...common,
      primaryMetric: 'heart_rate_drift_and_late_pace',
      boundaries: {
        heartRateDriftGoodBpm: '<= 8',
        heartRateDriftCautionBpm: '>= 12',
        paceRule: 'LSD는 페이스보다 낮은 심박 지속, Steady Long은 후반 steady 구간을 보되 심박 드리프트가 과하면 강도를 낮춘다.',
        allowedLapInterpretation:
          '후반 급락 없이 유지되고 심박 드리프트가 작으면 품질이 좋다. 후반 페이스를 올렸는데 심박이 크게 튀면 무리한 steady로 본다.'
      }
    }
  }

  return {
    ...common,
    primaryMetric: 'context_dependent',
    boundaries: {
      rule: '저장된 타입이 Unknown이면 구간 페이스, 심박, 요일 루틴, 메모로 실제 세션 성격을 먼저 재해석한다.'
    }
  }
}

function buildPrescriptionComplianceSignals(runs: RunLogRow[], hr: CoachHeartRateModel = COACH_DEFAULT_HEART_RATE_MODEL) {
  return runs.slice(0, 14).map((run) => {
    const analysis = buildLapProgressionAnalysis(run, hr.tempoCeilingBpm)
    const guide = buildSessionExecutionGuide(run, null, hr)
    return {
      id: run.id,
      date: run.date,
      dateDisplay: formatDateWithWeekday(run.date),
      type: run.type,
      distanceKm: run.distance_km,
      avgHeartRate: run.avg_heart_rate,
      maxHeartRate: run.max_heart_rate,
      rpe: run.rpe,
      compliance: classifyPrescriptionCompliance(run, analysis),
      paceTrend: analysis?.available ? analysis.paceTrend : 'unknown',
      heartRateQuality: analysis?.available ? analysis.heartRateQuality : 'unknown',
      heartRateDriftBpm: analysis?.available ? analysis.heartRateDriftBpmSecondHalfMinusFirstHalf : null,
      executionBoundary: guide?.boundaries ?? null
    }
  })
}

function classifyPrescriptionCompliance(
  run: RunLogRow,
  analysis: ReturnType<typeof buildLapProgressionAnalysis>,
  hr: CoachHeartRateModel = COACH_DEFAULT_HEART_RATE_MODEL
) {
  const type = run.type
  if (type === 'Tempo') {
    // 개인 심박 상한이 없으면 HR 게이트로 판정하지 않는다.
    if (hr.tempoCeilingBpm === null) return 'unknown_no_heart_rate'
    const overCeiling = analysis?.available ? (analysis.lapHeartRatesOverTempoCeiling ?? []).length : 0
    if (overCeiling > 1 || (run.max_heart_rate ?? 0) > hr.tempoCeilingBpm + 3) return 'missed_high_heart_rate'
    if (overCeiling === 1 || (run.max_heart_rate ?? 0) > hr.tempoCeilingBpm) return 'partial_late_heart_rate_rise'
    return 'met_heart_rate_ceiling'
  }

  if (type === 'Easy' || type === 'Recovery') {
    const ceiling = type === 'Recovery' ? hr.recoveryCeilingBpm : hr.easyCeilingBpm
    if (ceiling === null) return 'unknown_no_heart_rate'
    const avgHeartRate = run.avg_heart_rate
    const maxHeartRate = run.max_heart_rate
    if (avgHeartRate === null && maxHeartRate === null) return 'unknown_no_heart_rate'
    if ((maxHeartRate ?? avgHeartRate ?? 999) <= ceiling) return 'met_easy_heart_rate'
    if ((avgHeartRate ?? 999) <= ceiling && (maxHeartRate ?? 999) <= ceiling + 8) return 'partial_easy_heart_rate_late_spike'
    if ((avgHeartRate ?? 999) <= ceiling + 5 && (maxHeartRate ?? 999) <= ceiling + 12) return 'partial_easy_heart_rate'
    return 'missed_too_hard_for_easy'
  }

  if (type === 'LSD' || type === 'Steady Long') {
    const drift = analysis?.available ? analysis.heartRateDriftBpmSecondHalfMinusFirstHalf ?? null : null
    if (drift === null) return 'unknown_no_lap_drift'
    if (drift <= 8) return 'met_long_run_stability'
    if (drift <= 12) return 'partial_long_run_drift'
    return 'missed_large_long_run_drift'
  }

  if (type === 'Easy + Strides') {
    const fastSegments = Array.isArray(run.fast_segments) ? run.fast_segments.length : 0
    if (fastSegments >= 4) return 'met_stride_pattern_signal'
    return 'unknown_or_weak_stride_signal'
  }

  return 'unknown'
}

function normalizeLapMetrics(value: unknown): LapMetric[] {
  const laps = Array.isArray(value) ? value : []
  return laps
    .map((lap, index) => {
      const item = lap as { index?: unknown; distanceKm?: unknown; paceSec?: unknown; avgHeartRate?: unknown; cadence?: unknown }
      const distanceKm = nullablePositiveNumber(item.distanceKm)
      const paceSec = nullablePositiveNumber(item.paceSec)
      const avgHeartRate = nullablePositiveNumber(item.avgHeartRate)
      const cadence = nullablePositiveNumber(item.cadence)
      return {
        index: Number.isFinite(Number(item.index)) ? Number(item.index) : index + 1,
        distanceKm,
        paceSec,
        paceDisplay: formatPaceForCoach(paceSec),
        avgHeartRate: avgHeartRate === null ? null : Math.round(avgHeartRate),
        cadence: cadence === null ? null : Math.round(cadence)
      }
    })
    .filter((lap) => lap.paceSec !== null || lap.avgHeartRate !== null || lap.cadence !== null)
    .slice(0, 20)
}

function normalizeMetricSampleMetrics(value: unknown): LapMetric[] {
  const samples = Array.isArray(value) ? value : []
  const normalized = samples
    .map((sample) => {
      const item = sample as { offsetSec?: unknown; heartRate?: unknown; paceSec?: unknown; cadence?: unknown }
      return {
        offsetSec: nullablePositiveNumber(item.offsetSec) ?? 0,
        paceSec: nullablePositiveNumber(item.paceSec),
        avgHeartRate: nullablePositiveNumber(item.heartRate),
        cadence: nullablePositiveNumber(item.cadence)
      }
    })
    .filter((sample) => sample.paceSec !== null || sample.avgHeartRate !== null || sample.cadence !== null)
    .sort((a, b) => a.offsetSec - b.offsetSec)

  if (normalized.length < 4) return []
  const stride = Math.max(1, Math.ceil(normalized.length / 10))
  return normalized
    .filter((_, index) => index % stride === 0)
    .slice(0, 12)
    .map((sample, index) => ({
      index: index + 1,
      distanceKm: null,
      paceSec: sample.paceSec,
      paceDisplay: formatPaceForCoach(sample.paceSec),
      avgHeartRate: sample.avgHeartRate === null ? null : Math.round(sample.avgHeartRate),
      cadence: sample.cadence === null ? null : Math.round(sample.cadence)
    }))
}

function getGoalPaceSec(activeGoal: unknown) {
  const goal = activeGoal as { distanceKm?: unknown; targetDurationSec?: unknown } | null
  const distanceKm = Number(goal?.distanceKm)
  const durationSec = Number(goal?.targetDurationSec)
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) return null
  return Math.round(durationSec / distanceKm)
}

function buildFlow(values: string[]) {
  if (!values.length) return null
  if (values.length <= 8) return values.join(' → ')
  return [...values.slice(0, 4), '...', ...values.slice(-3)].join(' → ')
}

function weightedLapPace(laps: LapMetric[]) {
  const valid = laps.filter((lap) => lap.paceSec !== null)
  if (!valid.length) return null
  const weightedDistance = valid
    .filter((lap) => lap.distanceKm !== null && (lap.distanceKm ?? 0) > 0)
    .reduce((sum, lap) => sum + (lap.distanceKm ?? 0), 0)
  if (weightedDistance > 0) {
    const weightedSeconds = valid.reduce((sum, lap) => sum + (lap.paceSec ?? 0) * (lap.distanceKm ?? 0), 0)
    return Math.round(weightedSeconds / weightedDistance)
  }
  return Math.round(valid.reduce((sum, lap) => sum + (lap.paceSec ?? 0), 0) / valid.length)
}

function averageLapValue(laps: LapMetric[], key: 'avgHeartRate' | 'cadence') {
  const values = laps.map((lap) => lap[key]).filter((value): value is number => value !== null)
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function describePaceTrend(paceDeltaSec: number | null) {
  if (paceDeltaSec === null) return 'unknown'
  if (paceDeltaSec <= -12) return 'negative_split'
  if (paceDeltaSec >= 18) return 'late_fade'
  return 'even_or_controlled'
}

function describeHeartRateQuality(heartRateDriftBpm: number | null) {
  if (heartRateDriftBpm === null) return 'unknown'
  if (heartRateDriftBpm <= 4) return 'stable'
  if (heartRateDriftBpm <= 10) return 'moderate_rise'
  return 'large_drift'
}

function describeStartControl(laps: LapMetric[], avgPaceSec: number | null) {
  const first = laps.find((lap) => lap.paceSec !== null)
  if (!first?.paceSec || !avgPaceSec) return 'unknown'
  if (first.paceSec >= avgPaceSec + 20) return 'controlled_start'
  if (first.paceSec <= avgPaceSec - 20) return 'fast_start'
  return 'near_average_start'
}

function formatPaceForCoach(value: number | null) {
  if (!value || !Number.isFinite(value)) return null
  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)
  return `${minutes}분${String(seconds).padStart(2, '0')}초`
}

function formatDateWithWeekday(value: string | null | undefined) {
  if (!value) return '-'
  const dateText = value.slice(0, 10)
  const date = parseDateOnly(dateText)
  if (!Number.isFinite(date.getTime())) return value
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${dateText}(${weekdays[date.getUTCDay()]})`
}

function formatDateTimeWithWeekday(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value ?? '')
  if (!Number.isFinite(date.getTime())) return formatDateWithWeekday(value)
  const seoulDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
  const seoulTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
  return `${formatDateWithWeekday(seoulDate)} ${seoulTime}`
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function diffDays(from: string, to: string) {
  const diffMs = parseDateOnly(to).getTime() - parseDateOnly(from).getTime()
  return Math.round(diffMs / 86400000)
}

function describeTiming(ageDays: number | null) {
  if (ageDays === null) return 'unknown'
  if (ageDays === 0) return 'today'
  if (ageDays === 1) return 'yesterday'
  if (ageDays > 1) return 'past'
  return 'future'
}

function sumDistance(runs: RunLogRow[]) {
  return Math.round(runs.reduce((sum, run) => sum + Number(run.distance_km || 0), 0) * 100) / 100
}

function easyRatio(runs: RunLogRow[]) {
  const segments = runs.flatMap(getPaceSegments)
  const total = segments.reduce((sum, segment) => sum + segment.distanceKm, 0)
  if (!total) return 0
  const easy = segments.filter((segment) => segment.paceSec >= 390).reduce((sum, segment) => sum + segment.distanceKm, 0)
  return Math.round((easy / total) * 100)
}

function getPaceSegments(run: RunLogRow): Array<{ distanceKm: number; paceSec: number }> {
  const laps = Array.isArray(run.laps) ? run.laps : []
  const lapSegments = laps
    .map((lap) => {
      const item = lap as { distanceKm?: unknown; paceSec?: unknown }
      const distanceKm = Number(item.distanceKm)
      const paceSec = Number(item.paceSec)
      return Number.isFinite(distanceKm) && distanceKm > 0 && Number.isFinite(paceSec) ? { distanceKm, paceSec } : null
    })
    .filter((segment): segment is { distanceKm: number; paceSec: number } => Boolean(segment))

  if (lapSegments.length) return lapSegments
  const distanceKm = Number(run.distance_km)
  const paceSec = Number(run.avg_pace_sec)
  if (Number.isFinite(distanceKm) && distanceKm > 0 && Number.isFinite(paceSec)) return [{ distanceKm, paceSec }]
  return []
}

function safeJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function nullableNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function nullablePositiveNumber(value: unknown): number | null {
  const number = nullableNumber(value)
  return number !== null && number > 0 ? number : null
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

async function requireAppSession(admin: SupabaseAdminClient, req: Request, userId: string): Promise<{ ok: true } | { ok: false, status: number, error: string }> {
  const rawToken = req.headers.get('x-pacelab-app-session') ?? ''
  if (!rawToken) return { ok: false, status: 403, error: 'Missing app session' }

  const parsed = await verifyAppSessionToken(rawToken)
  if (!parsed.ok) return parsed
  if (parsed.userId !== userId) return { ok: false, status: 403, error: 'App session user mismatch' }
  if (Date.parse(parsed.expiresAt) <= Date.now()) return { ok: false, status: 403, error: 'App session expired' }

  const tokenHash = await sha256Hex(rawToken)
  const { data, error } = await admin
    .from('app_sessions')
    .select('id, expires_at, revoked_at')
    .eq('user_id', userId)
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!data || data.revoked_at) return { ok: false, status: 403, error: 'App session is not active' }
  if (Date.parse(data.expires_at) <= Date.now()) return { ok: false, status: 403, error: 'App session expired' }
  return { ok: true }
}

async function verifyAppSessionToken(token: string): Promise<{ ok: true, userId: string, expiresAt: string } | { ok: false, status: number, error: string }> {
  const parts = token.split('~')
  if (parts.length !== 6 || parts[0] !== 'v1') return { ok: false, status: 403, error: 'Invalid app session format' }
  const payload = parts.slice(0, 5).join('~')
  const expected = await hmacSha256Base64Url(requiredEnv('APP_SESSION_HMAC_SECRET'), payload)
  if (!timingSafeEqual(expected, parts[5])) return { ok: false, status: 403, error: 'Invalid app session signature' }
  return { ok: true, userId: parts[1], expiresAt: parts[2] }
}

async function consumeRateLimit(admin: SupabaseAdminClient, userId: string, functionName: string): Promise<{ ok: true } | { ok: false, error: string, retryAfterSec: number }> {
  const limit = positiveIntegerEnv('COACH_RUN_RATE_LIMIT_PER_HOUR', 12)
  const windowStart = new Date()
  windowStart.setMinutes(0, 0, 0)
  const windowStartIso = windowStart.toISOString()
  const nextWindow = new Date(windowStart.getTime() + 60 * 60 * 1000)
  const retryAfterSec = Math.max(1, Math.ceil((nextWindow.getTime() - Date.now()) / 1000))

  const { data, error } = await admin.rpc('consume_edge_function_rate_limit', {
    p_user_id: userId,
    p_function_name: functionName,
    p_window_start: windowStartIso,
    p_limit: limit
  })
  if (error) throw error

  const currentCount = typeof data === 'number' ? data : Number(data)
  if (!Number.isFinite(currentCount)) throw new Error('Invalid rate limit counter')
  if (currentCount > limit) {
    return { ok: false, error: 'AI coaching rate limit exceeded', retryAfterSec }
  }
  return { ok: true }
}

function positiveIntegerEnv(key: string, fallback: number) {
  const raw = Deno.env.get(key)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function hmacSha256Base64Url(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return base64Url(new Uint8Array(signature))
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function base64Url(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index]
  }
  return diff === 0
}

function requiredEnv(key: string) {
  const value = Deno.env.get(key)
  if (!value) throw new Error(`${key} is not configured`)
  return value
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  })
}
