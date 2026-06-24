/**
 * 러닝 부상 감별진단 지식베이스(KB) — 웹 단일 SSOT (§5 청사진, running-injury-knowledge.md §1~§4).
 *
 * 목적: 코치가 "왜 이 러너가 아픈지"를 전문 지식 + 보유 데이터(+ 후속 grill)로 좁혀 원인에 맞춘 예방 레버를 준다.
 * 경계(스코핑 합의):
 *  - 이 모듈이 부상 감별·레버의 단일 SSOT. injuryAreas.ts는 UI/강화플랜용(독립), sessionQuality는 세션 품질채점(독립).
 *  - coach-run 은 rank 결과 상위 1~2개 + redFlag 만 client-summary 로 소비(이중구현 금지, 프롬프트 크기 절약).
 *  - **redFlag 게이트가 항상 우선** — 켜지면 가중/레버 무시하고 전문가 의뢰(§4). 의사 흉내 금지·"가능성"으로만·확률% 단정 금지.
 *  - do-not 가드(§6): 성별·정적 생체역학/해부·BMI·strike pattern·"근력=RRI감소" 단정을 위험 가중에 넣지 않는다. 케이던스는 보조(저가중).
 *
 * Phase A = 카탈로그 + redFlag 게이트 + 데이터 가중 랭킹(결정론). grill(probe) 통합·처방 오버로드·coach-run 주입은 후속 Phase.
 */
import type { InjuryStructureType } from './injuryAreas'

/** 처방 레버(§3 헤더: 강도하향/스트라이드보류/회복전환/케이던스큐/볼륨동결). 강화(카프·둔근)는 injuryAreas 강화플랜 담당. */
export type InjuryLever = 'volume-freeze' | 'intensity-down' | 'cadence-cue' | 'stride-hold' | 'recovery-switch'

export const INJURY_LEVER_LABEL: Record<InjuryLever, string> = {
  'volume-freeze': '볼륨 동결',
  'intensity-down': '강도 하향',
  'cadence-cue': '케이던스 큐(보조)',
  'stride-hold': '스트라이드 보류',
  'recovery-switch': '회복 전환'
}

/** grill 5축(§2-B, 순서대로 분기 때만): 위치→타이밍→아픈동작→신발/지면→자가검사. probe 통합은 후속 Phase. */
export type InjuryProbeAxis = 'location' | 'timing' | 'aggravating-motion' | 'footwear-surface' | 'self-test'

/**
 * 데이터 자동 가중 신호(§2-A). 코드가 아는 것만(안 물어봄). 웹이 runStats(getAcwr·getChronicLoadTrend·케이던스)와
 * 런 메타에서 산출해 주입한다. do-not 가드: 성별·생체역학·BMI·strike·근력은 신호에 없다(의도).
 */
export type InjuryDataSignals = {
  /** getAcwr > 1.5 (7:28 급성:만성). */
  acwrSpike?: boolean
  /** getChronicLoadTrend rising/spike (30일 누적 추세). */
  chronicRising?: boolean
  /** 절대 고볼륨(족저근막 ≥41km/주 등 — 숙련·고볼륨 맥락 한정). */
  highWeeklyVolume?: boolean
  /** 주간 거리 급증(ITBS >15%, 종아리 ~25%). */
  weeklyIncreaseHigh?: boolean
  /** 낮은 케이던스(≤165~170 또는 시점 하락) — 보조 신호(저가중, 단독 원인 단정 금지). */
  cadenceLow?: boolean
  /** 누적 오르막. */
  groundUphill?: boolean
  /** 누적 내리막/다운힐. */
  groundDownhill?: boolean
  /** 페이스 급상승. */
  paceSpike?: boolean
  /** 같은 부위 재발 이력. */
  recurrence?: boolean
}

/** 가설별 예방책: 원인(causeKey) → 레버 + 코치 노트 + 출처. */
export type InjuryPrevention = {
  causeKey: string
  levers: InjuryLever[]
  note: string
  source: string
}

/** 같은 부위 안의 아형(아킬레스 중간부/부착부, 종아리 비복/가자미 등) — grill 로 가른다(후속). */
export type InjurySubtype = {
  id: string
  label: string
  hallmark: string
}

