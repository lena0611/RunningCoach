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

  // 처방 템플릿은 제거됐다(2026-09-07) — stale 숫자 정리는 남아 있는 저장 텍스트에 계속 적용돼야 한다.
  it('normalizeTrainingMemory가 저장된 준수 패턴·세션 가이드의 stale 165를 정리한다', () => {
    const normalized = normalizeTrainingMemory({
      adaptiveTrainingProfile: {
        methodologyVersion: 'x',
        updatedAt: null,
        compliancePatterns: ['Tempo 심박 165bpm 경계를 자주 넘긴다'],
        sessionGuides: [
          {
            type: 'Tempo',
            boundary: '최대 심박 165bpm 넘기지 않기',
            adjustment: 'maintain',
            evidence: '2회 이상 165 이하로 안정',
            nextCheck: '다음 Tempo에서 165bpm 확인'
          }
        ]
      }
    } as never)
    expect(normalized.adaptiveTrainingProfile.compliancePatterns.join(' ')).not.toMatch(/165/)
    const guide = normalized.adaptiveTrainingProfile.sessionGuides[0]
    expect(`${guide.boundary} ${guide.evidence} ${guide.nextCheck}`).not.toMatch(/165/)
  })
})
