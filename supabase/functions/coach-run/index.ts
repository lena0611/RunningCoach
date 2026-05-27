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
  content: string
  created_at: string
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const currentWeather = normalizeCurrentWeather(body.currentWeather)
    const responseStyle = normalizeResponseStyle(body.responseStyle)
    const shouldStream = body.stream === true

    const context = await buildContext(admin, userId, selectedRunId, userNote, responseStyle, currentWeather)
    if (shouldStream) {
      return streamCoachRun(admin, userId, selectedRunId, userNote, openaiKey, model, context)
    }

    const ai = await callOpenAI(openaiKey, model, context)
    const result = await persistCoachResult(admin, userId, selectedRunId, userNote, context, ai)

    return json(result)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function persistCoachResult(
  admin: ReturnType<typeof createClient>,
  userId: string,
  selectedRunId: string | null,
  userNote: string,
  context: CoachContext,
  ai: { report: string; memoryItems: string[]; trainingMemoryPatch: TrainingMemoryPatch | null }
) {
    const durableMemoryItems = normalizeMemoryItems(ai.memoryItems, context.coachMemoryItems)
    const memoryPatch = normalizeTrainingMemoryPatch(ai.trainingMemoryPatch)
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
      source_report_id: reportRow.id
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
        trainingMemoryUpdated: Boolean(updatedMemory)
      },
      trainingMemoryUpdated: Boolean(updatedMemory),
      trainingMemoryPatch: memoryPatch
    }
}

type ResponseStyle = {
  tone: 'conversational_coach'
  format: 'sectioned_markdown'
  avoid: string[]
  firstSentence: 'reaction_before_analysis'
  maxParagraphSentences: number
  maxBulletsPerSection: number
}

