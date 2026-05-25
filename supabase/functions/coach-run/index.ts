import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const context = await buildContext(admin, userId, selectedRunId, userNote, responseStyle, currentWeather)
    const ai = await callOpenAI(openaiKey, model, context)
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

    return json({
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
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

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
  const [{ data: memoryRow }, { data: runs }, { data: memoryItems }, { data: reports }] = await Promise.all([
    admin.from('training_memory').select('memory').eq('user_id', userId).maybeSingle(),
    admin.from('run_logs').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(120),
    admin.from('coach_memory_items').select('content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(80),
    admin.from('coach_reports').select('selected_run_id, user_note, report, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(80)
  ])
  const runRows = (runs ?? []) as RunLogRow[]
  const reportRows = (reports ?? []) as CoachReportRow[]
  const memoryRows = (memoryItems ?? []) as CoachMemoryItemRow[]
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
  const injuryItems = getInjuryItems(trainingMemory)
  const activeInjuryItem = getActiveInjuryItem(trainingMemory, injuryItems)

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
    trainingMemory,
    goals,
    activeGoal,
    injuryItems,
    activeInjuryItem,
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
  aiNotes?: string[]
}

async function callOpenAI(apiKey: string, model: string, context: unknown): Promise<{ report: string; memoryItems: string[]; trainingMemoryPatch: TrainingMemoryPatch | null }> {
  const instructions = [
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
    '답변 우선순위는 오늘 세션의 정체, 사용자가 의도한 훈련과 맞는지, 중요한 지표 2~3개, 최근 맥락, 조심할 점, 다음 훈련 순서다.',
    '모든 데이터를 다 설명하지 말고 오늘 기록에서 가장 중요한 의미 1개를 먼저 말한다.',
    '답변 구조는 가능한 한 다음 순서를 따른다: 반응, 핵심 지표, 오늘 해석, 조심할 점, 다음 훈련, 한 줄 요약.',
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
    '다른 목표는 보조 관점으로만 활용하고, activeGoal과 충돌하면 activeGoal을 우선한다.',
    '부상관리는 knownIssues 자유 텍스트보다 injuryItems와 activeInjuryItem을 우선한다.',
    'activeInjuryItem의 triggers, restrictions, returnToRunCriteria는 다음 훈련 추천과 강도 제한 판단에 반드시 반영한다.',
    'activeInjuryItem이 active 또는 monitoring이면 강훈련/롱런 뒤 회복 반응, pain_note, workout_feeling을 보수적으로 해석한다.',
    '통증/부상 메모가 있어도 의료 진단처럼 말하지 않는다. 통증은 훈련 판단 기준과 관찰 포인트로만 다룬다.',
    '통증 수치가 없으면 단정하지 않는다. 예: "통증 강도가 안 나와 있으니 크게 단정하진 말자. 다만 다음 착지감은 체크하자."',
    '코칭은 해당 러닝 세션 평가에서 끝나지 않는다. 반드시 계정의 목표와 누적 데이터를 보고 현재 weeklyPattern을 유지할지 수정할지 판단한다.',
    'weeklyPattern은 사용자가 직접 세우는 고정 루틴이 아니라 AI가 목표, 최근 14/30일 누적, 강훈련 빈도, 롱런 상태, Easy + Strides 수행 여부, 회복 신호를 보고 관리하는 훈련 계획이다.',
    'AI가 제안한 세션은 사용자가 믿고 따른 처방일 수 있다. selectedRun은 단순 기록이 아니라 직전 목표/스케줄/코칭 처방의 실행 결과일 수 있으므로, 계획 의도에 맞게 수행됐는지 먼저 보고 다음 처방을 조정한다.',
    '매 코칭 요청마다 스케줄 업데이트 필요성을 반드시 진단한다. 유지가 맞으면 "루틴은 유지"라고 짧게 말하고 trainingMemoryPatch는 null로 둔다. 조정이 필요하면 weeklyPattern 전체를 업데이트한다.',
    '매 코칭 요청마다 부상/주의 상태도 확인한다. pain_note, activeInjuryItem, 최근 강훈련/롱런 이후 회복 반응을 보고 다음 세션 강도에 반영하되 의료 진단처럼 말하지 않는다.',
    '루틴 변경이 필요 없으면 trainingMemoryPatch는 null로 둔다.',
    '루틴 변경이 필요하면 trainingMemoryPatch.weeklyPattern에 새 주간 루틴을 전체 배열로 넣는다. 일부만 넣지 말고 전체 주간 패턴을 반환한다.',
    '롱런 전략이나 현재 볼륨 노트도 바뀌어야 하면 trainingMemoryPatch.longRunStrategy, trainingMemoryPatch.currentVolumeNote에 반영한다.',
    '루틴을 바꾼 이유는 report에 짧게 설명하고, aiNotes에는 장기적으로 기억할 계획 변경 근거만 1~3개 넣는다.',
    'trainingMemoryPatch는 RunLog 원본 값을 바꾸는 용도가 아니다. 훈련 계획과 코칭 메모리만 갱신한다.',
    '긴 문단, 같은 말 반복, 모든 맥락 나열, 의료 진단, 부상 위험 단정, 목표 달성 보장, 원본 RunLog 임의 수정은 금지한다.',
    'report는 UI가 마크다운처럼 렌더링할 수 있게 짧은 제목, bullet list, --- divider를 적절히 사용한다.',
    '이모지는 필요할 때만 0~3개 사용한다.',
    '좋은 출력 예시의 밀도: "좋다. 이건 진짜 회복런 맞다. 어제 롱런 뒤에 강도 욕심 안 내고 아주 잘 눌렀어.\\n\\n## 핵심 지표\\n- 세션: Recovery / 와이프 동반주\\n- 거리: 5.02km\\n- 평균 페이스: 10분09초/km\\n- 평균 심박: 115\\n\\n## 오늘 해석\\n제일 좋은 건 심박이 완전히 낮게 잡혔다는 점이다.\\n\\n롱런 다음날인데 평균 115면, 몸을 더 밀어붙인 게 아니라 회복 쪽으로 잘 돌린 세션이다.\\n\\n## 조심할 점\\n체크할 건 하나다. 오른발 발바닥이 다음에도 조용한지.\\n\\n## 다음 훈련\\n- 내일: 휴식 or 5km 완전 이지\\n- 뛰면: 페이스 보지 말고 착지감만 보기\\n- 강도훈련: 발바닥이 조용해진 뒤 진행\\n\\n## 한 줄 요약\\n오늘은 더 뛴 게 아니라 잘 풀어준 날이다."',
    'context.responseStyle이 있으면 반드시 따른다. tone=conversational_coach, firstSentence=reaction_before_analysis, avoid=report_style/medical_diagnosis/long_paragraphs를 강하게 우선한다.',
    'memoryItems는 0~3개만 반환한다. 반복 패턴, 성향, 부상/더위/회복 기준, 계획 변경처럼 다음 코칭에도 쓸 장기 기억만 넣는다.',
    'memoryItems에 단일 세션의 거리/페이스/심박, "오늘 잘했다", "다음 훈련은 휴식" 같은 일회성 코멘트를 넣지 않는다.',
    '이미 context.coachMemoryItems나 trainingMemory에 같은 의미가 있으면 memoryItems에 다시 넣지 않는다.',
    'JSON만 반환한다. 형식: {"report":"사용자에게 보여줄 마크다운 코칭","memoryItems":["장기 기억으로 저장할 짧은 문장"],"trainingMemoryPatch":null 또는 {"weeklyPattern":["화요일: ..."],"longRunStrategy":"...","currentVolumeNote":"...","aiNotes":["..."]}}'
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions,
      input: `다음 RunContext 데이터를 바탕으로 코칭해라.\n\n${JSON.stringify(context, null, 2)}`
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
  if (Array.isArray(patch.aiNotes)) {
    const aiNotes = patch.aiNotes.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 12)
    if (aiNotes.length) normalized.aiNotes = aiNotes
  }

  return Object.keys(normalized).length ? normalized : null
}

function mergeTrainingMemoryPatch(memory: CoachContext['trainingMemory'], patch: TrainingMemoryPatch) {
  const current = memory && typeof memory === 'object' ? memory as Record<string, unknown> : {}
  return {
    ...current,
    ...(patch.weeklyPattern ? { weeklyPattern: patch.weeklyPattern } : {}),
    ...(patch.longRunStrategy ? { longRunStrategy: patch.longRunStrategy } : {}),
    ...(patch.currentVolumeNote ? { currentVolumeNote: patch.currentVolumeNote } : {}),
    ...(patch.aiNotes ? { aiNotes: mergeAiNotes(current.aiNotes, patch.aiNotes) } : {})
  }
}

function mergeAiNotes(current: unknown, next: string[]) {
  const currentItems = Array.isArray(current) ? current.filter((item) => typeof item === 'string') as string[] : []
  return [...next, ...currentItems.filter((item) => !next.includes(item))].slice(0, 30)
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

function getInjuryItems(memory: unknown): unknown[] {
  if (!memory || typeof memory !== 'object') return []
  const injuryItems = (memory as { injuryItems?: unknown }).injuryItems
  return Array.isArray(injuryItems) ? injuryItems : []
}

function getActiveInjuryItem(memory: unknown, injuryItems: unknown[]) {
  if (!memory || typeof memory !== 'object') return injuryItems[0] ?? null
  const activeInjuryItemId = (memory as { activeInjuryItemId?: unknown }).activeInjuryItemId
  const activeItem = injuryItems.find((item) => {
    return item && typeof item === 'object' && (item as { id?: unknown }).id === activeInjuryItemId
  })
  return activeItem ?? injuryItems.find((item) => {
    if (!item || typeof item !== 'object') return false
    const status = (item as { status?: unknown }).status
    return status === 'active' || status === 'monitoring'
  }) ?? null
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
