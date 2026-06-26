export const MATCHES_QUERY_MODES = ['all', 'rank', 'normal', 'cobalt', 'union'] as const

export type MatchesQueryMode = (typeof MATCHES_QUERY_MODES)[number]

export type StoredGameMode = Exclude<MatchesQueryMode, 'all'>

export function isStoredGameMode(value: string): value is StoredGameMode {
  return value === 'rank' || value === 'normal' || value === 'cobalt' || value === 'union'
}

export function isCobaltMode(value: string | null | undefined): boolean {
  return value === 'cobalt'
}

export function isGradeSupportedMode(value: string | null | undefined): value is 'rank' {
  if (isCobaltMode(value)) return false
  return value === 'rank'
}
