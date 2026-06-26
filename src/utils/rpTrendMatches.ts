import type { MatchSummary } from '@/types/match'
import { isRankGameMode, resolveGameMode } from '@/utils/gameMode'
import { filterSeasonMatches } from '@/utils/characterStatsFromMatches'

function hasValidRpAfter(match: MatchSummary): boolean {
  return typeof match.rpAfter === 'number' && Number.isFinite(match.rpAfter)
}

/**
 * RP 추이 — 랭크 경기 + rpAfter 있는 것만.
 * 현재 시즌 보기에서는 시즌 필터 없이 BSER 90일 창 전체에서 최근 랭크 N일을 찾는다.
 */
export function selectMatchesForRpTrend<T extends MatchSummary>(
  matches: ReadonlyArray<T>,
  selectedSeason: number,
  currentSeason: number,
): T[] {
  const rankWithRp = matches.filter(
    (match) => hasValidRpAfter(match) && isRankGameMode(resolveGameMode(match)),
  )

  if (selectedSeason === currentSeason) {
    return rankWithRp
  }

  return filterSeasonMatches(rankWithRp, selectedSeason, currentSeason)
}

/** 페이지·아카이브 중복 제거 병합 */
export function mergeLoadedMatchHistory<T extends MatchSummary>(
  paginated: ReadonlyArray<T>,
  archive: ReadonlyArray<T> | undefined,
): T[] {
  const byId = new Map<string, T>()
  for (const match of paginated) {
    byId.set(match.matchId, match)
  }
  if (archive) {
    for (const match of archive) {
      byId.set(match.matchId, match)
    }
  }
  return [...byId.values()]
}
