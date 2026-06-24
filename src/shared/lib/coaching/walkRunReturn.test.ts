import { describe, expect, it } from 'vitest'
import type { TrainingInjuryItem } from '@/entities/training-memory/model'
import type { RunType } from '@/entities/run/model'
import {
  WALK_RUN_STAGES,
  WALK_RUN_SESSION_TYPES,
  isAcutePainfulInjury,
  shouldPrescribeWalkRun,
  walkRunExecutionSteps,
  walkRunCautions
} from '@/shared/lib/coaching/walkRunReturn'

function injury(status: TrainingInjuryItem['status'], severity: number | null, area = '좌측 아킬레스'): TrainingInjuryItem {
  return { status, severity, area } as TrainingInjuryItem
}

describe('isAcutePainfulInjury (#501 walk-run 적용 대상)', () => {
  it('status active + severity ≥ 2 만 급성 통증성으로 본다', () => {
    expect(isAcutePainfulInjury(injury('active', 2))).toBe(true)
    expect(isAcutePainfulInjury(injury('active', 3))).toBe(true)
    expect(isAcutePainfulInjury(injury('active', 5))).toBe(true)
  })
  it('경증(severity ≤ 1)·미상은 제외 — 연속 Easy 유지', () => {
    expect(isAcutePainfulInjury(injury('active', 1))).toBe(false)
    expect(isAcutePainfulInjury(injury('active', 0))).toBe(false)
    expect(isAcutePainfulInjury(injury('active', null))).toBe(false)
  })
  it('monitoring/resolved/archived 는 제외(관리·안정화 중 → 과처방 방지)', () => {
    expect(isAcutePainfulInjury(injury('monitoring', 4))).toBe(false)
    expect(isAcutePainfulInjury(injury('resolved', 5))).toBe(false)
    expect(isAcutePainfulInjury(injury('archived', 5))).toBe(false)
  })
  it('부상 없으면 false', () => {
    expect(isAcutePainfulInjury(null)).toBe(false)
    expect(isAcutePainfulInjury(undefined)).toBe(false)
  })
})

describe('shouldPrescribeWalkRun (저강도 세션 + 급성 통증성 부상)', () => {
  it('급성 통증성 부상 + 저강도 세션이면 적용', () => {
    for (const t of WALK_RUN_SESSION_TYPES) {
      expect(shouldPrescribeWalkRun(injury('active', 2), t)).toBe(true)
    }
  })
  it('품질·한계시험·Easy+Strides 세션은 제외(스트라이드/cautions/하향이 별도 처리)', () => {
    expect(shouldPrescribeWalkRun(injury('active', 3), 'Tempo')).toBe(false)
    expect(shouldPrescribeWalkRun(injury('active', 3), 'Race')).toBe(false)
    // Easy + Strides 는 computeStrides 의 부상 감축/보류 로직을 유지(복귀 램프가 Easy 로 강등 → walk-run 은 그 Easy 에 얹힘)
    expect(shouldPrescribeWalkRun(injury('active', 2), 'Easy + Strides')).toBe(false)
  })
  it('부상 조건 미충족이면 저강도여도 미적용', () => {
    expect(shouldPrescribeWalkRun(injury('monitoring', 4), 'Easy')).toBe(false)
    expect(shouldPrescribeWalkRun(injury('active', 1), 'Easy')).toBe(false)
    expect(shouldPrescribeWalkRun(null, 'Easy' as RunType)).toBe(false)
  })
})

describe('WALK_RUN_STAGES (OSU Wexner 5단계 사다리)', () => {
  it('P1→P5, 뛰기 비중이 단조 증가하고 P5는 연속주', () => {
    expect(WALK_RUN_STAGES.map((s) => s.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])
    expect(WALK_RUN_STAGES[0]).toMatchObject({ walkMin: 4, runMin: 1 })
    expect(WALK_RUN_STAGES[3]).toMatchObject({ walkMin: 1, runMin: 4 })
    expect(WALK_RUN_STAGES[4]).toMatchObject({ walkMin: 0, runMin: 30 })
    // 뛰기 분이 비감소
    for (let i = 1; i < WALK_RUN_STAGES.length; i++) {
      expect(WALK_RUN_STAGES[i].runMin).toBeGreaterThanOrEqual(WALK_RUN_STAGES[i - 1].runMin)
    }
  })
})

describe('walkRunExecutionSteps (제시형 프로토콜)', () => {
  it('웜업·본훈련·강도·진행·통증 정지를 항상 포함하고 통증 게이트를 명시', () => {
    const steps = walkRunExecutionSteps(injury('active', 2), 25)
    const labels = steps.map((s) => s.label)
    expect(labels).toEqual(expect.arrayContaining(['웜업', '본훈련(걷기-뛰기)', '강도', '진행', '통증 정지']))
    const join = steps.map((s) => s.detail).join(' ')
    expect(join).toContain('통증')
    expect(join).toContain('단계') // 통증 없이 단계 진행 규칙
    expect(join).toContain('25분') // durationMin 반영
  })

  it('durationMin 없으면 기본 20~30분 안내', () => {
    const join = walkRunExecutionSteps(injury('active', 2), null).map((s) => s.detail).join(' ')
    expect(join).toContain('20~30분')
  })

  it('severity ≥ 3 이면 의뢰/복귀 보류 안내를 본세트 앞에 추가', () => {
    const steps = walkRunExecutionSteps(injury('active', 4), 25)
    expect(steps.some((s) => s.label === '먼저' && /전문가|보류/.test(s.detail))).toBe(true)
  })

  it('severity 2 면 의뢰 안내(먼저)는 붙지 않는다', () => {
    const steps = walkRunExecutionSteps(injury('active', 2), 25)
    expect(steps.some((s) => s.label === '먼저')).toBe(false)
  })
})

describe('walkRunCautions', () => {
  it('통증 0 합격선 + redFlag 위험 신호 의뢰 문구를 severity 불문 항상 노출(§4 escape hatch)', () => {
    const lines = walkRunCautions()
    expect(lines.length).toBe(2)
    expect(lines[0]).toContain('통증 0')
    expect(lines.join(' ')).toMatch(/전문가|의료/)
    expect(lines.join(' ')).toMatch(/야간|부종|저림|방사통/) // redFlag 위험 신호 명시
  })
})
