export type ApiDataSource = 'external' | 'cache'

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
  latestGameIdBefore: string | null
  latestGameIdAfter: string | null
  gamesFetched: number
  newGamesInserted: number
  matchesUpdated: boolean
  statsInvalidated: boolean
  aggregateInvalidated: boolean
  snapshotInvalidatedOrRebuilt: boolean
  refreshCompletedAt: string
  skipReason?:
    | 'no-new-games'
    | 'already-ingested'
    | 'upstream-game-list-stale'
    | 'detail-fetch-failed'
    | 'player-match-upsert-failed'
    | 'aggregate-refresh-failed'
  partialFailure?: string
}

export interface ApiResult<T> {
  data: T
  source: ApiDataSource
  refreshedAt: string
  fetchMeta?: MatchDetailFetchMeta
  profileRefresh?: ProfileRefreshMeta
}

export function apiResult<T>(
  data: T,
  source: ApiDataSource = 'external',
  options?: MatchDetailFetchMeta | { fetchMeta?: MatchDetailFetchMeta; profileRefresh?: ProfileRefreshMeta },
): ApiResult<T> {
  const fetchMeta =
    options && 'cacheHit' in options
      ? options
      : options?.fetchMeta
  const profileRefresh =
    options && 'profileRefresh' in options ? options.profileRefresh : undefined
  return {
    data,
    source,
    refreshedAt: new Date().toISOString(),
    ...(fetchMeta ? { fetchMeta } : {}),
    ...(profileRefresh ? { profileRefresh } : {}),
  }
}
