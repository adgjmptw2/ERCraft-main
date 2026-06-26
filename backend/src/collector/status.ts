import type { PrismaClient } from '@prisma/client'

import { readCollectorBudgetSnapshot } from './budget.js'
import type { CollectorConfig } from './config.js'
import type { CollectorEfficiencyMetrics } from './metrics.js'

export interface CollectorStatusSnapshot {
  collectorEnabled: boolean
  workerRunning: boolean
  dailyBudget: number
  usedToday: number
  remainingToday: number
  collectorRps: number
  pendingUsers: number
  pendingGames: number
  runningUsers: number
  runningGames: number
  completedUsers: number
  completedGames: number
  retryCount: number
  deadCount: number
  newUsersDiscovered: number
  newGamesCollected: number
  playerMatchRowsWritten: number
  identitiesResolved: number
  identitiesUnresolved: number
  identityRequestsUsed: number
  pendingIdentities: number
  teamLuckCoverageBefore: number | null
  teamLuckCoverageAfter: number | null
  lastSuccessAt: string | null
  lastErrorCode: string | null
}

export async function countTeamLuckCompletableGames(prisma: PrismaClient): Promise<number> {
  const grouped = await prisma.matchParticipant.groupBy({
    by: ['gameId'],
    _count: { gameId: true },
  })
  return grouped.filter((row) => row._count.gameId >= 3).length
}

export async function readCollectorStatus(
  prisma: PrismaClient,
  config: CollectorConfig,
  runStats?: Partial<CollectorStatusSnapshot> | Partial<CollectorEfficiencyMetrics>,
): Promise<CollectorStatusSnapshot> {
  const budget = await readCollectorBudgetSnapshot(prisma, config)
  const [
    pendingUsers,
    pendingGames,
    pendingIdentities,
    runningUsers,
    runningGames,
    completedUsers,
    completedGames,
    retryUsers,
    retryGames,
    deadUsers,
    deadGames,
    lastCompletedUser,
    lastCompletedGame,
    lastErrorUser,
    lastErrorGame,
  ] = await Promise.all([
    prisma.collectorUserQueue.count({ where: { status: 'pending' } }),
    prisma.collectorGameQueue.count({ where: { status: 'pending' } }),
    prisma.collectorIdentityQueue.count({ where: { status: { in: ['pending', 'retry'] } } }),
    prisma.collectorUserQueue.count({ where: { status: 'running' } }),
    prisma.collectorGameQueue.count({ where: { status: 'running' } }),
    prisma.collectorUserQueue.count({ where: { status: 'completed' } }),
    prisma.collectorGameQueue.count({ where: { status: 'completed' } }),
    prisma.collectorUserQueue.count({ where: { status: 'retry' } }),
    prisma.collectorGameQueue.count({ where: { status: 'retry' } }),
    prisma.collectorUserQueue.count({ where: { status: 'dead' } }),
    prisma.collectorGameQueue.count({ where: { status: 'dead' } }),
    prisma.collectorUserQueue.findFirst({
      where: { status: 'completed', lastCollectedAt: { not: null } },
      orderBy: { lastCollectedAt: 'desc' },
      select: { lastCollectedAt: true },
    }),
    prisma.collectorGameQueue.findFirst({
      where: { status: 'completed', collectedAt: { not: null } },
      orderBy: { collectedAt: 'desc' },
      select: { collectedAt: true },
    }),
    prisma.collectorUserQueue.findFirst({
      where: { lastErrorCode: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { lastErrorCode: true },
    }),
    prisma.collectorGameQueue.findFirst({
      where: { lastErrorCode: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { lastErrorCode: true },
    }),
  ])
  const lastSuccessDates = [
    lastCompletedUser?.lastCollectedAt ?? null,
    lastCompletedGame?.collectedAt ?? null,
  ].filter((value): value is Date => value != null)
  const lastSuccessAt =
    lastSuccessDates.length > 0
      ? new Date(Math.max(...lastSuccessDates.map((date) => date.getTime()))).toISOString()
      : null

  return {
    collectorEnabled: config.enabled,
    workerRunning: runningUsers + runningGames > 0,
    dailyBudget: budget.dailyBudget,
    usedToday: budget.usedToday,
    remainingToday: budget.remainingToday,
    collectorRps: budget.collectorRps,
    pendingUsers,
    pendingGames,
    runningUsers,
    runningGames,
    completedUsers,
    completedGames,
    retryCount: retryUsers + retryGames,
    deadCount: deadUsers + deadGames,
    newUsersDiscovered: runStats?.newUsersDiscovered ?? 0,
    newGamesCollected:
      ('newGameDetailsCollected' in (runStats ?? {})
        ? (runStats as CollectorEfficiencyMetrics).newGameDetailsCollected
        : (runStats as Partial<CollectorStatusSnapshot>)?.newGamesCollected) ?? 0,
    playerMatchRowsWritten: runStats?.playerMatchRowsWritten ?? 0,
    identitiesResolved:
      ('identityResolved' in (runStats ?? {})
        ? (runStats as CollectorEfficiencyMetrics).identityResolved
        : (runStats as Partial<CollectorStatusSnapshot>)?.identitiesResolved) ?? 0,
    identitiesUnresolved:
      ('identityQueueUnresolved' in (runStats ?? {})
        ? (runStats as CollectorEfficiencyMetrics).identityQueueUnresolved
        : (runStats as Partial<CollectorStatusSnapshot>)?.identitiesUnresolved) ?? 0,
    identityRequestsUsed:
      ('identityResolveRequests' in (runStats ?? {})
        ? (runStats as CollectorEfficiencyMetrics).identityResolveRequests +
          (runStats as CollectorEfficiencyMetrics).identityVerificationRequests
        : (runStats as Partial<CollectorStatusSnapshot>)?.identityRequestsUsed) ?? 0,
    pendingIdentities,
    teamLuckCoverageBefore: runStats?.teamLuckCoverageBefore ?? null,
    teamLuckCoverageAfter: runStats?.teamLuckCoverageAfter ?? null,
    lastSuccessAt,
    lastErrorCode: lastErrorGame?.lastErrorCode ?? lastErrorUser?.lastErrorCode ?? null,
  }
}
