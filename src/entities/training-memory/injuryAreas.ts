export type InjuryAreaGroup = 'upper' | 'lower' | 'foot'
export type InjuryStructureType = 'muscle' | 'tendon' | 'ligament' | 'fascia' | 'joint' | 'bone' | 'nerve'
export type InjuryBodyView = 'front' | 'right' | 'back' | 'left'

export type InjuryAreaSelection = {
  areaId: string
  painLevel: number | null
}

export type InjuryStrengthPlanSource = {
  type: 'internal_baseline' | 'training_knowledge' | 'external_reference' | 'user_note'
  title: string
  organization: string
  url: string
  summary: string
  trainingKnowledgeId: string | null
}

export type InjuryStrengthPlanDetail = {
  id: string
  title: string
  targetAreaIds: string[]
  purpose: string
  instruction: string
  useWhen: string
  stopWhen: string
  progression: string
  sources: InjuryStrengthPlanSource[]
}

export type InjuryAreaDefinition = {
  id: string
  label: string
  shortLabel: string
  group: InjuryAreaGroup
  structure: InjuryStructureType
  side: 'left' | 'right' | 'center'
  primaryView: InjuryBodyView
  views: InjuryBodyView[]
  x: number
  y: number
  width: number
  height: number
  keywords: string[]
}

