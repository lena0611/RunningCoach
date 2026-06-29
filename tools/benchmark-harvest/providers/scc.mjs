// SCC Events(베를린 하프/풀) 공식 결과 API 수집기 — 스캐폴드.
//
// 상태: 집계 파이프라인은 완성. 출처별 HTTP 페이지네이션(fetchRankPage)만 공개 API 형태를
//       재확인해 채우면 동작한다. ENDPOINT 미검증이라 harvestScc()는 막아 둔다. 국제 재수집 보류.
//
// 알려진 접근(기존 스냅샷 method 메모 기준):
//   "SCC Events official result API. 공식 result API의 전체 순위 위치를 조회해 Runner netto 기준으로 집계."
//   - 순위(rank) 위치로 페이지네이션. 응답 행에 Runner netto(net time) + gender + age class(AK).
//   - 완주자 필터: netto 존재. netto가 net time.
//   - age class(AK, 예: M40) 있어 → 성별/나이대 축 모두 가능(나이대는 현재 scope 보류).
//
// 대상 스냅샷: berlin-half-2025-half, berlin-marathon-2025-marathon.

import { parseNetTimeToSeconds, normalizeGender } from '../lib/parse.mjs'
import { percentileCuts } from '../lib/percentiles.mjs'

export const SCC_EVENTS = [
  { key: 'berlin-half-2025-half', label: 'Berlin Half 2025', distanceKm: 21.0975 },
  { key: 'berlin-marathon-2025-marathon', label: 'Berlin Marathon 2025', distanceKm: 42.195 }
]

// TODO(verify): 공식 result API의 순위 페이지네이션 엔드포인트/파라미터를 재확인해 채운다.
//   - 페이지 단위: rank position(예: 1–100, 101–200 …)
//   - 응답 행 필드: { netto, gender, ageClass }
const ENDPOINT = null

async function fetchRankPage(/* event, fromRank, toRank */) {
  if (!ENDPOINT) {
    throw new Error('SCC endpoint 미검증 — providers/scc.mjs의 ENDPOINT/fetchRankPage를 채운 뒤 실행하세요. README 참고.')
  }
  // 검증 후 구현. 행: { netto: "HH:MM:SS", gender: "M"|"W", ageClass?: string }
  return []
}

function aggregateRows(rows, acc) {
  for (const row of rows) {
    const sec = parseNetTimeToSeconds(row.netto)
    if (sec == null) continue
    const gender = normalizeGender(row.gender)
    acc.overall.push(sec)
    if (gender === 'male') acc.male.push(sec)
    else if (gender === 'female') acc.female.push(sec)
  }
}

export async function harvestScc({ minSegment = 200, rankStep = 1000, maxRank = 60000 } = {}) {
  const out = {}
  for (const event of SCC_EVENTS) {
    const acc = { overall: [], male: [], female: [] }
    for (let from = 1; from <= maxRank; from += rankStep) {
      const rows = await fetchRankPage(event, from, from + rankStep - 1)
      if (!rows.length) break // 순위 끝
      aggregateRows(rows, acc)
    }
    out[event.key] = {
      sampleSize: acc.overall.length,
      percentileCutsSec: percentileCuts(acc.overall),
      genderDistribution: {
        ...(acc.male.length >= minSegment ? { male: { sampleSize: acc.male.length, cuts: percentileCuts(acc.male) } } : {}),
        ...(acc.female.length >= minSegment ? { female: { sampleSize: acc.female.length, cuts: percentileCuts(acc.female) } } : {})
      }
    }
  }
  return out
}
