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
  /**
   * 체중부하 곤란 또는 관절 잠김/불안정(§4 "체중부하 곤란" + 무릎 잠김·giving way) — 급성 구조 손상 경계.
   * 아킬레스 파열('뚝'+발끝 못 섬)·반월/인대(잠김·giving way)·근위 햄스트링 완전파열(앉기·계단 곤란) 자가검사 답변이 켠다.
   * (부위특이 응급을 기존 일반 필드로 억지 매핑하지 않으려 둔 전용 게이트 — 의사 흉내 아님, "디딜 수 없으면 평가" 신호.)
   */
  weightBearingFailureOrInstability?: boolean
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
  if (signals.weightBearingFailureOrInstability) reasons.push('체중부하 곤란·관절 잠김/불안정(급성 구조 손상 경계) — 즉시 평가')
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
  /** grill 답변(§2-B)이 이 가설을 지지했는가(favors 일치) — 점수에 PROBE_FAVOR_BOOST 가산됨. */
  probeFavored: boolean
}

/**
 * grill 답변 가중(§2-B). 사용자가 고른 §1 결정적 지문은 강한 감별 신호라, 사전순위 + 데이터를 넘어 그 가설을
 * 상위 "가능성"으로 올린다(예 햄스트링 'sprint-pop'→좌상이 사전순위 1위 PHT를 역전). **가산식**(× 아님)을 택한 이유는
 * 비지지 가설 점수를 보존해 상위 1~2 동반 표시로 comorbid(동반 가능성)를 유지하기 위함이다.
 * 안전 경계(#전문코치리뷰 2렌즈 검증): ① 부위당 overuse 가설이 ≤2개(햄스트링만 2개)라 favored 가 1위여도 나머지
 *   overuse 는 항상 top-2 동반표시 → 단정 아님 ② favors 는 overuse 옵션에만 있어 redFlag 후보를 못 올림(§4 우선 보존)
 *   ③ 라벨은 "가능성"으로만. ⚠ 후속(추적 이슈): flat 1.5라 pathognomonic 답과 약한 답이 동일 가중 — 옵션별 likelihood
 *   그라데이션은 프로브 axis↔가설 probeWeights 불일치로 모델 확장이 필요해 별도 증분으로 연기.
 */
const PROBE_FAVOR_BOOST = 1.5

/**
 * probeAnswers(§2-B grill 답변)에서 favors 가 가리키는 가설 id 집합을 모은다. redFlag 자가검사 옵션은 favors 가 없어
 * 여기 안 들어온다(가중 대신 evaluateRedFlags 게이트로 처리 — SSOT "redFlag 켜지면 가중 무시").
 */
function favoredHypothesisIds(probeAnswers: Record<string, string>): Set<string> {
  const favored = new Set<string>()
  for (const [probeId, value] of Object.entries(probeAnswers)) {
    const fav = injuryProbes.find((probe) => probe.id === probeId)?.options.find((opt) => opt.value === value)?.favors
    if (fav) favored.add(fav)
  }
  return favored
}

/**
 * 선택 부위 + 데이터 신호(§2-A) + grill 답변(§2-B)으로 1차 과사용 가설을 결정론으로 가중·정렬한다. red-flag 후보는
 * rank 제외(evaluateRedFlags 가 별도 담당). 점수 = priorScore(1/순위) + Σ(존재 신호 × dataWeights) + (답변 지지 시 BOOST).
 * 동점이면 priorRank 우선. coach-run 은 이 결과 상위 1~2 만 받는다(아형 분기는 subtypeResolved 가 라벨에서 담당).
 */
