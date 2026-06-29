// MyResult(국내) 공개 API 수집기.
//
// 출처: https://www.myresult.co.kr — Nuxt 앱 + 공개 JSON API.
//   - 이벤트 메타:   GET /api/event/{eventId}         → { count_players, courses:[{course_cd,distance}] }
//   - 선수 상세:     GET /api/event/{eventId}/player/{num}
//                     → { course_cd, result_nettime, result_guntime, gender, course:{distance} }
//   - 검색 ?q={num}: 정확 일치 1건만(이름 포함) — 목록/일괄 엔드포인트는 없음.
//
// 전체 분포 목록 API가 없어 num을 무작위 표본으로 순회한다. 핵심 함정: 배번(num) 공간은
// 코스별 블록으로 흩어져 있고 매우 희소하다(예: 춘천 풀 ≈ 3,000~13,000번대, 10K ≈ 40,000번대,
// count_players=21,158은 "완주자 수"지 최대 배번이 아니다). 그래서 [1, count_players]만 표본하면
// 10K 블록을 통째로 놓친다. 이를 막기 위해 3단계로 수집한다:
//   1) 상한 탐색: 지수 사다리로 가장 높은 점유 배번대를 찾아 ceiling 추정.
//   2) 지형 스캔: [1, ceiling]을 균등 샘플해 코스별 배번 범위[min,max]를 파악.
//   3) 범위 내 표본: 코스별 [min,max] 안에서 무작위 표본으로 목표 표본 수를 채운다.
// "존재하는 완주자"의 무작위 표본은 모집단의 불편(unbiased) 표본이라 퍼센타일 추정에 편향이 없다.
//
// 개인정보: 각 응답에서 net time(초)와 gender만 메모리 배열에 누적하고 즉시 버린다.
//           이름·배번·생년 등 원본 row는 디스크/제품/리포트에 저장하지 않는다.

import { fetchJson, pool } from '../lib/http.mjs'
import { parseNetTimeToSeconds, normalizeGender } from '../lib/parse.mjs'
import { percentileCuts } from '../lib/percentiles.mjs'

const BASE = 'https://www.myresult.co.kr'

// 이벤트 → raceBenchmark.ts 스냅샷 id 매핑. (코스 키는 거리 버킷 키와 일치.)
export const MYRESULT_EVENTS = [
  {
    eventId: 132,
    name: '2025 Chuncheon Marathon',
    snapshots: { '10k': 'chuncheon-marathon-2025-10k', marathon: 'chuncheon-marathon-2025-marathon' }
  },
  {
    eventId: 133,
    name: '2025 JTBC Seoul Marathon',
    snapshots: { '10k': 'jtbc-seoul-marathon-2025-10k', marathon: 'jtbc-seoul-marathon-2025-marathon' }
  }
]

// 거리(km) 버킷 + 완주시간 타당성 범위(초). 마라톤 상한은 제한시간(춘천 ~5h) 너머 일부 여유.
const COURSE_BUCKETS = [
  { key: '10k', minKm: 9.6, maxKm: 10.4, timeMin: 1500, timeMax: 9000 },
  { key: 'marathon', minKm: 41.6, maxKm: 42.8, timeMin: 7000, timeMax: 21600 }
]

function bucketForDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return null
  return COURSE_BUCKETS.find((b) => distanceKm >= b.minKm && distanceKm <= b.maxKm) ?? null
}

function emptyAcc() {
  const acc = {}
  for (const b of COURSE_BUCKETS) acc[b.key] = { overall: [], male: [], female: [] }
  return acc
}

const playerUrl = (eventId, num) => `${BASE}/api/event/${eventId}/player/${num}`

/**
 * 한 선수 응답을 소화한다. 코스가 매칭되면 그 버킷 키를 돌려준다(DNF여도 — 배번 블록 파악용).
 * 유효 완주 기록(net time)일 때만 acc에 누적한다. 원본은 보관하지 않는다.
 * @returns {string|null} 버킷 키 또는 null
 */
function ingestPlayer(player, cdToDistance, acc) {
  if (!player) return null
  const distance = cdToDistance.get(player.course_cd) ?? parseFloat(player?.course?.distance)
  const bucket = bucketForDistance(distance)
  if (!bucket) return null
  const sec = parseNetTimeToSeconds(player.result_nettime)
  if (sec != null && sec >= bucket.timeMin && sec <= bucket.timeMax) {
    const gender = normalizeGender(player.gender)
    acc[bucket.key].overall.push(sec)
    if (gender === 'male') acc[bucket.key].male.push(sec)
    else if (gender === 'female') acc[bucket.key].female.push(sec)
  }
  return bucket.key
}

/**
 * 광역 윈도우 스캔으로 코스별 배번 범위[min,max]를 견고하게 지도화한다.
 * spacing 간격마다 연속 windowK개를 조회 → 블록이 희소·고번호대(예: JTBC 10K=5만~8.5만번)여도
 * 인접 윈도우들이 반드시 걸린다. 단일 윈도우가 네트워크로 실패해도 옆 윈도우가 커버한다.
 * 스캔 중 발견한 유효 완주자는 acc에도 즉시 반영해 낭비를 줄인다.
 */
