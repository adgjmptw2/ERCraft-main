import type { PlayerSeasonsResponse } from '@/types/season'

/** 과거·현재 시즌 응답을 seasonNumber 기준으로 병합 */
export function mergeSeasonsResponses(
  past: PlayerSeasonsResponse | undefined,
  current: PlayerSeasonsResponse | undefined,
): PlayerSeasonsResponse | undefined {
  if (!past && !current) return undefined
  if (!past) return current
  if (!current) return past

  const bySeason = new Map(
    [...past.seasons, ...current.seasons].map((season) => [season.seasonNumber, season]),
  )

  return {
    currentSeason: current.currentSeason ?? past.currentSeason,
    seasons: [...bySeason.values()].sort((a, b) => a.seasonNumber - b.seasonNumber),
  }
}
