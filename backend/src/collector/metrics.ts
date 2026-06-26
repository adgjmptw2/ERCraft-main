import type { IdentityVerificationTier } from './identityVerification.js'
import type {
  CollectorApiRequestMetrics,
  CollectorNoApiMetrics,
  CollectorWorkMetrics,
} from './apiMetrics.js'
import { validateApiRequestMetrics } from './apiMetrics.js'
import type { CollectorRunBudgetSnapshot } from './runBudget.js'
import type { EffectiveBudgetPercents } from './backlogPolicy.js'
import { computeIdentityProcessed, computeBacklogTrend } from './operationMode.js'

export interface CollectorQueueSizeSnapshot {
  pendingUsersBefore: number
  pendingGamesBefore: number
  pendingIdentitiesBefore: number
  pendingUsersAfter: number
  pendingGamesAfter: number
  pendingIdentitiesAfter: number
}

export type BacklogTrend = 'growing' | 'stable' | 'draining'

export interface CollectorBacklogMetrics {
  identityPendingBefore: number
  identityPendingAfter: number
  identityAdded: number
  identityResolved: number
  identityDeferred: number
  identityUnresolved: number
  identityGrowthAbsolute: number
  identityGrowthPercent: number | null
  identitiesResolvedPer100ApiRequests: number | null
  identityBacklogDrainRate: number | null
  backlogTrend: BacklogTrend
}

export interface CollectorIdentityGroupMetrics {
  identityGroupsClaimed: number
  identityGroupsCompleted: number
  identityCandidatesInGroups: number
  averageCandidatesPerGroup: number | null
  maxCandidatesPerGroup: number
  nicknameResolveApiRequests: number
  nicknameResolveCacheHits: number
  nicknameBindingHits: number
  verificationPagesFetched: number
  candidateGameIdsChecked: number
  candidatesResolved: number
  candidatesMismatch: number
  candidatesOutOfWindow: number
  candidatesDeferred: number
  candidatesAmbiguous: number
  candidatesAlreadyLinked: number
  resolvedCandidatesPerVerificationPage: number | null
  resolvedCandidatesPerIdentityApiRequest: number | null
  identityApiRequestsSavedEstimate: number
  identityApiRequestsPerResolvedCandidate: number | null
  identityApiRequestsPerProcessedCandidate: number | null
  verificationPagesPerResolvedCandidate: number | null
  resolvedCandidatesPerGroup: number | null
  processedCandidatesPerGroup: number | null
}

export interface IdentityEnqueueSourceMetrics {
  fromGameDetail: number
  fromUserDiscovery: number
  fromManualSeed: number
  fromExistingDbRepair: number
  fromOther: number
}

export interface CollectorOperationModeMetrics {
  operationMode: import('./operationMode.js').CollectorOperationMode
  modeSource: import('./operationMode.js').CollectorModeSource
  modeEnteredAt: string | null
  modeReason: string
  modeMinimumRemainingSeconds: number
  modeTransitions: string[]
  identityProcessed: number
  identityNetChange: number
  identityInflowToProcessedRatio: number | null
  dbOnlyCompacted: number
  apiRequestsPerProcessedIdentity: number | null
  modeStateLoaded: boolean
  modeStateValid: boolean
  modeStateRecovered: boolean
  modeStateRecoveryReason: string | null
}

export interface CollectorRunMetrics {
  api: CollectorApiRequestMetrics
  work: CollectorWorkMetrics
  noApi: CollectorNoApiMetrics
  identityGroup: CollectorIdentityGroupMetrics
  operationMode: CollectorOperationModeMetrics

  identityNotFound: number
  identityAmbiguous: number
  identityGameMismatch: number
  identityOutOfWindow: number
  identityRetry: number
  identityDead: number

  quickPageResolved: number
  normalPageResolved: number
  deepPageResolved: number
  verificationPagesTotal: number
  verificationPagesMax: number

  newUsersDiscovered: number
  newGamesDiscovered: number
  newGameDetailsCollected: number
  playerMatchRowsWritten: number
  teamLuckCoverageBefore: number | null
  teamLuckCoverageAfter: number | null

