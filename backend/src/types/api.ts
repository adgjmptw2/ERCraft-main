export type ApiDataSource = 'external' | 'cache'

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
  source: ApiDataSource
  refreshedAt: string
}

export function apiResult<T>(data: T, source: ApiDataSource = 'external'): ApiResult<T> {
  return {
    data,
    source,
    refreshedAt: new Date().toISOString(),
  }
}
