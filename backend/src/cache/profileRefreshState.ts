import type { PrismaClient } from '@prisma/client'

import { readLatestGameIdForUids } from './playerMatchStore.js'
import {
  resolveRecentMatchFailureCooldownMs,
} from './recentMatchFreshnessConfig.js'

export type ProfileRefreshSkipReason =
  | 'no-new-games'
  | 'already-ingested'
  | 'upstream-game-list-stale'
  | 'detail-fetch-failed'
  | 'player-match-upsert-failed'
  | 'aggregate-refresh-failed'

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
  skipReason?: ProfileRefreshSkipReason
  partialFailure?: string
}

export interface ProfileRefreshMemoryCaches {
  deleteRankKey: (key: string) => void
  deleteUserStatsKey: (key: string) => void
  deleteGamesMemCacheForUid: (uid: string) => void
}

export function invalidateProfileRefreshMemoryCaches(
  caches: ProfileRefreshMemoryCaches,
  params: { profileUid: string; canonicalUid: string; apiSeasonId: number },
): void {
  const keys = new Set([
    `${params.profileUid}:${params.apiSeasonId}`,
    `${params.canonicalUid}:${params.apiSeasonId}`,
  ])
  for (const key of keys) {
    caches.deleteRankKey(key)
    caches.deleteUserStatsKey(key)
  }
  caches.deleteGamesMemCacheForUid(params.canonicalUid)
  if (params.profileUid !== params.canonicalUid) {
    caches.deleteGamesMemCacheForUid(params.profileUid)
  }
}

export function resolveProfileRefreshSkipReason(params: {
  newGamesInserted: number
  gamesFetched: number
  playerMatchUpsertFailed?: boolean
  aggregateRefreshFailed?: boolean
  latestGameIdBefore: string | null
  latestGameIdAfter: string | null
}): ProfileRefreshSkipReason | undefined {
  if (params.playerMatchUpsertFailed) return 'player-match-upsert-failed'
  if (params.aggregateRefreshFailed) return 'aggregate-refresh-failed'
  if (params.newGamesInserted > 0) return undefined
  if (params.gamesFetched === 0) return 'upstream-game-list-stale'
  if (
    params.latestGameIdBefore != null &&
    params.latestGameIdAfter != null &&
    params.latestGameIdBefore === params.latestGameIdAfter
  ) {
    return 'no-new-games'
  }
  return 'already-ingested'
}

export async function readProfileLatestGameId(
  prisma: PrismaClient,
  playerMatchUids: string[],
): Promise<string | null> {
  return readLatestGameIdForUids(prisma, playerMatchUids)
}

export function buildProfileRefreshMeta(params: {
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
  statsInvalidated: boolean
  statsRebuilt?: boolean
  aggregateInvalidated: boolean
  aggregateRebuilt?: boolean
  snapshotInvalidatedOrRebuilt: boolean
  playerMatchUpsertFailed?: boolean
  aggregateRefreshFailed?: boolean
  partialFailure?: string
  refreshCompletedAt?: Date
  coreRefreshCompleted?: boolean
  backgroundRefreshPending?: boolean
}): ProfileRefreshMeta {
  const skipReason = resolveProfileRefreshSkipReason({
    newGamesInserted: params.newGamesInserted,
    gamesFetched: params.gamesFetched,
    playerMatchUpsertFailed: params.playerMatchUpsertFailed,
    aggregateRefreshFailed: params.aggregateRefreshFailed,
    latestGameIdBefore: params.latestGameIdBefore,
    latestGameIdAfter: params.latestGameIdAfter,
  })
  return {
    rankUpdated: params.rankUpdated,
    cobaltUpdated: params.cobaltUpdated ?? params.rankUpdated,
    normalUpdated: params.normalUpdated ?? params.rankUpdated,
    latestGameIdBefore: params.latestGameIdBefore,
    latestGameIdAfter: params.latestGameIdAfter,
    upstreamLatestGameId: params.upstreamLatestGameId ?? null,
    dbLatestGameIdBefore: params.dbLatestGameIdBefore ?? params.latestGameIdBefore,
    dbLatestGameIdAfter: params.dbLatestGameIdAfter ?? params.latestGameIdAfter,
    gamesFetched: params.gamesFetched,
    newGamesInserted: params.newGamesInserted,
    newGamesDiscovered: params.newGamesDiscovered ?? params.newGamesInserted,
    matchDetailsFetched: params.matchDetailsFetched ?? 0,
    playerMatchesInserted: params.playerMatchesInserted ?? params.newGamesInserted,
    playerMatchesUpdated: params.playerMatchesUpdated ?? 0,
    requestedPlayerMissingCount: params.requestedPlayerMissingCount ?? 0,
    matchesUpdated: params.newGamesInserted > 0,
    statsInvalidated: params.statsInvalidated,
    statsRebuilt: params.statsRebuilt ?? params.statsInvalidated,
    aggregateInvalidated: params.aggregateInvalidated,
    aggregateRebuilt: params.aggregateRebuilt ?? params.aggregateInvalidated,
    snapshotInvalidatedOrRebuilt: params.snapshotInvalidatedOrRebuilt,
    refreshCompletedAt: (params.refreshCompletedAt ?? new Date()).toISOString(),
    coreRefreshCompleted: params.coreRefreshCompleted ?? true,
    backgroundRefreshPending: params.backgroundRefreshPending ?? false,
    ...(skipReason ? { skipReason } : {}),
    ...(params.partialFailure ? { partialFailure: params.partialFailure } : {}),
  }
}

