import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import GoalAdjustSheet from '../src/features/goal-adjust/GoalAdjustSheet.vue'
import { useGoalAdjustStore } from '../src/app/stores/goalAdjustStore'
import { useMemoryStore } from '../src/app/stores/memoryStore'
import { createBlankTrainingMemory, normalizeTrainingMemory } from '../src/entities/training-memory/model'

/** 목표 다시 정하기 시트(#889) — App 레벨 스토어 시트도 다른 시트와 같은 접근성 배선을 갖는다. */
let appRoot: HTMLElement

beforeEach(() => {
  appRoot = document.createElement('div')
  appRoot.id = 'app'
  document.body.appendChild(appRoot)
})

afterEach(() => {
  appRoot.remove()
  document.body.querySelectorAll('.bottom-sheet-layer').forEach((el) => el.remove())
})

async function openSheet() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const blank = createBlankTrainingMemory()
  const memory = normalizeTrainingMemory({
    ...blank,
    goals: [{ ...blank.goals[0], id: 'g10k', title: '11월 레이싱', category: 'race', distanceKm: 10, targetDate: '2026-11-30' }],
    activeGoalId: 'g10k'
  })
  useMemoryStore().$patch({ users: [{ id: 'qa', name: 'qa', memory, createdAt: '', updatedAt: '' }], selectedUserId: 'qa' })
  const wrapper = mount(GoalAdjustSheet, { global: { plugins: [pinia] }, attachTo: document.body })
  useGoalAdjustStore().show()
  await nextTick()
  await nextTick()
  return wrapper
}

describe('GoalAdjustSheet 접근성 배선', () => {
  it('열면 초점이 시트 안으로 들어가고 배경이 inert 가 된다', async () => {
    const wrapper = await openSheet()
    const sheet = document.querySelector('.goal-adjust-sheet')
    expect(sheet?.getAttribute('tabindex')).toBe('-1')
    expect(sheet?.contains(document.activeElement)).toBe(true)
    expect(appRoot.hasAttribute('inert')).toBe(true)
    wrapper.unmount()
  })

  it('Escape 가 닫는다', async () => {
    const wrapper = await openSheet()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(useGoalAdjustStore().open).toBe(false)
    wrapper.unmount()
  })

  it('목표 선택지를 보여준다', async () => {
    const wrapper = await openSheet()
    const titles = [...document.querySelectorAll('.goal-adjust-option-title strong')].map((el) => el.textContent)
    expect(titles).toContain('잠시 내려놓기')
    wrapper.unmount()
  })
})
