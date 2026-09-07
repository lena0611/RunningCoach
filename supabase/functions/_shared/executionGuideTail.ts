/**
 * 컨텍스트 JSON **뒤에** 붙이는 예정 세션 실행 지침 꼬리표 (#795).
 *
 * 왜 꼬리표까지 필요한가 — 2026-09-07 실측:
 *   ① 실행 지침을 아예 안 보내던 동안 코치는 옛 처방 템플릿 숫자("워밍업 10분 → 20초 가속/1분40초
 *      회복 ×8")를 스레드 기억으로 4턴 연속 되풀이했고 "앱 기준"이라는 말까지 붙였다.
 *   ② 지침 + 데이터를 컨텍스트에 실어도 **고쳐지지 않았다.** 큰 JSON 안 한 필드는 자기 과거 답변의
 *      확신을 못 이긴다. 읽는 순서상 마지막에 같은 문장을 다시 세우고 "이전 숫자는 폐기"라고
 *      못박은 뒤에야 교정됐다([[coach-always-on-block-deterministic]] 의 위치 버전).
 *
 * 정본은 웹 `sessionBriefing.buildSessionExecution` 하나다 — 여기서는 문장을 만들지 않고 옮기기만 한다.
 */

export type ExecutionGuideStep = { label: string; detail: string }
export type ExecutionGuideSession = {
  date?: unknown
  type?: unknown
  execution?: unknown
}

/**
 * 꼬리표를 만든다. 실을 지침이 없으면 빈 문자열(붙이지 않음).
 *
 * ⚠ `sessions` 로는 **축약되지 않은 원본**을 넘겨야 한다. `context.upcomingSchedule` 은
 * structuredCoachContext 로 가려지므로 그걸 넘기면 general 분류 턴에서 꼬리표가 통째로 사라진다 —
 * 실측: 같은 질문을 "다시 물어볼게"로 감싸자 분류가 갈려 옛 숫자로 되돌아갔다. 세션 액션 4종이
 * 같은 함정으로 구조적으로 폐기됐던 전례가 있다("문구 분류에 데이터 가용성을 걸지 않는다").
 */
export function buildExecutionGuideTail(sessions: unknown): string {
  if (!Array.isArray(sessions)) return ''
  const blocks: string[] = []
  for (const session of sessions as ExecutionGuideSession[]) {
    if (!session || typeof session !== 'object') continue
    const steps = normalizeSteps(session.execution)
    if (!steps.length) continue
    const date = typeof session.date === 'string' ? session.date : ''
    const type = typeof session.type === 'string' ? session.type : ''
    const head = [date, type].filter(Boolean).join(' ')
    blocks.push(`- ${head}\n${steps.map((step) => `  · ${step.label}: ${step.detail}`).join('\n')}`)
  }
  if (!blocks.length) return ''
  return (
    '\n\n[예정 세션 실행 지침 — 사용자 화면에 그대로 떠 있는 값]\n' +
    blocks.join('\n') +
    '\n\n위 지침이 실행 수치의 유일한 출처다. 이전 답변에 다른 숫자(반복수·회복 시간·웜업 길이)가 있었다면 ' +
    '그건 폐기된 값이니 되풀이하지 마라 — 반복수·거리는 단계·체력·부상으로 매번 다시 산출된다. ' +
    '여기 없는 세션은 실행 수치를 말하지 않는다.'
  )
}

function normalizeSteps(value: unknown): ExecutionGuideStep[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((step): step is ExecutionGuideStep =>
      Boolean(step) && typeof step === 'object' &&
      typeof (step as ExecutionGuideStep).label === 'string' &&
      typeof (step as ExecutionGuideStep).detail === 'string' &&
      (step as ExecutionGuideStep).detail.trim() !== '')
    .slice(0, 8)
}
