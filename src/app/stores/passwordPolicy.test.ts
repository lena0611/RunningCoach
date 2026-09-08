import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH, passwordPolicyIssue, passwordTooShortMessage } from './authStore'

/*
  2026-09-08: Supabase 대시보드 Password requirements 를 "소문자·대문자·숫자·기호"로 올렸다.
  앱이 같은 규칙을 안 들고 있으면 서버가 거부하면서 알파벳이 통째로 나열된 영어 원문이
  사용자에게 그대로 보인다(번역 규칙에도 안 걸린다). 두 값이 어긋나지 않게 잠근다.
*/
describe('passwordPolicyIssue', () => {
  it('네 종류를 다 갖추고 길이도 넘으면 통과', () => {
    expect(passwordPolicyIssue('Run!2026pace')).toBeNull()
  })

  it('길이가 모자라면 길이 안내가 먼저 나온다', () => {
    expect(passwordPolicyIssue('Ab!1')).toBe(passwordTooShortMessage)
    expect('Ab!1'.length).toBeLessThan(PASSWORD_MIN_LENGTH)
  })

  it('빠진 종류를 짚어준다', () => {
    expect(passwordPolicyIssue('runningrun')).toContain('대문자')
    expect(passwordPolicyIssue('runningrun')).toContain('숫자')
    expect(passwordPolicyIssue('runningrun')).toContain('기호')
    expect(passwordPolicyIssue('Runningrun1')).toContain('기호')
    expect(passwordPolicyIssue('RUNNING!123')).toContain('소문자')
  })

  it('빠진 게 하나면 그 하나만 지목한다 — 괄호 안 전체 규칙 안내는 항상 붙는다', () => {
    // "비밀번호에 <빠진 것>를 넣어주세요. (<전체 규칙>)" 구조라, 지목 부분만 떼어 본다.
    const named = (passwordPolicyIssue('Runningrun!') ?? '').split('(')[0]
    expect(named).toContain('숫자')
    expect(named).not.toContain('대문자')
    expect(named).not.toContain('소문자')
    expect(named).not.toContain('기호')
  })
})
