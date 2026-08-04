import { describe, expect, it } from 'vitest'
import { buildDataGapDirective, normalizeReportDataGapArgs, REPORT_DATA_GAP_REASONS } from '../supabase/functions/coach-run/dataGap'
import { detectUngroundedDataClaims } from '../supabase/functions/coach-run/ungroundedClaim'

describe('normalizeReportDataGapArgs — 모델의 실패 선언을 내부 종류로 매핑', () => {
  it('세 사유를 각각 내부 kind 로 옮긴다', () => {
    expect(normalizeReportDataGapArgs({ reason: 'missing_field', question: 'q' }).kind).toBe('unsupported_field')
    expect(normalizeReportDataGapArgs({ reason: 'beyond_tool', question: 'q' }).kind).toBe('beyond_tool')
    expect(normalizeReportDataGapArgs({ reason: 'ambiguous', question: 'q' }).kind).toBe('ambiguous_question')
  })

  it('모르는 사유는 되묻기(ambiguous)로 떨어진다 — 추정 답변보다 안전한 기본값', () => {
    expect(normalizeReportDataGapArgs({ reason: 'whatever' }).kind).toBe('ambiguous_question')
    expect(normalizeReportDataGapArgs(null).kind).toBe('ambiguous_question')
  })

  it('question·needed 는 길이를 자른다(로그 폭주 방지)', () => {
    const gap = normalizeReportDataGapArgs({ reason: 'beyond_tool', question: 'ㅁ'.repeat(600), needed: 'ㄴ'.repeat(400) })
    expect(gap.question.length).toBe(500)
    expect(gap.needed.length).toBe(300)
  })
})

describe('buildDataGapDirective — 종류별 응대를 코드가 고정한다', () => {
  it('필드 없음은 대체 답변 금지를 명시한다(습도→비 바꿔치기 차단)', () => {
    expect(buildDataGapDirective('unsupported_field')).toContain('바꿔 답하지 마라')
  })

  it('도구 표현력 부족은 머릿속 계산 금지를 명시한다', () => {
    expect(buildDataGapDirective('beyond_tool')).toContain('지어내지 마라')
  })

  it('애매한 질문은 되묻기를 지시한다', () => {
    expect(buildDataGapDirective('ambiguous_question')).toContain('되묻는다')
  })

  it('선언 가능한 사유 목록은 도구 스키마 enum 으로 쓰인다', () => {
    expect(REPORT_DATA_GAP_REASONS).toEqual(['missing_field', 'beyond_tool', 'ambiguous'])
  })
})

describe('detectUngroundedDataClaims — 도구 없는 과거 수치 주장만 잡는다(관측 전용 게이트)', () => {
  it('컨텍스트 밖 기간 + 과거 어미 + 단위 수치가 겹치면 잡는다', () => {
    const claims = detectUngroundedDataClaims('지난달에는 총 42.3km를 뛰었어요. 좋은 흐름입니다.')
    expect(claims).toHaveLength(1)
    expect(claims[0].period).toBe('지난달')
    expect(claims[0].quantity).toBe('42.3km')
  })

  it('"N달 전 M회" 형태도 잡는다', () => {
    const claims = detectUngroundedDataClaims('2달 전에는 14회 달렸고 페이스도 좋았습니다.')
    expect(claims).toHaveLength(1)
  })

  it('처방·권유는 잡지 않는다 — 미래형이라 과거 어미가 없다', () => {
    expect(detectUngroundedDataClaims('이번 주는 심박 138bpm 이하로 뛰세요. 30km까지만 갑시다.')).toHaveLength(0)
  })

  it('컨텍스트가 뒷받침하는 최근 창(recent7/14/30)은 잡지 않는다', () => {
    expect(detectUngroundedDataClaims('최근 30일 동안 62km를 뛰었네요.')).toHaveLength(0)
    expect(detectUngroundedDataClaims('최근 2주간 24km를 달렸습니다.')).toHaveLength(0)
  })

  it('PB·최고 기록 언급은 잡지 않는다 — achievements 컨텍스트가 근거다(실측 오탐 1건의 원인)', () => {
    expect(detectUngroundedDataClaims('지난달(6월)에 5K 28분32초 PB를 찍었고, 흐름이 좋아요.')).toHaveLength(0)
  })

  it('기간 없는 수치·수치 없는 회상은 잡지 않는다', () => {
    expect(detectUngroundedDataClaims('오늘은 5km를 뛰었네요.')).toHaveLength(0)
    expect(detectUngroundedDataClaims('지난달에는 꾸준히 달렸어요.')).toHaveLength(0)
  })

  it('불릿 항목은 문장으로 나눠 각각 판정한다', () => {
    const report = ['- 지난달: 42km 뛰었음', '- 이번 주 목표: 12km'].join('\n')
    const claims = detectUngroundedDataClaims(report)
    expect(claims).toHaveLength(1)
    expect(claims[0].sentence).toContain('지난달')
  })
})