  userQueueAdded: number
  userQueueCompleted: number
  gameQueueAdded: number
  gameQueueCompleted: number
  identityQueueAdded: number
  identityQueueResolved: number
  identityQueueUnresolved: number
  identityEnqueueSource: IdentityEnqueueSourceMetrics
  balancedStability: import('./balancedStability.js').BalancedStabilityResult | null

  backlog: CollectorBacklogMetrics
  effectivePercents: EffectiveBudgetPercents | null
  warnings: string[]
}

/** @deprecated Use CollectorRunMetrics.api */
export interface CollectorEfficiencyMetrics {
  totalRequests: number
  gameDetailRequests: number
  identityResolveRequests: number
  identityVerificationRequests: number
  userGameRequests: number
  maintenanceRequests: number
  identityCandidatesProcessed: number
  identityResolved: number
  identityNotFound: number
  identityAmbiguous: number
  identityGameMismatch: number
  identityOutOfWindow: number
  identityRetry: number
  identityDead: number
  quickPageResolved: number
  normalPageResolved: number
  deepPageResolved: number
  verificationPagesTotal: number
  verificationPagesMax: number
  bindingHit: number
  nicknameCacheHit: number
  notFoundCacheHit: number
  ambiguousCacheHit: number
  officialApiResolve: number
  newUsersDiscovered: number
  newGamesDiscovered: number
  newGameDetailsCollected: number
  playerMatchRowsWritten: number
  teamLuckCoverageBefore: number | null
  teamLuckCoverageAfter: number | null
  userQueueAdded: number
  userQueueCompleted: number
  gameQueueAdded: number
  gameQueueCompleted: number
  identityQueueAdded: number
  identityQueueResolved: number
  identityQueueUnresolved: number
  warnings: string[]
}

export interface CollectorCostMetrics {
  totalApiRequestsPerNewUser: number | null
  totalApiRequestsPerNewGame: number | null
  totalApiRequestsPerPlayerMatchRow: number | null
  identityApiRequestsPerResolvedIdentity: number | null
  gameDetailApiRequestsPerNewGame: number | null
  userGameApiRequestsPerDiscoveredGame: number | null
  resolvedIdentityRate: number | null
  cacheHitRate: number | null
  bindingHitRate: number | null
  averageVerificationPages: number | null
  maxVerificationPages: number | null
  teamLuckCoverageAdded: number | null
}

/** @deprecated Use CollectorCostMetrics */
export type CollectorDerivedMetrics = CollectorCostMetrics

export interface DailyCollectionEstimate {
  collectorUsableRequests: number
  fixedRatio: {
    gameApiRequests: number
    identityApiRequests: number
    userApiRequests: number
    estimatedNewGames: number | null
    estimatedResolvedIdentities: number | null
    estimatedNewUsers: number | null
  }
  observedRatio: {
    gameApiRequests: number
    identityApiRequests: number
    userApiRequests: number
    estimatedNewGames: number | null
    estimatedResolvedIdentities: number | null
    estimatedNewUsers: number | null
  }
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 1000
}

function createIdentityEnqueueSourceMetrics(): IdentityEnqueueSourceMetrics {
  return {
    fromGameDetail: 0,
    fromUserDiscovery: 0,
    fromManualSeed: 0,
    fromExistingDbRepair: 0,
    fromOther: 0,
  }
}

export function recordIdentityEnqueueSource(
  metrics: CollectorRunMetrics,
  source: keyof IdentityEnqueueSourceMetrics,
  count = 1,
): void {
  if (count <= 0) return
  metrics.identityEnqueueSource[source] += count
  metrics.identityQueueAdded += count
}

function createOperationModeMetrics(): CollectorOperationModeMetrics {
  return {
    operationMode: 'balanced',
    modeSource: 'auto',
    modeEnteredAt: null,
    modeReason: 'unset',
    modeMinimumRemainingSeconds: 0,
    modeTransitions: [],
    identityProcessed: 0,
    identityNetChange: 0,
    identityInflowToProcessedRatio: null,
    dbOnlyCompacted: 0,
    apiRequestsPerProcessedIdentity: null,
    modeStateLoaded: false,
    modeStateValid: false,
    modeStateRecovered: false,
    modeStateRecoveryReason: null,
  }
}

