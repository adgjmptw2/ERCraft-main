export type ApiDataSource = 'external' | 'cache'

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
