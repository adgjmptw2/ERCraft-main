import type {
  CollectorGameQueue,
  CollectorUserQueue,
  Prisma,
  PrismaClient,
} from '@prisma/client'

import { uidToUserNum } from '../external/bserMapper.js'
import type { CollectorConfig } from './config.js'
import {
  computeUserQueuePriorityFromRp,
  LOW_TIER_RP_MAX,
} from './userQueuePriority.js'

export type CollectorQueueStatus = 'pending' | 'running' | 'completed' | 'retry' | 'dead'

export interface QueueSeedResult {
  usersSeeded: number
  gamesSeeded: number
  candidateUsers: number
  candidateGames: number
}

function leaseUntil(config: CollectorConfig): Date {
  return new Date(Date.now() + config.leaseSeconds * 1000)
}

function availableJobWhere(now = new Date()): Prisma.CollectorUserQueueWhereInput {
  return {
    OR: [
      { status: 'pending' },
      { status: 'retry', nextCollectAt: { lte: now } },
      { status: 'running', leaseExpiresAt: { lt: now } },
    ],
  }
}

function availableGameWhere(now = new Date()): Prisma.CollectorGameQueueWhereInput {
  return {
    OR: [
      { status: 'pending' },
      { status: 'retry', nextAttemptAt: { lte: now } },
      { status: 'running', leaseExpiresAt: { lt: now } },
    ],
  }
}

export async function enqueueCollectorUser(
  prisma: PrismaClient,
  params: {
    uid: string
    userNum?: number | bigint | null
    nickname?: string | null
    priority?: number
    discoveryDepth?: number
    discoveredFromGameId?: string | null
  },
): Promise<boolean> {
  if (!params.uid.trim()) return false
  const userNum = BigInt(params.userNum ?? uidToUserNum(params.uid))
  const existing = await prisma.collectorUserQueue.findUnique({ where: { userNum } })
  if (existing) {
    await prisma.collectorUserQueue.update({
      where: { userNum },
      data: {
        uid: existing.uid ?? params.uid,
        lastKnownNickname: existing.lastKnownNickname ?? params.nickname ?? null,
        priority: Math.min(existing.priority, params.priority ?? existing.priority),
      },
    })
    return false
  }
  await prisma.collectorUserQueue.create({
    data: {
      userNum,
      uid: params.uid,
      lastKnownNickname: params.nickname ?? null,
      priority: params.priority ?? 100,
      discoveryDepth: params.discoveryDepth ?? 0,
      discoveredFromGameId: params.discoveredFromGameId ?? null,
      status: 'pending',
    },
  })
  return true
}

export async function enqueueCollectorGame(
  prisma: PrismaClient,
  params: {
    gameId: string
    priority?: number
    discoveredFromUserNum?: number | bigint | null
    seasonId?: number | null
    matchingMode?: number | null
  },
): Promise<boolean> {
  const gameId = params.gameId.trim()
  if (!/^\d+$/.test(gameId)) return false
  const existing = await prisma.collectorGameQueue.findUnique({ where: { gameId } })
  if (existing) {
    await prisma.collectorGameQueue.update({
      where: { gameId },
      data: {
        priority: Math.min(existing.priority, params.priority ?? existing.priority),
        seasonId: existing.seasonId ?? params.seasonId ?? null,
        matchingMode: existing.matchingMode ?? params.matchingMode ?? null,
      },
    })
    return false
  }
  await prisma.collectorGameQueue.create({
    data: {
      gameId,
      status: 'pending',
      priority: params.priority ?? 100,
      discoveredFromUserNum:
        params.discoveredFromUserNum == null ? null : BigInt(params.discoveredFromUserNum),
      seasonId: params.seasonId ?? null,
      matchingMode: params.matchingMode ?? null,
    },
  })
  return true
}

