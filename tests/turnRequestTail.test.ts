import { describe, expect, it } from 'vitest'
import { buildTurnRequestTail } from '../supabase/functions/_shared/turnRequestTail'

/**
 * 2026-09-16 실사고의 두 번째 원인에 대한 계약 테스트.
 *
 * 코치가 "피로골절 vs 족저근막염을 정리해드릴게요"로 맺은 다음 턴에 "비교하기 쉽게 표로 보여줘"라고
 * 하자 두 번 모두 이번 주 스케줄을 비교했다. 프롬프트 마지막 블록이 예정 세션 목록이었고 사용자
 * 질문은 거대한 JSON 한가운데 묻혀 있었기 때문이다 — 요청을 맨 끝에 다시 세워 대상을 잡는다.
 */
describe('이번 턴 요청 꼬리표', () => {
  it('사용자 요청 원문을 그대로 싣는다', () => {
    const tail = buildTurnRequestTail('비교하기 쉽게 표로 보여줘')
    expect(tail).toContain('비교하기 쉽게 표로 보여줘')
  })

  it('대상이 생략된 요청은 직전 답변의 주제를 가리키라고 못박는다', () => {
    const tail = buildTurnRequestTail('표로 보여줘')
    expect(tail).toContain('직전 답변이 다루던 바로 그 주제')
  })

  it('직전 답변에 제안이 없을 때의 기본값을 정의한다', () => {
    // 1차 문구("네가 제안한 그 내용")는 제안 없는 턴에서 대상이 미정의라 스케줄로 새어나갔다.
    expect(buildTurnRequestTail('그거 표로 정리해줘')).toContain('제안이 없었으면 직전 답변의 내용 그 자체')
  })

  it('금지 표현을 꼬리표에서 다시 세운다 — 스레드의 옛 말투를 이겨야 하므로', () => {
    // 시스템 지침에 세 번 적고도 샜다("발이 조용한지"→"상태가 조용할 때만"→"통증이 완전히 조용할 때까지").
    const tail = buildTurnRequestTail('그럼 이번주에 뛰어도 되는 조건이 뭔지 알려줘')
    expect(tail).toContain('이 스레드의 옛 답변에 있더라도 따라 쓰지 마라')
    expect(tail).toContain('조용해지면')
    expect(tail).toContain('관찰 중·관리 중·해소')
  })

  it('스케줄을 주제로 삼을 조건을 좁힌다', () => {
    const tail = buildTurnRequestTail('그거 표로 정리해줘')
    expect(tail).toContain('사용자가 스케줄을 직접 물었을 때만 주제가 된다')
    expect(tail).toContain('스케줄 표를 내지 마라')
  })

  it('예정 세션 실행 지침을 이번 턴 주제로 삼지 말라고 범위를 좁힌다', () => {
    // 이 한 줄이 없으면 바로 위 블록(예정 세션 목록)이 가장 눈에 띄는 소재로 남는다.
    expect(buildTurnRequestTail('표로 보여줘')).toContain('이번 턴의 주제가 아니다')
  })

  it('사용자가 아무 말도 안 한 턴(자동 디브리핑)에는 아무것도 붙지 않는다', () => {
    expect(buildTurnRequestTail('')).toBe('')
    expect(buildTurnRequestTail('   ')).toBe('')
    expect(buildTurnRequestTail(null)).toBe('')
    expect(buildTurnRequestTail(undefined)).toBe('')
  })

  it('앞뒤 공백은 정리해서 싣는다', () => {
    expect(buildTurnRequestTail('  표로 보여줘  ')).toContain('\n표로 보여줘\n')
  })
})

describe('꼬리표 순서 계약 (소스 가드)', () => {
  it('실행 지침 꼬리표 뒤에 요청 꼬리표가 온다', () => {
    // 순서가 뒤집히면 마지막 블록이 다시 예정 세션 목록이 되어 같은 사고가 재발한다.
    const src = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../supabase/functions/coach-run/index.ts'),
      'utf-8'
    ) as string
    const execAt = src.indexOf('buildExecutionGuideTail(')
    const turnAt = src.indexOf('buildTurnRequestTail((context')
    expect(execAt).toBeGreaterThan(-1)
    expect(turnAt).toBeGreaterThan(execAt)
  })
})
