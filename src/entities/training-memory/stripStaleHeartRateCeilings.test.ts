import { describe, expect, it } from 'vitest'
import { stripStaleHeartRateCeilings, normalizeTrainingMemory } from './model'

describe('stripStaleHeartRateCeilings', () => {
  it('처방 텍스트의 stale 심박 상한 숫자를 일반 표현으로 치환한다', () => {
    expect(stripStaleHeartRateCeilings('최대 심박 165bpm 넘기지 않기')).toBe('최대 심박 템포 상한 넘기지 않기')
    expect(stripStaleHeartRateCeilings('심박 145bpm 이하 우선')).toBe('심박 이지 상한 이하 우선')
    expect(stripStaleHeartRateCeilings('2회 이상 165 이하로 안정되면')).toBe('2회 이상 템포 상한 이하로 안정되면')
    expect(stripStaleHeartRateCeilings('심박을 130 이하로 잘 누르는 편')).toBe('심박을 회복 상한 이하로 잘 누르는 편')
  })

  it('심박 상한이 아닌 숫자(페이스/거리/날짜/세트)는 건드리지 않는다', () => {
    expect(stripStaleHeartRateCeilings('토요일 Long Run을 12~15km로 안정화')).toBe('토요일 Long Run을 12~15km로 안정화')
    expect(stripStaleHeartRateCeilings('페이스 6분02초 → 6분27초')).toBe('페이스 6분02초 → 6분27초')
    expect(stripStaleHeartRateCeilings('최근 7/14/30일 누적')).toBe('최근 7/14/30일 누적')
    expect(stripStaleHeartRateCeilings('평균 150bpm 유지')).toBe('평균 150bpm 유지') // 130/145/165/168 외 숫자는 유지
  })

  it('normalizeTrainingMemory가 저장된 처방 템플릿/주간 루틴의 stale 165를 정리한다', () => {
    const normalized = normalizeTrainingMemory({
      weeklyPattern: ['목요일: Tempo, max 165bpm 넘기지 않기'],
      adaptiveTrainingProfile: {
        methodologyVersion: 'x',
        updatedAt: null,
        prescriptionTemplates: [
          {
            id: 'tempo-ceiling-165',
            name: 'Tempo 상한주',
            phase: 'Build',
            sessionType: 'Tempo',
            purpose: '역치 지속력',
            workout: ['워밍업 후 Tempo', '최대 심박 165bpm 넘기지 않기'],
            useWhen: ['목요일'],
            avoidWhen: ['Tempo 중반 전에 165를 넘길 때'],
            progressionTrigger: '2회 이상 165 이하로 안정되면 상향'
          }
        ]
      }
    } as never)
    expect(normalized.weeklyPattern[0]).not.toMatch(/165/)
    const tpl = normalized.adaptiveTrainingProfile.prescriptionTemplates.find((t) => t.sessionType === 'Tempo')
    expect(tpl?.workout.join(' ')).not.toMatch(/165/)
    expect(tpl?.avoidWhen.join(' ')).not.toMatch(/165/)
    expect(tpl?.progressionTrigger).not.toMatch(/165/)
  })
})