export async function seedCollectorQueuesFromDb(
  prisma: PrismaClient,
  limit = 500,
): Promise<QueueSeedResult> {
  const lowTierMatches = await prisma.playerMatch.findMany({
    where: { rpAfter: { not: null, lte: LOW_TIER_RP_MAX } },
    orderBy: [{ rpAfter: 'asc' }, { updatedAt: 'desc' }],
    select: {
      uid: true,
      characterName: true,
      rpAfter: true,
      displaySeasonId: true,
    },
    take: Math.max(limit * 4, limit),
  })

  const seenUids = new Set<string>()
  const userRows: Array<{
    uid: string
    characterName: string | null
    rpAfter: number | null
    displaySeasonId: number
  }> = []
  for (const row of lowTierMatches) {
    if (seenUids.has(row.uid)) continue
    seenUids.add(row.uid)
    userRows.push(row)
    if (userRows.length >= limit) break
  }

  if (userRows.length < limit) {
    const recentMatches = await prisma.playerMatch.findMany({
      distinct: ['uid'],
      take: limit - userRows.length,
      orderBy: { updatedAt: 'desc' },
      select: {
        uid: true,
        characterName: true,
        rpAfter: true,
        displaySeasonId: true,
      },
    })
    for (const row of recentMatches) {
      if (seenUids.has(row.uid)) continue
      seenUids.add(row.uid)
      userRows.push(row)
      if (userRows.length >= limit) break
    }
  }

  const gameRows = await prisma.playerMatch.findMany({
    where: { rpAfter: { not: null, lte: LOW_TIER_RP_MAX } },
    distinct: ['gameId'],
    take: limit,
    orderBy: [{ rpAfter: 'asc' }, { updatedAt: 'desc' }],
    select: { gameId: true, apiSeasonId: true, matchingMode: true, uid: true, rpAfter: true },
  })

  let usersSeeded = 0
  for (const row of userRows) {
    const created = await enqueueCollectorUser(prisma, {
      uid: row.uid,
      priority: computeUserQueuePriorityFromRp(row.rpAfter, row.displaySeasonId),
      discoveryDepth: 0,
    })
    if (created) usersSeeded += 1
  }

  let gamesSeeded = 0
  for (const row of gameRows) {
    const hasDetail = await prisma.matchDetail.findUnique({
      where: { gameId: row.gameId },
      select: { gameId: true },
    })
    if (hasDetail) continue
    const created = await enqueueCollectorGame(prisma, {
      gameId: row.gameId,
      priority: row.rpAfter != null && row.rpAfter <= LOW_TIER_RP_MAX ? 5 : 10,
      discoveredFromUserNum: uidToUserNum(row.uid),
      seasonId: row.apiSeasonId,
      matchingMode: row.matchingMode,
    })
    if (created) gamesSeeded += 1
  }

  return {
    usersSeeded,
    gamesSeeded,
    candidateUsers: userRows.length,
    candidateGames: gameRows.length,
  }
}

/** Iron–Gold PlayerMatch owners — enqueue or raise priority (lower number). */
export async function reconcileLowTierCollectorUsers(
  prisma: PrismaClient,
  limit = 500,
): Promise<{ enqueued: number; priorityUpdated: number; candidates: number }> {
  const matches = await prisma.playerMatch.findMany({
    where: { rpAfter: { gte: 1, lte: LOW_TIER_RP_MAX } },
    orderBy: [{ rpAfter: 'asc' }, { updatedAt: 'desc' }],
    select: { uid: true, rpAfter: true, displaySeasonId: true },
    take: Math.max(limit * 4, limit),
  })

  const seen = new Set<string>()
  let enqueued = 0
  let priorityUpdated = 0
  let candidates = 0

  for (const row of matches) {
    if (!row.uid || seen.has(row.uid)) continue
    seen.add(row.uid)
    candidates += 1
    if (candidates > limit) break

    const priority = computeUserQueuePriorityFromRp(row.rpAfter, row.displaySeasonId)
    const userNum = BigInt(uidToUserNum(row.uid))
    const existing = await prisma.collectorUserQueue.findUnique({
      where: { userNum },
      select: { priority: true, status: true },
    })
    if (!existing) {
      const created = await enqueueCollectorUser(prisma, {
        uid: row.uid,
        priority,
        discoveryDepth: 0,
      })
      if (created) enqueued += 1
      continue
    }
    if (
      existing.status !== 'dead' &&
      priority < existing.priority
    ) {
      const result = await prisma.collectorUserQueue.updateMany({
        where: { userNum, status: { in: ['pending', 'retry', 'completed'] } },
        data: { priority, status: 'pending', leaseOwner: null, leaseExpiresAt: null },
      })
      if (result.count === 1) priorityUpdated += 1
    }
  }

  return { enqueued, priorityUpdated, candidates }
}

export async function claimNextCollectorUser(
  prisma: PrismaClient,
  config: CollectorConfig,
): Promise<CollectorUserQueue | null> {
  const now = new Date()
  const candidates = await prisma.collectorUserQueue.findMany({
    where: availableJobWhere(now),
    orderBy: [{ priority: 'asc' }, { updatedAt: 'asc' }],
    take: 10,
  })
  for (const candidate of candidates) {
    const claimed = await prisma.collectorUserQueue.updateMany({
      where: {
        userNum: candidate.userNum,
        OR: availableJobWhere(now).OR,
      },
      data: {
        status: 'running',
        leaseOwner: config.workerId,
        leaseExpiresAt: leaseUntil(config),
        attemptCount: { increment: 1 },
      },
    })
    if (claimed.count === 1) {
      return prisma.collectorUserQueue.findUnique({ where: { userNum: candidate.userNum } })
    }
  }
  return null
}

