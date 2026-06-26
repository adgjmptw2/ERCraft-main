import type { MatchSummaryContract } from '../contracts/player.js'

/** BSER Open API docs (20230724) — matchingMode 2=Normal, 3=Ranked */
export const BSER_MATCHING_MODE_NORMAL = 2
export const BSER_MATCHING_MODE_RANKED = 3

/** Live API + finalInfusion field — Cobalt Protocol (matchingMode 6) */
export const BSER_MATCHING_MODE_COBALT = 6

/**
 * Union Circuit — official Open API matchingMode value 미확인.
 * 확인 전까지 mapper에서 union gameMode를 생성하지 않는다.
 */
export const UNION_MATCHING_MODE_SUPPORTED = false

export function mapBserMatchingModeToGameMode(
  matchingMode: number,
): NonNullable<MatchSummaryContract['gameMode']> {
  switch (matchingMode) {
    case BSER_MATCHING_MODE_RANKED:
      return 'rank'
    case BSER_MATCHING_MODE_COBALT:
      return 'cobalt'
    case BSER_MATCHING_MODE_NORMAL:
    default:
      return 'normal'
  }
}

function isStoredGameMode(value: string): value is NonNullable<MatchSummaryContract['gameMode']> {
  return value === 'rank' || value === 'normal' || value === 'cobalt' || value === 'union'
}

/** DB/캐시 행에서 gameMode 복원 — rank/cobalt matchingMode 우선, 그다음 finalInfusion */
export function resolveStoredMatchGameMode(params: {
  gameMode?: string | null
  matchingMode?: number | null
  hasCobaltInfusions?: boolean
}): NonNullable<MatchSummaryContract['gameMode']> {
  if (params.matchingMode === BSER_MATCHING_MODE_RANKED) {
    return 'rank'
  }
  if (params.matchingMode === BSER_MATCHING_MODE_COBALT) {
    return 'cobalt'
  }

  if (params.hasCobaltInfusions) {
    return 'cobalt'
  }

  if (params.matchingMode === BSER_MATCHING_MODE_NORMAL) {
    return 'normal'
  }

  const stored = params.gameMode?.trim()
  if (stored && isStoredGameMode(stored)) {
    return stored
  }

  return 'normal'
}
