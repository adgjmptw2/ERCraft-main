import type { CollectorGameQueue, CollectorUserQueue, PrismaClient } from '@prisma/client'

import { runWithBserMetrics } from '../external/bserMetrics.js'
import { BserApiError, type BserClient, type BserUserGame } from '../external/bserClient.js'
import { mapToMatchSummary, uidToUserNum } from '../external/bserMapper.js'
import { loadSeasonCatalog, type SeasonCatalog } from '../external/seasonCatalog.js'
import { writeMatchDetailToDb } from '../cache/matchDetailStore.js'
import { upsertFreshPlayerMatches, upsertPlayerMatches } from '../cache/playerMatchStore.js'
import { mapBserGamesToMatchDetail } from '../external/matchDetailMapper.js'
import { recordCollectorRequest } from './budget.js'
import type { CollectorConfig } from './config.js'
import {
  claimNextIdentityGroup,
  auditIdentityGroupDryRun,
  processIdentityGroup,
} from './identityGroup.js'
import {
  enqueueCollectorIdentity,
  finishCollectorIdentity,
  identityRetryDelay,
  maybeRefreshIdentityQueuePriorities,
  seedIdentityQueueFromParticipants,
} from './identityQueue.js'
import {
  countIdentityDryRunCandidates,
  type IdentityApiCall,
} from './identityResolver.js'
import {
  createCollectorRunMetrics,
  finalizeCollectorRunReport,
  recordIdentityEnqueueSource,
  recordIdentityGroupResult,
  recordOperationModeMetrics,
  toLegacyEfficiencyMetrics,
  type CollectorQueueSizeSnapshot,
  type CollectorRunReport,
} from './metrics.js'
import { compactIdentityQueue } from './identityCompaction.js'
import {
  buildModeStateSnapshot,
  loadCollectorModeStateDetailed,
  saveCollectorModeState,
} from './modeState.js'
import {
  parseCollectorOperationMode,
  resolveOperationMode,
  type CollectorOperationMode,
  type OperationModeResult,
} from './operationMode.js'
import { buildModeQuotaPolicy, createQuotaMetrics } from './modeQuotaPolicy.js'
import {
  computeBalancedStability,
  resolveBalancedStability,
} from './balancedStability.js'
import {
  applyObservationToState,
  capPercentFromApiCap,
  isValidBalancedObservation,
  loadBalancedObservationState,
  saveBalancedObservationState,
  type BalancedRunObservation,
} from './balancedObservationStore.js'
import { resolveIdentitySeedLimit, resolveQueueSeedLimit } from './seedPolicy.js'
import { computeUserQueuePriorityFromRp } from './userQueuePriority.js'
import {
  claimNextCollectorGame,
  claimNextCollectorUser,
  enqueueCollectorGame,
  enqueueCollectorUser,
  finishCollectorGame,
  finishCollectorUser,
  maybeRefreshUserQueuePriorities,
  reconcileLowTierCollectorUsers,
  releaseStaleCollectorLeases,
  retryDelay,
  seedCollectorQueuesFromDb,
} from './queue.js'
import { CollectorApiBudget } from './apiBudget.js'
import {
  recordWorkClaimed,
  recordWorkCompleted,
  recordWorkSkipped,
} from './apiMetrics.js'
import {
  CollectorRunBudget,
  type CollectorQueueAvailability,
  type CollectorStopReason,
} from './runBudget.js'
import { countTeamLuckCompletableGames, readCollectorStatus } from './status.js'

export interface CollectorRunOptions {
  dryRun?: boolean
  maxRequests?: number
  seedLimit?: number
  mode?: string
}
export interface CollectorRunResult {
  dryRun: boolean
  apiRequestsUsed: number
  stoppedReason: CollectorStopReason | string
  workIterations: number
  seed?: Awaited<ReturnType<typeof seedCollectorQueuesFromDb>>
  identitySeed?: Awaited<ReturnType<typeof seedIdentityQueueFromParticipants>>
  identityDryRun?: Awaited<ReturnType<typeof countIdentityDryRunCandidates>> &
    Awaited<ReturnType<typeof auditIdentityGroupDryRun>>
  operationMode?: OperationModeResult
  compaction?: Awaited<ReturnType<typeof compactIdentityQueue>>
  budgetPlan?: import('./runBudget.js').CollectorRunBudgetSnapshot
  report?: CollectorRunReport
  status: Awaited<ReturnType<typeof readCollectorStatus>>
  duplicateGameDetailCalls: number
  fatalErrorCode: string | null
}