/** 부상 가설. areaBases 는 areaId 의 좌우 prefix 를 뗀 base('plantar-fascia' 등)로 키징. */
export type InjuryHypothesis = {
  id: string
  label: string
  areaBases: string[]
  structure: InjuryStructureType
  /** §1 사전확률 순위(1 = 가장 높음). */
  priorRank: number
  /** §1 결정적 지문(감별 단서). */
  hallmark: string
  /** overuse = 1차 과사용 후보(rank 대상), red-flag = 의료 경계 후보(evaluateRedFlags 가 담당, rank 제외). */
  classification: 'overuse' | 'red-flag'
  /** §2-A 데이터 신호별 가중(이 신호가 있으면 이 가설↑). 케이던스는 저가중(보조). */
  dataWeights: Partial<Record<keyof InjuryDataSignals, number>>
  /** 이 가설을 가르는 데 유용한 grill 축(불확실도 순위·후속 Phase). */
  probeWeights: Partial<Record<InjuryProbeAxis, number>>
  prevention: InjuryPrevention[]
  subtypeSplit?: InjurySubtype[]
}

/** areaId('left-plantar-fascia')에서 좌우 prefix 를 떼어 부위 base('plantar-fascia')를 얻는다. */
export function injuryAreaBase(areaId: string): string {
  return areaId.replace(/^(left|right)-/, '')
}

const SRC = '딥리서치 2026-06-19 (running-injury-knowledge.md §1~§4)'

/**
 * 부상 가설 카탈로그(§1 부위→후보 매핑 + §3 예방 레버). 1차 과사용(overuse) 가설은 prevention 레버 완비,
 * red-flag 후보는 hallmark 만(처방 아닌 의뢰 경로). 케이던스 레버는 보조(증거 강한 MTSS/PFPS/ITBS에서 가중↑).
 * ⚠ 스코프: §1이 다루는 8개 부위-베이스(plantar-fascia·achilles·shin·knee·it-band·calf·hip·hamstring)만 인코딩한다.
 *   injuryAreaCatalog 의 ankle·quadriceps·lower-back 은 §1 매핑이 없어 의도적으로 KB 밖이다(rank/redFlag 빈 배열 → 소비측 generic fallback). 후속 리서치로 확장 가능.
 */
