import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 그림자는 토큰으로만(2026-10-26 사용자 결정).
 *
 * 색을 직접 박은 그림자(rgba·hex·흰색)는 어두운 화면에서 **배경보다 밝게** 떠 보였다 — 초록 글로우 버튼,
 * 하단 탭의 흰 하이라이트 줄, 성공·오류 토스트의 색 글로우. 그림자 색은 `--color-shadow`(배경을 더 어둡게 섞은 색)
 * 하나이고, 컴포넌트는 `--shadow-*` 토큰만 쓴다.
 *
 * 그림자가 아닌 연출(지도 경로선 발광·트로피 금박 테두리)은 바로 위 줄에 `shadow-exception: <이유>` 를 남겨 예외로 둔다.
 */
const SRC = resolve(__dirname, '../src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.vue') || full.endsWith('.css') ? [full] : []
  })
}

const DECLARATION = /(box-shadow|text-shadow|filter|--[\w-]*shadow[\w-]*)\s*:\s*([^;{}]+);/g
const COLOR_LITERAL = /rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b|\b(black|white)\b/

function violations(file: string): string[] {
  const text = readFileSync(file, 'utf-8')
  const found: string[] = []
  for (const match of text.matchAll(DECLARATION)) {
    const [whole, prop, value] = match
    if (prop === 'filter' && !value.includes('drop-shadow')) continue
    if (prop === '--color-shadow') continue // 그림자 색의 정의 자체(배경 → 검정 쪽으로 섞음)
    if (!COLOR_LITERAL.test(value)) continue
    const start = match.index ?? 0
    const before = text.slice(Math.max(0, start - 200), start)
    if (before.split('\n').slice(-2).join('\n').includes('shadow-exception')) continue
    const line = text.slice(0, start).split('\n').length
    found.push(`${relative(SRC, file)}:${line} ${whole.replace(/\s+/g, ' ').slice(0, 90)}`)
  }
  return found
}

describe('그림자 토큰 (2026-10-26)', () => {
  it('그림자에 색을 직접 쓰지 않는다 — --shadow-* 토큰만', () => {
    const all = walk(SRC).flatMap(violations)
    expect(all, '그림자 색을 직접 썼다. --shadow-card/float/overlay/text 를 쓰거나, 그림자가 아니면 shadow-exception 을 단다').toEqual([])
  })

  it('그림자 색은 배경을 어둡게 섞은 색이다 — 배경보다 밝아질 수 없다', () => {
    const css = readFileSync(join(SRC, 'app/styles.css'), 'utf-8')
    expect(css).toMatch(/--color-shadow:\s*color-mix\(in srgb, var\(--color-bg\)[^;]*black\)/)
  })
})