export function rankInjuryHypotheses(
  selectedAreaIds: string[],
  signals: InjuryDataSignals = {},
  probeAnswers: Record<string, string> = {}
): RankedHypothesis[] {
  const bases = new Set(selectedAreaIds.map(injuryAreaBase))
  const present = (Object.keys(signals) as (keyof InjuryDataSignals)[]).filter((k) => signals[k])
  const favored = favoredHypothesisIds(probeAnswers)
  return injuryKnowledgeBase
    .filter((h) => h.classification === 'overuse' && h.areaBases.some((b) => bases.has(b)))
    .map((hypothesis) => {
      const contributingSignals = present.filter((s) => typeof hypothesis.dataWeights[s] === 'number')
      const dataScore = contributingSignals.reduce((sum, s) => sum + (hypothesis.dataWeights[s] ?? 0), 0)
      const probeFavored = favored.has(hypothesis.id)
      return {
        hypothesis,
        score: 1 / hypothesis.priorRank + dataScore + (probeFavored ? PROBE_FAVOR_BOOST : 0),
        contributingSignals,
        probeFavored
      }
    })
    .sort((a, b) => b.score - a.score || a.hypothesis.priorRank - b.hypothesis.priorRank)
}

/** 해당 부위의 red-flag 후보 가설(의뢰 경로 안내·자가검사 문항 소스). rank 에는 안 들어간다. */
export function redFlagHypothesesForAreas(selectedAreaIds: string[]): InjuryHypothesis[] {
  const bases = new Set(selectedAreaIds.map(injuryAreaBase))
  return injuryKnowledgeBase.filter((h) => h.classification === 'red-flag' && h.areaBases.some((b) => bases.has(b)))
}

// ─────────────────────────────────────────────────────────────────────────────
// grill 프로브(§5 Phase C — 능동 코치 모먼트로 "1문항" 감별). 부위당 1 프로브(증분1).
//   목적: 같은 부위 안의 아형(subtype)을 가르고, red-flag 자가검사를 escalation 으로 연결한다.
//   ⚠ 의사 흉내 금지·"가능성"으로만·진단 단정 금지. 문구는 §1 결정적 지문에서 도출.
//   ⚠ 다축 누적·답변 기반 rank 재가중은 증분2(여기선 subtype 해소 + redFlag 자가검사만).
// ─────────────────────────────────────────────────────────────────────────────

/** 프로브 옵션의 코치 톤(CoachMomentSentiment 와 동일 값 — shared 와의 결합을 피해 entities 에 로컬 정의). */
export type InjuryProbeSentiment = 'positive' | 'neutral' | 'caution'

/**
 * 프로브 한 옵션. 사용자가 고르면:
 *  - value 를 probeAnswers[probeId] 에 저장(누적·재방문 시 미답 판정).
 *  - subtype 가 있으면 injuryItem.subtypeResolved 에 저장(가능성 라벨 정밀화).
 *  - redFlagSelfTest 가 있으면 읽기 시점에 RedFlagSignals 로 매핑(injurySignals.redFlagSignalsFromInjury). 저장은 value 만.
 *  - favors 는 증분2 rank 재가중용(현재 소비 안 함 — dead 가 아니라 예약 필드, 읽는 코드 생기기 전까지 KB 정의에만 존재).
 */
export type InjuryProbeOptionDef = {
  /** 버튼 라벨(짧게). */
  label: string
  /** probeAnswers 에 저장하는 안정 슬러그(부위 안에서 유일). */
  value: string
  /** 고른 뒤 코치가 답하는 피드백("가능성"으로만, 진단 아님). */
  response: string
  sentiment: InjuryProbeSentiment
  /** 이 답이 지지하는 과사용 가설 id(증분2 재가중 예약). */
  favors?: string
  /** 해소되는 아형 id(InjuryHypothesis.subtypeSplit[].id 와 일치). */
  subtype?: string
  /**
   * 이 답이 켜는 red-flag 자가검사 신호(RedFlagSignals 키들). 읽기 시점 evaluateRedFlags 입력으로 매핑.
   * 한 답이 둘 이상 가설을 시사하면 여러 키(예 좌골 야간·방사 = 신경 + 골 경로 → [numbness, nightOrRest]).
   */
  redFlagSelfTest?: (keyof RedFlagSignals)[]
}

