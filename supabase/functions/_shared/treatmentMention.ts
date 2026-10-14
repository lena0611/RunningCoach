/**
 * 사용자가 **받은** 처치(주사·충격파)를 말했는지 코드가 판정한다 (#850, 2026-10-14).
 *
 * 왜 코드가 판정하나: "어제 뒷꿈치에 스테로이드 주사를 맞았다"를 코치가 일반 발 통증으로만 받았고,
 * 그 사실은 장기기억·부상 기록 어디에도 남지 않았다(9/8 PDRN·충격파도 같음). 2주 뒤 코치는
 * "주사 후 며칠째"를 모른 채 복귀를 안내한다. 기억에 남길지를 모델에 맡기면 보장이 없다(#804 와 같은 뿌리).
 *
 * 받은 것만 잡는다 — "주사 맞을까?"(고민)·"주사는 안 맞았어"(부정)는 기록이 아니다.
 * 판정은 문장 단위: 처치 단어와 완료 표현이 **같은 문장**에 있어야 한다.
 */

export type TreatmentKind = 'corticosteroid' | 'eswt' | 'pdrn' | 'prp' | 'injection'

export type TreatmentMention = { kind: TreatmentKind; treatedOn: string }

/** 순서가 우선순위다 — 종류를 알 수 있는 주사가 하나라도 잡히면 '주사(종류 모름)'는 따로 남기지 않는다. */
const KIND_PATTERNS: Array<{ kind: Exclude<TreatmentKind, 'injection'>; pattern: RegExp }> = [
  { kind: 'corticosteroid', pattern: /(스테로이드|코르티코|코티코|코티손|트리암시놀론|뼈\s*주사)/i },
  { kind: 'eswt', pattern: /(충격파|ESWT)/i },
  { kind: 'pdrn', pattern: /(PDRN|연어\s*주사)/i },
  { kind: 'prp', pattern: /(PRP|자가\s*혈|혈소판\s*풍부)/i }
]

const INJECTION = /주사/

/** 받았다는 완료 표현. "맞았는데 뛰어도 돼?" 처럼 뒤에 질문이 붙어도 받은 사실은 사실이다. */
const DONE = /(맞았|맞고\s*(왔|옴)|맞음|맞은|받았|받고\s*(왔|옴)|받음|받은|했(다|어|음|고|는데)|하고\s*(왔|옴)|시술)/

/** 부정·경험 질문은 기록이 아니다. */
const NOT_DONE = /(안\s*(맞|받|했)|못\s*(맞|받|했)|않았|적\s*(있|없))/

/** 한국 시간 기준 오늘(YYYY-MM-DD)에서 처치 날짜를 푼다. 날짜 단서가 없으면 오늘로 본다. */
export function resolveTreatmentDate(sentence: string, today: string): string {
  const base = new Date(`${today}T00:00:00Z`)
  const shift = (days: number) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() - days)
    return d.toISOString().slice(0, 10)
  }
  const explicit = sentence.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) ?? sentence.match(/(?<![\d.])(\d{1,2})\/(\d{1,2})(?![\d/])/)
  if (explicit) {
    const month = Number(explicit[1])
    const day = Number(explicit[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = base.getUTCFullYear()
      const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      // 미래 날짜면 작년 일이다("12/28 에 맞았어"를 1월에 말한 경우).
      if (candidate > today) year -= 1
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  const daysAgo = sentence.match(/(\d{1,2})\s*일\s*전/)
  if (daysAgo) return shift(Number(daysAgo[1]))
  if (/(그제|그저께|엊그제)/.test(sentence)) return shift(2)
  if (/어제/.test(sentence)) return shift(1)
  return today
}

export function detectTreatmentMentions(userNote: string | null | undefined, today: string): TreatmentMention[] {
  const note = (userNote ?? '').trim()
  if (!note) return []
  const sentences = note.split(/(?<=[.!?])|\n/).map((part) => part.trim()).filter(Boolean)
  const found = new Map<TreatmentKind, TreatmentMention>()
  for (const sentence of sentences.length ? sentences : [note]) {
    if (!DONE.test(sentence) || NOT_DONE.test(sentence)) continue
    const treatedOn = resolveTreatmentDate(sentence, today)
    const kinds: TreatmentKind[] = KIND_PATTERNS.filter(({ pattern }) => pattern.test(sentence)).map(({ kind }) => kind)
    // "주사"인데 종류를 모르면 그것도 남긴다 — 종류를 모른다는 사실까지가 기록이다.
    if (!kinds.some((kind) => kind !== 'eswt') && INJECTION.test(sentence)) kinds.push('injection')
    for (const kind of kinds) {
      if (!found.has(kind)) found.set(kind, { kind, treatedOn })
    }
  }
  return [...found.values()]
}
