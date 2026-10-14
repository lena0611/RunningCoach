import { describe, expect, it } from 'vitest'
import { detectTreatmentMentions, resolveTreatmentDate } from '../supabase/functions/_shared/treatmentMention'

const today = '2026-10-14'

describe('detectTreatmentMentions — 받은 처치를 잡는다 (#850)', () => {
  it('실사례: 어제 뒷꿈치 스테로이드 주사', () => {
    expect(detectTreatmentMentions('어제 뒷꿈치에 스테로이드 주사를 맞았다', today)).toEqual([
      { kind: 'corticosteroid', treatedOn: '2026-10-13' }
    ])
  })

  it('실사례: 한 문장에 여러 처치(9/8)', () => {
    const found = detectTreatmentMentions('어제 정형외과에서 PDRN 주사, 크라시오 처방, 충격파 처방, 도수 치료를 받았다.', '2026-09-08')
    expect(found).toEqual([
      { kind: 'eswt', treatedOn: '2026-09-07' },
      { kind: 'pdrn', treatedOn: '2026-09-07' }
    ])
  })

  it('받은 뒤의 질문도 받은 사실은 남긴다', () => {
    expect(detectTreatmentMentions('뼈주사 맞았는데 이번 주 뛰어도 돼?', today)).toEqual([{ kind: 'corticosteroid', treatedOn: today }])
  })

  it('종류 모르는 주사는 injection 으로', () => {
    expect(detectTreatmentMentions('오늘 병원에서 발에 주사 맞고 왔어', today)).toEqual([{ kind: 'injection', treatedOn: today }])
  })

  it('충격파만 받았으면 주사로 따로 남기지 않는다', () => {
    expect(detectTreatmentMentions('그제 충격파 치료 받고 왔어', today)).toEqual([{ kind: 'eswt', treatedOn: '2026-10-12' }])
  })
})

describe('detectTreatmentMentions — 받지 않은 건 안 잡는다', () => {
  it.each([
    '스테로이드 주사 맞을까?',
    '충격파 치료 받아볼까 고민 중이야',
    '주사는 안 맞았어',
    '스테로이드 주사 맞은 적 있어?',
    '스테로이드 주사가 뭐야',
    '발바닥이 아파서 병원 가볼까 해'
  ])('%s', (note) => {
    expect(detectTreatmentMentions(note, today)).toEqual([])
  })
})

describe('resolveTreatmentDate', () => {
  it.each([
    ['오늘 맞았어', '2026-10-14'],
    ['어제 맞았어', '2026-10-13'],
    ['그저께 맞았어', '2026-10-12'],
    ['3일 전에 맞았어', '2026-10-11'],
    ['10월 2일에 맞았어', '2026-10-02'],
    ['12/28 에 맞았어', '2025-12-28']
  ])('%s → %s', (sentence, expected) => {
    expect(resolveTreatmentDate(sentence, today)).toBe(expected)
  })
})
