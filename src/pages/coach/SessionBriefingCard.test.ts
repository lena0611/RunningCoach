import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import type { SessionBriefing } from '@/shared/lib/coaching/sessionBriefing'
import SessionBriefingCard from './SessionBriefingCard.vue'

// (#749) 카드가 길어 매번 스크롤해야 했다. 핵심 한 줄만 두고 설명은 '자세히 보기' 뒤로 접는다.
// ⚠ 단 조심할 점은 접지 않는다 — 부상·더위 중단 신호가 들어 있어 안전 게이트가 먼저다.

function briefing(over: Partial<SessionBriefing> = {}): SessionBriefing {
  return {
    keyPoint: '느리고 길게, 대화 가능 강도',
    goalLine: "'11월 레이싱' 기초기 — LSD",
    why: '유산소 기반을 넓히는 주라서요',
    effect: '유산소 베이스와 모세혈관을 키워요',
    execution: [{ label: '웜업', detail: '첫 1~2km는 천천히' }],
    successCriteria: ['대화가 가능했다'],
    targetsLine: '심박 138 이하',
    cautions: ['어지럼·구역이 오면 즉시 멈추세요'],
    paceBasis: '',
    evidence: [],
    ...over
  } as SessionBriefing
}

const stubs = { EvidenceSheet: true }
/**
 * v-show 접힘 판정은 **display 로** 본다. VueWrapper.isVisible() 은 setProps 뒤 재렌더에서
 * display:none 인데도 true 를 돌려줬다(2026-09-02 실측) — 숨김 판정에 지오메트리/래퍼 API 를
 * 믿지 말라는 [[hidden-content-geometry-apis-lie]] 와 같은 계열이다.
 */
const detailsHidden = (w: VueWrapper) => (w.find('#brief-details').element as HTMLElement).style.display === 'none'
const mountCard = (b: SessionBriefing) =>
  mount(SessionBriefingCard, { props: { briefing: b, sessionType: 'LSD', busy: false }, global: { stubs } })

describe('SessionBriefingCard 자세히 보기 (#749)', () => {
  it('기본은 접혀 있다 — 핵심은 보이고 설명은 안 보인다', () => {
    const w = mountCard(briefing())
    expect(w.text()).toContain('느리고 길게')
    expect(detailsHidden(w)).toBe(true)
  })

  it('⚠ 조심할 점은 접지 않는다 — 안전 내용이라 항상 보인다', () => {
    const w = mountCard(briefing())
    const caution = w.find('.brief-caution')
    expect(caution.exists()).toBe(true)
    expect(caution.isVisible()).toBe(true)
    // 토글 밖에 있어야 한다(접혀도 노출)
    expect(w.find('#brief-details').element.contains(caution.element)).toBe(false)
  })

  it('자세히 보기를 누르면 설명이 펼쳐지고 라벨이 바뀐다', async () => {
    const w = mountCard(briefing())
    const toggle = w.find('.brief-detail-toggle')
    expect(toggle.text()).toBe('자세히 보기')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(detailsHidden(w)).toBe(false)
    expect(w.text()).toContain('유산소 베이스와 모세혈관')
    expect(w.find('.brief-detail-toggle').text()).toBe('접기')
    expect(w.find('.brief-detail-toggle').attributes('aria-expanded')).toBe('true')
  })

  it('접을 내용이 없으면 토글을 안 낸다 — 눌러도 아무것도 안 나오는 버튼 금지', () => {
    const w = mountCard(briefing({ why: '', effect: '', execution: [], successCriteria: [] }))
    expect(w.find('.brief-detail-toggle').exists()).toBe(false)
  })

  it('다른 날로 넘기면 다시 접힌다 — 앞 세션의 펼침이 따라오면 "핵심만" 의도가 깨진다', async () => {
    const w = mountCard(briefing())
    await w.find('.brief-detail-toggle').trigger('click')
    expect(detailsHidden(w)).toBe(false)

    await w.setProps({ briefing: briefing({ keyPoint: '편하게 힘든 강도로' }) })
    await nextTick() // watch → detailOpen 변경 → 재렌더까지 한 틱 더
    expect(detailsHidden(w)).toBe(true)
    expect(w.find('.brief-detail-toggle').text()).toBe('자세히 보기')
  })
})
