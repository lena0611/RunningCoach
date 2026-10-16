import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRestPlanTail } from '../supabase/functions/_shared/restPlanTail'

describe('buildRestPlanTail (#856)', () => {
  it('실사례: 처치 다음날 2주 휴식 중 — 복귀일과 "계획부터 짚기"를 싣는다', () => {
    const tail = buildRestPlanTail({ active: true, reason: 'injury', returnDate: '2026-10-28', daysUntilReturn: 14 })
    expect(tail).toContain('[사용자가 정한 휴식')
    expect(tail).toContain('이유: 부상')
    expect(tail).toContain('복귀일 10/28 (D-14)')
    expect(tail).toContain('정해두신 대로 10/28 복귀까지는 쉬는 계획이에요')
    expect(tail).toContain('설득하지 않는다')
    // SSOT §휴식과 복귀: 완전 휴식을 존중하되 회복주 대안 1회 제시는 막지 않는다
    expect(tail).toContain('1회 규칙')
    // 라이브 QA(2026-10-16): 조기 복귀 질문에 "권하지 않아요"로 막았다 — 바꾸는 길("복귀일 조정")을 알려준다
    expect(tail).toContain('"복귀일 조정"')
    expect(tail).toContain('병원 안내')
  })

  it('휴식이 아니면(없음·복귀일 당일·지난 휴식) 빈 문자열', () => {
    expect(buildRestPlanTail(null)).toBe('')
    expect(buildRestPlanTail(undefined)).toBe('')
    expect(buildRestPlanTail({ active: false, reason: 'injury', returnDate: '2026-10-28', daysUntilReturn: 0 })).toBe('')
  })

  it('이유를 모르면 이유 칸을 빼고, D-day 는 남은 날이 있을 때만', () => {
    const tail = buildRestPlanTail({ active: true, reason: null, returnDate: '2026-10-28', daysUntilReturn: null })
    expect(tail).not.toContain('이유:')
    expect(tail).toContain('복귀일 10/28\n')
  })
})

describe('꼬리표 순서 계약 (소스 가드)', () => {
  it('휴식 꼬리표는 처치 꼬리표 뒤, 요청 꼬리표 앞에 온다', () => {
    // 처치 꼬리표가 마지막이면 "walk-run 점진"이 휴식 계획을 덮어 같은 사고가 재발한다.
    const src = readFileSync(resolve(__dirname, '../supabase/functions/coach-run/index.ts'), 'utf-8')
    const treatmentAt = src.indexOf('buildTreatmentGuideTail(\n')
    const restAt = src.indexOf('buildRestPlanTail((context')
    const turnAt = src.indexOf('buildTurnRequestTail((context')
    expect(treatmentAt).toBeGreaterThan(-1)
    expect(restAt).toBeGreaterThan(treatmentAt)
    expect(turnAt).toBeGreaterThan(restAt)
  })
})
