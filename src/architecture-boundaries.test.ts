import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 아키텍처 경계 래칫 (#397 P4, 경량판 — ESLint 미도입).
 *
 * FSD 의존성 규칙: import 는 위(app/pages/widgets/features/entities) → 아래(shared) 로만 흘러야 한다.
 * shared(최하위 범용층)가 entities(도메인)·features(상위)를 import 하는 건 **역방향**이다.
 *
 * 이 테스트는 기존 역방향 import 수를 **현재 베이스라인에 고정**한다. 새 위반이 늘면 실패한다
 * (새 코드가 구조를 더 망치는 것 차단). 역방향을 줄이면 **베이스라인을 그만큼 낮춰라**(래칫 다운).
 * 궁극적으로 0 → P1 도메인 코어 추출(별도 큰 작업) 시 청산. 방향 근거: 이슈 #397, decision-log.
 */

// 줄이면 이 숫자도 함께 낮춘다(절대 올리지 말 것 — 올려야 한다면 역방향을 만든 것).
const BASELINE = {
  sharedToEntities: 83,
  sharedToFeatures: 7
}

const sharedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shared')

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.(ts|vue)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) acc.push(p)
  }
  return acc
}

function countImports(pattern: RegExp): number {
  let n = 0
  for (const f of walk(sharedDir)) {
    n += (fs.readFileSync(f, 'utf8').match(pattern) || []).length
  }
  return n
}

describe('아키텍처 경계 래칫 (#397) — shared 역방향 import 증가 차단', () => {
  it(`shared → entities 역방향 import 가 ${BASELINE.sharedToEntities}건 이하 (도메인 로직은 shared 에 더 쌓지 말 것)`, () => {
    const count = countImports(/from ['"]@\/entities/g)
    expect(
      count,
      `shared → entities import 가 베이스라인(${BASELINE.sharedToEntities})을 초과(${count}). 도메인 의존을 추가하지 말고, 줄였다면 BASELINE 을 낮추세요.`
    ).toBeLessThanOrEqual(BASELINE.sharedToEntities)
  })

  it(`shared → features 역방향 import 가 ${BASELINE.sharedToFeatures}건 이하 (최하위층이 상위 feature 를 알면 안 됨)`, () => {
    const count = countImports(/from ['"]@\/features/g)
    expect(
      count,
      `shared → features import 가 베이스라인(${BASELINE.sharedToFeatures})을 초과(${count}). port/adapter 로 뒤집고, 줄였다면 BASELINE 을 낮추세요.`
    ).toBeLessThanOrEqual(BASELINE.sharedToFeatures)
  })
})
