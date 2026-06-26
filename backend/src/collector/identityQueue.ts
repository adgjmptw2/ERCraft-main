import type { CollectorIdentityQueue, Prisma, PrismaClient } from '@prisma/client'

import type { CollectorConfig } from './config.js'
import { computeIdentityPriority } from './identityPriority.js'
import { buildIdentityPriorityContext, readNicknameCacheForTests } from './identityResolver.js'
import { displayIdentityNickname, normalizeIdentityNickname } from './identityNickname.js'
import { retryDelay } from './queue.js'

export type CollectorIdentityStatus =
  | 'pending'
  | 'running'
  | 'resolved'
  | 'unresolved'
  | 'retry'
  | 'dead'

export interface IdentityQueueSeedResult {
  candidates: number
  seeded: number
  deferred: number
}

export interface IdentityEnqueueResult {
  created: boolean
  deferred: boolean
  rejected?: boolean
}

let lastPriorityRefreshAt = 0

export function leaseUntil(config: CollectorConfig): Date {
  return new Date(Date.now() + config.leaseSeconds * 1000)
}

export function availableIdentityWhere(now = new Date()): Prisma.CollectorIdentityQueueWhereInput {
  return {
    OR: [
      { status: 'pending' },
      { status: 'retry', nextAttemptAt: { lte: now } },
      { status: 'running', leaseExpiresAt: { lt: now } },
    ],
  }
}

function identityKey(params: {
  sourceGameId: string
  nickname: string
  characterNum: number
  teamNumber?: number | null
}): {
  sourceGameId: string
  nickname: string
  characterNum: number
  teamNumber: number
} {
  return {
    sourceGameId: params.sourceGameId.trim(),
    nickname: params.nickname.trim(),
    characterNum: params.characterNum,
    teamNumber: params.teamNumber ?? 0,
  }
}

export async function isNicknameGroupable(
  prisma: PrismaClient,
  nickname: string,
): Promise<boolean> {
  const normalized = normalizeIdentityNickname(nickname)
  if (!normalized) return false

  const display = displayIdentityNickname(nickname)
  const rows = await prisma.matchParticipant.findMany({
    where: { nickname: display, uid: { not: null } },
    distinct: ['uid'],
    select: { uid: true },
    take: 16,
  })
  const uids = rows.map((row) => row.uid).filter((uid): uid is string => Boolean(uid))
  if (uids.length > 1) return false

  const { readPersistedNicknameBinding } = await import('../cache/profileNicknameBinding.js')
  const binding = await readPersistedNicknameBinding(prisma, display)
  if (binding) {
    const conflicting = uids.filter((uid) => uid !== binding.canonicalUid)
    if (conflicting.length > 0) return false
  }

  const cached = readNicknameCacheForTests(normalized)
  if (cached?.kind === 'ambiguous') return false

  return true
}

async function shouldDeferIdentity(
  prisma: PrismaClient,
  _config: CollectorConfig,
  nickname: string,
): Promise<boolean> {
  const trimmed = displayIdentityNickname(nickname)
  if (!trimmed) return true
  if (!(await isNicknameGroupable(prisma, trimmed))) return true

  const outOfWindow = await prisma.collectorIdentityQueue.count({
    where: {
      nickname: trimmed,
      lastErrorCode: 'unresolved-game-out-of-window',
      status: { in: ['unresolved', 'retry'] },
    },
  })
  return outOfWindow > 0
}

async function groupPriorityBoost(
  prisma: PrismaClient,
  nickname: string,
  basePriority: number,
): Promise<number> {
  const trimmed = displayIdentityNickname(nickname)
  if (!(await isNicknameGroupable(prisma, trimmed))) return basePriority
  const pendingForNickname = await prisma.collectorIdentityQueue.count({
    where: {
      nickname: trimmed,
      status: { in: ['pending', 'retry'] },
    },
  })
  if (pendingForNickname >= 2) {
    return Math.max(1, basePriority - Math.min(12, pendingForNickname))
  }
  return basePriority
}

export async function enqueueCollectorIdentity(
  prisma: PrismaClient,
  config: CollectorConfig,
  params: {
    sourceGameId: string
    nickname: string
    characterNum: number
    teamNumber?: number | null
    seasonId?: number | null
    matchingMode?: number | null
    priority?: number
  },
): Promise<IdentityEnqueueResult> {
  const nickname = params.nickname.trim()
  if (!nickname || !/^\d+$/.test(params.sourceGameId.trim())) {
    return { created: false, deferred: false }
  }

  const pendingCount = await prisma.collectorIdentityQueue.count({
    where: { status: { in: ['pending', 'retry'] } },
  })
  if (pendingCount >= config.identityQueueHardCap) {
    return { created: false, deferred: false, rejected: true }
  }

  const defer = await shouldDeferIdentity(prisma, config, nickname)
  const key = identityKey(params)
  const existing = await prisma.collectorIdentityQueue.findUnique({
    where: {
      sourceGameId_nickname_characterNum_teamNumber: key,
    },
  })
  if (existing) {
    if (existing.status === 'resolved' || existing.status === 'dead') {
      return { created: false, deferred: false }
    }
    const nextPriority = Math.min(
      existing.priority,
      params.priority ?? (defer ? 95 : existing.priority),
    )
    const updated = await prisma.collectorIdentityQueue.updateMany({
      where: {
        id: existing.id,
        status: { notIn: ['resolved', 'dead'] },
      },
      data: {
        priority: nextPriority,
        seasonId: existing.seasonId ?? params.seasonId ?? null,
        matchingMode: existing.matchingMode ?? params.matchingMode ?? null,
      },
    })
    if (updated.count === 0) {
      return { created: false, deferred: defer }
    }
    return { created: false, deferred: defer }
  }

  let priority = params.priority ?? 25
  if (defer) priority = 95
  else priority = await groupPriorityBoost(prisma, nickname, priority)

  await prisma.collectorIdentityQueue.create({
    data: {
      ...key,
      seasonId: params.seasonId ?? null,
      matchingMode: params.matchingMode ?? null,
      priority,
      status: 'pending',
    },
  })
  return { created: true, deferred: defer }
}

