import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import UploadRunPage from './UploadRunPage.vue'

// (#722) 권한 배너 렌더 계약. 순수 판정(isRouteAuthSuspectPair)은 store 테스트가 덮지만,
// "판정이 화면에 실제로 뜨는가"는 별개다 — 경로 유실은 지금까지 **화면에 아무 말도 안 하던**
// 무음 실패라, 배너와 복구 버튼이 실제로 렌더되는 것까지가 이 작업의 본체다.

vi.mock('@/shared/lib/runtime', () => ({ hasNativeBridge: () => true }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const stubs = {
  RunImageUploader: true,
  RunForm: true,
  ActionGroup: { template: '<div><slot /></div>' },
  ContentStack: { template: '<div><slot /></div>' },
  SectionGroup: { template: '<section><slot /></section>' }
}

function mountPage() {
  const wrapper = mount(UploadRunPage, { global: { stubs } })
  return { wrapper, store: useHealthKitSyncStore() }
}

describe('UploadRunPage 권한 배너 (#722)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('경로 권한 의심이면 경로 배너와 복구 버튼이 뜬다', async () => {
    const { wrapper, store } = mountPage()
    store.routeAuthSuspect = true
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('경로가 0점입니다')
    expect(wrapper.text()).toContain('건강 권한 다시 요청')
  })

  it('운동 권한 의심이어도 복구 버튼이 뜬다(#719 회귀 — 버튼 조건을 OR 로 넓혔다)', async () => {
    const { wrapper, store } = mountPage()
    store.readAuthSuspect = true
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('기존 기록이 있는데 조회가 0건입니다')
    expect(wrapper.text()).toContain('건강 권한 다시 요청')
  })

  it('의심이 없으면 배너도 복구 버튼도 없다(평상시 화면 오염 금지)', async () => {
    const { wrapper } = mountPage()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('경로가 0점입니다')
    expect(wrapper.text()).not.toContain('건강 권한 다시 요청')
  })
})
