/**
 * 운동 직후 코치 인터뷰(#311) 결과를 RunLog 주관 필드로 변환하는 순수 헬퍼.
 * painNote/rpe 는 기존 부상 준비도 factor·코칭 컨텍스트가 이미 소비하므로,
 * run 에 써넣는 것만으로 "부상 경로 반영"이 충족된다(injury-impact-paths).
 */

import type { RunLog } from '@/entities/run/model'

export type PostRunPainSeverity = 'none' | 'mild' | 'moderate' | 'severe'

/** 퀵 트리아지용 거친 부위 그룹. 상세 부위는 전용 부상 체크인 시트가 받는다(2계층). */
export type PainGroup = 'foot' | 'lower' | 'upper'

export const PAIN_GROUP_LABEL: Record<PainGroup, string> = {
  foot: '발',
  lower: '다리',
  upper: '상체'
}

/** 러닝 부하가 직접 가는 그룹(발·다리) — 플랜 영향·부상 관리 제안 대상. 상체는 비차단. */
export function isRunningLoadGroup(group: PainGroup | null): boolean {
  return group === 'foot' || group === 'lower'
}

export type PostRunInterviewResult = {
  painSeverity: PostRunPainSeverity
  /** 통증 부위 거친 그룹(있을 때). 상세는 전용 부상 시트로. */
  painGroup: PainGroup | null
  /** 난이도(RPE 1~10). 미입력이면 null. */
  rpe: number | null
  /** 오늘 컨디션(1~10). 회복/적응 로직이 소비. 미입력이면 null. */
  conditionScore: number | null
}

const SEVERITY_LABEL: Record<Exclude<PostRunPainSeverity, 'none'>, string> = {
  mild: '경미',
  moderate: '보통',
  severe: '심함'
}

function buildPainSummary(severity: PostRunPainSeverity, group: PainGroup | null): string {
  if (severity === 'none') return ''
  const head = `통증 ${SEVERITY_LABEL[severity]}`
  return group ? `${head} · ${PAIN_GROUP_LABEL[group]}` : head
}

export function buildInterviewRunPatch(run: RunLog, result: PostRunInterviewResult): RunLog {
  return {
    ...run,
    rpe: result.rpe ?? run.rpe,
    painNote: buildPainSummary(result.painSeverity, result.painGroup),
    conditionScore: result.conditionScore ?? run.conditionScore
  }
}
