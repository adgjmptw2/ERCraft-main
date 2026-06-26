import type { PrismaClient } from '@prisma/client'
import type { FastifyBaseLogger } from 'fastify'

import { deleteSeasonAggregateCache } from './seasonAggregateCache.js'
import { deleteSeasonStatsCache } from './seasonStatsCache.js'
import { matchesCacheId, type MatchesCacheMode } from './matchesCache.js'
import { isPrismaPlayerMatchReady } from './playerMatchStore.js'
import {
  readRecentMatchFreshnessState,
  recordRecentMatchCheckFailure,
  recordRecentMatchCheckSuccess,
} from './profileRefreshState.js'
import { wasEntryRecentlyVerifiedFresh } from './profileEntryPeekCache.js'
import {
  isRecentMatchCheckInCooldown,
  isRecentMatchCheckStale,
  resolveRecentMatchCheckTtlMs,
  resolveRecentMatchFailureCooldownMs,
} from './recentMatchFreshnessConfig.js'

export type RecentMatchCheckScheduleStatus =
  | 'skipped-explicit-refresh'
  | 'skipped-no-profile-cache'
  | 'skipped-fresh'
  | 'skipped-cooldown'
  | 'skipped-inflight'
  | 'scheduled'

export interface RecentMatchCheckScheduleResult {
  status: RecentMatchCheckScheduleStatus
}

export interface RecentMatchFreshnessCollectResult {
  newMatchCount: number
  pagesFetched: number
  detailFetchCount: number
}

export interface RecentMatchFreshnessDeps {
  prisma: PrismaClient
  logger: FastifyBaseLogger
  nickname?: string
  canonicalUid: string
  hasProfileCache: boolean
  explicitRefresh: boolean
  now?: Date
  ttlMs?: number
  failureCooldownMs?: number
  collectRecentMatches: () => Promise<RecentMatchFreshnessCollectResult>
  applyNewMatches: (newMatchCount: number) => Promise<void>
}

const inflight = new Map<string, Promise<unknown>>()

export function recentMatchFreshnessKey(canonicalUid: string): string {
  return canonicalUid
}

export function resetRecentMatchFreshnessInflightForTests(): void {
  inflight.clear()
}

export function isRecentMatchFreshnessInflight(canonicalUid: string): boolean {
  return inflight.has(recentMatchFreshnessKey(canonicalUid))
}

export async function coordinateFreshnessWork<T>(
  canonicalUid: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = recentMatchFreshnessKey(canonicalUid)
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing
  const promise = work().finally(() => {
    if (inflight.get(key) === promise) {
      inflight.delete(key)
    }
  })
  inflight.set(key, promise)
  return promise
}

export async function readRecentMatchCheckStatus(
  prisma: PrismaClient,
  canonicalUid: string,
  options?: { now?: Date; ttlMs?: number },
): Promise<{ lastCheckedAt: Date | null; stale: boolean; inCooldown: boolean }> {
  const now = options?.now ?? new Date()
  const ttlMs = options?.ttlMs ?? resolveRecentMatchCheckTtlMs()
  const state = await readRecentMatchFreshnessState(prisma, canonicalUid)
  return {
    lastCheckedAt: state?.lastCheckedAt ?? null,
    stale: isRecentMatchCheckStale(state?.lastCheckedAt, now, ttlMs),
    inCooldown: isRecentMatchCheckInCooldown(state?.nextRetryAt, now),
  }
}

function logFreshnessSchedule(
  deps: RecentMatchFreshnessDeps,
  status: RecentMatchCheckScheduleStatus,
): void {
  deps.logger.info(
    {
      nickname: deps.nickname,
      canonicalUid: deps.canonicalUid,
      freshnessKey: recentMatchFreshnessKey(deps.canonicalUid),
      inflightKey: recentMatchFreshnessKey(deps.canonicalUid),
      scheduleStatus: status,
    },
    'recent match freshness schedule',
  )
}