export const injuryAreaCatalog: InjuryAreaDefinition[] = [
  {
    id: 'lower-back',
    label: '허리/요추',
    shortLabel: '허리',
    group: 'upper',
    structure: 'joint',
    side: 'center',
    primaryView: 'back',
    views: ['back', 'left', 'right'],
    x: 42,
    y: 32,
    width: 16,
    height: 10,
    keywords: ['허리', '요추', '등', 'lower back']
  },
  {
    id: 'left-hip',
    label: '좌측 고관절/둔근',
    shortLabel: '좌 고관절',
    group: 'lower',
    structure: 'joint',
    side: 'left',
    primaryView: 'front',
    views: ['front', 'back', 'left'],
    x: 32,
    y: 43,
    width: 12,
    height: 10,
    keywords: ['좌측 고관절', '왼쪽 고관절', '좌측 둔근', '왼쪽 둔근', 'hip', 'glute']
  },
  {
    id: 'right-hip',
    label: '우측 고관절/둔근',
    shortLabel: '우 고관절',
    group: 'lower',
    structure: 'joint',
    side: 'right',
    primaryView: 'front',
    views: ['front', 'back', 'right'],
    x: 56,
    y: 43,
    width: 12,
    height: 10,
    keywords: ['우측 고관절', '오른쪽 고관절', '우측 둔근', '오른쪽 둔근', 'hip', 'glute']
  },
  {
    id: 'left-hamstring',
    label: '좌측 햄스트링',
    shortLabel: '좌 햄스트링',
    group: 'lower',
    structure: 'muscle',
    side: 'left',
    primaryView: 'back',
    views: ['back', 'left'],
    x: 34,
    y: 53,
    width: 10,
    height: 18,
    keywords: ['좌측 햄스트링', '왼쪽 햄스트링', '근위부 햄스트링', 'hamstring']
  },
  {
    id: 'right-hamstring',
    label: '우측 햄스트링',
    shortLabel: '우 햄스트링',
    group: 'lower',
    structure: 'muscle',
    side: 'right',
    primaryView: 'back',
    views: ['back', 'right'],
    x: 56,
    y: 53,
    width: 10,
    height: 18,
    keywords: ['우측 햄스트링', '오른쪽 햄스트링', '근위부 햄스트링', 'hamstring']
  },
  {
    id: 'left-quadriceps',
    label: '좌측 대퇴사두근',
    shortLabel: '좌 대퇴',
    group: 'lower',
    structure: 'muscle',
    side: 'left',
    primaryView: 'front',
    views: ['front', 'left'],
    x: 34,
    y: 53,
    width: 10,
    height: 18,
    keywords: ['좌측 대퇴', '왼쪽 대퇴', '대퇴사두근', '허벅지 앞', 'quad']
  },
  {
    id: 'right-quadriceps',
    label: '우측 대퇴사두근',
    shortLabel: '우 대퇴',
    group: 'lower',
    structure: 'muscle',
    side: 'right',
    primaryView: 'front',
    views: ['front', 'right'],
    x: 56,
    y: 53,
    width: 10,
    height: 18,
    keywords: ['우측 대퇴', '오른쪽 대퇴', '대퇴사두근', '허벅지 앞', 'quad']
  },
  {
    id: 'left-it-band',
    label: '좌측 IT 밴드/외측 무릎',
    shortLabel: '좌 IT밴드',
    group: 'lower',
    structure: 'fascia',
    side: 'left',
    primaryView: 'left',
    views: ['left', 'front', 'back'],
    x: 28,
    y: 51,
    width: 8,
    height: 23,
    keywords: ['좌측 it', '왼쪽 it', '장경인대', '외측 무릎', '바깥쪽 무릎', 'it band']
  },
  {
    id: 'right-it-band',
    label: '우측 IT 밴드/외측 무릎',
    shortLabel: '우 IT밴드',
    group: 'lower',
    structure: 'fascia',
    side: 'right',
    primaryView: 'right',
    views: ['right', 'front', 'back'],
    x: 64,
    y: 51,
    width: 8,
    height: 23,
    keywords: ['우측 it', '오른쪽 it', '장경인대', '외측 무릎', '바깥쪽 무릎', 'it band']
  },
  {
    id: 'left-knee',
    label: '좌측 무릎',
    shortLabel: '좌 무릎',
    group: 'lower',
    structure: 'joint',
    side: 'left',
    primaryView: 'front',
    views: ['front', 'back', 'left'],
    x: 33,
    y: 71,
    width: 12,
    height: 8,
    keywords: ['좌측 무릎', '왼쪽 무릎', '슬개', 'patella', 'knee']
  },
  {
    id: 'right-knee',
    label: '우측 무릎',
    shortLabel: '우 무릎',
    group: 'lower',
    structure: 'joint',
    side: 'right',
    primaryView: 'front',
    views: ['front', 'back', 'right'],
    x: 55,
    y: 71,
    width: 12,
    height: 8,
    keywords: ['우측 무릎', '오른쪽 무릎', '슬개', 'patella', 'knee']
  },
  {
    id: 'left-shin',
    label: '좌측 정강이',
    shortLabel: '좌 정강이',
    group: 'lower',
    structure: 'bone',
    side: 'left',
    primaryView: 'front',
    views: ['front', 'left'],
    x: 34,
    y: 79,
    width: 10,
    height: 16,
    keywords: ['좌측 정강', '왼쪽 정강', '정강이', 'shin', 'tibia']
  },
  {
    id: 'right-shin',
    label: '우측 정강이',
    shortLabel: '우 정강이',
    group: 'lower',
    structure: 'bone',
    side: 'right',
    primaryView: 'front',
    views: ['front', 'right'],
    x: 56,
    y: 79,
    width: 10,
    height: 16,
    keywords: ['우측 정강', '오른쪽 정강', '정강이', 'shin', 'tibia']
  },
  {
    id: 'left-calf',
    label: '좌측 종아리',
    shortLabel: '좌 종아리',
    group: 'lower',
    structure: 'muscle',
    side: 'left',
    primaryView: 'back',
    views: ['back', 'left'],
    x: 34,
    y: 79,
    width: 10,
    height: 16,
    keywords: ['좌측 종아리', '왼쪽 종아리', '비복근', '가자미근', 'calf']
  },
  {
    id: 'right-calf',
    label: '우측 종아리',
    shortLabel: '우 종아리',
    group: 'lower',
    structure: 'muscle',
    side: 'right',
    primaryView: 'back',
    views: ['back', 'right'],
    x: 56,
    y: 79,
    width: 10,
    height: 16,
    keywords: ['우측 종아리', '오른쪽 종아리', '비복근', '가자미근', 'calf']
  },
  {
    id: 'left-achilles',
    label: '좌측 아킬레스건',
    shortLabel: '좌 아킬레스',
    group: 'foot',
    structure: 'tendon',
    side: 'left',
    primaryView: 'back',
    views: ['back', 'left'],
    x: 35,
    y: 94,
    width: 8,
    height: 7,
    keywords: ['좌측 아킬레스', '왼쪽 아킬레스', 'achilles']
  },
  {
    id: 'right-achilles',
    label: '우측 아킬레스건',
    shortLabel: '우 아킬레스',
    group: 'foot',
    structure: 'tendon',
    side: 'right',
    primaryView: 'back',
    views: ['back', 'right'],
    x: 57,
    y: 94,
    width: 8,
    height: 7,
    keywords: ['우측 아킬레스', '오른쪽 아킬레스', 'achilles']
  },
  {
    id: 'left-ankle',
    label: '좌측 발목',
    shortLabel: '좌 발목',
    group: 'foot',
    structure: 'ligament',
    side: 'left',
    primaryView: 'front',
    views: ['front', 'left'],
    x: 33,
    y: 95,
    width: 12,
    height: 7,
    keywords: ['좌측 발목', '왼쪽 발목', 'ankle', '인대']
  },
  {
    id: 'right-ankle',
    label: '우측 발목',
    shortLabel: '우 발목',
    group: 'foot',
    structure: 'ligament',
    side: 'right',
    primaryView: 'front',
    views: ['front', 'right'],
    x: 55,
    y: 95,
    width: 12,
    height: 7,
    keywords: ['우측 발목', '오른쪽 발목', 'ankle', '인대']
  },
  {
    id: 'left-plantar-fascia',
    label: '좌측 족저근막/발바닥',
    shortLabel: '좌 발바닥',
    group: 'foot',
    structure: 'fascia',
    side: 'left',
    primaryView: 'front',
    views: ['front', 'left'],
    x: 28,
    y: 101,
    width: 18,
    height: 7,
    keywords: ['좌측 족저', '왼쪽 족저', '좌측 발바닥', '왼쪽 발바닥', 'plantar', 'fascia']
  },
  {
    id: 'right-plantar-fascia',
    label: '우측 족저근막/발바닥',
    shortLabel: '우 발바닥',
    group: 'foot',
    structure: 'fascia',
    side: 'right',
    primaryView: 'front',
    views: ['front', 'right'],
    x: 54,
    y: 101,
    width: 18,
    height: 7,
    keywords: ['우측 족저', '오른쪽 족저', '우측 발바닥', '오른쪽 발바닥', 'plantar', 'fascia']
  }
]

