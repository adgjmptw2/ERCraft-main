import { AsyncLocalStorage } from 'node:async_hooks'

export interface BserMetricsStore {
  requestCount: number
}

export const bserMetricsStorage = new AsyncLocalStorage<BserMetricsStore>()

export function runWithBserMetrics<T>(fn: () => Promise<T>): Promise<T> {
  return bserMetricsStorage.run({ requestCount: 0 }, fn)
}

export function incrementBserRequestCount(): void {
  const store = bserMetricsStorage.getStore()
  if (store) store.requestCount += 1
}

export function getBserRequestCount(): number {
  return bserMetricsStorage.getStore()?.requestCount ?? 0
}