interface CollectorRunStats {
  metrics: ReturnType<typeof createCollectorRunMetrics>
  queues: CollectorQueueSizeSnapshot
}

type ProcessResult =
  | 'processed'
  | 'max-api-requests-reached'
  | 'daily-budget-exhausted'
  | 'fatal'

async function readQueueAvailability(
  prisma: PrismaClient,
  identityEnabled: boolean,
): Promise<CollectorQueueAvailability> {
  const now = new Date()
  const [games, identities, users] = await Promise.all([
    prisma.collectorGameQueue.count({
      where: {
        OR: [
          { status: 'pending' },
          { status: 'retry', nextAttemptAt: { lte: now } },
          { status: 'running', leaseExpiresAt: { lt: now } },
        ],
      },
    }),
    identityEnabled
      ? prisma.collectorIdentityQueue.count({
          where: {
            OR: [
              { status: 'pending' },
              { status: 'retry', nextAttemptAt: { lte: now } },
              { status: 'running', leaseExpiresAt: { lt: now } },
            ],
          },
        })
      : Promise.resolve(0),
    prisma.collectorUserQueue.count({
      where: {
        OR: [
          { status: 'pending' },
          { status: 'retry', nextCollectAt: { lte: now } },
          { status: 'running', leaseExpiresAt: { lt: now } },
        ],
      },
    }),
  ])
  return { game: games > 0, identity: identities > 0, user: users > 0 }
}

function hasRunnableWork(queues: CollectorQueueAvailability): boolean {
  return queues.game || queues.identity || queues.user
}

function participantUid(game: BserUserGame): string | null {
  if (typeof game.uid === 'string' && game.uid.trim()) return game.uid
  if (typeof game.userId === 'string' && game.userId.trim()) return game.userId
  return null
}

function participantUserNum(game: BserUserGame, uid: string): bigint {
  return BigInt(game.userNum ?? uidToUserNum(uid))
}

function isAuthStop(error: unknown): boolean {
  return error instanceof BserApiError && (error.status === 401 || error.status === 403)
}

function isRateLimited(error: unknown): boolean {
  return error instanceof BserApiError && error.status === 429
}

function errorCode(error: unknown): string {
  if (error instanceof BserApiError) return String(error.status)
  if (error instanceof Error) return error.name || 'error'
  return 'unknown'
}

async function retryOrDeadUser(
  prisma: PrismaClient,
  row: CollectorUserQueue,
  config: CollectorConfig,
  code: string,
): Promise<void> {
  const nextAttempt = row.attemptCount >= config.maxRetries ? null : retryDelay(row.attemptCount)
  await finishCollectorUser(prisma, row, nextAttempt ? 'retry' : 'dead', {
    nextCollectAt: nextAttempt,
    lastErrorCode: code,
  })
}

async function retryOrDeadGame(
  prisma: PrismaClient,
  row: CollectorGameQueue,
  config: CollectorConfig,
  code: string,
): Promise<void> {
  const nextAttempt = row.attemptCount >= config.maxRetries ? null : retryDelay(row.attemptCount)
  await finishCollectorGame(prisma, row, nextAttempt ? 'retry' : 'dead', {
    nextAttemptAt: nextAttempt,
    lastErrorCode: code,
  })
}

export class CollectorRunner {
  private catalog: SeasonCatalog | null = null
  private characterNames: ReadonlyMap<number, string> | null = null
  private runBudget: CollectorRunBudget | null = null
  private apiBudget: CollectorApiBudget | null = null
  private fatalErrorCode: string | null = null
  private operationModePolicy: OperationModeResult | null = null

  constructor(
    private readonly prisma: PrismaClient,
    private readonly bser: BserClient,
    private readonly config: CollectorConfig,
  ) {}

  private async ensureMetadata(
    queues: CollectorQueueAvailability,
  ): Promise<'ok' | 'max-api-requests-reached' | 'daily-budget-exhausted' | 'fatal'> {
    if (!this.apiBudget) return 'ok'

    if (!this.catalog) {
      const result = await this.apiBudget.execute('other', queues, async () => {
        this.catalog = await loadSeasonCatalog(this.bser)
        return this.catalog
      })
      if (!result.ok) {
        if (result.reason === 'daily-budget') return 'daily-budget-exhausted'
        return 'max-api-requests-reached'
      }
      await recordCollectorRequest(this.prisma, 'season-data', 'success')
    }

    if (!this.characterNames) {
      const result = await this.apiBudget.execute('other', queues, async () => {
        this.characterNames = await this.bser.getCharacterNames()
        return this.characterNames
      })
      if (!result.ok) {
        if (result.reason === 'daily-budget') return 'daily-budget-exhausted'
        return 'max-api-requests-reached'
      }
      await recordCollectorRequest(this.prisma, 'l10n', 'success')
    }

    return 'ok'
  }

