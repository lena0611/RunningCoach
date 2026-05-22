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
  tags: string[]
  source: string
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

    const context = await buildContext(admin, userId, selectedRunId, userNote)
    const ai = await callOpenAI(openaiKey, model, context)
    const { data: reportRow, error: reportError } = await admin
      .from('coach_reports')
      .insert({
        user_id: userId,
        selected_run_id: selectedRunId,
        user_note: userNote,
        report: ai.report
      })
      .select('id, selected_run_id, user_note, report, created_at')
      .single()
    if (reportError) throw reportError

    const memoryItems = ai.memoryItems.map((content) => ({
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
        createdAt: reportRow.created_at
      }
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function buildContext(admin: ReturnType<typeof createClient>, userId: string, selectedRunId: string | null, userNote: string) {
  const [{ data: memoryRow }, { data: runs }, { data: memoryItems }, { data: reports }] = await Promise.all([
    admin.from('training_memory').select('memory').eq('user_id', userId).maybeSingle(),
    admin.from('run_logs').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(120),
    admin.from('coach_memory_items').select('content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(40),
    admin.from('coach_reports').select('selected_run_id, user_note, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)
  ])
  const runRows = (runs ?? []) as RunLogRow[]
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

  return {
    userNote,
    currentDate,
    contextMode: selectedRun ? 'selected_run_review' : 'current_flow_review',
    selectedRunTiming,
    selectedRunAgeDays,
    anchorDateForWindowStats: anchorDate,
    instructionForDateHandling:
      'selectedRun.date는 훈련이 실제로 수행된 날짜이고 coach_reports.created_at은 코칭을 받은 날짜다. 둘을 혼동하지 마라. selectedRunTiming이 past이면 과거 기록 리뷰로 말하고, 오늘 뛴 기록/마지막 코칭 이후 새 기록이라고 단정하지 마라.',
    trainingMemory: memoryRow?.memory ?? null,
    coachMemoryItems: (memoryItems ?? []).map((item) => item.content),
    recentCoachReports: (reports ?? []).map((report) => ({
      selectedRunId: report.selected_run_id,
      userNote: report.user_note,
      createdAt: report.created_at
    })),
    selectedRun,
    runsAfterSelectedRun: runsAfterSelected.slice(0, 20),
    recent14,
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
      latestTempo,
      latestLong
    }
  }
}

async function callOpenAI(apiKey: string, model: string, context: unknown): Promise<{ report: string; memoryItems: string[] }> {
  const instructions = [
    '너는 사용자를 오래 봐온 한국어 러닝 코치다.',
    '목표는 장문 분석문이 아니라 모바일에서 빠르게 읽히는 대화형 코칭 리포트다.',
    '한국어 반말 기반으로 친근하게 말하되, 판단은 데이터와 누적 맥락에 근거한다.',
    '결론을 먼저 말하고, 숫자는 문장에 묻지 말고 짧은 목록으로 보여준다.',
    '답변 구조는 가능한 한 다음 순서를 따른다: 한 줄 결론, 핵심 지표, 오늘 해석, 조심할 점, 다음 훈련, 한 줄 요약.',
    '전체 report는 기본 700~1000자 안팎으로 제한한다. 한 문단은 최대 2~3문장으로 짧게 쓴다.',
    '잘한 점은 최대 3개, 조심할 점은 최대 2개만 말한다.',
    '반드시 currentDate, selectedRun.date, selectedRunTiming을 확인한 뒤 말한다.',
    'selectedRunTiming이 past이면 "오늘", "방금", "이번 훈련 이후"처럼 현재 훈련처럼 보이는 표현을 쓰지 말고, 과거 기록을 복기하는 톤으로 말한다.',
    'coach_reports.created_at이나 최근 코칭 시각을 훈련 날짜로 착각하지 않는다. 마지막 코칭 이후에 뛴 기록이라고 단정하지 않는다.',
    'recent14/recent30은 anchorDateForWindowStats 기준 창이다. selectedRun이 있으면 선택 기록 날짜 기준의 이전 흐름으로 해석한다.',
    'runsAfterSelectedRun은 선택 기록 이후 실제로 저장된 러닝이다. 과거 기록 리뷰에서는 이 목록이 있으면 이후 흐름을 짧게 참고할 수 있지만, 선택 기록 자체 평가와 혼동하지 않는다.',
    '사용자가 말한 세션명을 그대로 믿지 말고 요일, 최근 흐름, 랩, 심박, 페이스, RPE, 메모, TrainingMemory로 재해석한다.',
    '앱 로그가 적어도 TrainingMemory나 coachMemoryItems의 장기 맥락을 부정하지 않는다. 로그가 덜 들어온 상태로 보고 조심스럽게 해석한다.',
    '최근 14일 앱 로그가 적다는 이유만으로 훈련 성과를 판단할 수 없다고 길게 말하지 않는다.',
    '템포 뒤 9분대 조깅, 심박 125~128, 배우자 동행런 맥락이면 추가 강훈련보다 회복 조깅으로 해석한다.',
    '더위, 케이던스/호흡 성향, 과거 좌측 근위부 햄스트링 이슈, 격주 롱런 패턴을 필요한 때만 짧게 연결한다.',
    '긴 문단, 같은 말 반복, 모든 맥락 나열, 의료 진단, 부상 위험 단정, 목표 달성 보장, 원본 RunLog 임의 수정은 금지한다.',
    'report는 UI가 마크다운처럼 렌더링할 수 있게 짧은 제목, bullet list, --- divider, 필요한 경우 ``` 코드블록을 적절히 사용한다.',
    '이모지는 과하게 쓰지 말고 섹션 제목에 0~3개만 사용한다.',
    'JSON만 반환한다. 형식: {"report":"사용자에게 보여줄 마크다운 코칭","memoryItems":["장기 기억으로 저장할 짧은 문장"]}'
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
    memoryItems: Array.isArray(parsed.memoryItems) ? parsed.memoryItems.filter((item: unknown) => typeof item === 'string').slice(0, 8) : []
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
  if (!runs.length) return 0
  const easy = runs.filter((run) => ['Easy', 'Recovery', 'Easy + Strides', 'LSD'].includes(run.type)).length
  return Math.round((easy / runs.length) * 100)
}

function safeJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
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