export function recordOperationModeMetrics(
  metrics: CollectorRunMetrics,
  params: {
    operationMode: CollectorOperationModeMetrics['operationMode']
    modeSource: CollectorOperationModeMetrics['modeSource']
    modeEnteredAt: string
    modeReason: string
    modeMinimumRemainingSeconds: number
    transition?: string
    modeStateLoaded?: boolean
    modeStateValid?: boolean
    modeStateRecovered?: boolean
    modeStateRecoveryReason?: string | null
  },
): void {
  if (
    metrics.operationMode.operationMode !== params.operationMode &&
    metrics.operationMode.operationMode !== 'balanced'
  ) {
    metrics.operationMode.modeTransitions.push(
      params.transition ?? `${metrics.operationMode.operationMode} → ${params.operationMode}`,
    )
  }
  metrics.operationMode.operationMode = params.operationMode
  metrics.operationMode.modeSource = params.modeSource
  metrics.operationMode.modeEnteredAt = params.modeEnteredAt
  metrics.operationMode.modeReason = params.modeReason
  metrics.operationMode.modeMinimumRemainingSeconds = params.modeMinimumRemainingSeconds
  if (params.modeStateLoaded != null) metrics.operationMode.modeStateLoaded = params.modeStateLoaded
  if (params.modeStateValid != null) metrics.operationMode.modeStateValid = params.modeStateValid
  if (params.modeStateRecovered != null) metrics.operationMode.modeStateRecovered = params.modeStateRecovered
  if (params.modeStateRecoveryReason !== undefined) {
    metrics.operationMode.modeStateRecoveryReason = params.modeStateRecoveryReason
  }
}

export function finalizeOperationModeMetrics(metrics: CollectorRunMetrics): void {
  const processed = computeIdentityProcessed({
    resolved: metrics.identityQueueResolved,
    mismatch: metrics.identityGameMismatch,
    outOfWindow: metrics.identityOutOfWindow,
    ambiguous: metrics.identityAmbiguous + metrics.identityNotFound,
    deferredOldSource: metrics.backlog.identityDeferred,
  })
  metrics.operationMode.identityProcessed = processed
  metrics.operationMode.identityNetChange =
    metrics.backlog.identityPendingAfter - metrics.backlog.identityPendingBefore
  metrics.operationMode.identityInflowToProcessedRatio = safeRatio(
    metrics.backlog.identityAdded + metrics.identityQueueAdded,
    processed,
  )
  const identityApi =
    metrics.api.identityNicknameResolve + metrics.api.identityGameVerification
  metrics.operationMode.apiRequestsPerProcessedIdentity = safeRatio(identityApi, processed)
}

import { collectorUsableDailyBudget, type CollectorConfig } from './config.js'

function createIdentityGroupMetrics(): CollectorIdentityGroupMetrics {
  return {
    identityGroupsClaimed: 0,
    identityGroupsCompleted: 0,
    identityCandidatesInGroups: 0,
    averageCandidatesPerGroup: null,
    maxCandidatesPerGroup: 0,
    nicknameResolveApiRequests: 0,
    nicknameResolveCacheHits: 0,
    nicknameBindingHits: 0,
    verificationPagesFetched: 0,
    candidateGameIdsChecked: 0,
    candidatesResolved: 0,
    candidatesMismatch: 0,
    candidatesOutOfWindow: 0,
    candidatesDeferred: 0,
    candidatesAmbiguous: 0,
    candidatesAlreadyLinked: 0,
    resolvedCandidatesPerVerificationPage: null,
    resolvedCandidatesPerIdentityApiRequest: null,
    identityApiRequestsSavedEstimate: 0,
    identityApiRequestsPerResolvedCandidate: null,
    identityApiRequestsPerProcessedCandidate: null,
    verificationPagesPerResolvedCandidate: null,
    resolvedCandidatesPerGroup: null,
    processedCandidatesPerGroup: null,
  }
}