export const injuryKnowledgeBase: InjuryHypothesis[] = [
  // ── 발바닥 ─────────────────────────────────────────────
  {
    id: 'plantar-fasciitis',
    label: '족저근막염',
    areaBases: ['plantar-fascia'],
    structure: 'fascia',
    priorRank: 1,
    hallmark: '아침 첫걸음 통증 + 걸으면 풀림 + 내측 종골결절 압통',
    classification: 'overuse',
    dataWeights: { highWeeklyVolume: 1.0, acwrSpike: 0.8, chronicRising: 0.5, cadenceLow: 0.3, recurrence: 0.4 },
    probeWeights: { timing: 0.9, location: 0.7, 'self-test': 0.5 },
    prevention: [
      { causeKey: '고볼륨/ACWR 스파이크', levers: ['volume-freeze', 'recovery-switch'], note: '≥41km/주 또는 ACWR 스파이크면 볼륨 동결 + 회복주(-20~30%). 종아리 약화 동반 시 고부하 카프 강화 병행(강화플랜).', source: SRC },
      { causeKey: '오버스트라이드', levers: ['cadence-cue'], note: '케이던스 +5~10%(보조), 전족 급전환 금지. 신발 급전환은 점진 복귀.', source: SRC }
    ]
  },
  // 종골(뒤꿈치 뼈) 피로골절 — 발바닥·아킬레스 양쪽 부위 후보(§1 아킬레스 ③피로골절: 부착부 아킬레스↔종골 인접).
  { id: 'calcaneal-stress-fracture', label: '종골(뒤꿈치) 피로골절(의심)', areaBases: ['plantar-fascia', 'achilles'], structure: 'bone', priorRank: 3, hallmark: '첫발에 안 풀리고 활동할수록 악화 + 뒤꿈치 뼈 국소 점통·hop 통증', classification: 'red-flag', dataWeights: {}, probeWeights: { timing: 0.8, 'self-test': 0.9 }, prevention: [] },
  { id: 'baxter-nerve', label: 'Baxter 신경 포착(의심)', areaBases: ['plantar-fascia'], structure: 'nerve', priorRank: 3, hallmark: '발바닥 화끈거림·저림', classification: 'red-flag', dataWeights: {}, probeWeights: { location: 0.8 }, prevention: [] },

  // ── 아킬레스 ───────────────────────────────────────────
  {
    id: 'achilles-tendinopathy',
    label: '아킬레스 건병증',
    areaBases: ['achilles'],
    structure: 'tendon',
    priorRank: 1,
    hallmark: '아침 뻣뻣함 + 워밍업하면 풀림',
    classification: 'overuse',
    dataWeights: { acwrSpike: 0.8, chronicRising: 0.6, groundUphill: 0.5, cadenceLow: 0.3, recurrence: 0.4 },
    probeWeights: { location: 0.9, timing: 0.7, 'aggravating-motion': 0.6 },
    prevention: [
      { causeKey: '부하(ACWR)', levers: ['volume-freeze', 'cadence-cue'], note: 'ACWR<1.5 볼륨 동결 + 케이던스 큐(전족 급전환 금지). 중간부형=편심/HSR, 부착부형=풀ROM 편심·오르막 금지·중립범위·힐리프트(강화플랜).', source: SRC }
    ],
    subtypeSplit: [
      { id: 'mid-portion', label: '중간부', hallmark: '건 중간(복사뼈 위 2~6cm) 압통' },
      { id: 'insertional', label: '부착부', hallmark: '뼈 붙는 더 아래 + 발등굽힘·오르막 악화' }
    ]
  },
  { id: 'achilles-rupture', label: '아킬레스 파열(의심)', areaBases: ['achilles'], structure: 'tendon', priorRank: 2, hallmark: "'pop' 느낌 + 발끝으로 못 섬", classification: 'red-flag', dataWeights: {}, probeWeights: { 'self-test': 0.9 }, prevention: [] },

  // ── 정강이 ─────────────────────────────────────────────
  {
    id: 'mtss',
    label: 'MTSS(내측 경골 스트레스 증후군)',
    areaBases: ['shin'],
    structure: 'bone',
    priorRank: 1,
    hallmark: '안쪽 5cm+ 넓게 + 시작 시 아프다 풀림',
    classification: 'overuse',
    dataWeights: { acwrSpike: 0.8, weeklyIncreaseHigh: 0.7, chronicRising: 0.6, cadenceLow: 0.5, recurrence: 0.4 },
    probeWeights: { location: 0.9, 'self-test': 0.8, timing: 0.5 },
    prevention: [
      { causeKey: '부하 급증', levers: ['volume-freeze', 'recovery-switch'], note: '볼륨 동결 + 회복주(저충격 크로스). 무통증 게이트 4~6주. 헤비 카프·후경골근·둔근 강화(강화플랜).', source: SRC },
      { causeKey: '오버스트라이드', levers: ['cadence-cue'], note: '케이던스 +10% → 경골 충격 ~14%↓(MTSS는 케이던스 증거 강함).', source: SRC }
    ]
  },
  // 1차 변별 = 국소(<5cm) 한 손가락 점통 + hop/타진 재현(MTSS의 넓은 5cm+와 대비). 야간통은 보조. ⚠ 전방 경골 점통(anterior black line)=고위험·난치 → 즉시 의뢰.
  { id: 'tibial-stress-fracture', label: '경골 피로골절(의심)', areaBases: ['shin', 'knee'], structure: 'bone', priorRank: 2, hallmark: '국소(<5cm) 한 손가락 점통 + hop/타진 통증 재현(야간통 동반 가능). 전방 경골 점통이면 고위험', classification: 'red-flag', dataWeights: {}, probeWeights: { location: 0.9, 'self-test': 0.9 }, prevention: [] },
  // 구획증후군 — 하퇴 전반(정강이·종아리 양쪽 노출). §1 종아리 ④'파열'은 §4가 아킬레스 파열(Thompson)로 스코핑 → achilles-rupture 가 담당(종아리 별도 근파열 가설 생략).
  { id: 'compartment-syndrome', label: '구획증후군(의심)', areaBases: ['shin', 'calf'], structure: 'muscle', priorRank: 3, hallmark: '조임·저림·창백(5P) — 응급', classification: 'red-flag', dataWeights: {}, probeWeights: { 'self-test': 0.9 }, prevention: [] },

  // ── 무릎 ───────────────────────────────────────────────
  {
    id: 'pfps',
    label: 'PFPS(슬개대퇴 통증)',
    areaBases: ['knee'],
    structure: 'joint',
    priorRank: 1,
    hallmark: '앞쪽 분산통 + 계단 내려가기·스쿼트·극장징후',
    classification: 'overuse',
    dataWeights: { acwrSpike: 0.6, chronicRising: 0.5, cadenceLow: 0.5, groundDownhill: 0.6, recurrence: 0.4 },
    probeWeights: { 'aggravating-motion': 0.9, location: 0.7 },
    prevention: [
      { causeKey: '부하', levers: ['volume-freeze'], note: '볼륨 동결(ACWR 0.8~1.3 지향).', source: SRC },
      { causeKey: '무릎 흡수 부하', levers: ['cadence-cue'], note: '케이던스 +5~10% → 무릎 흡수 부하↓. 다운힐 점진. 편심 고관절 외전근 강화(강화플랜, 운동치료 Grade A).', source: SRC }
    ]
  },
  { id: 'meniscus-ligament', label: '반월·인대 손상(의심)', areaBases: ['knee'], structure: 'joint', priorRank: 3, hallmark: '잠김(locking)·giving way', classification: 'red-flag', dataWeights: {}, probeWeights: { 'aggravating-motion': 0.8, 'self-test': 0.7 }, prevention: [] },

  // ── IT 밴드 ────────────────────────────────────────────
  {
    id: 'itbs',
    label: 'ITBS(장경인대 증후군)',
    areaBases: ['it-band'],
    structure: 'tendon',
    priorRank: 1,
    hallmark: '외측 대퇴과(관절선 1~3cm 위) + 굴곡 30도 + 항상 같은 거리에서 켜짐',
    classification: 'overuse',
    dataWeights: { weeklyIncreaseHigh: 1.0, groundDownhill: 0.5, cadenceLow: 0.4, recurrence: 0.4 },
    probeWeights: { location: 0.9, timing: 0.7 },
    prevention: [
      { causeKey: '주간 급증', levers: ['volume-freeze'], note: '주간 증가 >15%면 ~3배 위험 → 볼륨 동결(휴식 단독은 재발). 다면 둔근 외전근 강화(강화플랜).', source: SRC },
      { causeKey: 'hip adduction', levers: ['cadence-cue'], note: '케이던스 큐(hip adduction↓). 내리막·캠버 회피.', source: SRC }
    ]
  },
  { id: 'lateral-knee-pathology', label: '외측 무릎 구조 병리(의심)', areaBases: ['it-band'], structure: 'joint', priorRank: 2, hallmark: '외측 무릎 잠김·붓기·외상 후 불안정(외측 반월·측부인대)', classification: 'red-flag', dataWeights: {}, probeWeights: { 'aggravating-motion': 0.7, 'self-test': 0.7 }, prevention: [] },

  // ── 종아리 ─────────────────────────────────────────────
  {
    id: 'calf-strain',
    label: '종아리 좌상',
    areaBases: ['calf'],
    structure: 'muscle',
    priorRank: 1,
    hallmark: "무릎 펴고 폭발 'pop'=비복근 / 무릎 굽혀도 깊은 뻐근 + 장거리 후반=가자미근",
    classification: 'overuse',
    dataWeights: { weeklyIncreaseHigh: 0.8, acwrSpike: 0.6, paceSpike: 0.4, recurrence: 0.4 },
    probeWeights: { 'aggravating-motion': 0.8, timing: 0.6 },
    prevention: [
      { causeKey: '급증', levers: ['volume-freeze'], note: '직전주 ~25% 급증 회피, 볼륨 동결. 등척성 우선(강화플랜).', source: SRC },
      { causeKey: '비복근형', levers: ['stride-hold', 'cadence-cue'], note: '비복근형: 인터벌·언덕 점진 + 스트라이드 보류.', source: SRC },
      { causeKey: '가자미근형', levers: ['recovery-switch'], note: '가자미근형: back-to-back 제한 + 회복 전환 + seated 카프(강화플랜).', source: SRC }
    ],
    subtypeSplit: [
      { id: 'gastrocnemius', label: '비복근', hallmark: '무릎 펴고 폭발 pop' },
      { id: 'soleus', label: '가자미근', hallmark: '무릎 굽혀도 깊은 뻐근 + 장거리 후반' }
    ]
  },
  { id: 'dvt', label: '심부정맥혈전(DVT, 응급 의심)', areaBases: ['calf'], structure: 'muscle', priorRank: 2, hallmark: '부종·발적·안정 시 통증', classification: 'red-flag', dataWeights: {}, probeWeights: { 'self-test': 0.9 }, prevention: [] },

  // ── 고관절/둔근 ────────────────────────────────────────
  {
    id: 'gtps',
    label: '둔근건병증(GTPS)',
    areaBases: ['hip'],
    structure: 'tendon',
    priorRank: 1,
    hallmark: '대전자 위 압통 + 아픈쪽 측와위 통증 + 짝다리·다리꼬기 통증',
    classification: 'overuse',
    dataWeights: { chronicRising: 0.5, groundUphill: 0.4, cadenceLow: 0.3, recurrence: 0.4 },
    probeWeights: { location: 0.8, 'aggravating-motion': 0.7 },
    prevention: [
      { causeKey: '압박·부하', levers: ['volume-freeze'], note: '볼륨 동결 + 언덕/캠버 제거. 압박자세 교정(다리꼬기·짝다리·아픈쪽 측와위·ITB 스트레칭 금지). 등척성 외전(clam 금지, 교육+부하조절+운동 > 주사 — LEAP RCT).', source: SRC },
      { causeKey: '케이던스', levers: ['cadence-cue'], note: '케이던스 큐(보조).', source: SRC }
    ]
  },
  { id: 'femoral-neck-stress-fracture', label: '대퇴경부 피로골절(의심)', areaBases: ['hip'], structure: 'bone', priorRank: 2, hallmark: '사타구니 심부 + 매 발짝·야간통(75% 놓침 → 영상)', classification: 'red-flag', dataWeights: {}, probeWeights: { location: 0.9, timing: 0.7 }, prevention: [] },
  // 고관절 OA — §1 ③, 과사용 처방 레버 대상 아님(연령·ROM 제한) → 의료 경계 의뢰 경로.
  { id: 'hip-oa', label: '고관절 골관절염(의심)', areaBases: ['hip'], structure: 'joint', priorRank: 3, hallmark: '서혜부·둔부 통증 + ROM 제한 + 아침 뻣뻣함(주로 중년 이상)', classification: 'red-flag', dataWeights: {}, probeWeights: { 'aggravating-motion': 0.7, timing: 0.6 }, prevention: [] },

  // ── 햄스트링 ───────────────────────────────────────────
  {
    id: 'pht',
    label: '근위 햄스트링 건병증(PHT)',
    areaBases: ['hamstring'],
    structure: 'tendon',
    priorRank: 1,
    hallmark: '좌골결절 위 압통 + 앉기·오르막·오버스트라이드 악화',
    classification: 'overuse',
    dataWeights: { acwrSpike: 0.6, groundUphill: 0.6, paceSpike: 0.5, recurrence: 0.4 },
    probeWeights: { location: 0.8, 'aggravating-motion': 0.8 },
    prevention: [
      { causeKey: '부하', levers: ['volume-freeze'], note: 'ACWR<1.5 · 단일 +10% 회피 볼륨 동결.', source: SRC },
      { causeKey: '오르막·스피드', levers: ['intensity-down', 'cadence-cue'], note: '오르막·스피드 강도 하향 + 케이던스 큐. 3단계 부하(등척성→HSR→신장성, 강화플랜). 정적 스트레칭·딥스쿼트·장시간 착석 회피.', source: SRC }
    ]
  },
  {
    // §1 햄스트링 ②좌상은 (RF) 아닌 일반 급성 근손상 후보 — grade 1~2는 보존적 관리(overuse 처방). 진짜 RF는 아래 근위 파열·골/신경.
    id: 'hamstring-strain',
    label: '햄스트링 좌상',
    areaBases: ['hamstring'],
    structure: 'muscle',
    priorRank: 2,
    hallmark: '스프린트·가속 중 급성 통증(광범위 멍은 중등도 이상)',
    classification: 'overuse',
    dataWeights: { paceSpike: 0.6, acwrSpike: 0.5, recurrence: 0.4 },
    probeWeights: { 'aggravating-motion': 0.7, timing: 0.6 },
    prevention: [
      { causeKey: '스피드·급가속', levers: ['intensity-down', 'stride-hold'], note: '복귀 전까지 스프린트·급가속 보류, 강도 하향. 통증 가라앉으면 점진 스피드(3단계 부하, 강화플랜).', source: SRC },
      { causeKey: '부하', levers: ['volume-freeze', 'recovery-switch'], note: '볼륨 동결 + 회복 전환.', source: SRC }
    ]
  },
  { id: 'proximal-hamstring-avulsion', label: '근위 햄스트링 완전파열(의심)', areaBases: ['hamstring'], structure: 'tendon', priorRank: 3, hallmark: "폭발성 'pop' + 즉각 기능 소실(앉기·계단 곤란) + 좌골결절 근처 광범위 멍·촉지 결손", classification: 'red-flag', dataWeights: {}, probeWeights: { 'self-test': 0.9 }, prevention: [] },
  { id: 'ischial-stress-fracture-nerve', label: '좌골 응력골절·신경(의심)', areaBases: ['hamstring'], structure: 'bone', priorRank: 4, hallmark: '좌골 야간통 + 방사·저림 + 앉을 때 점통', classification: 'red-flag', dataWeights: {}, probeWeights: { location: 0.8, 'self-test': 0.8 }, prevention: [] }
]

