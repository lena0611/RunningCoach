import { describe, expect, it } from 'vitest'
import { detectAnswerQualitySignals, hasQualityViolation } from '../supabase/functions/coach-run/answerQuality'

/**
 * #825 — 코치 답변 품질 신호 관측.
 *
 * 케이스는 대부분 #821 에서 **실제로 나온 답변 원문**이다. 지어낸 문장으로 채우면 검출기가
 * 현실과 어긋나므로, 라이브 QA 로그에서 그대로 가져온다.
 */
describe('내부 상태값 노출', () => {
  it('실제로 샜던 문장을 잡는다', () => {
    const real = '우측 족저근막/발바닥이 아직 monitoring이고, 일상 보행에서도 통증 신호가 있었어요.'
    expect(detectAnswerQualitySignals(real).internalTerms).toContain('monitoring')
  })

  it('고친 뒤 문장은 깨끗하다', () => {
    const fixed = '우측 족저근막이 아직 관찰 중이라, 스트라이드는 통증이 없는 날부터 붙이면 돼요.'
    expect(detectAnswerQualitySignals(fixed).internalTerms).toEqual([])
  })

  it('세션 타입 이름은 위반이 아니다 — 앱 화면에 그대로 쓰는 말이다', () => {
    const normal = '최근 Easy 와 Recovery, LSD 를 보면 심박이 잘 눌려 있어요. Tempo 는 다음 주예요.'
    const signals = detectAnswerQualitySignals(normal)
    expect(signals.internalTerms).toEqual([])
    expect(signals.bannedPhrases).toEqual([])
  })
})

describe('금지 은유', () => {
  // 어형만 바꿔 세 번 샜다 — 활용형을 통째로 받는지 본다.
  const leaked = [
    '발이 조용한지 확인하는 날이에요.',
    '이지런은 상태가 조용할 때만 가져가면 됩니다.',
    '스트라이드는 통증이 완전히 조용할 때까지 생략하세요.',
    '발바닥이 조용하게 이어질 때만 상향을 봐요.',
    '통증이 조용해지면 다시 붙여도 됩니다.'
  ]
  for (const sentence of leaked) {
    it(`"${sentence.slice(0, 18)}…" 를 잡는다`, () => {
      expect(detectAnswerQualitySignals(sentence).bannedPhrases).toContain('조용하다')
    })
  }

  it('밀어붙이기를 잡는다', () => {
    const real = '지금처럼 체중부하 통증이 있으면 러닝으로 밀어붙이기보다 먼저 보는 게 맞습니다.'
    expect(detectAnswerQualitySignals(real).bannedPhrases).toContain('밀어붙이다')
  })

  it('고친 표현은 깨끗하다', () => {
    const fixed = '스트라이드는 착지 통증이 없고 다음날 아침 반응이 올라오지 않는 날부터 붙이면 돼요.'
    expect(detectAnswerQualitySignals(fixed).bannedPhrases).toEqual([])
  })
})

describe('형식 신호', () => {
  it('목록과 표를 구분해 센다', () => {
    const withList = '기준은 간단해요.\n- 아침 첫발 통증이 0~1/5\n- 일상 보행에서 통증이 안 늘어남'
    expect(detectAnswerQualitySignals(withList).usedList).toBe(true)
    expect(detectAnswerQualitySignals(withList).usedTable).toBe(false)

    const withTable = '| 구분 | 신호 |\n| --- | --- |\n| 족저근막 | 아침 첫 발 |'
    expect(detectAnswerQualitySignals(withTable).usedTable).toBe(true)
  })

  it('번호 목록도 목록으로 센다', () => {
    expect(detectAnswerQualitySignals('1. 웜업\n2. 본런\n3. 쿨다운').usedList).toBe(true)
  })

  it('## 소제목을 센다', () => {
    expect(detectAnswerQualitySignals('좋아요.\n\n## 조심할 점\n무리하지 마세요.').headings).toBe(1)
  })
})

describe('이스케이프된 줄바꿈', () => {
  it('글자 그대로 남은 역슬래시-n 을 센다', () => {
    const real = '누르면 딱 한 곳이 아픈 느낌이죠.\\n\\n지금처럼 체중부하 통증이 있는 상태는 보수적으로 봐야 합니다.'
    expect(detectAnswerQualitySignals(real).escapedNewlines).toBe(2)
  })

  it('진짜 줄바꿈은 세지 않는다', () => {
    expect(detectAnswerQualitySignals('첫 문단.\n\n둘째 문단.').escapedNewlines).toBe(0)
  })
})

describe('문체 혼용', () => {
  it('앱이 만든 평서체 문장을 그대로 붙여넣은 경우를 잡는다', () => {
    // #821 실제 사례: trustLayerNote('~다'체)를 "~요"체 답변에 그대로 이어붙였다.
    const real =
      '지금 강도는 체크엔 적당해요. 강도를 줄이는 건 목표 포기가 아니라 목표 보호다. 목표 달성 가능성은 유지된다.'
    expect(detectAnswerQualitySignals(real).styleMixed).toBe(true)
  })

  it('존댓말로 일관된 답변은 위반이 아니다', () => {
    const consistent =
      '체크런으로는 지금도 괜찮아요. 다만 강도는 Easy 이하로 잡는 게 맞습니다. 통증이 커지면 바로 중단하세요.'
    expect(detectAnswerQualitySignals(consistent).styleMixed).toBe(false)
  })

  it('"습니다"가 섞여도 존댓말끼리는 혼용이 아니다', () => {
    expect(detectAnswerQualitySignals('괜찮아요. 무리하지 않는 게 맞습니다.').styleMixed).toBe(false)
  })
})

describe('코드블록은 검사에서 제외한다', () => {
  it('수치 정렬 블록 안의 문자는 신호로 세지 않는다', () => {
    const withCode = '구간 흐름이에요.\n```\n페이스 8:56 → 9:50\nstatus: active\n```\n전체적으로 안정적이에요.'
    expect(detectAnswerQualitySignals(withCode).internalTerms).toEqual([])
  })
})

describe('위반 판정', () => {
  const clean = detectAnswerQualitySignals('우측 족저근막이 관찰 중이라 통증이 없는 날부터 붙이면 돼요.')

  it('깨끗하면 위반이 아니다', () => {
    expect(hasQualityViolation(clean, true)).toBe(false)
  })

  it('## 헤더는 대화 턴에서만 위반이다 — report 모드는 정상이다', () => {
    const withHeading = detectAnswerQualitySignals('## 핵심 지표\n거리 4.61km')
    expect(hasQualityViolation(withHeading, true)).toBe(true)
    expect(hasQualityViolation(withHeading, false)).toBe(false)
  })

  it('금지 어휘는 모드와 무관하게 위반이다', () => {
    const banned = detectAnswerQualitySignals('발이 조용한지 보세요.')
    expect(hasQualityViolation(banned, false)).toBe(true)
  })
})