function normalizeResponseStyle(value: unknown): ResponseStyle {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    tone: item.tone === 'conversational_coach' ? 'conversational_coach' : 'conversational_coach',
    format: item.format === 'sectioned_markdown' ? 'sectioned_markdown' : 'sectioned_markdown',
    avoid: Array.isArray(item.avoid)
      ? item.avoid.filter((entry): entry is string => typeof entry === 'string').slice(0, 10)
      : ['report_style', 'medical_diagnosis', 'long_paragraphs'],
    firstSentence: item.firstSentence === 'reaction_before_analysis' ? 'reaction_before_analysis' : 'reaction_before_analysis',
    maxParagraphSentences: Number.isFinite(Number(item.maxParagraphSentences)) ? Math.max(1, Math.min(Number(item.maxParagraphSentences), 3)) : 2,
    maxBulletsPerSection: Number.isFinite(Number(item.maxBulletsPerSection)) ? Math.max(3, Math.min(Number(item.maxBulletsPerSection), 6)) : 5
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

async function buildContext(admin: ReturnType<typeof createClient>, userId: string, selectedRunId: string | null, userNote: string, responseStyle: ResponseStyle, currentWeather: CurrentWeatherContext | null) {
  const [
    { data: memoryRow },
    { data: runs },
    { data: memoryItems },
    { data: reports },
    { data: knowledgeSources },
    { data: trainingMethods },
    { data: prescriptionRules }
  ] = await Promise.all([
    admin.from('training_memory').select('memory').eq('user_id', userId).maybeSingle(),
    admin.from('run_logs').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(120),
    admin.from('coach_memory_items').select('content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(80),
    admin.from('coach_reports').select('selected_run_id, user_note, report, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(80),
    admin.from('training_knowledge_sources').select('id, title, author, source_type, url, reliability, summary').eq('approved', true),
    admin.from('training_methods').select('id, source_id, name, slug, family, summary, target_distances, suitable_levels, weekly_days_min, weekly_days_max, caution_notes').eq('approved', true),
    admin.from('training_prescription_rules').select('id, method_id, source_id, goal_distance, phase, session_type, rule_type, metric, prescription, raise_condition, lower_condition, contraindications, evidence_summary, priority').eq('approved', true).order('priority')
  ])
  const runRows = (runs ?? []) as RunLogRow[]
  const reportRows = (reports ?? []) as CoachReportRow[]
  const memoryRows = (memoryItems ?? []) as CoachMemoryItemRow[]
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
  const trainingMemory = memoryRow?.memory ?? null
  const goals = getGoals(trainingMemory)
  const activeGoal = getActiveGoal(trainingMemory, goals)
  const performanceProjection = getPerformanceProjection(runRows, activeGoal)
  const allInjuryItems = getInjuryItems(trainingMemory)
  const selectedRunDateForTemporalContext = selectedRun?.date ?? null
  const injuryItems = filterInjuryItemsForRunDate(allInjuryItems, selectedRunDateForTemporalContext)
  const activeInjuryItem = getActiveInjuryItemForRunDate(trainingMemory, allInjuryItems, selectedRunDateForTemporalContext)
  const selectedRunLapAnalysis = buildLapProgressionAnalysis(selectedRun)
  const selectedRunExecutionGuide = buildSessionExecutionGuide(selectedRun, activeGoal)
  const recentPrescriptionComplianceSignals = buildPrescriptionComplianceSignals(recent14)
  const prescriptionComplianceSummary = summarizePrescriptionCompliance(recentPrescriptionComplianceSignals)
  const adaptiveTrainingProfile = getAdaptiveTrainingProfile(trainingMemory)
  const trainingKnowledge = buildRelevantTrainingKnowledge(knowledgeSourceRows, trainingMethodRows, prescriptionRuleRows, activeGoal, selectedRun)

  return {
    userNote,
    responseStyle,
    currentDate,
    currentDateDisplay: formatDateWithWeekday(currentDate),
    contextMode: selectedRun ? 'selected_run_review' : 'current_flow_review',
    selectedRunTiming,
    selectedRunAgeDays,
    anchorDateForWindowStats: anchorDate,
    anchorDateForWindowStatsDisplay: formatDateWithWeekday(anchorDate),
    instructionForDateHandling:
      'selectedRun.date는 훈련이 실제로 수행된 날짜이고 coach_reports.created_at은 코칭을 받은 날짜다. 둘을 혼동하지 마라. selectedRunTiming이 past이면 과거 기록 리뷰로 말하고, 오늘 뛴 기록/마지막 코칭 이후 새 기록이라고 단정하지 마라.',
    currentWeather,
    instructionForWeatherHandling:
      'currentWeather는 iOS WeatherKit에서 받은 현재/향후 12시간 날씨이며 다음 세션 준비용이다. selectedRun이 과거 기록이면 currentWeather를 그 과거 훈련 당시 날씨로 착각하지 마라. selectedRun.date가 오늘이거나 사용자가 다음 훈련/오늘 뛸지 묻는 경우에만 체감온도, 강수확률, 강수량, 비 가능 시간대를 짧게 반영한다.',
    routineUpdatePolicy: {
      purpose:
        '주간 루틴은 activeGoal 달성을 위한 처방이다. 세션별 코칭 때마다 유지/조정 여부를 확인하되, 단일 기록 하나만으로 자주 바꾸지 않는다.',
      externalCoachingStandards:
        '전문 코칭 기준선은 저강도 기반을 충분히 유지하고, 강훈련은 제한적으로 배치하며, 회복/적응을 훈련 일부로 보고, 목표 거리 특이성을 단계적으로 높이는 것이다. 80/20 또는 polarized/pyramidal 원칙은 절대 공식이 아니라 Easy 과소/강훈련 과다를 막는 가드레일로 사용한다.',
      coachingDecisionBasis: [
        '1순위: activeGoal의 목표 거리, 목표 기록, 목표일, 성공 기준, 전략 메모',
        '2순위: 선택 세션의 실제 수행 데이터(distance, duration, pace, HR, cadence, laps, fast_segments, RPE, memo)',
        '2.5순위: selectedRunExecutionGuide 대비 실제 수행 일치도. 처방된 심박/페이스/패턴 경계를 지켰는지, 경계를 넘었다면 어느 랩부터 왜 넘었는지',
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
        '랩/심박/RPE 데이터가 부족하다.',
        '목표 달성 보장을 암시해야만 설명 가능한 변경이다.'
      ]
    },
    goals,
    activeGoal,
    performanceProjection,
    injuryItems,
    activeInjuryItem,
    injuryTemporalPolicy: selectedRun
      ? 'injuryItems와 activeInjuryItem은 selectedRun.date 이전 또는 당일에 이미 발생/등록된 항목만 포함한다. 여기에 없는 현재 active 부상은 선택 세션 당시에는 아직 발생하지 않은 것으로 보고 언급하지 마라.'
      : '현재 흐름 코칭이므로 현재 active/monitoring 부상 항목을 사용할 수 있다.',
    coachMemoryItems: buildRelevantCoachMemoryItems(memoryRows, selectedRun, userNote),
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
    selectedRun: decorateRunDate(selectedRun),
    selectedRunLapAnalysis,
    selectedRunExecutionGuide,
    lapAnalysisInstruction:
      'selectedRunLapAnalysis와 selectedRunExecutionGuide가 있으면 반드시 코칭에 반영한다. 핵심 지표에는 페이스 흐름과 심박 흐름을 화살표로 짧게 보여주고, 오늘 해석에는 초반 오버페이스 여부, 심박이 터졌는지/잘 눌렸는지, 세션 유형별 심박/페이스 경계 초과 여부, 후반 페이스-심박 품질을 짚는다. 랩 데이터가 없을 때만 평균값 중심으로 말한다.',
    prescriptionAdjustmentInstruction:
      '선택 세션을 단순 기록이 아니라 이전 처방을 수행한 결과로 본다. selectedRunExecutionGuide에 맞게 훈련했는지 먼저 평가하고, 잘 지켰으면 유지 또는 소폭 상향 조건을 말한다. 경계를 반복적으로 넘었거나 회복/부상 신호가 있으면 다음 처방을 낮추거나 기준을 바꾼다. 조정 필요성이 명확하면 trainingMemoryPatch에 반영한다.',
    recentPrescriptionComplianceSignals,
    prescriptionComplianceSummary,
    prescriptionMemoryInstruction:
      'recentPrescriptionComplianceSignals는 최근 세션들이 각 유형별 처방 기준을 얼마나 지켰는지 보는 신호다. 단일 세션 결과를 장기기억으로 저장하지 말고, 최근 여러 세션에서 반복되는 준수/이탈 패턴만 memoryItems에 저장한다. 예: "최근 Tempo는 165 상한을 대체로 지키지만 후반 1~2랩에서 흔들린다", "Recovery는 심박을 잘 누르는 편이다".',
    runsAfterSelectedRun: runsAfterSelected.slice(0, 20).map(decorateRunDate),
    recent14: recent14.map(decorateRunDate),
    summaryStats: {
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
      latestTempo: decorateRunDate(latestTempo),
      latestLong: decorateRunDate(latestLong)
    }
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
}

type AdaptiveTrainingProfilePatch = {
  methodologyVersion?: string
  updatedAt?: string
  compliancePatterns?: string[]
  sessionGuides?: AdaptiveSessionGuidePatch[]
}

type AdaptiveSessionGuidePatch = {
  type?: string
  boundary?: string
  adjustment?: 'maintain' | 'raise' | 'lower' | 'watch'
  evidence?: string
  nextCheck?: string
}

async function callOpenAI(apiKey: string, model: string, context: unknown): Promise<{ report: string; memoryItems: string[]; trainingMemoryPatch: TrainingMemoryPatch | null }> {
  const instructions = buildCoachInstructions()

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions,
      input: `다음 PaceLAB 데이터를 바탕으로 코칭해라.\n\n${JSON.stringify(context, null, 2)}`
    })
  })

  if (!response.ok) throw new Error(`OpenAI API failed: ${response.status}`)
  const payload = await response.json()
  const text = payload.output_text ?? payload.output?.flatMap((item: any) => item.content ?? []).map((content: any) => content.text ?? '').join('\n') ?? ''
  const parsed = safeJson(text)
  return {
    report: typeof parsed.report === 'string' ? parsed.report : text,
    memoryItems: Array.isArray(parsed.memoryItems) ? parsed.memoryItems.filter((item: unknown) => typeof item === 'string').slice(0, 8) : [],
    trainingMemoryPatch: parsed.trainingMemoryPatch && typeof parsed.trainingMemoryPatch === 'object' ? parsed.trainingMemoryPatch as TrainingMemoryPatch : null
  }
}

