/**
 * 처치(주사·충격파) 뒤 코치가 알아야 할 것 — 결정론 꼬리표와 기록 알림 (#850).
 *
 * 정본은 `.harness/project/running-injury-knowledge.md` §3-D, 근거는 `research/injury-treatments-evidence.md`.
 * 여기 문구를 바꾸면 KB 도 함께 고친다.
 *
 * 왜 프롬프트 지침이 아니라 꼬리표인가: 코치는 "스테로이드 주사를 맞았다"를 일반 발 통증으로만 받았다
 * (2026-10-14). 지식이 없는 게 원인이라 지침 한 줄로는 안 되고, 처치 직후엔 **정확한 내용이 매번** 실려야 한다.
 * 컨텍스트 JSON 안에 넣으면 자기 과거 답변을 못 이긴다(#795) — 그래서 JSON 뒤에 세운다.
 *
 * ⚠ 근거 경계: 주사 후 "N일 달리기 금지" 같은 권위 있는 수치는 없다. 코치가 기간을 단정하지 않고
 *   **병원 안내를 우선**하게 하는 게 이 모듈의 핵심이다. 처치 결정을 평가하지도 않는다.
 */

import type { TreatmentKind, TreatmentMention } from './treatmentMention.ts'

export type RecentTreatment = TreatmentMention & { daysSince: number }

/** 처치 후 코치가 처치 사실을 의식하는 기간. 스테로이드 효과가 수주 가는 구간(통증이 가려지는 때)을 덮는다. */
export const TREATMENT_AWARENESS_DAYS = 42
/** 이 기간 안이면(또는 이번 턴에 말했으면) 주의사항 전체를 싣는다. 그 뒤엔 한 줄만. */
const FULL_GUIDE_DAYS = 7

export const TREATMENT_LABELS: Record<TreatmentKind, string> = {
  corticosteroid: '스테로이드 주사',
  eswt: '체외충격파',
  pdrn: 'PDRN 주사',
  prp: 'PRP 주사',
  injection: '주사(종류 미상)'
}

const COMMON_RULES = [
  '병원·의사의 안내가 최우선이다. 처치 결정을 평가하거나 뒤집지 않는다.',
  '"주사 후 N일/N주 달리기 금지" 같은 기간을 단정하지 않는다 — 권위 있는 수치가 없다. 병원에서 들은 안내가 있는지 먼저 묻고 그걸 따른다.',
  '아래 위험 신호가 있으면 처방을 멈추고 진료를 권한다.'
]

const GUIDES: Record<TreatmentKind, string[]> = {
  corticosteroid: [
    '통증이 줄어도 근막이 나은 것은 아니다. 주사는 통증을 가릴 수 있으니 "안 아프다"를 복귀 신호로 쓰지 말고, 아침 첫발·다음날 반응과 walk-run 점진(§3-B)을 그대로 지킨다.',
    '처음 1~3일은 오히려 더 아플 수 있다(일시적 반응).',
    '드물지만 족저근막 파열이 보고된다(관찰연구 2.4~10%, RCT에선 0건 — 숫자로 겁주지 말 것). 갑자기 찢어지는 듯한 아치 통증·뚝 하는 느낌·발바닥 멍·체중을 못 실음 → 즉시 진료.',
    '감염 신호: 열, 번지는 발적, 열감, 48시간이 지나도 계속 심해지는 통증 → 즉시 진료.',
    '당뇨가 있으면 며칠(최대 1주) 혈당이 오를 수 있다.',
    '반복 주사는 지방층 위축·파열 위험 때문에 의사와 상의할 일이다(횟수 기준을 단정하지 않는다).',
    '종아리·발바닥 근력 운동 같은 재활과 부하 관리는 계속한다 — 주사는 그 시간을 버는 수단이다.'
  ],
  eswt: [
    '시술 부위가 붉어지거나 멍·부기·뻐근함이 생기는 건 흔하고 보통 1주 안에 가라앉는다.',
    '고충격 운동을 언제 다시 할지는 병원마다 안내가 크게 다르다(48시간~6주). 들은 안내를 따른다.',
    '소염진통제·얼음을 피하라는 안내를 받았다면 그대로 지킨다(병원별 안내).',
    '갑작스러운 통증이나 기능 상실 → 진료.'
  ],
  pdrn: [
    '효과는 바로가 아니라 수주~12주 무렵에 나타나는 편이라, 단기 호전을 기대하게 하지 않는다.',
    '주사 후 활동 제한에 대한 근거는 없다 — 병원 안내를 따른다.',
    '열·번지는 발적·계속 심해지는 통증 → 진료.'
  ],
  prp: [
    '주사 후 휴식·복귀 방식은 병원마다 다르다 — 들은 안내를 따른다.',
    '열·번지는 발적·계속 심해지는 통증 → 진료.'
  ],
  injection: [
    '무슨 주사였는지 한 번 물어본다 — 스테로이드인지에 따라 주의사항이 다르다(통증 가림·파열 신호).',
    '열·번지는 발적·계속 심해지는 통증 → 진료.'
  ]
}

