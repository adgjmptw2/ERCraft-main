import type { FastifyBaseLogger } from 'fastify'

export const SEASON_AGGREGATE_REFRESH_MIN_COOLDOWN_MS = 30_000

export type SeasonAggregateRefreshSkipReason = 'in-flight' | 'recently-started'

export interface SeasonAggregateRefreshJob {
  userNum: number
  uid: string
  apiSeasonId: number
  displaySeasonId: number
  run: () => Promise<void>
  logger?: FastifyBaseLogger
}

export interface SeasonAggregateRefreshEnqueueResult {
  key: string
  enqueued: boolean
  inFlight: boolean
  skipReason?: SeasonAggregateRefreshSkipReason
}

const inFlight = new Map<string, Promise<void>>()
const recentlyStartedAt = new Map<string, number>()

export function seasonAggregateRefreshKey(uid: string, apiSeasonId: number): string {
  return `${uid}:${apiSeasonId}`
}

export function isSeasonAggregateRefreshInFlight(uid: string, apiSeasonId: number): boolean {
  return inFlight.has(seasonAggregateRefreshKey(uid, apiSeasonId))
}

export function enqueueSeasonAggregateRefresh(
  job: SeasonAggregateRefreshJob,
): SeasonAggregateRefreshEnqueueResult {
  const key = seasonAggregateRefreshKey(job.uid, job.apiSeasonId)
  if (inFlight.has(key)) {
    return { key, enqueued: false, inFlight: true, skipReason: 'in-flight' }
  }

  const now = Date.now()
  const startedAt = recentlyStartedAt.get(key)
  if (
    startedAt !== undefined &&
    now - startedAt < SEASON_AGGREGATE_REFRESH_MIN_COOLDOWN_MS
  ) {
    return { key, enqueued: false, inFlight: false, skipReason: 'recently-started' }
  }

  recentlyStartedAt.set(key, now)
  const task = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      void job.run()
        .catch((err) => {
          job.logger?.warn(
            {
              err,
              userNum: job.userNum,
              uid: job.uid,
              apiSeasonId: job.apiSeasonId,
              displaySeasonId: job.displaySeasonId,
            },
            'season aggregate refresh job failed',
          )
        })
        .finally(resolve)
    }, 0)
    timer.unref?.()
  })

  inFlight.set(key, task)
  void task.finally(() => {
    if (inFlight.get(key) === task) {
      inFlight.delete(key)
    }
  })

  return { key, enqueued: true, inFlight: true }
}

export function clearSeasonAggregateRefreshQueueForTests(): void {
  inFlight.clear()
  recentlyStartedAt.clear()
}
