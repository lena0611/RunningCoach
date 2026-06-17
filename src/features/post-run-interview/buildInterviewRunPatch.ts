/**
 * 운동 직후 코치 인터뷰(#311) 결과를 RunLog 주관 필드로 변환하는 순수 헬퍼.
 * painNote/rpe 는 기존 부상 준비도 factor·코칭 컨텍스트가 이미 소비하므로,
 * run 에 써넣는 것만으로 "부상 경로 반영"이 충족된다(injury-impact-paths).
 */

import type { RunLog } from '@/entities/run/model'
import { getInjuryAreaLabel, type InjuryAreaSelection } from '@/entities/training-memory/injuryAreas'

export type PostRunPainSeverity = 'none' | 'mild' | 'moderate' | 'severe'

export type PostRunInterviewResult = {
  painSeverity: PostRunPainSeverity
  areaPainLevels: InjuryAreaSelection[]
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

function buildPainSummary(severity: PostRunPainSeverity, areas: InjuryAreaSelection[]): string {
  if (severity === 'none') return ''
  const areaText = areas
    .filter((area) => area.painLevel !== null)
    .map((area) => `${getInjuryAreaLabel(area.areaId)} ${area.painLevel}/5`)
    .join(', ')
  const head = `통증 ${SEVERITY_LABEL[severity]}`
  return areaText ? `${head} · ${areaText}` : head
}

export function buildInterviewRunPatch(run: RunLog, result: PostRunInterviewResult): RunLog {
  return {
    ...run,
    rpe: result.rpe ?? run.rpe,
    painNote: buildPainSummary(result.painSeverity, result.areaPainLevels),
    conditionScore: result.conditionScore ?? run.conditionScore
  }
}
