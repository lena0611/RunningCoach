// 가벼운 fetch 헬퍼: 타임아웃 + 재시도 + 동시성 풀.
// 외부 공개 API를 정중하게(동시성 제한·백오프) 순회하기 위한 최소 구현.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * JSON GET. 404/500(존재하지 않거나 잘못된 레코드)은 null로 돌려 호출부가 skip하게 한다.
 * 네트워크 오류는 retries회까지 백오프 재시도, 끝내 실패하면 null.
 * @returns {Promise<any|null>}
 */
export async function fetchJson(url, { timeoutMs = 10000, retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      let res
      try {
        res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } })
      } finally {
        clearTimeout(timer)
      }
      if (res.status === 404 || res.status === 500) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch {
        return null // HTML(SPA fallthrough) 등 비JSON 응답
      }
    } catch {
      if (attempt === retries) return null
      await sleep(300 * (attempt + 1))
    }
  }
  return null
}

/**
 * 동시성 제한 워커 풀. items 각각에 worker(item, idx)를 실행하고 결과 배열을 돌려준다.
 * @template T,R
 * @param {T[]} items
 * @param {(item:T, idx:number)=>Promise<R>} worker
 * @param {number} concurrency
 * @returns {Promise<R[]>}
 */
export async function pool(items, worker, concurrency = 16) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const idx = cursor
      cursor += 1
      results[idx] = await worker(items[idx], idx)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, run)
  await Promise.all(workers)
  return results
}
