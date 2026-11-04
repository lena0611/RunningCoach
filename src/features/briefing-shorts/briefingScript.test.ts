import { describe, expect, it } from 'vitest'
import { defaultScheduledSessionPrescription, type ScheduledSession } from '@/entities/training-schedule/model'
import type { RunType } from '@/entities/run/model'
import { buildSessionBriefing } from '@/shared/lib/coaching/sessionBriefing'
import { buildBriefingScript, CLOSING_LINE, splitSubtitle, toSpeech } from './briefingScript'

function session(type: RunType): ScheduledSession {
  return {
    id: 's1', userId: 'u1', goalId: 'g1', date: '2026-11-04', phase: 'Build', sessionType: type, slot: null, keySession: false,
    prescription: { ...defaultScheduledSessionPrescription(), distanceKm: 8, durationMin: 50, paceRange: '6:10~6:40/km' },
    status: 'planned', source: 'generator', runId: null, createdAt: '', updatedAt: ''
  }
}

describe('buildBriefingScript', () => {
  it('자막은 화면 브리핑 문장의 조각일 뿐 — 새 숫자·문장을 만들지 않는다(여는 말·맺는 말 제외)', () => {
    const briefing = buildSessionBriefing(session('Easy + Strides'), { goal: null, injury: null, chronic: null, vdot: 45 })
    const lines = buildBriefingScript({ title: '이지 + 스트라이드', distanceKm: 8, briefing })
    const source = [briefing.keyPoint, ...briefing.execution.map((s) => `${s.label} — ${s.detail}`), briefing.targetsLine, ...briefing.cautions].join('\n')
    for (const line of lines.slice(1, -1)) {
      const body = line.text.replace(/^[^—]+ — /, '')
      expect(source).toContain(body)
    }
    expect(lines[0].text).toBe('오늘은 이지 + 스트라이드 8km예요.')
    expect(lines.at(-1)?.text).toBe(CLOSING_LINE)
  })

  it('핵심 → 단계 순서, 핵심과 겹치는 보조 단계(강도)는 읽지 않는다', () => {
    const briefing = buildSessionBriefing(session('Easy'), { goal: null, injury: null, chronic: null, vdot: 45 })
    const texts = buildBriefingScript({ title: '이지', distanceKm: 8, briefing }).map((l) => l.text)
    expect(texts[1]).toBe('심박 상한 이하로 대화가 가능한 강도 유지')
    expect(texts.some((t) => t.startsWith('웜업 — '))).toBe(true)
    expect(texts.some((t) => t.startsWith('본런 — '))).toBe(true)
    expect(texts.some((t) => t.startsWith('강도 — '))).toBe(false)
    expect(texts.indexOf(texts.find((t) => t.startsWith('웜업'))!)).toBeLessThan(texts.indexOf(texts.find((t) => t.startsWith('쿨다운'))!))
  })

  it('주의(더위·부상)는 빠짐없이 읽는다', () => {
    const briefing = buildSessionBriefing(session('Tempo'), {
      goal: null, injury: null, chronic: null, vdot: 45,
      heat: { hot: true, feltC: 31, humidity: 70, hour: 19, better: { hour: 21, feltC: 28 }, allDayHot: false } as never
    })
    const texts = buildBriefingScript({ title: '템포', distanceKm: 8, briefing }).map((l) => l.text)
    expect(texts).toContain('어지럼·구역·오한·혼동이 오면 숫자와 상관없이 즉시 멈추세요.')
  })

  it('받침에 맞춰 예요/이에요', () => {
    const briefing = buildSessionBriefing(session('Race'), { goal: null, injury: null, chronic: null })
    expect(buildBriefingScript({ title: '한계 시험', distanceKm: null, briefing })[0].text).toBe('오늘은 한계 시험이에요.')
    expect(buildBriefingScript({ title: '템포', distanceKm: null, briefing })[0].text).toBe('오늘은 템포예요.')
  })
})

describe('splitSubtitle', () => {
  it('문장 끝과 " — " 에서 자르고, 괄호 안은 자르지 않는다', () => {
    expect(splitSubtitle('심박 상한 이하로 유지 — 페이스보다 심박 안정(RPE·호흡 우선). 살짝 넘어도 편하면 OK.')).toEqual([
      '심박 상한 이하로 유지',
      '페이스보다 심박 안정(RPE·호흡 우선).',
      '살짝 넘어도 편하면 OK.'
    ])
    expect(splitSubtitle('50분 동안 편한 강도 (거리는 약 8km 기준. 참고) 끝')).toEqual(['50분 동안 편한 강도 (거리는 약 8km 기준. 참고) 끝'])
  })
})

describe('toSpeech', () => {
  it('발음만 바꾼다: 페이스·범위·단위·약어', () => {
    expect(toSpeech('페이스 6:10~6:40/km는 목표가 아니라 결과예요')).toBe('페이스 6분 10초에서 6분 40초는 목표가 아니라 결과예요')
    expect(toSpeech('본런 끝에 15~20초(70~100m) × 6회')).toBe('본런 끝에 15에서 20초 6회')
    expect(toSpeech('오늘은 이지 8km예요.')).toBe('오늘은 이지 8킬로예요.')
    expect(toSpeech('강도 판정은 RPE·호흡 우선')).toBe('강도 판정은 알피이, 호흡 우선')
    expect(toSpeech('살짝 넘어도 편하면 OK.')).toBe('살짝 넘어도 편하면 오케이.')
    expect(toSpeech('19시 기준 체감 31도·습도 70% — 같은 강도라도')).toBe('19시 기준 체감 31도, 습도 70퍼센트, 같은 강도라도')
  })
})