function dayLabel(daysSince: number): string {
  return daysSince === 0 ? '오늘' : `${daysSince}일 전`
}

/** 저장 행 + 이번 턴 감지분을 합쳐 최근 처치 목록을 만든다(같은 종류·날짜는 하나). */
export function mergeRecentTreatments(saved: TreatmentMention[], mentioned: TreatmentMention[], today: string): RecentTreatment[] {
  const base = Date.parse(`${today}T00:00:00Z`)
  const byKey = new Map<string, RecentTreatment>()
  for (const item of [...saved, ...mentioned]) {
    const daysSince = Math.round((base - Date.parse(`${item.treatedOn}T00:00:00Z`)) / 86400000)
    if (daysSince < 0 || daysSince > TREATMENT_AWARENESS_DAYS) continue
    byKey.set(`${item.kind}:${item.treatedOn}`, { ...item, daysSince })
  }
  return [...byKey.values()].sort((a, b) => a.daysSince - b.daysSince)
}

/**
 * 프롬프트 꼬리표. 처치가 없으면 ''.
 * 최근 7일 안이거나 이번 턴에 말한 처치는 주의사항 전체를, 그 밖은 사실 한 줄만 싣는다(입력 토큰이 원가의 95%).
 */
export function buildTreatmentGuideTail(treatments: RecentTreatment[], mentionedThisTurn: TreatmentMention[]): string {
  if (!treatments.length) return ''
  const mentioned = new Set(mentionedThisTurn.map((item) => `${item.kind}:${item.treatedOn}`))
  const lines = treatments.map(
    (item) => `- ${TREATMENT_LABELS[item.kind]} · ${item.treatedOn} (${dayLabel(item.daysSince)})`
  )
  const fullKinds = [
    ...new Set(
      treatments
        .filter((item) => item.daysSince <= FULL_GUIDE_DAYS || mentioned.has(`${item.kind}:${item.treatedOn}`))
        .map((item) => item.kind)
    )
  ]
  const guide = fullKinds.length
    ? [
        '',
        '[처치 후 주의사항 — 부상 KB §3-D]',
        ...COMMON_RULES.map((rule) => `- ${rule}`),
        ...fullKinds.flatMap((kind) => [`(${TREATMENT_LABELS[kind]})`, ...GUIDES[kind].map((rule) => `- ${rule}`)])
      ]
    : ['- 처치 직후가 아니어도, 통증이 줄었다는 이유만으로 부하를 서둘러 올리지 않는다.']
  return [
    '',
    '',
    '[최근 처치 — 사용자가 직접 말한 사실, 코드가 기록]',
    ...lines,
    ...guide,
    '처치 얘기가 나오면 위 내용을 근거로 구체적으로 답한다. 일반 통증 안내로 뭉개지 않는다.'
  ].join('\n')
}

/** 새로 기록한 처치를 답변 끝에 코드가 알린다 — 코치는 저장 결과를 모른다(memoryIntake 와 같은 이유). */
export function treatmentRecordNote(recorded: TreatmentMention[]): string | null {
  if (!recorded.length) return null
  const items = recorded.map((item) => `${item.treatedOn.slice(5).replace('-', '/')} ${TREATMENT_LABELS[item.kind]}`)
  return `🩹 ${items.join(', ')} — 처치 기록에 남겨뒀어요. 앞으로 회복 안내에 반영할게요.`
}
