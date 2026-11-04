/**
 * 브리핑 쇼츠(#898)를 이번 실행에 띄울지 — 순수 판정(테스트로 잠근다).
 * 'wait' = 아직 판단할 재료가 덜 왔다 · 'skip' = 안 띄운다(인트로를 바로 걷는다) · 'show' = 띄운다.
 */
export type BriefingVerdict = 'wait' | 'skip' | 'show'

export type BriefingGateInput = {
  supabaseConfigured: boolean
  authInitialized: boolean
  authenticated: boolean
  levelLoaded: boolean
  needsOnboarding: boolean
  /** 요약 탭이 오늘 판정을 끝냈나(스케줄·런·메모리 로드 완료) */
  todaySettled: boolean
  /** 요약 탭 데이-스트립의 오늘 상태. 오늘 브리핑이 없으면 null */
  todayState: string | null
  /** 앱이면 HealthKit 첫 동기화가 끝났나(브라우저는 늘 true) */
  healthKitSettled: boolean
  shownToday: boolean
}

export function briefingVerdict(input: BriefingGateInput): BriefingVerdict {
  if (!input.authInitialized) return 'wait'
  if (input.supabaseConfigured) {
    if (!input.authenticated) return 'skip'
    if (!input.levelLoaded) return 'wait'
    if (input.needsOnboarding) return 'skip'
  }
  if (!input.todaySettled) return 'wait'
  // 'today' = 오늘 planned 세션이 있고 오늘 훈련 런이 없다. done(이미 뜀)·rested(휴식 선언)·rest(훈련 없음)·skipped 는 안 띄운다.
  if (input.todayState !== 'today') return 'skip'
  // 아침에 뛴 런이 아직 안 들어온 채 "다녀와요"를 틀면 안 된다 — 첫 동기화를 기다린다.
  if (!input.healthKitSettled) return 'wait'
  if (input.shownToday) return 'skip'
  return 'show'
}
