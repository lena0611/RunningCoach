import type { SessionBriefing } from '@/shared/lib/coaching/sessionBriefing'

/**
 * 브리핑 쇼츠(#898)의 대본 — **화면 브리핑(`buildSessionBriefing`)의 문장을 골라 끊기만 한다.**
 * 새 문장을 만들면 화면과 영상의 숫자가 어긋난다(#795 "두 번째 진실"). 여기서 하는 일은 셋뿐이다.
 *  1. 고르기: 핵심 한 줄 → 어떻게 뛰나(라이프사이클 단계) → 목표 → 주의. 핵심과 겹치는 보조 단계(강도·판정 등)는 뺀다.
 *  2. 끊기: 자막 한 장에 한 문장(문장 끝·" — " 에서 자른다).
 *  3. 읽기용 표기: TTS 가 "6:10~6:40/km" 를 이상하게 읽으므로 발음만 바꾼다(`toSpeech`). 자막은 원문 그대로.
 * 여는 말("오늘은 …예요")과 맺는 말("자, 출발!")은 처방이 아니라 인사라 고정 문구다.
 */
export type ScriptLine = {
  /** 자막(원문 조각) */
  text: string
  /** 읽는 말(발음용 표기) */
  speech: string
}

/** 핵심 한 줄과 겹치는 보조 단계 — 읽으면 같은 말을 두 번 한다. 화면 카드에는 그대로 남는다. */
const SKIPPED_STEP_LABELS = new Set(['강도', '판정', '옵션', '결과', '주의'])

export const CLOSING_LINE = '자, 출발!'

export function buildBriefingScript(input: { title: string; distanceKm: number | null; briefing: SessionBriefing; when?: string }): ScriptLine[] {
  const { briefing } = input
  const name = input.distanceKm ? `${input.title} ${input.distanceKm}km` : input.title
  const texts: string[] = [`${input.when ?? '오늘'}은 ${name}${copula(name)}.`]

  texts.push(...splitSubtitle(briefing.keyPoint))
  for (const step of briefing.execution) {
    if (SKIPPED_STEP_LABELS.has(step.label)) continue
    const [first, ...rest] = splitSubtitle(step.detail)
    if (!first) continue
    texts.push(`${step.label} — ${first}`, ...rest)
  }
  if (briefing.targetsLine) texts.push(`목표: ${briefing.targetsLine}`)
  for (const caution of briefing.cautions) texts.push(...splitSubtitle(caution))
  texts.push(CLOSING_LINE)

  return texts.map((text) => ({ text, speech: toSpeech(text) })).filter((line) => line.speech.length > 0)
}

/** 자막 한 장 = 한 문장. 문장 끝(. ! ?) 뒤와 " — " 에서 자른다. 괄호 안의 마침표는 자르지 않는다. */
export function splitSubtitle(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && text.startsWith(' — ', i)) {
      out.push(buf)
      buf = ''
      i += 2
      continue
    }
    buf += ch
    if (depth === 0 && /[.!?]/.test(ch) && (i + 1 >= text.length || text[i + 1] === ' ')) {
      out.push(buf)
      buf = ''
    }
  }
  out.push(buf)
  return out.map((s) => s.trim()).filter(Boolean)
}

/** 받침 있으면 '이에요', 없으면 '예요'. 마지막 글자가 한글이 아니면(km 등) 읽는 소리 기준으로 '예요'. */
function copula(word: string): string {
  const last = word.replace(/[)\s]+$/, '').slice(-1)
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '예요' : '이에요'
  return '예요'
}

const SPEECH_WORDS: Array<[RegExp, string]> = [
  [/RPE/g, '알피이'],
  [/VDOT/g, '브이닷'],
  [/LSD/g, '엘에스디'],
  [/\bOK\b/g, '오케이'],
  [/A스킵/g, '에이 스킵']
]

/**
 * 읽는 말 — 발음만 바꾼다(뜻·숫자는 그대로).
 * 괄호 속 보충 설명은 읽지 않는다(자막에 남는다). 페이스 "6:10" 은 "6분 10초", 범위 "~" 는 "에서".
 */
export function toSpeech(text: string): string {
  let s = text
  s = s.replace(/\s*\([^)]*\)/g, '')
  s = s.replace(/(\d+):(\d{2})/g, (_, m: string, sec: string) => `${Number(m)}분 ${Number(sec)}초`)
  s = s.replace(/\/km/g, '')
  s = s.replace(/([^\s(])\s*~\s*(\d)/g, '$1에서 $2')
  s = s.replace(/~\s*(\d)/g, '약 $1')
  s = s.replace(/(\d)\s*km/g, '$1킬로')
  s = s.replace(/(\d)\s*m\b/g, '$1미터')
  s = s.replace(/%/g, '퍼센트')
  s = s.replace(/\s*×\s*/g, ' ')
  for (const [pattern, word] of SPEECH_WORDS) s = s.replace(pattern, word)
  s = s.replace(/\s*(—|–|→|·)\s*/g, ', ')
  s = s.replace(/["“”'‘’:]/g, '')
  s = s.replace(/\s+([,.!?])/g, '$1').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ')
  return s.trim().replace(/^,\s*/, '')
}