function buildCoachInstructions() {
  return [
    '너는 사용자를 오래 봐온 한국어 러닝 코치다.',
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
    'selectedRunLapAnalysis가 있으면 "## 핵심 지표"에 랩 진행에 따른 페이스 흐름과 심박 흐름을 반드시 넣는다. 예: "- 페이스: 10분44초 → 10분05초 → 10분29초 → 9분57초 → 9분28초", "- 심박: 108 → 116 → 114 → 118 → 121", "- 케이던스: 159~164".',
    'selectedRunLapAnalysis가 있으면 평균 페이스/평균 심박만 말하고 끝내지 않는다. 러닝 중간 과정, 즉 초반을 서둘렀는지, 심박이 먼저 터졌는지, 잘 눌러 시작했는지, 후반에 페이스를 올려도 심박 품질이 유지됐는지 분석한다.',
    'selectedRunExecutionGuide가 있으면 세션 유형별 처방 경계를 사용한다. Easy는 145bpm 상한, Recovery는 130bpm 상한, Tempo는 최대 심박 165bpm 상한, Long Run은 후반 심박 드리프트, Easy + Strides는 10분 워밍업 + 8회 가속/회복 + 15분 쿨다운 구조를 본다.',
    '선택 세션은 단순 사후 기록이 아니라 이전 코칭/주간 루틴/처방 가이드의 실행 결과로 본다. 반드시 "처방 가이드에 맞게 임했는지"를 확인하고, 그 결과에 따라 사후 처방을 유지/상향/하향/보류 중 하나로 정리한다.',
    '처방 가이드에 맞게 잘 수행했으면 칭찬으로 끝내지 말고 다음 처방 기준을 유지할지, 더 나은 품질로 소폭 올릴지 조건을 말한다. 단, Tempo 처방의 핵심은 페이스 처방이 아니라 최대 심박 165를 넘기지 않는 것이다.',
    '처방 가이드를 넘겼으면 비난하지 말고 어느 랩부터 심박/페이스 경계가 흔들렸는지 말하고, 다음 처방에서 무엇을 낮출지 또는 어떤 체크포인트를 둘지 제안한다.',
    '현재 처방 숫자는 영구 고정값이 아니다. 사용자가 실행 가능한 Workoutdoors 세팅 기준으로 제시하되, 누적 데이터와 회복 반응이 충분하면 AI가 먼저 숫자/구성 변경을 제안한다.',
    'Tempo 또는 품질훈련에서는 selectedRunExecutionGuide.boundaries.heartRateCeilingBpm을 확인한다. lapHeartRatesOverTempoCeiling이 있거나 maxHeartRate가 165를 넘으면 몇 번째 랩/구간부터 넘었는지 짧게 말하고, 없으면 "상한 165는 넘기지 않았다"처럼 훈련 품질 근거로 쓴다.',
    'Easy 세션에서는 평균심박만 보지 말고 maxHeartRate와 랩 심박이 145를 넘겼는지 확인한다. 넘겼다면 "이지 처방은 145를 넘기지 않는 게 핵심인데, 오늘은 이 지점이 흔들렸다"처럼 다음 처방을 보수적으로 말한다.',
    '다음 훈련을 제안할 때는 세션명만 말하지 말고 사용자가 Workoutdoors에 바로 세팅할 수 있는 세부 지침을 준다. 예: Easy는 "145 넘기지 말기", Tempo는 "max 165 넘기지 말기", Easy + Strides는 "워밍업 10분 + 20초 가속/1분40초 회복 x8 + 쿨다운 15분".',
    '세션 유형별 랩당 페이스/심박 경계 가이드가 현재 사용자에게 맞지 않아 보이면 "## 루틴 업데이트"에서 유지/조정 여부를 말한다. 조정이 필요할 때는 trainingMemoryPatch.activeGoalStrategyNotes 또는 aiNotes에 새 기준을 저장한다.',
    'recentPrescriptionComplianceSignals를 보고 최근 여러 세션에서 처방 준수율 패턴이 있는지 활용한다. 반복적으로 잘 지키는 기준은 다음 처방 상향 근거가 되고, 반복적으로 넘는 기준은 처방 하향/보류 근거가 된다.',
    'context.trainingMethodology는 외부 러닝/지구력 훈련 문헌을 앱 기준선으로 압축한 것이다. 이 기준선을 무시하지 말고, Easy 기반, 제한된 강훈련, 점진적 과부하, 목표 특이성, 회복 게이트를 기본 알고리즘으로 삼는다.',
    'context.trainingKnowledge는 Supabase 지식 보관소에서 activeGoal과 selectedRun에 맞춰 검색한 승인된 훈련법/처방 규칙이다. 일반 모델 지식보다 이 승인된 규칙을 우선한다.',
    'trainingKnowledge.prescriptionRules가 있으면 세션 평가와 루틴 업데이트에서 해당 규칙의 prescription, raiseCondition, lowerCondition, contraindications를 반영한다.',
    'trainingKnowledge는 원문 전문이 아니라 저작권 문제를 피한 구조화 요약이다. 답변에서는 출처명을 짧게 언급할 수 있지만 원문 문구를 길게 재현하지 않는다.',
    'context.adaptiveTrainingProfile은 사용자 데이터와 대화로 누적된 개인화 레이어다. 문헌 기준선 위에 얹는 보정값이며, 단일 세션을 보고 즉흥적으로 덮어쓰지 않는다.',
    '알고리즘이 스스로 더 나아진다는 뜻은 소스 코드가 바뀐다는 뜻이 아니다. 반복되는 수행 패턴, 처방 준수율, 사용자 피드백을 trainingMemory.adaptiveTrainingProfile에 저장해 다음 판단에 반영한다는 뜻이다.',
    'adaptiveTrainingProfile을 업데이트할 때는 최근 2~3회 이상 같은 세션 유형에서 같은 준수/이탈 패턴이 반복되거나, 사용자가 강도/회복/통증에 대해 명시 피드백을 준 경우만 사용한다.',
    '날씨, 동반주, 과거 기록 리뷰, 데이터 부족처럼 일시적 이유로 설명되는 결과는 adaptiveTrainingProfile을 바꾸지 않는다.',
    '반복 패턴이 충분하면 trainingMemoryPatch.adaptiveTrainingProfile을 반환한다. compliancePatterns에는 장기적으로 기억할 반복 패턴을, sessionGuides에는 세션 유형별 현재 처방 경계와 조정 방향을 저장한다.',
    'adaptiveTrainingProfile.sessionGuides 조정 방향은 maintain/raise/lower/watch 중 하나다. raise는 회복 안정과 품질 준수가 반복될 때만, lower는 반복 경계 초과/통증/회복 악화가 있을 때만 쓴다.',
    'memoryItems에는 단일 세션의 준수 여부를 넣지 말고 반복 패턴만 넣는다. 예: "최근 Recovery는 심박을 130 이하로 잘 누르는 편이다", "최근 Tempo는 후반 랩에서 165 상한 근처까지 올라가므로 초반 진입을 보수적으로 잡아야 한다".',
    'Easy/Recovery에서는 페이스보다 심박 흐름을 우선한다. 후반 페이스가 빨라졌더라도 심박이 낮게 유지되면 잘 눌렀다고 본다.',
    'Long Run/LSD/Steady Long에서는 후반 페이스 급락, 심박 드리프트, 전후반 심박 차이를 보고 지속성과 품질을 말한다.',
    '답변 우선순위는 오늘 세션의 정체, 사용자가 의도한 훈련과 맞는지, 중요한 지표 2~3개, 최근 맥락, 조심할 점, 다음 훈련 순서다.',
    '모든 데이터를 다 설명하지 말고 오늘 기록에서 가장 중요한 의미 1개를 먼저 말한다.',
    '답변 구조는 가능한 한 다음 순서를 따른다: 반응, 핵심 지표, 오늘 해석, 조심할 점, 다음 훈련, 루틴 업데이트, 한 줄 요약.',
    '전체 report는 기본 600~900자 안팎으로 제한한다. 한 문단은 최대 2문장으로 짧게 쓴다.',
    '각 섹션 bullet은 최대 5개로 제한한다.',
    '잘한 점은 먼저 짚고, 조심할 점은 겁주지 말고 체크포인트처럼 말한다.',
    '다음 훈련 제안은 3줄 이내로 한다.',
    '마지막은 짧고 기억에 남는 한 줄로 끝낸다. 예: "오늘은 더 뛴 게 아니라 잘 풀어준 날이다."',
    '좋은 말투 예: "좋다. 이건 회복런 맞다.", "이건 나쁘지 않은 정도가 아니라 꽤 잘 눌렀다.", "여기서 욕심내면 세션 의미가 바뀐다.", "발바닥 메모가 있으니 딱 하나만 보면 된다. 다음에 뛸 때 착지감이 조용한지."',
    '피해야 할 말투: "해석됩니다", "판단됩니다", "우선입니다", "기준입니다", "해당 기록은", "훈련 성과를 재단", "누적 피로 관리가 필요".',
    '대신 이렇게 말한다: "이건 ~로 보는 게 맞다", "오늘은 ~가 제일 좋다", "지금은 ~만 보면 된다", "이 정도면 잘 눌렀다", "데이터도 그걸 보여준다".',
    '반드시 currentDateDisplay, selectedRun.dateDisplay, selectedRunTiming을 확인한 뒤 말한다.',
    'report에 날짜를 쓸 때는 가능한 한 2026-05-24(일)처럼 요일을 붙인다.',
    'selectedRunTiming이 past이면 "오늘", "방금", "이번 훈련 이후"처럼 현재 훈련처럼 보이는 표현을 쓰지 말고, 과거 기록을 복기하는 톤으로 말한다.',
    'coach_reports.created_at이나 최근 코칭 시각을 훈련 날짜로 착각하지 않는다. 마지막 코칭 이후에 뛴 기록이라고 단정하지 않는다.',
    'currentWeather는 현재/다음 세션 준비용 날씨다. 과거 RunLog 평가에서는 해당 과거 훈련의 날씨로 쓰지 않는다.',
    'currentWeather가 있고 사용자가 다음 훈련, 오늘 러닝, 강도 조절을 묻는 경우 체감온도, 강수확률, 강수량, 비 가능 시간대를 짧게 반영한다.',
    '체감온도 30도 이상이면 더위에서 심박이 잘 오르는 사용자 성향을 감안해 페이스보다 심박/RPE 우선으로 말한다.',
    '강수확률이 높거나 향후 12시간 강수량이 있으면 미끄러운 노면, 신발 젖음, 세션 강도 조절을 체크포인트로만 말한다.',
    'recent14/recent30은 anchorDateForWindowStats 기준 창이다. selectedRun이 있으면 선택 기록 날짜 기준의 이전 흐름으로 해석한다.',
    'runsAfterSelectedRun은 선택 기록 이후 실제로 저장된 러닝이다. 과거 기록 리뷰에서는 이 목록이 있으면 이후 흐름을 짧게 참고할 수 있지만, 선택 기록 자체 평가와 혼동하지 않는다.',
    '사용자가 말한 세션명을 그대로 믿지 말고 요일, 최근 흐름, 랩, 심박, 페이스, RPE, 메모, TrainingMemory로 재해석한다.',
    '저장된 RunLog.type을 그대로 반복하지 말고 TrainingMemory와 사용자 루틴을 함께 본다.',
    '예: 토요일 12~15km 기록이고 격주 패턴상 Steady Long 주차라면 DB에 LSD라고 저장되어 있어도 "LSD라기보다 Steady Long 성격"이라고 부드럽게 재해석한다.',
    'Easy 판단은 페이스보다 심박을 우선한다. 평균 페이스가 빨라도 평균/랩 심박이 낮고 대화 가능한 흐름이면 Tempo로 단정하지 말고 Easy 가능성을 먼저 본다.',
    'fast_segments는 route/speed 기반 짧은 고속 구간 요약이다. Easy + Strides 판단에서는 세션 타입명보다 요일 루틴, lap 심박/페이스, fast_segments를 우선한다.',
    '현재 Easy + Strides 기본 루틴은 10분 워밍업 + 8개의 스트라이드 가속 인터벌(20초 가속 + 1분40초 회복) + 15분 쿨다운이다. 다만 HealthKit/GPS 데이터는 타이트하게 들어오지 않으므로 20초/100초를 기계적으로 요구하지 않는다. route/speed에서 6~45초 정도의 짧은 가속이 4개 이상 반복되고 시작 간격이 대략 1~3.5분이면 Easy + Strides 성격으로 관용적으로 본다.',
    '앱 로그가 적어도 TrainingMemory나 coachMemoryItems의 장기 맥락을 부정하지 않는다. 로그가 덜 들어온 상태로 보고 조심스럽게 해석한다.',
    'context.coachMemoryItems는 장기기억 전체가 아니라 현재 선택 세션과 관련도 높은 일부만 선별한 것이다. 여기에 없다고 사용자가 그런 성향이 없다고 단정하지 않는다.',
    '최근 14일 앱 로그가 적다는 이유만으로 훈련 성과를 판단할 수 없다고 길게 말하지 않는다.',
    '템포 뒤 9분대 조깅, 심박 125~128, 배우자 동행런 맥락이면 추가 강훈련보다 회복 조깅으로 해석한다.',
    '더위, 케이던스/호흡 성향, 과거 좌측 근위부 햄스트링 이슈, 격주 롱런 패턴을 필요한 때만 짧게 연결한다.',
    '목표는 하나로 고정하지 않는다. goals 전체를 참고하되 activeGoal을 이번 코칭의 1차 기준으로 삼는다.',
    'activeGoal의 startDate, targetDate, distanceKm, targetDurationSec, successCriteria, strategyNotes를 목표 달성 판단의 기준으로 사용한다.',
    'activeGoal.targetDate가 있으면 남은 기간을 의식하고, 최근 수행 흐름이 목표 완성 날짜에 맞는지 짧게 점검한다. 목표 달성 보장은 금지한다.',
    'activeGoal은 큰 목적이다. 필요하면 그 기간 안에서 2~6주 단위의 작은 단계 목표를 설정해 루틴 처방 근거로 삼는다.',
    '작은 단계 목표 예: "2주간 Easy 볼륨 안정화", "Tempo에서 max 165를 넘기지 않고 지속 시간 확보", "토요일 Long Run을 12~15km로 안정화", "목표 10km 전 5km 테스트로 현재 위치 확인".',
    '단계 목표를 새로 잡거나 바꿔야 하면 report의 루틴 업데이트 섹션에 짧게 말하고, trainingMemoryPatch.activeGoalStrategyNotes에 큰 목표와 단계 목표가 함께 보이도록 반영한다.',
    '다른 목표는 보조 관점으로만 활용하고, activeGoal과 충돌하면 activeGoal을 우선한다.',
    '부상관리는 knownIssues 자유 텍스트보다 injuryItems와 activeInjuryItem을 우선한다.',
    '단, injuryItems와 activeInjuryItem은 선택 세션 날짜 기준으로 시간축이 맞는 항목만 들어온다. 현재 active 부상이라도 selectedRun.date 이후에 발생한 부상은 과거 세션 평가에서 절대 언급하지 않는다.',
    'activeInjuryItem이 있을 때만 triggers, restrictions, returnToRunCriteria를 다음 훈련 추천과 강도 제한 판단에 반영한다.',
    'activeInjuryItem이 active 또는 monitoring이면 강훈련/롱런 뒤 회복 반응, pain_note, workout_feeling을 보수적으로 해석한다.',
    '통증/부상 메모가 있어도 의료 진단처럼 말하지 않는다. 통증은 훈련 판단 기준과 관찰 포인트로만 다룬다.',
    '통증 수치가 없으면 단정하지 않는다. 예: "통증 강도가 안 나와 있으니 크게 단정하진 말자. 다만 다음 착지감은 체크하자."',
    '코칭은 해당 러닝 세션 평가에서 끝나지 않는다. 반드시 계정의 목표와 누적 데이터를 보고 현재 weeklyPattern을 유지할지 수정할지 판단한다.',
    'weeklyPattern은 사용자가 직접 세우는 고정 루틴이 아니라 AI가 목표, 최근 14/30일 누적, 강훈련 빈도, 롱런 상태, Easy + Strides 수행 여부, 회복 신호를 보고 관리하는 훈련 계획이다.',
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
    '훈련 품질 게이트를 본다. Easy는 145bpm 이하 유지와 회복, Tempo는 max 165bpm 이하 유지와 후반 안정, Long Run은 지속성과 다음날 회복, Easy + Strides는 짧고 선명한 가속과 회복 구간 안정이 기준이다.',
    '사용자가 목표를 향해 필요한 품질을 반복적으로 달성하면, "유지"가 아니라 더 나은 스케줄 제시를 검토한다. 단, 상향은 한 번에 하나의 변수만 소폭 적용한다.',
    '사용자가 잘 수행했는데도 루틴이 그대로라면 "아직 유지"가 아니라 "왜 아직 유지가 더 좋은지" 또는 "다음 상향 조건이 무엇인지"를 루틴 업데이트 섹션에 말한다.',
    'report의 "## 루틴 업데이트" 섹션에는 유지/변경 결론만 쓰지 말고, 근거를 1~3개 짧게 붙인다. 예: "루틴은 유지. 최근 Easy 기반은 살아 있고, 이번 세션도 강도 과부하 신호는 없다."',
    '근거가 부족하면 루틴을 바꾸지 않는다. 대신 "아직 루틴을 바꿀 근거는 부족하다. 다음 Tempo/Long Run 반응까지 보고 조정하자"처럼 말한다.',
    '레이스 예상시간 시뮬레이션은 충분한 PB/Tempo/Race/긴 지속주 데이터가 있을 때만 보조 근거로 사용한다. 예상시간 하나만으로 weeklyPattern을 바꾸지 않는다.',
    '매 코칭 요청마다 스케줄 업데이트 필요성을 반드시 진단한다. report에는 반드시 "## 루틴 업데이트" 섹션을 넣고, 이 섹션은 "## 한 줄 요약" 바로 앞에 둔다.',
    '루틴 업데이트 섹션에서는 이대로 activeGoal을 향해 가도 되는지, 주간 루틴을 유지할지, 변경이 필요한 시점인지 한두 문장으로 말한다.',
    '유지가 맞으면 "루틴은 유지"라고 짧게 말하고 trainingMemoryPatch는 null로 둔다. 조정이 필요하면 weeklyPattern 전체를 업데이트한다.',
    '매 코칭 요청마다 부상/주의 상태도 확인한다. pain_note, activeInjuryItem, 최근 강훈련/롱런 이후 회복 반응을 보고 다음 세션 강도에 반영하되 의료 진단처럼 말하지 않는다.',
    '루틴 변경이 필요 없으면 trainingMemoryPatch는 null로 둔다.',
    '루틴 변경이 필요하면 trainingMemoryPatch.weeklyPattern에 새 주간 루틴을 전체 배열로 넣는다. 일부만 넣지 말고 전체 주간 패턴을 반환한다.',
    '루틴 변경이 activeGoal의 목표관리에도 반영되어야 하면 trainingMemoryPatch.activeGoalStrategyNotes에 활성 목표의 새 strategyNotes 문장을 넣는다. 이 값은 activeGoal.strategyNotes에 저장된다.',
    '롱런 전략이나 현재 볼륨 노트도 바뀌어야 하면 trainingMemoryPatch.longRunStrategy, trainingMemoryPatch.currentVolumeNote에 반영한다.',
    '루틴을 바꾼 이유는 report에 짧게 설명하고, aiNotes에는 장기적으로 기억할 계획 변경 근거만 1~3개 넣는다.',
    'trainingMemoryPatch는 RunLog 원본 값을 바꾸는 용도가 아니다. 훈련 계획과 코칭 메모리만 갱신한다.',
    '긴 문단, 같은 말 반복, 모든 맥락 나열, 의료 진단, 부상 위험 단정, 목표 달성 보장, 원본 RunLog 임의 수정은 금지한다.',
    'report는 UI가 마크다운처럼 렌더링할 수 있게 짧은 제목, bullet list, --- divider를 적절히 사용한다.',
    '이모지는 필요할 때만 0~3개 사용한다.',
    '좋은 출력 예시의 밀도: "좋다. 이건 진짜 회복런 맞다. 어제 롱런 뒤에 강도 욕심 안 내고 아주 잘 눌렀어.\\n\\n## 핵심 지표\\n- 세션: Recovery / 와이프 동반주\\n- 거리: 5.02km\\n- 평균 페이스: 10분09초/km\\n- 평균 심박: 115\\n\\n## 오늘 해석\\n제일 좋은 건 심박이 완전히 낮게 잡혔다는 점이다.\\n\\n롱런 다음날인데 평균 115면, 몸을 더 밀어붙인 게 아니라 회복 쪽으로 잘 돌린 세션이다.\\n\\n## 조심할 점\\n체크할 건 하나다. 오른발 발바닥이 다음에도 조용한지.\\n\\n## 다음 훈련\\n- 내일: 휴식 or 5km 완전 이지\\n- 뛰면: 페이스 보지 말고 착지감만 보기\\n- 강도훈련: 발바닥이 조용해진 뒤 진행\\n\\n## 루틴 업데이트\\n루틴은 유지해도 된다. activeGoal 기준으로는 지금처럼 Easy 기반을 두고, 발바닥 반응만 확인하면 된다.\\n\\n## 한 줄 요약\\n오늘은 더 뛴 게 아니라 잘 풀어준 날이다."',
    'context.responseStyle이 있으면 반드시 따른다. tone=conversational_coach, firstSentence=reaction_before_analysis, avoid=report_style/medical_diagnosis/long_paragraphs를 강하게 우선한다.',
    'memoryItems는 0~3개만 반환한다. 반복 패턴, 성향, 부상/더위/회복 기준, 계획 변경처럼 다음 코칭에도 쓸 장기 기억만 넣는다.',
    'memoryItems에 단일 세션의 거리/페이스/심박, "오늘 잘했다", "다음 훈련은 휴식" 같은 일회성 코멘트를 넣지 않는다.',
    '이미 context.coachMemoryItems나 trainingMemory에 같은 의미가 있으면 memoryItems에 다시 넣지 않는다.',
    '스트리밍 UI가 report를 먼저 표시하므로 JSON 객체의 키 순서는 반드시 report, memoryItems, trainingMemoryPatch 순서로 둔다.',
    'JSON만 반환한다. 형식: {"report":"사용자에게 보여줄 마크다운 코칭","memoryItems":["장기 기억으로 저장할 짧은 문장"],"trainingMemoryPatch":null 또는 {"weeklyPattern":["화요일: ..."],"longRunStrategy":"...","currentVolumeNote":"...","activeGoalStrategyNotes":"활성 목표 전략 메모","aiNotes":["..."],"adaptiveTrainingProfile":{"compliancePatterns":["반복 패턴"],"sessionGuides":[{"type":"Tempo","boundary":"현재 사용자에게 맞는 처방 경계","adjustment":"maintain","evidence":"반복 근거","nextCheck":"다음 확인 기준"}]}}}'
  ].join('\n')

}