  private async processUser(
    row: CollectorUserQueue,
    queues: CollectorQueueAvailability,
    stats: CollectorRunStats,
  ): Promise<ProcessResult> {
    const metrics = stats.metrics
    recordWorkClaimed(metrics.work, 'user')

    if (!row.uid) {
      await finishCollectorUser(this.prisma, row, 'dead', { lastErrorCode: 'missing-uid' })
      recordWorkCompleted(metrics.work)
      return 'processed'
    }

    const meta = await this.ensureMetadata(queues)
    if (meta !== 'ok') return meta

    const result = await this.apiBudget!.execute('userGames', queues, () =>
      this.bser.getUserGames(row.uid!, row.pageCursor ?? undefined),
    )
    if (!result.ok) {
      if (result.reason === 'daily-budget') return 'daily-budget-exhausted'
      return 'max-api-requests-reached'
    }

    try {
      await recordCollectorRequest(this.prisma, 'user-games', 'success')
      const page = result.value
      const characterNames = this.characterNames ?? new Map<number, string>()
      const catalog = this.catalog ?? undefined
      const fresh = page.games.map((game) => ({
        match: mapToMatchSummary(row.uid ?? '', game, characterNames, catalog ?? undefined),
        matchingMode: game.matchingMode ?? null,
        matchingTeamMode: game.matchingTeamMode ?? null,
      }))
      const upsert = await upsertFreshPlayerMatches(this.prisma, row.uid, fresh, {
        catalog: catalog ?? null,
      })
      metrics.playerMatchRowsWritten += upsert.upserted

      for (const game of page.games) {
        if (this.operationModePolicy?.limitUserDiscovery) continue
        const created = await enqueueCollectorGame(this.prisma, {
          gameId: String(game.gameId),
          priority: 20,
          discoveredFromUserNum: row.userNum,
          seasonId: game.seasonId,
          matchingMode: game.matchingMode,
        })
        if (created) {
          metrics.newGamesDiscovered += 1
          metrics.gameQueueAdded += 1
        }
      }

      metrics.userQueueCompleted += 1
      await finishCollectorUser(this.prisma, row, 'completed', {
        lastCollectedAt: new Date(),
        pageCursor: page.next ?? null,
        lastErrorCode: null,
      })
      recordWorkCompleted(metrics.work)
      return 'processed'
    } catch (error) {
      const code = errorCode(error)
      await recordCollectorRequest(this.prisma, 'user-games', isRateLimited(error) ? 'rate-limited' : 'failure')
      await retryOrDeadUser(this.prisma, row, this.config, code)
      if (isAuthStop(error)) {
        this.fatalErrorCode = code
        return 'fatal'
      }
      recordWorkCompleted(metrics.work)
      return 'processed'
    }
  }

