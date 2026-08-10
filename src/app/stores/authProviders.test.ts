import { describe, expect, it } from 'vitest'

/**
 * 노출할 소셜 로그인 목록 계약(2026-08-07).
 *
 * 준비 안 된 공급자 버튼을 보여주면 눌렀을 때 "provider is not enabled" 오류가 나서 **고장난 앱으로
 * 보인다.** 그래서 목록은 환경변수로 명시된 것만 통과시키고, 오타·알 수 없는 값은 조용히 버린다.
 *
 * `authStore.ts` 의 `enabledAuthProviders` 파생식을 미러한다(import.meta.env 를 테스트에서
 * 갈아끼울 수 없어서). 원본을 바꾸면 이 미러도 함께 바꾼다.
 */
function parseProviders(raw: unknown): Array<'google' | 'kakao'> {
  return String(raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is 'google' | 'kakao' => item === 'google' || item === 'kakao')
}

describe('enabledAuthProviders — 준비된 공급자만 노출', () => {
  it('비어 있으면 아무 소셜 버튼도 노출하지 않는다 (이메일+비밀번호만)', () => {
    expect(parseProviders(undefined)).toEqual([])
    expect(parseProviders('')).toEqual([])
    expect(parseProviders('   ')).toEqual([])
  })

  it('쉼표 목록을 순서대로 통과시킨다', () => {
    expect(parseProviders('google,kakao')).toEqual(['google', 'kakao'])
    expect(parseProviders('kakao,google')).toEqual(['kakao', 'google'])
  })

  it('공백을 다듬는다', () => {
    expect(parseProviders(' google , kakao ')).toEqual(['google', 'kakao'])
  })

  it('모르는 값·오타는 조용히 버린다 (오류 나는 버튼을 만들지 않는다)', () => {
    expect(parseProviders('gogle,kakao')).toEqual(['kakao'])
    expect(parseProviders('apple,naver')).toEqual([])
    expect(parseProviders('google,,kakao,')).toEqual(['google', 'kakao'])
  })
})