/** 부위(base) 1개당 1 프로브. id = 부위 base('plantar-fascia' 등) → probeAnswers 키. */
export type InjuryProbeDef = {
  id: string
  /** §2-B 5축 중 이 프로브가 가르는 1축(증분2 축 기반 재가중·축별 dedupe 용 메타). */
  axis: InjuryProbeAxis
  /** 능동 모먼트로 띄울 질문(한 번에 1축, 진단 아님). */
  question: string
  options: InjuryProbeOptionDef[]
}

/**
 * 부위별 grill 프로브 카탈로그(§1 결정적 지문 1:1). 옵션은 (a)과사용 가설/아형 확인 또는 (b)red-flag 자가검사.
 * red-flag 옵션의 redFlagSelfTest 는 evaluateRedFlags 가 처리하는 RedFlagSignals 키만 쓴다(게이트 정합).
 */
export const injuryProbes: InjuryProbeDef[] = [
  // 발바닥 — 타이밍/질감: 아침 첫걸음 완화(PF) ↔ 안 풀리고 악화(피로골절 패턴) ↔ 화끈·저림(Baxter 신경)
  {
    id: 'plantar-fascia',
    axis: 'timing',
    question: '발바닥(뒤꿈치) 통증, 어떤 양상에 가장 가까워요?',
    options: [
      { label: '아침 첫걸음이 가장 아프고 걸으면 풀려요', value: 'morning-first-step-eases', sentiment: 'neutral', favors: 'plantar-fasciitis', response: '전형적인 족저근막염 패턴에 가까워요(걸으면 풀리는 게 특징). 부하를 잠시 동결하고 종아리 강화를 곁들이면 도움돼요 — 단정은 아니고 가능성이에요.' },
      // worseningOverTime 단독은 evaluateRedFlags 가 일부러 트립하지 않는다(단발 '활동성 악화'만으로 피로골절 과의뢰 방지 — §4).
      // 대신 response 가 hop 자가검사로 승격을 유도하고, hop 답(focal-hop-positive=pointTenderOrHopPositive)은 단독 트립한다 → 위양성↓·안전망 유지.
      { label: '첫발에도 안 풀리고 활동할수록 더 아파요', value: 'no-ease-worsens-with-activity', sentiment: 'caution', redFlagSelfTest: ['worseningOverTime'], response: '걸어도 안 풀리고 갈수록 심해지는 건 단순 족저근막염과 다른 패턴이에요. 한 발로 살짝 뛰었을 때(hop) 뒤꿈치 한 점이 콕 아프면 피로골절일 수 있으니, 무리하지 말고 통증이 이어지면 전문가 평가를 받아보세요.' },
      { label: '화끈거리거나 저린 느낌이 있어요', value: 'burning-numbness', sentiment: 'caution', redFlagSelfTest: ['numbnessRadiatingWeakness'], response: '화끈거림·저림은 근막보다 신경 자극(예: Baxter 신경) 가능성을 시사해요. 부하 조절로만 두지 말고 전문가 평가를 권해요.' }
    ]
  },
  // 아킬레스 — 위치: 중간부 ↔ 부착부(아형) + '뚝' 파열(응급)
  {
    id: 'achilles',
    axis: 'location',
    question: '아킬레스 통증, 어디에 가장 가까워요?',
    options: [
      { label: '복사뼈 위 2~6cm, 힘줄 가운데가 아파요', value: 'mid-portion', sentiment: 'neutral', favors: 'achilles-tendinopathy', subtype: 'mid-portion', response: '힘줄 중간부 패턴이에요. 중간부형은 편심/HSR 강화가 잘 들어요 — 갑작스러운 거리·강도 증가를 막으면서요. 가능성 안내예요.' },
      { label: '더 아래 뼈에 붙는 곳이 아프고, 발등 당기기·오르막에서 심해져요', value: 'insertional', sentiment: 'neutral', favors: 'achilles-tendinopathy', subtype: 'insertional', response: '부착부형에 가까워요. 부착부는 풀 ROM 편심·오르막을 피하고 중립 범위·힐리프트로 관리해요(중간부와 처방이 달라요).' },
      { label: "'뚝' 소리/느낌 뒤로 발끝으로 못 서요", value: 'pop-cannot-stand', sentiment: 'caution', redFlagSelfTest: ['weightBearingFailureOrInstability'], response: "'뚝' 하는 느낌과 발끝으로 못 서는 건 힘줄 파열을 의심해야 하는 응급 신호예요. 달리기 처방을 멈추고 바로 전문가 평가를 받으세요." }
    ]
  },
  // 정강이 — 자가검사: 넓게(MTSS) ↔ 한 점+hop(피로골절) ↔ 앞쪽 뼈(고위험) ↔ 운동성 조임·저림(구획증후군, §1 ③)
  {
    id: 'shin',
    axis: 'self-test',
    question: '정강이 통증, 짚어보면 어떤가요?',
    options: [
      { label: '안쪽을 따라 손바닥 너비(5cm 이상)로 욱신거려요', value: 'medial-diffuse', sentiment: 'neutral', favors: 'mtss', response: '안쪽으로 넓게 퍼지는 건 MTSS(정강이 스트레스 증후군) 패턴에 가까워요. 부하 동결 + 회복주, 케이던스 살짝 올리기가 도움돼요 — 가능성 안내예요.' },
      { label: '한 손가락으로 짚이는 한 점이 콕 아프고, 한 발로 뛰면(hop) 그 점이 아파요', value: 'focal-hop-positive', sentiment: 'caution', redFlagSelfTest: ['pointTenderOrHopPositive'], response: '한 점 압통 + hop 통증 재현은 피로골절 경계 신호예요. 달리기를 멈추고 전문가 평가를 받아보시길 권해요.' },
      { label: '정강이 앞쪽 뼈 위가 아파요', value: 'anterior-tibia', sentiment: 'caution', redFlagSelfTest: ['highRiskBoneSiteSuspected'], response: '정강이 앞쪽 뼈(전방 경골)는 잘 낫지 않는 고위험 부위라, 미루지 말고 전문가 평가를 받아보시길 권해요.' },
      // §1 *-shin ③구획증후군. 운동성(달리면 조임·저림, 쉬면 가라앉음) 변별 + 5P(창백·감각마비) 동반 시 응급. 저림 → numbnessRadiatingWeakness 트립(신경 경계 의뢰).
      { label: '달릴수록 정강이가 조이듯 빵빵해지고 저려요 (쉬면 가라앉아요)', value: 'exertional-tightness-numbness', sentiment: 'caution', redFlagSelfTest: ['numbnessRadiatingWeakness'], response: '운동할 때만 조이듯 빵빵하고 저린 건 구획증후군 가능성을 시사해요. 무리하지 말고 전문가 평가를 권해요 — 창백해지거나 감각이 마비되면 바로 응급으로 봐야 해요.' }
    ]
  },
  // 무릎 — 아픈동작: 계단·스쿼트(PFPS) ↔ 잠김/giving way(구조손상) ↔ 뼈 점통(피로골절)
  {
    id: 'knee',
    axis: 'aggravating-motion',
    question: '무릎, 어떤 동작에서 가장 아파요?',
    options: [
      { label: '계단 내려갈 때·쪼그릴 때·오래 앉았다 일어날 때 아파요', value: 'stairs-squat-sitting', sentiment: 'neutral', favors: 'pfps', response: '앞쪽 분산통 + 계단·스쿼트 악화는 슬개대퇴 통증(PFPS) 패턴에 가까워요. 볼륨 동결 + 케이던스 살짝 올리기, 다운힐 점진이 도움돼요 — 가능성 안내예요.' },
      { label: '무릎이 잠기거나(locking) 갑자기 풀리는(giving way) 느낌이 있어요', value: 'locking-giving-way', sentiment: 'caution', redFlagSelfTest: ['weightBearingFailureOrInstability'], response: '잠김·갑자기 풀림은 반월·인대 같은 구조 손상을 의심하게 해요. 무리한 달리기를 멈추고 전문가 평가를 받아보세요.' },
      { label: '뼈 위 한 점이 콕 아프고 디디면 바로 아파요', value: 'bone-point-tender', sentiment: 'caution', redFlagSelfTest: ['pointTenderOrHopPositive'], response: '뼈 위 한 점 압통 + 디딜 때 즉시 통증은 피로골절 경계 신호예요. 달리기를 멈추고 전문가 평가를 권해요.' }
    ]
  },
  // IT 밴드 — 위치: 외측+같은 거리에서 켜짐(ITBS) ↔ 잠김/붓기/불안정(외측 구조 병리)
  {
    id: 'it-band',
    axis: 'location',
    question: '무릎 바깥쪽 통증, 어떤가요?',
    options: [
      { label: '바깥쪽이 늘 비슷한 거리쯤에서 켜지듯 아파요(무릎 살짝 굽힐 때)', value: 'lateral-same-distance', sentiment: 'neutral', favors: 'itbs', response: '바깥쪽 대퇴과에서 늘 같은 거리쯤 켜지는 건 장경인대 증후군(ITBS) 패턴에 가까워요. 주간 거리 급증을 막고 볼륨 동결 + 내리막·캠버 회피가 핵심이에요 — 가능성 안내예요.' },
      { label: '바깥쪽 무릎이 잠기거나 붓고 불안정해요', value: 'lateral-locking-swelling', sentiment: 'caution', redFlagSelfTest: ['weightBearingFailureOrInstability'], response: '잠김·붓기·불안정은 외측 무릎 구조 병리(외측 반월·측부인대)를 의심하게 해요. 무리하지 말고 전문가 평가를 받아보세요.' }
    ]
  },
  // 종아리 — 위치/아형: 비복근(무릎 펴고 pop) ↔ 가자미근(굽혀도 깊은 뻐근) ↔ DVT(붓고 빨갛고 안정시통)
  {
    id: 'calf',
    axis: 'location',
    question: '종아리 통증, 어떤 양상에 가까워요?',
    options: [
      { label: "무릎을 편 채 갑자기 '팍' 터지듯 아팠어요", value: 'gastrocnemius-pop', sentiment: 'neutral', favors: 'calf-strain', subtype: 'gastrocnemius', response: '무릎 편 상태에서 폭발하는 통증은 비복근 좌상 패턴이에요. 인터벌·언덕은 점진적으로, 스트라이드는 잠시 보류하는 게 좋아요 — 가능성 안내예요.' },
      { label: '무릎을 굽혀도 깊이 뻐근하고, 장거리 후반에 심해져요', value: 'soleus-deep', sentiment: 'neutral', favors: 'calf-strain', subtype: 'soleus', response: '무릎 굽혀도 남는 깊은 뻐근함 + 장거리 후반 악화는 가자미근 누적 패턴이에요. 연속 훈련을 줄이고 회복으로 전환하는 게 도움돼요.' },
      { label: '종아리가 붓고 빨갛고, 쉴 때도 아파요', value: 'swelling-redness-rest-pain', sentiment: 'caution', redFlagSelfTest: ['swellingRednessHeat'], response: '부종·발적·안정 시 통증은 심부정맥혈전(DVT) 같은 응급을 의심해야 해요. 달리기를 멈추고 즉시 의료기관 평가를 받으세요.' }
    ]
  },
  // 고관절/둔근 — 위치: 대전자 위(GTPS) ↔ 사타구니 심부+매발짝·야간통(대퇴경부 피로골절, 고위험).
  // §1 ③고관절 OA 는 사전확률 낮아(주로 중년 이상) 1문항 스코프에서 의도적으로 제외 — 누락이 아니라 우선순위 판단.
  {
    id: 'hip',
    axis: 'location',
    question: '고관절 통증, 어디에 가까워요?',
    options: [
      { label: '옆 엉덩이 큰 뼈(대전자) 위가 아프고, 그쪽으로 누우면·다리 꼬면 아파요', value: 'greater-trochanter', sentiment: 'neutral', favors: 'gtps', response: '대전자 위 압통 + 측와위·다리꼬기 통증은 둔근건병증(GTPS) 패턴에 가까워요. 볼륨 동결 + 압박 자세 교정(다리꼬기·짝다리 피하기)이 핵심이에요 — 가능성 안내예요.' },
      { label: '사타구니 깊은 곳이 아프고, 걸을 때 매 발짝·밤에 아파요', value: 'deep-groin-night', sentiment: 'caution', redFlagSelfTest: ['highRiskBoneSiteSuspected', 'nightOrRestPain'], response: '사타구니 심부 + 매 발짝·야간통은 대퇴경부 피로골절(고위험, 자주 놓치는 부위) 경계 신호예요. 미루지 말고 전문가 평가를 받아보시길 권해요.' }
    ]
  },
  // 햄스트링 — 위치/동작: 좌골+앉기·오르막(PHT) ↔ 스프린트 pop(좌상) ↔ 야간·방사·저림(골/신경 둘 다).
  // night-radiating 은 §1 '골(좌골 응력골절) OR 신경' 이중 후보라 두 RF 신호(neuro + 야간통→골)를 함께 켠다.
  {
    id: 'hamstring',
    axis: 'location',
    question: '햄스트링 통증, 어떤 양상에 가까워요?',
    options: [
      { label: '좌골(앉는 뼈) 위가 아프고, 앉기·오르막·보폭 크게 뛸 때 심해져요', value: 'ischial-sitting-uphill', sentiment: 'neutral', favors: 'pht', response: '좌골결절 위 압통 + 앉기·오르막 악화는 근위 햄스트링 건병증(PHT) 패턴이에요. 오르막·스피드는 강도를 낮추고 단계적 부하로 관리해요 — 가능성 안내예요.' },
      { label: "스프린트·가속 중 갑자기 '팍' 하고 아팠어요", value: 'sprint-pop', sentiment: 'neutral', favors: 'hamstring-strain', response: '스프린트 중 급성 통증은 햄스트링 좌상 패턴이에요. 복귀 전까지 스프린트·급가속은 보류하고 강도를 낮춰 관리해요.' },
      { label: '밤에 아프고 다리로 저리거나 방사돼요', value: 'night-radiating', sentiment: 'caution', redFlagSelfTest: ['numbnessRadiatingWeakness', 'nightOrRestPain'], response: '야간통 + 저림·방사는 좌골 응력골절이나 신경 자극 가능성을 시사해요. 부하 조절로만 두지 말고 전문가 평가를 권해요.' }
    ]
  }
]

/**
 * 다음에 물어볼 프로브 1개를 고른다(§5 "한 세션 1문항"). 선택 부위(base)들 중 아직 답 안 한 프로브의 첫 번째.
 * answeredProbeIds = Object.keys(injuryItem.probeAnswers). 모두 답했거나 스코프 밖 부위면 null.
 * (부위당 1 프로브라 probeId=base 로 키징 — 같은 부상이 여러 부위면 첫 부위 프로브부터, 답하면 다음 부위로.)
 */
export function selectNextProbe(selectedAreaIds: string[], answeredProbeIds: string[] = []): InjuryProbeDef | null {
  const bases = new Set(selectedAreaIds.map(injuryAreaBase))
  const answered = new Set(answeredProbeIds)
  return injuryProbes.find((probe) => bases.has(probe.id) && !answered.has(probe.id)) ?? null
}
