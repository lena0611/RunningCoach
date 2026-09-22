import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #828 — 시트 접근성 **커버리지** 가드.
 *
 * `sheetA11yWiring.test.ts` 는 배선한 시트가 실제로 도는지 보고, 이 파일은 **빠뜨린 시트가 없는지** 본다.
 * 둘은 다른 질문이다 — 새 시트를 하나 더 만들면 배선 테스트는 여전히 초록인데 그 시트만 접근성이 없다.
 *
 * 판정 기준: `bottom-sheet-layer`(우리 시트 레이어)와 `role="dialog"` 를 함께 쓰는 파일은
 * 모달이므로 `useSheetA11y` 를 써야 한다.
 */
const SRC = resolve(__dirname, '../src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.vue') ? [full] : []
  })
}

/** 접근성 훅이 필요 없다고 판단한 예외. 비우지 말고 **이유를 남긴다**. */
const EXEMPT: Record<string, string> = {
  'app/App.vue': '온보딩 레이어는 role="dialog" 모달이 아니라 전체 화면 단계 UI다(닫기 개념이 없음).'
}

describe('시트 접근성 커버리지 (#828)', () => {
  const modalFiles = walk(SRC)
    .filter((file) => {
      const text = readFileSync(file, 'utf-8')
      return text.includes('bottom-sheet-layer') && text.includes('role="dialog"')
    })
    .map((file) => relative(SRC, file).split('\\').join('/'))

  it('모달 시트를 쓰는 파일을 실제로 찾아냈다', () => {
    // 0건이면 판정식이 깨진 것이다 — 통과하면서 아무것도 안 지키는 상태를 막는다.
    expect(modalFiles.length).toBeGreaterThan(10)
  })

  it.each(modalFiles)('%s 이 useSheetA11y 를 쓴다', (relPath) => {
    if (EXEMPT[relPath]) {
      expect(EXEMPT[relPath].length, '예외는 이유를 적어야 한다').toBeGreaterThan(10)
      return
    }
    const text = readFileSync(join(SRC, relPath), 'utf-8')
    expect(
      text.includes('useSheetA11y'),
      `${relPath} 에 시트 모달이 있는데 접근성 훅이 없다. ` +
        'useSheetA11y 를 붙이거나, 모달이 아니면 EXEMPT 에 이유와 함께 등록하라.'
    ).toBe(true)
  })

  /**
   * 2026-09-22 실기기 먹통 사고의 재발 방지.
   *
   * `#app` 에 거는 `inert` 는 시트가 **`#app` 밖**에 있을 때만 성립한다. Teleport 없이 안에
   * 남아 있으면 배경을 끄려다 **시트 자신까지 꺼져 앱이 통째로 잠긴다.** 어제 커버리지 가드는
   * "훅이 붙었나"만 봤고 "이 시트에 걸어도 되나"는 보지 않아 5개를 놓쳤다.
   *
   * 컴포저블에 안전장치를 넣어 두었지만(안에 있으면 inert 를 안 건다) 그건 **기능을 잃는 것**이다 —
   * 시트는 body 로 내보내는 게 정답이라 여기서 강제한다.
   */
  it.each(modalFiles.filter((f) => !EXEMPT[f]))('%s 이 시트를 body 로 teleport 한다', (relPath) => {
    const text = readFileSync(join(SRC, relPath), 'utf-8')
    if (!text.includes('useSheetA11y')) return
    expect(
      /<Teleport\s+to="body"/.test(text),
      `${relPath} 의 시트가 #app 안에 남아 있다. inert 가 시트 자신을 꺼서 앱이 잠긴다 — ` +
        'Teleport to="body" 로 감싸라.'
    ).toBe(true)
  })

  it('배선한 시트는 ref 도 함께 달려 있다', () => {
    // 훅만 부르고 ref 를 안 달면 포커스 이동·트랩이 통째로 죽는다(조용한 실패).
    const missingRef = modalFiles
      .filter((relPath) => !EXEMPT[relPath])
      .filter((relPath) => {
        const text = readFileSync(join(SRC, relPath), 'utf-8')
        return text.includes('useSheetA11y') && !/ref="(sheetEl|confirmSheetEl)"/.test(text)
      })
    expect(missingRef, 'useSheetA11y 를 쓰는데 시트 ref 가 없다').toEqual([])
  })
})
