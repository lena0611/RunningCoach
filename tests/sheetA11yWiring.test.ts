import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'

import BottomSheetSelect from '../src/shared/ui/BottomSheetSelect.vue'
import EvidenceSheet from '../src/shared/ui/EvidenceSheet.vue'
import SchedulingHelpSheet from '../src/shared/ui/SchedulingHelpSheet.vue'
import HeartRateHelpSheet from '../src/shared/ui/HeartRateHelpSheet.vue'
import HeartRateTestGuideSheet from '../src/shared/ui/HeartRateTestGuideSheet.vue'
import EarlyRunCreditSheet from '../src/shared/ui/EarlyRunCreditSheet.vue'
import RescheduleSheet from '../src/pages/coach/RescheduleSheet.vue'
import RestDeclarationSheet from '../src/pages/coach/RestDeclarationSheet.vue'
import WeekendTriageSheet from '../src/pages/coach/WeekendTriageSheet.vue'
import DoublesAddSheet from '../src/pages/coach/DoublesAddSheet.vue'
import PhaseTransitionModal from '../src/pages/coach/PhaseTransitionModal.vue'
import NotificationSettingsPromptSheet from '../src/shared/ui/NotificationSettingsPromptSheet.vue'
import InjuryScreeningSheet from '../src/shared/ui/InjuryScreeningSheet.vue'
import InjuryCheckInSheet from '../src/shared/ui/InjuryCheckInSheet.vue'
import PostRunInterviewSheet from '../src/shared/ui/PostRunInterviewSheet.vue'

/** 파생 조건 시트용 최소 픽스처. 화면을 그리기만 하면 되므로 필수 필드만 채운다. */
const injuryItem = {
  id: 'i1',
  title: '오른쪽 발바닥',
  area: '발바닥',
  normalizedAreas: [],
  status: 'monitoring',
  severity: 1,
  onsetDate: null,
  lastFlareDate: null,
  lastCheckedAt: null,
  resolvedAt: null,
  checkInHistory: [],
  notes: '',
  managementPlan: '',
  triggers: [],
  restrictions: [],
  returnToRunCriteria: '',
  strengthPlan: [],
  strengthPlanDetails: []
}

const runFixture = { id: 'r1', date: '2026-09-20', type: 'Easy', distanceKm: 4.6 }

/**
 * #828 — 시트별 **배선** 계약.
 *
 * `useSheetA11y` 자체는 `useSheetA11y.test.ts` 가 검증한다. 여기서 막는 건 다른 것이다:
 * 컴포저블이 멀쩡해도 **붙이는 쪽에서 틀리면** 아무 일도 안 일어난다 —
 * `open` 을 잘못 넘기거나, ref 를 시트가 아닌 엘리먼트에 달거나, 닫기 핸들러를 안 잇거나.
 * ([[unit-test-pass-does-not-mean-wired]] — 판정 함수만 부르는 테스트는 이걸 못 잡는다.)
 *
 * 시트가 20개라 하나씩 라이브로 돌리는 건 비현실적이다. 배선만 여기서 기계적으로 잠그고,
 * 라이브 QA 는 대표 시트 몇 개로 한다.
 */
type SheetCase = {
  name: string
  component: Component
  props: Record<string, unknown>
  /** 닫기 신호를 어떻게 관측하나 — emit 이름, 또는 내부 상태 시트면 null. */
  closeEvent: string | null
}

