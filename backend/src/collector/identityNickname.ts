/** Shared nickname normalization for identity grouping. */
export function normalizeIdentityNickname(nickname: string): string | null {
  const trimmed = nickname.normalize('NFKC').trim()
  if (!trimmed) return null
  const key = trimmed.toLowerCase()
  if (key.length < 2) return null
  return key
}

export function displayIdentityNickname(nickname: string): string {
  return nickname.normalize('NFKC').trim()
}
