/** slug 마지막 세그먼트 → 표시용 이름 (예: frost-venom-dart → Frost Venom Dart) */
export function itemDisplayNameFromSlug(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null

  const leaf = slug.trim().replace(/\\/g, '/').split('/').pop()
  if (!leaf) return null

  return leaf
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
