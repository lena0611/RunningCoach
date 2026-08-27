/**
 * 세션 **실행 타임라인**(#711 선행) — 처방을 "기계가 셀 수 있는" 형태로.
 *
 * ## 왜 필요한가
 *
 * 기존 `BriefingStep = { label, detail }` 은 **사람이 읽는 산문**이다. 워치에 그대로 보내면
 * 낭독밖에 못 한다 — "본런 뒤 스트라이드 6회"를 읽어줄 뿐 **"지금부터 15초"를 세지 못한다.**
 * 스트라이드를 혼자 하려면 시계 보며 15초 재고, 60~90초 걷고, 몇 번째인지 세야 한다.
 * **처방을 아는 것과 실행할 수 있는 건 다른 문제**이고, 후자는 워치가 아니면 사실상 불가능하다.
 *
 * ## 산문을 대체하지 않는다
 *
 * `sessionBriefing.executionFor` 의 `BriefingStep[]` 은 그대로 둔다(화면·코치 발화용).
 * 이 모듈은 그 **옆에** 기계용 배열을 만든다. 같은 SSOT 수치를 쓰되 표현이 다를 뿐이다.
 *
 * ## 근거는 전부 기존 SSOT
 *
 * `running-coaching-standards.md` §세션 실행 라이프사이클 — 스트라이드 70~100m·15~20초·
 * 사이 60~90초 완전 걷기 회복 / Tempo·Race 정식 웜업 10~15분 + 드릴 + 스트라이드 2~6회 /
 * 저강도는 ease-in·out 내장(별도 웜업 없음). **새 수치를 발명하지 않는다.**
 *
 * ## ⚠️ 집행은 돕되 채점은 하지 않는다
 *
 * 이 타임라인으로 실제 랩이 기록되더라도 **스트라이드 선명도·개수를 채점하면 안 된다** —
 * SSOT `[[coach-not-data-referee]]`: "스트라이드=곁가지, 선명도/개수 채점 금지(더 세게 부추기면
 * 이지가 망가진다)". 데이터가 생겼다는 이유로 채점표에 올리는 것은 명시적 금지다.
 */

// ⚠️ `RunType` 을 import 하지 않는다 — shared → entities 역방향 의존 래칫(#397).
export type SessionTypeName = string

export type TimelinePhase = 'warmup' | 'main' | 'interval' | 'recover' | 'cooldown'

export type TimelineStep = {
  phase: TimelinePhase
  /** 워치가 읽어줄 짧은 문장. 산문 detail 이 아니라 **발화용 한 줄**이다. */
  cue: string
  /** 목표 지속(초). 시간 기반 구간에만 있다. */
  durationSec?: number
  /** 목표 거리(km). 거리 기반 구간에만 있다. */
  distanceKm?: number
  /** 반복 구간의 회차(1부터). 스트라이드·인터벌에만 있다. */
  rep?: number
  /** 반복 구간의 총 회수. */
  ofReps?: number
}

/** 스트라이드 1회 지속(초). SSOT §Easy + Strides "15~20초" 의 중앙값. */
const STRIDE_SEC = 18
/** 스트라이드 사이 회복(초). SSOT "사이 60~90초 완전 걷기 회복" 의 중앙값. */
const STRIDE_RECOVER_SEC = 75
/** 정식 웜업 조깅(초). SSOT "10~15분" 의 하한 — 실행 안내는 보수적으로 짧게 잡는다. */
const QUALITY_WARMUP_SEC = 10 * 60
/** 정식 쿨다운 조깅(초). SSOT "10~15분" 의 하한. */
const QUALITY_COOLDOWN_SEC = 10 * 60
/** 저강도 ease-in(초). SSOT "첫 5~10분은 더 느리게" 의 하한. */
const EASE_IN_SEC = 5 * 60
/** 저강도 ease-out(초). SSOT "마지막 몇 분 + 2~5분 걷기". */
const EASE_OUT_SEC = 3 * 60
/** 롱런 롤링 워밍업(km). SSOT "첫 1~2km는 천천히". */
const ROLLING_WARMUP_KM = 1

export type TimelineInput = {
  sessionType: SessionTypeName
  /** 처방 거리(km). 없으면 시간 기반으로만 만든다. */
  distanceKm: number | null
  /** 처방 시간(분). */
  durationMin: number | null
  /** 스트라이드 회수(`computeStrides` 산출값). 0이거나 없으면 스트라이드 구간을 만들지 않는다. */
  strideReps?: number
}

