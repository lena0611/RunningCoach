import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * conversational 지침이 제안 통로를 통째로 막지 않는지 지키는 소스 가드(#697).
 *
 * 왜 소스 텍스트를 검사하나: `index.ts` 는 Deno 전용 import 가 섞여 vitest 로 불러올 수 없고,
 * 판정식이 아니라 **프롬프트 한 줄**이 기능을 껐던 결함이라 미러할 로직이 없다.
 *
 * 같은 모양의 사고가 세 번 반복됐다 — 기능은 있는데 모드/게이트가 꺼버려 100% 폐기됐다:
 *   #642 G3 게이트가 축약된 upcomingSchedule 을 봐서 세션 액션 4종 폐기
 *   #690 벤치마크 페이로드를 structuredCoachContext 뒤에 숨겨 비교 질문이 분류에서 탈락
 *   #697 conversational 지침이 injuryUpdateProposal 을 강제 null (부상 상태를 대화로 못 바꿈)
 *
 * 전부 배포 후 실사용에서야 드러났다. 프롬프트 문자열은 타입도 테스트도 안 걸리기 때문이다.
 */
const INDEX_SRC = readFileSync(
  resolve(__dirname, '../supabase/functions/coach-run/index.ts'),
  'utf-8'
)

describe('conversational 지침이 승인형 제안 통로를 막지 않는다 (#697)', () => {
  it('injuryUpdateProposal 을 trainingMemoryPatch 와 묶어 무조건 null 로 만들지 않는다', () => {
    // 2026-08-22 실사용: 사용자가 "발바닥 해제해줘"를 1분 안에 3번 반복했다. 이 한 줄 때문에
    // 모든 대화 턴에서 부상 제안이 구조적으로 불가능했다.
    expect(INDEX_SRC).not.toContain('trainingMemoryPatch와 injuryUpdateProposal은 null로 둔다')
  })

  it('맥락 있는 대화 턴에서는 부상 상태 변화를 제안으로 낼 수 있다', () => {
    expect(INDEX_SRC).toContain('injuryUpdateProposal로 제안한다')
  })

  it('trainingMemoryPatch 는 계속 막아둔다 — 승인 없이 저장되는 경로다', () => {
    // ai-coaching-goal.md §378 · [[training-memory-lww-clobber-hazard]].
    // 부상 상태를 여는 것과 루틴 자동 저장을 여는 것은 별개다.
    expect(INDEX_SRC).toContain('trainingMemoryPatch는 항상 null로 둔다')
  })

  it('conversational 은 맥락 있는 분기로 지침을 받는다', () => {
    // buildFreeConversationInstructions 는 진짜 자유대화와 conversational 양쪽에 쓰인다.
    // 네 번째 인자(hasStructuredContext)를 안 넘기면 "activeInjuryItem 이 없다고 보고 답한다"가
    // 그대로 가서 코치가 있는 부상을 부정한다.
    expect(INDEX_SRC).toContain(
      'buildFreeConversationInstructions(runnerLevel, levelGuide, restAlternativeOffered, true)'
    )
  })
})

describe('데이터 조회 실측이 턴마다 남는다 (#652 후속)', () => {
  it('coach_reports insert 에 data_query_log 가 포함된다', () => {
    // 빠지면 로깅이 조용히 죽는다 — 그리고 그걸 알아채는 유일한 방법이 "몇 주 뒤 로그가 비어 있음"이다.
    expect(INDEX_SRC).toContain('data_query_log: queryLog')
  })

  it('도구 호출 결과를 성공·실패 모두 기록한다', () => {
    // 실패만 기록하던 구조가 누수의 원인이었다. 도구 미호출(빈 toolCalls)도 신호로 남아야 한다.
    expect(INDEX_SRC).toContain("queryLog.toolCalls.push")
    expect(INDEX_SRC).toContain("{ name: 'queryRuns', ok: false }")
    expect(INDEX_SRC).toContain("{ toolCalls: [], ungroundedClaims: 0 }")
  })

  it('승낙 턴의 수치 재진술은 ungrounded 오탐으로 갈라낸다', () => {
    // "응 해줘" 가 ungrounded_claim 으로 잡힌 실측(2026-08-24). 이 로그가 차단 승격의 정밀도 근거라
    // 오탐이 섞이면 판단이 흐려진다. 조건은 좁다 — isBareContinuation AND 직전 턴 queryRuns 성공.
    expect(INDEX_SRC).toContain('previousTurnQueriedRuns')
    expect(INDEX_SRC).toContain('queryLog.ungroundedThreadGrounded = threadGrounded')
    expect(INDEX_SRC).toContain('if (!threadGrounded) {')
  })

  it('직전 턴 판정은 같은 스레드로 스코프된다', () => {
    // 다른 스레드의 조회가 근거가 되면 안 된다(전역 대화는 selected_run_id null).
    expect(INDEX_SRC).toContain("query.eq('selected_run_id', selectedRunId) : query.is('selected_run_id', null)")
  })
})
