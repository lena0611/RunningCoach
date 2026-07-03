/**
 * 코치 모먼트 닫기/답변의 로컬 영속 (닦달 방지 — SSOT "한 번 응답하면 다시 닦달하지 않는다"의 모먼트 일반화).
 *
 * 기존엔 dismiss 가 모듈 스코프 메모리에만 있어 **앱을 다시 열 때마다 같은 질문이 재노출**됐다
 * (예: 추가런 "왜 더 뛰고 계세요?" — 답해도 다음 실행에 또 뜸). 닫기/답변 시점을 localStorage 에
 * 남기고, 쿨다운(7일 — 추가런 트렌드 윈도와 동일) 동안 같은 key 모먼트를 숨긴다.
 * 쿨다운이 지나면 다시 평가된다(상황이 지속되면 코치가 다시 말 걸 수 있음 — 영구 침묵 아님).
 */

const STORAGE_KEY = 'runcontext.coachMoments.dismissed'

export const MOMENT_DISMISS_COOLDOWN_DAYS = 7

/** 모먼트 key → 닫은/답한 시각(ISO). */
export type MomentDismissalMap = Record<string, string>

/** 저장본을 읽고 쿨다운 지난 항목은 걸러 반환한다. 손상/부재면 빈 맵. */
export function loadMomentDismissals(now: Date): MomentDismissalMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const cutoff = now.getTime() - MOMENT_DISMISS_COOLDOWN_DAYS * 86400000
    const map: MomentDismissalMap = {}
    for (const [key, at] of Object.entries(parsed)) {
      if (typeof at !== 'string') continue
      const t = Date.parse(at)
      if (Number.isFinite(t) && t > cutoff) map[key] = at
    }
    return map
  } catch {
    return {}
  }
}

/** key 를 지금 시각으로 기록한 새 맵을 저장·반환한다(저장 실패는 재노출로만 이어짐 — 무시). */
export function persistMomentDismissal(map: MomentDismissalMap, key: string, now: Date): MomentDismissalMap {
  const next = { ...map, [key]: now.toISOString() }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* noop */
    }
  }
  return next
}
