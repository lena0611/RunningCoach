export type InjuryAreaGroup = 'upper' | 'lower' | 'foot'
export type InjuryStructureType = 'muscle' | 'tendon' | 'ligament' | 'fascia' | 'joint' | 'bone' | 'nerve'
export type InjuryBodyView = 'front' | 'right' | 'back' | 'left'

export type InjuryAreaSelection = {
  areaId: string
  painLevel: number | null
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
  return Math.min(5, Math.max(1, Math.round(numberValue)))
}

export function createConservativeStrengthPlan(selections: InjuryAreaSelection[]) {
  const ids = new Set(normalizeInjuryAreaSelections(selections).map((selection) => selection.areaId))
  const plans = new Set<string>()

  if (hasAny(ids, ['left-plantar-fascia', 'right-plantar-fascia'])) {
    plans.add('족저근막: 짧은발(short foot) 5초 유지 x 8~10회, 통증이 올라오면 중단')
    plans.add('족저근막: 수건 말기/발가락 벌리기처럼 낮은 부하 발 intrinsic 운동')
  }
  if (hasAny(ids, ['left-achilles', 'right-achilles', 'left-calf', 'right-calf'])) {
    plans.add('아킬레스/종아리: 양발 카프 아이소메트릭 20~30초 x 3회, 통증 3/5 이상이면 생략')
    plans.add('아킬레스/종아리: 가벼운 발목 가동성, 빠른 점프성 동작 금지')
  }
  if (hasAny(ids, ['left-hamstring', 'right-hamstring'])) {
    plans.add('햄스트링: 둔근 브리지 8~10회 x 2세트, 당김이 커지면 범위 축소')
    plans.add('햄스트링: 힙힌지 패턴 연습, 빠른 가속/스트라이드는 통증이 조용할 때만')
  }
  if (hasAny(ids, ['left-knee', 'right-knee', 'left-it-band', 'right-it-band'])) {
    plans.add('무릎/IT밴드: 낮은 스텝다운 6~8회 x 2세트, 무릎 바깥쪽 신호 확인')
    plans.add('무릎/IT밴드: 클램셸 또는 사이드워크로 둔근 중둔근을 가볍게 깨우기')
  }
  if (hasAny(ids, ['left-hip', 'right-hip', 'lower-back'])) {
    plans.add('고관절/허리: 버드독 또는 데드버그 6~8회 x 2세트, 허리 반동 없이')
    plans.add('고관절/허리: 가벼운 고관절 회전 가동성, 피로한 날은 세트 수 절반')
  }
  if (hasAny(ids, ['left-shin', 'right-shin'])) {
    plans.add('정강이: 티비얼리스 레이즈 8~12회 x 2세트, 뼈성 통증이면 러닝 부하 우선 축소')
    plans.add('정강이: 딱딱한 노면/다운힐/속도주를 보수적으로 제한')
  }

  plans.add('공통: 보강운동은 통증 0~2/5 범위에서만, 다음날 악화되면 강도와 세트 수를 낮춘다.')
  return [...plans].slice(0, 8)
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
    painLevel: Number.isFinite(pain) ? Math.min(5, Math.max(1, Math.round(pain))) : null
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
