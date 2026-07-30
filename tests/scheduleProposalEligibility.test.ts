import { describe, expect, it } from 'vitest'
import { canIntensifySession } from '@/shared/lib/coaching/scheduleProposalEligibility'
import type { CoachAdaptiveProgressSummary } from '@/shared/lib/coaching/coachAdaptiveProgress'

type Status = CoachAdaptiveProgressSummary['criteria'][number]['status']

function progress(overrides: Partial<Record<string, Status>> = {}): CoachAdaptiveProgressSummary {
  const statuses: Record<string, Status> = {
    'easy-hr-stability': 'ready',
    'tempo-ceiling-quality': 'ready',
    'long-run-durability': 'ready',
    'injury-recovery-gate': 'ready',
    ...overrides
  }
  return {
    currentPhase: 'Base',
    criteria: Object.entries(statuses).map(([id, status]) => ({ id, label: id, status, evidence: '' })),
    readyCount: Object.values(statuses).filter((s) => s === 'ready').length,
    allReady: Object.values(statuses).every((s) => s === 'ready'),
    phaseProposal: { shouldTransition: false, toPhase: null, reason: '', blockers: [] },
    adapted: { easyCeilingBpm: null, longRunDriftTolerancePercent: 5, recoveryRestDays: 1 }
  }
}

describe('canIntensifySession (#639 G7 웹 판정)', () => {
  it('판정 근거가 없으면 허용하지 않는다 (fail-safe deny)', () => {
    expect(canIntensifySession('Easy', null)).toBe(false)
  })

  it('사다리 끝이면 허용하지 않는다 — 올릴 곳이 없으므로 카드도 띄우지 않는다', () => {
    expect(canIntensifySession('Race', progress())).toBe(false)
    expect(canIntensifySession('Tempo', progress())).toBe(false)
  })

  describe('quality 승격(→ Tempo/Steady Long): 품질 기준이 ready 여야 한다 (SSOT §190·§202~208)', () => {
    it('Easy + Strides → Tempo 는 tempo 기준 ready 일 때만', () => {
      expect(canIntensifySession('Easy + Strides', progress())).toBe(true)
      expect(canIntensifySession('Easy + Strides', progress({ 'tempo-ceiling-quality': 'watch' }))).toBe(false)
      expect(canIntensifySession('Easy + Strides', progress({ 'tempo-ceiling-quality': 'blocked' }))).toBe(false)
    })

    it('LSD → Steady Long 도 같은 기준을 적용한다', () => {
      expect(canIntensifySession('LSD', progress())).toBe(true)
      expect(canIntensifySession('LSD', progress({ 'tempo-ceiling-quality': 'watch' }))).toBe(false)
    })
  })

  describe('이지 계열 승격: blocked 만 막는다 (watch = 무데이터/경계는 통과 — #455 선례)', () => {
    it('Easy → Easy + Strides 는 표본 부족(watch)이어도 허용한다', () => {
      const sparse = progress({
        'easy-hr-stability': 'watch',
        'tempo-ceiling-quality': 'watch',
        'long-run-durability': 'watch'
      })
      expect(canIntensifySession('Easy', sparse)).toBe(true)
    })

    it('Recovery → Easy 도 동일', () => {
      expect(canIntensifySession('Recovery', progress({ 'tempo-ceiling-quality': 'watch' }))).toBe(true)
    })

    it('blocked 기준이 하나라도 있으면 막는다', () => {
      expect(canIntensifySession('Easy', progress({ 'easy-hr-stability': 'blocked' }))).toBe(false)
      expect(canIntensifySession('Easy', progress({ 'long-run-durability': 'blocked' }))).toBe(false)
    })
  })

  it('부상/회복 게이트가 blocked 면 방향 무관 상향 금지', () => {
    const injured = progress({ 'injury-recovery-gate': 'blocked' })
    expect(canIntensifySession('Easy', injured)).toBe(false)
    expect(canIntensifySession('Easy + Strides', injured)).toBe(false)
  })
})
