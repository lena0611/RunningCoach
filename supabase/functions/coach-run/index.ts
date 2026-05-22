import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type RunLogRow = {
  id: string
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
  const [{ data: memoryRow }, { data: runs }, { data: memoryItems }] = await Promise.all([
    admin.from('training_memory').select('memory').eq('user_id', userId).maybeSingle(),
    admin.from('run_logs').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(120),
    admin.from('coach_memory_items').select('content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(40)
  ])
  const runRows = (runs ?? []) as RunLogRow[]
  const selectedRun = selectedRunId ? runRows.find((run) => run.id === selectedRunId) ?? null : null
  const recent14 = withinDays(runRows, 14)
  const recent30 = withinDays(runRows, 30)
  const latestTempo = runRows.find((run) => run.type === 'Tempo') ?? null
  const latestLong = runRows.find((run) => ['LSD', 'Steady Long'].includes(run.type)) ?? null

  return {
    userNote,
    trainingMemory: memoryRow?.memory ?? null,
    coachMemoryItems: (memoryItems ?? []).map((item) => item.content),
    selectedRun,
    recent14,
    summaryStats: {
      recent7DistanceKm: sumDistance(withinDays(runRows, 7)),
      recent14DistanceKm: sumDistance(recent14),
      recent30DistanceKm: sumDistance(recent30),
      recent30EasyRatio: easyRatio(recent30),
      hardSessionsLast7: withinDays(runRows, 7).filter((run) => ['Tempo', 'Steady Long', 'Race'].includes(run.type)).length,
      latestTempo,
      latestLong
    }
  }
}

async function callOpenAI(apiKey: string, model: string, context: unknown): Promise<{ report: string; memoryItems: string[] }> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions: [
        '너는 사용자를 오래 봐온 한국어 러닝 코치다.',
        '친근하고 자연스럽게 말하되, 단일 기록보다 누적 맥락을 우선한다.',
        '과거 부상, 더위, 케이던스 성향, 배우자 동행런, 격주 롱런 패턴을 근거로 재해석한다.',
        '의료 진단, 부상 단정, 목표 달성 보장은 하지 않는다.',
        'JSON만 반환한다. 형식: {"report":"사용자에게 보여줄 자연어 코칭","memoryItems":["장기 기억으로 저장할 짧은 문장"]}'
      ].join('\n'),
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

function withinDays(runs: RunLogRow[], days: number) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return runs.filter((run) => new Date(run.date) >= cutoff)
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
