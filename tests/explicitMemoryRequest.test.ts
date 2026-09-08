import { describe, expect, it } from 'vitest'
import { mentionsExplicitMemoryRequest } from '../supabase/functions/_shared/explicitMemoryRequest'

describe('mentionsExplicitMemoryRequest — 요청은 잡는다', () => {
  it.each([
    '이거 기억해줘',
    '나 다음 달에 제주도 가서 뛸 거야, 기억해둬',
    '더운 날엔 호흡을 더 믿고 싶어. 기억해.',
    '이건 잊지 마',
    '메모해줘 — 무릎은 아직 조심하고 싶어',
    '앞으로 기억하고 코칭에 반영해줘',
    '알아둬, 나는 아침 러닝을 못 해'
  ])('%s', (note) => {
    expect(mentionsExplicitMemoryRequest(note)).toBe(true)
  })
})

/*
  질문을 요청으로 읽으면 사용자가 기억을 **물어본** 턴마다 화이트리스트가 열려 엉뚱한 게 저장된다.
  실제로 이 세션에서 "너는 나에 대해 뭘 기억하고 있어?" 를 여러 번 물었다.
*/
describe('mentionsExplicitMemoryRequest — 질문은 요청이 아니다', () => {
  it.each([
    '너는 나에 대해 뭘 기억하고 있어?',
    '내 부상 히스토리 어떻게 기억해?',
    '뭘 기억하고 있나',
    '지금까지 기억하는 게 뭐야',
    '오늘 컨디션 어떻게 보면 될까?',
    '화요일 스트라이드 몇 회야?'
  ])('%s', (note) => {
    expect(mentionsExplicitMemoryRequest(note)).toBe(false)
  })

  it('빈 입력은 false', () => {
    expect(mentionsExplicitMemoryRequest('')).toBe(false)
    expect(mentionsExplicitMemoryRequest(null)).toBe(false)
    expect(mentionsExplicitMemoryRequest(undefined)).toBe(false)
  })
})

describe('mentionsExplicitMemoryRequest — 질문과 요청이 섞이면 요청으로 본다', () => {
  it('한 발화에 둘 다 있으면 요청 쪽을 살린다', () => {
    expect(mentionsExplicitMemoryRequest('뭘 기억하고 있어? 그리고 이건 기억해둬 — 오르막이 싫어')).toBe(true)
  })
})
