import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH, passwordTooShortMessage } from './authStore'

/**
 * 비밀번호 최소 길이 계약(2026-08-10).
 *
 * 예전엔 숫자 6이 **검사 1곳·입력창 안내문 2곳·에러 번역문 1곳**에 각각 박혀 있었다. 그 상태에서
 * 서버(Supabase) 설정만 올리면 "앱은 통과시키는데 서버는 거부하고, 안내문은 옛 숫자를 말하는" 상태가
 * 된다 — 사용자 눈엔 *"8자 넣었는데 왜 6자라고 나와?"* 로 보인다.
 *
 * 그래서 값의 출처를 하나로 모았고, 이 테스트가 **안내문이 항상 그 값을 말한다**는 것을 고정한다.
 * 숫자를 바꾸면 문장이 자동으로 따라오므로 테스트를 고칠 필요가 없다.
 */
describe('비밀번호 최소 길이 — 값과 안내문이 한 출처에서 나온다', () => {
  it('안내문이 실제 최소 길이를 말한다 (숫자가 문장에 하드코딩되지 않았다)', () => {
    expect(passwordTooShortMessage).toContain(String(PASSWORD_MIN_LENGTH))
  })

  it('안내문은 무엇을 해야 하는지 알려준다', () => {
    expect(passwordTooShortMessage).toMatch(/자 이상/)
  })

  /**
   * 8자 근거: 6자는 해시가 유출되면 오프라인 크래킹으로 며칠 안에 뚫린다(소문자+숫자 약 22억 조합).
   * 8자면 같은 가정에서 수년 규모가 된다. 10자 이상은 더 안전하지만 사용자가 메모하거나 다른 사이트
   * 비밀번호를 재사용하기 시작해 오히려 위험이 옮겨간다 — 소비자 앱에서 8자가 실용적 균형점.
   */
  it('최소 길이는 8자다 (6자 이하로 내려가지 않는다)', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(8)
  })
})