export function recordIdentityGroupResult(
  metrics: CollectorRunMetrics,
  groupCandidateCount: number,
  result: {
    nicknameResolveApi: number
    nicknameBindingHits: number
    nicknameCacheHits: number
    verificationPages: number
    candidateGameIdsChecked: number
    candidatesResolved: number
    candidatesMismatch: number
    candidatesOutOfWindow: number
    candidatesNotFound: number
    candidatesAmbiguous: number
    candidatesDeferred: number
    candidatesAlreadyLinked: number
    estimatedApiSaved: number
  },
): void {
  const group = metrics.identityGroup
  group.identityGroupsCompleted += 1
  group.identityCandidatesInGroups += groupCandidateCount
  group.maxCandidatesPerGroup = Math.max(group.maxCandidatesPerGroup, groupCandidateCount)
  group.nicknameResolveApiRequests += result.nicknameResolveApi
  group.nicknameResolveCacheHits += result.nicknameCacheHits
  group.nicknameBindingHits += result.nicknameBindingHits
  group.verificationPagesFetched += result.verificationPages
  group.candidateGameIdsChecked += result.candidateGameIdsChecked
  group.candidatesResolved += result.candidatesResolved
  group.candidatesMismatch += result.candidatesMismatch
  group.candidatesOutOfWindow += result.candidatesOutOfWindow
  group.candidatesDeferred += result.candidatesDeferred
  group.candidatesAmbiguous += result.candidatesAmbiguous + result.candidatesNotFound
  group.candidatesAlreadyLinked += result.candidatesAlreadyLinked
  group.identityApiRequestsSavedEstimate += result.estimatedApiSaved

  metrics.identityNotFound += result.candidatesNotFound
  metrics.identityAmbiguous += result.candidatesAmbiguous
  metrics.identityGameMismatch += result.candidatesMismatch
  metrics.identityOutOfWindow += result.candidatesOutOfWindow
  metrics.backlog.identityDeferred += result.candidatesDeferred
  metrics.identityQueueResolved += result.candidatesResolved + result.candidatesAlreadyLinked
  metrics.identityQueueUnresolved +=
    result.candidatesMismatch +
    result.candidatesOutOfWindow +
    result.candidatesDeferred +
    result.candidatesNotFound +
    result.candidatesAmbiguous
  metrics.verificationPagesTotal += result.verificationPages
  metrics.verificationPagesMax = Math.max(metrics.verificationPagesMax, result.verificationPages)
}

export function finalizeIdentityGroupMetrics(metrics: CollectorRunMetrics): void {
  const group = metrics.identityGroup
  if (group.identityGroupsCompleted <= 0) return
  group.averageCandidatesPerGroup = safeRatio(
    group.identityCandidatesInGroups,
    group.identityGroupsCompleted,
  )
  group.resolvedCandidatesPerVerificationPage = safeRatio(
    group.candidatesResolved,
    group.verificationPagesFetched,
  )
  const identityApi = group.nicknameResolveApiRequests + group.verificationPagesFetched
  group.resolvedCandidatesPerIdentityApiRequest = safeRatio(group.candidatesResolved, identityApi)
  group.identityApiRequestsPerResolvedCandidate = safeRatio(
    identityApi,
    group.candidatesResolved,
  )
  const processed =
    group.candidatesResolved +
    group.candidatesMismatch +
    group.candidatesOutOfWindow +
    group.candidatesDeferred +
    group.candidatesAmbiguous +
    group.candidatesAlreadyLinked
  group.identityApiRequestsPerProcessedCandidate = safeRatio(identityApi, processed)
  group.verificationPagesPerResolvedCandidate = safeRatio(
    group.verificationPagesFetched,
    group.candidatesResolved,
  )
  group.resolvedCandidatesPerGroup = safeRatio(
    group.candidatesResolved,
    group.identityGroupsCompleted,
  )
  group.processedCandidatesPerGroup = safeRatio(
    group.identityCandidatesInGroups,
    group.identityGroupsCompleted,
  )
}

