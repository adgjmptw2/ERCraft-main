import type { FastifyPluginAsync, FastifyBaseLogger } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import {
  matchesCacheId,
  type MatchesCacheMode,
  readMatchesCache,
  writeMatchesCache,
} from '../cache/matchesCache.js'
import type { MatchesQueryMode } from '../types/matchesMode.js'
import {
  playerSeasonsCacheId,
  readPlayerSeasonsCache,
  readPlayerSeasonsCacheIncludingStale,
  shouldRefetchPlayerSeasonsChunk,
  writePlayerSeasonsCache,
} from '../cache/playerSeasonsCache.js'
import { resolveMatchDetail } from '../cache/matchDetailService.js'
import {
  readSeasonStatsCache,
  readSeasonStatsCacheSnapshot,
  seasonStatsCacheId,
  writeSeasonStatsCache,
} from '../cache/seasonStatsCache.js'
import {
  CHARACTER_GRADE_MATCH_MODE,
  computeCharacterGradeSourceFingerprint,
  readCharacterGradeSnapshot,
  resolveGradePlayerTierKey,
  snapshotNeedsGradeTierRecompute,
  writeCharacterGradeSnapshot,
} from '../cache/characterGradeSnapshot.js'
import {
  buildAndWriteSeasonAggregateFromCaches,
  countAggregateRankGames,
  readMatchesForSeasonAggregate,
  refreshSeasonAggregateFromCaches,
  pickSeasonAggregateResponseBody,
  seasonAggregateNeedsRankCacheRebuild,
} from '../cache/seasonAggregateService.js'
import {
  getLastBackfillWorkerTrace,
  isFullBackfillInflight,
  isSeasonDataCollectionComplete,
  runSeasonBackfillWorker,
  scheduleInternalBackfillChunk,
  shouldDeferBackfillRetry,
  shouldEnqueueSeasonBackfill,
  snapshotFullBackfillProgress,
} from '../cache/playerMatchBackfill.js'
import { buildCurrentSeasonCharacterStatsFromVerifiedSources } from '../cache/currentSeasonCharacterStats.js'
import { applyCharacterPerformanceGrades } from '../services/characterPerformanceGrade/compute.js'
import { computeOverallGradeV2ForCharacterStats } from '../services/overallGradeV2Hybrid.js'
import {
  PRODUCTION_ANALYSIS_AXES_VERSION,
  attachProductionAnalysisAxes,
} from '../services/analysis/productionAnalysisAxes.js'
import {
  computeTeamPerformanceSourceFingerprint,
  computeTeamPerformanceForMatch,
  summarizeTeamPerformance,
  TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
  TEAM_PERFORMANCE_BENCHMARK_VERSION,
  TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
  type TeamPerformanceParticipantRow,
} from '../services/teamPerformance.js'
import {
  readTeamLuckMetricCache,
  writeTeamLuckMetricCache,
} from '../cache/teamLuckMetricCache.js'
import {
  hasProfileCacheData,
  hasProfileCacheDataForUids,
  hasStoredSeasonHistory,
  resolveProfileLastRefreshedAt,
  shouldAllowAutoProfileBackfill,
} from '../cache/profileLastRefreshedAt.js'
import {
  buildProfileRefreshMeta,
  invalidateProfileRefreshMemoryCaches,
  readProfileLatestGameId,
  recordManualProfileRefresh,
  readRecentMatchCheck,
  recordRecentMatchCheckSuccess,
  type ProfileRefreshMeta,
} from '../cache/profileRefreshState.js'
import { readPersistedNicknameBinding } from '../cache/profileNicknameBinding.js'
import { readPersistedProfileAliasUids } from '../cache/profileIdentityAlias.js'
import {
  invalidateStoredMatchesCache,
  invalidateProfileRefreshDbCaches,
  prepareRecentMatchFreshnessCheck,
  type RecentMatchFreshnessDeps,
} from '../cache/recentMatchFreshness.js'
import {
  coordinateProfileEntryFreshness,
  type ProfileEntryFreshnessDeps,
  type ProfileEntryFreshnessResult,
} from '../cache/profileEntryFreshness.js'
import {
  readPlayerSeasonBackfillState,
  type PlayerSeasonBackfillStateRow,
} from '../cache/playerSeasonBackfillState.js'
import {
  countPlayerMatchRankGamesForSeason,
  hasPlayerMatch,
  isPrismaPlayerMatchReady,
  matchSummaryMissingLoadoutDetail,
  readLatestAccountLevelFromVerifiedSources,
  readMatchesPageFromPlayerMatch,
  readMatchesPageFromVerifiedSources,
  repairPlayerMatchDetailsFromSources,
  upsertFreshPlayerMatches,
  type FreshPlayerMatchInput,
} from '../cache/playerMatchStore.js'
import {
  readSeasonAggregateCache,
  seasonAggregateCacheId,
} from '../cache/seasonAggregateCache.js'
import { buildSeasonAggregateCoverage, normalizeCoverageCollectedGames, resolveSeasonAggregateBasisLabel } from '../cache/seasonAggregateBuilder.js'
import { enqueueSeasonAggregateRefresh, isSeasonAggregateRefreshInFlight } from '../cache/seasonAggregateRefreshQueue.js'
import {
  buildSeasonsCacheUidCandidates,
  resolveCanonicalUidFromDb,
  resolveDbStatsFingerprint,
  squadStatsFingerprint,
  tryReadSeasonsGridFromDb,
} from '../services/profileReadContext.js'
import { bootstrapProfileIdentityFromDb } from '../services/profileIdentityBootstrap.js'
import { traceProfileRead } from '../utils/profileReadTrace.js'
import { refreshSeasonsContractTiers } from '../utils/seasonRecordTier.js'
import { rehydrateCurrentSeasonRankInSeasonsGrid } from '../utils/seasonSeasonsRankHydrate.js'
import {
  buildSeasonsGridFromStatsCache,
  withSeasonsPartialStatus,
} from '../utils/seasonsDbFirst.js'
import { hydrateSeasonsGridContract } from '../utils/seasonsHistoricalMerge.js'
import { withSeasonsOwnerMetadata } from '../utils/seasonsOwner.js'
import {
  ProfileIdentityCache,
  resolveProfileIdentity,
  type ResolvedProfileIdentity,
} from '../utils/resolvedProfileIdentity.js'
import { config } from '../config/env.js'
import type {
  MatchSummaryContract,
  OverallGradeV2Contract,
  PaginatedContract,
  PlayerMatchCharacterStatsMetaContract,
  ProductionAnalysisAxesContract,
  PlayerSeasonAggregateContract,
} from '../contracts/player.js'
import type { PlayerSeasonsContract } from '../contracts/season.js'
import { BserApiError, BserClient, type BserUser, type BserUserStat } from '../external/bserClient.js'
import { runWithBserMetrics } from '../external/bserMetrics.js'
import {
  hasPlacement,
  mapToMatchSummary,
  mapToPlayerStats,
  mapToPlayerSummary,
  mapToSeasonRecord,
  uidToUserNum,
} from '../external/bserMapper.js'
import { loadSeasonCatalog, type SeasonCatalog } from '../external/seasonCatalog.js'
import {
  matchesQuery,
  playerAnalysisQuery,
  playerNicknameParams,
  playerSearchQuery,
  resolvePlayerSearchTerm,
  seasonIdQuery,
  seasonsQuery,
} from '../schemas.js'
import { apiResult, type ApiDataSource } from '../types/api.js'
import { resolveCharacterDisplayName } from '../utils/characterDisplayName.js'
import { buildPlayerAnalysisResponse } from '../services/playerAnalysis/builder.js'
import {
  invalidatePlayerAnalysisCache,
  readPlayerAnalysisCache,
  writePlayerAnalysisCache,
} from '../services/playerAnalysis/cache.js'
import { scheduleUserRoleSnapshotUpsert } from '../services/playerRoleSnapshot/background.js'
import { normalizeRankTier, resolveCharacterGradePlayerTier } from '../utils/rankTier.js'
import { HttpError } from '../utils/httpError.js'
import {
  resolveCanonicalUidForNickname,
  type SeasonStatsFingerprint,
} from '../cache/nicknameUidResolver.js'
import {
  logPlayerRouteMetrics,
  type PlayerRouteMetricsExtra,
} from '../utils/playerRouteMetrics.js'
import {
  assertMatchesPageIdentity,
  assertPlayerIdentityUserNum,
  assertResolvedProfileIdentity,
} from '../utils/playerIdentityAssert.js'

// BSER 프록시 라우트.
// uid는 외부로 노출하지 않고(개인정보 정책) 닉네임 키 + 짧은 in-memory 캐시로 처리한다.

const UID_CACHE_TTL_MS = 5 * 60_000
const GAMES_CACHE_TTL_MS = 60_000
const SEASON_CACHE_TTL_MS = 60 * 60_000
/** 페이지네이션 시 BSER next 커서를 따라가는 최대 횟수 (레이트 리미트 보호) */
const MAX_GAME_FETCHES = 12
const SEASON_AGGREGATE_REFRESH_MAX_PAGES = 5
const SEASON_AGGREGATE_RP_TARGET_POINTS = 7
const SEASON_FETCH_CONCURRENCY = 3

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index
      index += 1
      results[i] = await fn(items[i]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

interface PlayerIdentity {
  userNum?: number
  uid?: string
}

function identityFromQuery(query: { userNum?: number; uid?: string }): PlayerIdentity {
  const uid = query.uid?.trim()
  return {
    userNum: query.userNum,
    uid: uid && uid.length > 0 ? uid : undefined,
  }
}

function matchesCacheModeFromQuery(mode: MatchesQueryMode): MatchesCacheMode {
  return mode
}

function matchPassesModeFilter(
  match: MatchSummaryContract,
  mode: MatchesQueryMode,
): boolean {
  if (mode === 'all') return true
  return match.gameMode === mode
}

function matchesMemCacheKey(uid: string, mode: MatchesQueryMode): string {
  return matchesCacheId(uid, mode)
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

function fromCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key)
  if (!entry || entry.expiresAt < Date.now()) {
    map.delete(key)
    return undefined
  }
  return entry.value
}

function toHttpError(e: unknown): unknown {
  if (e instanceof BserApiError) {
    if (e.status === 404) return new HttpError(404, 'PLAYER_NOT_FOUND', 'Player not found')
    if (e.status === 504) {
      return new HttpError(
        504,
        'UPSTREAM_TIMEOUT',
        '공식 API 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
      )
    }
    if (e.status === 429 || e.status === 403) {
      return new HttpError(429, 'RATE_LIMITED', 'BSER rate limit exceeded, retry later')
    }
    return new HttpError(502, 'UPSTREAM_ERROR', `BSER upstream error: ${e.message}`)
  }
  return e
}

function seasonAggregateWarmupReason(aggregate: PlayerSeasonAggregateContract): string | null {
  const official = aggregate.coverage?.officialSeasonGames
  const collected = aggregate.coverage?.collectedGames
  if (
    official !== null &&
    official !== undefined &&
    official > 0 &&
    collected !== null &&
    collected !== undefined &&
    collected < official
  ) {
    return 'partial'
  }
  if (aggregate.cacheStatus !== 'ready') return aggregate.cacheStatus
  return null
}

function seasonAggregateNeedsOfficialStatsMerge(
  aggregate: PlayerSeasonAggregateContract,
): boolean {
  return aggregate.source === 'matchCache' || aggregate.source === 'playerMatch'
}

function seasonAggregateNeedsCacheRebuild(aggregate: PlayerSeasonAggregateContract): boolean {
  return aggregate.rpSeries.length > SEASON_AGGREGATE_RP_TARGET_POINTS
}

function seasonStatsTotalGames(stats: ReadonlyArray<BserUserStat> | null): number | null {
  const squad = stats?.find((row) => row.matchingTeamMode === 3) ?? stats?.[0]
  return squad && squad.totalGames > 0 ? squad.totalGames : null
}

function seasonAggregateNeedsStatsCoverageRebuild(
  aggregate: PlayerSeasonAggregateContract,
  stats: ReadonlyArray<BserUserStat> | null,
): boolean {
  const expectedGames = seasonStatsTotalGames(stats)
  if (expectedGames === null) return false
  const coveredGames = aggregate.characterStats.reduce((sum, row) => sum + row.games, 0)
  return coveredGames < expectedGames
}

function matchBelongsToSeason(
  match: MatchSummaryContract,
  apiSeasonId: number,
  displaySeasonId: number,
): boolean {
  return (
    match.seasonNumber == null ||
    match.seasonNumber === displaySeasonId ||
    match.seasonNumber === apiSeasonId
  )
}

function normalizeSeasonAggregateCharacterNames(
  aggregate: PlayerSeasonAggregateContract,
): PlayerSeasonAggregateContract {
  return {
    ...aggregate,
    characterStats: aggregate.characterStats.map((row) => ({
      ...row,
      characterName: resolveCharacterDisplayName(row.characterNum, row.characterName),
    })),
  }
}
function seasonAggregateResponse(
  aggregate: PlayerSeasonAggregateContract,
  options: {
    seasonDataComplete: boolean
    backfillInFlight?: boolean
  },
): PlayerSeasonAggregateContract {
  const source = aggregate.source ?? 'cache'
  const basisLabel =
    aggregate.basisLabel ??
    resolveSeasonAggregateBasisLabel({
      officialSeasonGames: aggregate.coverage?.officialSeasonGames ?? null,
      collectedGames: aggregate.coverage?.collectedGames ?? null,
    })
  const isRefreshing =
    !options.seasonDataComplete &&
    (options.backfillInFlight === true ||
      aggregate.backfillProgress?.status === 'running' ||
      aggregate.cacheStatus !== 'ready')
  return {
    ...aggregate,
    source,
    basisLabel,
    isRefreshing,
  }
}

function withSeasonAggregateCoverage(params: {
  aggregate: PlayerSeasonAggregateContract
  stats: ReadonlyArray<BserUserStat> | null
  matches: ReadonlyArray<MatchSummaryContract> | null
  apiSeasonId: number
  displaySeasonId: number
  rankGameCount?: number | null
}): PlayerSeasonAggregateContract {
  const coverage = normalizeCoverageCollectedGames(
    buildSeasonAggregateCoverage({
      stats: params.stats,
      matches: params.matches,
      apiSeasonId: params.apiSeasonId,
      displaySeasonId: params.displaySeasonId,
      characterCount: params.aggregate.characterStats.length,
      rpPointCount: params.aggregate.rpSeries.length,
    }),
    params.rankGameCount,
  )
  return {
    ...params.aggregate,
    coverage,
  }
}

function seasonAggregateNeedsEmptyCacheRebuild(aggregate: PlayerSeasonAggregateContract): boolean {
  return (
    aggregate.cacheStatus !== 'ready' &&
    aggregate.characterStats.length === 0 &&
    aggregate.rpSeries.length === 0
  )
}

function seasonAggregateCoverageComplete(aggregate: PlayerSeasonAggregateContract): boolean {
  const coverage = aggregate.coverage
  return (
    coverage?.officialSeasonGames !== null &&
    coverage?.officialSeasonGames !== undefined &&
    coverage.officialSeasonGames > 0 &&
    coverage.collectedGames !== null &&
    coverage.collectedGames !== undefined &&
    coverage.collectedGames >= coverage.officialSeasonGames
  )
}

function seasonAggregateRefreshPlan(params: {
  aggregate: PlayerSeasonAggregateContract
  isCurrent: boolean
  seasonDataComplete?: boolean
  backfillState?: PlayerSeasonBackfillStateRow | null
}): { reason: string | null; skipReason?: string } {
  if (!params.isCurrent) return { reason: null, skipReason: 'not-current-season' }
  if (params.seasonDataComplete) return { reason: null, skipReason: 'season-data-complete' }
  if (params.backfillState?.status === 'complete') {
    return { reason: null, skipReason: 'backfill-complete' }
  }
  const reason = seasonAggregateWarmupReason(params.aggregate)
  if (reason === null) return { reason: null, skipReason: 'ready' }
  if (seasonAggregateCoverageComplete(params.aggregate)) {
    return { reason: null, skipReason: 'coverage-complete' }
  }
  return { reason }
}

async function resolveSeasonAggregateIds(params: {
  requestedSeasonId?: number
  catalog: SeasonCatalog
  resolveCurrentApiSeasonId: () => Promise<number>
}): Promise<{ apiSeasonId: number; displaySeasonId: number; isCurrent: boolean }> {
  const currentApiSeasonId = params.catalog.currentApiSeasonIdOrNull()
  const currentDisplaySeason = params.catalog.currentDisplaySeason()

  if (params.requestedSeasonId === undefined) {
    const apiSeasonId = await params.resolveCurrentApiSeasonId()
    return {
      apiSeasonId,
      displaySeasonId: params.catalog.displayForApiId(apiSeasonId) ?? apiSeasonId,
      isCurrent: currentApiSeasonId !== null && apiSeasonId === currentApiSeasonId,
    }
  }

  if (currentApiSeasonId !== null && params.requestedSeasonId === currentApiSeasonId) {
    return {
      apiSeasonId: currentApiSeasonId,
      displaySeasonId:
        params.catalog.displayForApiId(currentApiSeasonId) ??
        currentDisplaySeason ??
        params.requestedSeasonId,
      isCurrent: true,
    }
  }

  const displaySeasonId = params.requestedSeasonId
  const apiSeasonId = params.catalog.apiIdForDisplay(displaySeasonId) ?? displaySeasonId

  return {
    apiSeasonId,
    displaySeasonId,
    isCurrent: currentApiSeasonId !== null && apiSeasonId === currentApiSeasonId,
  }
}