function streamCoachRun(
  admin: ReturnType<typeof createClient>,
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
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            instructions: buildCoachInstructions(),
            input: `다음 PaceLAB 데이터를 바탕으로 코칭해라.\n\n${JSON.stringify(context, null, 2)}`,
            stream: true
          })
        })

        if (!response.ok || !response.body) {
          throw new Error(`OpenAI API failed: ${response.status}`)
        }

        const decoder = new TextDecoder()
        const reader = response.body.getReader()
        const reportExtractor = createReportStreamExtractor()
        let sseBuffer = ''
        let fullText = ''
        let streamedReport = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          sseBuffer += decoder.decode(value, { stream: true })
          const parsed = drainOpenAISseBuffer(sseBuffer)
          sseBuffer = parsed.rest

          for (const event of parsed.events) {
            const delta = getOpenAITextDelta(event)
            if (!delta) continue
            fullText += delta
            const reportDelta = reportExtractor.push(delta)
            if (reportDelta) {
              streamedReport += reportDelta
              send('delta', { delta: reportDelta })
            }
          }
        }

        const parsed = safeJson(fullText)
        const ai = {
          report: typeof parsed.report === 'string' ? parsed.report : streamedReport || fullText,
          memoryItems: Array.isArray(parsed.memoryItems) ? parsed.memoryItems.filter((item: unknown) => typeof item === 'string').slice(0, 8) : [],
          trainingMemoryPatch: parsed.trainingMemoryPatch && typeof parsed.trainingMemoryPatch === 'object' ? parsed.trainingMemoryPatch as TrainingMemoryPatch : null
        }

        if (ai.report && ai.report !== streamedReport) {
          const missing = ai.report.slice(streamedReport.length)
          if (missing) send('delta', { delta: missing })
        }

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

