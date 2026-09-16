import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * conversational 지침이 제안 통로를 통째로 막지 않는지 지키는 소스 가드(#697).
 *
 * 왜 소스 텍스트를 검사하나: `index.ts` 는 Deno 전용 import 가 섞여 vitest 로 불러올 수 없고,
 * 판정식이 아니라 **프롬프트 한 줄**이 기능을 껐던 결함이라 미러할 로직이 없다.
 *
 * 같은 모양의 사고가 세 번 반복됐다 — 기능은 있는데 모드/게이트가 꺼버려 100% 폐기됐다:
 *   #642 G3 게이트가 축약된 upcomingSchedule 을 봐서 세션 액션 4종 폐기
 *   #690 벤치마크 페이로드를 structuredCoachContext 뒤에 숨겨 비교 질문이 분류에서 탈락
 *   #697 conversational 지침이 injuryUpdateProposal 을 강제 null (부상 상태를 대화로 못 바꿈)
 *   #814 general 지침이 "activeInjuryItem 이 없다고 보고 답한다" — 부상을 실어 보내도 없는 셈 침
 *
 * 전부 배포 후 실사용에서야 드러났다. 프롬프트 문자열은 타입도 테스트도 안 걸리기 때문이다.
 */
const INDEX_SRC = readFileSync(
  resolve(__dirname, '../supabase/functions/coach-run/index.ts'),
  'utf-8'
)

describe('conversational 지침이 승인형 제안 통로를 막지 않는다 (#697)', () => {
  it('injuryUpdateProposal 을 trainingMemoryPatch 와 묶어 무조건 null 로 만들지 않는다', () => {
    // 2026-08-22 실사용: 사용자가 "발바닥 해제해줘"를 1분 안에 3번 반복했다. 이 한 줄 때문에
    // 모든 대화 턴에서 부상 제안이 구조적으로 불가능했다.
    expect(INDEX_SRC).not.toContain('trainingMemoryPatch와 injuryUpdateProposal은 null로 둔다')
  })

  it('맥락 있는 대화 턴에서는 부상 상태 변화를 제안으로 낼 수 있다', () => {
    expect(INDEX_SRC).toContain('injuryUpdateProposal로 제안한다')
  })

  it('trainingMemoryPatch 는 계속 막아둔다 — 승인 없이 저장되는 경로다', () => {
    // ai-coaching-goal.md §378 · [[training-memory-lww-clobber-hazard]].
    // 부상 상태를 여는 것과 루틴 자동 저장을 여는 것은 별개다.
    expect(INDEX_SRC).toContain('trainingMemoryPatch는 항상 null로 둔다')
  })

  it('conversational 은 맥락 있는 분기로 지침을 받는다', () => {
    // buildFreeConversationInstructions 는 진짜 자유대화와 conversational 양쪽에 쓰인다.
    // 네 번째 인자(hasStructuredContext)를 안 넘기면 "activeInjuryItem 이 없다고 보고 답한다"가
    // 그대로 가서 코치가 있는 부상을 부정한다.
    expect(INDEX_SRC).toContain(
      'buildFreeConversationInstructions(runnerLevel, levelGuide, restAlternativeOffered, true)'
    )
  })
})

describe('데이터 조회 실측이 턴마다 남는다 (#652 후속)', () => {
  it('coach_reports insert 에 data_query_log 가 포함된다', () => {
    // 빠지면 로깅이 조용히 죽는다 — 그리고 그걸 알아채는 유일한 방법이 "몇 주 뒤 로그가 비어 있음"이다.
    expect(INDEX_SRC).toContain('data_query_log: queryLog')
  })

  it('도구 호출 결과를 성공·실패 모두 기록한다', () => {
    // 실패만 기록하던 구조가 누수의 원인이었다. 도구 미호출(빈 toolCalls)도 신호로 남아야 한다.
    expect(INDEX_SRC).toContain("queryLog.toolCalls.push")
    expect(INDEX_SRC).toContain("{ name: 'queryRuns', ok: false }")
    expect(INDEX_SRC).toContain("{ toolCalls: [], ungroundedClaims: 0 }")
  })

  it('승낙 턴의 수치 재진술은 ungrounded 오탐으로 갈라낸다', () => {
    // "응 해줘" 가 ungrounded_claim 으로 잡힌 실측(2026-08-24). 이 로그가 차단 승격의 정밀도 근거라
    // 오탐이 섞이면 판단이 흐려진다. 조건은 좁다 — isBareContinuation AND 직전 턴 queryRuns 성공.
    expect(INDEX_SRC).toContain('previousTurnQueriedRuns')
    expect(INDEX_SRC).toContain('queryLog.ungroundedThreadGrounded = threadGrounded')
    expect(INDEX_SRC).toContain('if (!threadGrounded) {')
  })

  it('직전 턴 판정은 같은 스레드로 스코프된다', () => {
    // 다른 스레드의 조회가 근거가 되면 안 된다(전역 대화는 selected_run_id null).
    expect(INDEX_SRC).toContain("query.eq('selected_run_id', selectedRunId) : query.is('selected_run_id', null)")
  })
})

describe('세션 타입 자기정합 지침 (#715, 2026-08-26 실사용)', () => {
  it('coachThread 의 옛 세션 타입을 현재 사실로 쓰지 않게 못박는다', () => {
    // 실측: 한 답변 안에서 "목요일 템포는 낮추자"(어제 기억) + "목요일은 Easy가 들어가 있고"(실제 플랜).
    // #695 는 "네/맞아요" 직답만 막았고, 서술하며 옛 타입을 끌어오는 경로는 안 덮였다.
    expect(INDEX_SRC).toContain('그때의 플랜이지 현재 사실이 아니다')
    expect(INDEX_SRC).toContain('upcomingSchedule 이 이긴다')
  })

  it('한 답변 안 같은 날짜의 타입 일치를 요구한다', () => {
    expect(INDEX_SRC).toContain('같은 날짜의 세션 타입을 두 번 말하면 반드시 같아야 한다')
  })

  it('이미 그 타입인 세션을 낮추자고 하지 않게 한다', () => {
    // 목요일이 이미 Easy 인데 "Easy 로 낮추자"는 낮출 게 없는 말이다.
    expect(INDEX_SRC).toContain('이미 그 타입인 세션을 "낮추자"고 하지 마라')
  })
})

/**
 * #814 — 개인 사실은 문구 분류와 무관하게 유효하다.
 *
 * 2026-09-16 실사고: "어제 뛴 세션대이터와 최근 러닝 횟수를 보고 코치해줘" 가 general 로 분류돼
 * 코치가 4.61km/39분을 DB 에 두고도 "한 주에 1회 정도라면" 이라고 추측체로 답했다. 같은 날 같은
 * 질문에 ChatGPT 는 **데이터가 없어서 사용자에게 물어본 뒤** 부하를 판정했다. 데이터를 가진 쪽이 졌다.
 *
 * 컨텍스트에 필드를 다시 실어도 그것만으로는 안 된다 — **시스템 지침이 "없는 셈 쳐라"라고 덮어쓰면
 * 무력화된다**(Codex 교차검증이 잡은 P1). 두 층을 함께 잠근다.
 */
describe('개인 사실은 자유대화에서도 유효하다 (#814)', () => {
  it('general 지침이 개인 사실을 "없다고 보고 답하라"고 하지 않는다', () => {
    // 이 문자열이 살아 있으면 컨텍스트에 부상을 실어 보내도 코치가 부정한다.
    expect(INDEX_SRC).not.toContain('selectedRun, activeGoal, activeInjuryItem, trustLayerNote가 없다고 보고 답한다')
    expect(INDEX_SRC).toContain('개인 사실은 실려 있고 유효하다')
  })

  it('injuryUpdateProposal 을 general 이라는 이유로 강제 null 하지 않는다', () => {
    // #697 이 conversational 쪽만 고쳤고 general 쪽엔 이 줄이 남아 있었다.
    expect(INDEX_SRC).not.toContain("      : 'injuryUpdateProposal은 null로 둔다.'")
  })

  it('개인 사실 필드가 structuredCoachContext 게이트 뒤로 돌아가지 않는다', () => {
    // 이 게이트가 다시 붙으면 오분류 한 번에 코치가 사용자를 모르는 상태가 된다.
    for (const field of [
      'upcomingSchedule',
      'restState',
      'injurySignals',
      'activeInjuryItem',
      'recentInjuryWindow'
    ]) {
      expect(INDEX_SRC, field).not.toContain(`${field}: structuredCoachContext ? ${field} : null,`)
    }
    expect(INDEX_SRC).not.toContain('injuryItems: structuredCoachContext ? injuryItems : [],')
    expect(INDEX_SRC).not.toContain('marathonFlag: structuredCoachContext ? marathonFlag : false,')
  })

  it('자유대화가 "일반 GPT처럼" 답하라고 지시하지 않는다', () => {
    // 일반 GPT 는 이 사용자를 모른다 — 그게 우리가 이기는 유일한 지점이다.
    // ⚠ 단순히 '일반 GPT처럼' 만 찾으면 이 결정을 설명하는 **주석**에도 걸린다. 지침 원문만 본다.
    expect(INDEX_SRC).not.toContain('세션 분석 재료를 쓰지 말고 일반 GPT처럼 질문에 직접 답한다')
    expect(INDEX_SRC).toContain('너는 이 사용자를 아는 코치다')
  })
})

/**
 * #815 · #816 — 통증 판정 기준과 예후.
 *
 * 2026-09-16: 사용자의 아침 기준선이 3인데 코치는 "0~2/5면 관찰" 고정 밴드를 3주 내내 반복했다.
 * 고정 밴드는 기준선이 높은 사람에게 영원히 빨간불이라 "어제 그 러닝이 과했나"를 판정할 수 없다.
 * 근거는 SSOT §3-B Pain-Monitoring Model(Silbernagel 2007) — 판정은 절대 0 이 아니라 **기준선 복귀**다.
 */
describe('통증 판정은 기준선 복귀로, 예후는 개월 단위로 (#815, #816)', () => {
  it('"통증 0이어야 뛴다"가 근거 없음을 못박는다', () => {
    expect(INDEX_SRC).toContain('"통증이 0 이어야 뛴다"는 기준은 근거가 없다')
  })

  it('판정 기준이 고정 밴드가 아니라 다음 날 아침 기준선 복귀다', () => {
    expect(INDEX_SRC).toContain('다음 날 아침에 그 사람의 평소 수준(기준선)으로 돌아왔는가')
    expect(INDEX_SRC).toContain('절대값이 아니라 **기준선 복귀**다')
  })

  it('예후를 개월 단위로 말하고 아침 통증이 마지막까지 남는다고 알린다', () => {
    expect(INDEX_SRC).toContain('주 단위가 아니라 개월 단위')
    expect(INDEX_SRC).toContain('아침 첫 체중부하 통증이 마지막까지 남는 축')
  })

  it('예후 안내가 안심으로 흐르지 않게 redFlag 우선을 유지한다', () => {
    expect(INDEX_SRC).toContain('예후를 근거로 안심만 시키지 말고')
  })
})

/**
 * Codex 교차검증이 잡은 두 가지(2026-09-16, 확인 후 수용). 둘 다 **안전을 깎는** 방향이었다.
 */
describe('통증 허용 판정은 질환별로 켠다 (#815 스코프 가드)', () => {
  it('적용 불가 질환에는 통증 허용 판정을 주지 않는다', () => {
    // MTSS 는 §3 에서 "무통증 게이트 4~6주"를 쓴다. 기준선 복귀 판정을 주면 SSOT 와 정면 충돌한다.
    expect(INDEX_SRC).toContain('loadToleranceRule: !painMonitoringApplies ? null :')
    // false 는 "적용 불가"가 아니라 "근거 미확인"이다 — 단정하면 건병증에까지 무통증 요구가 새어 들어간다.
    expect(INDEX_SRC).toContain('적용 근거가 확인되지 않았다')
    expect(INDEX_SRC).toContain('판정이 내려진 것은 아니다')
  })
})

/** Codex 교차검증 4차(2026-09-16). 시점 불일치와 근거 범위 초과 — 둘 다 다른 부상에 규칙이 새는 경로였다. */
describe('질환별 규칙이 다른 부상으로 새지 않는다 (#815/#816 스코프)', () => {
  it('웹이 평가한 부상과 서버가 고른 당시 부상이 같을 때만 통증 허용 규칙을 적용한다', () => {
    // #507 시점 규칙: 서버는 선택 세션 날짜 기준 당시 부상을 고른다. 현재 부상 신호를 그대로 쓰면
    // 과거 MTSS 세션에 족저근막 기준이 붙는다.
    expect(INDEX_SRC).toContain("injurySignals?.injuryId === (activeInjuryItem as { id?: unknown } | null)?.id")
  })

  it('족저근막증 예후 수치를 다른 건병증에 옮겨 붙이지 않게 못박는다', () => {
    expect(INDEX_SRC).toContain('구체 수치는 족저근막증에서만 말한다')
    expect(INDEX_SRC).toContain('이 숫자·시간표를 옮겨 붙이지 말고')
  })
})


/**
 * 2026-09-16 실사고: 사용자가 "비교하기 쉽게 표로 보여줘"라고 명시 요청했는데 코치가 불릿으로 답했다.
 *
 * 원인이 둘이었다 — 둘 다 프롬프트 한 줄이고, 둘 다 타입·기존 테스트에 안 걸렸다:
 *   ① 대화/설명 모드 공용 분량 상한이 "표를 그리거나 ... 말고"로 **표를 금지**하고 있었다.
 *      무료 LLM 시절(스트림 절단 회피) 유물인데, 렌더러는 표를 지원하고 report 모드는 표를 권하는
 *      상태라 같은 앱 안에서 지침이 정반대였다.
 *   ② 제안 이어받기 규칙이 맨 승낙("응")만 커버해, 승낙에 형식이 한 마디 붙자("표로 보여줘")
 *      새 질문으로 읽혀 비교 대상이 통째로 바뀌었다.
 */
describe('명시된 출력 형식 요청을 지침이 막지 않는다 (2026-09-16)', () => {
  it('분량 상한이 표를 금지하지 않는다', () => {
    expect(INDEX_SRC).not.toContain('표를 그리거나 항목을 10개씩 나열하지 말고')
  })

  it('사용자가 형식을 지정하면 그 형식으로 답하라고 시킨다', () => {
    expect(INDEX_SRC).toContain('사용자가 형식을 지정하면 그 형식으로 답한다')
    expect(INDEX_SRC).toContain('분량 상한을 이유로 형식 요청을 거절하지 마라')
  })

  it('표 문법을 렌더러가 파싱할 수 있는 형태로 못박는다', () => {
    // CoachMessage.vue 의 isMarkdownTableSeparator 는 /^:?-{3,}:?$/ 다 — `|--|` 는 표로 안 잡히고
    // 파이프가 그대로 보이는 문단이 된다. 지침에서 구분선 형태를 명시해야 한다.
    expect(INDEX_SRC).toContain('|---|---|')
  })

  it('승낙에 형식만 덧붙인 요청도 직전 제안의 후속으로 처리한다', () => {
    expect(INDEX_SRC).toContain('형식·범위만 덧붙인 요청')
    expect(INDEX_SRC).toContain('비교 대상을 임의로 갈아끼우지 마라')
  })
})

/**
 * 코치 말투 계약 (2026-09-16 사용자 지적).
 *
 * ① "monitoring·active 같은 개발 용어는 흔히 쓰는 말로 순화해라"
 * ② "'밀다', '발이 조용하다' 는 한국어로 되게 어색하다"
 * ③ "표·ol·ul 로 가독성을 높여라"
 * ④ "경쟁력은 사용자 러닝 데이터와 장기기억을 데이터화한 것이니 그게 확실히 느껴져야 한다"
 *
 * 프롬프트 문자열이라 타입도 테스트도 안 걸린다 — 지워지면 조용히 옛 말투로 돌아간다.
 */
describe('코치 말투 계약 (2026-09-16)', () => {
  it('내부 상태값을 앱 화면 라벨로 옮기라고 못박는다', () => {
    // 라벨 출처: MemoryPage.vue / CoachSessionOverlay.vue. 코치가 화면과 다른 말을 쓰면 안 된다.
    expect(INDEX_SRC).toContain('active=관리 중, monitoring=관찰 중, resolved=해소')
  })

  it('어색한 은유를 금지한다 — 통증 "조용하다", 훈련 "밀다"', () => {
    expect(INDEX_SRC).toContain('어색한 은유를 쓰지 마라')
    expect(INDEX_SRC).toContain('발이 조용한지')
    expect(INDEX_SRC).toContain('밀다/밀어붙이다')
  })

  it('"조용"은 구절이 아니라 단어 단위로 막는다', () => {
    // 1차 문구는 예시 구절만 막아서 활용형으로 샜다(실측: "상태가 조용할 때만").
    expect(INDEX_SRC).toContain('어떤 활용형도 안 된다')
    expect(INDEX_SRC).toContain('조용해지면')
  })

  it('요청을 기다리지 말고 목록·표를 먼저 쓰라고 시킨다', () => {
    expect(INDEX_SRC).toContain('사용자가 형식을 요청할 때까지 기다리지 마라')
    expect(INDEX_SRC).toContain('번호 목록')
  })

  it('개인 데이터 근거를 최소 하나 넣으라고 요구한다', () => {
    expect(INDEX_SRC).toContain('이 사람에게만 해당하는 근거를 최소 하나')
  })

  it('일반 개념 질문까지 개인화하지는 않는다 (반대 방향 회귀 가드)', () => {
    // 이 단서가 빠지면 #559·#701 이 막아둔 "묻지 않은 세션 지표 들이밀기"가 되살아난다.
    expect(INDEX_SRC).toContain('질문이 일반 개념 설명이면')
  })
})

/**
 * 2026-09-16 라이브 QA: 말투 계약을 넣었는데도 목록·표가 안 나왔다.
 *
 * 원인은 지침 충돌이었다 — 대화 모드의 "지표 나열 금지 · 2~6문장 사담으로만"이 형식까지 막아서,
 * 코치가 수치 다섯 개를 줄글 한 문장에 몰아넣었다("4.61km, 평균심박 137, 최고 150, RPE 3이었고,
 * 현재 Easy 상한은 138이라…"). 금지해야 할 것은 **묻지 않은 전체 재분석**이지 목록·표가 아니다.
 */
describe('리포트 금지가 형식까지 막지 않는다 (2026-09-16)', () => {
  it('대화 모드 금지 대상이 "고정 리포트 템플릿"으로 좁혀져 있다', () => {
    expect(INDEX_SRC).toContain('금지 대상은 고정 리포트 템플릿이지 목록·표가 아니다')
  })

  it('자유대화 지침도 형식이 아니라 재분석을 금지한다', () => {
    expect(INDEX_SRC).toContain('금지 대상은 **형식이 아니라 묻지 않은 전체 재분석**이다')
  })

  it('"지표 나열" 통째 금지 문구가 남아 있지 않다', () => {
    // 이 표현이 살아 있으면 수치를 목록으로 정리하는 것까지 금지로 읽힌다.
    expect(INDEX_SRC).not.toContain('같은 마크다운 섹션 헤더와 지표 나열을 쓰지 말고')
    expect(INDEX_SRC).not.toContain('같은 코칭 리포트 섹션, 지표 나열, 세션 전체 재분석')
  })
})

/**
 * 2026-09-16 라이브 QA 2차에서 드러난 회귀 두 건.
 *
 * ① 형식 완화를 뭉뚱그렸더니 "## 조심할 점" 리포트 헤더가 대화 턴에 되살아났다.
 * ② trustLayerNote(앱이 '~다'체로 만든 결정론 문장)를 그대로 붙여넣어 한 답변 안에서 문체가 섞였다.
 *    쓰는 법을 알려주는 지침이 report 세트에만 있어 다른 모드에는 재료만 가고 사용법이 없었다.
 */
describe('형식 완화가 리포트 헤더까지 풀지 않는다 (2026-09-16 2차)', () => {
  it('허용 경계를 목록·표·굵게까지로 못박는다', () => {
    expect(INDEX_SRC).toContain('허용되는 건 목록·표·굵게까지다')
    expect(INDEX_SRC).toContain('`##` 소제목을 붙이지 마라')
  })

  it('앱이 만든 문장을 그대로 붙여넣지 말라고 시킨다', () => {
    expect(INDEX_SRC).toContain('그대로 붙여넣을 인용문이 아니라 재료다')
    expect(INDEX_SRC).toContain('답변 전체를 하나의 말투로 유지한다')
  })
})