  private async processGame(
    row: CollectorGameQueue,
    queues: CollectorQueueAvailability,
    stats: CollectorRunStats,
  ): Promise<ProcessResult> {
    const metrics = stats.metrics
    recordWorkClaimed(metrics.work, 'game')

    const cached = await this.prisma.matchDetail.findUnique({
      where: { gameId: row.gameId },
      include: { participants: { select: { id: true }, take: 3 } },
    })
    if (cached && cached.participants.length >= 3) {
      metrics.noApi.dbCompleteGameSkip += 1
      metrics.gameQueueCompleted += 1
      await finishCollectorGame(this.prisma, row, 'completed', {
        collectedAt: new Date(),
        lastErrorCode: null,
      })
      recordWorkSkipped(metrics.work)
      return 'processed'
    }

    const meta = await this.ensureMetadata(queues)
    if (meta !== 'ok') return meta

    const result = await this.apiBudget!.execute('gameDetail', queues, () =>
      this.bser.getGame(row.gameId),
    )
    if (!result.ok) {
      if (result.reason === 'daily-budget') return 'daily-budget-exhausted'
      return 'max-api-requests-reached'
    }

    try {
      await recordCollectorRequest(this.prisma, 'game-detail', 'success')
      const games = result.value
      const characterNames = this.characterNames ?? new Map<number, string>()
      const catalog = this.catalog ?? undefined
      const detail = mapBserGamesToMatchDetail({
        gameId: row.gameId,
        games,
        characterNames,
        catalog,
      })
      if (detail.detailStatus === 'ready') {
        await writeMatchDetailToDb(this.prisma, detail, games)
        metrics.newGameDetailsCollected += 1
      }

      for (const game of games) {
        const uid = participantUid(game)
        if (!uid) {
          if (game.nickname?.trim() && !this.operationModePolicy?.suppressIdentityEnqueueFromGames) {
            const enqueueResult = await enqueueCollectorIdentity(this.prisma, this.config, {
              sourceGameId: row.gameId,
              nickname: game.nickname,
              characterNum: game.characterNum,
              teamNumber: game.teamNumber,
              seasonId: game.seasonId,
              matchingMode: game.matchingMode,
            })
            if (enqueueResult.created) {
              recordIdentityEnqueueSource(metrics, 'fromGameDetail')
              if (enqueueResult.deferred) metrics.backlog.identityDeferred += 1
            }
            if (enqueueResult.rejected) metrics.warnings.push('identity enqueue rejected at hard cap')
          }
          continue
        }
        const participantUidValue = participantUid(game)
        if (!participantUidValue || participantUidValue !== uid) {
          continue
        }
        const match = mapToMatchSummary(uid, game, characterNames, catalog)
        const displaySeasonId = catalog?.displayForApiId(game.seasonId) ?? match.seasonNumber ?? game.seasonId
        const written = await upsertPlayerMatches(this.prisma, uid, [match], {
          apiSeasonId: game.seasonId,
          displaySeasonId,
          matchingMode: game.matchingMode ?? null,
          matchingTeamMode: game.matchingTeamMode ?? null,
          storeRawJson: true,
          rawJson: game,
        })
        metrics.playerMatchRowsWritten += written
        if (row.discoveredFromUserNum != null && row.discoveredFromUserNum === participantUserNum(game, uid)) {
          continue
        }
        if ((row.attemptCount ?? 0) <= this.config.maxDiscoveryDepth) {
          const created = await enqueueCollectorUser(this.prisma, {
            uid,
            userNum: participantUserNum(game, uid),
            nickname: game.nickname ?? null,
            priority: computeUserQueuePriorityFromRp(match.rpAfter, displaySeasonId),
            discoveryDepth: Math.min(this.config.maxDiscoveryDepth, row.attemptCount + 1),
            discoveredFromGameId: row.gameId,
          })
          if (created) {
            metrics.newUsersDiscovered += 1
            metrics.userQueueAdded += 1
          }
        }
      }

      metrics.gameQueueCompleted += 1
      await finishCollectorGame(this.prisma, row, 'completed', {
        collectedAt: new Date(),
        lastErrorCode: null,
      })
      recordWorkCompleted(metrics.work)
      return 'processed'
    } catch (error) {
      const code = errorCode(error)
      await recordCollectorRequest(this.prisma, 'game-detail', isRateLimited(error) ? 'rate-limited' : 'failure')
      await retryOrDeadGame(this.prisma, row, this.config, code)
      if (isAuthStop(error)) {
        this.fatalErrorCode = code
        return 'fatal'
      }
      recordWorkCompleted(metrics.work)
      return 'processed'
    }
  }

