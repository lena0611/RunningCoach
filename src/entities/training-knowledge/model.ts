export type TrainingKnowledgeSource = {
  id: string
  title: string
  author: string
  sourceType: string
  url: string | null
  reliability: string
  licenseNote: string
  summary: string
  approved: boolean
  createdAt: string
  updatedAt: string
}

export type TrainingMethod = {
  id: string
  sourceId: string | null
  name: string
  slug: string
  family: string
  summary: string
  targetDistances: string[]
  suitableLevels: string[]
  weeklyDaysMin: number | null
  weeklyDaysMax: number | null
  cautionNotes: string
  approved: boolean
  createdAt: string
  updatedAt: string
}

export type TrainingPrescriptionRule = {
  id: string
  methodId: string | null
  sourceId: string | null
  goalDistance: string
  phase: string
  sessionType: string
  ruleType: string
  metric: string
  prescription: string
  raiseCondition: string
  lowerCondition: string
  contraindications: string[]
  evidenceSummary: string
  priority: number
  approved: boolean
  createdAt: string
  updatedAt: string
}

export type TrainingKnowledgeRequest = {
  id: string
  title: string
  sourceUrl: string | null
  inputText: string
  status: 'requested' | 'reviewing' | 'approved' | 'rejected'
  extracted: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type TrainingKnowledgeCatalog = {
  sources: TrainingKnowledgeSource[]
  methods: TrainingMethod[]
  rules: TrainingPrescriptionRule[]
  requests: TrainingKnowledgeRequest[]
}

export type TrainingKnowledgeRequestInput = {
  title: string
  sourceUrl: string
  inputText: string
}
