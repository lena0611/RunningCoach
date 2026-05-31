const metropolitanSuffixPattern = /(특별시|광역시|특별자치시)$/
const districtNamePattern = /(구|군)$/

export function formatLocationAddress(address: Record<string, string>) {
  const province = address.province || address.state || address.region || ''
  const city = address.city || address.county || address.town || address.municipality || ''
  const cityLooksLikeDistrict = districtNamePattern.test(city)
  const district = address.borough || address.city_district || address.district || (cityLooksLikeDistrict ? '' : address.suburb) || ''

  const parts: string[] = []
  if (province) parts.push(province)
  const cityIsDuplicate = city && normalizeRegionName(city) === normalizeRegionName(province)
  if (city && !cityIsDuplicate) parts.push(city)
  if (shouldIncludeDistrict(province, city, district)) parts.push(district)
  if (!parts.length && district) parts.push(district)

  return [...new Set(parts.filter(Boolean))].join(' ')
}

function shouldIncludeDistrict(province: string, city: string, district: string) {
  if (!district) return false
  const topLevel = province || city
  return metropolitanSuffixPattern.test(topLevel) || normalizeRegionName(city) === normalizeRegionName(province)
}

function normalizeRegionName(value: string) {
  return value.replace(/\s/g, '')
}
