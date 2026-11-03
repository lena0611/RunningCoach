import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 코치 지침에 특정 사용자(개발자) 사정이 박히지 않게(#878 A2).
 *
 * 리포트 지침이 한 사람의 루틴을 기본값처럼 말하고 있었다 — "토요일 12~15km 격주", "8개의 스트라이드",
 * "배우자 동행런 심박 125~128", "과거 좌측 근위부 햄스트링 이슈", "Workoutdoors 세팅·145bpm".
 * 걷기·뛰기 2주차 초보에게도 그대로 실렸다. 지침 문자열은 타입·테스트에 안 걸리므로 소스를 직접 본다.
 * 주석은 옛 문구를 인용하므로 지우고 본다(coachInstructionContradictions 와 같은 방식).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

const INDEX_SRC = stripComments(readFileSync(resolve(__dirname, '../supabase/functions/coach-run/index.ts'), 'utf-8'))

const OWNER_TRACES = [
  'Workoutdoors',
  '좌측 근위부 햄스트링',
  '12~15km',
  '145bpm',
  '165bpm',
  '와이프 동반주',
  '배우자 동행런',
  '오른발 발바닥',
  '8개의 스트라이드',
  '토요일 Long Run',
  // #878 B1·C3
  '발바닥 active',
  '복식호흡',
  '격주 Steady Long',
  '10km 이상 세션은'
]

describe('coach-run 지침에 개발자 사정 없음 (#878 A2)', () => {
  it.each(OWNER_TRACES)('"%s" 가 지침에 없다', (trace) => {
    expect(INDEX_SRC.includes(trace)).toBe(false)
  })
})

// 승급 조건 기본 문구는 웹과 코치가 같아야 한다 — 코치가 메모리를 새로 쓰면 이 문구가 저장돼 기억 탭에 그대로 보인다(#878 B1).
describe('승급 조건 기본 문구 (#878 B1)', () => {
  it('coach-run defaultProgressionCriteria 문구가 웹 기본값과 같다', async () => {
    const { defaultProgressionCriteria } = await import('@/entities/training-memory/model')
    const block = INDEX_SRC.match(/function defaultProgressionCriteria\(\)[\s\S]*?\n}\n/)?.[0] ?? ''
    const texts = [...block.matchAll(/(?:evidence|action): '([^']+)'/g)].map((match) => match[1])
    expect(texts).toEqual(defaultProgressionCriteria.flatMap((criterion) => [criterion.evidence, criterion.action]))
  })

  it('예전 기본 문구(웹 원본·coach-run 변형)로 저장된 메모리는 지금 문구로 읽힌다', async () => {
    const { defaultProgressionCriteria, normalizeTrainingMemory } = await import('@/entities/training-memory/model')
    // [웹 원본, coach-run 변형, 숫자만 지운 채 다시 저장된 형태(실계정 실측 2026-11-03)]
    const legacyEvidence = {
      'easy-hr-stability': [
        'Easy는 페이스보다 심박을 우선하며 145bpm 이하 유지가 기준이다.',
        'Easy는 페이스보다 심박을 우선하며 heartRateModel.easyCeilingBpm(이지 상한) 이하 유지가 기준이다.',
        'Easy는 페이스보다 심박을 우선하며 이지 상한 이하 유지가 기준이다.'
      ],
      'tempo-ceiling-quality': [
        'Tempo는 최대 심박 165bpm을 넘기지 않고 후반 급락이 없어야 한다.',
        'Tempo는 최대 심박이 heartRateModel.tempoCeilingBpm(템포 상한)을 넘기지 않고 후반 급락이 없어야 한다.',
        'Tempo는 최대 심박 템포 상한을 넘기지 않고 후반 급락이 없어야 한다.'
      ]
    } as Record<string, string[]>
    for (const variant of [0, 1, 2]) {
      const progressionCriteria = defaultProgressionCriteria.map((criterion) => ({
        ...criterion,
        status: 'ready' as const,
        evidence: criterion.id === 'long-run-durability'
          ? '10km 이상 세션은 후반 페이스 급락, 심박 드리프트, 다음날 회복 반응을 함께 본다.'
          : legacyEvidence[criterion.id]?.[variant] ?? criterion.evidence,
        action: criterion.id === 'long-run-durability' ? '회복이 안정되면 격주 Steady Long 비중을 조금 올린다.' : criterion.action
      }))
      const memory = normalizeTrainingMemory({ adaptiveTrainingProfile: { progressionCriteria } } as never)
      const healed = memory.adaptiveTrainingProfile.progressionCriteria
      expect(healed.map((criterion) => [criterion.evidence, criterion.action])).toEqual(
        defaultProgressionCriteria.map((criterion) => [criterion.evidence, criterion.action])
      )
      expect(healed.every((criterion) => criterion.status === 'ready')).toBe(true)
    }
  })
})

// 기억 점수·태그의 부상 부위는 웹 부위 카탈로그를 다 덮어야 한다 — 예전엔 햄스트링·발바닥(개발자 부위)만 알았다(#878 C3).
describe('coach-run 기억 부위 키워드 (#878 C3)', () => {
  it('웹 injuryAreaCatalog 의 모든 부위가 INJURY_BODY_GROUPS 키워드에 걸린다', async () => {
    const { injuryAreaCatalog } = await import('@/entities/training-memory/injuryAreas')
    const block = INDEX_SRC.match(/const INJURY_BODY_GROUPS[\s\S]*?\n]\n/)?.[0] ?? ''
    const keywords = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1].toLowerCase())
    const uncovered = injuryAreaCatalog
      .filter((area) => !keywords.some((keyword) => `${area.label} ${area.keywords.join(' ')}`.toLowerCase().includes(keyword)))
      .map((area) => area.id)
    expect(uncovered).toEqual([])
  })
})

// 용어 안내 '심박존'은 고정 bpm 이 아니라 역치 비율이다 — 시드(정본)와 번들 fallback 이 같아야 한다(#878 B2).
describe('용어 안내 심박존 (#878 B2)', () => {
  it('fallback 설명에 고정 bpm 경계가 없고 최신 시드와 같다', async () => {
    const { GLOSSARY_FALLBACK_TERMS } = await import('@/entities/glossary/glossaryTerms')
    const fallback = GLOSSARY_FALLBACK_TERMS.find((term) => term.slug === 'hr-zones')?.detail ?? ''
    expect(fallback).not.toMatch(/\d{3}\s*~\s*\d{3}/)
    const seed = readFileSync(resolve(__dirname, '../supabase/migrations/202611030001_glossary_terms_hr_zones_personal.sql'), 'utf-8')
    expect(seed).toContain(fallback)
  })
})

// Easy 비율 경계는 웹(paceBands)과 코치(coach-run easyRatio)가 같아야 한다 — 다르면 카드와 코치가 다른 %를 말한다.
describe('Easy 비율 경계 미러 (#878 A5)', () => {
  it('coach-run EASY_FLOOR_RATIO 가 웹 paceBands easyFloor 와 같다', async () => {
    const { paceBandsFor } = await import('@/shared/lib/paceBands')
    const ratio = Number(INDEX_SRC.match(/const EASY_FLOOR_RATIO = ([\d.]+)/)?.[1])
    expect(paceBandsFor(1000)?.easyFloorSec).toBe(Math.round(1000 * ratio))
  })
})
