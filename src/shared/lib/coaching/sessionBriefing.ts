/**
 * 프리런 "작전 브리핑" 4요소 생성기 (#370, 에픽 #362).
 *
 * ScheduledSession(F2 골격) + 장기맥락(목표·부상·부하·나이)을 받아, 결정론으로
 *   ① 이번 훈련 목표  ② 세부 이행지침  ③ 훈련 효과  ④ 조심할 점
 * 을 만든다. AI 호출 없음(running-coaching-standards "항상 포함 코칭블록은 결정론").
 *
 * 근거(evidence)는 화면에 인라인 노출하지 않고 "근거 단서 버튼 → 바텀시트"로만 노출한다
 * (running-coaching-standards "코칭 신뢰 원칙"). 각 항목에 귀속 방법론을 EvidenceRef 로 단다.
 */

import type { RunType } from '@/entities/run/model'
import type { ScheduledSession } from '@/entities/training-schedule/model'
import type { TrainingGoal, TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'

/** 코칭 근거(방법론·연구) 한 줄. 바텀시트에서만 노출. */
export type EvidenceRef = {
  method: string
  summary: string
  url?: string
}

export type SessionBriefing = {
  /** ① 이번 훈련 목표(세션 제목 + 목표 연계). */
  goalLine: string
  /** ③ 훈련 효과(왜 이걸 하나). */
  effect: string
  /** ② 세부 이행지침(어떻게 뛰나). 1~3줄. */
  execution: string[]
  /** ④ 조심할 점(부상·부하). 없으면 빈 배열. */
  cautions: string[]
  /** 근거 단서 → 바텀시트용 방법론 귀속. */
  evidence: EvidenceRef[]
}

const EVIDENCE = {
  polarized: {
    method: 'Polarized / 80-20 (Seiler)',
    summary: '지구력 훈련은 저강도 기반이 대부분이고 고강도는 일부일 때 효과적이라는 분포 원칙.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/20861519/'
  },
  daniels: {
    method: 'Daniels VDOT (역치/템포)',
    summary: '경기력에서 역산한 VDOT로 강도별 페이스를 정한다. 템포는 "편하게 힘든" 역치 자극.',
    url: undefined
  },
  longRun: {
    method: 'Long Run / 주기화',
    summary: '유산소 베이스와 후반 지속력을 만드는 핵심 세션. 목표일까지 점진적으로 연결.'
  },
  recovery: {
    method: '회복도 훈련의 일부 (World Athletics)',
    summary: '휴식·회복은 다음 적응을 만드는 필수 요소.'
  },
  progressiveLoad: {
    method: '점진적 부하',
    summary: '볼륨·강도·빈도를 동시에 크게 올리지 않는다. 최근 부하 추세와 통증 신호를 함께 본다.'
  }
} as const

/** 세션 타입별 훈련 효과(결정론 사전). */
function effectFor(type: RunType): { text: string; evidence: EvidenceRef } {
  switch (type) {
    case 'Easy + Strides':
      return { text: '모세혈관·미토콘드리아 발달(회복)에 더해, 짧은 스트라이드로 신경근·러닝 이코노미를 자극해요.', evidence: EVIDENCE.polarized }
    case 'Easy':
      return { text: '유산소 베이스를 쌓고 회복을 도와요. 다음 강한 세션의 토대가 됩니다.', evidence: EVIDENCE.polarized }
    case 'Recovery':
      return { text: '적극적 회복으로 피로를 풀고 다음 적응을 준비해요.', evidence: EVIDENCE.recovery }
    case 'Tempo':
      return { text: '젖산 역치를 끌어올려 "편하게 힘든" 페이스를 더 오래 유지하게 만들어요.', evidence: EVIDENCE.daniels }
    case 'LSD':
      return { text: '낮은 강도로 오래 달려 유산소 베이스와 지방 대사·모세혈관을 키워요.', evidence: EVIDENCE.longRun }
    case 'Steady Long':
      return { text: '긴 거리 지속력과 후반 유지력을 만들어 레이스 후반을 버티게 해요.', evidence: EVIDENCE.longRun }
    case 'Race':
      return { text: '목표 레이스 페이스 감각을 점검하고 페이싱을 몸에 익혀요.', evidence: EVIDENCE.daniels }
    default:
      return { text: '오늘 세션으로 목표를 향한 기초 체력을 다져요.', evidence: EVIDENCE.polarized }
  }
}

/** ② 세부 이행지침. 처방(페이스대/노트) + 타입별 구조. */
function executionFor(session: ScheduledSession): string[] {
  const { sessionType, prescription } = session
  const lines: string[] = []
  const dist = prescription.distanceKm ? `${prescription.distanceKm}km` : ''
  const dur = prescription.durationMin ? `${prescription.durationMin}분` : ''
  const amount = [dist, dur].filter(Boolean).join(' · ')
  const pace = prescription.paceRange

  switch (sessionType) {
    case 'Easy + Strides':
      lines.push(`본런: 편한 대화 페이스${pace ? ` ${pace}` : ''}${amount ? `, ${amount}` : ''}`)
      lines.push('마무리: 100m 스트라이드 4~6회, 힘 빼고 빠르게 · 사이 완전 회복')
      break
    case 'Tempo':
      lines.push(`${amount ? `${amount} ` : ''}편하게 힘든 강도 지속${pace ? ` ${pace}` : ''}, 심박 상한 준수`)
      lines.push('무너지면 중단 — 자극 확보가 목적이지 기록 경신이 아니에요')
      break
    case 'LSD':
    case 'Steady Long':
      lines.push(`${amount ? `${amount} ` : ''}대화 가능 강도${pace ? ` ${pace}` : ''}, 심박 안정 우선`)
      lines.push(sessionType === 'Steady Long' ? '후반 자연 가속만 허용, 급락 금지' : '후반 급락 없이 일정하게')
      break
    case 'Recovery':
      lines.push(`아주 느리게${pace ? ` ${pace}` : ''}${amount ? `, ${amount}` : ''} — 회복이 목적`)
      break
    case 'Race':
      lines.push(`목표 레이스 페이스${pace ? ` ${pace}` : ''} 점검${amount ? `, ${amount}` : ''}`)
      break
    default:
      lines.push(`편한 대화 가능 페이스${pace ? ` ${pace}` : ''}${amount ? `, ${amount}` : ''}`)
  }
  // 처방 노트(스트라이드 프로토콜 등)가 위 지침과 중복되지 않으면 보조 한 줄로 노출.
  if (prescription.note && !lines.some((l) => l.includes(prescription.note))) {
    lines.push(prescription.note)
  }
  return lines
}

/** ④ 조심할 점 — 부상 severity·부하 추세에서 결정론으로. */
function cautionsFor(
  session: ScheduledSession,
  injury: TrainingInjuryItem | null,
  chronic: ChronicLoadTrend | null
): { lines: string[]; evidence: EvidenceRef | null } {
  const lines: string[] = []
  let evidence: EvidenceRef | null = null

  if (injury && (injury.status === 'active' || injury.status === 'monitoring')) {
    const severity = injury.severity ?? 0
    const area = injury.area || '관리 부위'
    if (severity >= 1) {
      if (session.sessionType === 'Easy + Strides' && severity >= 2) {
        lines.push(`${area} 통증 ${severity}/5 — 스트라이드 횟수를 줄이고(4회 이하), 통증이 커지면 중단하세요.`)
      } else if (session.keySession && severity >= 3) {
        lines.push(`${area} 통증 ${severity}/5 — 오늘 같은 강한 세션은 무리예요. 강도를 낮추거나 미루는 걸 권합니다.`)
      } else {
        lines.push(`${area} 통증 ${severity}/5 — 통증 변화를 보며 보수적으로, 악화되면 강도를 낮추세요.`)
      }
      evidence = EVIDENCE.progressiveLoad
    }
  }

  if (chronic && (chronic.status === 'spike' || chronic.status === 'rising')) {
    const verb = chronic.status === 'spike' ? '급증' : '증가'
    lines.push(`최근 30일 부하가 이전 대비 ${chronic.increasePct ?? ''}% ${verb} — 무리한 상향은 미루세요.`)
    evidence = EVIDENCE.progressiveLoad
  }

  return { lines, evidence }
}

export type SessionBriefingContext = {
  goal: TrainingGoal | null
  injury: TrainingInjuryItem | null
  chronic: ChronicLoadTrend | null
}

/** ScheduledSession + 장기맥락 → 4요소 작전 브리핑(결정론). */
export function buildSessionBriefing(session: ScheduledSession, ctx: SessionBriefingContext): SessionBriefing {
  const goalLabel = ctx.goal?.title ? `'${ctx.goal.title}' ` : ''
  const phaseLabel = phaseLabelKo(session.phase)
  const goalLine = `${goalLabel}${phaseLabel} — ${sessionTypeLabel(session.sessionType)}`

  const effect = effectFor(session.sessionType)
  const execution = executionFor(session)
  const caution = cautionsFor(session, ctx.injury, ctx.chronic)

  const evidence: EvidenceRef[] = dedupeEvidence([
    effect.evidence,
    session.sessionType === 'Tempo' || session.sessionType === 'Race' ? EVIDENCE.daniels : null,
    caution.evidence
  ])

  return {
    goalLine,
    effect: effect.text,
    execution,
    cautions: caution.lines,
    evidence
  }
}

function dedupeEvidence(refs: (EvidenceRef | null)[]): EvidenceRef[] {
  const seen = new Set<string>()
  const out: EvidenceRef[] = []
  for (const r of refs) {
    if (!r || seen.has(r.method)) continue
    seen.add(r.method)
    out.push(r)
  }
  return out
}

/** 세션 타입 사용자 표시 라벨(KO). 화면에 영문 enum 을 그대로 노출하지 않는다. */
export function sessionTypeLabel(type: RunType): string {
  switch (type) {
    case 'Easy':
      return '이지'
    case 'Recovery':
      return '회복주'
    case 'Easy + Strides':
      return '이지 + 스트라이드'
    case 'Tempo':
      return '템포'
    case 'LSD':
      return 'LSD(장거리)'
    case 'Steady Long':
      return '스테디 롱'
    case 'Race':
      return '레이스'
    default:
      return type
  }
}

function phaseLabelKo(phase: ScheduledSession['phase']): string {
  switch (phase) {
    case 'Base':
      return '기초기'
    case 'Build':
      return '발전기'
    case 'Threshold':
      return '역치기'
    case 'Race Specific':
      return '레이스 준비기'
    case 'Taper':
      return '테이퍼'
    case 'Recovery':
      return '회복기'
    default:
      return ''
  }
}