const CASES: SheetCase[] = [
  {
    name: 'BottomSheetSelect',
    component: BottomSheetSelect,
    props: { modelValue: 'a', label: '비교 방법', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    closeEvent: null // 내부 open ref 를 스스로 닫는다
  },
  {
    name: 'EvidenceSheet',
    component: EvidenceSheet,
    props: { open: true, evidence: [] },
    closeEvent: 'close'
  },
  {
    name: 'SchedulingHelpSheet',
    component: SchedulingHelpSheet,
    props: { open: true },
    closeEvent: 'close'
  },
  // 배치 2
  { name: 'HeartRateHelpSheet', component: HeartRateHelpSheet, props: { open: true }, closeEvent: 'close' },
  { name: 'HeartRateTestGuideSheet', component: HeartRateTestGuideSheet, props: { open: true }, closeEvent: 'close' },
  {
    name: 'EarlyRunCreditSheet',
    component: EarlyRunCreditSheet,
    props: { open: true, sessionLabel: '이지', runTypeLabel: 'Easy' },
    closeEvent: 'close'
  },
  // 배치 3
  {
    name: 'RescheduleSheet',
    component: RescheduleSheet,
    props: { open: true, title: '다른 날로', candidates: [], keySkip: false },
    closeEvent: 'close'
  },
  {
    name: 'RestDeclarationSheet',
    component: RestDeclarationSheet,
    props: { open: true, today: '2026-09-21' },
    closeEvent: 'close'
  },
  {
    name: 'WeekendTriageSheet',
    component: WeekendTriageSheet,
    props: { open: true, saveLabel: '살리기', releaseLabels: [] },
    closeEvent: 'close'
  },
  // 배치 4
  {
    name: 'DoublesAddSheet',
    component: DoublesAddSheet,
    props: { open: true, amSession: null, eligibility: null },
    closeEvent: 'close'
  },
  {
    name: 'PhaseTransitionModal',
    component: PhaseTransitionModal,
    props: {
      open: true,
      summary: {
        currentPhase: 'base',
        criteria: [],
        readyCount: 0,
        allReady: false,
        phaseProposal: { shouldTransition: false, toPhase: null, reason: '', blockers: [] },
        adapted: { easyCeilingBpm: null, longRunDriftTolerancePercent: 0, recoveryRestDays: 0 }
      }
    },
    closeEvent: 'close'
  },
  {
    name: 'NotificationSettingsPromptSheet',
    component: NotificationSettingsPromptSheet,
    props: { open: true, disabledItems: [] },
    closeEvent: 'close'
  },
  // 배치 5 — 열림 조건이 `open` 단독이 아니라 데이터와 함께인 시트들
  {
    name: 'InjuryScreeningSheet',
    component: InjuryScreeningSheet,
    props: { open: true, showGuide: false },
    closeEvent: 'close'
  },
  {
    name: 'InjuryCheckInSheet',
    component: InjuryCheckInSheet,
    props: { open: true, item: injuryItem },
    closeEvent: 'close'
  },
  {
    name: 'PostRunInterviewSheet',
    component: PostRunInterviewSheet,
    props: { open: true, run: runFixture },
    closeEvent: 'close'
  }
]

let appRoot: HTMLElement
const mounted: Array<{ unmount: () => void }> = []

beforeEach(() => {
  appRoot = document.createElement('div')
  appRoot.id = 'app'
  document.body.appendChild(appRoot)
})

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  appRoot.remove()
  document.body.querySelectorAll('.bottom-sheet-layer').forEach((el) => el.remove())
})

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

async function openSheet(sheetCase: SheetCase) {
  const wrapper = mount(sheetCase.component, { props: sheetCase.props, attachTo: document.body })
  mounted.push(wrapper)
  if (sheetCase.closeEvent === null) {
    // 자체 트리거로 여는 시트
    await wrapper.find('.bottom-sheet-trigger').trigger('click')
  }
  await nextTick()
  await nextTick()
  return wrapper
}

describe.each(CASES)('$name 접근성 배선', (sheetCase) => {
  it('시트 엘리먼트가 초점을 받을 수 있게 열려 있다', async () => {
    await openSheet(sheetCase)
    const sheet = document.querySelector('.bottom-sheet')
    expect(sheet, '시트가 렌더되지 않았다').toBeTruthy()
    // ref 가 시트에 안 달리면 포커스 이동·트랩이 통째로 죽는다.
    expect(sheet?.getAttribute('tabindex')).toBe('-1')
  })

  it('열면 초점이 시트 안으로 들어간다', async () => {
    await openSheet(sheetCase)
    const sheet = document.querySelector('.bottom-sheet')
    expect(sheet?.contains(document.activeElement)).toBe(true)
  })

  it('열면 배경이 inert 가 된다', async () => {
    await openSheet(sheetCase)
    expect(appRoot.hasAttribute('inert')).toBe(true)
  })

  it('Escape 가 닫기로 이어진다', async () => {
    const wrapper = await openSheet(sheetCase)
    press('Escape')
    // Vue <Transition> 은 rAF 를 두 번 태운 뒤에야 엘리먼트를 제거한다 — 틱 몇 개를 더 준다.
    for (let i = 0; i < 5; i += 1) {
      await nextTick()
      await new Promise((r) => setTimeout(r, 20))
    }

    if (sheetCase.closeEvent) {
      expect(wrapper.emitted(sheetCase.closeEvent), 'close 이벤트가 안 나갔다').toBeTruthy()
    } else {
      // 내부 상태로 닫는 시트는 DOM 에서 사라지는 것으로 확인한다.
      expect(document.querySelector('.bottom-sheet')).toBeNull()
    }
  })
})


/**
 * 파생 조건 시트의 함정: 템플릿은 `open && item` 으로 그리는데 컴포저블에 `open` 만 넘기면
 * **시트가 없는데 배경만 잠긴다**(Tab·스크린리더가 갇히고 사용자는 이유를 모른다).
 */
describe('열림 조건이 데이터와 함께인 시트', () => {
  const partial = [
    { name: 'InjuryCheckInSheet', component: InjuryCheckInSheet, props: { open: true, item: null } },
    { name: 'PostRunInterviewSheet', component: PostRunInterviewSheet, props: { open: true, run: null } }
  ]

  for (const c of partial) {
    it(`${c.name}: open 만 true 이고 데이터가 없으면 배경을 잠그지 않는다`, async () => {
      const wrapper = mount(c.component, { props: c.props, attachTo: document.body })
      mounted.push(wrapper)
      await nextTick()
      await nextTick()

      expect(document.querySelector('.bottom-sheet'), '시트가 그려지면 안 된다').toBeNull()
      expect(appRoot.hasAttribute('inert'), '시트가 없는데 배경이 잠겼다').toBe(false)
    })
  }
})
