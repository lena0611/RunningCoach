import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
  2026-09-07: 화면·타입에서 없앤 값이 **프롬프트로는 계속 흘러가던** 경로를 잠근다.

  context.trainingMemory 는 저장 블롭을 통째로 실어 보낸다. 그래서 옛 처방 템플릿(고정 8회
  스트라이드 인터벌 = 코치 SSOT §Easy + Strides 위배)과 레거시 자유 텍스트는 웹에서 지워도
  코치에게는 그대로 보였다. 진입 지점에서 키를 떼어내는 것이 유일한 차단점이다.
*/
const coachRunSource = readFileSync(resolve(process.cwd(), 'supabase/functions/coach-run/index.ts'), 'utf8')

const REMOVED_MEMORY_KEYS = ['prescriptionTemplates', 'knownIssues', 'runningStyle', 'heatStrategy', 'longRunStrategy', 'currentVolumeNote']

describe('coach-run 레거시 메모리 키 차단', () => {
  it('컨텍스트 진입 지점에서 제거된 키를 블롭에서 떼어낸다', () => {
    const sanitizer = coachRunSource.slice(
      coachRunSource.indexOf('function sanitizeMemoryHeartRateCeilings'),
      coachRunSource.indexOf('function sanitizeMemoryHeartRateCeilings') + 1200
    )
    expect(sanitizer).toContain("delete atp.prescriptionTemplates")
    for (const key of ['knownIssues', 'runningStyle', 'heatStrategy', 'longRunStrategy', 'currentVolumeNote']) {
      expect(sanitizer).toContain(key)
    }
  })

  it('제거된 키를 다시 읽거나 쓰지 않는다 — 지침·정규화·스키마 어디에도 없다', () => {
    for (const key of REMOVED_MEMORY_KEYS) {
      // 삭제 라인(delete/legacyKey 목록)과 설명 주석만 허용한다.
      const offenders = coachRunSource
        .split('\n')
        .filter((line) => line.includes(key))
        .filter((line) => !line.trimStart().startsWith('//'))
        .filter((line) => !line.includes('delete atp.') && !line.includes('legacyKey'))
      expect(offenders).toEqual([])
    }
  })
})

/*
  #795 실측 함정: 꼬리표가 `context.upcomingSchedule`(structuredCoachContext 로 가려지는 필드)을 읽으면
  general 분류 턴에서 통째로 사라진다 — 같은 질문을 "다시 물어볼게"로 감싸자 분류가 갈려 옛 숫자로
  되돌아갔다. 세션 액션 4종이 같은 함정으로 구조적으로 폐기됐던 전례가 있다.
*/
describe('실행 지침 꼬리표는 축약되지 않은 원본을 본다 (#795)', () => {
  it('scheduleProposalGate.upcomingTargets 를 먼저 넘긴다', () => {
    const call = coachRunSource.slice(
      coachRunSource.indexOf('buildExecutionGuideTail('),
      coachRunSource.indexOf('buildExecutionGuideTail(') + 400
    )
    expect(call).toContain('scheduleProposalGate?.upcomingTargets')
    // 가려지는 필드를 유일한 출처로 쓰면 안 된다(폴백으로만 허용).
    expect(call.indexOf('scheduleProposalGate?.upcomingTargets')).toBeLessThan(call.indexOf('?.upcomingSchedule'))
  })
})
