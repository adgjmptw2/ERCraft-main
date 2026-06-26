import type { PrismaClient } from '@prisma/client'

import type { BserClient } from '../external/bserClient.js'
import type { CollectorConfig } from './config.js'
import { collectorUsableDailyBudget } from './config.js'
import { CollectorRunner } from './runner.js'
import { readCollectorStatus } from './status.js'

export interface DrainUntilOptions {
  targetPending: number
  chunkRequests: number
  maxTotalRequests: number
  dryRun?: boolean
}

export interface DrainChunkReport {
  runIndex: number
  pendingBefore: number
  pendingAfter: number
  netChange: number
  identityAdded: number
  identityProcessed: number
  resolved: number
  mismatch: number
  outOfWindow: number
  deferred: number
  api: {
    game: number
    identity: number
    user: number
    other: number
    total: number
  }
  apiPerResolved: number | null
  groupsProcessed: number
  playerMatchRowsWritten: number
  teamLuckCoverageDelta: number | null
  stoppedReason: string
}

export interface DrainUntilResult {
  startedPending: number
  finalPending: number
  targetPending: number
  reachedTarget: boolean
  totalApiRequests: number
  chunks: DrainChunkReport[]
  stoppedReason: string
}

function isFatalStop(reason: string): boolean {
  return (
    reason === 'fatal-auth-error' ||
    reason === 'unexpected-error' ||
    reason === 'daily-budget-exhausted'
  )
}

export async function runDrainUntil(
  prisma: PrismaClient,
  bser: BserClient,
  config: CollectorConfig,
  options: DrainUntilOptions,
): Promise<DrainUntilResult> {
  const runner = new CollectorRunner(prisma, bser, config)
  const chunks: DrainChunkReport[] = []
  let totalApiRequests = 0
  let stoppedReason = 'target-not-reached'
  let previousNetChange = Number.POSITIVE_INFINITY
  let noProgressStreak = 0

  const startedPending = await prisma.collectorIdentityQueue.count({
    where: { status: { in: ['pending', 'retry'] } },
  })
  let pending = startedPending

  if (options.dryRun) {
    const usable = collectorUsableDailyBudget(config)
    const needed = Math.max(0, pending - options.targetPending)
    const estimatedChunks = Math.ceil(needed / Math.max(1, options.chunkRequests * 0.5))
    return {
      startedPending,
      finalPending: pending,
      targetPending: options.targetPending,
      reachedTarget: pending <= options.targetPending,
      totalApiRequests: 0,
      chunks: [],
      stoppedReason: 'dry-run',
    }
  }

  const statusBefore = await readCollectorStatus(prisma, config)
  const remainingBudgetStart = statusBefore.remainingToday

  for (let runIndex = 1; totalApiRequests < options.maxTotalRequests; runIndex += 1) {
    pending = await prisma.collectorIdentityQueue.count({
      where: { status: { in: ['pending', 'retry'] } },
    })
    if (pending <= options.targetPending) {
      stoppedReason = 'target-pending-reached'
      break
    }

    const status = await readCollectorStatus(prisma, config)
    if (status.remainingToday < options.chunkRequests) {
      stoppedReason = 'daily-budget-exhausted'
      break
    }

    const pendingBefore = pending
    const teamLuckBefore = status.teamLuckCoverageAfter ?? status.teamLuckCoverageBefore ?? null
    const result = await runner.runOnce({
      mode: 'drain',
      maxRequests: options.chunkRequests,
    })
    totalApiRequests += result.apiRequestsUsed

    const report = result.report
    const pendingAfter = report?.queues.pendingIdentitiesAfter ?? pendingBefore
    const netChange = pendingAfter - pendingBefore
    const identityProcessed = report?.metrics.operationMode.identityProcessed ?? 0
    const resolved = report?.metrics.identityQueueResolved ?? 0

    chunks.push({
      runIndex,
      pendingBefore,
      pendingAfter,
      netChange,
      identityAdded: report?.metrics.backlog.identityAdded ?? 0,
      identityProcessed,
      resolved,
      mismatch: report?.metrics.identityGameMismatch ?? 0,
      outOfWindow: report?.metrics.identityOutOfWindow ?? 0,
      deferred: report?.metrics.backlog.identityDeferred ?? 0,
      api: {
        game: report?.metrics.api.gameDetail ?? 0,
        identity:
          (report?.metrics.api.identityNicknameResolve ?? 0) +
          (report?.metrics.api.identityGameVerification ?? 0),
        user: report?.metrics.api.userGames ?? 0,
        other: report?.metrics.api.other ?? 0,
        total: report?.metrics.api.total ?? result.apiRequestsUsed,
      },
      apiPerResolved:
        resolved > 0 && report?.metrics.api.total
          ? Math.round((report.metrics.api.total / resolved) * 1000) / 1000
          : null,
      groupsProcessed: report?.metrics.identityGroup.identityGroupsCompleted ?? 0,
      playerMatchRowsWritten: report?.metrics.playerMatchRowsWritten ?? 0,
      teamLuckCoverageDelta:
        report?.metrics.teamLuckCoverageBefore != null &&
        report?.metrics.teamLuckCoverageAfter != null
          ? report.metrics.teamLuckCoverageAfter - report.metrics.teamLuckCoverageBefore
          : null,
      stoppedReason: String(result.stoppedReason),
    })

    const statusAfterChunk = await readCollectorStatus(prisma, config)
    console.error(
      JSON.stringify({
        event: 'drain-chunk-progress',
        runIndex,
        apiUsed: result.apiRequestsUsed,
        totalApiRequests,
        pendingBefore,
        pendingAfter,
        netChange,
        remainingToday: statusAfterChunk.remainingToday,
      }),
    )

    if (isFatalStop(String(result.stoppedReason))) {
      stoppedReason = String(result.stoppedReason)
      break
    }

    if (netChange >= 0) {
      noProgressStreak += 1
    } else {
      noProgressStreak = 0
    }
    if (noProgressStreak >= 2) {
      stoppedReason = 'no-progress'
      break
    }

    if (pendingAfter <= options.targetPending) {
      stoppedReason = 'target-pending-reached'
      break
    }

    if (totalApiRequests >= options.maxTotalRequests) {
      stoppedReason = 'max-total-requests-reached'
      break
    }

    previousNetChange = netChange
    void previousNetChange
    void remainingBudgetStart
  }

  const finalPending = await prisma.collectorIdentityQueue.count({
    where: { status: { in: ['pending', 'retry'] } },
  })

  return {
    startedPending,
    finalPending,
    targetPending: options.targetPending,
    reachedTarget: finalPending <= options.targetPending,
    totalApiRequests,
    chunks,
    stoppedReason,
  }
}
