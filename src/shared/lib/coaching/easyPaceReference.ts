import { resolvePaceModel } from '@/shared/lib/vdotPaces'
import { easyPaceReference, type PaceSample } from '@/shared/lib/paceBands'
import { deriveObservedEasyPace } from './observedEasyPace'
import { withObservedEasy } from './periodizedSchedule'

type Runs = Parameters<typeof deriveObservedEasyPace>[0]

/**
 * 런 종류 판정·Easy 비율의 기준 Easy 페이스(#878 A5) — 처방(대시보드 calibratedPaceModel)과 **같은 모델**을 지나게 한다.
 * 그래야 "Easy 로 뛰라"고 시킨 페이스로 뛴 런이 Easy 로 판정된다(브리핑↔채점 일관성).
 * `extra` 는 아직 저장 전인 런(가져오는 중인 묶음) — 첫 가져오기에서도 본인 평소 페이스를 쓸 수 있게.
 */
export function deriveEasyPaceReference(
  profile: Parameters<typeof resolvePaceModel>[0],
  runs: Runs,
  heartRateModel: { easyCeilingBpm: number | null; recoveryCeilingBpm: number | null },
  today: Date,
  extra: PaceSample[] = []
): number | null {
  const observed = deriveObservedEasyPace(runs, heartRateModel.easyCeilingBpm, today, heartRateModel.recoveryCeilingBpm)
  const model = withObservedEasy(resolvePaceModel(profile), observed)
  return easyPaceReference(model.easyPaceSec, [...runs, ...extra], today)
}
