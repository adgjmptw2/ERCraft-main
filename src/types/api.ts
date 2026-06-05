export type DataSource = 'external' | 'cache'

export type ApiErrorCode =
  | 'PLAYER_NOT_FOUND'
  | 'NOT_IMPLEMENTED'
  | 'UNAUTHORIZED'
  | 'DUPLICATE_FAVORITE'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'

export interface ApiResult<T> {
  data: T
  source: DataSource
  refreshedAt: string
}
