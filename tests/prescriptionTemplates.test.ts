import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  defaultPrescriptionTemplates,
  deriveWorkoutLines,
  normalizeTrainingMemory,
  prescriptionTemplateSlugs,
  type WorkoutSegmentKind
} from '@/entities/training-memory/model'

const VALID_KINDS: WorkoutSegmentKind[] = ['warmup', 'main', 'interval', 'cooldown', 'note']

const migrationSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202606150002_training_prescription_library.sql'),
  'utf8'
)

describe('defaultPrescriptionTemplates (#327)', () => {
  it('canonical slug 집합과 템플릿 id가 정확히 일치한다', () => {
    expect(defaultPrescriptionTemplates).toHaveLength(prescriptionTemplateSlugs.length)
    expect(defaultPrescriptionTemplates.map((template) => template.id)).toEqual([...prescriptionTemplateSlugs])
  })

  it('각 템플릿의 protocol.segments는 유효한 kind와 비지 않은 detail을 가진다', () => {
    for (const template of defaultPrescriptionTemplates) {
      expect(template.protocol.segments.length).toBeGreaterThan(0)
      for (const segment of template.protocol.segments) {
        expect(VALID_KINDS).toContain(segment.kind)
        expect(segment.detail.trim().length).toBeGreaterThan(0)
        if (segment.reps != null) expect(segment.reps).toBeGreaterThan(0)
        if (segment.durationMin != null) expect(segment.durationMin).toBeGreaterThan(0)
      }
    }
  })

  it('workout 줄은 protocol에서 파생한 값과 항상 일치한다(단일 진실 출처)', () => {
    for (const template of defaultPrescriptionTemplates) {
      expect(template.workout).toEqual(deriveWorkoutLines(template.protocol))
    }
  })

  it('Easy + Strides는 구조화된 인터벌(reps 8, 워밍업/쿨다운)을 가진다', () => {
    const strides = defaultPrescriptionTemplates.find((template) => template.id === 'easy-strides-8x')
    expect(strides).toBeDefined()
    const interval = strides!.protocol.segments.find((segment) => segment.kind === 'interval')
    expect(interval?.reps).toBe(8)
    expect(strides!.protocol.segments.find((segment) => segment.kind === 'warmup')?.durationMin).toBe(10)
    expect(strides!.protocol.segments.find((segment) => segment.kind === 'cooldown')?.durationMin).toBe(15)
  })
})

describe('코드 ↔ DB 시드 동기화 가드 (#327)', () => {
  it('마이그레이션이 8종 template_slug를 모두 시드한다', () => {
    for (const slug of prescriptionTemplateSlugs) {
      expect(migrationSql).toContain(`'${slug}'`)
    }
  })

  it('protocol jsonb 컬럼과 template_slug 컬럼을 추가한다', () => {
    expect(migrationSql).toContain('add column if not exists protocol jsonb')
    expect(migrationSql).toContain('add column if not exists template_slug text')
  })
})

describe('normalizeTrainingMemory protocol 라운드트립 (#327)', () => {
  it('기본 메모리 정규화 후에도 protocol이 보존되고 workout과 일치한다', () => {
    const memory = normalizeTrainingMemory({ goal: '10km 60분 달성' } as never)
    const templates = memory.adaptiveTrainingProfile.prescriptionTemplates
    expect(templates.length).toBeGreaterThan(0)
    for (const template of templates) {
      expect(template.protocol.segments.length).toBeGreaterThan(0)
      expect(template.workout).toEqual(deriveWorkoutLines(template.protocol))
    }
  })

  it('protocol이 없는 legacy 템플릿은 workout 줄에서 note 세그먼트로 복원된다', () => {
    const memory = normalizeTrainingMemory({
      goal: '10km 60분 달성',
      adaptiveTrainingProfile: {
        methodologyVersion: 'legacy',
        updatedAt: null,
        compliancePatterns: [],
        sessionGuides: [],
        prescriptionTemplates: [
          {
            id: 'legacy-easy',
            name: 'Legacy Easy',
            phase: 'Base',
            sessionType: 'Easy',
            purpose: '레거시 호환 확인',
            workout: ['느리게', '편하게'],
            useWhen: [],
            avoidWhen: [],
            progressionTrigger: ''
          }
        ]
      }
    } as never)
    const legacy = memory.adaptiveTrainingProfile.prescriptionTemplates.find((template) => template.id === 'legacy-easy')
    expect(legacy).toBeDefined()
    expect(legacy!.protocol.segments.map((segment) => segment.kind)).toEqual(['note', 'note'])
    expect(legacy!.workout).toEqual(['느리게', '편하게'])
  })
})
