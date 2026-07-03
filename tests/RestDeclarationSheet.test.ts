import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import RestDeclarationSheet from '@/pages/coach/RestDeclarationSheet.vue'

// #473 휴식 선언/복귀일 조정 시트 — 마운트 기반 상호작용 테스트.
// 보고된 버그(복귀일 조정 시 저장 비활성)의 회귀 가드 + 다양한 조건 검증.
const TODAY = '2026-06-23'

function mountSheet(props: Record<string, unknown> = {}) {
  return mount(RestDeclarationSheet, { attachTo: document.body, props: { open: false, today: TODAY, ...props } })
}
function confirmBtn(): HTMLButtonElement {
  return [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('푹 쉴게요')) as HTMLButtonElement
}
function chip(label: string): HTMLButtonElement {
  return [...document.body.querySelectorAll('.rest-chip')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement
}

describe('RestDeclarationSheet (#473 휴식 선언/복귀일 조정)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.body.className = ''
  })

  it('선언 모드: 이유+기간 둘 다 골라야 저장 활성, declare emit(untilDate=today+6)', async () => {
    const w = mountSheet()
    await w.setProps({ open: true })
    expect(confirmBtn().disabled).toBe(true) // 초기: 둘 다 없음
    chip('부상').click()
    await w.vm.$nextTick()
    expect(confirmBtn().disabled).toBe(true) // 이유만으론 부족
    chip('1주').click()
    await w.vm.$nextTick()
    expect(confirmBtn().disabled).toBe(false) // 이유+기간 → 활성
    confirmBtn().click()
    await w.vm.$nextTick()
    const ev = w.emitted('declare') as unknown[][]
    expect(ev?.length).toBe(1)
    expect((ev[0][0] as { reason: string }).reason).toBe('injury')
    expect((ev[0][0] as { untilDate: string }).untilDate).toBe('2026-06-29') // 1주 = today+6
  })

  it('복귀일 조정: presetReason+presetUntil 프리필 → 저장 즉시 활성(보고된 버그 회귀 가드)', async () => {
    const w = mountSheet({ presetReason: 'injury', presetUntil: '2026-06-29' })
    await w.setProps({ open: true })
    expect(confirmBtn().disabled).toBe(false) // 열자마자 활성 (버그였던 비활성 해결)
    expect(chip('부상').classList.contains('rest-chip-on')).toBe(true)
    expect(chip('직접').classList.contains('rest-chip-on')).toBe(true)
  })

  it('과거 복귀일은 프리필 안 함(미래 날짜만) → 날짜 미선택이라 저장 비활성', async () => {
    const w = mountSheet({ presetReason: 'weather', presetUntil: '2026-06-01' })
    await w.setProps({ open: true })
    expect(chip('날씨').classList.contains('rest-chip-on')).toBe(true) // 이유는 채워짐
    expect(confirmBtn().disabled).toBe(true) // 과거 날짜는 무시 → untilDate 없음
  })

  it('이유만 프리필(날짜 없음, 부상 체크인 진입)이면 저장 비활성', async () => {
    const w = mountSheet({ presetReason: 'injury' })
    await w.setProps({ open: true })
    expect(chip('부상').classList.contains('rest-chip-on')).toBe(true)
    expect(confirmBtn().disabled).toBe(true) // 날짜 미선택
  })
})