/**
 * 전역 redFlag 지문(§4). 활동·시간 갈수록 악화/야간·휴식·보행통, 점통+hop 재현, 체중부하 곤란·부종·발적·열감·발열,
 * 저림·방사통·근력저하·발처짐, 양측·전신·비기계적 야간통, 6주(연부조직)~3개월(난치) 무호전.
 */
export const globalRedFlags: string[] = [
  '활동·시간이 갈수록 심해지고 야간/휴식/보행 통증이 있다',
  '한 손가락 점통 + hop(한발 뛰기)에서 통증 재현',
  '체중부하 곤란 · 부종 · 발적 · 열감 · 발열',
  '저림 · 방사통 · 근력저하 · 발처짐(foot drop)',
  '양측성 · 전신 · 비기계적(움직임과 무관) 야간통',
  '6주(연부조직)~3개월(난치) 동안 호전이 없다'
]

/** evaluateRedFlags 입력 — 체크인/grill 에서 모은 구조화 신호(없으면 미평가). */
export type RedFlagSignals = {
  /** 일상 보행에서도 통증(체중부하 통증). */
  dailyActivityPain?: boolean
  /** 안정·야간에도 통증. */
  nightOrRestPain?: boolean
  /** 활동할수록(시간 갈수록) 악화. */
  worseningOverTime?: boolean
  /** 한 손가락 점통 또는 hop 재현(피로골절 자가검사). */
  pointTenderOrHopPositive?: boolean
  /** 저림·방사통·근력저하·발처짐. */
  numbnessRadiatingWeakness?: boolean
  /** 부종·발적·열감·발열(또는 안정 시 종아리 부종 = DVT 경계). */
  swellingRednessHeat?: boolean
  /** 무호전 주수(연부조직 6주·난치 12주 초과). */
  noImprovementWeeks?: number | null
  /**
   * RED-S 경계(§4): 월경 이상 + 저에너지가용성/저식이 + 피로골절 이력 조합 → 내분비 평가 의뢰.
   * ⚠ 이는 "성별을 위험 가중"에 쓰는 게 아니라(§6 do-not 가드) 효과수정자 기반 의뢰 경로다(dossier §4 효과수정자 인식).
   */
  redSConcern?: boolean
  /** 고위험 골부위 의심(§4: 앞쪽 경골 black line·내측복사·발배뼈·5중족골 기저부·대퇴경부) — 즉시 영상/의뢰. */
  highRiskBoneSiteSuspected?: boolean
}

