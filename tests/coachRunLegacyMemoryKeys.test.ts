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

const REMOVED_MEMORY_KEYS = ['prescriptionTemplates', 'knownIssues', 'runningStyle', 'heatStrategy']

describe('coach-run 레거시 메모리 키 차단', () => {
  it('컨텍스트 진입 지점에서 제거된 키를 블롭에서 떼어낸다', () => {
    const sanitizer = coachRunSource.slice(
      coachRunSource.indexOf('function sanitizeMemoryHeartRateCeilings'),
      coachRunSource.indexOf('function sanitizeMemoryHeartRateCeilings') + 1200
    )
    expect(sanitizer).toContain("delete atp.prescriptionTemplates")
    for (const key of ['knownIssues', 'runningStyle', 'heatStrategy']) {
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
