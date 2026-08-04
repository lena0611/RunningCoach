/**
 * 코칭 LLM 모델 레지스트리 (단일 출처).
 * 설정 모델 스위처(AppHeader)와 리포트 "제공 모델" 캡션이 이 목록을 공유하고,
 * coach-run 서버 allowlist도 이 id 집합을 미러한다.
 *
 * ⚠ NVIDIA 무료 API는 개발 한정(Trial ToS 프로덕션 금지) — 출시 전 유료 프로바이더 복귀 필요.
 * 관련 메모리: nvidia-free-api-dev-only.
 */
export type CoachModelId = 'openai' | 'deepseek-ai/deepseek-v4-pro' | 'z-ai/glm-5.2'

export interface CoachModelOption {
  id: CoachModelId
  /** 짧은 표시명(스위처·캡션). */
  label: string
  /** 전체 모델명(툴팁·설명). */
  full: string
}

/**
 * `openai` 는 **프로바이더 지명 sentinel** 이다 — 구체 모델명은 서버 시크릿(`OPENAI_MODEL`)이 가진다.
 * 여기에 모델명을 박아두면 OpenAI 쪽 모델이 바뀔 때 웹 배포까지 따라가야 하고, 시크릿과 어긋나면
 * 런타임에만 터진다. 나머지 두 개는 NVIDIA 무료 엔드포인트의 실제 모델 id 라 그대로 쓴다.
 */
export const COACH_MODELS: readonly CoachModelOption[] = [
  { id: 'openai', label: 'GPT', full: 'GPT (OpenAI)' },
  { id: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek', full: 'DeepSeek V4 Pro' },
  { id: 'z-ai/glm-5.2', label: 'GLM', full: 'GLM-5.2' }
]

/**
 * 기본은 **GPT(유료 OpenAI)**. NVIDIA 무료 엔드포인트는 초당 3~6자 수준으로 느리고 중간에 수십 초 정체해
 * 긴 답변이 200~250초에서 스트림째 실패한다(2026-08-04 실측, DeepSeek·GLM 공통). 같은 질문이 GPT 로는
 * 10초에 완결됐다. 무료는 어차피 개발 한정(Trial ToS)이라 출시 전 유료 복귀가 필요했다.
 * 무료 모델은 비교·실험용으로 선택지에 남긴다.
 */
export const DEFAULT_COACH_MODEL: CoachModelId = 'openai'

/** 무료(NVIDIA) 모델 id — 저장값 일회성 이관 판정에 쓴다(settingsStore). */
export const FREE_TIER_COACH_MODEL_IDS: readonly CoachModelId[] = ['deepseek-ai/deepseek-v4-pro', 'z-ai/glm-5.2']

export function isCoachModelId(value: unknown): value is CoachModelId {
  return typeof value === 'string' && COACH_MODELS.some((model) => model.id === value)
}

/** 모델 id → 짧은 표시명. 미상/구(舊) 리포트(모델 미기록)면 빈 문자열. */
export function coachModelLabel(id: string | null | undefined): string {
  return COACH_MODELS.find((model) => model.id === id)?.label ?? ''
}