/**
 * 처방 → 실행 타임라인.
 *
 * 반환이 빈 배열이면 **타임라인을 만들 수 없다는 뜻**이다(처방 정보 부족). 그때 워치는
 * 집행 모드로 들어가지 말고 안내만 한다 — 없는 구간을 지어내지 않는다.
 */
export function buildSessionTimeline(input: TimelineInput): TimelineStep[] {
  const { sessionType, distanceKm, durationMin, strideReps = 0 } = input
  if (distanceKm === null && durationMin === null) return []

  const steps: TimelineStep[] = []
  const mainMeasure = (): Pick<TimelineStep, 'distanceKm' | 'durationSec'> =>
    distanceKm !== null ? { distanceKm } : { durationSec: (durationMin as number) * 60 }

  if (sessionType === 'Tempo' || sessionType === 'Race') {
    // 정식 웜업/쿨다운은 본세트에 **더한다**(SSOT §세션 실행 라이프사이클).
    steps.push({ phase: 'warmup', cue: '웜업 시작 — 가벼운 조깅으로 10분', durationSec: QUALITY_WARMUP_SEC })
    steps.push({ phase: 'warmup', cue: '드릴 — 레그스윙·A스킵·런지로 몸을 깨웁니다' })
    steps.push({
      phase: 'main',
      cue: sessionType === 'Tempo' ? '본훈련 시작 — 역치 강도로 꾸준히' : '본훈련 시작 — 목표 페이스로',
      ...mainMeasure()
    })
    steps.push({ phase: 'cooldown', cue: '쿨다운 — 아주 느린 조깅 10분 후 걷기', durationSec: QUALITY_COOLDOWN_SEC })
    return steps
  }

  if (sessionType === 'LSD' || sessionType === 'Steady Long') {
    // 롱런의 dose 는 발 위 시간이지만, 롤링 워밍업은 거리로 안내하는 게 실행에 자연스럽다.
    steps.push({ phase: 'warmup', cue: '첫 1km는 천천히 — 롤링 워밍업', distanceKm: ROLLING_WARMUP_KM })
    steps.push({ phase: 'main', cue: '본훈련 — 대화 가능한 편한 강도로 길게', ...mainMeasure() })
    steps.push({ phase: 'cooldown', cue: '마지막은 천천히 → 걷기로 마무리', durationSec: EASE_OUT_SEC })
    return steps
  }

  // 저강도(Easy/Recovery/Easy + Strides): 별도 웜업 없이 ease-in/out 내장.
  steps.push({
    phase: 'warmup',
    cue: sessionType === 'Recovery' ? '걷듯이 아주 천천히 시작합니다' : '처음 5분은 더 느리게 시작합니다',
    durationSec: EASE_IN_SEC
  })
  steps.push({
    phase: 'main',
    cue: sessionType === 'Recovery' ? '본런 — 아주 느리게, 회복이 목적입니다' : '본런 — 편한 대화 페이스로',
    ...mainMeasure()
  })

  if (sessionType === 'Easy + Strides' && strideReps > 0) {
    for (let rep = 1; rep <= strideReps; rep += 1) {
      steps.push({
        phase: 'interval',
        cue: `지금부터 ${STRIDE_SEC}초 스트라이드, ${rep}회차`,
        durationSec: STRIDE_SEC,
        rep,
        ofReps: strideReps
      })
      // 마지막 회차 뒤에는 회복 대신 쿨다운으로 넘어간다.
      if (rep < strideReps) {
        steps.push({
          phase: 'recover',
          cue: '완전히 걸으며 회복',
          durationSec: STRIDE_RECOVER_SEC,
          rep,
          ofReps: strideReps
        })
      }
    }
  }

  steps.push({ phase: 'cooldown', cue: '마지막은 천천히 → 걷기로 마무리', durationSec: EASE_OUT_SEC })
  return steps
}

/** 타임라인 총 예상 시간(초). 거리 기반 구간은 셀 수 없어 제외한다(null 이면 산출 불가). */
export function timelineKnownDurationSec(steps: TimelineStep[]): number {
  return steps.reduce((sum, s) => sum + (s.durationSec ?? 0), 0)
}