export const injuryAreaGroups: Array<{ id: InjuryAreaGroup; label: string; description: string }> = [
  { id: 'upper', label: '상체/허리', description: '허리, 요추처럼 러닝 자세와 충격 흡수에 영향을 주는 부위' },
  { id: 'lower', label: '하체', description: '고관절, 대퇴, 햄스트링, 무릎, 종아리, 정강이' },
  { id: 'foot', label: '발/발목', description: '아킬레스, 발목 인대, 족저근막처럼 착지와 직접 연결되는 부위' }
]

export function getInjuryArea(areaId: string) {
  return injuryAreaCatalog.find((area) => area.id === areaId) ?? null
}

export function getInjuryAreaLabel(areaId: string) {
  return getInjuryArea(areaId)?.label ?? areaId
}

export function summarizeInjuryAreas(selections: InjuryAreaSelection[]) {
  return normalizeInjuryAreaSelections(selections)
    .map((selection) => getInjuryAreaLabel(selection.areaId))
    .join(', ')
}

export function normalizeInjuryAreaSelections(value: unknown, legacyArea = ''): InjuryAreaSelection[] {
  const raw = Array.isArray(value) ? value : []
  const normalized = raw
    .map((item) => normalizeInjuryAreaSelection(item))
    .filter((item): item is InjuryAreaSelection => Boolean(item))
  const unique = uniqueSelections(normalized)
  if (unique.length) return unique
  return inferLegacyAreaSelections(legacyArea)
}

