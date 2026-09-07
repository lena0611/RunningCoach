import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTINE_TEMPLATES } from '@/shared/lib/coaching/initialWeeklyPattern'

/*
  옛 `prescriptionTemplates`(#327)를 걷어낸 자리다(2026-09-07).

  그 템플릿은 세션 실행 수치(워밍업 10분 · 20초 가속 x 8 · 쿨다운 15분)를 메모리에 복사해 뒀고,
  코치 SSOT(§Easy + Strides: 스트라이드는 **본런 끝에**, 반복수는 단계·VDOT·부상으로 산출)와
  어긋난 채로 코치 프롬프트에 실려 갔다. 실행 지침의 정본은 주기화 플랜 + sessionBriefing 이다.

  남은 카탈로그는 온보딩 루틴 미리보기용 이름·목적뿐이고, 여기 실행 수치가 다시 들어오지 않게
  잠근다. id 는 DB 시드(`training_prescription_rules.template_slug`)와 같은 값이라 바뀌면 안 된다.
*/
const migrationSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202606150002_training_prescription_library.sql'),
  'utf8'
)

describe('온보딩 루틴 카탈로그', () => {
  it('실행 수치를 담지 않는다 — 두 번째 진실 금지', () => {
    for (const template of ROUTINE_TEMPLATES) {
      expect(Object.keys(template).sort()).toEqual(['id', 'name', 'purpose', 'sessionType'])
      // 분·초·회·km·bpm 같은 실행 수치가 목적 문장에 섞이면 실행 지침을 여기서 말하는 셈이다.
      expect(template.purpose).not.toMatch(/\d+\s*(분|초|회|km|bpm)/)
    }
  })

  it('id 가 중복되지 않는다', () => {
    const ids = ROUTINE_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('코드 ↔ DB 시드 동기화 가드 (#327)', () => {
  it('마이그레이션이 카탈로그 slug를 모두 시드한다', () => {
    for (const template of ROUTINE_TEMPLATES) {
      expect(migrationSql).toContain(`'${template.id}'`)
    }
  })

  it('protocol jsonb 컬럼과 template_slug 컬럼을 추가한다', () => {
    expect(migrationSql).toContain('add column if not exists protocol jsonb')
    expect(migrationSql).toContain('add column if not exists template_slug text')
  })
})
