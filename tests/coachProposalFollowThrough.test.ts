import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #830 — 코치 제안을 승인하면 **끝까지 간다**.
 *
 * 2026-09-21 실사고: 사용자가 "9/22 스트라이드를 뺄까요?" 제안을 승인했는데 스케줄이 그대로였다.
 * 서버는 제안을 정상적으로 냈고(ease_session · 2026-09-22 · strides · kept) 카드도 떴는데,
 * 카드 버튼이 **이동만** 하고 확정은 도착지에서 한 번 더 눌러야 했다. 안내 토스트는 몇 초 뒤
 * 사라지고 버튼 이름도 달라("가볍게 바꾸기" → "더 쉽게") 사용자는 끝난 줄 알았다.
 *
 * 프롬프트와 마찬가지로 이 배선도 타입이 안 잡아준다 — 소스 가드로 잠근다.
 */
const COACH_PAGE = readFileSync(resolve(__dirname, '../src/pages/coach/CoachPage.vue'), 'utf-8')
const REPO = readFileSync(resolve(__dirname, '../src/shared/api/coachRepository.ts'), 'utf-8')
const EDGE = readFileSync(resolve(__dirname, '../supabase/functions/coach-run/index.ts'), 'utf-8')

describe('도착지에서 제안 동작을 이어서 수행한다 (#830 ②)', () => {
  it('이동만 하고 끝나지 않는다 — 제안 동작 실행 함수가 있다', () => {
    expect(COACH_PAGE).toContain('function runProposedSessionAction')
  })

  it('네 가지 세션 액션을 기존 핸들러로 잇는다', () => {
    // 직접 스케줄을 바꾸면 #639 가 도착 화면에 걸어둔 가드(키 세션 재배치 선권유·상향 경고·
    // 되돌리기)를 복제해야 한다. 반드시 기존 핸들러를 부른다.
    expect(COACH_PAGE).toContain("case 'ease_session'")
    expect(COACH_PAGE).toContain("onBriefingAlternative('easier')")
    expect(COACH_PAGE).toContain("case 'intensify_session'")
    expect(COACH_PAGE).toContain("onBriefingReschedule()")
    expect(COACH_PAGE).toContain("onBriefingSkip()")
  })

  it('브리핑 카드가 뜨는 오늘·미래에서만 이어받는다', () => {
    // 지난 날은 다른 카드가 뜨고 버튼 의미도 달라(놓아주기) 잘못 실행하면 엉뚱한 세션을 건드린다.
    expect(COACH_PAGE).toContain("if (state !== 'today' && state !== 'future') return false")
  })

  it('이어받지 못한 경우에만 안내 토스트로 남긴다', () => {
    expect(COACH_PAGE).toContain('아직 반영 전이에요')
    // 토스트가 무조건 뜨면(= 이어받기 실패) 예전 동작으로 돌아간 것이다.
    const runnerAt = COACH_PAGE.indexOf('runProposedSessionAction(action, state)')
    const toastAt = COACH_PAGE.indexOf('아직 반영 전이에요')
    expect(runnerAt).toBeGreaterThan(-1)
    expect(toastAt).toBeGreaterThan(runnerAt)
  })
})

describe('제안을 저장하지 않는다 (#639 결정 — 되돌린 #830 ③)', () => {
  /**
   * #639 본문이 **명시적으로** 정한 것이다:
   *   "영속하지 않는다. coach_reports 에 컬럼을 추가하지 않는다 — 이 성질을 그대로 따르면
   *    철 지난 제안이 과거 리포트에서 되살아나지 않는다(마이그레이션 0)."
   *
   * 2026-09-21 에 이 결정을 못 보고 컬럼을 추가했다가, 다음 날 경고한 일이 그대로 일어났다:
   * 이미 적용한 ease_session(9/24) 카드가 대화에 되살아나 **누르면 또 낮춘다.** #830 의 ②
   * (승인 즉시 실행)가 붙어 위험이 더 커졌다.
   *
   * ② 만으로 원래 문제는 해결된다 — 놓칠 단계가 없으니 "놓치면 사라진다"는 동기도 없다.
   * 감사 목적은 data_query_log.proposal 이 이미 충족한다.
   */
  it('서버가 제안을 coach_reports 에 저장하지 않는다', () => {
    expect(EDGE).not.toContain('schedule_proposal')
  })

  it('웹이 저장된 제안을 복원하지 않는다', () => {
    expect(REPO).not.toContain('schedule_proposal')
  })

  it('관측은 data_query_log 로 남는다 — 무엇을 제안했는지는 추적 가능해야 한다', () => {
    // 카드를 다시 그릴 수는 없지만(그게 의도다) 진단은 이걸로 한다.
    expect(EDGE).toContain('actionType')
    expect(EDGE).toContain('easeAxis')
  })
})
