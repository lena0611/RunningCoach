import { describe, expect, it } from 'vitest'
import { destinationActionLabel } from './proposalDestination'

// (#741) 2026-09-01 실사고: 제안 카드의 "이번엔 놓아주기"를 눌렀는데 홈의 오늘 처방이 그대로였다.
// 카드는 설계상 **이동만** 하고 확정은 그날 세션 카드에서 하는데, 아무도 그 말을 안 해줬다.
// 게다가 눌러야 할 버튼 이름이 카드와 도착지가 다르고 날짜 상태마다 또 갈린다.

describe('destinationActionLabel (#741)', () => {
  it('오늘 세션 건너뛰기는 브리핑 카드의 "건너뛰기"다 — 카드 라벨("놓아주기")과 다르다', () => {
    expect(destinationActionLabel('skip_session', 'today')).toBe('건너뛰기')
    expect(destinationActionLabel('skip_session', 'future')).toBe('건너뛰기')
  })

  it('지난 날은 안 뛴 날 카드의 "놓아주기"다', () => {
    expect(destinationActionLabel('skip_session', 'open')).toBe('놓아주기')
    expect(destinationActionLabel('skip_session', 'missed')).toBe('놓아주기')
  })

  it('강도 조정·이동은 상태와 무관하게 같은 이름이다', () => {
    expect(destinationActionLabel('ease_session', 'today')).toBe('더 쉽게')
    expect(destinationActionLabel('ease_session', 'open')).toBe('더 쉽게')
    expect(destinationActionLabel('intensify_session', 'today')).toBe('더 강하게')
    expect(destinationActionLabel('reschedule_session', 'today')).toBe('다른 날로')
  })

  it('휴식 선언은 이 경로를 타지 않는다 — 시트가 바로 열리므로 안내가 필요 없다', () => {
    expect(destinationActionLabel('declare_rest', 'today')).toBeNull()
  })

  it('액션이 없으면 안내하지 않는다(빈 토스트 금지)', () => {
    expect(destinationActionLabel(null, 'today')).toBeNull()
    expect(destinationActionLabel(undefined, 'today')).toBeNull()
  })

  it('모르는 액션은 조용히 넘어간다 — 지어낸 버튼 이름을 말하지 않는다', () => {
    expect(destinationActionLabel('something_new', 'today')).toBeNull()
  })
})