export async function prepareRecentMatchFreshnessCheck(
  deps: RecentMatchFreshnessDeps,
): Promise<RecentMatchCheckScheduleResult> {
  if (deps.explicitRefresh) {
    const result = { status: 'skipped-explicit-refresh' as const }
    logFreshnessSchedule(deps, result.status)
    return result
  }
  if (!deps.hasProfileCache || !isPrismaPlayerMatchReady(deps.prisma)) {
    const result = { status: 'skipped-no-profile-cache' as const }
    logFreshnessSchedule(deps, result.status)
    return result
  }

  const key = recentMatchFreshnessKey(deps.canonicalUid)
  if (inflight.has(key)) {
    const result = { status: 'skipped-inflight' as const }
    logFreshnessSchedule(deps, result.status)
    return result
  }

  const now = deps.now ?? new Date()
  const ttlMs = deps.ttlMs ?? resolveRecentMatchCheckTtlMs()
  const state = await readRecentMatchFreshnessState(deps.prisma, deps.canonicalUid)

  if (isRecentMatchCheckInCooldown(state?.nextRetryAt, now)) {
    const result = { status: 'skipped-cooldown' as const }
    logFreshnessSchedule(deps, result.status)
    return result
  }

  if (!isRecentMatchCheckStale(state?.lastCheckedAt, now, ttlMs)) {
    const result = { status: 'skipped-fresh' as const }
    logFreshnessSchedule(deps, result.status)
    return result
  }
  if (wasEntryRecentlyVerifiedFresh(deps.canonicalUid, now)) {
    const result = { status: 'skipped-fresh' as const }
    logFreshnessSchedule(deps, result.status)
    return result
  }

  const run = coordinateFreshnessWork(deps.canonicalUid, async () => {
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    await runRecentMatchFreshnessCheck(deps)
  })
  void run

  const result = { status: 'scheduled' as const }
  logFreshnessSchedule(deps, result.status)
  return result
}

export async function runRecentMatchFreshnessCheck(
  deps: RecentMatchFreshnessDeps,
  options?: { force?: boolean },
): Promise<RecentMatchFreshnessCollectResult | null> {
  const now = deps.now ?? new Date()
  const ttlMs = deps.ttlMs ?? resolveRecentMatchCheckTtlMs()
  const failureCooldownMs = deps.failureCooldownMs ?? resolveRecentMatchFailureCooldownMs()
  const state = await readRecentMatchFreshnessState(deps.prisma, deps.canonicalUid)
  const force = options?.force === true

  if (!force && isRecentMatchCheckInCooldown(state?.nextRetryAt, now)) {
    return null
  }
  if (!force && !isRecentMatchCheckStale(state?.lastCheckedAt, now, ttlMs)) {
    return null
  }

  try {
    const collected = await deps.collectRecentMatches()
    if (collected.newMatchCount > 0) {
      await deps.applyNewMatches(collected.newMatchCount)
    }
    await recordRecentMatchCheckSuccess(deps.prisma, deps.canonicalUid, now)
    deps.logger.info(
      {
        nickname: deps.nickname,
        canonicalUid: deps.canonicalUid,
        freshnessKey: recentMatchFreshnessKey(deps.canonicalUid),
        newMatchCount: collected.newMatchCount,
        pagesFetched: collected.pagesFetched,
        detailFetchCount: collected.detailFetchCount,
      },
      'recent match freshness check completed',
    )
    return collected
  } catch (err) {
    await recordRecentMatchCheckFailure(
      deps.prisma,
      deps.canonicalUid,
      now,
      failureCooldownMs,
    )
    deps.logger.warn(
      {
        err,
        nickname: deps.nickname,
        canonicalUid: deps.canonicalUid,
        freshnessKey: recentMatchFreshnessKey(deps.canonicalUid),
        failureCooldownMs,
      },
      'recent match freshness check failed',
    )
    return null
  }
}

const MATCHES_CACHE_MODES: MatchesCacheMode[] = ['all', 'rank', 'normal', 'cobalt', 'union']

export async function invalidateStoredMatchesCache(
  prisma: PrismaClient,
  uid: string,
): Promise<void> {
  for (const mode of MATCHES_CACHE_MODES) {
    try {
      await prisma.matchesCache.delete({ where: { id: matchesCacheId(uid, mode) } })
    } catch {
      // row may not exist
    }
  }
}

export async function invalidateProfileRefreshDbCaches(
  prisma: PrismaClient,
  params: { canonicalUid: string; apiSeasonId: number },
): Promise<{ statsInvalidated: boolean; aggregateInvalidated: boolean }> {
  const [statsInvalidated, aggregateInvalidated] = await Promise.all([
    deleteSeasonStatsCache(prisma, params.canonicalUid, params.apiSeasonId),
    deleteSeasonAggregateCache(prisma, params.canonicalUid, params.apiSeasonId),
    invalidateStoredMatchesCache(prisma, params.canonicalUid),
  ])
  return { statsInvalidated, aggregateInvalidated }
}