export function deriveInjurySeverity(selections: InjuryAreaSelection[], fallback: unknown): number | null {
  const levels = normalizeInjuryAreaSelections(selections).map((selection) => selection.painLevel).filter((level): level is number => typeof level === 'number')
  if (levels.length) return Math.max(...levels)
  const numberValue = Number(fallback)
  if (!Number.isFinite(numberValue)) return null
  return normalizePainLevel(numberValue)
}

export function createConservativeStrengthPlan(selections: InjuryAreaSelection[]) {
  return createConservativeStrengthPlanDetails(selections).map((plan) => plan.instruction)
}

export function createConservativeStrengthPlanDetails(selections: InjuryAreaSelection[]) {
  const ids = new Set(normalizeInjuryAreaSelections(selections).map((selection) => selection.areaId))
  const plans = new Map<string, InjuryStrengthPlanDetail>()

  const addPlan = (detail: Omit<InjuryStrengthPlanDetail, 'sources'> & { sources?: InjuryStrengthPlanSource[] }) => {
    if (!plans.has(detail.id)) {
      plans.set(detail.id, {
        ...detail,
        sources: detail.sources?.length ? detail.sources : [internalStrengthPlanSource]
      })
    }
  }

  if (hasAny(ids, ['left-plantar-fascia', 'right-plantar-fascia'])) {
    addPlan({
      id: 'plantar-short-foot',
      title: '짧은발 유지',
      targetAreaIds: matchingIds(ids, ['left-plantar-fascia', 'right-plantar-fascia']),
      purpose: '발 intrinsic 근육을 낮은 부하로 깨워 착지 안정성을 보조한다.',
      instruction: '족저근막: 짧은발(short foot) 5초 유지 x 8~10회, 통증이 올라오면 중단',
      useWhen: '통증 0~2/5이고 보행 통증이 없을 때',
      stopWhen: '발바닥 통증이 커지거나 다음날 첫발 통증이 뚜렷할 때',
      progression: '통증이 조용하면 유지 시간을 먼저 늘리고, 반복 수는 천천히 늘린다.'
    })
    addPlan({
      id: 'plantar-foot-intrinsic',
      title: '발 intrinsic 낮은 부하 운동',
      targetAreaIds: matchingIds(ids, ['left-plantar-fascia', 'right-plantar-fascia']),
      purpose: '발바닥 부담을 크게 올리지 않고 발가락/아치 조절감을 회복한다.',
      instruction: '족저근막: 수건 말기/발가락 벌리기처럼 낮은 부하 발 intrinsic 운동',
      useWhen: '착지 통증이 낮고 운동 중 통증 증가가 없을 때',
      stopWhen: '저림, 날카로운 통증, 보행 통증이 생길 때',
      progression: '가동 범위와 정확도를 먼저 확보한 뒤 반복 수를 소폭 늘린다.'
    })
  }
  if (hasAny(ids, ['left-achilles', 'right-achilles', 'left-calf', 'right-calf'])) {
    addPlan({
      id: 'achilles-calf-isometric',
      title: '양발 카프 아이소메트릭',
      targetAreaIds: matchingIds(ids, ['left-achilles', 'right-achilles', 'left-calf', 'right-calf']),
      purpose: '아킬레스/종아리 부하를 급격히 올리지 않고 긴장도와 통증 반응을 확인한다.',
      instruction: '아킬레스/종아리: 양발 카프 아이소메트릭 20~30초 x 3회, 통증 3/5 이상이면 생략',
      useWhen: '통증 0~2/5이고 다음날 악화가 없을 때',
      stopWhen: '통증 3/5 이상, 날카로운 통증, 붓기 또는 보행 통증이 있을 때',
      progression: '양발 유지가 조용하면 시간부터 늘리고, 편측/동적 부하는 별도 승인 뒤 진행한다.'
    })
    addPlan({
      id: 'achilles-ankle-mobility',
      title: '가벼운 발목 가동성',
      targetAreaIds: matchingIds(ids, ['left-achilles', 'right-achilles', 'left-calf', 'right-calf']),
      purpose: '러닝 전후 발목 가동 범위를 낮은 강도로 점검한다.',
      instruction: '아킬레스/종아리: 가벼운 발목 가동성, 빠른 점프성 동작 금지',
      useWhen: '뻣뻣함은 있으나 통증 증가가 없을 때',
      stopWhen: '반동 동작에서 통증이 증가하거나 다음날 악화될 때',
      progression: '반동 없이 범위를 확보하고, 점프성 동작은 통증이 안정된 뒤에만 검토한다.'
    })
  }
  if (hasAny(ids, ['left-hamstring', 'right-hamstring'])) {
    addPlan({
      id: 'hamstring-glute-bridge',
      title: '둔근 브리지',
      targetAreaIds: matchingIds(ids, ['left-hamstring', 'right-hamstring']),
      purpose: '햄스트링에 과부하를 주지 않고 둔근 협응과 후면사슬 지지를 보조한다.',
      instruction: '햄스트링: 둔근 브리지 8~10회 x 2세트, 당김이 커지면 범위 축소',
      useWhen: '통증 0~2/5이고 당김이 운동 중 커지지 않을 때',
      stopWhen: '햄스트링 당김이 커지거나 다음날 뻣뻣함이 증가할 때',
      progression: '가동 범위를 먼저 안정화하고, 세트 수 증가는 다음날 반응이 조용할 때만 한다.'
    })
    addPlan({
      id: 'hamstring-hip-hinge',
      title: '힙힌지 패턴',
      targetAreaIds: matchingIds(ids, ['left-hamstring', 'right-hamstring']),
      purpose: '빠른 가속 전 고관절 접기 패턴을 낮은 강도로 확인한다.',
      instruction: '햄스트링: 힙힌지 패턴 연습, 빠른 가속/스트라이드는 통증이 조용할 때만',
      useWhen: 'Easy 착지감이 조용하고 햄스트링 당김이 낮을 때',
      stopWhen: '전굴/힌지 중 당김이 뚜렷해지거나 가속 뒤 불편감이 남을 때',
      progression: '속도보다 패턴 정확도를 우선하고, 스트라이드는 별도 체크 후 재개한다.'
    })
  }
  if (hasAny(ids, ['left-knee', 'right-knee', 'left-it-band', 'right-it-band'])) {
    addPlan({
      id: 'knee-low-stepdown',
      title: '낮은 스텝다운',
      targetAreaIds: matchingIds(ids, ['left-knee', 'right-knee', 'left-it-band', 'right-it-band']),
      purpose: '무릎 정렬과 외측 신호를 낮은 높이에서 확인한다.',
      instruction: '무릎/IT밴드: 낮은 스텝다운 6~8회 x 2세트, 무릎 바깥쪽 신호 확인',
      useWhen: '일상 계단 통증이 없고 통증 0~2/5일 때',
      stopWhen: '무릎 바깥쪽/앞쪽 통증이 커지거나 계단 통증이 생길 때',
      progression: '높이보다 정렬을 우선하고, 반복 수 증가는 다음날 반응 확인 뒤 진행한다.'
    })
    addPlan({
      id: 'knee-glute-med-activation',
      title: '둔근 중둔근 활성',
      targetAreaIds: matchingIds(ids, ['left-knee', 'right-knee', 'left-it-band', 'right-it-band']),
      purpose: '무릎/IT밴드 부담을 낮추기 위한 고관절 측면 지지를 가볍게 깨운다.',
      instruction: '무릎/IT밴드: 클램셸 또는 사이드워크로 둔근 중둔근을 가볍게 깨우기',
      useWhen: '통증이 낮고 동작 중 무릎 신호가 늘지 않을 때',
      stopWhen: '무릎 통증이나 고관절 통증이 새로 생길 때',
      progression: '저항보다 동작 정확도를 먼저 확보하고, 밴드 강도는 천천히 올린다.'
    })
  }
  if (hasAny(ids, ['left-hip', 'right-hip', 'lower-back'])) {
    addPlan({
      id: 'hip-back-core-control',
      title: '버드독/데드버그',
      targetAreaIds: matchingIds(ids, ['left-hip', 'right-hip', 'lower-back']),
      purpose: '허리 반동을 줄이고 러닝 자세를 지탱하는 몸통 조절을 보조한다.',
      instruction: '고관절/허리: 버드독 또는 데드버그 6~8회 x 2세트, 허리 반동 없이',
      useWhen: '허리/고관절 통증이 낮고 동작 중 악화가 없을 때',
      stopWhen: '저림, 방사통, 날카로운 통증 또는 보행 통증이 있을 때',
      progression: '반복 수보다 흔들림 없는 자세를 우선하고, 피로한 날은 세트 수를 줄인다.'
    })
    addPlan({
      id: 'hip-back-mobility',
      title: '고관절 회전 가동성',
      targetAreaIds: matchingIds(ids, ['left-hip', 'right-hip', 'lower-back']),
      purpose: '러닝 전후 고관절 회전 제한과 허리 부담을 낮은 강도로 점검한다.',
      instruction: '고관절/허리: 가벼운 고관절 회전 가동성, 피로한 날은 세트 수 절반',
      useWhen: '뻣뻣함은 있으나 통증 증가가 없을 때',
      stopWhen: '허리 반동이나 고관절 찝힘이 커질 때',
      progression: '범위보다 편안한 움직임을 우선하고, 피로가 크면 절반만 수행한다.'
    })
  }
  if (hasAny(ids, ['left-shin', 'right-shin'])) {
    addPlan({
      id: 'shin-tibialis-raise',
      title: '티비얼리스 레이즈',
      targetAreaIds: matchingIds(ids, ['left-shin', 'right-shin']),
      purpose: '정강이 주변 근육을 낮은 부하로 자극하면서 통증 반응을 확인한다.',
      instruction: '정강이: 티비얼리스 레이즈 8~12회 x 2세트, 뼈성 통증이면 러닝 부하 우선 축소',
      useWhen: '통증 0~2/5이고 압통/보행 통증이 없을 때',
      stopWhen: '뼈성 통증, 국소 압통, 보행 통증 또는 다음날 악화가 있을 때',
      progression: '반복 수 증가는 천천히 하고, 러닝 부하 증가는 별도 체크 후 진행한다.'
    })
    addPlan({
      id: 'shin-load-restriction',
      title: '정강이 부하 제한',
      targetAreaIds: matchingIds(ids, ['left-shin', 'right-shin']),
      purpose: '보강운동보다 러닝 부하 조절을 우선해야 하는 정강이 신호를 관리한다.',
      instruction: '정강이: 딱딱한 노면/다운힐/속도주를 보수적으로 제한',
      useWhen: '정강이 신호가 남아 있거나 최근 거리 증가가 있었을 때',
      stopWhen: '통증이 강해지면 제한이 아니라 러닝 중단/전문가 상담을 우선한다.',
      progression: '노면과 속도 변수를 먼저 안정화하고, 거리 증가는 통증 기록이 조용할 때만 한다.'
    })
  }

  addPlan({
    id: 'common-pain-gate',
    title: '공통 통증 게이트',
    targetAreaIds: [...ids],
    purpose: '보강운동이 러닝 부하 조절을 방해하지 않도록 중단 기준을 먼저 둔다.',
    instruction: '공통: 보강운동은 통증 0~2/5 범위에서만, 다음날 악화되면 강도와 세트 수를 낮춘다.',
    useWhen: '통증이 0~2/5이고 일상 보행 악화가 없을 때',
    stopWhen: '통증 증가, 저림, 붓기, 날카로운 통증, 일상 보행 통증이 있을 때',
    progression: '강도 상향보다 다음날 반응 기록을 우선한다.'
  })
  return [...plans.values()].slice(0, 8)
}

