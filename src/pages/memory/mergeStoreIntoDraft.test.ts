import { describe, expect, it } from 'vitest'

/**
 * 2026-09-07 데이터 유실 재현·잠금.
 *
 * 기억 탭 draft 는 마운트 시점의 스토어 값으로 스냅샷된다. 로드 전(빈 값)에 화면이 뜨고 어딘가
 * 한 글자만 건드리면 예전 규칙("아무 키라도 dirty 면 재동기화 통째 생략")이 draft 를 **영구히 빈 상태로
 * 고정**했고, 그 뒤 섹션 저장이 그 섹션 키를 통째로 빈 값으로 덮었다.
 * 지워진 키가 'ai'·'training' 섹션 키와 정확히 일치한 게 결정적 증거였다.
 *
 * 여기서 검증하는 규칙: **손대지 않은 키만** 최신 값으로 갈아끼운다.
 */
type Memory = Record<string, unknown>

function mergeStoreIntoDraft(draft: Memory, snapshot: Memory, fresh: Memory) {
  const nextSnapshot: Memory = { ...snapshot }
  for (const key of Object.keys(fresh)) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(snapshot[key])) continue
    draft[key] = JSON.parse(JSON.stringify(fresh[key]))
    nextSnapshot[key] = fresh[key]
  }
  return nextSnapshot
}

describe('기억 탭 draft 병합', () => {
  it('로드 전 빈 draft 는 도착한 값으로 채워진다 — 다른 칸을 편집 중이어도', () => {
    const draft: Memory = { aiNotes: [], longRunStrategy: '', goal: '수정 중' }
    const snapshot: Memory = { aiNotes: [], longRunStrategy: '', goal: '' }
    const fresh: Memory = { aiNotes: ['a'], longRunStrategy: '서버 전략', goal: '서버 목표' }

    mergeStoreIntoDraft(draft, snapshot, fresh)

    expect(draft.aiNotes).toEqual(['a'])
    expect(draft.longRunStrategy).toEqual('서버 전략')
    // 편집 중인 칸은 지킨다 — 타이핑 중 값이 서버 값으로 튀면 그것도 데이터 유실이다.
    expect(draft.goal).toBe('수정 중')
  })

  it('편집 중인 키는 스냅샷도 그대로 둔다 — 저장 시 사용자 값이 나가야 한다', () => {
    const draft: Memory = { goal: '수정 중' }
    const snapshot: Memory = { goal: '' }
    const next = mergeStoreIntoDraft(draft, snapshot, { goal: '서버 목표' })
    expect(next.goal).toBe('')
  })
})