export type RedFlagResult = { tripped: boolean; reasons: string[] }

/**
 * redFlag 안전 게이트(§4) — 켜지면 가중·처방을 무시하고 전문가 의뢰가 최우선. 의사 진단 아님, "신호"만.
 * 구조화 신호가 하나도 없으면(미평가) tripped=false(보수적 — 없는 걸 켜지 않음).
 */
export function evaluateRedFlags(signals: RedFlagSignals | null | undefined): RedFlagResult {
  const reasons: string[] = []
  if (!signals) return { tripped: false, reasons }
  if (signals.worseningOverTime && signals.nightOrRestPain) reasons.push('활동·시간 갈수록 악화 + 야간/휴식 통증')
  else if (signals.nightOrRestPain) reasons.push('야간/휴식 통증')
  // 활동할수록 악화 + 보행(체중부하) 통증 = 피로골절 경계(야간통 없이도 흔함 → 위음성 축소).
  if (signals.worseningOverTime && signals.dailyActivityPain) reasons.push('활동성 악화 + 체중부하 통증(피로골절 경계 — 점통/hop 자가검사 권유)')
  if (signals.pointTenderOrHopPositive) reasons.push('한 손가락 점통 또는 hop 통증 재현(피로골절 경계)')
  if (signals.highRiskBoneSiteSuspected) reasons.push('고위험 골부위 의심(앞쪽 경골·내측복사·발배뼈·5중족골 기저부·대퇴경부) — 즉시 영상/의뢰')
  if (signals.dailyActivityPain) reasons.push('일상 보행에서도 통증(체중부하 통증)')
  if (signals.numbnessRadiatingWeakness) reasons.push('저림·방사통·근력저하·발처짐(신경 경계)')
  if (signals.swellingRednessHeat) reasons.push('부종·발적·열감·발열(혈전·감염 경계)')
  if (signals.redSConcern) reasons.push('월경 이상·저에너지가용성·피로골절 이력(RED-S) — 내분비 평가 의뢰')
  if (typeof signals.noImprovementWeeks === 'number' && signals.noImprovementWeeks >= 6) reasons.push(`${signals.noImprovementWeeks}주 무호전`)
  return { tripped: reasons.length > 0, reasons }
}

