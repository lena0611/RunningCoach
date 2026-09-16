import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 코치 지침 모순 가드(#824).
 *
 * 지침은 한국어 문자열이라 **타입 체커도 테스트도 모순을 못 잡는다.** 실제로 공존했던 것들:
 *
 *   ① "**표를 그리거나** 항목을 10개씩 나열하지 말고"  (대화·설명·근거 공용 분량 상한)
 *      ↔ "비교(처방 vs 실제, 구간 비교)는 **markdown 표로**"  (report 모드)
 *      → 몇 달 공존했고, 사용자가 "표로 보여줘"라고 해도 표가 안 나왔다(#821).
 *
 *   ② "마크다운은 **필요할 때만** 쓴다"
 *      ↔ "목록·표를 **적극** 쓴다"   (같은 지침 묶음 안에서)
 *      → 세 세션 심박 비교를 줄글 한 문단에 몰아넣었다(#821 라이브 QA).
 *
 * ⚠ 이 검사는 **파일 전체**를 본다. 모드별로 조립한 결과를 보는 게 정확하지만, `index.ts` 는
 * Deno 전용 import 가 섞여 vitest 로 불러올 수 없다. 정밀 버전은 #823(조립 구조 정리)에서
 * 지침 조립부를 분리한 뒤에 올린다 — 그때까지도 이 거친 검사가 **리팩터 중 새 모순이 들어가는 것**을
 * 막는 안전망이 된다.
 */
/**
 * ⚠ **주석은 제외하고 본다.** 이 프로젝트의 주석은 "예전에 이런 지침이 있어서 사고가 났다"고
 * 옛 문구를 그대로 인용한다 — 실제로 이 가드를 처음 돌렸을 때 #821 수정을 설명하는 주석
 * ("위 상한 문장이 \"표를 그리거나 ... 말고\"로 표를 금지하고 있었다")에 스스로 걸렸다.
 * 모델에게 가는 것은 문자열이지 주석이 아니므로 주석을 지우고 검사한다.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // 줄 전체가 주석인 경우만 지운다 — URL 의 `//` 를 건드리지 않기 위해서다.
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

const INDEX_SRC = stripComments(
  readFileSync(resolve(__dirname, '../supabase/functions/coach-run/index.ts'), 'utf-8')
)

/**
 * 상충 쌍. 한쪽이 "하지 마라", 다른 쪽이 "해라"인 **같은 대상**에 대한 지시다.
 * 새 규칙을 넣을 때 반대편이 살아 있으면 여기서 걸린다.
 */
const CONFLICTS: Array<{
  subject: string
  forbid: { label: string; pattern: RegExp }
  require: { label: string; pattern: RegExp }
  /** 공존이 정당하면 사유를 적고 allow: true. 침묵 무시는 금지한다. */
  allow?: string
}> = [
  {
    subject: '표(table) 사용',
    forbid: { label: '표를 그리지 마라', pattern: /표를\s*그리거나|표를\s*쓰지\s*마라|표\s*금지/ },
    require: { label: '비교는 표로 하라', pattern: /비교[^\n]{0,30}표로|마크다운\s*표로\s*답한다/ }
  },
  {
    subject: '마크다운 적극성',
    forbid: { label: '마크다운은 필요할 때만', pattern: /마크다운은\s*필요할\s*때만/ },
    require: { label: '목록·표를 적극 쓰라', pattern: /적극\s*쓴다|적극\s*활용/ }
  },
  {
    subject: '지표 나열',
    // "지표 나열 금지"가 살아 있으면 수치를 목록으로 정리하는 것까지 금지로 읽힌다(#821).
    forbid: { label: '지표 나열 금지', pattern: /지표\s*나열을?\s*(쓰지\s*말|하지\s*마|금지)/ },
    require: { label: '수치를 목록·표로', pattern: /목록이나\s*작은\s*표로|목록·작은\s*표로/ }
  },
  {
    subject: '개인 데이터 사용',
    forbid: { label: '개인화 단락 생략', pattern: /개인화\s*단락도?\s*생략/ },
    require: { label: '이 사용자의 데이터로 말하라', pattern: /이\s*사람에게만\s*해당하는\s*근거/ }
  }
]

describe('코치 지침에 정면으로 모순되는 지시가 공존하지 않는다 (#824)', () => {
  for (const conflict of CONFLICTS) {
    it(`${conflict.subject}: "${conflict.forbid.label}" 와 "${conflict.require.label}" 가 함께 있지 않다`, () => {
      const hasForbid = conflict.forbid.pattern.test(INDEX_SRC)
      const hasRequire = conflict.require.pattern.test(INDEX_SRC)
      if (conflict.allow) {
        expect(conflict.allow.length, '허용 사유는 비워둘 수 없다').toBeGreaterThan(0)
        return
      }
      expect(
        hasForbid && hasRequire,
        `"${conflict.forbid.label}" 와 "${conflict.require.label}" 가 동시에 존재한다. ` +
          '한쪽을 지우거나, 공존이 정당하면 CONFLICTS 에 allow 사유를 적어라.'
      ).toBe(false)
    })
  }

  it('사전이 실제로 무언가를 검사하고 있다 — 양쪽 다 사라지면 가드가 무의미해진다', () => {
    // 지침이 대거 바뀌어(예: #823) 두 패턴 모두 못 찾게 되면, 이 테스트는 "통과"하면서
    // 아무것도 지키지 않는 상태가 된다. 최소한 한쪽은 살아 있어야 사전이 현실과 붙어 있다.
    const anchored = CONFLICTS.filter(
      (c) => c.forbid.pattern.test(INDEX_SRC) || c.require.pattern.test(INDEX_SRC)
    )
    expect(anchored.length, '상충 쌍이 전부 지침과 무관해졌다 — 사전을 현재 지침에 맞게 갱신하라').toBeGreaterThan(0)
  })
})

/**
 * 사전이 **실제로 과거 모순을 잡는지** 증명한다.
 *
 * 가드가 현재 파일에서 통과하는 것만으로는 "패턴이 아무것도 못 잡는 것"과 구분되지 않는다.
 * #821 이전의 실제 지침 원문을 넣어 걸리는지 본다 — 이게 회귀 재현 케이스다.
 */
describe('사전이 과거 모순을 실제로 잡는다 (회귀 재현)', () => {
  function conflictsIn(source: string): string[] {
    return CONFLICTS.filter((c) => c.forbid.pattern.test(source) && c.require.pattern.test(source)).map(
      (c) => c.subject
    )
  }

  it('#821 이전 상태 — 표 금지와 표 권장이 공존하던 원문', () => {
    const before = [
      // buildAnswerLengthCeiling (대화·설명·근거 공용)
      "'분량 상한: 답변 본문은 **한국어 700자 이내로 완결**한다. 표를 그리거나 항목을 10개씩 나열하지 말고 핵심 3~5개만 문단으로 말한다.',",
      // report 모드
      "'전체 report는 기본 700~1100자 안팎. ④ 비교(처방 vs 실제, 구간 비교)는 markdown 표로 ⑤ 핵심 한 줄은 **굵게**.',"
    ].join('\n')
    expect(conflictsIn(before)).toContain('표(table) 사용')
  })

  it('#821 라이브 QA에서 나온 두 번째 모순 — "필요할 때만" 과 "적극"', () => {
    const before = [
      "'마크다운은 필요할 때만 쓴다. 제목이나 목록을 쓰더라도 질문을 더 읽기 쉽게 만드는 목적일 때만 사용한다.',",
      "'**읽기 쉽게 쓴다.** 나열할 항목이 셋 이상이면 목록을, 둘 이상을 견주면 표를 적극 쓴다.',"
    ].join('\n')
    expect(conflictsIn(before)).toContain('마크다운 적극성')
  })

  it('#814 이전 — 개인화 금지와 개인 데이터 요구가 공존하던 상태', () => {
    const before = [
      "'질문이 일반 개념이면 부상 노트를 억지로 연결하지 말고, 개인화 단락도 생략한다.',",
      "'개인 훈련 질문이면 이 사람에게만 해당하는 근거를 최소 하나 넣는다.',"
    ].join('\n')
    expect(conflictsIn(before)).toContain('개인 데이터 사용')
  })

  it('고쳐진 현재 지침에서는 아무것도 안 걸린다', () => {
    expect(conflictsIn(INDEX_SRC)).toEqual([])
  })
})