async function mapLandscape(eventId, cdToDistance, acc, seen, { maxBib, spacing, windowK, concurrency, log }) {
  const probes = []
  for (let center = 1; center <= maxBib; center += spacing) {
    for (let i = 0; i < windowK; i += 1) {
      const n = center + i
      if (!seen.has(n)) { seen.add(n); probes.push({ num: n, center }) }
    }
  }
  const players = await pool(probes, (pr) => fetchJson(playerUrl(eventId, pr.num)), concurrency)
  const ranges = {}
  players.forEach((p, i) => {
    const key = ingestPlayer(p, cdToDistance, acc)
    if (!key) return
    const { num, center } = probes[i]
    const cur = ranges[key] ?? { min: Infinity, max: -Infinity, hits: 0, centers: new Set() }
    cur.min = Math.min(cur.min, num)
    cur.max = Math.max(cur.max, num)
    cur.hits += 1
    cur.centers.add(center) // 점유 윈도우(=블록 근방)만 기억 → 빈 구간 표본 낭비 방지
    ranges[key] = cur
  })
  for (const key of Object.keys(ranges)) ranges[key].centers = [...ranges[key].centers]
  const summary = Object.entries(ranges)
    .map(([k, r]) => `${k}[${r.min}-${r.max} hits=${r.hits} blocks=${r.centers.length}]`)
    .join(' ')
  log(`  landscape: probes=${probes.length} ${summary}`)
  return ranges
}

/** 점유 윈도우(블록 근방) 안에서 목표 표본 수를 채울 때까지 무작위 표본. */
async function sampleCourse(eventId, bucketKey, range, cdToDistance, acc, seen, { target, budget, spacing, concurrency, log, evName }) {
  if (!range || !range.centers?.length) {
    log(`  [${evName}/${bucketKey}] 점유 블록 미발견 — 스킵`)
    return 0
  }
  const centers = range.centers
  let requests = 0
  while (acc[bucketKey].overall.length < target && requests < budget) {
    const batchSize = Math.min(concurrency * 6, budget - requests)
    const batch = []
    let guard = 0
    while (batch.length < batchSize && guard < batchSize * 40) {
      guard += 1
      const center = centers[Math.floor(Math.random() * centers.length)]
      const num = center + Math.floor(Math.random() * spacing)
      if (num < 1 || seen.has(num)) continue
      seen.add(num)
      batch.push(num)
    }
    if (batch.length === 0) break
    requests += batch.length
    const players = await pool(batch, (num) => fetchJson(playerUrl(eventId, num)), concurrency)
    for (const p of players) ingestPlayer(p, cdToDistance, acc)
    log(`  [${evName}/${bucketKey}] req=${requests}/${budget} overall=${acc[bucketKey].overall.length} (M${acc[bucketKey].male.length}/F${acc[bucketKey].female.length})`)
  }
  return requests
}

async function harvestEvent(ev, { targetPerCourse, perCourseBudget, maxBib, spacing, windowK, concurrency, log }) {
  const meta = await fetchJson(`${BASE}/api/event/${ev.eventId}`)
  if (!meta) throw new Error(`event ${ev.eventId} meta fetch failed`)
  const cdToDistance = new Map()
  for (const c of meta.courses ?? []) {
    const d = parseFloat(c.distance)
    if (Number.isFinite(d)) cdToDistance.set(c.course_cd, d)
  }
  log(`[${ev.name}] count_players=${meta.count_players} courses=${[...cdToDistance.entries()].map(([k, v]) => `${k}:${v}`).join(',')}`)

  const acc = emptyAcc()
  const seen = new Set()
  const ranges = await mapLandscape(ev.eventId, cdToDistance, acc, seen, { maxBib, spacing, windowK, concurrency, log })

  for (const b of COURSE_BUCKETS) {
    await sampleCourse(ev.eventId, b.key, ranges[b.key], cdToDistance, acc, seen, {
      target: targetPerCourse,
      budget: perCourseBudget,
      spacing,
      concurrency,
      log,
      evName: ev.name
    })
  }
  return acc
}

/** 코스별 누적 배열 → 스냅샷 컷 객체(전체 + 성별, 비식별 집계만). */
function buildSnapshotCuts(courseAcc, { minSegment }) {
  const result = {
    sampleSize: courseAcc.overall.length,
    percentileCutsSec: percentileCuts(courseAcc.overall),
    genderDistribution: {}
  }
  if (courseAcc.male.length >= minSegment) {
    result.genderDistribution.male = { sampleSize: courseAcc.male.length, cuts: percentileCuts(courseAcc.male) }
  }
  if (courseAcc.female.length >= minSegment) {
    result.genderDistribution.female = { sampleSize: courseAcc.female.length, cuts: percentileCuts(courseAcc.female) }
  }
  return result
}

/**
 * MyResult 4개 스냅샷(춘천/JTBC × 10K/풀)을 표본 수집해 스냅샷 id별 컷을 돌려준다.
 * @returns {Promise<Record<string, {sampleSize:number, percentileCutsSec:any[], genderDistribution:object}>>}
 */
export async function harvestMyResult({
  targetPerCourse = 3000,
  perCourseBudget = 10000,
  maxBib = 300000,
  spacing = 2500,
  windowK = 12,
  concurrency = 24,
  minSegment = 200,
  log = (m) => process.stderr.write(`${m}\n`)
} = {}) {
  const out = {}
  for (const ev of MYRESULT_EVENTS) {
    const acc = await harvestEvent(ev, { targetPerCourse, perCourseBudget, maxBib, spacing, windowK, concurrency, log })
    for (const [courseKey, snapshotId] of Object.entries(ev.snapshots)) {
      out[snapshotId] = buildSnapshotCuts(acc[courseKey], { minSegment })
    }
  }
  return out
}
