import type { FastifyBaseLogger } from 'fastify'

import type { FullBackfillStoppedReason } from '../cache/playerMatchBackfill.js'
import { getBserRequestCount } from '../external/bserMetrics.js'
import type { ApiDataSource } from '../types/api.js'

export type MatchesStoppedReason =
  | 'cache-satisfied'
  | 'duplicate-game'
  | 'season-boundary'
  | 'upstream-exhausted'
  | 'max-pages'

export interface PlayerRouteMetricsExtra {
  seasonsFrom?: number
  seasonsTo?: number
  matchesPage?: number
  matchesPageSize?: number
  cacheHits?: string[]
  cacheMisses?: string[]
  uidCache?: 'hit' | 'miss' | 'inflight' | 'explicit' | 'userNum-ignored' | 'userNum-binding' | 'userNum-unbound' | 'bser-nickname'
  uidCacheCanonicalSwap?: boolean
  canonicalUidReason?: string
  canonicalBserUid?: string
  rankCache?: 'hit' | 'miss' | 'inflight'
  matchesNeeded?: number
  matchesFetchedPages?: number
  matchesStoppedReason?: MatchesStoppedReason
  matchesSource?: 'memory' | 'db' | 'bser'
  staticCharacterNames?: 'cached' | 'fallback' | 'prewarm'
  staticSeasonCatalog?: 'cached' | 'fallback' | 'prewarm'
  aggregateCacheStatus?: string
  aggregateSource?: string
  aggregateCharacterCount?: number
  aggregateRpPointCount?: number
  aggregateIsRefreshing?: boolean
  aggregateRefreshEnqueued?: boolean
  aggregateRefreshInFlight?: boolean
  aggregateRefreshReason?: string
  aggregateRefreshSkipped?: boolean
  aggregateRefreshSkipReason?: string
  aggregateRefreshMaxPages?: number
  aggregateRefreshPagesCollected?: number
  aggregateRefreshStoppedReason?: MatchesStoppedReason
  aggregateRefreshDurationMs?: number
  aggregateCoverageRatio?: number | null
  aggregateCollectedGames?: number | null
  aggregateOfficialSeasonGames?: number | null
  playerMatchStoreReady?: boolean
  playerMatchUpsertCount?: number
  playerMatchUpsertSkipped?: number
  playerMatchDuplicateHit?: number
  playerMatchUpsertFailed?: boolean
  playerMatchReadCount?: number
  playerMatchReadSource?: 'db' | 'db-after-refresh' | 'fallback-cache' | 'external'
  playerMatchDbSatisfied?: boolean
  playerMatchDbCount?: number
  playerMatchDbNeeded?: number
  playerMatchDbMissReason?: string
  playerMatchDetailMissing?: number
  playerMatchDetailRepairAttempted?: boolean
  playerMatchDetailRepairUpdated?: number
  playerMatchDetailRepairFailed?: boolean
  upstreamLatestGameId?: string | null
  dbLatestGameIdBefore?: string | null
  dbLatestGameIdAfter?: string | null
  rankRefreshCollected?: boolean
  cobaltRefreshCollected?: boolean
  normalRefreshCollected?: boolean
  aggregateInputSource?: 'playerMatch' | 'matchesCache'
  aggregatePlayerMatchCount?: number
  aggregatePlayerMatchUsed?: boolean
  aggregatePlayerMatchRebuild?: boolean
  aggregatePlayerMatchFallbackReason?: string
  fullBackfillStarted?: boolean
  fullBackfillInFlight?: boolean
  fullBackfillPagesFetched?: number
  fullBackfillMatchesUpserted?: number
  fullBackfillRankCountBefore?: number
  fullBackfillRankCountAfter?: number
  fullBackfillOfficialGames?: number | null
  fullBackfillStoppedReason?: FullBackfillStoppedReason
  fullBackfillDurationMs?: number
  fullBackfillRawGamesSeen?: number
  fullBackfillRankGamesSeen?: number
  fullBackfillDuplicateCount?: number
  fullBackfillNonRankCount?: number
  fullBackfillOutOfSeasonCount?: number
  fullBackfillLastCursor?: number
  fullBackfillNextCursor?: number
  fullBackfillLastSeenGameId?: string
  fullBackfillLastSeenSeasonId?: number
  aggregateBasisLabel?: string
  aggregateFullSeasonReady?: boolean
  statsSource?: ApiDataSource
  statsBserCalled?: boolean
  backfillWorkerAction?: string
  backfillStateCreatedBeforeFetch?: boolean
  backfillStaleRunningRecovered?: boolean
  backfillScheduledNextChunk?: boolean
  seasonAggregateWriteSkipped?: boolean
  seasonAggregateWriteSkipReason?: string
  seasonAggregateExistingGames?: number
  seasonAggregateIncomingGames?: number
  analysisBuildMs?: number
  analysisCacheHit?: boolean
}

export function logPlayerRouteMetrics(
  log: FastifyBaseLogger,
  route: string,
  nickname: string,
  startedAt: number,
  extra: PlayerRouteMetricsExtra = {},
): void {
  if (process.env.NODE_ENV === 'production') return

  log.info(
    {
      route,
      nickname,
      durationMs: Date.now() - startedAt,
      bserRequestCount: getBserRequestCount(),
      ...extra,
    },
    'player route',
  )
}