function drainOpenAISseBuffer(buffer: string) {
  const events: unknown[] = []
  const chunks = buffer.split('\n\n')
  const rest = chunks.pop() ?? ''

  for (const chunk of chunks) {
    const dataLines = chunk
      .split('\n')
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
      '선택 RunLog의 랩/심박/RPE/메모로 처방 준수 여부를 판정한다.',
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
    compliancePatterns: normalizeStringArray(raw.compliancePatterns, 20, 240),
    sessionGuides: normalizeAdaptiveSessionGuides(raw.sessionGuides)
  }
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

  return Object.keys(normalized).length ? normalized : null
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
      : {})
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

function buildRelevantCoachMemoryItems(memoryItems: CoachMemoryItemRow[], selectedRun: RunLogRow | null, userNote: string) {
  const contextTags = extractContextTags(`${selectedRun?.session_title ?? ''} ${selectedRun?.type ?? ''} ${selectedRun?.memo ?? ''} ${userNote}`)
  const seen = new Set<string>()

  return memoryItems
    .map((item, index) => {
      const content = truncateText(item.content, 260)
      const key = normalizeMemoryKey(content)
      if (!content || seen.has(key) || !looksLikeDurableMemory(content)) return null
      seen.add(key)
      return {
        content,
        score: scoreMemoryItem(content, item.created_at, contextTags, index)
      }
    })
    .filter((item): item is { content: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 18)
    .map((item) => item.content)
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
    '템포'
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
  } as T extends RunLogRow ? RunLogRow & { dateDisplay: string } : null
}

