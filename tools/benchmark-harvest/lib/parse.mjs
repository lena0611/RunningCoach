// 대회 기록 시간 문자열을 초로 파싱한다.
// 관측된 포맷: "02:58:25.59"(HH:MM:SS.cs), "00:42:30.5", "1:23:45", "42:30"(MM:SS).
// 파싱 불가/빈값/null 문자열이면 null.

/**
 * @param {unknown} raw
 * @returns {number|null} 정수 초 또는 null
 */
export function parseNetTimeToSeconds(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s || s.toLowerCase() === 'null') return null
  const parts = s.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((x) => !Number.isFinite(x))) return null
  const seconds = nums.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1]
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.round(seconds)
}

/** 성별 문자열을 male/female/other로 정규화. 대회 응답은 "M"/"F"가 일반적. */
export function normalizeGender(raw) {
  if (raw == null) return 'other'
  const s = String(raw).trim().toUpperCase()
  if (s === 'M' || s === 'MALE' || s === '남' || s === '남자') return 'male'
  if (s === 'F' || s === 'W' || s === 'FEMALE' || s === '여' || s === '여자') return 'female'
  return 'other'
}