async function withPlayerRoute<T>(
  log: FastifyBaseLogger,
  route: string,
  nickname: string,
  extra: PlayerRouteMetricsExtra,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now()
  return runWithBserMetrics(async () => {
    try {
      return await fn()
    } finally {
      logPlayerRouteMetrics(log, route, nickname, started, extra)
    }
  })
}

const playersRoutes: FastifyPluginAsync = async (app) => {
  const bser = new BserClient(config.bserApiKey)

  const uidCache = new Map<string, CacheEntry<BserUser | null>>()
  const gamesCache = new Map<
    string,
    CacheEntry<{ items: MatchSummaryContract[]; next?: number }>
  >()
  const accountLevelCache = new Map<string, CacheEntry<number | undefined>>()
  const rankCache = new Map<string, CacheEntry<Awaited<ReturnType<BserClient['getUserRank']>>>>()
  const uidInflight = new Map<string, Promise<BserUser | null>>()
  const rankInflight = new Map<string, Promise<Awaited<ReturnType<BserClient['getUserRank']>>>>()
  const userStatsCache = new Map<string, CacheEntry<BserUserStat[]>>()
  const userSeasonsCache = new Map<string, CacheEntry<PlayerSeasonsContract>>()
  const userStatsInflight = new Map<string, Promise<BserUserStat[]>>()
  const teamPerformanceParticipantBackfillInflight = new Set<string>()
  const characterGradeInflight = new Map<string, Promise<void>>()
  const profileIdentityCache = new ProfileIdentityCache()

  /** uid+seasonId 키 단기 캐시 — summary/stats/seasons가 같은 rank를 중복 조회하지 않게 */
  async function getRankCached(
    uid: string,
    seasonId: number,
    metrics?: PlayerRouteMetricsExtra,
  ) {
    const key = `${uid}:${seasonId}`
    const cached = fromCache(rankCache, key)
    if (cached !== undefined) {
      if (metrics) metrics.rankCache = 'hit'
      return cached
    }
    const inflight = rankInflight.get(key)
    if (inflight) {
      if (metrics) metrics.rankCache = 'inflight'
      return inflight
    }
    if (metrics) metrics.rankCache = 'miss'
    const load = bser.getUserRank(uid, seasonId).then((rank) => {
      rankCache.set(key, { value: rank, expiresAt: Date.now() + SEASON_CACHE_TTL_MS })
      return rank
    })
    rankInflight.set(key, load)
    try {
      return await load
    } finally {
      rankInflight.delete(key)
    }
  }

  /** stats — 메모리 → DB(이전 시즌 영구·현재 1h) → BSER */
  async function getUserStatsCached(
    uid: string,
    apiSeasonId: number,
    metrics?: PlayerRouteMetricsExtra,
  ): Promise<{ stats: BserUserStat[]; source: ApiDataSource; bserCalled: boolean }> {
    const key = `${uid}:${apiSeasonId}`
    const memCached = fromCache(userStatsCache, key)
    if (memCached !== undefined) {
      if (metrics) {
        metrics.statsSource = 'cache'
        metrics.statsBserCalled = false
      }
      return { stats: memCached, source: 'cache', bserCalled: false }
    }

    const inflight = userStatsInflight.get(key)
    if (inflight) {
      const stats = await inflight
      if (metrics) {
        metrics.statsSource = 'cache'
        metrics.statsBserCalled = false
      }
      return { stats, source: 'cache', bserCalled: false }
    }

    const load = (async (): Promise<BserUserStat[]> => {
      const cacheId = seasonStatsCacheId(uid, apiSeasonId)
      const dbCached = await readSeasonStatsCache(app.prisma, cacheId)
      if (dbCached !== null) {
        userStatsCache.set(key, { value: dbCached, expiresAt: Date.now() + SEASON_CACHE_TTL_MS })
        if (metrics) {
          metrics.statsSource = 'cache'
          metrics.statsBserCalled = false
        }
        return dbCached
      }

      const catalog = await resolveSeasonCatalog()
      const currentApiId = catalog.currentApiSeasonIdOrNull()
      const isCurrent = currentApiId !== null && apiSeasonId === currentApiId

      if (metrics) {
        metrics.statsSource = 'external'
        metrics.statsBserCalled = true
      }
      const stats = await bser.getUserStats(uid, apiSeasonId)
      await writeSeasonStatsCache(app.prisma, cacheId, stats, isCurrent)
      userStatsCache.set(key, { value: stats, expiresAt: Date.now() + SEASON_CACHE_TTL_MS })
      return stats
    })()

    userStatsInflight.set(key, load)
    try {
      const stats = await load
      const source: ApiDataSource = metrics?.statsBserCalled ? 'external' : 'cache'
      return { stats, source, bserCalled: metrics?.statsBserCalled === true }
    } finally {
      userStatsInflight.delete(key)
    }
  }

  async function computeAndStoreCharacterGradeSnapshot(params: {
    canonicalUid: string
    canonicalUserNum: number
    playerMatchUids: string[]
    apiSeasonId: number
    displaySeasonId: number
    playerTier: ReturnType<typeof normalizeRankTier> | null
    sourceFingerprint: string
  }): Promise<{
    characterStats: Awaited<ReturnType<typeof buildCurrentSeasonCharacterStatsFromVerifiedSources>>['characterStats']
    meta: PlayerMatchCharacterStatsMetaContract
    overallGradeV2: OverallGradeV2Contract | null
    overallAnalysisAxes: ProductionAnalysisAxesContract | null
  } | null> {
    if (!isPrismaPlayerMatchReady(app.prisma)) return null
    const key = `${params.canonicalUserNum}:${params.apiSeasonId}:${CHARACTER_GRADE_MATCH_MODE}`
    const existing = characterGradeInflight.get(key)
    if (existing) {
      await existing
      const snapshot = await readCharacterGradeSnapshot(app.prisma, {
        canonicalUserNum: params.canonicalUserNum,
        apiSeasonId: params.apiSeasonId,
        matchMode: CHARACTER_GRADE_MATCH_MODE,
      })
      return snapshot
        ? {
            characterStats: snapshot.characterStats,
            meta: snapshot.meta,
            overallGradeV2: snapshot.overallGradeV2 ?? null,
            overallAnalysisAxes: snapshot.overallAnalysisAxes ?? null,
          }
        : null
    }

    let computedResult: {
      characterStats: Awaited<ReturnType<typeof buildCurrentSeasonCharacterStatsFromVerifiedSources>>['characterStats']
      meta: PlayerMatchCharacterStatsMetaContract
      overallGradeV2: OverallGradeV2Contract | null
      overallAnalysisAxes: ProductionAnalysisAxesContract | null
    } | null = null
    const load = (async () => {
      const pmStats = await buildCurrentSeasonCharacterStatsFromVerifiedSources(app.prisma, {
        uid: params.canonicalUid,
        playerMatchUids: params.playerMatchUids,
        apiSeasonId: params.apiSeasonId,
        displaySeasonId: params.displaySeasonId,
      })
      const matchCount = pmStats.deduplicatedMatchCount
      const metaStatus =
        pmStats.characterStats.length > 0
          ? ('complete' as const)
          : matchCount > 0
            ? ('partial' as const)
            : ('complete' as const)
      const graded =
        metaStatus === 'complete' && pmStats.characterStats.length > 0
          ? applyCharacterPerformanceGrades({
              rows: pmStats.rows,
              characterStats: pmStats.characterStats,
              metaStatus: 'complete',
              playerTier: params.playerTier,
            })
          : pmStats.characterStats
      const computedAt = new Date()
      const overallGradeV2 = computeOverallGradeV2ForCharacterStats({
        canonicalUserNum: params.canonicalUserNum,
        matchMode: CHARACTER_GRADE_MATCH_MODE,
        characterStats: graded,
        rows: pmStats.rows,
        playerTier: params.playerTier,
        sourceFingerprint: params.sourceFingerprint,
        computedAt,
      })
      const analysisAxes = attachProductionAnalysisAxes({
        rows: pmStats.rows,
        characterStats: graded,
        overallGradeV2,
        playerTier: params.playerTier,
        displaySeasonId: params.displaySeasonId,
      })
      const gradePlayerTierKey = resolveGradePlayerTierKey(params.playerTier)
      const meta: PlayerMatchCharacterStatsMetaContract = {
        status: metaStatus,
        snapshotStatus: graded.length > 0 ? 'ready' : 'insufficient-data',
        userNum: params.canonicalUserNum,
        seasonId: params.displaySeasonId,
        generatedAt: computedAt.toISOString(),
        rowCount: graded.length,
        matchCount,
        sourceCount: pmStats.sourceCount,
        rawMatchCount: pmStats.rawMatchCount,
        deduplicatedMatchCount: pmStats.deduplicatedMatchCount,
        sourceFingerprint: params.sourceFingerprint,
        computedAt: computedAt.toISOString(),
        overallGradeVersion: overallGradeV2?.overallGradeVersion,
        gradePlayerTierKey,
      }
      computedResult = {
        characterStats: analysisAxes.characterStats,
        meta,
        overallGradeV2,
        overallAnalysisAxes: analysisAxes.overallAnalysisAxes,
      }
      if (analysisAxes.characterStats.length > 0) {
        await writeCharacterGradeSnapshot(app.prisma, {
          uid: params.canonicalUid,
          canonicalUserNum: params.canonicalUserNum,
          apiSeasonId: params.apiSeasonId,
          displaySeasonId: params.displaySeasonId,
          matchMode: CHARACTER_GRADE_MATCH_MODE,
          sourceFingerprint: params.sourceFingerprint,
          status: 'ready',
          characterStats: analysisAxes.characterStats,
          meta,
          overallGradeV2,
          overallAnalysisAxes: analysisAxes.overallAnalysisAxes,
          computedAt,
        })
      }
    })()

    characterGradeInflight.set(key, load)
    try {
      await load
    } finally {
      characterGradeInflight.delete(key)
    }
    if (computedResult) return computedResult
    const snapshot = await readCharacterGradeSnapshot(app.prisma, {
      canonicalUserNum: params.canonicalUserNum,
      apiSeasonId: params.apiSeasonId,
      matchMode: CHARACTER_GRADE_MATCH_MODE,
    })
    return snapshot
      ? {
          characterStats: snapshot.characterStats,
          meta: snapshot.meta,
          overallGradeV2: snapshot.overallGradeV2 ?? null,
          overallAnalysisAxes: snapshot.overallAnalysisAxes ?? null,
        }
      : null
  }

  let seasonCache: CacheEntry<number> | null = null
  let seasonCatalogCache: CacheEntry<SeasonCatalog> | null = null
  let seasonCatalogPromise: Promise<SeasonCatalog> | null = null
  let characterNames: ReadonlyMap<number, string> | null = null
  let characterNamesPromise: Promise<ReadonlyMap<number, string>> | null = null

  function requireApiKey(): void {
    if (!bser.isConfigured) {
      throw new HttpError(
        503,
        'UPSTREAM_ERROR',
        '공식 API 연결을 확인할 수 없습니다. 서버 설정을 확인해 주세요.',
      )
    }
  }

  function logSearchDev(request: { log: { info: (obj: object, msg: string) => void }; url: string }, nickname: string, found: boolean): void {
    if (process.env.NODE_ENV === 'production') return
    request.log.info(
      { path: request.url, nickname, found },
      'player search',
    )
  }

  function logBackfillDecisionDev(
    log: FastifyBaseLogger,
    payload: {
      nickname: string
      userNum: number
      apiSeasonId: number
      displaySeasonId: number
      backfillStatus: string | null
      backfillCollectedGames: number | null
      officialSeasonGames: number | null
      playerMatchCount: number
      aggregateCacheStatus: string | null
      aggregateCollectedGames: number | null
      decision: string
      reason: string
      willEnqueue: boolean
    },
  ): void {
    if (process.env.NODE_ENV === 'production') return
    log.info(payload, 'season backfill decision')
  }

  async function resolveSeasonCatalog(): Promise<SeasonCatalog> {
    if (seasonCatalogCache && seasonCatalogCache.expiresAt > Date.now()) {
      return seasonCatalogCache.value
    }
    if (seasonCatalogPromise) return seasonCatalogPromise
    seasonCatalogPromise = loadSeasonCatalog(bser)
      .then((catalog) => {
        seasonCatalogCache = { value: catalog, expiresAt: Date.now() + SEASON_CACHE_TTL_MS }
        return catalog
      })
      .catch((e) => {
        seasonCatalogPromise = null
        throw e
      })
    return seasonCatalogPromise
  }

  /** BSER API seasonID (rank/stats 호출용) — catalog 우선, PlayerMatch 저장 ID와 일치 */
  async function resolveSeasonId(): Promise<number> {
    const catalog = await resolveSeasonCatalog()
    const detected = catalog.currentApiSeasonIdOrNull()
    if (detected !== null) {
      seasonCache = { value: detected, expiresAt: Date.now() + SEASON_CACHE_TTL_MS }
      return detected
    }
    if (config.bserSeasonId > 0) return config.bserSeasonId
    if (seasonCache && seasonCache.expiresAt > Date.now()) return seasonCache.value
    throw new HttpError(502, 'UPSTREAM_ERROR', 'Failed to detect current season')
  }

  /** UI S11 등 표시 시즌 번호 */
  async function resolveDisplaySeasonId(): Promise<number> {
    const catalog = await resolveSeasonCatalog()
    const fromCatalog = catalog.currentDisplaySeason()
    if (fromCatalog !== null) return fromCatalog
    const apiId = await resolveSeasonId()
    return catalog.displayForApiId(apiId) ?? apiId
  }

  async function resolveSeasonCanonicalUser(
    nickname: string,
    user: BserUser,
    apiSeasonId: number,
    statsFingerprint: SeasonStatsFingerprint | null,
    metrics?: PlayerRouteMetricsExtra,
  ): Promise<BserUser> {
    const canonical = await resolveCanonicalUidForNickname(app.prisma, nickname, user.uid, {
      apiSeasonId,
      statsFingerprint,
    })
    if (!canonical.swapped) return user
    if (metrics) {
      metrics.uidCacheCanonicalSwap = true
      metrics.canonicalUidReason = canonical.reason
      metrics.canonicalBserUid = canonical.bserUid
    }
    const resolved = { uid: canonical.uid, nickname: user.nickname }
    // canonical uid 보호 — 이후 route가 같은 닉네임에 complete uid를 재사용
    uidCache.set(nickname.trim().toLowerCase(), {
      value: resolved,
      expiresAt: Date.now() + UID_CACHE_TTL_MS,
    })
    return resolved
  }

  /** summary/stats/season-aggregate — 동일 canonical uid (캐시 fingerprint → deduped stats) */
  async function resolveProfileCanonicalUser(
    nickname: string,
    user: BserUser,
    apiSeasonId: number,
    metrics?: PlayerRouteMetricsExtra,
    statsFingerprint?: SeasonStatsFingerprint | null,
  ): Promise<BserUser> {
    let fingerprint = statsFingerprint ?? null
    if (!fingerprint) {
      const cachedStats = await readSeasonStatsCacheSnapshot(
        app.prisma,
        seasonStatsCacheId(user.uid, apiSeasonId),
      )
      fingerprint = squadStatsFingerprint(cachedStats)
    }
    if (!fingerprint) {
      const statsResolved = await getUserStatsCached(user.uid, apiSeasonId, metrics)
      fingerprint = squadStatsFingerprint(statsResolved.stats)
    }
    return resolveSeasonCanonicalUser(nickname, user, apiSeasonId, fingerprint, metrics)
  }

  async function bootstrapGameIdsForLookup(...candidateUids: string[]): Promise<string[]> {
    const gameIds = new Set<string>()
    for (const lookupUid of candidateUids) {
      if (!lookupUid) continue
      const cacheKey = matchesMemCacheKey(lookupUid, 'all')
      const memCached = fromCache(gamesCache, cacheKey)
      if (memCached?.items.length) {
        for (const item of memCached.items.slice(0, 16)) gameIds.add(item.matchId)
      }
      const dbCached = await readMatchesCache(app.prisma, matchesCacheId(lookupUid, 'all'))
      if (dbCached?.items.length) {
        for (const item of dbCached.items.slice(0, 16)) gameIds.add(item.matchId)
      }
      if (gameIds.size >= 16) break
    }
    return [...gameIds].slice(0, 16)
  }

  async function ensureIdentityBootstrappedFromDb(
    nickname: string,
    lookupUid: string,
    apiSeasonId: number,
    explicitLookup: boolean,
  ): Promise<boolean> {
    if (explicitLookup) return false
    const bootstrapped = await bootstrapProfileIdentityFromDb(
      app.prisma,
      nickname,
      lookupUid,
      apiSeasonId,
    )
    if (bootstrapped?.bootstrapped) {
      profileIdentityCache.invalidateNickname(nickname.trim().toLowerCase())
      return true
    }
    return false
  }

  async function loadProfileIdentity(
    nickname: string,
    lookupUser: BserUser,
    apiSeasonId: number,
    metrics?: PlayerRouteMetricsExtra,
    prefetchedFingerprint?: SeasonStatsFingerprint | null,
    explicitLookup = false,
  ): Promise<ResolvedProfileIdentity> {
    let fingerprint = prefetchedFingerprint ?? null
    if (!fingerprint) {
      const cachedStats = await readSeasonStatsCacheSnapshot(
        app.prisma,
        seasonStatsCacheId(lookupUser.uid, apiSeasonId),
      )
      fingerprint = squadStatsFingerprint(cachedStats)
    }
    if (!fingerprint) {
      fingerprint = await resolveDbStatsFingerprint(
        app.prisma,
        nickname,
        lookupUser.uid,
        apiSeasonId,
      )
    }

    if (!explicitLookup) {
      await ensureIdentityBootstrappedFromDb(nickname, lookupUser.uid, apiSeasonId, explicitLookup)
    }

    const canonicalResolution = explicitLookup
      ? {
          uid: lookupUser.uid,
          swapped: false,
          bserUid: lookupUser.uid,
          storedUid: null,
        }
      : await resolveCanonicalUidForNickname(
          app.prisma,
          nickname.trim(),
          lookupUser.uid,
          {
            apiSeasonId,
            statsFingerprint: fingerprint ?? undefined,
          },
        )
    const bootstrapGameIds = await bootstrapGameIdsForLookup(
      lookupUser.uid,
      canonicalResolution.bserUid,
      canonicalResolution.storedUid ?? canonicalResolution.uid,
    )

    const buildFallbackIdentity = (canonicalUid: string): ResolvedProfileIdentity => ({
      requestedNickname: nickname.trim(),
      normalizedNickname: nickname.trim().toLowerCase(),
      owner: {
        canonicalUid,
        canonicalUserNum: uidToUserNum(canonicalUid),
      },
      sources: {
        profileUid: lookupUser.uid,
        seasonUids: [...new Set([lookupUser.uid, canonicalUid])].sort(),
        playerMatchUids: [...new Set([canonicalUid, lookupUser.uid])].sort(),
      },
      verification: {
        method: 'canonical',
        status: 'partial',
        verifiedAliasUids: [],
      },
      resolvedAt: new Date().toISOString(),
    })

    const resolveParams = {
      nickname,
      lookupUid: lookupUser.uid,
      apiSeasonId,
      statsFingerprint: fingerprint,
      canonicalResolution,
      bootstrapGameIds,
    }

    try {
      let identity: ResolvedProfileIdentity
      if (explicitLookup) {
        identity = await resolveProfileIdentity(app.prisma, resolveParams)
      } else {
        identity = await profileIdentityCache.resolve(
          app.prisma,
          resolveParams,
          () => resolveProfileIdentity(app.prisma, resolveParams),
        )
      }

      assertResolvedProfileIdentity(app.log, identity, 'loadProfileIdentity')

      if (identity.owner.canonicalUid !== lookupUser.uid) {
        uidCache.set(identity.normalizedNickname, {
          value: { uid: identity.owner.canonicalUid, nickname: identity.requestedNickname },
          expiresAt: Date.now() + UID_CACHE_TTL_MS,
        })
        if (metrics) {
          metrics.uidCacheCanonicalSwap = true
          metrics.canonicalBserUid = lookupUser.uid
        }
      }

      return identity
    } catch (err) {
      if (err instanceof HttpError) throw err
      return buildFallbackIdentity(lookupUser.uid)
    }
  }

  function rememberAccountLevelForIdentity(
    identity: ResolvedProfileIdentity,
    level: number | undefined,
  ): number | undefined {
    if (level === undefined) return undefined
    const uids = new Set<string>([
      identity.sources.profileUid,
      identity.owner.canonicalUid,
      ...identity.sources.playerMatchUids,
      ...identity.sources.seasonUids,
    ])
    for (const uid of uids) {
      rememberAccountLevel(uid, level)
    }
    return level
  }

  function resolveAccountLevelForIdentity(identity: ResolvedProfileIdentity): number | undefined {
    const tryUids = [
      identity.sources.profileUid,
      identity.owner.canonicalUid,
      ...identity.sources.playerMatchUids,
      ...identity.sources.seasonUids,
    ]
    const seen = new Set<string>()
    for (const uid of tryUids) {
      if (seen.has(uid)) continue
      seen.add(uid)
      const level = cachedAccountLevel(uid)
      if (level !== undefined) return level
    }
    return undefined
  }

  function canonicalBserUser(identity: ResolvedProfileIdentity): BserUser {
    return {
      uid: identity.owner.canonicalUid,
      nickname: identity.requestedNickname,
    }
  }

  /** BSER 조회·PlayerMatch 소유권 기준 uid — nickname lookup uid */
  function profileMatchOwner(identity: ResolvedProfileIdentity): BserUser {
    return {
      uid: identity.sources.profileUid,
      nickname: identity.requestedNickname,
    }
  }

  async function resolveUser(
    nickname: string,
    identity: PlayerIdentity = {},
    metrics?: PlayerRouteMetricsExtra,
  ): Promise<BserUser> {
    const trimmed = nickname.trim()
    const key = trimmed.toLowerCase()

    if (identity.uid) {
      if (metrics) metrics.uidCache = 'explicit'
      return { uid: identity.uid, nickname: trimmed }
    }

    if (identity.userNum !== undefined && identity.userNum > 0) {
      const bindingByUserNum = await app.prisma.profileNicknameBinding.findFirst({
        where: { canonicalUserNum: BigInt(identity.userNum) },
        select: { canonicalUid: true, canonicalUserNum: true },
      })
      if (bindingByUserNum) {
        const resolved = { uid: bindingByUserNum.canonicalUid, nickname: trimmed }
        uidCache.set(key, { value: resolved, expiresAt: Date.now() + UID_CACHE_TTL_MS })
        if (metrics) metrics.uidCache = 'userNum-binding'
        return resolved
      }
      if (metrics) metrics.uidCache = 'userNum-unbound'
    }

    const persistedBinding = await readPersistedNicknameBinding(app.prisma, trimmed)
    if (persistedBinding && isPrismaPlayerMatchReady(app.prisma)) {
      const pmCount = await app.prisma.playerMatch.count({
        where: { uid: persistedBinding.canonicalUid },
      })
      if (pmCount > 0) {
        const resolved = { uid: persistedBinding.canonicalUid, nickname: trimmed }
        uidCache.set(key, { value: resolved, expiresAt: Date.now() + UID_CACHE_TTL_MS })
        if (metrics) metrics.uidCache = 'hit'
        return resolved
      }
    } else if (persistedBinding) {
      const resolved = { uid: persistedBinding.canonicalUid, nickname: trimmed }
      uidCache.set(key, { value: resolved, expiresAt: Date.now() + UID_CACHE_TTL_MS })
      if (metrics) metrics.uidCache = 'hit'
      return resolved
    }

    const cached = fromCache(uidCache, key)
    if (cached !== undefined) {
      if (metrics) metrics.uidCache = 'hit'
      if (!cached) {
        throw new HttpError(
          404,
          'PLAYER_NOT_FOUND',
          '플레이어를 찾을 수 없습니다. 닉네임을 정확히 입력해 주세요.',
        )
      }
      const canonical = await resolveCanonicalUidForNickname(app.prisma, trimmed, cached.uid)
      if (canonical.swapped) {
        const resolved = { uid: canonical.uid, nickname: trimmed }
        uidCache.set(key, { value: resolved, expiresAt: Date.now() + UID_CACHE_TTL_MS })
        if (metrics) metrics.uidCacheCanonicalSwap = true
        return resolved
      }
      return cached
    }
    let inflight = uidInflight.get(key)
    if (inflight) {
      if (metrics) metrics.uidCache = 'inflight'
    } else {
      if (metrics) metrics.uidCache = 'miss'
      inflight = (async () => {
        const user = await bser.getUserByNickname(trimmed)
        if (!user) {
          uidCache.set(key, { value: null, expiresAt: Date.now() + UID_CACHE_TTL_MS })
          return null
        }
        const canonical = await resolveCanonicalUidForNickname(app.prisma, trimmed, user.uid)
        const resolved = canonical.swapped
          ? { uid: canonical.uid, nickname: trimmed }
          : user
        uidCache.set(key, { value: resolved, expiresAt: Date.now() + UID_CACHE_TTL_MS })
        return resolved
      })()
      uidInflight.set(key, inflight)
    }
    try {
      const user = await inflight
      if (!user) {
        throw new HttpError(
          404,
          'PLAYER_NOT_FOUND',
          '플레이어를 찾을 수 없습니다. 닉네임을 정확히 입력해 주세요.',
        )
      }
      return user
    } finally {
      if (uidInflight.get(key) === inflight) {
        uidInflight.delete(key)
      }
    }
  }

  async function resolveCharacterNames(): Promise<ReadonlyMap<number, string>> {
    if (characterNames) return characterNames
    if (!characterNamesPromise) {
      characterNamesPromise = bser.getCharacterNames().then((names) => {
        characterNames = names
        return names
      })
    }
    return characterNamesPromise
  }

  /** Season·캐릭터 l10n — 첫 사용자 대기 없이 서버 기동 시 미리 로드 (테스트·CI에서는 비활성) */
  app.addHook('onReady', async () => {
    if (process.env.NODE_ENV === 'test') return
    if (!bser.isConfigured) return
    const started = Date.now()
    try {
      await Promise.all([resolveCharacterNames(), resolveSeasonCatalog()])
      app.log.info({ ms: Date.now() - started }, 'BSER static data prewarmed')
    } catch (e) {
      app.log.warn({ err: e }, 'BSER static data prewarm failed')
    }
  })

  function rememberAccountLevel(uid: string, level: number | undefined): number | undefined {
    accountLevelCache.set(uid, { value: level, expiresAt: Date.now() + GAMES_CACHE_TTL_MS })
    return level
  }

  function cachedAccountLevel(uid: string): number | undefined {
    return fromCache(accountLevelCache, uid)
  }

  /** BSER next 커서를 따라가며 offset+pageSize 까지 수집 — hasNext는 마지막 BSER next 커서로 판단 */
  async function collectMatches(
    user: BserUser,
    needed: number,
    metrics?: PlayerRouteMetricsExtra,
    options: {
      mode?: MatchesQueryMode
      maxFetches?: number
      stopAtDuplicate?: boolean
      bypassCache?: boolean
      storeUid?: string
      stopAtSeasonBoundary?: { apiSeasonId: number; displaySeasonId: number }
      log?: FastifyBaseLogger
    } = {},
  ): Promise<{ items: MatchSummaryContract[]; next?: number }> {
    const mode = options.mode ?? 'all'
    const storeUid = options.storeUid ?? user.uid
    const cacheMode = matchesCacheModeFromQuery(mode)
    const cacheKey = matchesMemCacheKey(storeUid, cacheMode)
    const bypassCache = options.bypassCache === true
    const memCached = bypassCache ? undefined : fromCache(gamesCache, cacheKey)
    let items = memCached?.items ?? []
    let next = memCached?.next
    let loadedFromMemory = memCached !== undefined

    if (!bypassCache && !loadedFromMemory) {
      const dbCached = await readMatchesCache(app.prisma, matchesCacheId(storeUid, cacheMode))
      if (dbCached) {
        items = dbCached.items
        next = dbCached.next
        loadedFromMemory = true
        gamesCache.set(cacheKey, {
          value: { items, next },
          expiresAt: Date.now() + GAMES_CACHE_TTL_MS,
        })
        metrics?.cacheHits?.push('db')
      }
    } else if (!bypassCache && loadedFromMemory) {
      metrics?.cacheHits?.push('games')
    }

    if (items.length >= needed || (loadedFromMemory && next === undefined)) {
      if (metrics) {
        metrics.matchesNeeded = needed
        metrics.matchesStoppedReason = 'cache-satisfied'
        if (loadedFromMemory) {
          metrics.matchesSource = memCached ? 'memory' : 'db'
        }
      }
      return { items, next }
    }

    const names = characterNames ?? new Map<number, string>()
    const catalog =
      seasonCatalogCache && seasonCatalogCache.expiresAt > Date.now()
        ? seasonCatalogCache.value
        : undefined
    if (metrics) {
      metrics.staticCharacterNames = characterNames
        ? 'cached'
        : characterNamesPromise
          ? 'prewarm'
          : 'fallback'
      metrics.staticSeasonCatalog = catalog
        ? 'cached'
        : seasonCatalogPromise
          ? 'prewarm'
          : 'fallback'
      metrics.matchesNeeded = needed
      metrics.matchesSource = 'bser'
    }
    if (!characterNames) {
      void resolveCharacterNames().catch(() => {})
    }
    if (!catalog) {
      void resolveSeasonCatalog().catch(() => {})
    }

    let fetches = 0
    let cursor = next
    let exhausted = loadedFromMemory ? next === undefined : false
    const maxFetches = options.maxFetches ?? MAX_GAME_FETCHES
    const knownMatchIds = new Set(items.map((item) => item.matchId))
    let stoppedReason: PlayerRouteMetricsExtra['matchesStoppedReason'] | undefined
    const playerMatchReady = isPrismaPlayerMatchReady(app.prisma)
    if (metrics) {
      metrics.playerMatchStoreReady = playerMatchReady
    }
    let catalogForUpsert: SeasonCatalog | undefined = catalog
    let catalogResolveAttempted = Boolean(catalogForUpsert)

    while (items.length < needed && !exhausted && fetches < maxFetches) {
      const page = await bser.getUserGames(user.uid, cursor)
      if (page.games[0]?.accountLevel !== undefined) {
        rememberAccountLevel(user.uid, page.games[0].accountLevel)
      }
      const mapped = page.games.map((g) => mapToMatchSummary(user.uid, g, names, catalog))
      const freshMatches: FreshPlayerMatchInput[] = []
      for (let index = 0; index < mapped.length; index += 1) {
        const game = page.games[index]
        const match = mapped[index]
        if (!match || !game) continue
        if (!matchPassesModeFilter(match, mode)) continue
        if (options.stopAtDuplicate) {
          if (knownMatchIds.has(match.matchId)) {
            exhausted = true
            stoppedReason = 'duplicate-game'
            break
          }
          if (playerMatchReady) {
            const existsInDb = await hasPlayerMatch(app.prisma, storeUid, match.matchId)
            if (existsInDb) {
              if (metrics) {
                metrics.playerMatchDuplicateHit = (metrics.playerMatchDuplicateHit ?? 0) + 1
              }
              exhausted = true
              stoppedReason = 'duplicate-game'
              break
            }
          }
        }
        if (
          options.stopAtSeasonBoundary &&
          !matchBelongsToSeason(
            match,
            options.stopAtSeasonBoundary.apiSeasonId,
            options.stopAtSeasonBoundary.displaySeasonId,
          )
        ) {
          exhausted = true
          stoppedReason = 'season-boundary'
          break
        }
        knownMatchIds.add(match.matchId)
        freshMatches.push({
          match,
          matchingMode: game.matchingMode,
          matchingTeamMode: game.matchingTeamMode,
          rawJson: game,
        })
      }
      if (freshMatches.length > 0) {
        if (!catalogForUpsert && !catalogResolveAttempted) {
          catalogResolveAttempted = true
          try {
            catalogForUpsert = await resolveSeasonCatalog()
          } catch {
            catalogForUpsert = undefined
          }
        }
        try {
          const upsertResult = await upsertFreshPlayerMatches(
            app.prisma,
            storeUid,
            freshMatches,
            {
              catalog: catalogForUpsert,
              seasonBoundary: options.stopAtSeasonBoundary,
            },
          )
          if (metrics) {
            metrics.playerMatchUpsertCount =
              (metrics.playerMatchUpsertCount ?? 0) + upsertResult.upserted
            metrics.playerMatchUpsertSkipped =
              (metrics.playerMatchUpsertSkipped ?? 0) + upsertResult.skipped
            if (upsertResult.failed) {
              metrics.playerMatchUpsertFailed = true
            }
          }
        } catch (err) {
          if (metrics) {
            metrics.playerMatchUpsertFailed = true
          }
          options.log?.warn({ err, uid: user.uid }, 'PlayerMatch upsert failed')
        }
        items = items.concat(freshMatches.map((entry) => entry.match))
      }
      cursor = page.next
      if (page.next === undefined || page.games.length === 0) {
        stoppedReason ??= 'upstream-exhausted'
        exhausted = true
      }
      fetches += 1
    }
    if (!exhausted && fetches >= maxFetches && items.length < needed) {
      stoppedReason = 'max-pages'
    }

    if (metrics) {
      metrics.matchesFetchedPages = fetches
      metrics.matchesStoppedReason = stoppedReason
    }

    const result = { items, next: exhausted ? undefined : cursor }
    gamesCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + GAMES_CACHE_TTL_MS,
    })
    await writeMatchesCache(app.prisma, matchesCacheId(storeUid, cacheMode), result)
    return result
  }

  async function getMatchesUpstreamHint(
    uid: string,
    mode: MatchesQueryMode,
  ): Promise<{ hasMore: boolean }> {
    const cacheMode = matchesCacheModeFromQuery(mode)
    const cacheKey = matchesMemCacheKey(uid, cacheMode)
    const memCached = fromCache(gamesCache, cacheKey)
    if (memCached?.next !== undefined) {
      return { hasMore: true }
    }
    const dbCached = await readMatchesCache(app.prisma, matchesCacheId(uid, cacheMode))
    if (dbCached?.next !== undefined) {
      return { hasMore: true }
    }
    return { hasMore: false }
  }

  async function repairDbPageLoadoutDetails(params: {
    user: BserUser
    canonicalUserNum: number
    pageItems: MatchSummaryContract[]
    mode: MatchesQueryMode
    apiSeasonId: number
    displaySeasonId: number
    pageEnd: number
    metrics: PlayerRouteMetricsExtra
  }): Promise<void> {
    const stripped = params.pageItems.filter(matchSummaryMissingLoadoutDetail)
    if (stripped.length === 0) return

    params.metrics.playerMatchDetailMissing = stripped.length
    params.metrics.playerMatchDetailRepairAttempted = true

    const sources: MatchSummaryContract[] = []
    const cacheMode = matchesCacheModeFromQuery(params.mode)
    const modeCached = await readMatchesCache(app.prisma, matchesCacheId(params.user.uid, cacheMode))
    if (modeCached?.items) sources.push(...modeCached.items)
    if (cacheMode !== 'all') {
      const allCached = await readMatchesCache(app.prisma, matchesCacheId(params.user.uid, 'all'))
      if (allCached?.items) sources.push(...allCached.items)
    }

    let updated = 0
    try {
      updated = await repairPlayerMatchDetailsFromSources(app.prisma, {
        uid: params.user.uid,
        canonicalUserNum: params.canonicalUserNum,
        apiSeasonId: params.apiSeasonId,
        displaySeasonId: params.displaySeasonId,
        targets: stripped,
        sources,
      })

      if (updated < stripped.length) {
        const collected = await collectMatches(params.user, params.pageEnd, params.metrics, {
          mode: params.mode,
          storeUid: params.user.uid,
        })
        updated += await repairPlayerMatchDetailsFromSources(app.prisma, {
          uid: params.user.uid,
          canonicalUserNum: params.canonicalUserNum,
          apiSeasonId: params.apiSeasonId,
          displaySeasonId: params.displaySeasonId,
          targets: stripped,
          sources: collected.items,
        })
      }
    } catch {
      params.metrics.playerMatchDetailRepairFailed = true
    }

    params.metrics.playerMatchDetailRepairUpdated = updated
  }

  async function attachTeamPerformanceToMatches(params: {
    ownerUid: string
    ownerNickname?: string | null
    displaySeasonId: number
    matches: ReadonlyArray<MatchSummaryContract>
  }): Promise<MatchSummaryContract[]> {
    const rankMatches = params.matches.filter((match) => match.gameMode === 'rank')
    if (rankMatches.length === 0 || typeof app.prisma.matchParticipant?.findMany !== 'function') {
      return [...params.matches]
    }

    const gameIds = [...new Set(rankMatches.map((match) => match.matchId))]
    const [participants, details] = await Promise.all([
      app.prisma.matchParticipant.findMany({
        where: { gameId: { in: gameIds } },
      }),
      typeof app.prisma.matchDetail?.findMany === 'function'
        ? app.prisma.matchDetail.findMany({
            where: { gameId: { in: gameIds } },
            select: { gameId: true, durationSeconds: true, displaySeasonId: true },
          })
        : Promise.resolve([]),
    ])
    const detailByGameId = new Map(
      details.map((detail) => [
        detail.gameId,
        {
          gameDuration: detail.durationSeconds ?? null,
          displaySeasonId: detail.displaySeasonId ?? null,
        },
      ]),
    )
    const byGameId = new Map<string, TeamPerformanceParticipantRow[]>()
    for (const participant of participants) {
      const detail = detailByGameId.get(participant.gameId)
      const rows = byGameId.get(participant.gameId) ?? []
      rows.push({
        ...participant,
        gameDuration: detail?.gameDuration ?? null,
      })
      byGameId.set(participant.gameId, rows)
    }

    return Promise.all(params.matches.map(async (match) => {
      if (match.gameMode !== 'rank') return match
      const detail = detailByGameId.get(match.matchId)
      const participants = (byGameId.get(match.matchId) ?? []).map((participant) => ({
        ...participant,
        gameDuration: participant.gameDuration ?? detail?.gameDuration ?? match.gameDuration ?? null,
      }))
      const sourceFingerprint = computeTeamPerformanceSourceFingerprint({
        match,
        ownerUid: params.ownerUid,
        ownerNickname: params.ownerNickname,
        participants,
        displaySeasonId: params.displaySeasonId,
      })
      const cached = await readTeamLuckMetricCache(
        app.prisma,
        {
          matchId: match.matchId,
          targetUid: params.ownerUid,
          teamMetricVersion: TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
          residualBaselineVersion: TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
          benchmarkVersion: TEAM_PERFORMANCE_BENCHMARK_VERSION,
        },
        sourceFingerprint,
      )
      if (cached) return { ...match, teamPerformance: cached }

      const teamPerformance = computeTeamPerformanceForMatch({
        match,
        ownerUid: params.ownerUid,
        ownerNickname: params.ownerNickname,
        participants,
        displaySeasonId: params.displaySeasonId,
      })
      if (teamPerformance) {
        await writeTeamLuckMetricCache(app.prisma, {
          matchId: match.matchId,
          targetUid: params.ownerUid,
          teamMetricVersion: TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
          residualBaselineVersion: TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
          benchmarkVersion: TEAM_PERFORMANCE_BENCHMARK_VERSION,
          sourceFingerprint,
          value: teamPerformance,
        })
      }
      return teamPerformance ? { ...match, teamPerformance } : match
    }))
  }

  function scheduleMissingTeamPerformanceParticipantsBackfill(params: {
    matches: ReadonlyArray<MatchSummaryContract>
    log: FastifyBaseLogger
  }): void {
    if (!bser.isConfigured || typeof app.prisma.matchParticipant?.findMany !== 'function') return

    const targets = [
      ...new Set(
        params.matches
          .filter(
            (match) =>
              match.gameMode === 'rank' &&
              match.teamPerformance?.status === 'unavailable' &&
              match.teamPerformance.reason === 'missing-participants',
          )
          .map((match) => match.matchId)
          .filter((matchId) => /^\d+$/.test(matchId)),
      ),
    ]
    if (targets.length === 0) return

    for (const gameId of targets) {
      if (teamPerformanceParticipantBackfillInflight.has(gameId)) continue
      teamPerformanceParticipantBackfillInflight.add(gameId)
      void resolveMatchDetail({
        prisma: app.prisma,
        bser,
        gameId,
        resolveCharacterNames,
        resolveCatalog: () => resolveSeasonCatalog().catch(() => null),
        storeRawJson: true,
      })
        .then(({ detail, source, fetchMeta }) => {
          params.log.info(
            {
              gameId,
              detailStatus: detail.detailStatus,
              source,
              cacheHit: fetchMeta.cacheHit,
              inflightShared: fetchMeta.inflightShared,
              participantCount: detail.teams.reduce(
                (sum, team) => sum + team.participants.length,
                0,
              ),
            },
            'team performance participant backfill',
          )
        })
        .catch((error) => {
          params.log.warn({ error, gameId }, 'team performance participant backfill failed')
        })
        .finally(() => {
          teamPerformanceParticipantBackfillInflight.delete(gameId)
        })
    }
  }

  async function buildTeamPerformanceSummary(params: {
    uid: string
    nickname?: string | null
    userNum: number
    apiSeasonId: number
    displaySeasonId: number
    playerTier: ReturnType<typeof normalizeRankTier> | null
  }) {
    if (!isPrismaPlayerMatchReady(app.prisma)) return summarizeTeamPerformance([])

    const page = await readMatchesPageFromPlayerMatch(app.prisma, {
      uid: params.uid,
      userNum: params.userNum,
      apiSeasonId: params.apiSeasonId,
      displaySeasonId: params.displaySeasonId,
      mode: 'rank',
      offset: 0,
      limit: 20,
      playerTier: params.playerTier,
    })
    const enriched = await attachTeamPerformanceToMatches({
      ownerUid: params.uid,
      ownerNickname: params.nickname,
      displaySeasonId: params.displaySeasonId,
      matches: page.items,
    })
    return summarizeTeamPerformance(enriched)
  }

  async function resolvePlayerMatchesPage(params: {
    user: BserUser
    profileUid: string
    responseUserNum: number
    aliasUids?: string[]
    playerMatchUids: string[]
    page: number
    pageSize: number
    mode: MatchesQueryMode
    apiSeasonId: number
    displaySeasonId: number
    metrics: PlayerRouteMetricsExtra
    forceRefreshLatest?: boolean
    playerTier?: ReturnType<typeof normalizeRankTier> | null
  }): Promise<{
    items: MatchSummaryContract[]
    hasNext: boolean
    apiDataSource: ApiDataSource
  }> {
    const { user, profileUid, page, pageSize, mode, apiSeasonId, displaySeasonId, metrics, forceRefreshLatest, aliasUids } =
      params
    const matchOwnerUid = profileUid
    const offset = page * pageSize
    const pageEnd = offset + pageSize
    const userNum = params.responseUserNum

    if (forceRefreshLatest && page === 0) {
      metrics.upstreamLatestGameId = await peekBserLatestGameId(profileUid)
      metrics.dbLatestGameIdBefore = await readProfileLatestGameId(app.prisma, [matchOwnerUid])
      for (const refreshMode of ['all', 'rank', 'cobalt', 'normal'] as const) {
        gamesCache.delete(matchesMemCacheKey(matchOwnerUid, refreshMode))
        await collectMatches(
          { uid: profileUid, nickname: user.nickname },
          pageEnd * 2,
          metrics,
          {
            mode: refreshMode,
            storeUid: matchOwnerUid,
            maxFetches: 3,
            stopAtDuplicate: true,
            bypassCache: true,
          },
        )
      }
      metrics.dbLatestGameIdAfter = await readProfileLatestGameId(app.prisma, [matchOwnerUid])
    }

    metrics.playerMatchStoreReady = isPrismaPlayerMatchReady(app.prisma)
    metrics.playerMatchDbNeeded = pageEnd

    const readDbPage = async () =>
      readMatchesPageFromVerifiedSources(app.prisma, {
        uid: matchOwnerUid,
        canonicalUid: matchOwnerUid,
        aliasUids: params.aliasUids,
        userNum,
        apiSeasonId,
        displaySeasonId,
        mode,
        offset,
        limit: pageSize,
        playerTier: params.playerTier ?? null,
      })

    if (metrics.playerMatchStoreReady) {
      let dbPage = await readDbPage()
      metrics.playerMatchDbCount = dbPage.totalCount

      if (!forceRefreshLatest) {
        metrics.playerMatchDbSatisfied = true
        metrics.playerMatchReadCount = dbPage.items.length
        metrics.playerMatchReadSource = 'db'
        metrics.matchesSource = 'db'
        metrics.matchesNeeded = pageSize
        metrics.matchesStoppedReason = dbPage.items.length > 0 ? 'cache-satisfied' : 'upstream-exhausted'
        metrics.cacheHits?.push('playerMatch')
        return {
          items: dbPage.items,
          hasNext: dbPage.totalCount > pageEnd,
          apiDataSource: 'cache',
        }
      }

      if (dbPage.items.some(matchSummaryMissingLoadoutDetail)) {
        await repairDbPageLoadoutDetails({
          user: { uid: matchOwnerUid, nickname: user.nickname },
          canonicalUserNum: userNum,
          pageItems: dbPage.items,
          mode,
          apiSeasonId,
          displaySeasonId,
          pageEnd,
          metrics,
        })
        dbPage = await readDbPage()
      }
      metrics.playerMatchDbSatisfied = dbPage.totalCount >= pageEnd
      metrics.playerMatchReadCount = dbPage.items.length
      metrics.playerMatchReadSource = 'db-after-refresh'
      metrics.cacheHits?.push('playerMatch')
      const upstreamHint = await getMatchesUpstreamHint(matchOwnerUid, mode)
      return {
        items: dbPage.items,
        hasNext: dbPage.totalCount > pageEnd || upstreamHint.hasMore,
        apiDataSource: 'cache',
      }
    }

    metrics.playerMatchDbMissReason = 'store-not-ready'

    metrics.cacheMisses?.push('playerMatch')
    const seasonBoundary =
      mode === 'rank' ? { apiSeasonId, displaySeasonId } : undefined
    const collected = await collectMatches(
      { uid: profileUid, nickname: user.nickname },
      pageEnd,
      metrics,
      {
        mode,
        storeUid: matchOwnerUid,
        stopAtSeasonBoundary: seasonBoundary,
      },
    )

    if (metrics.playerMatchStoreReady) {
      let dbPage = await readDbPage()
      metrics.playerMatchDbCount = dbPage.totalCount

      if (dbPage.items.length > 0) {
        if (dbPage.items.some(matchSummaryMissingLoadoutDetail)) {
          await repairDbPageLoadoutDetails({
            user: { uid: matchOwnerUid, nickname: user.nickname },
            canonicalUserNum: userNum,
            pageItems: dbPage.items,
            mode,
            apiSeasonId,
            displaySeasonId,
            pageEnd,
            metrics,
          })
          dbPage = await readDbPage()
        }
        metrics.playerMatchReadCount = dbPage.items.length
        metrics.playerMatchReadSource = 'db-after-refresh'
        metrics.playerMatchDbSatisfied = dbPage.totalCount >= pageEnd
        return {
          items: dbPage.items,
          hasNext:
            dbPage.totalCount > pageEnd ||
            collected.next !== undefined ||
            collected.items.length > pageEnd,
          apiDataSource: 'cache',
        }
      }
    }

    metrics.playerMatchReadSource = 'fallback-cache'
    return {
      items: collected.items.slice(offset, pageEnd),
      hasNext: collected.next !== undefined || collected.items.length > pageEnd,
      apiDataSource: 'external',
    }
  }

  function invalidateGamesMemCacheForUid(uid: string): void {
    for (const mode of ['all', 'rank', 'normal', 'cobalt', 'union'] as const) {
      gamesCache.delete(matchesMemCacheKey(uid, mode))
    }
  }

  function profileRefreshMemoryCaches() {
    return {
      deleteRankKey: (key: string) => {
        rankCache.delete(key)
      },
      deleteUserStatsKey: (key: string) => {
        userStatsCache.delete(key)
      },
      deleteGamesMemCacheForUid: (uid: string) => {
        invalidateGamesMemCacheForUid(uid)
      },
    }
  }

  function bustProfileRefreshCaches(params: {
    profileUid: string
    canonicalUid: string
    apiSeasonId: number
  }): void {
    invalidateProfileRefreshMemoryCaches(profileRefreshMemoryCaches(), params)
    invalidatePlayerAnalysisCache(params.canonicalUid)
  }

  async function bustProfileRefreshDbCaches(params: {
    canonicalUid: string
    apiSeasonId: number
  }): Promise<{ statsInvalidated: boolean; aggregateInvalidated: boolean }> {
    return invalidateProfileRefreshDbCaches(app.prisma, params)
  }

  async function finalizeManualProfileRefresh(params: {
    profileIdentity: ResolvedProfileIdentity
    apiSeasonId: number
    displaySeasonId: number
    latestGameIdBefore: string | null
    newGamesInserted: number
    gamesFetched: number
    playerMatchUpsertFailed?: boolean
    playerTier?: ReturnType<typeof normalizeRankTier> | null
    rankUpdated?: boolean
    upstreamLatestGameId?: string | null
    dbLatestGameIdBefore?: string | null
    dbLatestGameIdAfter?: string | null
    matchDetailsFetched?: number
  }): Promise<ProfileRefreshMeta> {
    const canonicalUid = params.profileIdentity.owner.canonicalUid
    const profileUid = params.profileIdentity.sources.profileUid
    bustProfileRefreshCaches({
      profileUid,
      canonicalUid,
      apiSeasonId: params.apiSeasonId,
    })
    const dbInvalidated = await bustProfileRefreshDbCaches({
      canonicalUid,
      apiSeasonId: params.apiSeasonId,
    })

    let snapshotInvalidatedOrRebuilt = false
    let aggregateRefreshFailed = false
    const partialFailures: string[] = []
    const backgroundRefreshPending = params.newGamesInserted > 0

    if (params.newGamesInserted > 0) {
      void (async () => {
        try {
          await buildAndWriteSeasonAggregateFromCaches({
            prisma: app.prisma,
            uid: canonicalUid,
            apiSeasonId: params.apiSeasonId,
            displaySeasonId: params.displaySeasonId,
            isCurrent: true,
            characterNames: characterNames ?? undefined,
          })
        } catch (err) {
          aggregateRefreshFailed = true
          partialFailures.push('aggregate-refresh-failed')
          app.log.warn({ err, canonicalUid }, 'profile refresh aggregate rebuild failed')
        }

        try {
          const fingerprint = await computeCharacterGradeSourceFingerprint(app.prisma, {
            uid: canonicalUid,
            apiSeasonId: params.apiSeasonId,
            matchMode: CHARACTER_GRADE_MATCH_MODE,
          })
          const recomputed = await computeAndStoreCharacterGradeSnapshot({
            canonicalUid,
            canonicalUserNum: params.profileIdentity.owner.canonicalUserNum,
            playerMatchUids: params.profileIdentity.sources.playerMatchUids,
            apiSeasonId: params.apiSeasonId,
            displaySeasonId: params.displaySeasonId,
            playerTier: params.playerTier ?? null,
            sourceFingerprint: fingerprint.value,
          })
          snapshotInvalidatedOrRebuilt = recomputed != null
        } catch (err) {
          partialFailures.push('snapshot-rebuild-failed')
          app.log.warn({ err, canonicalUid }, 'profile refresh snapshot rebuild failed')
        }

        try {
          const rankRows = await app.prisma.playerMatch.findMany({
            where: {
              uid: canonicalUid,
              displaySeasonId: params.displaySeasonId,
              apiSeasonId: params.apiSeasonId,
              gameMode: 'rank',
            },
          })
          scheduleUserRoleSnapshotUpsert(app.prisma, {
            rows: rankRows as import('../utils/playerMatchDedup.js').PlayerMatchRow[],
            canonicalUid,
            displaySeasonId: params.displaySeasonId,
            apiSeasonId: params.apiSeasonId,
            benchmarkScope: 'rank',
          })
        } catch (err) {
          partialFailures.push('role-snapshot-refresh-failed')
          app.log.warn({ err, canonicalUid }, 'profile refresh role snapshot schedule failed')
        }
      })()
    }

    const latestGameIdAfter =
      params.dbLatestGameIdAfter ??
      (await readProfileLatestGameId(app.prisma, [profileUid]))

    return buildProfileRefreshMeta({
      rankUpdated: params.rankUpdated ?? true,
      cobaltUpdated: true,
      normalUpdated: true,
      latestGameIdBefore: params.latestGameIdBefore,
      latestGameIdAfter,
      upstreamLatestGameId: params.upstreamLatestGameId ?? null,
      dbLatestGameIdBefore: params.dbLatestGameIdBefore ?? params.latestGameIdBefore,
      dbLatestGameIdAfter: latestGameIdAfter,
      gamesFetched: params.gamesFetched,
      newGamesInserted: params.newGamesInserted,
      matchDetailsFetched: params.matchDetailsFetched ?? 0,
      playerMatchesInserted: params.newGamesInserted,
      statsInvalidated: dbInvalidated.statsInvalidated,
      statsRebuilt: dbInvalidated.statsInvalidated,
      aggregateInvalidated: dbInvalidated.aggregateInvalidated,
      aggregateRebuilt: false,
      snapshotInvalidatedOrRebuilt: false,
      playerMatchUpsertFailed: params.playerMatchUpsertFailed,
      aggregateRefreshFailed,
      partialFailure: partialFailures.length > 0 ? partialFailures.join(',') : undefined,
      coreRefreshCompleted: true,
      backgroundRefreshPending,
    })
  }

  function buildRecentMatchFreshnessDeps(params: {
    profileIdentity: ResolvedProfileIdentity
    apiSeasonId: number
    displaySeasonId: number
    hasProfileCache: boolean
    explicitRefresh: boolean
    logger: FastifyBaseLogger
  }): RecentMatchFreshnessDeps {
    const user = canonicalBserUser(params.profileIdentity)
    const profileUid = params.profileIdentity.sources.profileUid
    const rankSourceUid = params.profileIdentity.sources.profileUid
    return {
      prisma: app.prisma,
      logger: params.logger,
      nickname: params.profileIdentity.requestedNickname,
      canonicalUid: params.profileIdentity.owner.canonicalUid,
      hasProfileCache: params.hasProfileCache,
      explicitRefresh: params.explicitRefresh,
      collectRecentMatches: async () => {
        const owner = profileMatchOwner(params.profileIdentity)
        invalidateGamesMemCacheForUid(owner.uid)
        await invalidateStoredMatchesCache(app.prisma, owner.uid)
        const metrics: PlayerRouteMetricsExtra = {}
        await collectMatches(
          { uid: params.profileIdentity.sources.profileUid, nickname: owner.nickname },
          20,
          metrics,
          {
            mode: 'all',
            storeUid: owner.uid,
            maxFetches: 2,
            stopAtDuplicate: true,
            bypassCache: true,
          },
        )
        return {
          newMatchCount: metrics.playerMatchUpsertCount ?? 0,
          pagesFetched: metrics.matchesFetchedPages ?? 0,
          detailFetchCount: metrics.playerMatchDetailRepairAttempted ? 1 : 0,
        }
      },
      applyNewMatches: async (newMatchCount) => {
        if (newMatchCount <= 0) return
        invalidateGamesMemCacheForUid(user.uid)
        await invalidateStoredMatchesCache(app.prisma, user.uid)
        rankCache.delete(`${rankSourceUid}:${params.apiSeasonId}`)
        rankCache.delete(`${user.uid}:${params.apiSeasonId}`)
        await recordManualProfileRefresh(app.prisma, params.profileIdentity.owner.canonicalUid)
        await buildAndWriteSeasonAggregateFromCaches({
          prisma: app.prisma,
          uid: user.uid,
          apiSeasonId: params.apiSeasonId,
          displaySeasonId: params.displaySeasonId,
          isCurrent: true,
          characterNames: characterNames ?? undefined,
        })
      },
    }
  }

  async function triggerRecentMatchFreshnessIfNeeded(params: {
    profileIdentity: ResolvedProfileIdentity
    apiSeasonId: number
    displaySeasonId: number
    hasProfileCache: boolean
    explicitRefresh: boolean
    logger: FastifyBaseLogger
  }): Promise<void> {
    await prepareRecentMatchFreshnessCheck(buildRecentMatchFreshnessDeps(params))
  }

  async function peekBserLatestGameId(profileUid: string): Promise<string | null> {
    const page = await bser.getUserGames(profileUid)
    const first = page.games[0]
    if (!first) return null
    return String(first.gameId)
  }

  function buildProfileEntryFreshnessDeps(params: {
    profileIdentity: ResolvedProfileIdentity
    apiSeasonId: number
    displaySeasonId: number
    hasProfileCache: boolean
    logger: FastifyBaseLogger
    playerTier?: ReturnType<typeof normalizeRankTier> | null
  }): ProfileEntryFreshnessDeps {
    const freshness = buildRecentMatchFreshnessDeps({
      ...params,
      explicitRefresh: false,
    })
    return {
      ...freshness,
      playerMatchUids: params.profileIdentity.sources.playerMatchUids,
      peekUpstreamLatestGameId: () =>
        peekBserLatestGameId(params.profileIdentity.sources.profileUid),
      finalizeAfterCollect: async (collectParams) => {
        const meta = await finalizeManualProfileRefresh({
          profileIdentity: params.profileIdentity,
          apiSeasonId: params.apiSeasonId,
          displaySeasonId: params.displaySeasonId,
          latestGameIdBefore: collectParams.latestGameIdBefore,
          newGamesInserted: collectParams.newGamesInserted,
          gamesFetched: collectParams.gamesFetched,
          playerMatchUpsertFailed: collectParams.playerMatchUpsertFailed,
          playerTier: params.playerTier ?? null,
          rankUpdated: false,
        })
        return meta
      },
    }
  }

  async function backfillCurrentSeasonAggregate(
    params: {
      user: BserUser
      apiSeasonId: number
      displaySeasonId: number
      characterNames?: ReadonlyMap<number, string>
    },
    chainDepth = 0,
  ): Promise<void> {
    const startedAt = Date.now()
    const refreshMetrics: PlayerRouteMetricsExtra = {}
    const stats = await readSeasonStatsCacheSnapshot(
      app.prisma,
      seasonStatsCacheId(params.user.uid, params.apiSeasonId),
    )
    const officialSeasonGames = seasonStatsTotalGames(stats)
    const catalog = await resolveSeasonCatalog().catch(() => null)
    const backfillResult = await runSeasonBackfillWorker(
      {
        prisma: app.prisma,
        deps: { getUserGames: (uid, cursor) => bser.getUserGames(uid, cursor) },
        uid: params.user.uid,
        apiSeasonId: params.apiSeasonId,
        displaySeasonId: params.displaySeasonId,
        officialSeasonGames,
        characterNames: params.characterNames,
        catalog,
        metrics: refreshMetrics,
      },
      {
        chainDepth,
        onChain: (workerParams, nextDepth) => {
          scheduleInternalBackfillChunk(
            workerParams,
            async (_workerParams, depth) => {
              await backfillCurrentSeasonAggregate(params, depth)
            },
            nextDepth,
          )
        },
      },
    )

    if (backfillResult.matchesUpserted > 0) {
      await buildAndWriteSeasonAggregateFromCaches({
        prisma: app.prisma,
        uid: params.user.uid,
        apiSeasonId: params.apiSeasonId,
        displaySeasonId: params.displaySeasonId,
        isCurrent: true,
        characterNames: params.characterNames,
      })
    }

    const workerTrace = getLastBackfillWorkerTrace()
    app.log.info(
      {
        userNum: uidToUserNum(params.user.uid),
        apiSeasonId: params.apiSeasonId,
        displaySeasonId: params.displaySeasonId,
        fullBackfillPagesFetched: backfillResult.pagesFetched,
        fullBackfillStoppedReason: backfillResult.stoppedReason,
        fullBackfillMatchesUpserted: backfillResult.matchesUpserted,
        aggregateRefreshDurationMs: Date.now() - startedAt,
        backfillWorkerAction: workerTrace?.action,
        backfillStateCreatedBeforeFetch: workerTrace?.stateCreatedBeforeFetch,
        backfillStaleRunningRecovered: workerTrace?.staleRunningRecovered,
        backfillScheduledNextChunk: workerTrace?.scheduledNextChunk,
        backfillChainDepth: chainDepth,
      },
      'season aggregate background refresh',
    )
  }

  function scheduleCurrentSeasonAggregateBackfill(params: {
    user: BserUser
    apiSeasonId: number
    displaySeasonId: number
    characterNames?: ReadonlyMap<number, string>
  }) {
    return enqueueSeasonAggregateRefresh({
      userNum: uidToUserNum(params.user.uid),
      uid: params.user.uid,
      apiSeasonId: params.apiSeasonId,
      displaySeasonId: params.displaySeasonId,
      logger: app.log,
      run: () => backfillCurrentSeasonAggregate(params),
    })
  }

  const withZod = app.withTypeProvider<ZodTypeProvider>()

  // 닉네임 검색 — BSER는 정확 일치 조회만 지원하므로 0~1건 반환
  withZod.get('/players/search', { schema: { querystring: playerSearchQuery } }, async (request, reply) => {
    requireApiKey()
    const nickname = resolvePlayerSearchTerm(request.query)
    if (!nickname) {
      throw new HttpError(
        400,
        'INVALID_REQUEST',
        '닉네임을 입력해 주세요. 정확한 닉네임으로 조회합니다.',
      )
    }
    if (nickname.length < 2) {
      throw new HttpError(400, 'INVALID_REQUEST', '닉네임은 2자 이상 입력해 주세요.')
    }
    try {
      return await withPlayerRoute(request.log, '/players/search', nickname, {}, async () => {
        const user = await bser.getUserByNickname(nickname)
        if (!user) {
          logSearchDev(request, nickname, false)
          throw new HttpError(
            404,
            'PLAYER_NOT_FOUND',
            '플레이어를 찾을 수 없습니다. 닉네임을 정확히 입력해 주세요.',
          )
        }
        const seasonId = await resolveSeasonId()
        const [rank, currentSeason] = await Promise.all([
          getRankCached(user.uid, seasonId),
          resolveDisplaySeasonId(),
        ])
        logSearchDev(request, nickname, true)
        return reply.send(
          apiResult([{ ...mapToPlayerSummary(user, rank, cachedAccountLevel(user.uid)), currentSeason }]),
        )
      })
    } catch (e) {
      throw toHttpError(e)
    }
  })

  withZod.get(
    '/players/:nickname/summary',
    { schema: { params: playerNicknameParams, querystring: seasonIdQuery } },
    async (request, reply) => {
      requireApiKey()
      const nickname = request.params.nickname
      try {
        const metrics: PlayerRouteMetricsExtra = {}
        return await withPlayerRoute(request.log, '/players/:nickname/summary', nickname, metrics, async () => {
          const identityQuery = identityFromQuery(request.query)
          const lookupUser = await resolveUser(nickname, identityQuery, metrics)
          const catalog = await resolveSeasonCatalog()
          const { apiSeasonId } = await resolveSeasonAggregateIds({
            requestedSeasonId: request.query.seasonId,
            catalog,
            resolveCurrentApiSeasonId: resolveSeasonId,
          })
          const cachedStatsForIdentity = await readSeasonStatsCacheSnapshot(
            app.prisma,
            seasonStatsCacheId(lookupUser.uid, apiSeasonId),
          )
          let fingerprintForIdentity = squadStatsFingerprint(cachedStatsForIdentity)
          if (!fingerprintForIdentity) {
            fingerprintForIdentity = await resolveDbStatsFingerprint(
              app.prisma,
              nickname,
              lookupUser.uid,
              apiSeasonId,
            )
          }
          const profileIdentity = await loadProfileIdentity(
            nickname,
            lookupUser,
            apiSeasonId,
            metrics,
            fingerprintForIdentity,
            identityQuery.uid !== undefined,
          )
          const canonicalUser = canonicalBserUser(profileIdentity)
          const rankSourceUid = profileIdentity.sources.profileUid
          const displaySeasonForSummary = await resolveDisplaySeasonId()
          const playerMatchUids = profileIdentity.sources.playerMatchUids
          const explicitRefresh = request.query.refresh === true
          if (explicitRefresh) {
            bustProfileRefreshCaches({
              profileUid: rankSourceUid,
              canonicalUid: profileIdentity.owner.canonicalUid,
              apiSeasonId,
            })
          }
          const [rank, statsResolved, lastRefreshedAt, lastCheckedAt, hasProfileCache, hasStoredSeasons] =
            await Promise.all([
            getRankCached(rankSourceUid, apiSeasonId, metrics),
            getUserStatsCached(rankSourceUid, apiSeasonId, metrics),
            resolveProfileLastRefreshedAt(app.prisma, profileIdentity.owner.canonicalUid, apiSeasonId),
            readRecentMatchCheck(app.prisma, profileIdentity.owner.canonicalUid),
            hasProfileCacheDataForUids(app.prisma, playerMatchUids),
            hasStoredSeasonHistory(
              app.prisma,
              profileIdentity.owner.canonicalUid,
              playerMatchUids,
              1,
              displaySeasonForSummary,
            ),
          ])
          const recentMatchCheck = await prepareRecentMatchFreshnessCheck(
            buildRecentMatchFreshnessDeps({
              profileIdentity,
              apiSeasonId,
              displaySeasonId: displaySeasonForSummary,
              hasProfileCache,
              explicitRefresh,
              logger: request.log,
            }),
          )
          const currentSeason = displaySeasonForSummary
          const accountLevelFromCache = resolveAccountLevelForIdentity(profileIdentity)
          const accountLevelFromMatches =
            accountLevelFromCache ??
            (await readLatestAccountLevelFromVerifiedSources(app.prisma, {
              uids: profileIdentity.sources.playerMatchUids,
              apiSeasonId,
            }))
          const accountLevel = rememberAccountLevelForIdentity(
            profileIdentity,
            accountLevelFromMatches,
          )
          const summaryBody = {
            ...mapToPlayerSummary(canonicalUser, rank, accountLevel, statsResolved.stats),
            currentSeason,
            lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null,
            lastCheckedAt: lastCheckedAt?.toISOString() ?? null,
            recentMatchCheckStatus: recentMatchCheck.status,
            hasProfileCache,
            hasStoredSeasonHistory: hasStoredSeasons,
          }
          assertPlayerIdentityUserNum(request.log, {
            endpoint: 'summary',
            requestedNickname: nickname,
            normalizedNickname: profileIdentity.normalizedNickname,
            expectedUserNum: profileIdentity.owner.canonicalUserNum,
            actualUserNum: summaryBody.userNum,
            cacheSource: metrics.rankCache === 'hit' ? 'cache' : 'external',
          })
          return reply.send(
            apiResult(
              summaryBody,
              metrics.rankCache === 'hit' ? 'cache' : 'external',
            ),
          )
        })
      } catch (e) {
        throw toHttpError(e)
      }
    },
  )

  withZod.get(
    '/players/:nickname/entry-freshness',
    { schema: { params: playerNicknameParams, querystring: seasonIdQuery } },
    async (request, reply) => {
      requireApiKey()
      const nickname = request.params.nickname
      try {
        const metrics: PlayerRouteMetricsExtra = {}
        return await withPlayerRoute(
          request.log,
          '/players/:nickname/entry-freshness',
          nickname,
          metrics,
          async () => {
            const identityQuery = identityFromQuery(request.query)
            const lookupUser = await resolveUser(nickname, identityQuery, metrics)
            const catalog = await resolveSeasonCatalog()
            const { apiSeasonId } = await resolveSeasonAggregateIds({
              requestedSeasonId: request.query.seasonId,
              catalog,
              resolveCurrentApiSeasonId: resolveSeasonId,
            })
            const cachedStatsForIdentity = await readSeasonStatsCacheSnapshot(
              app.prisma,
              seasonStatsCacheId(lookupUser.uid, apiSeasonId),
            )
            let fingerprintForIdentity = squadStatsFingerprint(cachedStatsForIdentity)
            if (!fingerprintForIdentity) {
              fingerprintForIdentity = await resolveDbStatsFingerprint(
                app.prisma,
                nickname,
                lookupUser.uid,
                apiSeasonId,
              )
            }
            const profileIdentity = await loadProfileIdentity(
              nickname,
              lookupUser,
              apiSeasonId,
              metrics,
              fingerprintForIdentity,
              identityQuery.uid !== undefined,
            )
            const displaySeasonForEntry = await resolveDisplaySeasonId()
            const playerMatchUids = profileIdentity.sources.playerMatchUids
            const hasProfileCache = await hasProfileCacheDataForUids(app.prisma, playerMatchUids)
            const entryResult: ProfileEntryFreshnessResult = await coordinateProfileEntryFreshness(
              buildProfileEntryFreshnessDeps({
                profileIdentity,
                apiSeasonId,
                displaySeasonId: displaySeasonForEntry,
                hasProfileCache,
                logger: request.log,
              }),
            )
            return reply.send(apiResult(entryResult, 'external'))
          },
        )
      } catch (e) {
        throw toHttpError(e)
      }
    },
  )

  withZod.get(
    '/players/:nickname/stats',
    { schema: { params: playerNicknameParams, querystring: seasonIdQuery } },
    async (request, reply) => {
      requireApiKey()
      const nickname = request.params.nickname
      try {
        const metrics: PlayerRouteMetricsExtra = {}
        return await withPlayerRoute(request.log, '/players/:nickname/stats', nickname, metrics, async () => {
          const identityQuery = identityFromQuery(request.query)
          const lookupUser = await resolveUser(nickname, identityQuery, metrics)
          const catalog = await resolveSeasonCatalog()
          const { apiSeasonId, displaySeasonId, isCurrent } = await resolveSeasonAggregateIds({
            requestedSeasonId: request.query.seasonId,
            catalog,
            resolveCurrentApiSeasonId: resolveSeasonId,
          })
          const dbStatsForLookup = await readSeasonStatsCacheSnapshot(
            app.prisma,
            seasonStatsCacheId(lookupUser.uid, apiSeasonId),
          )
          let fingerprintForIdentity = squadStatsFingerprint(dbStatsForLookup)
          if (!fingerprintForIdentity) {
            fingerprintForIdentity = await resolveDbStatsFingerprint(
              app.prisma,
              nickname,
              lookupUser.uid,
              apiSeasonId,
            )
          }

          let statsResolved = await getUserStatsCached(lookupUser.uid, apiSeasonId, metrics)
          if (!fingerprintForIdentity) {
            fingerprintForIdentity = squadStatsFingerprint(statsResolved.stats)
          }

          const profileIdentity = await loadProfileIdentity(
            nickname,
            lookupUser,
            apiSeasonId,
            metrics,
            fingerprintForIdentity,
            identityQuery.uid !== undefined,
          )
          const canonicalUser = canonicalBserUser(profileIdentity)
          const statsSourceUid = profileIdentity.sources.profileUid

          const explicitRefresh = request.query.refresh === true
          if (explicitRefresh) {
            bustProfileRefreshCaches({
              profileUid: statsSourceUid,
              canonicalUid: profileIdentity.owner.canonicalUid,
              apiSeasonId,
            })
            await bustProfileRefreshDbCaches({
              canonicalUid: profileIdentity.owner.canonicalUid,
              apiSeasonId,
            })
            statsResolved = await getUserStatsCached(statsSourceUid, apiSeasonId, metrics)
          } else if (statsSourceUid !== lookupUser.uid) {
            statsResolved = await getUserStatsCached(statsSourceUid, apiSeasonId, metrics)
          }

          const [statsFinal, rank] = await Promise.all([
            Promise.resolve(statsResolved),
            getRankCached(statsSourceUid, apiSeasonId, metrics),
          ])
          statsResolved = statsFinal
          const stats = statsResolved.stats
        const squad = stats.find((s) => s.matchingTeamMode === 3) ?? stats[0] ?? null
        // 배치 미완료 시즌은 이월 MMR을 노출하지 않는다 (언랭크 처리)
        const placedRank = hasPlacement(rank) ? rank : null
        const merged =
          squad && (squad.totalGames ?? 0) > 0
            ? squad
            : squad
              ? { ...squad, mmr: placedRank?.mmr ?? squad.mmr }
              : placedRank
                ? {
                    seasonId: apiSeasonId,
                    matchingMode: 3,
                    matchingTeamMode: 3,
                    mmr: placedRank.mmr,
                    nickname: placedRank.nickname,
                    rank: placedRank.rank,
                    rankSize: 0,
                    totalGames: 0,
                    totalWins: 0,
                    totalTeamKills: 0,
                    totalDeaths: 0,
                    averageRank: 0,
                    averageKills: 0,
                    averageAssistants: 0,
                    top1: 0,
                    top3: 0,
                  }
                : null
          const mappedStats = mapToPlayerStats(canonicalUser.uid, displaySeasonId, merged)
          let deduplicatedRankMatchCount = 0
          if (isCurrent && isPrismaPlayerMatchReady(app.prisma)) {
            const playerTier = resolveCharacterGradePlayerTier({
              placedRank,
              squad,
              displaySeason: displaySeasonId,
            })
            const fingerprint = await computeCharacterGradeSourceFingerprint(app.prisma, {
              uid: profileIdentity.owner.canonicalUid,
              apiSeasonId,
              matchMode: CHARACTER_GRADE_MATCH_MODE,
            })
            const snapshot = await readCharacterGradeSnapshot(app.prisma, {
              canonicalUserNum: profileIdentity.owner.canonicalUserNum,
              apiSeasonId,
              matchMode: CHARACTER_GRADE_MATCH_MODE,
            })
            const snapshotFresh = snapshot?.sourceFingerprint === fingerprint.value
            if (snapshot) {
              const snapshotNeedsAnalysisAxes =
                snapshot.overallAnalysisAxes == null ||
                snapshot.overallAnalysisAxes.version !== PRODUCTION_ANALYSIS_AXES_VERSION ||
                snapshot.characterStats.some(
                  (row) =>
                    row.analysisAxes == null ||
                    row.analysisAxes.version !== PRODUCTION_ANALYSIS_AXES_VERSION,
                )
              const snapshotNeedsGradeTier =
                snapshotNeedsGradeTierRecompute({
                  characterStats: snapshot.characterStats,
                  playerTier,
                  storedPlayerTierKey: snapshot.meta.gradePlayerTierKey,
                })
              const recomputedForAnalysis =
                snapshotNeedsAnalysisAxes || snapshotNeedsGradeTier
                  ? await computeAndStoreCharacterGradeSnapshot({
                      canonicalUid: profileIdentity.owner.canonicalUid,
                      canonicalUserNum: profileIdentity.owner.canonicalUserNum,
                      playerMatchUids: profileIdentity.sources.playerMatchUids,
                      apiSeasonId,
                      displaySeasonId,
                      playerTier,
                      sourceFingerprint: fingerprint.value,
                    })
                  : null
              const snapshotOverallGradeV2 =
                recomputedForAnalysis?.overallGradeV2 ??
                snapshot.overallGradeV2 ??
                computeOverallGradeV2ForCharacterStats({
                  canonicalUserNum: profileIdentity.owner.canonicalUserNum,
                  matchMode: CHARACTER_GRADE_MATCH_MODE,
                  characterStats: recomputedForAnalysis?.characterStats ?? snapshot.characterStats,
                  sourceFingerprint: fingerprint.value,
                  computedAt: new Date(),
                })
              mappedStats.playerMatchCharacterStats =
                recomputedForAnalysis?.characterStats ?? snapshot.characterStats
              mappedStats.overallGradeV2 = snapshotOverallGradeV2
              mappedStats.overallAnalysisAxes =
                recomputedForAnalysis?.overallAnalysisAxes ?? snapshot.overallAnalysisAxes ?? null
              mappedStats.playerMatchCharacterStatsMeta = {
                ...snapshot.meta,
                gradePlayerTierKey:
                  snapshot.meta.gradePlayerTierKey ??
                  resolveGradePlayerTierKey(playerTier),
                overallGradeVersion: snapshotOverallGradeV2?.overallGradeVersion,
                snapshotStatus: snapshotFresh ? 'ready' : 'refreshing',
                sourceFingerprint: snapshot.sourceFingerprint,
                computedAt: snapshot.computedAt,
              }
              deduplicatedRankMatchCount =
                snapshot.meta.deduplicatedMatchCount ?? snapshot.meta.matchCount
              if (!snapshotFresh) {
                const refreshSnapshot = async () =>
                  computeAndStoreCharacterGradeSnapshot({
                    canonicalUid: profileIdentity.owner.canonicalUid,
                    canonicalUserNum: profileIdentity.owner.canonicalUserNum,
                    playerMatchUids: profileIdentity.sources.playerMatchUids,
                    apiSeasonId,
                    displaySeasonId,
                    playerTier,
                    sourceFingerprint: fingerprint.value,
                  })
                if (explicitRefresh) {
                  const recomputed = await refreshSnapshot().catch((error) => {
                    request.log.warn({ error, nickname }, 'character grade snapshot refresh failed')
                    return null
                  })
                  if (recomputed) {
                    mappedStats.playerMatchCharacterStats = recomputed.characterStats
                    mappedStats.playerMatchCharacterStatsMeta = {
                      ...recomputed.meta,
                      snapshotStatus: 'ready',
                      sourceFingerprint: fingerprint.value,
                      computedAt: recomputed.meta.computedAt,
                    }
                    mappedStats.overallGradeV2 = recomputed.overallGradeV2
                    mappedStats.overallAnalysisAxes = recomputed.overallAnalysisAxes
                    deduplicatedRankMatchCount =
                      recomputed.meta.deduplicatedMatchCount ?? recomputed.meta.matchCount
                  }
                } else {
                  void refreshSnapshot().catch((error) => {
                    request.log.warn({ error, nickname }, 'character grade snapshot refresh failed')
                  })
                }
              } else if (!snapshot.overallGradeV2 && snapshotOverallGradeV2) {
                void writeCharacterGradeSnapshot(app.prisma, {
                  uid: profileIdentity.owner.canonicalUid,
                  canonicalUserNum: profileIdentity.owner.canonicalUserNum,
                  apiSeasonId,
                  displaySeasonId,
                  matchMode: CHARACTER_GRADE_MATCH_MODE,
                  sourceFingerprint: fingerprint.value,
                  status: 'ready',
                  characterStats: snapshot.characterStats,
                  meta: {
                    ...snapshot.meta,
                    overallGradeVersion: snapshotOverallGradeV2.overallGradeVersion,
                  },
                  overallGradeV2: snapshotOverallGradeV2,
                  overallAnalysisAxes: snapshot.overallAnalysisAxes ?? null,
                  computedAt: new Date(snapshot.computedAt),
                }).catch((error) => {
                  request.log.warn({ error, nickname }, 'overall grade v2 snapshot backfill failed')
                })
              }
            } else {
              const computed = await computeAndStoreCharacterGradeSnapshot({
                canonicalUid: profileIdentity.owner.canonicalUid,
                canonicalUserNum: profileIdentity.owner.canonicalUserNum,
                playerMatchUids: profileIdentity.sources.playerMatchUids,
                apiSeasonId,
                displaySeasonId,
                playerTier,
                sourceFingerprint: fingerprint.value,
              })
              if (computed) {
                mappedStats.playerMatchCharacterStats = computed.characterStats
                mappedStats.playerMatchCharacterStatsMeta = computed.meta
                mappedStats.overallGradeV2 = computed.overallGradeV2
                mappedStats.overallAnalysisAxes = computed.overallAnalysisAxes
                deduplicatedRankMatchCount =
                  computed.meta.deduplicatedMatchCount ?? computed.meta.matchCount
              }
            }
            mappedStats.teamPerformanceSummary = await buildTeamPerformanceSummary({
              uid: profileIdentity.owner.canonicalUid,
              nickname,
              userNum: profileIdentity.owner.canonicalUserNum,
              apiSeasonId,
              displaySeasonId,
              playerTier,
            })
          }
          const responseBody = apiResult(mappedStats, statsResolved.source)
          const officialSeasonGames = merged?.totalGames ?? 0
          if (isCurrent && officialSeasonGames > 0) {
            const rankCount = isPrismaPlayerMatchReady(app.prisma) ? deduplicatedRankMatchCount : 0
            const profileCached = await hasProfileCacheDataForUids(
              app.prisma,
              profileIdentity.sources.playerMatchUids,
            )
            const dbBackfillStateForStats = await readPlayerSeasonBackfillState(
              app.prisma,
              profileIdentity.owner.canonicalUid,
              apiSeasonId,
            )
            const enqueueUser = canonicalUser
            const enqueueApiSeasonId = apiSeasonId
            const enqueueDisplaySeasonId = displaySeasonId
            if (
              shouldAllowAutoProfileBackfill({
                profileCached,
                explicitRefresh,
                backfillComplete: dbBackfillStateForStats?.status === 'complete',
              })
            ) {
              setImmediate(() => {
                void (async () => {
                  if (
                    !(await shouldEnqueueSeasonBackfill(
                      app.prisma,
                      enqueueUser.uid,
                      enqueueApiSeasonId,
                      officialSeasonGames,
                      rankCount,
                    ))
                  ) {
                    return
                  }
                  scheduleCurrentSeasonAggregateBackfill({
                    user: enqueueUser,
                    apiSeasonId: enqueueApiSeasonId,
                    displaySeasonId: enqueueDisplaySeasonId,
                    characterNames: characterNames ?? undefined,
                  })
                })()
              })
            }
          }
          void triggerRecentMatchFreshnessIfNeeded({
            profileIdentity,
            apiSeasonId,
            displaySeasonId,
            hasProfileCache: await hasProfileCacheDataForUids(
              app.prisma,
              profileIdentity.sources.playerMatchUids,
            ),
            explicitRefresh,
            logger: request.log,
          })
          assertPlayerIdentityUserNum(request.log, {
            endpoint: 'stats',
            requestedNickname: nickname,
            normalizedNickname: profileIdentity.normalizedNickname,
            expectedUserNum: profileIdentity.owner.canonicalUserNum,
            actualUserNum: mappedStats.userNum,
            cacheSource: statsResolved.source,
          })
          if (mappedStats.playerMatchCharacterStatsMeta?.userNum != null) {
            assertPlayerIdentityUserNum(request.log, {
              endpoint: 'stats.meta',
              requestedNickname: nickname,
              normalizedNickname: profileIdentity.normalizedNickname,
              expectedUserNum: profileIdentity.owner.canonicalUserNum,
              actualUserNum: mappedStats.playerMatchCharacterStatsMeta.userNum,
              cacheSource: statsResolved.source,
            })
          }
          return reply.send(responseBody)
        })
      } catch (e) {
        throw toHttpError(e)
      }
    },
  )

  withZod.get(
    '/players/:nickname/season-aggregate',
    { schema: { params: playerNicknameParams, querystring: seasonIdQuery } },
    async (request, reply) => {
      requireApiKey()
      const nickname = request.params.nickname
      try {
        const metrics: PlayerRouteMetricsExtra = {}
        return await withPlayerRoute(
          request.log,
          '/players/:nickname/season-aggregate',
          nickname,
          metrics,
          async () => {
            const identity = identityFromQuery(request.query)
            let user = await resolveUser(nickname, identity, metrics)
            const catalog = await resolveSeasonCatalog()
            const { apiSeasonId, displaySeasonId, isCurrent } = await resolveSeasonAggregateIds({
              requestedSeasonId: request.query.seasonId,
              catalog,
              resolveCurrentApiSeasonId: resolveSeasonId,
            })
            const explicitRefresh = request.query.refresh === true
            if (!characterNames) {
              await resolveCharacterNames().catch(() => {})
            }
            let statsForAggregate = await readSeasonStatsCacheSnapshot(
              app.prisma,
              seasonStatsCacheId(user.uid, apiSeasonId),
            )
            user = await resolveSeasonCanonicalUser(
              nickname,
              user,
              apiSeasonId,
              squadStatsFingerprint(statsForAggregate),
              metrics,
            )
            if (explicitRefresh) {
              bustProfileRefreshCaches({
                profileUid: user.uid,
                canonicalUid: user.uid,
                apiSeasonId,
              })
              await bustProfileRefreshDbCaches({
                canonicalUid: user.uid,
                apiSeasonId,
              })
            }
            if (metrics.canonicalBserUid) {
              statsForAggregate = await readSeasonStatsCacheSnapshot(
                app.prisma,
                seasonStatsCacheId(user.uid, apiSeasonId),
              )
            }
            const officialSeasonGames = seasonStatsTotalGames(statsForAggregate)
            const dbBackfillState = await readPlayerSeasonBackfillState(
              app.prisma,
              user.uid,
              apiSeasonId,
            )
            const rankGameCount =
              isPrismaPlayerMatchReady(app.prisma)
                ? await countPlayerMatchRankGamesForSeason(
                  app.prisma,
                  user.uid,
                  displaySeasonId,
                  apiSeasonId,
                )
                : 0
            const effectiveRankGameCount = Math.max(
              rankGameCount,
              dbBackfillState?.collectedGames ?? 0,
            )
            const seasonDataComplete = isSeasonDataCollectionComplete({
              dbState: dbBackfillState,
              rankCount: rankGameCount,
              officialSeasonGames,
            })

            if (seasonDataComplete) {
              metrics.aggregateFullSeasonReady = true
              metrics.fullBackfillRankCountBefore = rankGameCount
              metrics.fullBackfillOfficialGames = officialSeasonGames
            } else if (
              isCurrent &&
              officialSeasonGames !== null &&
              officialSeasonGames > 0 &&
              isPrismaPlayerMatchReady(app.prisma)
            ) {
              metrics.fullBackfillRankCountBefore = rankGameCount
              metrics.fullBackfillOfficialGames = officialSeasonGames
              if (shouldDeferBackfillRetry(user.uid, apiSeasonId)) {
                metrics.aggregateRefreshSkipped = true
                metrics.aggregateRefreshSkipReason = 'backfill-cooldown'
              }
            }
            const aggregateMatchRead = await readMatchesForSeasonAggregate(app.prisma, {
              uid: user.uid,
              apiSeasonId,
              displaySeasonId,
            })
            const matchesForCoverage = aggregateMatchRead.matches
            metrics.aggregateInputSource = aggregateMatchRead.inputSource
            metrics.aggregatePlayerMatchCount = aggregateMatchRead.playerMatchCount
            metrics.aggregatePlayerMatchUsed = aggregateMatchRead.inputSource === 'playerMatch'
            if (aggregateMatchRead.fallbackReason) {
              metrics.aggregatePlayerMatchFallbackReason = aggregateMatchRead.fallbackReason
            }
            const cachedAnyStatus = await readSeasonAggregateCache(
              app.prisma,
              seasonAggregateCacheId(user.uid, apiSeasonId),
            )
            const cachedAnyStatusWithCoverage = cachedAnyStatus
              ? withSeasonAggregateCoverage({
                aggregate: cachedAnyStatus,
                stats: statsForAggregate,
                matches: matchesForCoverage,
                apiSeasonId,
                displaySeasonId,
                rankGameCount: effectiveRankGameCount,
              })
              : null
            const cached = cachedAnyStatus?.cacheStatus === 'ready' ? cachedAnyStatus : null
            let aggregateReadyFastPath: PlayerSeasonAggregateContract | null = null
            if (
              seasonDataComplete &&
              cached !== null &&
              !seasonAggregateNeedsCacheRebuild(cached) &&
              !seasonAggregateNeedsRankCacheRebuild(cached, rankGameCount)
            ) {
              aggregateReadyFastPath = withSeasonAggregateCoverage({
                aggregate: cached,
                stats: statsForAggregate,
                matches: matchesForCoverage,
                apiSeasonId,
                displaySeasonId,
                rankGameCount: effectiveRankGameCount,
              })
              metrics.aggregateRefreshSkipped = true
              metrics.aggregateRefreshSkipReason = 'season-data-complete-ready-cache'
            }
            const cachedOfficialStats =
              cached &&
              (
                seasonAggregateNeedsOfficialStatsMerge(cached) ||
                seasonAggregateNeedsStatsCoverageRebuild(cached, statsForAggregate)
              )
                ? statsForAggregate
                : null
            let aggregate: PlayerSeasonAggregateContract
            if (aggregateReadyFastPath !== null) {
              aggregate = aggregateReadyFastPath
            } else if (cached && seasonAggregateNeedsCacheRebuild(cached)) {
              aggregate = await buildAndWriteSeasonAggregateFromCaches({
                prisma: app.prisma,
                uid: user.uid,
                apiSeasonId,
                displaySeasonId,
                isCurrent,
                characterNames: characterNames ?? undefined,
              })
            } else if (cached && cachedOfficialStats === null) {
              const rankGameCount = await countAggregateRankGames(
                app.prisma,
                user.uid,
                displaySeasonId,
                apiSeasonId,
              )
              const cachedWithCoverage =
                cachedAnyStatusWithCoverage ??
                withSeasonAggregateCoverage({
                  aggregate: cached,
                  stats: statsForAggregate,
                  matches: matchesForCoverage,
                  apiSeasonId,
                  displaySeasonId,
                  rankGameCount,
                })
              if (seasonAggregateNeedsRankCacheRebuild(cached, rankGameCount)) {
                metrics.aggregatePlayerMatchRebuild = true
                const rebuilt = await buildAndWriteSeasonAggregateFromCaches({
                  prisma: app.prisma,
                  uid: user.uid,
                  apiSeasonId,
                  displaySeasonId,
                  isCurrent,
                  characterNames: characterNames ?? undefined,
                })
                const rebuiltWithCoverage = withSeasonAggregateCoverage({
                  aggregate: rebuilt,
                  stats: statsForAggregate,
                  matches: matchesForCoverage,
                  apiSeasonId,
                  displaySeasonId,
                  rankGameCount,
                })
                aggregate = pickSeasonAggregateResponseBody(rebuiltWithCoverage, cachedWithCoverage)
              } else {
                aggregate = cached
              }
            } else if (cachedAnyStatus) {
              if (
                cachedAnyStatusWithCoverage &&
                seasonAggregateNeedsEmptyCacheRebuild(cachedAnyStatusWithCoverage)
              ) {
                const rebuilt = await buildAndWriteSeasonAggregateFromCaches({
                  prisma: app.prisma,
                  uid: user.uid,
                  apiSeasonId,
                  displaySeasonId,
                  isCurrent,
                  characterNames: characterNames ?? undefined,
                })
                const rebuiltWithCoverage = withSeasonAggregateCoverage({
                  aggregate: rebuilt,
                  stats: statsForAggregate,
                  matches: matchesForCoverage,
                  apiSeasonId,
                  displaySeasonId,
                  rankGameCount,
                })
                aggregate = pickSeasonAggregateResponseBody(
                  rebuiltWithCoverage,
                  cachedAnyStatusWithCoverage,
                )
              } else {
                aggregate = cachedAnyStatus
              }
            } else if (cachedOfficialStats !== null) {
              aggregate = await buildAndWriteSeasonAggregateFromCaches({
                prisma: app.prisma,
                uid: user.uid,
                apiSeasonId,
                displaySeasonId,
                isCurrent,
                characterNames: characterNames ?? undefined,
              })
            } else {
              aggregate = await refreshSeasonAggregateFromCaches({
                prisma: app.prisma,
                uid: user.uid,
                apiSeasonId,
                displaySeasonId,
                isCurrent,
                characterNames: characterNames ?? undefined,
              })
            }

            const responseBody = withSeasonAggregateCoverage({
              aggregate,
              stats: statsForAggregate,
              matches: matchesForCoverage,
              apiSeasonId,
              displaySeasonId,
              rankGameCount: effectiveRankGameCount,
            })
            const backfillProgress = snapshotFullBackfillProgress({
              uid: user.uid,
              apiSeasonId,
              rankCount: rankGameCount,
              officialSeasonGames,
              dbState: dbBackfillState,
            })
            const backfillInFlight =
              isSeasonAggregateRefreshInFlight(user.uid, apiSeasonId) ||
              isFullBackfillInflight(user.uid, apiSeasonId)
            const refreshPlan = seasonAggregateRefreshPlan({
              aggregate: responseBody,
              isCurrent,
              seasonDataComplete,
              backfillState: dbBackfillState,
            })
            const willEnqueueBackfill =
              refreshPlan.reason !== null && !shouldDeferBackfillRetry(user.uid, apiSeasonId)
            logBackfillDecisionDev(request.log, {
              nickname,
              userNum: uidToUserNum(user.uid),
              apiSeasonId,
              displaySeasonId,
              backfillStatus: dbBackfillState?.status ?? null,
              backfillCollectedGames: dbBackfillState?.collectedGames ?? null,
              officialSeasonGames,
              playerMatchCount: rankGameCount,
              aggregateCacheStatus: cachedAnyStatus?.cacheStatus ?? null,
              aggregateCollectedGames: responseBody.coverage?.collectedGames ?? null,
              decision: seasonDataComplete
                ? 'complete-fast-path'
                : dbBackfillState?.status === 'complete'
                  ? 'complete-fast-path'
                  : willEnqueueBackfill
                    ? rankGameCount > 0 || (dbBackfillState?.collectedGames ?? 0) > 0
                      ? 'partial-resume'
                      : 'full-backfill'
                    : 'skip',
              reason:
                refreshPlan.skipReason ??
                refreshPlan.reason ??
                (willEnqueueBackfill ? 'warmup-enqueue' : 'none'),
              willEnqueue: willEnqueueBackfill,
            })
            if (willEnqueueBackfill) {
              const profileCached = await hasProfileCacheData(app.prisma, user.uid)
              const backfillComplete =
                dbBackfillState?.status === 'complete' || seasonDataComplete
              if (
                shouldAllowAutoProfileBackfill({
                  profileCached,
                  explicitRefresh,
                  backfillComplete,
                })
              ) {
                const enqueueResult = scheduleCurrentSeasonAggregateBackfill({
                  user,
                  apiSeasonId,
                  displaySeasonId,
                  characterNames: characterNames ?? undefined,
                })
                metrics.aggregateRefreshEnqueued = enqueueResult.enqueued
                metrics.fullBackfillStarted = enqueueResult.enqueued
                metrics.aggregateRefreshInFlight = enqueueResult.inFlight
                metrics.aggregateRefreshReason = refreshPlan.reason ?? undefined
                metrics.aggregateRefreshSkipped = !enqueueResult.enqueued
                metrics.aggregateRefreshSkipReason = enqueueResult.skipReason
              } else {
                metrics.aggregateRefreshSkipped = true
                metrics.aggregateRefreshSkipReason = 'cache-first-manual-refresh'
              }
            } else if (refreshPlan.skipReason) {
              metrics.aggregateRefreshSkipped = true
              metrics.aggregateRefreshSkipReason = refreshPlan.skipReason
            }
            const response = seasonAggregateResponse(
              normalizeSeasonAggregateCharacterNames({
                ...responseBody,
                backfillProgress,
              }),
              {
                seasonDataComplete,
                backfillInFlight,
              },
            )
            metrics.aggregateCacheStatus = response.cacheStatus
            metrics.aggregateSource = response.source
            metrics.aggregateCharacterCount = response.characterStats.length
            metrics.aggregateRpPointCount = response.rpSeries.length
            metrics.aggregateIsRefreshing = response.isRefreshing
            metrics.aggregateRefreshMaxPages = SEASON_AGGREGATE_REFRESH_MAX_PAGES
            metrics.aggregateCoverageRatio = response.coverage?.coverageRatio ?? null
            metrics.aggregateCollectedGames = response.coverage?.collectedGames ?? null
            metrics.aggregateOfficialSeasonGames = response.coverage?.officialSeasonGames ?? null
            metrics.aggregateBasisLabel = response.basisLabel

            return reply.send(apiResult(response, 'cache'))
          },
        )
      } catch (e) {
        throw toHttpError(e)
      }
    },
  )

  withZod.get(
    '/players/:nickname/analysis',
    { schema: { params: playerNicknameParams, querystring: playerAnalysisQuery } },
    async (request, reply) => {
      requireApiKey()
      const nickname = request.params.nickname
      try {
        const metrics: PlayerRouteMetricsExtra = {}
        return await withPlayerRoute(
          request.log,
          '/players/:nickname/analysis',
          nickname,
          metrics,
          async () => {
            const identity = identityFromQuery(request.query)
            const user = await resolveUser(nickname, identity, metrics)
            const catalog = await resolveSeasonCatalog()
            const { apiSeasonId, displaySeasonId } = await resolveSeasonAggregateIds({
              requestedSeasonId: request.query.seasonId,
              catalog,
              resolveCurrentApiSeasonId: resolveSeasonId,
            })
            const profileIdentity = await loadProfileIdentity(
              nickname,
              user,
              apiSeasonId,
              metrics,
              null,
              identity.uid !== undefined,
            )
            const canonicalUid = profileIdentity.owner.canonicalUid
            if (request.query.refresh === true) {
              bustProfileRefreshCaches({
                profileUid: profileIdentity.sources.profileUid,
                canonicalUid,
                apiSeasonId,
              })
            }

            const scope = request.query.scope ?? 'rank'
            const buildStarted = performance.now()
            const draft = await buildPlayerAnalysisResponse(app.prisma, {
              canonicalUid,
              nickname,
              displaySeasonId,
              apiSeasonId,
              scope,
            })
            const buildMs = Math.round(performance.now() - buildStarted)
            if (!draft) {
              return reply.status(503).send({
                error: { code: 'UPSTREAM_ERROR', message: 'Analysis data unavailable' },
              })
            }

            const cached = readPlayerAnalysisCache({
              canonicalUid,
              seasonId: displaySeasonId,
              scope,
              fingerprint: draft.sourceFingerprint,
            })
            const data = cached ?? draft
            if (!cached) writePlayerAnalysisCache(draft)

            if (scope === 'rank') {
              void app.prisma.playerMatch
                .findMany({
                  where: {
                    uid: canonicalUid,
                    displaySeasonId,
                    apiSeasonId,
                    gameMode: 'rank',
                  },
                })
                .then((rows) => {
                  scheduleUserRoleSnapshotUpsert(app.prisma, {
                    rows: rows as import('../utils/playerMatchDedup.js').PlayerMatchRow[],
                    canonicalUid,
                    displaySeasonId,
                    apiSeasonId,
                    benchmarkScope: 'rank',
                  })
                })
                .catch(() => undefined)
            }

            metrics.analysisBuildMs = buildMs
            metrics.analysisCacheHit = cached != null

            return apiResult(data, cached ? 'cache' : 'external')
          },
        )
      } catch (e) {
        throw toHttpError(e)
      }
    },
  )

  withZod.get(
    '/players/:nickname/seasons',
    { schema: { params: playerNicknameParams, querystring: seasonsQuery } },
    async (request, reply) => {
      requireApiKey()
      const nickname = request.params.nickname
      try {
        const metrics: PlayerRouteMetricsExtra = {}
        return await withPlayerRoute(
          request.log,
          '/players/:nickname/seasons',
          nickname,
          metrics,
          async () => {
            const identityQuery = identityFromQuery(request.query)
            const lookupUser = await resolveUser(nickname, identityQuery, metrics)
            const catalog = await resolveSeasonCatalog()
            const currentSeason = await resolveDisplaySeasonId()
            const rawFrom = request.query.from ?? currentSeason
            const rawTo = request.query.to ?? currentSeason
            const from = Math.min(rawFrom, rawTo)
            const to = Math.max(rawFrom, rawTo)
            metrics.seasonsFrom = from
            metrics.seasonsTo = to

            const explicitRefresh = request.query.refresh === true
            const legacySeasonsCacheKey = `${lookupUser.uid}:${from}:${to}`
            const currentApiSeasonId = await resolveSeasonId()
            let identityBootstrappedThisRequest = false

            const rehydrateCachedSeasonsRank = (
              body: PlayerSeasonsContract,
              rankUid: string,
            ): Promise<PlayerSeasonsContract> =>
              currentApiSeasonId === null
                ? Promise.resolve(refreshSeasonsContractTiers(body))
                : rehydrateCurrentSeasonRankInSeasonsGrid(body, {
                    currentDisplaySeason: currentSeason,
                    from,
                    to,
                    apiSeasonId: currentApiSeasonId,
                    fetchRank: () => getRankCached(rankUid, currentApiSeasonId, metrics),
                    fetchStats: () =>
                      getUserStatsCached(rankUid, currentApiSeasonId, metrics).then(
                        (resolved) => resolved.stats,
                      ),
                  })

            const seasonsBodyFromCache = (
              body: PlayerSeasonsContract,
              rankUid: string,
            ): Promise<PlayerSeasonsContract> => hydrateSeasonsGridContract(app.prisma, rankUid, body)

            const scheduleSeasonsRankRehydrate = (
              body: PlayerSeasonsContract,
              rankUid: string,
              memCacheKey: string,
            ) => {
              if (currentApiSeasonId === null) return
              if (from > currentSeason || to < currentSeason) return
              void rehydrateCachedSeasonsRank(body, rankUid)
                .then((hydrated) => {
                  userSeasonsCache.set(memCacheKey, {
                    value: hydrated,
                    expiresAt: Date.now() + SEASON_CACHE_TTL_MS,
                  })
                })
                .catch(() => {})
            }

            if (!explicitRefresh) {
              const catalogForStale = await resolveSeasonCatalog()
              const cachedSeasons =
                fromCache(userSeasonsCache, legacySeasonsCacheKey) ??
                fromCache(userSeasonsCache, `${lookupUser.uid}:${from}:${to}`)
              if (cachedSeasons?.owner) {
                const stale = await shouldRefetchPlayerSeasonsChunk(
                  app.prisma,
                  lookupUser.uid,
                  cachedSeasons,
                  from,
                  to,
                  (displaySeason) => catalogForStale.apiIdForDisplay(displaySeason),
                )
                if (!stale) {
                  metrics.cacheHits = ['memory']
                  const refreshed = await seasonsBodyFromCache(cachedSeasons, lookupUser.uid)
                  scheduleSeasonsRankRehydrate(refreshed, lookupUser.uid, legacySeasonsCacheKey)
                  assertPlayerIdentityUserNum(request.log, {
                    endpoint: 'seasons',
                    requestedNickname: nickname,
                    expectedUserNum: uidToUserNum(lookupUser.uid),
                    actualUserNum: refreshed.owner?.userNum,
                    cacheSource: 'cache',
                  })
                  return reply.send(apiResult(refreshed, 'cache'))
                }
                metrics.cacheMisses = ['memory-stale-chunk']
                const staleBody = withSeasonsPartialStatus(
                  await seasonsBodyFromCache(cachedSeasons, lookupUser.uid),
                  true,
                )
                scheduleSeasonsRankRehydrate(staleBody, lookupUser.uid, legacySeasonsCacheKey)
                metrics.cacheHits = ['memory-stale']
                assertPlayerIdentityUserNum(request.log, {
                  endpoint: 'seasons',
                  requestedNickname: nickname,
                  expectedUserNum: uidToUserNum(lookupUser.uid),
                  actualUserNum: staleBody.owner?.userNum,
                  cacheSource: 'cache',
                })
                return reply.send(apiResult(staleBody, 'cache'))
              }

              const legacyGridId = playerSeasonsCacheId(lookupUser.uid, from, to)
              const legacyCachedGrid =
                (await readPlayerSeasonsCache(app.prisma, legacyGridId)) ??
                (await readPlayerSeasonsCacheIncludingStale(app.prisma, legacyGridId))
              if (legacyCachedGrid) {
                const stale = await shouldRefetchPlayerSeasonsChunk(
                  app.prisma,
                  lookupUser.uid,
                  legacyCachedGrid,
                  from,
                  to,
                  (displaySeason) => catalogForStale.apiIdForDisplay(displaySeason),
                )
                if (!stale) {
                  const refreshed = await seasonsBodyFromCache(legacyCachedGrid, lookupUser.uid)
                  scheduleSeasonsRankRehydrate(refreshed, lookupUser.uid, legacySeasonsCacheKey)
                  userSeasonsCache.set(legacySeasonsCacheKey, {
                    value: refreshed,
                    expiresAt: Date.now() + SEASON_CACHE_TTL_MS,
                  })
                  metrics.cacheHits = ['db']
                  return reply.send(apiResult(refreshed, 'cache'))
                }
                const staleGridBody = withSeasonsPartialStatus(
                  await seasonsBodyFromCache(legacyCachedGrid, lookupUser.uid),
                  true,
                )
                scheduleSeasonsRankRehydrate(staleGridBody, lookupUser.uid, legacySeasonsCacheKey)
                userSeasonsCache.set(legacySeasonsCacheKey, {
                  value: staleGridBody,
                  expiresAt: Date.now() + SEASON_CACHE_TTL_MS,
                })
                metrics.cacheHits = ['db-stale']
                return reply.send(apiResult(staleGridBody, 'cache'))
              }

              const dbFingerprint = await resolveDbStatsFingerprint(
                app.prisma,
                nickname,
                lookupUser.uid,
                currentApiSeasonId,
              )
              if (!identityQuery.uid) {
                identityBootstrappedThisRequest = await ensureIdentityBootstrappedFromDb(
                  nickname,
                  lookupUser.uid,
                  currentApiSeasonId,
                  false,
                )
              }
              const earlyCanonicalUid = identityQuery.uid
                ? lookupUser.uid
                : await resolveCanonicalUidFromDb(
                    app.prisma,
                    nickname,
                    lookupUser.uid,
                    currentApiSeasonId,
                    dbFingerprint,
                  )
              const earlySeasonCandidates = await buildSeasonsCacheUidCandidates(
                app.prisma,
                nickname,
                lookupUser.uid,
                earlyCanonicalUid,
                currentApiSeasonId,
              )
              const earlyDbSeasons = await tryReadSeasonsGridFromDb(
                app.prisma,
                earlySeasonCandidates,
                from,
                to,
                catalogForStale,
                { acceptStale: identityBootstrappedThisRequest },
              )
              if (earlyDbSeasons) {
                const seasonsOwner = {
                  nickname: nickname.trim(),
                  userNum: uidToUserNum(earlyCanonicalUid),
                }
                const seasonSourceMeta = {
                  count: earlySeasonCandidates.length,
                  strategy: 'canonical' as const,
                }
                const hydratedBody = await seasonsBodyFromCache(
                  earlyDbSeasons.body,
                  earlyCanonicalUid,
                )
                scheduleSeasonsRankRehydrate(
                  hydratedBody,
                  earlyCanonicalUid,
                  `${earlyCanonicalUid}:${from}:${to}`,
                )
                const bodyWithOwner = withSeasonsOwnerMetadata(
                  hydratedBody,
                  seasonsOwner,
                  from,
                  to,
                  currentSeason,
                  seasonSourceMeta,
                )
                userSeasonsCache.set(`${earlyCanonicalUid}:${from}:${to}`, {
                  value: bodyWithOwner,
                  expiresAt: Date.now() + SEASON_CACHE_TTL_MS,
                })
                metrics.cacheHits = ['db']
                assertPlayerIdentityUserNum(request.log, {
                  endpoint: 'seasons',
                  requestedNickname: nickname,
                  expectedUserNum: uidToUserNum(earlyCanonicalUid),
                  actualUserNum: bodyWithOwner.owner?.userNum,
                  cacheSource: 'cache',
                })
                return reply.send(apiResult(bodyWithOwner, 'cache'))
              }
            }

            const profileIdentity = await loadProfileIdentity(
              nickname,
              lookupUser,
              currentApiSeasonId,
              metrics,
              await resolveDbStatsFingerprint(
                app.prisma,
                nickname,
                lookupUser.uid,
                currentApiSeasonId,
              ),
              identityQuery.uid !== undefined,
            )
            const seasonSourceUid = profileIdentity.sources.profileUid
            const canonicalUid = profileIdentity.owner.canonicalUid
            const seasonsOwner = {
              nickname: profileIdentity.requestedNickname,
              userNum: profileIdentity.owner.canonicalUserNum,
            }
            const seasonSourceMeta = {
              count: profileIdentity.sources.seasonUids.length,
              strategy:
                profileIdentity.verification.verifiedAliasUids.length > 0
                  ? ('verified-alias' as const)
                  : ('canonical' as const),
            }
            const attachSeasonsOwner = (body: PlayerSeasonsContract) =>
              withSeasonsOwnerMetadata(
                body,
                seasonsOwner,
                from,
                to,
                currentSeason,
                seasonSourceMeta,
              )
            const sendSeasonsResponse = (
              body: PlayerSeasonsContract,
              source: ApiDataSource = 'external',
            ) => {
              assertPlayerIdentityUserNum(request.log, {
                endpoint: 'seasons',
                requestedNickname: nickname,
                normalizedNickname: profileIdentity.normalizedNickname,
                expectedUserNum: profileIdentity.owner.canonicalUserNum,
                actualUserNum: body.owner?.userNum,
                cacheSource: source,
              })
              return reply.send(apiResult(body, source))
            }

            void triggerRecentMatchFreshnessIfNeeded({
              profileIdentity,
              apiSeasonId: currentApiSeasonId,
              displaySeasonId: currentSeason,
              hasProfileCache: await hasProfileCacheDataForUids(
                app.prisma,
                profileIdentity.sources.playerMatchUids,
              ),
              explicitRefresh,
              logger: request.log,
            })

            const gridCacheId = playerSeasonsCacheId(canonicalUid, from, to)
            const seasonsCacheKey = `${canonicalUid}:${from}:${to}`

            if (!explicitRefresh) {
              const catalogForStale = await resolveSeasonCatalog()
              const cachedSeasons = fromCache(userSeasonsCache, seasonsCacheKey)
              if (cachedSeasons) {
                const stale = await shouldRefetchPlayerSeasonsChunk(
                  app.prisma,
                  canonicalUid,
                  cachedSeasons,
                  from,
                  to,
                  (displaySeason) => catalogForStale.apiIdForDisplay(displaySeason),
                )
                if (!stale) {
                  metrics.cacheHits = ['memory']
                  const refreshed = await seasonsBodyFromCache(cachedSeasons, canonicalUid)
                  scheduleSeasonsRankRehydrate(refreshed, seasonSourceUid, seasonsCacheKey)
                  return sendSeasonsResponse(attachSeasonsOwner(refreshed), 'cache')
                }
                metrics.cacheMisses = ['memory-stale-chunk']
                const staleMemoryBody = withSeasonsPartialStatus(
                  await seasonsBodyFromCache(cachedSeasons, canonicalUid),
                  true,
                )
                scheduleSeasonsRankRehydrate(staleMemoryBody, seasonSourceUid, seasonsCacheKey)
                metrics.cacheHits = ['memory-stale']
                return sendSeasonsResponse(attachSeasonsOwner(staleMemoryBody), 'cache')
              }

              const cachedGrid =
                (await readPlayerSeasonsCache(app.prisma, gridCacheId)) ??
                (await readPlayerSeasonsCacheIncludingStale(app.prisma, gridCacheId))
              if (cachedGrid) {
                const stale = await shouldRefetchPlayerSeasonsChunk(
                  app.prisma,
                  canonicalUid,
                  cachedGrid,
                  from,
                  to,
                  (displaySeason) => catalogForStale.apiIdForDisplay(displaySeason),
                )
                const refreshed = await seasonsBodyFromCache(cachedGrid, canonicalUid)
                scheduleSeasonsRankRehydrate(refreshed, seasonSourceUid, seasonsCacheKey)
                userSeasonsCache.set(seasonsCacheKey, {
                  value: refreshed,
                  expiresAt: Date.now() + SEASON_CACHE_TTL_MS,
                })
                metrics.cacheHits = stale ? ['db-stale'] : ['db']
                return sendSeasonsResponse(
                  attachSeasonsOwner(withSeasonsPartialStatus(refreshed, stale)),
                  'cache',
                )
              }

              const fromStatsCache = await buildSeasonsGridFromStatsCache(
                app.prisma,
                seasonSourceUid,
                from,
                to,
                currentSeason,
                catalogForStale,
              )
              if (fromStatsCache) {
                const statsCacheBody = attachSeasonsOwner(
                  withSeasonsPartialStatus(fromStatsCache, true),
                )
                userSeasonsCache.set(seasonsCacheKey, {
                  value: statsCacheBody,
                  expiresAt: Date.now() + SEASON_CACHE_TTL_MS,
                })
                metrics.cacheHits = ['db-stats']
                return sendSeasonsResponse(statsCacheBody, 'cache')
              }
            }

            const displaySeasons = Array.from({ length: to - from + 1 }, (_, i) => from + i)

            let rateLimitStubCount = 0
            const seasons = await mapWithConcurrency(
              displaySeasons,
              SEASON_FETCH_CONCURRENCY,
              async (displaySeason) => {
                const apiSeasonId = catalog.apiIdForDisplay(displaySeason)
                if (apiSeasonId === null) {
                  return mapToSeasonRecord(displaySeason, null, [])
                }
                try {
                  const statsResolved = await getUserStatsCached(
                    seasonSourceUid,
                    apiSeasonId,
                    metrics,
                  )
                  const stats = statsResolved.stats
                  const rankFromApi = await getRankCached(seasonSourceUid, apiSeasonId, metrics)
                  return mapToSeasonRecord(displaySeason, rankFromApi, stats)
                } catch (e) {
                  if (e instanceof BserApiError && (e.status === 429 || e.status === 403)) {
                    rateLimitStubCount += 1
                    return mapToSeasonRecord(displaySeason, null, [])
                  }
                  throw e
                }
              },
            )

            const current = seasons.find((s) => s.seasonNumber === currentSeason)
            if (current && !current.played) {
              current.played = true
              current.rank = { tier: '언랭크', rp: 0 }
              current.tier = '언랭크'
            }

            const body = refreshSeasonsContractTiers({ currentSeason, seasons })
            const bodyWithOwner = attachSeasonsOwner(body)
            const playedCount = seasons.filter((s) => s.played).length
            const currentDisplay = catalog.currentDisplaySeason()
            const includesCurrent =
              currentDisplay !== null && from <= currentDisplay && to >= currentDisplay
            if (rateLimitStubCount === 0 && (playedCount > 0 || !includesCurrent)) {
              await writePlayerSeasonsCache(
                app.prisma,
                gridCacheId,
                bodyWithOwner,
                from,
                to,
                currentDisplay,
              )
            }
            userSeasonsCache.set(seasonsCacheKey, {
              value: bodyWithOwner,
              expiresAt: Date.now() + SEASON_CACHE_TTL_MS,
            })
            return sendSeasonsResponse(bodyWithOwner)
          },
        )
      } catch (e) {
        throw toHttpError(e)
      }
    },
  )

  withZod.get(
    '/players/:nickname/matches',
    { schema: { params: playerNicknameParams, querystring: matchesQuery } },
    async (request, reply) => {
      requireApiKey()
      const { page, pageSize } = request.query
      const mode = request.query.matchMode ?? request.query.mode
      const nickname = request.params.nickname
      try {
        const metrics: PlayerRouteMetricsExtra = {
          matchesPage: page,
          matchesPageSize: pageSize,
        }
        return await withPlayerRoute(
          request.log,
          '/players/:nickname/matches',
          nickname,
          metrics,
          async () => {
            const identityQuery = identityFromQuery(request.query)
            const trimmedNickname = nickname.trim()
            const lookupUser = await resolveUser(trimmedNickname, identityQuery, metrics)
            const catalog = await resolveSeasonCatalog()
            const { apiSeasonId, displaySeasonId } = await resolveSeasonAggregateIds({
              requestedSeasonId: undefined,
              catalog,
              resolveCurrentApiSeasonId: resolveSeasonId,
            })
            const statsResolved = await getUserStatsCached(lookupUser.uid, apiSeasonId, metrics)
            const squadStats = statsResolved.stats.find((s) => s.matchingTeamMode === 3) ??
              statsResolved.stats[0] ??
              null
            const playerTier =
              squadStats && squadStats.totalGames > 0
                ? normalizeRankTier({
                    rp: squadStats.mmr,
                    rankingPosition: squadStats.rank,
                    displaySeason: displaySeasonId,
                  })
                : null
            let fingerprintForIdentity = squadStatsFingerprint(statsResolved.stats)
            if (!fingerprintForIdentity) {
              fingerprintForIdentity = await resolveDbStatsFingerprint(
                app.prisma,
                nickname,
                lookupUser.uid,
                apiSeasonId,
              )
            }
            const profileIdentity = await loadProfileIdentity(
              nickname,
              lookupUser,
              apiSeasonId,
              metrics,
              fingerprintForIdentity,
              identityQuery.uid !== undefined || identityQuery.userNum !== undefined,
            )
            const matchOwner = profileMatchOwner(profileIdentity)
            metrics.cacheHits = []
            metrics.cacheMisses = []
            const forceRefreshLatest = request.query.refresh === true
            let latestGameIdBefore: string | null = null
            if (forceRefreshLatest && page === 0) {
              latestGameIdBefore = await readProfileLatestGameId(
                app.prisma,
                [profileIdentity.sources.profileUid],
              )
            }
            const resolved = await resolvePlayerMatchesPage({
              user: matchOwner,
              profileUid: profileIdentity.sources.profileUid,
              responseUserNum: profileIdentity.owner.canonicalUserNum,
              aliasUids: profileIdentity.verification.verifiedAliasUids,
              playerMatchUids: [profileIdentity.sources.profileUid],
              page,
              pageSize,
              mode,
              apiSeasonId,
              displaySeasonId,
              metrics,
              forceRefreshLatest,
              playerTier,
            })
            const items = await attachTeamPerformanceToMatches({
              ownerUid: profileIdentity.sources.profileUid,
              ownerNickname: nickname,
              displaySeasonId,
              matches: resolved.items,
            })
            scheduleMissingTeamPerformanceParticipantsBackfill({
              matches: items,
              log: request.log,
            })
            const canonicalUid = profileIdentity.owner.canonicalUid
            let profileRefreshMeta: ProfileRefreshMeta | undefined
            if (forceRefreshLatest && page === 0) {
              const now = new Date()
              await Promise.all([
                recordManualProfileRefresh(app.prisma, canonicalUid, now),
                recordRecentMatchCheckSuccess(app.prisma, canonicalUid, now),
              ])
              profileRefreshMeta = await finalizeManualProfileRefresh({
                profileIdentity,
                apiSeasonId,
                displaySeasonId,
                latestGameIdBefore,
                newGamesInserted: metrics.playerMatchUpsertCount ?? 0,
                gamesFetched: metrics.matchesFetchedPages ?? 0,
                playerMatchUpsertFailed: metrics.playerMatchUpsertFailed,
                playerTier,
                upstreamLatestGameId: metrics.upstreamLatestGameId ?? null,
                dbLatestGameIdBefore: metrics.dbLatestGameIdBefore ?? latestGameIdBefore,
                dbLatestGameIdAfter: metrics.dbLatestGameIdAfter ?? null,
                matchDetailsFetched: metrics.playerMatchDetailRepairUpdated ?? 0,
              })
              if ((metrics.playerMatchUpsertCount ?? 0) > 0) {
                metrics.playerMatchReadSource = 'db-after-refresh'
              }
            }
            if (forceRefreshLatest) {
              void triggerRecentMatchFreshnessIfNeeded({
                profileIdentity,
                apiSeasonId,
                displaySeasonId,
                hasProfileCache: await hasProfileCacheDataForUids(
                  app.prisma,
                  profileIdentity.sources.playerMatchUids,
                ),
                explicitRefresh: true,
                logger: request.log,
              })
            }
            if (
              metrics.cacheHits?.length === 0 &&
              metrics.cacheMisses?.length === 0 &&
              metrics.playerMatchReadSource !== 'db' &&
              metrics.playerMatchReadSource !== 'db-after-refresh'
            ) {
              metrics.cacheMisses = ['games']
            }
            const body: PaginatedContract<MatchSummaryContract> = {
              items,
              page,
              pageSize,
              hasNext: resolved.hasNext,
            }
            assertMatchesPageIdentity(request.log, {
              endpoint: 'matches',
              requestedNickname: nickname,
              normalizedNickname: profileIdentity.normalizedNickname,
              expectedUserNum: profileIdentity.owner.canonicalUserNum,
              items: body.items,
            cacheSource: resolved.apiDataSource,
            })
            return reply.send(
              apiResult(body, resolved.apiDataSource, {
                profileRefresh: profileRefreshMeta,
              }),
            )
          },
        )
      } catch (e) {
        throw toHttpError(e)
      }
    },
  )
}

export default playersRoutes
