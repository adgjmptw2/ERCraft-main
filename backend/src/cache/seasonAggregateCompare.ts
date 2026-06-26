import type {
  PlayerSeasonAggregateContract,
  SeasonAggregateCacheStatus,
} from '../contracts/player.js'

function nullableMetric(value: number | null | undefined): number {
  return value ?? -1
}

export function seasonAggregateCharacterGamesSum(
  aggregate: PlayerSeasonAggregateContract,
): number {
  return aggregate.characterStats.reduce((sum, row) => sum + row.games, 0)
}

/** collectedGames만 늘고 rp/character가 줄면 downgrade */
export function seasonAggregateIsDowngrade(
  next: PlayerSeasonAggregateContract,
  current: PlayerSeasonAggregateContract,
): boolean {
  if (current.rpSeries.length > 0 && next.rpSeries.length === 0) return true
  if (current.characterStats.length > 0 && next.characterStats.length === 0) return true

  const currentGames = seasonAggregateCharacterGamesSum(current)
  const nextGames = seasonAggregateCharacterGamesSum(next)
  if (
    current.characterStats.length > 0 &&
    next.characterStats.length < current.characterStats.length &&
    nextGames < currentGames
  ) {
    return true
  }

  const currentCollected = nullableMetric(current.coverage?.collectedGames)
  const nextCollected = nullableMetric(next.coverage?.collectedGames)
  if (
    nextCollected > currentCollected &&
    current.rpSeries.length > 0 &&
    next.rpSeries.length < current.rpSeries.length
  ) {
    return true
  }

  if (
    nextCollected > currentCollected &&
    current.rpSeries.length > 0 &&
    next.rpSeries.length === 0
  ) {
    return true
  }

  return false
}

export function seasonAggregateCacheStatusRank(
  status: SeasonAggregateCacheStatus,
): number {
  switch (status) {
    case 'warming':
      return 0
    case 'partial':
    case 'stale':
      return 1
    case 'ready':
      return 2
    default:
      return 0
  }
}

export function seasonAggregateHasMoreInformation(
  next: PlayerSeasonAggregateContract,
  current: PlayerSeasonAggregateContract,
): boolean {
  if (seasonAggregateIsDowngrade(next, current)) return false

  return (
    next.characterStats.length > current.characterStats.length ||
    next.rpSeries.length > current.rpSeries.length ||
    seasonAggregateCharacterGamesSum(next) > seasonAggregateCharacterGamesSum(current) ||
    nullableMetric(next.coverage?.rpPointCount) >
      nullableMetric(current.coverage?.rpPointCount) ||
    (
      nullableMetric(next.coverage?.collectedGames) >
        nullableMetric(current.coverage?.collectedGames) &&
      (
        next.rpSeries.length >= current.rpSeries.length ||
        next.characterStats.length >= current.characterStats.length
      )
    ) ||
    nullableMetric(next.coverage?.officialSeasonGames) >
      nullableMetric(current.coverage?.officialSeasonGames)
  )
}

/** HTTP 응답 — downgrade rebuild는 기존 cache body 우선 */
export function pickSeasonAggregateResponseBody(
  candidate: PlayerSeasonAggregateContract,
  existing: PlayerSeasonAggregateContract,
): PlayerSeasonAggregateContract {
  if (seasonAggregateIsDowngrade(candidate, existing)) return existing
  if (seasonAggregateHasMoreInformation(candidate, existing)) return candidate
  return existing
}

/** 기존 캐시가 더 풍부하면 partial/작은 aggregate로 덮어쓰지 않는다 */
export function seasonAggregateShouldReplaceCache(
  next: PlayerSeasonAggregateContract,
  existing: PlayerSeasonAggregateContract,
): boolean {
  const nextRank = seasonAggregateCacheStatusRank(next.cacheStatus)
  const existingRank = seasonAggregateCacheStatusRank(existing.cacheStatus)

  if (nextRank < existingRank) return false
  if (seasonAggregateHasMoreInformation(existing, next)) return false
  if (seasonAggregateHasMoreInformation(next, existing)) return true
  if (nextRank > existingRank) return true
  return true
}

export type SeasonAggregateWriteSkipReason =
  | 'existing-cache-status-higher'
  | 'existing-more-characters'
  | 'existing-more-games'
  | 'existing-more-collected-games'
  | 'existing-more-information'

export function seasonAggregateWriteSkipReason(
  next: PlayerSeasonAggregateContract,
  existing: PlayerSeasonAggregateContract,
): SeasonAggregateWriteSkipReason | null {
  if (seasonAggregateShouldReplaceCache(next, existing)) return null

  const nextRank = seasonAggregateCacheStatusRank(next.cacheStatus)
  const existingRank = seasonAggregateCacheStatusRank(existing.cacheStatus)
  if (nextRank < existingRank) return 'existing-cache-status-higher'
  if (existing.characterStats.length > next.characterStats.length) {
    return 'existing-more-characters'
  }
  if (seasonAggregateCharacterGamesSum(existing) > seasonAggregateCharacterGamesSum(next)) {
    return 'existing-more-games'
  }
  if (
    nullableMetric(existing.coverage?.collectedGames) >
    nullableMetric(next.coverage?.collectedGames)
  ) {
    return 'existing-more-collected-games'
  }
  return 'existing-more-information'
}