type LapMetric = {
  index: number
  distanceKm: number | null
  paceSec: number | null
  paceDisplay: string | null
  avgHeartRate: number | null
  cadence: number | null
}

function buildLapProgressionAnalysis(run: RunLogRow | null) {
  if (!run) return null
  const lapMetrics = normalizeLapMetrics(run.laps)
  const metricSampleMetrics = normalizeMetricSampleMetrics(run.metric_samples)
  const laps = metricSampleMetrics.length >= 4 ? metricSampleMetrics : lapMetrics
  if (!laps.length) {
    return {
      available: false,
      reason: '랩 데이터가 없어 평균 페이스/평균 심박 중심으로만 볼 수 있다.'
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
  const tempoHeartRateCeilingBpm = 165
  const lapsOverTempoCeiling = heartRateLaps
    .filter((lap) => (lap.avgHeartRate ?? 0) > tempoHeartRateCeilingBpm)
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
      '초반 랩이 평균보다 과하게 빠르고 심박도 빠르게 오르면 서둘러 시작한 것으로 본다.',
      '후반 페이스가 빨라져도 심박 상승이 작으면 잘 눌러 시작해 품질이 좋은 흐름으로 본다.',
      '템포/품질훈련은 tempoHeartRateCeilingBpm 초과 랩이 있는지 확인한다.'
    ]
  }
}