export interface RecentMatchFreshnessState {
  manualRefreshedAt: Date | null
  lastCheckedAt: Date | null
  lastFailedAt: Date | null
  nextRetryAt: Date | null
}

function isProfileRefreshStateReady(
  prisma: PrismaClient,
): prisma is PrismaClient & {
  playerProfileRefreshState: {
    findUnique: (args: unknown) => Promise<RecentMatchFreshnessState | null>
    upsert: (args: unknown) => Promise<unknown>
  }
} {
  return (
    typeof prisma === 'object' &&
    prisma !== null &&
    'playerProfileRefreshState' in prisma &&
    typeof (prisma as { playerProfileRefreshState?: unknown }).playerProfileRefreshState === 'object'
  )
}

export async function readManualProfileRefresh(
  prisma: PrismaClient,
  uid: string,
): Promise<Date | null> {
  if (!isProfileRefreshStateReady(prisma)) return null
  const row = await prisma.playerProfileRefreshState.findUnique({
    where: { uid },
    select: { manualRefreshedAt: true },
  })
  return row?.manualRefreshedAt ?? null
}

export async function readRecentMatchCheck(
  prisma: PrismaClient,
  uid: string,
): Promise<Date | null> {
  const state = await readRecentMatchFreshnessState(prisma, uid)
  return state?.lastCheckedAt ?? null
}

export async function readRecentMatchFreshnessState(
  prisma: PrismaClient,
  uid: string,
): Promise<RecentMatchFreshnessState | null> {
  if (!isProfileRefreshStateReady(prisma)) return null
  const row = await prisma.playerProfileRefreshState.findUnique({
    where: { uid },
    select: {
      manualRefreshedAt: true,
      lastCheckedAt: true,
      lastFailedAt: true,
      nextRetryAt: true,
    },
  })
  return row ?? null
}

export async function recordManualProfileRefresh(
  prisma: PrismaClient,
  uid: string,
  at: Date = new Date(),
): Promise<void> {
  if (!isProfileRefreshStateReady(prisma)) return
  await prisma.playerProfileRefreshState.upsert({
    where: { uid },
    create: { uid, manualRefreshedAt: at },
    update: { manualRefreshedAt: at },
  })
}

export async function recordRecentMatchCheck(
  prisma: PrismaClient,
  uid: string,
  at: Date = new Date(),
): Promise<void> {
  await recordRecentMatchCheckSuccess(prisma, uid, at)
}

export async function recordRecentMatchCheckSuccess(
  prisma: PrismaClient,
  uid: string,
  at: Date = new Date(),
): Promise<void> {
  if (!isProfileRefreshStateReady(prisma)) return
  await prisma.playerProfileRefreshState.upsert({
    where: { uid },
    create: {
      uid,
      lastCheckedAt: at,
      lastFailedAt: null,
      nextRetryAt: null,
    },
    update: {
      lastCheckedAt: at,
      lastFailedAt: null,
      nextRetryAt: null,
    },
  })
}

export async function recordRecentMatchCheckFailure(
  prisma: PrismaClient,
  uid: string,
  at: Date = new Date(),
  cooldownMs = resolveRecentMatchFailureCooldownMs(),
): Promise<void> {
  if (!isProfileRefreshStateReady(prisma)) return
  const nextRetryAt = new Date(at.getTime() + cooldownMs)
  await prisma.playerProfileRefreshState.upsert({
    where: { uid },
    create: {
      uid,
      lastFailedAt: at,
      nextRetryAt,
    },
    update: {
      lastFailedAt: at,
      nextRetryAt,
    },
  })
}