  private async processIdentityGroup(
    group: import('./identityGroup.js').CollectorIdentityGroup,
    queues: CollectorQueueAvailability,
    stats: CollectorRunStats,
  ): Promise<ProcessResult> {
    const metrics = stats.metrics
    recordWorkClaimed(metrics.work, 'identity')
    metrics.identityGroup.identityGroupsClaimed += 1

    if (!this.config.identityEnabled) {
      for (const row of group.candidates) {
        await finishCollectorIdentity(this.prisma, row, 'dead', { lastErrorCode: 'identity-disabled' })
      }
      recordWorkCompleted(metrics.work)
      return 'processed'
    }

    const callApi: IdentityApiCall = async (category, fn) => {
      const result = await this.apiBudget!.execute(category, queues, fn)
      if (!result.ok) return { ok: false }
      return { ok: true, value: result.value }
    }

    try {
      const meta = await this.ensureMetadata(queues)
      if (meta !== 'ok') return meta

      const groupResult = await processIdentityGroup(
        this.prisma,
        this.bser,
        group,
        this.config,
        callApi,
        {
          characterNames: this.characterNames ?? new Map<number, string>(),
          catalog: this.catalog ?? undefined,
          discoveryDepth: Math.min(this.config.maxDiscoveryDepth, 1),
        },
      )

      if (groupResult.nicknameResolveApi > 0) {
        await recordCollectorRequest(this.prisma, 'user-nickname', 'success')
      }
      for (let index = 0; index < groupResult.verificationPages; index += 1) {
        await recordCollectorRequest(this.prisma, 'user-games', 'success')
      }

      if (groupResult.nicknameBindingHits > 0) {
        metrics.noApi.bindingHit += groupResult.nicknameBindingHits
      }
      if (groupResult.nicknameCacheHits > 0) {
        metrics.noApi.nicknameCacheHit += groupResult.nicknameCacheHits
      }

      recordIdentityGroupResult(metrics, group.candidateCount, groupResult)
      metrics.playerMatchRowsWritten += groupResult.playerMatchRowsWritten
      metrics.newUsersDiscovered += groupResult.usersEnqueued
      metrics.userQueueAdded += groupResult.usersEnqueued
      metrics.noApi.alreadyResolvedIdentitySkip += groupResult.candidatesAlreadyLinked

      if (groupResult.budgetExhausted) {
        recordWorkCompleted(metrics.work)
        return 'max-api-requests-reached'
      }
      if (groupResult.fatal) {
        this.fatalErrorCode = 'auth-error'
        recordWorkCompleted(metrics.work)
        return 'fatal'
      }

      recordWorkCompleted(metrics.work)
      return 'processed'
    } catch (error) {
      const code = errorCode(error)
      for (const row of group.candidates) {
        const retryable = row.attemptCount < this.config.identityMaxRetries
        if (retryable) {
          metrics.identityRetry += 1
          metrics.work.retried += 1
        } else metrics.identityDead += 1
        await finishCollectorIdentity(this.prisma, row, retryable ? 'retry' : 'dead', {
          nextAttemptAt: retryable ? identityRetryDelay(row.attemptCount) : null,
          lastErrorCode: code,
        })
      }
      if (isAuthStop(error)) {
        this.fatalErrorCode = code
        return 'fatal'
      }
      recordWorkCompleted(metrics.work)
      return 'processed'
    }
  }

  async runOnce(options: CollectorRunOptions = {}): Promise<CollectorRunResult> {
    return runWithBserMetrics(() => this.runOnceInner(options))
  }

