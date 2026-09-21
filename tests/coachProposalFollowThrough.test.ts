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

describe('제안을 저장하고 복원한다 (#830 ③)', () => {
  it('서버가 제안 원문을 턴에 저장한다', () => {
    expect(EDGE).toContain('schedule_proposal: coachScheduleProposal')
  })

  it('게이트를 통과한 제안만 저장한다', () => {
    // 폐기된 제안까지 저장하면 코치가 내지도 않은 변경을 사용자가 보게 된다.
    expect(EDGE).not.toContain('schedule_proposal: ai.coachScheduleProposal')
  })

  it('웹이 저장된 제안을 복원한다', () => {
    expect(REPO).toContain('coachScheduleProposal: row.schedule_proposal ?? null')
  })

  it('조회 컬럼에 제안이 포함된다', () => {
    expect(EDGE).toContain('model, schedule_proposal')
  })
})