export function createInjuryRestrictions(selections: InjuryAreaSelection[]) {
  const ids = new Set(normalizeInjuryAreaSelections(selections).map((selection) => selection.areaId))
  const restrictions = new Set<string>()
  if (hasAny(ids, ['left-plantar-fascia', 'right-plantar-fascia', 'left-achilles', 'right-achilles', 'left-calf', 'right-calf'])) {
    restrictions.add('착지 통증이 있으면 스트라이드, 다운힐, 빠른 가속을 생략한다.')
  }
  if (hasAny(ids, ['left-hamstring', 'right-hamstring'])) {
    restrictions.add('햄스트링 당김이 있으면 Tempo와 Strides를 Easy로 낮춘다.')
  }
  if (hasAny(ids, ['left-knee', 'right-knee', 'left-it-band', 'right-it-band'])) {
    restrictions.add('무릎 바깥쪽/앞쪽 신호가 있으면 롱런 후반 빌드업과 내리막을 줄인다.')
  }
  if (hasAny(ids, ['left-shin', 'right-shin'])) {
    restrictions.add('정강이 신호가 있으면 주간 거리 증가와 연속 러닝을 보류한다.')
  }
  restrictions.add('통증이 달리며 커지면 그날 세션은 회복주 또는 중단으로 전환한다.')
  return [...restrictions].slice(0, 6)
}