export function createCollectorRunMetrics(
  pendingIdentitiesBefore: number,
): CollectorRunMetrics {
  return {
    api: {
      total: 0,
      gameDetail: 0,
      identityNicknameResolve: 0,
      identityGameVerification: 0,
      userGames: 0,
      other: 0,
    },
    work: {
      claimed: 0,
      completed: 0,
      skipped: 0,
      retried: 0,
      dead: 0,
      gameJobs: 0,
      identityJobs: 0,
      userJobs: 0,
      maintenanceJobs: 0,
    },
    noApi: {
      bindingHit: 0,
      nicknameCacheHit: 0,
      notFoundCacheHit: 0,
      ambiguousCacheHit: 0,
      dbCompleteGameSkip: 0,
      duplicateQueueSkip: 0,
      alreadyResolvedIdentitySkip: 0,
    },
    identityGroup: createIdentityGroupMetrics(),
    operationMode: createOperationModeMetrics(),
    identityNotFound: 0,
    identityAmbiguous: 0,
    identityGameMismatch: 0,
    identityOutOfWindow: 0,
    identityRetry: 0,
    identityDead: 0,
    quickPageResolved: 0,
    normalPageResolved: 0,
    deepPageResolved: 0,
    verificationPagesTotal: 0,
    verificationPagesMax: 0,
    newUsersDiscovered: 0,
    newGamesDiscovered: 0,
    newGameDetailsCollected: 0,
    playerMatchRowsWritten: 0,
    teamLuckCoverageBefore: null,
    teamLuckCoverageAfter: null,
    userQueueAdded: 0,
    userQueueCompleted: 0,
    gameQueueAdded: 0,
    gameQueueCompleted: 0,
    identityQueueAdded: 0,
    identityQueueResolved: 0,
    identityQueueUnresolved: 0,
    identityEnqueueSource: createIdentityEnqueueSourceMetrics(),
    balancedStability: null,
    backlog: {
      identityPendingBefore: pendingIdentitiesBefore,
      identityPendingAfter: pendingIdentitiesBefore,
      identityAdded: 0,
      identityResolved: 0,
      identityDeferred: 0,
      identityUnresolved: 0,
      identityGrowthAbsolute: 0,
      identityGrowthPercent: null,
      identitiesResolvedPer100ApiRequests: null,
      identityBacklogDrainRate: null,
      backlogTrend: 'stable',
    },
    effectivePercents: null,
    warnings: [],
  }
}

export function toLegacyEfficiencyMetrics(metrics: CollectorRunMetrics): CollectorEfficiencyMetrics {
  return {
    totalRequests: metrics.api.total,
    gameDetailRequests: metrics.api.gameDetail,
    identityResolveRequests: metrics.api.identityNicknameResolve,
    identityVerificationRequests: metrics.api.identityGameVerification,
    userGameRequests: metrics.api.userGames,
    maintenanceRequests: metrics.api.other,
    identityCandidatesProcessed: metrics.work.identityJobs,
    identityResolved: metrics.identityQueueResolved,
    identityNotFound: metrics.identityNotFound,
    identityAmbiguous: metrics.identityAmbiguous,
    identityGameMismatch: metrics.identityGameMismatch,
    identityOutOfWindow: metrics.identityOutOfWindow,
    identityRetry: metrics.identityRetry,
    identityDead: metrics.identityDead,
    quickPageResolved: metrics.quickPageResolved,
    normalPageResolved: metrics.normalPageResolved,
    deepPageResolved: metrics.deepPageResolved,
    verificationPagesTotal: metrics.verificationPagesTotal,
    verificationPagesMax: metrics.verificationPagesMax,
    bindingHit: metrics.noApi.bindingHit,
    nicknameCacheHit: metrics.noApi.nicknameCacheHit,
    notFoundCacheHit: metrics.noApi.notFoundCacheHit,
    ambiguousCacheHit: metrics.noApi.ambiguousCacheHit,
    officialApiResolve: metrics.api.identityNicknameResolve,
    newUsersDiscovered: metrics.newUsersDiscovered,
    newGamesDiscovered: metrics.newGamesDiscovered,
    newGameDetailsCollected: metrics.newGameDetailsCollected,
    playerMatchRowsWritten: metrics.playerMatchRowsWritten,
    teamLuckCoverageBefore: metrics.teamLuckCoverageBefore,
    teamLuckCoverageAfter: metrics.teamLuckCoverageAfter,
    userQueueAdded: metrics.userQueueAdded,
    userQueueCompleted: metrics.userQueueCompleted,
    gameQueueAdded: metrics.gameQueueAdded,
    gameQueueCompleted: metrics.gameQueueCompleted,
    identityQueueAdded: metrics.identityQueueAdded,
    identityQueueResolved: metrics.identityQueueResolved,
    identityQueueUnresolved: metrics.identityQueueUnresolved,
    warnings: metrics.warnings,
  }
}

