// B.A.A.(보스턴) 공식 결과 수집기 — 스캐폴드.
//
// 상태: 집계 파이프라인은 완성되어 있고, 출처별 HTTP 페이지네이션(fetchResultsPage)만
//       공개 API 형태를 재확인해 채우면 바로 동작한다. 현재 ENDPOINT가 미검증이라
//       harvestBaa()는 명시적으로 막아 둔다(거짓 데이터 방지). 국제 대회 재수집은 보류 상태.
//
// 알려진 접근(기존 스냅샷 method 메모 기준):
//   "B.A.A. official race_results public DB. 숫자 bib 완주자의 ChipFinish만 Range 페이지네이션으로 집계."
//   - 결과는 공식 race_results 공개 DB(검색/페이지네이션). bib 범위(Range)로 페이지를 넘긴다.
//   - 완주자 필터: 숫자 bib + ChipFinish(net) 존재. ChipFinish가 net time.
//   - 행에 gender, age division(예: M40-44)이 있어 → 성별/나이대 축 모두 가능(나이대는 현재 scope 보류).
//
// 대상 스냅샷: baa-10k-2025-10k, baa-half-2025-half, boston-marathon-2026-marathon.

import { parseNetTimeToSeconds, normalizeGender } from '../lib/parse.mjs'
import { percentileCuts } from '../lib/percentiles.mjs'

export const BAA_EVENTS = [
  { key: 'baa-10k-2025-10k', label: 'B.A.A. 10K 2025', distanceKm: 10 },
  { key: 'baa-half-2025-half', label: 'B.A.A. Half 2025', distanceKm: 21.0975 },
  { key: 'boston-marathon-2026-marathon', label: 'Boston Marathon 2026', distanceKm: 42.195 }
]

// TODO(verify): 공식 결과 DB의 페이지네이션 엔드포인트/파라미터를 브라우저 네트워크 탭으로 재확인해 채운다.
//   - 페이지 단위: bib Range (예: 1–1000, 1001–2000 …)
//   - 응답 행 필드: { bib, chipFinish, gender, ageDivision }
const ENDPOINT = null

/**
 * 한 페이지(bib range)를 가져와 행 배열을 돌려준다. 미검증이므로 현재는 throw.
 * 검증 후 구현 예: fetch(`${ENDPOINT}?eventId=..&from=${from}&to=${to}`) → rows.
 */
async function fetchResultsPage(/* event, from, to */) {
  if (!ENDPOINT) {
    throw new Error('BAA endpoint 미검증 — providers/baa.mjs의 ENDPOINT/fetchResultsPage를 채운 뒤 실행하세요. README 참고.')
  }
  // 검증 후 구현. 행: { chipFinish: "HH:MM:SS", gender: "M"|"W", ageDivision?: string }
  return []
}

/** 행 → 집계. 원본 행은 누적 후 버린다(보관 금지). */
function aggregateRows(rows, acc) {
  for (const row of rows) {
    const sec = parseNetTimeToSeconds(row.chipFinish)
    if (sec == null) continue // 숫자 bib + ChipFinish 없는 행(미완주/비순위) 제외
    const gender = normalizeGender(row.gender)
    acc.overall.push(sec)
    if (gender === 'male') acc.male.push(sec)
    else if (gender === 'female') acc.female.push(sec)
  }
}

export async function harvestBaa({ minSegment = 200, bibRangeStep = 1000, maxBib = 60000 } = {}) {
  const out = {}
  for (const event of BAA_EVENTS) {
    const acc = { overall: [], male: [], female: [] }
    for (let from = 1; from <= maxBib; from += bibRangeStep) {
      const rows = await fetchResultsPage(event, from, from + bibRangeStep - 1)
      if (!rows.length) continue
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