function buildSessionExecutionGuide(run: RunLogRow | null, activeGoal: unknown) {
  if (!run) return null
  const type = run.type
  const targetPaceSec = getGoalPaceSec(activeGoal)
  const common = {
    runType: type,
    purpose: '선택 세션을 평가할 때 랩별 페이스/심박 경계를 보는 기준이다. 사용자의 목표와 누적 반응에 따라 코칭에서 유지/조정될 수 있다.',
    updateRule:
      '같은 유형의 세션이 2~3주 이상 안정적으로 소화되고 회복/부상 신호가 좋으면 경계를 소폭 상향할 수 있다. 반대로 심박/RPE/통증이 반복적으로 높으면 경계를 낮춘다.'
  }

  if (type === 'Tempo') {
    return {
      ...common,
      primaryMetric: 'heart_rate_ceiling',
      boundaries: {
        heartRateCeilingBpm: 165,
        paceRule: '페이스는 보조 지표다. 현재 템포 처방의 핵심은 max HR 165bpm을 넘기지 않는 것이다.',
        targetPaceSecPerKm: targetPaceSec,
        targetPaceDisplay: targetPaceSec ? formatPaceForCoach(targetPaceSec) : null,
        allowedLapInterpretation:
          '템포 랩은 165bpm 상한을 넘겼는지 먼저 본다. 후반 페이스가 빨라져도 심박이 165를 넘지 않으면 품질이 좋고, 넘겼다면 다음 템포는 초반 진입을 낮춘다.'
      }
    }
  }

  if (type === 'Easy' || type === 'Recovery') {
    return {
      ...common,
      primaryMetric: 'heart_rate',
      boundaries: {
        easyHeartRateCeilingBpm: type === 'Recovery' ? 130 : 145,
        recoveryHeartRateCeilingBpm: 130,
        maxHeartRateRule: type === 'Recovery'
          ? 'Recovery는 평균뿐 아니라 max/lap 심박도 130 근처에서 조용한지 본다.'
          : 'Easy는 평균보다 max/lap 심박이 145bpm을 넘지 않았는지 먼저 본다.',
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
          '랩 단위가 1km라면 스트라이드가 뭉개져 보일 수 있으므로 fast_segments와 심박 회복을 함께 본다.'
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
      rule: '저장된 타입이 Unknown이면 랩 페이스, 심박, 요일 루틴, 메모로 실제 세션 성격을 먼저 재해석한다.'
    }
  }
}

function buildPrescriptionComplianceSignals(runs: RunLogRow[]) {
  return runs.slice(0, 14).map((run) => {
    const analysis = buildLapProgressionAnalysis(run)
    const guide = buildSessionExecutionGuide(run, null)
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

function classifyPrescriptionCompliance(run: RunLogRow, analysis: ReturnType<typeof buildLapProgressionAnalysis>) {
  const type = run.type
  if (type === 'Tempo') {
    const overCeiling = analysis?.available ? analysis.lapHeartRatesOverTempoCeiling.length : 0
    if (overCeiling > 1 || (run.max_heart_rate ?? 0) > 168) return 'missed_high_heart_rate'
    if (overCeiling === 1 || (run.max_heart_rate ?? 0) > 165) return 'partial_late_heart_rate_rise'
    return 'met_heart_rate_ceiling'
  }

  if (type === 'Easy' || type === 'Recovery') {
    const ceiling = type === 'Recovery' ? 130 : 145
    const avgHeartRate = run.avg_heart_rate
    const maxHeartRate = run.max_heart_rate
    if (avgHeartRate === null && maxHeartRate === null) return 'unknown_no_heart_rate'
    if ((maxHeartRate ?? avgHeartRate ?? 999) <= ceiling) return 'met_easy_heart_rate'
    if ((avgHeartRate ?? 999) <= ceiling && (maxHeartRate ?? 999) <= ceiling + 8) return 'partial_easy_heart_rate_late_spike'
    if ((avgHeartRate ?? 999) <= ceiling + 5 && (maxHeartRate ?? 999) <= ceiling + 12) return 'partial_easy_heart_rate'
    return 'missed_too_hard_for_easy'
  }

  if (type === 'LSD' || type === 'Steady Long') {
    const drift = analysis?.available ? analysis.heartRateDriftBpmSecondHalfMinusFirstHalf : null
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