export function createReturnToRunCriteria(selections: InjuryAreaSelection[]) {
  const summary = summarizeInjuryAreas(selections) || '해당 부위'
  return `${summary} 통증이 0~2/5로 조용하고, 다음날 악화 없이 Easy 조깅과 일상 보행이 편할 때만 강도나 거리를 올린다.`
}

export function createInjuryManagementPlan(selections: InjuryAreaSelection[]) {
  const summary = summarizeInjuryAreas(selections) || '선택 부위'
  return `${summary} 반응을 기준으로 훈련 강도를 보수적으로 조정한다. 의료 진단이 아니라 러닝 부하 판단용 기록으로 관리한다.`
}

function normalizeInjuryAreaSelection(value: unknown): InjuryAreaSelection | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<InjuryAreaSelection>
  if (typeof raw.areaId !== 'string' || !getInjuryArea(raw.areaId)) return null
  const pain = Number(raw.painLevel)
  return {
    areaId: raw.areaId,
    painLevel: Number.isFinite(pain) ? normalizePainLevel(pain) : null
  }
}

function inferLegacyAreaSelections(value: string): InjuryAreaSelection[] {
  const normalized = value.toLowerCase()
  if (!normalized.trim()) return []
  const matches = injuryAreaCatalog.filter((area) => area.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())))
  return uniqueSelections(matches.map((area) => ({ areaId: area.id, painLevel: null })))
}

function uniqueSelections(selections: InjuryAreaSelection[]) {
  const map = new Map<string, InjuryAreaSelection>()
  for (const selection of selections) {
    if (!map.has(selection.areaId)) map.set(selection.areaId, selection)
  }
  return [...map.values()]
}

function hasAny(ids: Set<string>, targets: string[]) {
  return targets.some((target) => ids.has(target))
}

function matchingIds(ids: Set<string>, targets: string[]) {
  return targets.filter((target) => ids.has(target))
}

function normalizePainLevel(value: number) {
  return Math.min(5, Math.max(0, Math.round(value)))
}

const internalStrengthPlanSource: InjuryStrengthPlanSource = {
  type: 'internal_baseline',
  title: 'PaceLAB 보수적 러닝 부하 조절 기준',
  organization: 'PaceLAB',
  url: '',
  summary: '의료 처방이 아니라 통증 0~2/5 범위에서만 보강운동을 허용하고 악화 시 축소/중단하는 앱 내부 안전 기준이다.',
  trainingKnowledgeId: null
}