export function recordVerificationTier(
  metrics: CollectorRunMetrics,
  tier: IdentityVerificationTier,
  pages: number,
): void {
  metrics.verificationPagesTotal += pages
  metrics.verificationPagesMax = Math.max(metrics.verificationPagesMax, pages)
  if (tier === 'quick') metrics.quickPageResolved += 1
  if (tier === 'normal') metrics.normalPageResolved += 1
  if (tier === 'deep') metrics.deepPageResolved += 1
}

export function finalizeBacklogMetrics(
  metrics: CollectorRunMetrics,
  pendingIdentitiesAfter: number,
): void {
  const before = metrics.backlog.identityPendingBefore
  const after = pendingIdentitiesAfter
  metrics.backlog.identityPendingAfter = after
  metrics.backlog.identityGrowthAbsolute = after - before
  metrics.backlog.identityGrowthPercent = safeRatio(after - before, before)
  metrics.backlog.backlogTrend = computeBacklogTrend(
    before,
    after,
    0.01,
  )
  metrics.backlog.identityResolved = metrics.identityQueueResolved
  metrics.backlog.identityUnresolved = metrics.identityQueueUnresolved
  metrics.backlog.identitiesResolvedPer100ApiRequests = safeRatio(
    metrics.identityQueueResolved * 100,
    metrics.api.total,
  )
  metrics.backlog.identityBacklogDrainRate = safeRatio(
    metrics.operationMode.identityProcessed || metrics.identityQueueResolved,
    metrics.backlog.identityAdded + metrics.identityQueueAdded,
  )
}

export function buildCostMetrics(metrics: CollectorRunMetrics): CollectorCostMetrics {
  const identityApi =
    metrics.api.identityNicknameResolve + metrics.api.identityGameVerification
  const cacheHits =
    metrics.noApi.bindingHit +
    metrics.noApi.nicknameCacheHit +
    metrics.noApi.notFoundCacheHit +
    metrics.noApi.ambiguousCacheHit
  const identityJobs = metrics.work.identityJobs

  return {
    totalApiRequestsPerNewUser: safeRatio(metrics.api.total, metrics.newUsersDiscovered),
    totalApiRequestsPerNewGame: safeRatio(metrics.api.total, metrics.newGamesDiscovered),
    totalApiRequestsPerPlayerMatchRow: safeRatio(
      metrics.api.total,
      metrics.playerMatchRowsWritten,
    ),
    identityApiRequestsPerResolvedIdentity: safeRatio(
      identityApi,
      metrics.identityQueueResolved,
    ),
    gameDetailApiRequestsPerNewGame: safeRatio(
      metrics.api.gameDetail,
      metrics.newGameDetailsCollected,
    ),
    userGameApiRequestsPerDiscoveredGame: safeRatio(
      metrics.api.userGames,
      metrics.newGamesDiscovered,
    ),
    resolvedIdentityRate: safeRatio(metrics.identityQueueResolved, identityJobs),
    cacheHitRate: safeRatio(cacheHits, identityJobs),
    bindingHitRate: safeRatio(metrics.noApi.bindingHit, identityJobs),
    averageVerificationPages: safeRatio(
      metrics.verificationPagesTotal,
      metrics.identityQueueResolved +
        metrics.identityGameMismatch +
        metrics.identityOutOfWindow,
    ),
    maxVerificationPages: metrics.verificationPagesMax > 0 ? metrics.verificationPagesMax : null,
    teamLuckCoverageAdded:
      metrics.teamLuckCoverageBefore != null && metrics.teamLuckCoverageAfter != null
        ? metrics.teamLuckCoverageAfter - metrics.teamLuckCoverageBefore
        : null,
  }
}

