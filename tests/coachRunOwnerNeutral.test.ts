import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 코치 지침에 특정 사용자(개발자) 사정이 박히지 않게(#878 A2).
 *
 * 리포트 지침이 한 사람의 루틴을 기본값처럼 말하고 있었다 — "토요일 12~15km 격주", "8개의 스트라이드",
 * "배우자 동행런 심박 125~128", "과거 좌측 근위부 햄스트링 이슈", "Workoutdoors 세팅·145bpm".
 * 걷기·뛰기 2주차 초보에게도 그대로 실렸다. 지침 문자열은 타입·테스트에 안 걸리므로 소스를 직접 본다.
 * 주석은 옛 문구를 인용하므로 지우고 본다(coachInstructionContradictions 와 같은 방식).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

const INDEX_SRC = stripComments(readFileSync(resolve(__dirname, '../supabase/functions/coach-run/index.ts'), 'utf-8'))

const OWNER_TRACES = [
  'Workoutdoors',
  '좌측 근위부 햄스트링',
  '12~15km',
  '145bpm',
  '165bpm',
  '와이프 동반주',
  '배우자 동행런',
  '오른발 발바닥',
  '8개의 스트라이드',
  '토요일 Long Run'
]

describe('coach-run 지침에 개발자 사정 없음 (#878 A2)', () => {
  it.each(OWNER_TRACES)('"%s" 가 지침에 없다', (trace) => {
    expect(INDEX_SRC.includes(trace)).toBe(false)
  })
})

// Easy 비율 경계는 웹(paceBands)과 코치(coach-run easyRatio)가 같아야 한다 — 다르면 카드와 코치가 다른 %를 말한다.
describe('Easy 비율 경계 미러 (#878 A5)', () => {
  it('coach-run EASY_FLOOR_RATIO 가 웹 paceBands easyFloor 와 같다', async () => {
    const { paceBandsFor } = await import('@/shared/lib/paceBands')
    const ratio = Number(INDEX_SRC.match(/const EASY_FLOOR_RATIO = ([\d.]+)/)?.[1])
    expect(paceBandsFor(1000)?.easyFloorSec).toBe(Math.round(1000 * ratio))
  })
})
