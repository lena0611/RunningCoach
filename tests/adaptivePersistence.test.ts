import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  adaptiveMetricTypes,
  mapAdaptiveMetricRow,
  mapPhaseHistoryRow,
  mapWeeklyPatternRow,
  toAdaptiveMetricUpsert,
  type AdaptiveMetric
} from '@/entities/training-memory/adaptivePersistence'

const migrationSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202606150003_adaptive_training_persistence.sql'),
  'utf8'
)

describe('mapAdaptiveMetricRow (#328)', () => {
  it('정상 row를 도메인 메트릭으로 매핑한다', () => {
    const metric = mapAdaptiveMetricRow({
      metric_type: 'tempo_ceiling',
      base_value: '160',
      adopted_value: 165,
      unit: 'bpm',
      evidence_run_ids: ['a', 'b', ''],
      status: 'adopted',
      adopted_at: '2026-06-01T00:00:00Z'
    })
    expect(metric).toEqual<AdaptiveMetric>({
      metricType: 'tempo_ceiling',
      baseValue: 160,
      adoptedValue: 165,
      unit: 'bpm',
      evidenceRunIds: ['a', 'b'],
      status: 'adopted',
      adoptedAt: '2026-06-01T00:00:00Z'
    })
  })

  it('알 수 없는 metric_type은 null로 스킵한다', () => {
    expect(mapAdaptiveMetricRow({ metric_type: 'bogus' })).toBeNull()
  })

  it('알 수 없는 status/unit은 기본값으로 정규화한다', () => {
    const metric = mapAdaptiveMetricRow({ metric_type: 'easy_ceiling', status: 'weird', unit: 'furlong' })
    expect(metric?.status).toBe('estimated')
    expect(metric?.unit).toBe('bpm')
    expect(metric?.baseValue).toBeNull()
    expect(metric?.evidenceRunIds).toEqual([])
  })

  it('4종 metric_type 모두 매핑된다', () => {
    for (const type of adaptiveMetricTypes) {
      expect(mapAdaptiveMetricRow({ metric_type: type })?.metricType).toBe(type)
    }
  })
})

describe('toAdaptiveMetricUpsert (#328)', () => {
  it('user_id를 주입하고 snake_case payload를 만든다', () => {
    const payload = toAdaptiveMetricUpsert(
      {
        metricType: 'recovery_cycle',
        baseValue: 2,
        adoptedValue: 3,
        unit: 'days',
        evidenceRunIds: ['r1'],
        status: 'watch',
        adoptedAt: null
      },
      'user-123'
    )
    expect(payload.user_id).toBe('user-123')
    expect(payload.metric_type).toBe('recovery_cycle')
    expect(payload.adopted_value).toBe(3)
    expect(payload.unit).toBe('days')
    expect(typeof payload.updated_at).toBe('string')
  })
})

describe('mapWeeklyPatternRow (#328)', () => {
  it('정상 row를 매핑하고 derived_from을 정규화한다', () => {
    const record = mapWeeklyPatternRow({
      version: 3,
      weekly_pattern: ['화: Easy', '목: Tempo'],
      derived_from: 'onboarding',
      status: 'active',
      created_at: '2026-06-10T00:00:00Z',
      retired_at: null
    })
    expect(record.version).toBe(3)
    expect(record.weeklyPattern).toEqual(['화: Easy', '목: Tempo'])
    expect(record.derivedFrom).toBe('onboarding')
    expect(record.status).toBe('active')
  })

  it('잘못된 version/derived_from/status는 기본값으로 떨어진다', () => {
    const record = mapWeeklyPatternRow({ version: 0, derived_from: 'aliens', status: 'paused' })
    expect(record.version).toBe(1)
    expect(record.derivedFrom).toBe('manual')
    expect(record.status).toBe('active')
    expect(record.weeklyPattern).toEqual([])
  })
})

describe('mapPhaseHistoryRow (#328)', () => {
  it('phase_name을 정규화하고 criteria status map을 거른다', () => {
    const record = mapPhaseHistoryRow({
      phase_name: 'Build',
      started_at: '2026-06-01T00:00:00Z',
      ended_at: null,
      transition_reason: 'Easy 안정',
      progression_criteria_status: { 'easy-hr-stability': 'ready', bogus: 42 }
    })
    expect(record.phaseName).toBe('Build')
    expect(record.progressionCriteriaStatus).toEqual({ 'easy-hr-stability': 'ready' })
  })

  it('알 수 없는 phase_name은 Base로 떨어진다', () => {
    expect(mapPhaseHistoryRow({ phase_name: 'Sprint' }).phaseName).toBe('Base')
  })
})

describe('마이그레이션 스키마 가드 (#328)', () => {
  it('3개 테이블을 생성한다', () => {
    expect(migrationSql).toContain('create table if not exists public.weekly_patterns')
    expect(migrationSql).toContain('create table if not exists public.adaptive_training_metrics')
    expect(migrationSql).toContain('create table if not exists public.training_phase_history')
  })

  it('세 테이블 모두 RLS를 켠다', () => {
    expect(migrationSql).toContain('alter table public.weekly_patterns enable row level security')
    expect(migrationSql).toContain('alter table public.adaptive_training_metrics enable row level security')
    expect(migrationSql).toContain('alter table public.training_phase_history enable row level security')
  })

  it('기존 tempoCeiling을 adaptive_training_metrics로 백필한다', () => {
    expect(migrationSql).toContain("'tempo_ceiling'")
    expect(migrationSql).toContain("tempoCeiling")
    expect(migrationSql).toContain('insert into public.adaptive_training_metrics')
  })
})