export function buildDailyCollectionEstimate(
  config: CollectorConfig,
  metrics: CollectorRunMetrics,
): DailyCollectionEstimate {
  const usable = collectorUsableDailyBudget(config)
  const fixedGameShare = config.gameBudgetPercent / 100
  const fixedIdentityShare = config.identityBudgetPercent / 100
  const fixedUserShare = config.userBudgetPercent / 100

  const observedTotal = Math.max(1, metrics.api.total)
  const observedGameShare = metrics.api.gameDetail / observedTotal
  const observedIdentityShare =
    (metrics.api.identityNicknameResolve + metrics.api.identityGameVerification) / observedTotal
  const observedUserShare = metrics.api.userGames / observedTotal

  const fixedGameApi = Math.floor(usable * fixedGameShare)
  const fixedIdentityApi = Math.floor(usable * fixedIdentityShare)
  const fixedUserApi = Math.floor(usable * fixedUserShare)

  const observedGameApi = Math.floor(usable * observedGameShare)
  const observedIdentityApi = Math.floor(usable * observedIdentityShare)
  const observedUserApi = Math.floor(usable * observedUserShare)

  const gamePerNew = safeRatio(metrics.api.gameDetail, metrics.newGameDetailsCollected) ?? 1
  const identityPerResolved =
    safeRatio(
      metrics.api.identityNicknameResolve + metrics.api.identityGameVerification,
      metrics.identityQueueResolved,
    ) ?? 1
  const userPerNew =
    safeRatio(metrics.api.userGames, metrics.newUsersDiscovered) ??
    safeRatio(metrics.api.total, metrics.newUsersDiscovered) ??
    1

  return {
    collectorUsableRequests: usable,
    fixedRatio: {
      gameApiRequests: fixedGameApi,
      identityApiRequests: fixedIdentityApi,
      userApiRequests: fixedUserApi,
      estimatedNewGames: safeRatio(fixedGameApi, gamePerNew),
      estimatedResolvedIdentities: safeRatio(fixedIdentityApi, identityPerResolved),
      estimatedNewUsers: safeRatio(
        Math.min(fixedUserApi, usable - fixedGameApi - fixedIdentityApi),
        userPerNew,
      ),
    },
    observedRatio: {
      gameApiRequests: observedGameApi,
      identityApiRequests: observedIdentityApi,
      userApiRequests: observedUserApi,
      estimatedNewGames: safeRatio(observedGameApi, gamePerNew),
      estimatedResolvedIdentities: safeRatio(observedIdentityApi, identityPerResolved),
      estimatedNewUsers: safeRatio(observedUserApi, userPerNew),
    },
  }
}

export function evaluateQueueGrowthWarnings(
  metrics: CollectorRunMetrics,
  queues: CollectorQueueSizeSnapshot,
): string[] {
  const warnings: string[] = []
  if (
    queues.pendingIdentitiesBefore > 0 &&
    queues.pendingIdentitiesAfter >= queues.pendingIdentitiesBefore * 2
  ) {
    warnings.push('pending identity queue doubled during run')
  }
  if (metrics.backlog.backlogTrend === 'growing') {
    warnings.push('identity backlog growing during run')
  }
  const identityJobs = metrics.work.identityJobs
  if (identityJobs > 0) {
    const avgPages = metrics.verificationPagesTotal / identityJobs
    if (avgPages > 5) warnings.push(`average verification pages high (${avgPages.toFixed(1)})`)
  }
  const deadRate = safeRatio(metrics.identityDead, identityJobs)
  if (deadRate != null && deadRate > 0.2) {
    warnings.push(`identity dead rate high (${(deadRate * 100).toFixed(1)}%)`)
  }
  return warnings
}

export interface CollectorRunReport {
  metrics: CollectorRunMetrics
  costs: CollectorCostMetrics
  dailyEstimate: DailyCollectionEstimate | null
  budget: CollectorRunBudgetSnapshot
  queues: CollectorQueueSizeSnapshot
  apiMetricsValid: boolean
  warnings: string[]
}