/** rankInjuryHypotheses 결과 한 건. */
export type RankedHypothesis = {
  hypothesis: InjuryHypothesis
  score: number
  /** 점수에 기여한 데이터 신호(설명·디버깅용). */
  contributingSignals: (keyof InjuryDataSignals)[]
}

/**
 * 선택 부위 + 데이터 신호로 1차 과사용 가설을 결정론으로 가중·정렬한다(§2-A). red-flag 후보는 rank 제외
 * (evaluateRedFlags 가 별도 담당). 점수 = priorScore(1/순위) + Σ(존재 신호 × dataWeights). 동점이면 priorRank 우선.
 * grill probe 통합(probeAnswers 가중)·아형 분기는 후속 Phase. coach-run 은 이 결과 상위 1~2 만 받는다.
 */
export function rankInjuryHypotheses(
  selectedAreaIds: string[],
  signals: InjuryDataSignals = {}
): RankedHypothesis[] {
  const bases = new Set(selectedAreaIds.map(injuryAreaBase))
  const present = (Object.keys(signals) as (keyof InjuryDataSignals)[]).filter((k) => signals[k])
  return injuryKnowledgeBase
    .filter((h) => h.classification === 'overuse' && h.areaBases.some((b) => bases.has(b)))
    .map((hypothesis) => {
      const contributingSignals = present.filter((s) => typeof hypothesis.dataWeights[s] === 'number')
      const dataScore = contributingSignals.reduce((sum, s) => sum + (hypothesis.dataWeights[s] ?? 0), 0)
      return { hypothesis, score: 1 / hypothesis.priorRank + dataScore, contributingSignals }
    })
    .sort((a, b) => b.score - a.score || a.hypothesis.priorRank - b.hypothesis.priorRank)
}

/** 해당 부위의 red-flag 후보 가설(의뢰 경로 안내·자가검사 문항 소스). rank 에는 안 들어간다. */
export function redFlagHypothesesForAreas(selectedAreaIds: string[]): InjuryHypothesis[] {
  const bases = new Set(selectedAreaIds.map(injuryAreaBase))
  return injuryKnowledgeBase.filter((h) => h.classification === 'red-flag' && h.areaBases.some((b) => bases.has(b)))
}
