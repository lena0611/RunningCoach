/**
 * 로컬 캐시의 주인 표시 (#878 B3).
 *
 * 메모리·런 기록·대회 결과 같은 캐시가 계정 구분 없이 localStorage 에 남아 있었다. 그래서 한 기기를
 * 두 사람이 쓰면 ① 로그아웃해도 앞 사람 목표·부상이 다음 계정 화면에 잠깐 보였고 ② 메모리 불러오기가
 * 실패하면 앞 사람 메모리가 그대로 새 계정 행에 저장될 수 있었다(memoryStore.load 실패 → 캐시 유지 → update).
 *
 * 규칙: 캐시를 쓰는 사람의 uid 를 표시해 두고, 다른 사람이 들어오면 로그인 토큰만 남기고 비운다.
 * - '' = 비어 있는 깨끗한 상태(로그아웃 직후·로그아웃 상태로 켬). 여기서 처음 로그인하면 표시만 남긴다(새로고침 없음).
 * - 표시가 없음(null) = 이 기능 이전 기기. 누구 것인지 모르니 비운다(앱 시작 시 1회).
 */
const OWNER_KEY = 'pacelab.cacheOwner'

function isAuthTokenKey(key: string): boolean {
  return key.includes('auth-token')
}

/** 로그인 토큰을 뺀 로컬 캐시를 모두 지운다. sessionStorage 는 건드리지 않는다(새 배포 새로고침 가드가 있다). */
export function clearUserLocalCache(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!isAuthTokenKey(key)) localStorage.removeItem(key)
    }
  } catch {
    /* 저장소 접근이 막힌 환경 — 캐시가 없으니 샐 것도 없다 */
  }
}

function setOwner(owner: string): void {
  try {
    localStorage.setItem(OWNER_KEY, owner)
  } catch {
    /* 위와 같음 */
  }
}

/**
 * 지금 로그인한 사람(uid, 로그아웃이면 null)에게 캐시를 맞춘다. 비웠으면 true —
 * 앱이 이미 떠 있으면(스토어가 앞 사람 데이터를 들고 있으면) 호출한 쪽이 새로고침해야 한다.
 */
export function claimLocalCacheFor(userId: string | null): boolean {
  let owner: string | null = null
  try {
    owner = localStorage.getItem(OWNER_KEY)
  } catch {
    return false
  }
  if (userId === null) {
    if (owner === '') return false
    clearUserLocalCache()
    setOwner('')
    return true
  }
  if (owner === userId) return false
  if (owner === '') {
    setOwner(userId)
    return false
  }
  clearUserLocalCache()
  setOwner(userId)
  return true
}

/** 로그아웃 — 캐시를 비우고 '깨끗함'으로 표시한다. */
export function releaseLocalCache(): void {
  clearUserLocalCache()
  setOwner('')
}
