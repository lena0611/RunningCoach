/**
 * 장기기억 인입 결과와, 그 결과를 **사용자에게 정직하게 알리는** 한 줄 (2026-09-08).
 *
 * 왜 코드가 알리나: 코치는 답변을 쓰는 시점에 저장 성공 여부를 모른다 — insert 는 그 뒤에 일어난다.
 * 그래서 "기억해둘게요"라고 해놓고 실제로는 아무것도 안 남는 경우가 있었다(주제 화이트리스트에
 * 걸려 조용히 폐기). 결과를 아는 건 코드뿐이므로 코드가 붙인다
 * ([[coach-always-on-block-deterministic]] · applyTrustLayer 와 같은 후처리 주입).
 */

export type MemoryIntakeSkip = {
  content: string
  reason: 'already-known' | 'not-durable' | 'too-short'
}

export type MemoryIntake = {
  stored: string[]
  skipped: MemoryIntakeSkip[]
}

/**
 * 사용자가 직접 기억을 요청했는데 **아무것도 안 남았을 때만** 한 줄을 돌려준다.
 *
 * 저장이 됐으면 null — 코치의 "그렇게 볼게요"가 사실이므로 굳이 덧붙이지 않는다.
 * 요청이 아닌 턴도 null — 코치가 알아서 저장을 안 한 건 알릴 일이 아니다.
 */
export function memoryIntakeNote(intake: MemoryIntake, explicitRequest: boolean): string | null {
  if (!explicitRequest || intake.stored.length > 0) return null

  if (intake.skipped.some((item) => item.reason === 'already-known')) {
    return '📌 그건 이미 기억하고 있어서 새로 저장하지는 않았어요(같은 내용이 중복으로 쌓이지 않게).'
  }
  if (intake.skipped.some((item) => item.reason === 'too-short')) {
    return '⚠️ 방금 건 너무 짧아서 장기 기억에 넣지 않았어요 — 나중에 무슨 뜻인지 알기 어려워서요. 한 문장으로 풀어주면 그대로 기억할게요.'
  }
  return '⚠️ 방금 건 장기 기억에 남기지 못했어요. 한 문장으로 다시 말해주면 그대로 기억할게요.'
}
