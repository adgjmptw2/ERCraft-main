export type DataSource = 'external' | 'cache'

export type ApiErrorCode =
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_IDENTITY_MISMATCH'
  | 'NOT_IMPLEMENTED'
  | 'UNAUTHORIZED'
  | 'DUPLICATE_FAVORITE'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'

export interface MatchDetailFetchMeta {
  cacheHit: boolean
  inflightShared: boolean
  queuedMs: number
  upstreamMs: number
  waitMs: number
}

export interface ProfileRefreshMeta {
  rankUpdated: boolean
  cobaltUpdated?: boolean
  normalUpdated?: boolean
  latestGameIdBefore: string | null
  latestGameIdAfter: string | null
  upstreamLatestGameId?: string | null
  dbLatestGameIdBefore?: string | null
  dbLatestGameIdAfter?: string | null
  gamesFetched: number
  newGamesInserted: number
  newGamesDiscovered?: number
  matchDetailsFetched?: number
  playerMatchesInserted?: number
  playerMatchesUpdated?: number
  requestedPlayerMissingCount?: number
  matchesUpdated: boolean
  statsInvalidated: boolean
  statsRebuilt?: boolean
  aggregateInvalidated: boolean
  aggregateRebuilt?: boolean
  snapshotInvalidatedOrRebuilt: boolean
  refreshCompletedAt: string
  coreRefreshCompleted?: boolean
  backgroundRefreshPending?: boolean
  skipReason?:
    | 'no-new-games'
    | 'already-ingested'
    | 'upstream-game-list-stale'
    | 'detail-fetch-failed'
    | 'player-match-upsert-failed'
    | 'aggregate-refresh-failed'
  partialFailure?: string
}

export type ProfileEntryFreshnessStatus =
  | 'already-fresh'
  | 'collected'
  | 'upstream-game-list-stale'
  | 'skipped-no-profile-cache'
  | 'skipped-inflight'
  | 'failed'

export interface ProfileEntryFreshnessResult extends ProfileRefreshMeta {
  status: ProfileEntryFreshnessStatus
  upstreamLatestGameId: string | null
}

export interface ApiResult<T> {
  data: T
  source: DataSource
  refreshedAt: string
  fetchMeta?: MatchDetailFetchMeta
  profileRefresh?: ProfileRefreshMeta
}