export function finalizeCollectorRunReport(
  metrics: CollectorRunMetrics,
  budget: CollectorRunBudgetSnapshot,
  queues: CollectorQueueSizeSnapshot,
  config: CollectorConfig,
): CollectorRunReport {
  finalizeBacklogMetrics(metrics, queues.pendingIdentitiesAfter)
  finalizeIdentityGroupMetrics(metrics)
  finalizeOperationModeMetrics(metrics)
  const growthWarnings = evaluateQueueGrowthWarnings(metrics, queues)
  return {
    metrics,
    costs: buildCostMetrics(metrics),
    dailyEstimate: metrics.api.total > 0 ? buildDailyCollectionEstimate(config, metrics) : null,
    budget,
    queues,
    apiMetricsValid: validateApiRequestMetrics(metrics.api),
    warnings: [...metrics.warnings, ...growthWarnings],
  }
}

export function createCollectorEfficiencyMetrics(
  pendingIdentitiesBefore = 0,
): CollectorEfficiencyMetrics {
  return toLegacyEfficiencyMetrics(createCollectorRunMetrics(pendingIdentitiesBefore))
}

export function buildDerivedMetrics(metrics: CollectorEfficiencyMetrics): CollectorCostMetrics {
  return buildCostMetrics({
    ...createCollectorRunMetrics(0),
    api: {
      total: metrics.totalRequests,
      gameDetail: metrics.gameDetailRequests,
      identityNicknameResolve: metrics.identityResolveRequests,
      identityGameVerification: metrics.identityVerificationRequests,
      userGames: metrics.userGameRequests,
      other: metrics.maintenanceRequests,
    },
    work: {
      claimed: 0,
      completed: 0,
      skipped: 0,
      retried: 0,
      dead: 0,
      gameJobs: 0,
      identityJobs: metrics.identityCandidatesProcessed,
      userJobs: 0,
      maintenanceJobs: 0,
    },
    noApi: {
      bindingHit: metrics.bindingHit,
      nicknameCacheHit: metrics.nicknameCacheHit,
      notFoundCacheHit: metrics.notFoundCacheHit,
      ambiguousCacheHit: metrics.ambiguousCacheHit,
      dbCompleteGameSkip: 0,
      duplicateQueueSkip: 0,
      alreadyResolvedIdentitySkip: 0,
    },
    identityNotFound: metrics.identityNotFound,
    identityAmbiguous: metrics.identityAmbiguous,
    identityGameMismatch: metrics.identityGameMismatch,
    identityOutOfWindow: metrics.identityOutOfWindow,
    identityRetry: metrics.identityRetry,
    identityDead: metrics.identityDead,
    quickPageResolved: metrics.quickPageResolved,
    normalPageResolved: metrics.normalPageResolved,
    deepPageResolved: metrics.deepPageResolved,
    verificationPagesTotal: metrics.verificationPagesTotal,
    verificationPagesMax: metrics.verificationPagesMax,
    newUsersDiscovered: metrics.newUsersDiscovered,
    newGamesDiscovered: metrics.newGamesDiscovered,
    newGameDetailsCollected: metrics.newGameDetailsCollected,
    playerMatchRowsWritten: metrics.playerMatchRowsWritten,
    teamLuckCoverageBefore: metrics.teamLuckCoverageBefore,
    teamLuckCoverageAfter: metrics.teamLuckCoverageAfter,
    userQueueAdded: metrics.userQueueAdded,
    userQueueCompleted: metrics.userQueueCompleted,
    gameQueueAdded: metrics.gameQueueAdded,
    gameQueueCompleted: metrics.gameQueueCompleted,
    identityQueueAdded: metrics.identityQueueAdded,
    identityQueueResolved: metrics.identityQueueResolved,
    identityQueueUnresolved: metrics.identityQueueUnresolved,
    backlog: {
      identityPendingBefore: 0,
      identityPendingAfter: 0,
      identityAdded: metrics.identityQueueAdded,
      identityResolved: metrics.identityQueueResolved,
      identityDeferred: 0,
      identityUnresolved: metrics.identityQueueUnresolved,
      identityGrowthAbsolute: 0,
      identityGrowthPercent: null,
      identitiesResolvedPer100ApiRequests: null,
      identityBacklogDrainRate: null,
      backlogTrend: 'stable',
    },
    effectivePercents: null,
    warnings: metrics.warnings,
  })
}
