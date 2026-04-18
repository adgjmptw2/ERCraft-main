export type DataSource = 'external' | 'cache'

export interface ApiResult<T> {
  data: T
  source: DataSource
  refreshedAt: string
}