export async function claimNextCollectorGame(
  prisma: PrismaClient,
  config: CollectorConfig,
): Promise<CollectorGameQueue | null> {
  const now = new Date()
  const candidates = await prisma.collectorGameQueue.findMany({
    where: availableGameWhere(now),
    orderBy: [{ priority: 'asc' }, { updatedAt: 'asc' }],
    take: 10,
  })
  for (const candidate of candidates) {
    const claimed = await prisma.collectorGameQueue.updateMany({
      where: {
        gameId: candidate.gameId,
        OR: availableGameWhere(now).OR,
      },
      data: {
        status: 'running',
        leaseOwner: config.workerId,
        leaseExpiresAt: leaseUntil(config),
        attemptCount: { increment: 1 },
      },
    })
    if (claimed.count === 1) {
      return prisma.collectorGameQueue.findUnique({ where: { gameId: candidate.gameId } })
    }
  }
  return null
}

export function retryDelay(attemptCount: number): Date {
  const seconds = Math.min(3600, 30 * 2 ** Math.max(0, attemptCount - 1))
  return new Date(Date.now() + seconds * 1000)
}

/** Expired lease rows stuck in running — reclaim for pending. */
export async function releaseStaleCollectorLeases(
  prisma: PrismaClient,
  now = new Date(),
): Promise<{ users: number; games: number }> {
  const [users, games] = await Promise.all([
    prisma.collectorUserQueue.updateMany({
      where: { status: 'running', leaseExpiresAt: { lt: now } },
      data: { status: 'pending', leaseOwner: null, leaseExpiresAt: null },
    }),
    prisma.collectorGameQueue.updateMany({
      where: { status: 'running', leaseExpiresAt: { lt: now } },
      data: { status: 'pending', leaseOwner: null, leaseExpiresAt: null },
    }),
  ])
  return { users: users.count, games: games.count }
}

let lastUserPriorityRefreshAt = 0

export async function refreshUserQueuePriorities(
  prisma: PrismaClient,
  limit: number,
): Promise<number> {
  const rows = await prisma.collectorUserQueue.findMany({
    where: { status: { in: ['pending', 'retry'] } },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'asc' }],
    take: limit,
    select: { userNum: true, uid: true, priority: true },
  })
  if (rows.length === 0) return 0

  let updated = 0
  for (const row of rows) {
    const ownerUid = row.uid?.trim()
    if (!ownerUid) continue
    const latest = await prisma.playerMatch.findFirst({
      where: { uid: ownerUid, rpAfter: { not: null } },
      orderBy: [{ playedAt: 'desc' }, { updatedAt: 'desc' }],
      select: { rpAfter: true, displaySeasonId: true },
    })
    if (latest?.rpAfter == null || latest.rpAfter <= 0) continue
    const priority = computeUserQueuePriorityFromRp(latest.rpAfter, latest.displaySeasonId)
    if (priority >= row.priority) continue
    const result = await prisma.collectorUserQueue.updateMany({
      where: { userNum: row.userNum, status: { in: ['pending', 'retry'] } },
      data: { priority },
    })
    if (result.count === 1) updated += 1
  }
  return updated
}

export async function maybeRefreshUserQueuePriorities(
  prisma: PrismaClient,
  config: CollectorConfig,
): Promise<number> {
  const intervalMs = config.priorityRefreshIntervalMinutes * 60 * 1000
  const now = Date.now()
  if (now - lastUserPriorityRefreshAt < intervalMs) return 0
  lastUserPriorityRefreshAt = now
  return refreshUserQueuePriorities(prisma, config.priorityRefreshBatchSize)
}

export async function finishCollectorUser(
  prisma: PrismaClient,
  row: CollectorUserQueue,
  status: CollectorQueueStatus,
  data: Prisma.CollectorUserQueueUpdateInput = {},
): Promise<void> {
  await prisma.collectorUserQueue.update({
    where: { userNum: row.userNum },
    data: {
      status,
      leaseOwner: null,
      leaseExpiresAt: null,
      ...data,
    },
  })
}

export async function finishCollectorGame(
  prisma: PrismaClient,
  row: CollectorGameQueue,
  status: CollectorQueueStatus,
  data: Prisma.CollectorGameQueueUpdateInput = {},
): Promise<void> {
  await prisma.collectorGameQueue.update({
    where: { gameId: row.gameId },
    data: {
      status,
      leaseOwner: null,
      leaseExpiresAt: null,
      ...data,
    },
  })
}
