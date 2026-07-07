/**
 * 코칭 LLM 모델 레지스트리 (단일 출처).
 * 설정 모델 스위처(AppHeader)와 리포트 "제공 모델" 캡션이 이 목록을 공유하고,
 * coach-run 서버 allowlist도 이 id 집합을 미러한다.
 *
 * ⚠ NVIDIA 무료 API는 개발 한정(Trial ToS 프로덕션 금지) — 출시 전 유료 프로바이더 복귀 필요.
 * 관련 메모리: nvidia-free-api-dev-only.
 */
export type CoachModelId = 'deepseek-ai/deepseek-v4-pro' | 'z-ai/glm-5.2'

export interface CoachModelOption {
  id: CoachModelId
  /** 짧은 표시명(스위처·캡션). */
  label: string
  /** 전체 모델명(툴팁·설명). */
  full: string
}

export const COACH_MODELS: readonly CoachModelOption[] = [
  { id: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek', full: 'DeepSeek V4 Pro' },
  { id: 'z-ai/glm-5.2', label: 'GLM', full: 'GLM-5.2' }
]

/** GLM이 현재 NVIDIA 쪽에서 불안정(DEGRADED)해 기본은 DeepSeek. 사용자가 설정에서 전환 가능. */
export const DEFAULT_COACH_MODEL: CoachModelId = 'deepseek-ai/deepseek-v4-pro'

export function isCoachModelId(value: unknown): value is CoachModelId {
  return typeof value === 'string' && COACH_MODELS.some((model) => model.id === value)
}

/** 모델 id → 짧은 표시명. 미상/구(舊) 리포트(모델 미기록)면 빈 문자열. */
export function coachModelLabel(id: string | null | undefined): string {
  return COACH_MODELS.find((model) => model.id === id)?.label ?? ''
}
