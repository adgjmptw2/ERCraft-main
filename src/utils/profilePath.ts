/** 프로필 라우트 — main.tsx 기준 `/player/:nickname` (singular) */

export function parseProfileUserNumParam(raw: string | null): number | undefined {
  if (!raw) return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined
  return parsed
}

export function buildPlayerProfilePath(nickname: string): string {
  const term = nickname.trim()
  if (!term) return '/'
  return `/player/${encodeURIComponent(term)}`
}

/** URL param → 닉네임 (이중 인코딩 방지) */
export function parsePlayerNicknameParam(raw: string | undefined): string {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}