  private async runOnceInner(options: CollectorRunOptions): Promise<CollectorRunResult> {
    const maxApiRequests = Math.max(0, options.maxRequests ?? 50)

    const [pendingUsersBefore, pendingGamesBefore, pendingIdentitiesBefore] = await Promise.all([
      this.prisma.collectorUserQueue.count({ where: { status: { in: ['pending', 'retry'] } } }),
      this.prisma.collectorGameQueue.count({ where: { status: { in: ['pending', 'retry'] } } }),
      this.prisma.collectorIdentityQueue.count({ where: { status: { in: ['pending', 'retry'] } } }),
    ])

    const modeArg = parseCollectorOperationMode(options.mode)
    const modeStateLoad = await loadCollectorModeStateDetailed(pendingIdentitiesBefore)
    const previousModeState = modeStateLoad.state
    const hardCapReached = pendingIdentitiesBefore >= this.config.identityQueueHardCap
    const operationMode = resolveOperationMode(
      this.config,
      {
        pendingIdentities: pendingIdentitiesBefore,
        identityAdded: previousModeState?.lastIdentityAdded,
        identityProcessed: previousModeState?.lastIdentityProcessed,
        hardCapReached,
        previousState: previousModeState,
      },
      modeArg === 'auto' ? 'auto' : 'override',
      modeArg === 'auto' ? undefined : modeArg,
    )
    this.operationModePolicy = operationMode
    const identitySeedLimit = resolveIdentitySeedLimit(operationMode.mode, options.seedLimit)
    const queueSeedLimit = resolveQueueSeedLimit(operationMode.mode, options.seedLimit)
    const observationState =
      operationMode.mode === 'balanced' ? await loadBalancedObservationState() : null
    const previousRunUnstable =
      previousModeState != null &&
      previousModeState.lastIdentityAdded > previousModeState.lastIdentityProcessed
    const balancedStability =
      operationMode.mode === 'balanced'
        ? resolveBalancedStability(this.config, maxApiRequests, observationState, {
            explicitSeedLimit: identitySeedLimit,
            emergencyCapReduction: previousRunUnstable,
          })
        : null
    const quotaMetrics = createQuotaMetrics()
    const quotaPolicy = buildModeQuotaPolicy(
      operationMode.mode,
      this.config,
      maxApiRequests,
      balancedStability ?? undefined,
    )
    const effectivePercents =
      operationMode.mode === 'balanced'
        ? {
            ...operationMode.effectivePercents,
            game: quotaPolicy.percentages.game,
            identity: quotaPolicy.percentages.identity,
            user: quotaPolicy.percentages.user,
            maintenance: quotaPolicy.percentages.maintenance,
          }
        : operationMode.effectivePercents
    this.runBudget = new CollectorRunBudget(
      maxApiRequests,
      effectivePercents,
      quotaPolicy,
      quotaMetrics,
    )
    this.apiBudget = new CollectorApiBudget(this.prisma, this.config, this.runBudget, {
      blockGameApi: operationMode.blockGameApi,
      blockUserApi: operationMode.blockUserApi,
    })

    const metrics = createCollectorRunMetrics(pendingIdentitiesBefore)
    metrics.effectivePercents = effectivePercents
    if (balancedStability) {
      metrics.balancedStability = balancedStability
    }
    const maxWorkIterations = maxApiRequests * this.config.maxWorkIterationsMultiplier
    recordOperationModeMetrics(metrics, {
      operationMode: operationMode.mode,
      modeSource: operationMode.source,
      modeEnteredAt: operationMode.modeEnteredAt,
      modeReason: operationMode.reason,
      modeMinimumRemainingSeconds: operationMode.modeMinimumRemainingSeconds,
      modeStateLoaded: modeStateLoad.modeStateLoaded,
      modeStateValid: modeStateLoad.modeStateValid,
      modeStateRecovered: modeStateLoad.modeStateRecovered,
      modeStateRecoveryReason: modeStateLoad.modeStateRecoveryReason,
    })
    metrics.backlog.identityAdded = 0
    metrics.teamLuckCoverageBefore = options.dryRun
      ? null
      : await countTeamLuckCompletableGames(this.prisma)

    const stats: CollectorRunStats = {
      metrics,
      queues: {
        pendingUsersBefore,
        pendingGamesBefore,
        pendingIdentitiesBefore,
        pendingUsersAfter: pendingUsersBefore,
        pendingGamesAfter: pendingGamesBefore,
        pendingIdentitiesAfter: pendingIdentitiesBefore,
      },
    }

    if (options.dryRun) {
      const [candidateUsers, candidateGames, identityDryRun, groupDryRun] = await Promise.all([
        this.prisma.playerMatch.findMany({ distinct: ['uid'], take: queueSeedLimit, select: { uid: true } }),
        this.prisma.playerMatch.findMany({ distinct: ['gameId'], take: queueSeedLimit, select: { gameId: true } }),
        countIdentityDryRunCandidates(this.prisma),
        auditIdentityGroupDryRun(this.prisma, this.config),
      ])
      const queues = await readQueueAvailability(this.prisma, this.config.identityEnabled)
      const status = await readCollectorStatus(this.prisma, this.config, toLegacyEfficiencyMetrics(metrics))
      return {
        dryRun: true,
        apiRequestsUsed: 0,
        stoppedReason: 'dry-run',
        workIterations: 0,
        seed: {
          usersSeeded: 0,
          gamesSeeded: 0,
          candidateUsers: candidateUsers.length + pendingUsersBefore,
          candidateGames: candidateGames.length + pendingGamesBefore,
        },
        identityDryRun: {
          ...identityDryRun,
          ...groupDryRun,
          identityCandidates: Math.max(identityDryRun.identityCandidates, pendingIdentitiesBefore),
        },
        operationMode,
        budgetPlan: this.runBudget.snapshot(queues),
        status,
        duplicateGameDetailCalls: 0,
        fatalErrorCode: null,
      }
    }

    let compactionResult: Awaited<ReturnType<typeof compactIdentityQueue>> | undefined
    if (this.config.identityEnabled) {
      compactionResult = await compactIdentityQueue(this.prisma, this.config, {
        maxRows: this.config.identityCompactionBatchSize,
        characterNames: this.characterNames ?? undefined,
      })
      metrics.operationMode.dbOnlyCompacted =
        compactionResult.resolvedWithoutApi +
        compactionResult.alreadyComplete +
        compactionResult.deferredOldSource +
        compactionResult.duplicateSkip +
        compactionResult.ambiguousConflict
      metrics.identityQueueResolved += compactionResult.resolvedWithoutApi + compactionResult.alreadyComplete
      metrics.backlog.identityDeferred += compactionResult.deferredOldSource
      metrics.identityQueueUnresolved += compactionResult.ambiguousConflict
    }

    const staleLeases = await releaseStaleCollectorLeases(this.prisma)
    if (staleLeases.users > 0 || staleLeases.games > 0) {
      metrics.warnings.push(
        `released stale leases: users=${staleLeases.users} games=${staleLeases.games}`,
      )
    }
    await maybeRefreshUserQueuePriorities(this.prisma, this.config)

    const lowTierReconcile = await reconcileLowTierCollectorUsers(
      this.prisma,
      operationMode.limitUserDiscovery ? Math.min(queueSeedLimit, 50) : queueSeedLimit,
    )
    if (lowTierReconcile.enqueued > 0 || lowTierReconcile.priorityUpdated > 0) {
      metrics.warnings.push(
        `low-tier reconcile: enqueued=${lowTierReconcile.enqueued} priorityUpdated=${lowTierReconcile.priorityUpdated}`,
      )
    }

    const seed = operationMode.blockGameApi && operationMode.blockUserApi
      ? { usersSeeded: 0, gamesSeeded: 0, candidateUsers: 0, candidateGames: 0 }
      : await seedCollectorQueuesFromDb(
          this.prisma,
          operationMode.limitUserDiscovery ? Math.min(queueSeedLimit, 50) : queueSeedLimit,
        )
    const identitySeed =
      this.config.identityEnabled &&
      !operationMode.suppressIdentitySeed &&
      identitySeedLimit > 0
        ? await seedIdentityQueueFromParticipants(this.prisma, this.config, identitySeedLimit)
        : { candidates: 0, seeded: 0, deferred: 0 }
    if (this.config.identityEnabled) {
      await maybeRefreshIdentityQueuePriorities(this.prisma, this.config)
    }
    metrics.backlog.identityAdded += identitySeed.seeded
    if (identitySeed.seeded > 0) {
      recordIdentityEnqueueSource(metrics, 'fromManualSeed', identitySeed.seeded)
    }
    metrics.userQueueAdded += seed.usersSeeded
    metrics.gameQueueAdded += seed.gamesSeeded

    let stoppedReason: CollectorStopReason = 'no-runnable-work'
    let workIterations = 0
    let idleRounds = 0

    while (this.apiBudget.canSpendApiTotal() && workIterations < maxWorkIterations) {
      const pendingIdentities = await this.prisma.collectorIdentityQueue.count({
        where: { status: { in: ['pending', 'retry'] } },
      })
      this.runBudget.updateEffectivePercents({
        ...this.operationModePolicy!.effectivePercents,
        pendingIdentities,
      })
      metrics.effectivePercents = {
        ...this.operationModePolicy!.effectivePercents,
        pendingIdentities,
      }

      const queues = await readQueueAvailability(this.prisma, this.config.identityEnabled)
      if (!hasRunnableWork(queues)) {
        stoppedReason = 'no-runnable-work'
        break
      }

      const nextKind = this.runBudget.selectNextWork(queues)
      if (!nextKind) {
        if (!this.apiBudget.canSpendApiTotal()) {
          stoppedReason = 'max-requests-reached'
          break
        }
        const drainFamily =
          operationMode.mode === 'drain' || operationMode.mode === 'emergency-drain'
        if (
          drainFamily &&
          operationMode.mode === 'emergency-drain' &&
          !queues.identity &&
          (queues.user || queues.game)
        ) {
          stoppedReason = 'no-runnable-drain-work'
          break
        }
        if (
          drainFamily &&
          operationMode.mode === 'drain' &&
          !queues.identity &&
          !this.runBudget.canSpendApi('user', queues)
        ) {
          stoppedReason = 'no-runnable-drain-work'
          break
        }
        idleRounds += 1
        if (idleRounds >= 5) {
          stoppedReason = 'no-runnable-work'
          break
        }
        continue
      }
      idleRounds = 0
      workIterations += 1

      if (nextKind === 'game') {
        const game = await claimNextCollectorGame(this.prisma, this.config)
        if (!game) continue
        const result = await this.processGame(game, queues, stats)
        if (result === 'daily-budget-exhausted') {
          stoppedReason = 'daily-budget-exhausted'
          break
        }
        if (result === 'max-api-requests-reached') {
          stoppedReason = 'max-requests-reached'
          break
        }
        if (result === 'fatal') {
          stoppedReason = 'fatal-auth-error'
          break
        }
        continue
      }

      if (nextKind === 'identity') {
        const identityGroup = await claimNextIdentityGroup(this.prisma, this.config)
        if (!identityGroup) continue
        const result = await this.processIdentityGroup(identityGroup, queues, stats)
        if (result === 'daily-budget-exhausted') {
          stoppedReason = 'daily-budget-exhausted'
          break
        }
        if (result === 'max-api-requests-reached') {
          stoppedReason = 'max-requests-reached'
          break
        }
        if (result === 'fatal') {
          stoppedReason = 'fatal-auth-error'
          break
        }
        continue
      }

      const user = await claimNextCollectorUser(this.prisma, this.config)
      if (!user) continue
      const result = await this.processUser(user, queues, stats)
      if (result === 'daily-budget-exhausted') {
        stoppedReason = 'daily-budget-exhausted'
        break
      }
      if (result === 'max-api-requests-reached') {
        stoppedReason = 'max-requests-reached'
        break
      }
      if (result === 'fatal') {
        stoppedReason = 'fatal-auth-error'
        break
      }
    }

    if (this.apiBudget.getApiUsed() >= maxApiRequests) stoppedReason = 'max-requests-reached'
    if (workIterations >= maxWorkIterations && this.apiBudget.canSpendApiTotal()) {
      stoppedReason = 'max-work-iterations-reached'
    }

    const [pendingUsersAfter, pendingGamesAfter, pendingIdentitiesAfter] = await Promise.all([
      this.prisma.collectorUserQueue.count({ where: { status: { in: ['pending', 'retry'] } } }),
      this.prisma.collectorGameQueue.count({ where: { status: { in: ['pending', 'retry'] } } }),
      this.prisma.collectorIdentityQueue.count({ where: { status: { in: ['pending', 'retry'] } } }),
    ])
    stats.queues.pendingUsersAfter = pendingUsersAfter
    stats.queues.pendingGamesAfter = pendingGamesAfter
    stats.queues.pendingIdentitiesAfter = pendingIdentitiesAfter

    metrics.teamLuckCoverageAfter = await countTeamLuckCompletableGames(this.prisma)
    metrics.api = { ...this.apiBudget.apiMetrics }
    const finalQueues = await readQueueAvailability(this.prisma, this.config.identityEnabled)
    const report = finalizeCollectorRunReport(
      metrics,
      this.runBudget.snapshot(finalQueues),
      stats.queues,
      this.config,
    )
    const status = await readCollectorStatus(this.prisma, this.config, toLegacyEfficiencyMetrics(metrics))

    await saveCollectorModeState(
      buildModeStateSnapshot({
        mode: operationMode.mode,
        modeEnteredAt: operationMode.modeEnteredAt,
        pendingIdentities: pendingIdentitiesAfter,
        identityAdded: metrics.backlog.identityAdded + metrics.identityQueueAdded,
        identityProcessed: report.metrics.operationMode.identityProcessed,
        finishedAt: new Date(),
      }),
    )

    if (operationMode.mode === 'balanced' && balancedStability && observationState) {
      const observation: BalancedRunObservation = {
        gameApiRequests: metrics.api.gameDetail,
        userApiRequests: metrics.api.userGames,
        identityApiRequests:
          metrics.api.identityNicknameResolve + metrics.api.identityGameVerification,
        maintenanceApiRequests: metrics.api.other,
        identitiesAddedFromGameDetail: metrics.identityEnqueueSource.fromGameDetail,
        identitiesAddedFromUserDiscovery: metrics.identityEnqueueSource.fromUserDiscovery,
        identitiesAddedFromManualSeed: metrics.identityEnqueueSource.fromManualSeed,
        identitiesAddedFromRepair: metrics.identityEnqueueSource.fromExistingDbRepair,
        identitiesAddedFromOther: metrics.identityEnqueueSource.fromOther,
        identitiesProcessed: report.metrics.operationMode.identityProcessed,
        pendingBefore: pendingIdentitiesBefore,
        pendingAfter: pendingIdentitiesAfter,
        totalApiRequests: metrics.api.total,
        dryRun: false,
        fatalError: this.fatalErrorCode != null,
        mode: operationMode.mode,
        modeSource: operationMode.source,
        apiMetricsValid: report.apiMetricsValid,
      }
      if (isValidBalancedObservation(observation)) {
        const next = applyObservationToState(observationState, observation, this.config)
        await saveBalancedObservationState({
          ...next,
          lastSafeGameCapPercent: capPercentFromApiCap(
            maxApiRequests,
            balancedStability.effectiveGameCap,
          ),
          lastSafeUserCapPercent: capPercentFromApiCap(
            maxApiRequests,
            balancedStability.effectiveUserCap,
          ),
        })
      }
    }

    return {
      dryRun: false,
      apiRequestsUsed: this.apiBudget.getApiUsed(),
      stoppedReason,
      workIterations,
      seed,
      identitySeed,
      compaction: compactionResult,
      operationMode,
      report,
      status,
      duplicateGameDetailCalls: 0,
      fatalErrorCode: this.fatalErrorCode,
    }
  }
}
