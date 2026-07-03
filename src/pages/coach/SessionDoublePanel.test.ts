import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ScheduledSession } from '@/entities/training-schedule/model'
import SessionDoublePanel from './SessionDoublePanel.vue'

/**
 * 더블 minGap 동적 안내(#462 v1)의 **실제 렌더 검증** — 오전 런 종료시각에 따라 gap 바의
 * 문구와 판정 색 클래스(gap-blocked/tight/ok)가 맞게 나오는지 컴포넌트를 마운트해 확인한다.
 * 순수 로직(evaluateDoubleGap)은 doubleSession.test.ts 가, 여기선 로직→템플릿 배선·렌더를 본다.
 */
function session(o: Partial<ScheduledSession> & { slot: 'AM' | 'PM' }): ScheduledSession {
  return {
    id: o.id ?? `s-${o.slot}`,
    userId: 'u1',
    goalId: 'g1',
    date: '2026-06-22',
    phase: 'Build' as ScheduledSession['phase'],
    sessionType: o.sessionType ?? (o.slot === 'AM' ? 'Tempo' : 'Easy'),
    slot: o.slot,
    keySession: o.keySession ?? false,
    prescription: { distanceKm: null, durationMin: 25, paceRange: '', note: '' },
    status: o.status ?? 'planned',
    source: 'manual',
    runId: o.runId ?? null,
    createdAt: '',
    updatedAt: ''
  }
}

const am = session({ slot: 'AM', sessionType: 'Tempo', keySession: true })
const pm = session({ slot: 'PM', sessionType: 'Easy' })

/** 지금 기준 h 시간 전 종료(ISO). 컴포넌트는 now 기준으로 gap 을 계산한다. */
function isoHoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}

function gapBar(amEndAt: string | null) {
  return mount(SessionDoublePanel, { props: { amSession: am, pmSession: pm, amEndAt } }).find('.gap-bar')
}

describe('SessionDoublePanel — minGap 동적 안내 렌더(#462)', () => {
  it('오전 런 미완료(amEndAt null)면 일반 안내 + 판정 색 클래스 없음', () => {
    const bar = gapBar(null)
    expect(bar.text()).toContain('최소 5시간')
    expect(bar.classes()).not.toContain('gap-blocked')
    expect(bar.classes()).not.toContain('gap-tight')
    expect(bar.classes()).not.toContain('gap-ok')
  })

  it('오전 종료 2h 전이면 blocked + "아직 일러요"', () => {
    const bar = gapBar(isoHoursAgo(2))
    expect(bar.classes()).toContain('gap-blocked')
    expect(bar.text()).toContain('아직 일러요')
  })

  it('오전 종료 6h 전이면 tight(빠듯)', () => {
    const bar = gapBar(isoHoursAgo(6))
    expect(bar.classes()).toContain('gap-tight')
  })

  it('오전 종료 8h 전이면 ok + "충분히 쉬었어요"', () => {
    const bar = gapBar(isoHoursAgo(8))
    expect(bar.classes()).toContain('gap-ok')
    expect(bar.text()).toContain('충분히 쉬었어요')
  })
})
