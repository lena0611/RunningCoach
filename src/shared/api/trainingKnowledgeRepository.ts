import { requireSupabase } from '@/shared/api/supabase'
import type {
  TrainingKnowledgeCatalog,
  TrainingKnowledgeRequest,
  TrainingKnowledgeRequestInput,
  TrainingKnowledgeSource,
  TrainingMethod,
  TrainingPrescriptionRule
} from '@/entities/training-knowledge/model'

type SourceRow = {
  id: string
  title: string
  author: string
  source_type: string
  url: string | null
  reliability: string
  license_note: string
  summary: string
  approved: boolean
  created_at: string
  updated_at: string
}

type MethodRow = {
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
  approved: boolean
  created_at: string
  updated_at: string
}

type RuleRow = {
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
  approved: boolean
  created_at: string
  updated_at: string
}

type RequestRow = {
  id: string
  title: string
  source_url: string | null
  input_text: string
  status: TrainingKnowledgeRequest['status']
  extracted: Record<string, unknown>
  created_at: string
  updated_at: string
}

export async function fetchTrainingKnowledgeCatalog(): Promise<TrainingKnowledgeCatalog> {
  const supabase = requireSupabase()
  const [sourcesResult, methodsResult, rulesResult, requestsResult] = await Promise.all([
    supabase.from('training_knowledge_sources').select('*').eq('approved', true).order('title'),
    supabase.from('training_methods').select('*').eq('approved', true).order('name'),
    supabase.from('training_prescription_rules').select('*').eq('approved', true).order('priority'),
    supabase.from('training_knowledge_requests').select('*').order('created_at', { ascending: false }).limit(20)
  ])

  if (sourcesResult.error) throw sourcesResult.error
  if (methodsResult.error) throw methodsResult.error
  if (rulesResult.error) throw rulesResult.error
  if (requestsResult.error) throw requestsResult.error

  return {
    sources: (sourcesResult.data ?? []).map(fromSourceRow),
    methods: (methodsResult.data ?? []).map(fromMethodRow),
    rules: (rulesResult.data ?? []).map(fromRuleRow),
    requests: (requestsResult.data ?? []).map(fromRequestRow)
  }
}

export async function createTrainingKnowledgeRequest(input: TrainingKnowledgeRequestInput): Promise<TrainingKnowledgeRequest> {
  const title = input.title.trim()
  if (!title) throw new Error('훈련법 이름을 입력하세요.')
  const { data, error } = await requireSupabase()
    .from('training_knowledge_requests')
    .insert({
      title,
      source_url: input.sourceUrl.trim() || null,
      input_text: input.inputText.trim(),
      status: 'requested'
    })
    .select('*')
    .single()

  if (error) throw error
  return fromRequestRow(data as RequestRow)
}

function fromSourceRow(row: SourceRow): TrainingKnowledgeSource {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    sourceType: row.source_type,
    url: row.url,
    reliability: row.reliability,
    licenseNote: row.license_note,
    summary: row.summary,
    approved: row.approved,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function fromMethodRow(row: MethodRow): TrainingMethod {
  return {
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    slug: row.slug,
    family: row.family,
    summary: row.summary,
    targetDistances: row.target_distances ?? [],
    suitableLevels: row.suitable_levels ?? [],
    weeklyDaysMin: row.weekly_days_min,
    weeklyDaysMax: row.weekly_days_max,
    cautionNotes: row.caution_notes,
    approved: row.approved,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function fromRuleRow(row: RuleRow): TrainingPrescriptionRule {
  return {
    id: row.id,
    methodId: row.method_id,
    sourceId: row.source_id,
    goalDistance: row.goal_distance,
    phase: row.phase,
    sessionType: row.session_type,
    ruleType: row.rule_type,
    metric: row.metric,
    prescription: row.prescription,
    raiseCondition: row.raise_condition,
    lowerCondition: row.lower_condition,
    contraindications: row.contraindications ?? [],
    evidenceSummary: row.evidence_summary,
    priority: row.priority,
    approved: row.approved,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function fromRequestRow(row: RequestRow): TrainingKnowledgeRequest {
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url,
    inputText: row.input_text,
    status: row.status,
    extracted: row.extracted ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
