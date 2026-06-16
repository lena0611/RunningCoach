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
import type { AdaptiveTrainingProfile, TrainingGoal, TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'

type ProgressionStatus = 'ready' | 'watch' | 'blocked'

/** 세션 타입 → 관련 progressionCriterion id (적응 프로필에서 수행 게이트 상태를 읽는다). */
function criterionIdFor(type: RunType): string {
  if (type === 'Tempo' || type === 'Race') return 'tempo-ceiling-quality'
  if (type === 'LSD' || type === 'Steady Long') return 'long-run-durability'
  return 'easy-hr-stability'
}

function progressionStatusFor(type: RunType, profile: AdaptiveTrainingProfile | null | undefined): ProgressionStatus {
  if (!profile) return 'watch'
  const id = criterionIdFor(type)
  return profile.progressionCriteria.find((c) => c.id === id)?.status ?? 'watch'
}

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

/** 전족(스트라이드/빠른 달리기)에 직접 부하가 가는 부위 — 이 부위 통증이면 스트라이드를 보류한다. */
const FOREFOOT_LOAD_AREA = /족저|발|아킬레스|종아리|발목/

/**
 * 스트라이드 반복수를 단계·체력·부상에서 **산출**한다(고정값 아님).
 * 단계가 레이스에 가까울수록 신경근 자극을 늘리고, 입문(저VDOT)은 보수적으로, 전족 부상이면 보류.
 */
function computeStrides(
  phase: ScheduledSession['phase'],
  vdot: number | null,
  injury: TrainingInjuryItem | null,
  progression: ProgressionStatus
): { reps: number; hold: boolean; holdReason: string } {
  const byPhase: Record<ScheduledSession['phase'], number> = {
    Base: 5,
    Build: 6,
    Threshold: 6,
    'Race Specific': 8,
    Taper: 4,
    Recovery: 0
  }
  let reps = byPhase[phase] ?? 4
  if (vdot != null && vdot < 35) reps = Math.min(reps, 4) // 입문자 보수적

  if (injury && (injury.status === 'active' || injury.status === 'monitoring')) {
    const sev = injury.severity ?? 0
    const area = injury.area || '관리 부위'
    if (sev >= 2 && FOREFOOT_LOAD_AREA.test(area)) {
      return { reps: 0, hold: true, holdReason: `${area} ${sev}/5 — 스트라이드는 빠른 전족 부하라 직접 자극이에요. 오늘은 보류하고 본런만 이지로.` }
    }
    if (sev >= 2) reps = Math.max(2, reps - 2)
  }
  // 적응 프로필 수행 게이트: Easy 심박 안정이 검증되면 품질 상향(+1), 막혀 있으면 보수(-1).
  if (progression === 'ready') reps += 1
  else if (progression === 'blocked') reps = Math.max(2, reps - 1)
  return { reps, hold: false, holdReason: '' }
}

/** 단계별 Tempo 지속(분)을 산출. 레이스에 가까울수록 길게, 수행 게이트가 막혀 있으면 보수적으로. */
function tempoMinutesFor(phase: ScheduledSession['phase'], progression: ProgressionStatus): string {
  if (progression === 'blocked') return '10~12분 짧게 — 상한 준수 우선'
  switch (phase) {
    case 'Build':
      return '15~18분 지속'
    case 'Threshold':
      return '10분 × 2 (사이 2~3분 조깅)'
    case 'Race Specific':
      return '20~25분 지속'
    case 'Taper':
      return '10~12분 짧게'
    default:
      return '12~15분 지속'
  }
}

/** ② 세부 이행지침을 러너 상태에서 **산출**한다(단계·VDOT·부상·볼륨·적응 프로필). 정적 처방 아님. */
function executionFor(
  session: ScheduledSession,
  vdot: number | null,
  injury: TrainingInjuryItem | null,
  progression: ProgressionStatus,
  tempoCeilingBpm: number | null
): string[] {
  const { sessionType, prescription, phase } = session
  const lines: string[] = []
  const dist = prescription.distanceKm ? `${prescription.distanceKm}km` : ''
  const dur = prescription.durationMin ? `${prescription.durationMin}분` : ''
  const amount = [dist, dur].filter(Boolean).join(' · ')
  const pace = prescription.paceRange

  switch (sessionType) {
    case 'Easy + Strides': {
      lines.push(`본런: 편한 대화 페이스${pace ? ` ${pace}` : ''}${amount ? `, ${amount}` : ''}`)
      const s = computeStrides(phase, vdot, injury, progression)
      if (s.hold) lines.push(s.holdReason)
      else lines.push(`마무리 스트라이드: 15~20초 빠르고 편하게 × ${s.reps}회, 사이 60~90초 완전 회복`)
      break
    }
    case 'Tempo': {
      const ceiling = tempoCeilingBpm ? ` (심박 상한 ${tempoCeilingBpm} 준수)` : ', 심박 상한 준수'
      lines.push(`${tempoMinutesFor(phase, progression)}${pace ? ` ${pace}` : ''}${ceiling}`)
      lines.push('무너지면 중단 — 자극 확보가 목적이지 기록 경신이 아니에요')
      break
    }
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
      // 스트라이드 횟수/보류는 executionFor 가 산출해 본문에 반영하므로, 여기선 일반 주의만.
      if (session.keySession && severity >= 3) {
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
  /** 러너 VDOT(resolvePaceModel.vdot). 스트라이드 반복수 등 산출에 쓰임. 없으면 null. */
  vdot?: number | null
  /** 적응 프로필(#326) — progressionCriteria 수행 게이트·tempoCeiling 적응값을 산출에 반영. */
  adaptiveProfile?: AdaptiveTrainingProfile | null
}

/** ScheduledSession + 장기맥락 → 4요소 작전 브리핑(결정론). */
export function buildSessionBriefing(session: ScheduledSession, ctx: SessionBriefingContext): SessionBriefing {
  const goalLabel = ctx.goal?.title ? `'${ctx.goal.title}' ` : ''
  const phaseLabel = phaseLabelKo(session.phase)
  const goalLine = `${goalLabel}${phaseLabel} — ${sessionTypeLabel(session.sessionType)}`

  const progression = progressionStatusFor(session.sessionType, ctx.adaptiveProfile)
  const tempoCeilingBpm = ctx.adaptiveProfile?.tempoCeiling?.adoptedBpm ?? null
  const effect = effectFor(session.sessionType)
  const execution = executionFor(session, ctx.vdot ?? null, ctx.injury, progression, tempoCeilingBpm)
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