export async function seedIdentityQueueFromParticipants(
  prisma: PrismaClient,
  config: CollectorConfig,
  limit = 500,
): Promise<IdentityQueueSeedResult> {
  const rows = await prisma.matchParticipant.findMany({
    where: {
      uid: null,
      nickname: { not: null },
    },
    select: {
      gameId: true,
      nickname: true,
      characterNum: true,
      teamNumber: true,
      match: { select: { apiSeasonId: true, matchingMode: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit * 4,
  })

  let seeded = 0
  let deferred = 0
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.nickname?.trim()) continue
    const key = `${row.gameId}:${row.nickname}:${row.characterNum}:${row.teamNumber ?? 0}`
    if (seen.has(key)) continue
    seen.add(key)
    const result = await enqueueCollectorIdentity(prisma, config, {
      sourceGameId: row.gameId,
      nickname: row.nickname,
      characterNum: row.characterNum,
      teamNumber: row.teamNumber,
      seasonId: row.match.apiSeasonId,
      matchingMode: row.match.matchingMode,
    })
    if (result.created) {
      seeded += 1
      if (result.deferred) deferred += 1
    }
    if (seen.size >= limit) break
  }

  return { candidates: seen.size, seeded, deferred }
}

export async function claimNextCollectorIdentity(
  prisma: PrismaClient,
  config: CollectorConfig,
): Promise<CollectorIdentityQueue | null> {
  const now = new Date()
  const candidates = await prisma.collectorIdentityQueue.findMany({
    where: availableIdentityWhere(now),
    orderBy: [{ priority: 'asc' }, { updatedAt: 'asc' }],
    take: 10,
  })
  for (const candidate of candidates) {
    const claimed = await prisma.collectorIdentityQueue.updateMany({
      where: {
        id: candidate.id,
        OR: availableIdentityWhere(now).OR,
      },
      data: {
        status: 'running',
        leaseOwner: config.workerId,
        leaseExpiresAt: leaseUntil(config),
        attemptCount: { increment: 1 },
      },
    })
    if (claimed.count === 1) {
      return prisma.collectorIdentityQueue.findUnique({ where: { id: candidate.id } })
    }
  }
  return null
}

export async function finishCollectorIdentity(
  prisma: PrismaClient,
  row: CollectorIdentityQueue,
  status: CollectorIdentityStatus,
  data: Prisma.CollectorIdentityQueueUpdateInput = {},
): Promise<'updated' | 'skipped-already-finished' | 'missing'> {
  const updated = await prisma.collectorIdentityQueue.updateMany({
    where: { id: row.id },
    data: {
      status,
      leaseOwner: null,
      leaseExpiresAt: null,
      ...data,
    },
  })
  if (updated.count === 1) return 'updated'
  const current = await prisma.collectorIdentityQueue.findUnique({ where: { id: row.id } })
  if (!current) return 'missing'
  if (current.status === 'resolved' || current.status === 'dead') return 'skipped-already-finished'
  return 'missing'
}

export function identityRetryDelay(attemptCount: number): Date {
  return retryDelay(attemptCount)
}

export async function refreshIdentityQueuePriorities(
  prisma: PrismaClient,
  limit: number,
): Promise<number> {
  const rows = await prisma.collectorIdentityQueue.findMany({
    where: { status: { in: ['pending', 'retry'] }, priority: { lt: 90 } },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'asc' }],
    take: limit,
  })
  let updated = 0
  for (const row of rows) {
    const context = await buildIdentityPriorityContext(prisma, row)
    const priority = computeIdentityPriority({ row, context })
    if (priority !== row.priority) {
      const result = await prisma.collectorIdentityQueue.updateMany({
        where: { id: row.id, status: { in: ['pending', 'retry'] } },
        data: { priority },
      })
      if (result.count === 1) updated += 1
    }
  }
  return updated
}

export async function maybeRefreshIdentityQueuePriorities(
  prisma: PrismaClient,
  config: CollectorConfig,
): Promise<number> {
  const intervalMs = config.priorityRefreshIntervalMinutes * 60 * 1000
  const now = Date.now()
  if (now - lastPriorityRefreshAt < intervalMs) return 0
  lastPriorityRefreshAt = now
  return refreshIdentityQueuePriorities(prisma, config.priorityRefreshBatchSize)
}

export async function countPendingIdentityCandidates(prisma: PrismaClient): Promise<number> {
  return prisma.collectorIdentityQueue.count({
    where: {
      status: { in: ['pending', 'retry', 'running'] },
    },
  })
}
