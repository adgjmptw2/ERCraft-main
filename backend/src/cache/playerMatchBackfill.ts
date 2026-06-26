import type { PrismaClient } from '@prisma/client'

import type { BserClient, BserUserGame } from '../external/bserClient.js'
import { mapToMatchSummary } from '../external/bserMapper.js'
import type { SeasonCatalog } from '../external/seasonCatalog.js'
import type { PlayerRouteMetricsExtra } from '../utils/playerRouteMetrics.js'
import {
  mapStoppedReasonToStatus,
  readPlayerSeasonBackfillState,
  type PlayerSeasonBackfillStateRow,
  writePlayerSeasonBackfillState,
} from './playerSeasonBackfillState.js'
import {
  countPlayerMatchRankGamesForSeason,
  hasPlayerMatch,
  isPrismaPlayerMatchReady,
  upsertFreshPlayerMatches,
  type FreshPlayerMatchInput,
} from './playerMatchStore.js'

export type FullBackfillStoppedReason =
  | 'complete'
  | 'upstream-exhausted'
  | 'season-boundary'
  | 'safety-limit'
  | 'chunk-limit'
  | 'no-target'
  | 'api-error'
  | 'no-progress'
  | 'cursor-loop'
  | 'unknown'

const BACKFILL_RETRY_COOLDOWN_MS = 5 * 60_000
/** chunk worker — 한 번에 fetch할 BSER page 상한 (pageSize=10 유지) */
export const BACKFILL_CHUNK_MAX_PAGES = 5
/** complete 유저 latest refresh — 최신 rank page만 확인 */
export const LATEST_REFRESH_MAX_PAGES = 2
/** running 상태 stale 판정 — lastRunAt 기준 */
export const STALE_RUNNING_MS = 3 * 60_000
/** chunk 연쇄 사이 sleep */
export const CHUNK_CHAIN_SLEEP_MS = 750
/** 연속 chunk 상한 — 초과 시 cooldown */
export const MAX_CONSECUTIVE_CHUNKS = 50
const CHUNK_CHAIN_COOLDOWN_MS = 5 * 60_000
const RANK_MATCHING_MODE = 3

export interface BackfillDiagnostics {
  officialSeasonGames: number | null
  rankCountBefore: number
  rankCountAfter: number
  pagesFetched: number
  rawGamesSeen: number
  rankGamesSeen: number
  upsertedCount: number
  duplicateCount: number
  nonRankCount: number
  outOfSeasonCount: number
  lastCursor?: number
  nextCursor?: number
  stoppedReason: FullBackfillStoppedReason
  lastSeenGameId?: string
  lastSeenPlayedAt?: string
  lastSeenSeasonId?: number
  lastSeenMatchingMode?: number
}

export function computeFullBackfillSafetyPages(officialSeasonGames: number | null): number | null {
  if (officialSeasonGames === null || officialSeasonGames <= 0) return null
  return Math.ceil(officialSeasonGames / 10) + 5
}

/** rank page에 non-rank가 섞일 때 추가 page budget */
export function computeFullBackfillMaxPages(officialSeasonGames: number | null): number | null {
  const base = computeFullBackfillSafetyPages(officialSeasonGames)
  if (base === null) return null
  return base + Math.ceil(base / 2)
}

function rawGameInTargetSeason(
  game: BserUserGame,
  apiSeasonId: number,
  displaySeasonId: number,
  catalog?: SeasonCatalog,
): boolean {
  const seasonId = game.seasonId
  if (seasonId === 0 || seasonId == null) return true
  if (seasonId === apiSeasonId) return true
  if (seasonId === displaySeasonId) return true
  const mappedDisplay = catalog?.displayForApiId(seasonId)
  if (mappedDisplay != null && mappedDisplay === displaySeasonId) return true
  return false
}

interface BackfillProgressState {
  resumeCursor?: number
  retryAfterMs?: number
  lastStoppedReason?: FullBackfillStoppedReason
  lastRankCount?: number
}

const fullBackfillInflight = new Map<string, Promise<BackfillPlayerRankSeasonResult>>()
const backfillProgress = new Map<string, BackfillProgressState>()
const inflightStartedAt = new Map<string, number>()
const chunkScheduleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const chunkChainDepth = new Map<string, number>()

export type BackfillWorkerAction =
  | 'skipped'
  | 'bootstrap-complete'
  | 'bootstrap-partial'
  | 'bootstrap-running'
  | 'latest-refresh'
  | 'continue-chunk'
  | 'cooldown'
  | 'already-running'
  | 'stale-running-recovered'

export interface BackfillWorkerTrace {
  action: BackfillWorkerAction
  stateCreatedBeforeFetch: boolean
  staleRunningDetected: boolean
  staleRunningRecovered: boolean
  scheduledNextChunk: boolean
}

let lastBackfillWorkerTrace: BackfillWorkerTrace | null = null

export function getLastBackfillWorkerTrace(): BackfillWorkerTrace | null {
  return lastBackfillWorkerTrace
}

export function clearBackfillWorkerTraceForTests(): void {
  lastBackfillWorkerTrace = null
}

function progressKey(uid: string, apiSeasonId: number): string {
  return `${uid}:${apiSeasonId}`
}

export function shouldDeferBackfillRetry(uid: string, apiSeasonId: number): boolean {
  const state = backfillProgress.get(progressKey(uid, apiSeasonId))
  if (!state?.retryAfterMs) return false
  return Date.now() < state.retryAfterMs
}

export function getBackfillResumeCursor(uid: string, apiSeasonId: number): number | undefined {
  const state = backfillProgress.get(progressKey(uid, apiSeasonId))
  if (
    state?.lastStoppedReason === 'safety-limit' ||
    state?.lastStoppedReason === 'chunk-limit'
  ) {
    return state.resumeCursor
  }
  return undefined
}

function applyRetryPolicy(
  uid: string,
  apiSeasonId: number,
  stoppedReason: FullBackfillStoppedReason,
  rankCountAfter: number,
  nextCursor?: number,
): void {
  const key = progressKey(uid, apiSeasonId)
  const prev = backfillProgress.get(key) ?? {}

  if (stoppedReason === 'safety-limit' || stoppedReason === 'chunk-limit') {
    backfillProgress.set(key, {
      ...prev,
      resumeCursor: nextCursor,
      lastStoppedReason: stoppedReason,
      lastRankCount: rankCountAfter,
      retryAfterMs: undefined,
    })
    return
  }

  if (stoppedReason === 'complete') {
    backfillProgress.delete(key)
    return
  }

  const deferReasons: FullBackfillStoppedReason[] = [
    'upstream-exhausted',
    'season-boundary',
    'no-progress',
    'cursor-loop',
  ]
  if (deferReasons.includes(stoppedReason)) {
    backfillProgress.set(key, {
      ...prev,
      resumeCursor: undefined,
      lastStoppedReason: stoppedReason,
      lastRankCount: rankCountAfter,
      retryAfterMs: Date.now() + BACKFILL_RETRY_COOLDOWN_MS,
    })
    return
  }

  backfillProgress.set(key, {
    ...prev,
    lastStoppedReason: stoppedReason,
    lastRankCount: rankCountAfter,
  })
}

export interface BackfillPlayerRankSeasonDeps {
  getUserGames: BserClient['getUserGames']
}

export interface BackfillPlayerRankSeasonParams {
  prisma: PrismaClient
  deps: BackfillPlayerRankSeasonDeps
  uid: string
  apiSeasonId: number
  displaySeasonId: number
  officialSeasonGames: number | null
  characterNames?: ReadonlyMap<number, string>
  catalog?: SeasonCatalog | null
  startNextCursor?: number
  metrics?: PlayerRouteMetricsExtra
  dedupe?: boolean
  skipRetryDefer?: boolean
  /** chunk worker — 이번 실행에서 fetch할 page 상한 */
  maxPagesThisRun?: number
  /** complete 유저 latest refresh — DB에 있는 gameId를 만나면 중단 */
  stopOnExistingGame?: boolean
}

export interface BackfillPlayerRankSeasonResult {
  rankCountBefore: number
  rankCountAfter: number
  pagesFetched: number
  matchesUpserted: number
  stoppedReason: FullBackfillStoppedReason
  durationMs: number
  skippedDedupe?: boolean
  skippedRetryDefer?: boolean
  diagnostics: BackfillDiagnostics
}

function emptyDiagnostics(
  officialSeasonGames: number | null,
  rankCountBefore: number,
  rankCountAfter: number,
  stoppedReason: FullBackfillStoppedReason,
): BackfillDiagnostics {
  return {
    officialSeasonGames,
    rankCountBefore,
    rankCountAfter,
    pagesFetched: 0,
    rawGamesSeen: 0,
    rankGamesSeen: 0,
    upsertedCount: 0,
    duplicateCount: 0,
    nonRankCount: 0,
    outOfSeasonCount: 0,
    stoppedReason,
  }
}

function applyDiagnosticsToMetrics(
  metrics: PlayerRouteMetricsExtra | undefined,
  diagnostics: BackfillDiagnostics,
): void {
  if (!metrics) return
  metrics.fullBackfillOfficialGames = diagnostics.officialSeasonGames
  metrics.fullBackfillRankCountBefore = diagnostics.rankCountBefore
  metrics.fullBackfillRankCountAfter = diagnostics.rankCountAfter
  metrics.fullBackfillPagesFetched = diagnostics.pagesFetched
  metrics.fullBackfillMatchesUpserted = diagnostics.upsertedCount
  metrics.fullBackfillStoppedReason = diagnostics.stoppedReason
  metrics.fullBackfillRawGamesSeen = diagnostics.rawGamesSeen
  metrics.fullBackfillRankGamesSeen = diagnostics.rankGamesSeen
  metrics.fullBackfillDuplicateCount = diagnostics.duplicateCount
  metrics.fullBackfillNonRankCount = diagnostics.nonRankCount
  metrics.fullBackfillOutOfSeasonCount = diagnostics.outOfSeasonCount
  metrics.fullBackfillLastCursor = diagnostics.lastCursor
  metrics.fullBackfillNextCursor = diagnostics.nextCursor
  metrics.fullBackfillLastSeenGameId = diagnostics.lastSeenGameId
  metrics.fullBackfillLastSeenSeasonId = diagnostics.lastSeenSeasonId
}

async function runBackfillPlayerRankSeasonToDatabase(
  params: BackfillPlayerRankSeasonParams,
): Promise<BackfillPlayerRankSeasonResult> {
  const startedAt = Date.now()
  const metrics = params.metrics
  const officialSeasonGames = params.officialSeasonGames
  const maxPages = computeFullBackfillMaxPages(officialSeasonGames)

  if (!isPrismaPlayerMatchReady(params.prisma)) {
    const diagnostics = emptyDiagnostics(officialSeasonGames, 0, 0, 'api-error')
    applyDiagnosticsToMetrics(metrics, diagnostics)
    return {
      rankCountBefore: 0,
      rankCountAfter: 0,
      pagesFetched: 0,
      matchesUpserted: 0,
      stoppedReason: 'api-error',
      durationMs: Date.now() - startedAt,
      diagnostics,
    }
  }

  const rankCountBefore = await countPlayerMatchRankGamesForSeason(
    params.prisma,
    params.uid,
    params.displaySeasonId,
    params.apiSeasonId,
  )

  const collectionComplete =
    officialSeasonGames !== null && rankCountBefore >= officialSeasonGames

  if (collectionComplete && !params.stopOnExistingGame) {
    const diagnostics = emptyDiagnostics(officialSeasonGames, rankCountBefore, rankCountBefore, 'complete')
    applyDiagnosticsToMetrics(metrics, diagnostics)
    return {
      rankCountBefore,
      rankCountAfter: rankCountBefore,
      pagesFetched: 0,
      matchesUpserted: 0,
      stoppedReason: 'complete',
      durationMs: Date.now() - startedAt,
      diagnostics,
    }
  }

  if (officialSeasonGames === null || officialSeasonGames <= 0) {
    const diagnostics = emptyDiagnostics(officialSeasonGames, rankCountBefore, rankCountBefore, 'no-target')
    applyDiagnosticsToMetrics(metrics, diagnostics)
    return {
      rankCountBefore,
      rankCountAfter: rankCountBefore,
      pagesFetched: 0,
      matchesUpserted: 0,
      stoppedReason: 'no-target',
      durationMs: Date.now() - startedAt,
      diagnostics,
    }
  }

  if (!params.skipRetryDefer && shouldDeferBackfillRetry(params.uid, params.apiSeasonId)) {
    const diagnostics = emptyDiagnostics(officialSeasonGames, rankCountBefore, rankCountBefore, 'unknown')
    diagnostics.stoppedReason = backfillProgress.get(progressKey(params.uid, params.apiSeasonId))
      ?.lastStoppedReason ?? 'unknown'
    applyDiagnosticsToMetrics(metrics, diagnostics)
    return {
      rankCountBefore,
      rankCountAfter: rankCountBefore,
      pagesFetched: 0,
      matchesUpserted: 0,
      stoppedReason: diagnostics.stoppedReason,
      durationMs: Date.now() - startedAt,
      skippedRetryDefer: true,
      diagnostics,
    }
  }

  let pagesFetched = 0
  let matchesUpserted = 0
  let rawGamesSeen = 0
  let rankGamesSeen = 0
  let duplicateCount = 0
  let nonRankCount = 0
  let outOfSeasonCount = 0
  let cursor: number | undefined =
    params.startNextCursor ?? getBackfillResumeCursor(params.uid, params.apiSeasonId)
  let lastCursor: number | undefined = cursor
  let nextCursor: number | undefined
  let stoppedReason: FullBackfillStoppedReason = 'unknown'
  let lastSeenGameId: string | undefined
  let lastSeenPlayedAt: string | undefined
  let lastSeenSeasonId: number | undefined
  let lastSeenMatchingMode: number | undefined
  let hitExistingGame = false

  const seasonBoundary = {
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
  }
  const names = params.characterNames ?? new Map<number, string>()
  const catalog = params.catalog ?? undefined
  const seenCursors = new Set<number | 'start'>()
  const knownRankGameIds = new Set<string>()

  try {
    while (true) {
      const rankCount = await countPlayerMatchRankGamesForSeason(
        params.prisma,
        params.uid,
        params.displaySeasonId,
        params.apiSeasonId,
      )
      if (rankCount >= officialSeasonGames) {
        stoppedReason = 'complete'
        break
      }

      if (maxPages !== null && pagesFetched >= maxPages) {
        stoppedReason = 'safety-limit'
        break
      }

      if (
        params.maxPagesThisRun !== undefined &&
        pagesFetched >= params.maxPagesThisRun
      ) {
        stoppedReason = 'chunk-limit'
        break
      }

      const cursorKey = cursor ?? ('start' as const)
      if (seenCursors.has(cursorKey)) {
        stoppedReason = 'cursor-loop'
        break
      }
      seenCursors.add(cursorKey)
      lastCursor = cursor

      const rankCountBeforePage = rankCount
      const page = await params.deps.getUserGames(params.uid, cursor)
      pagesFetched += 1
      nextCursor = page.next
      let hitSeasonBoundary = false

      const freshMatches: FreshPlayerMatchInput[] = []
      for (const game of page.games) {
        rawGamesSeen += 1
        lastSeenGameId = String(game.gameId)
        lastSeenPlayedAt = game.startDtm
        lastSeenSeasonId = game.seasonId
        lastSeenMatchingMode = game.matchingMode

        if (game.matchingMode !== RANK_MATCHING_MODE) {
          nonRankCount += 1
          continue
        }

        rankGamesSeen += 1

        if (
          !rawGameInTargetSeason(
            game,
            seasonBoundary.apiSeasonId,
            seasonBoundary.displaySeasonId,
            catalog,
          )
        ) {
          outOfSeasonCount += 1
          hitSeasonBoundary = true
          break
        }

        const match = mapToMatchSummary(params.uid, game, names, catalog)
        if (match.gameMode !== 'rank') {
          nonRankCount += 1
          continue
        }

        const existsInDb = await hasPlayerMatch(params.prisma, params.uid, match.matchId)
        if (existsInDb || knownRankGameIds.has(match.matchId)) {
          duplicateCount += 1
          if (params.stopOnExistingGame && existsInDb) {
            hitExistingGame = true
            break
          }
        }
        knownRankGameIds.add(match.matchId)

        freshMatches.push({
          match,
          matchingMode: game.matchingMode,
          matchingTeamMode: game.matchingTeamMode,
        })
      }

      if (freshMatches.length > 0) {
        const upsertResult = await upsertFreshPlayerMatches(params.prisma, params.uid, freshMatches, {
          catalog,
          seasonBoundary,
        })
        matchesUpserted += upsertResult.upserted
        if (metrics) {
          metrics.playerMatchUpsertCount =
            (metrics.playerMatchUpsertCount ?? 0) + upsertResult.upserted
        }
      }

      const rankCountAfterPage = await countPlayerMatchRankGamesForSeason(
        params.prisma,
        params.uid,
        params.displaySeasonId,
        params.apiSeasonId,
      )

      if (hitSeasonBoundary) {
        stoppedReason = 'season-boundary'
        break
      }

      if (hitExistingGame) {
        stoppedReason = 'complete'
        break
      }

      if (page.next === undefined || page.games.length === 0) {
        stoppedReason = 'upstream-exhausted'
        break
      }

      const pageHadTargetRankGames = page.games.some((game) =>
        game.matchingMode === RANK_MATCHING_MODE &&
        rawGameInTargetSeason(
          game,
          seasonBoundary.apiSeasonId,
          seasonBoundary.displaySeasonId,
          catalog,
        ),
      )

      if (
        rankCountAfterPage <= rankCountBeforePage &&
        freshMatches.length === 0 &&
        pageHadTargetRankGames
      ) {
        cursor = page.next
        continue
      }

      cursor = page.next
    }
  } catch {
    stoppedReason = 'api-error'
  }

  const rankCountAfter = await countPlayerMatchRankGamesForSeason(
    params.prisma,
    params.uid,
    params.displaySeasonId,
    params.apiSeasonId,
  )

  if (
    stoppedReason !== 'complete' &&
    rankCountAfter >= officialSeasonGames
  ) {
    stoppedReason = 'complete'
  }

  const diagnostics: BackfillDiagnostics = {
    officialSeasonGames,
    rankCountBefore,
    rankCountAfter,
    pagesFetched,
    rawGamesSeen,
    rankGamesSeen,
    upsertedCount: matchesUpserted,
    duplicateCount,
    nonRankCount,
    outOfSeasonCount,
    lastCursor,
    nextCursor,
    stoppedReason,
    lastSeenGameId,
    lastSeenPlayedAt,
    lastSeenSeasonId,
    lastSeenMatchingMode,
  }

  applyRetryPolicy(params.uid, params.apiSeasonId, stoppedReason, rankCountAfter, nextCursor)
  applyDiagnosticsToMetrics(metrics, diagnostics)

  return {
    rankCountBefore,
    rankCountAfter,
    pagesFetched,
    matchesUpserted,
    stoppedReason,
    durationMs: Date.now() - startedAt,
    diagnostics,
  }
}

/** 검색 유저 현재 시즌 rank 전체를 PlayerMatch DB에 backfill — uid+apiSeasonId inflight dedupe */
export async function backfillPlayerRankSeasonToDatabase(
  params: BackfillPlayerRankSeasonParams,
): Promise<BackfillPlayerRankSeasonResult> {
  const dedupe = params.dedupe !== false
  const key = progressKey(params.uid, params.apiSeasonId)

  if (dedupe) {
    const inflight = fullBackfillInflight.get(key)
    if (inflight) {
      const result = await inflight
      return { ...result, skippedDedupe: true }
    }

    const promise = runBackfillPlayerRankSeasonToDatabase(params)
    inflightStartedAt.set(key, Date.now())
    fullBackfillInflight.set(key, promise)
    try {
      return await promise
    } finally {
      fullBackfillInflight.delete(key)
      inflightStartedAt.delete(key)
    }
  }

  return runBackfillPlayerRankSeasonToDatabase(params)
}

export function clearFullBackfillInflightForTests(): void {
  fullBackfillInflight.clear()
}

export function clearFullBackfillProgressForTests(): void {
  backfillProgress.clear()
}

export function clearFullBackfillStateForTests(): void {
  clearFullBackfillInflightForTests()
  clearFullBackfillProgressForTests()
  inflightStartedAt.clear()
  for (const timer of chunkScheduleTimers.values()) {
    clearTimeout(timer)
  }
  chunkScheduleTimers.clear()
  chunkChainDepth.clear()
  clearBackfillWorkerTraceForTests()
}

export type FullBackfillJobStatus =
  | 'idle'
  | 'running'
  | 'complete'
  | 'partial'
  | 'failed'
  | 'cooldown'

export interface FullBackfillProgressSnapshot {
  status: FullBackfillJobStatus
  officialSeasonGames: number | null
  collectedGames: number
  stoppedReason?: FullBackfillStoppedReason
}

export function isFullBackfillInflight(uid: string, apiSeasonId: number): boolean {
  const key = progressKey(uid, apiSeasonId)
  if (!fullBackfillInflight.has(key)) return false
  if (isStaleInflight(key)) {
    fullBackfillInflight.delete(key)
    inflightStartedAt.delete(key)
    return false
  }
  return true
}

export function isStaleRunningState(dbState: PlayerSeasonBackfillStateRow | null): boolean {
  if (!dbState || dbState.status !== 'running') return false
  if (!dbState.lastRunAt) return true
  return Date.now() - dbState.lastRunAt.getTime() > STALE_RUNNING_MS
}

/** cold start — DB backfill row의 collectedGames를 rank count 하한으로 사용 */
export function effectiveBackfillCollectedGames(
  rankCount: number,
  dbState?: PlayerSeasonBackfillStateRow | null,
): number {
  return Math.max(rankCount, dbState?.collectedGames ?? 0)
}

/** 재시작 후에도 DB complete / 충분한 collectedGames 기준으로 시즌 수집 완료 판정 */
export function isSeasonDataCollectionComplete(params: {
  dbState?: PlayerSeasonBackfillStateRow | null
  rankCount: number
  officialSeasonGames: number | null
}): boolean {
  const { dbState, rankCount, officialSeasonGames } = params
  const effective = effectiveBackfillCollectedGames(rankCount, dbState)
  if (officialSeasonGames === null || officialSeasonGames <= 0) {
    return dbState?.status === 'complete'
  }
  if (dbState?.status === 'complete' && effective >= officialSeasonGames) {
    return true
  }
  return effective >= officialSeasonGames
}

/** complete DB state면 full backfill 금지 — latest refresh만 허용 */
export function shouldUseLatestRefreshOnly(
  dbState: PlayerSeasonBackfillStateRow | null | undefined,
): boolean {
  return dbState?.status === 'complete'
}

function isStaleInflight(key: string): boolean {
  const started = inflightStartedAt.get(key)
  if (started === undefined) return false
  return Date.now() - started > STALE_RUNNING_MS
}

export async function bootstrapBackfillStateIfMissing(
  params: Pick<
    BackfillPlayerRankSeasonParams,
    'prisma' | 'uid' | 'apiSeasonId' | 'displaySeasonId' | 'officialSeasonGames'
  > & { rankCount: number },
): Promise<{ action: BackfillWorkerAction; created: boolean }> {
  const existing = await readPlayerSeasonBackfillState(params.prisma, params.uid, params.apiSeasonId)
  if (existing) return { action: 'skipped', created: false }

  const official = params.officialSeasonGames
  const rankCount = params.rankCount

  let status: 'complete' | 'partial' | 'running'
  let action: BackfillWorkerAction

  if (official !== null && official > 0 && rankCount >= official) {
    status = 'complete'
    action = 'bootstrap-complete'
  } else if (rankCount > 0) {
    status = 'partial'
    action = 'bootstrap-partial'
  } else {
    status = 'running'
    action = 'bootstrap-running'
  }

  await writePlayerSeasonBackfillState(params.prisma, {
    uid: params.uid,
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
    status,
    officialSeasonGames: official,
    collectedGames: rankCount,
    nextCursor: null,
    lastStoppedReason: status === 'complete' ? 'complete' : null,
    markFinished: status === 'complete',
  })

  return { action, created: true }
}

async function markRunningBeforeFetch(
  params: Pick<
    BackfillPlayerRankSeasonParams,
    'prisma' | 'uid' | 'apiSeasonId' | 'displaySeasonId' | 'officialSeasonGames'
  >,
  rankCount: number,
  nextCursor?: number | null,
): Promise<void> {
  const existing = await readPlayerSeasonBackfillState(params.prisma, params.uid, params.apiSeasonId)
  // 재시작 후 full backfill 방지 — complete row를 running으로 덮지 않음
  if (existing?.status === 'complete') return

  await writePlayerSeasonBackfillState(params.prisma, {
    uid: params.uid,
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
    status: 'running',
    officialSeasonGames: params.officialSeasonGames,
    collectedGames: rankCount,
    nextCursor: nextCursor ?? null,
    lastStoppedReason: null,
  })
}

async function touchCompleteBackfillHeartbeat(
  params: Pick<
    BackfillPlayerRankSeasonParams,
    'prisma' | 'uid' | 'apiSeasonId' | 'displaySeasonId' | 'officialSeasonGames'
  >,
  rankCount: number,
): Promise<void> {
  await writePlayerSeasonBackfillState(params.prisma, {
    uid: params.uid,
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
    status: 'complete',
    officialSeasonGames: params.officialSeasonGames,
    collectedGames: rankCount,
    lastStoppedReason: 'complete',
    markFinished: true,
  })
}

export function snapshotFullBackfillProgress(params: {
  uid: string
  apiSeasonId: number
  rankCount: number
  officialSeasonGames: number | null
  dbState?: PlayerSeasonBackfillStateRow | null
}): FullBackfillProgressSnapshot {
  const { uid, apiSeasonId, rankCount, officialSeasonGames, dbState } = params
  const collectedGames = effectiveBackfillCollectedGames(rankCount, dbState)

  if (
    dbState?.status === 'complete' ||
    (officialSeasonGames !== null &&
      officialSeasonGames > 0 &&
      collectedGames >= officialSeasonGames)
  ) {
    return { status: 'complete', officialSeasonGames, collectedGames }
  }

  if (dbState?.retryAfter && dbState.retryAfter.getTime() > Date.now()) {
    return { status: 'cooldown', officialSeasonGames, collectedGames }
  }

  if (dbState?.status === 'running' || isFullBackfillInflight(uid, apiSeasonId)) {
    return { status: 'running', officialSeasonGames, collectedGames }
  }

  if (shouldDeferBackfillRetry(uid, apiSeasonId)) {
    return { status: 'cooldown', officialSeasonGames, collectedGames }
  }

  if (dbState?.status === 'failed' || dbState?.lastStoppedReason === 'api-error') {
    return {
      status: 'failed',
      officialSeasonGames,
      collectedGames,
      stoppedReason: (dbState?.lastStoppedReason as FullBackfillStoppedReason | undefined) ?? 'api-error',
    }
  }

  const state = backfillProgress.get(progressKey(uid, apiSeasonId))
  if (state?.lastStoppedReason === 'api-error') {
    return {
      status: 'failed',
      officialSeasonGames,
      collectedGames,
      stoppedReason: state.lastStoppedReason,
    }
  }

  if (dbState?.status === 'partial' || collectedGames > 0) {
    return {
      status: 'partial',
      officialSeasonGames,
      collectedGames,
      stoppedReason:
        (dbState?.lastStoppedReason as FullBackfillStoppedReason | undefined) ??
        state?.lastStoppedReason,
    }
  }

  return { status: 'idle', officialSeasonGames, collectedGames }
}

async function persistBackfillStateFromResult(
  params: Pick<
    BackfillPlayerRankSeasonParams,
    'prisma' | 'uid' | 'apiSeasonId' | 'displaySeasonId' | 'officialSeasonGames'
  >,
  result: BackfillPlayerRankSeasonResult,
  options?: { preserveComplete?: boolean },
): Promise<void> {
  const d = result.diagnostics
  const status = mapStoppedReasonToStatus(
    d.stoppedReason,
    result.rankCountAfter,
    params.officialSeasonGames,
    options,
  )
  const retryAfter = shouldDeferBackfillRetry(params.uid, params.apiSeasonId)
    ? new Date(Date.now() + BACKFILL_RETRY_COOLDOWN_MS)
    : null

  await writePlayerSeasonBackfillState(params.prisma, {
    uid: params.uid,
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
    status,
    officialSeasonGames: params.officialSeasonGames,
    collectedGames: result.rankCountAfter,
    nextCursor: d.nextCursor ?? null,
    lastCursor: d.lastCursor ?? null,
    lastStoppedReason: d.stoppedReason,
    pagesFetchedDelta: d.pagesFetched,
    rawGamesSeenDelta: d.rawGamesSeen,
    rankGamesSeenDelta: d.rankGamesSeen,
    upsertedDelta: d.upsertedCount,
    duplicateDelta: d.duplicateCount,
    retryAfter,
    markFinished: status === 'complete',
  })
}

/** complete 유저 — 최신 rank page 1~2만 확인, 기존 gameId 만나면 중단 */
export async function refreshLatestRankMatchesForPlayer(
  params: BackfillPlayerRankSeasonParams,
): Promise<BackfillPlayerRankSeasonResult> {
  return backfillPlayerRankSeasonToDatabase({
    ...params,
    stopOnExistingGame: true,
    maxPagesThisRun: LATEST_REFRESH_MAX_PAGES,
    skipRetryDefer: true,
  })
}

/** incomplete 유저 — nextCursor 기준 chunk backfill */
export async function continueSeasonBackfillChunk(
  params: BackfillPlayerRankSeasonParams,
): Promise<BackfillPlayerRankSeasonResult> {
  const dbState = await readPlayerSeasonBackfillState(params.prisma, params.uid, params.apiSeasonId)
  const startNextCursor =
    params.startNextCursor ??
    dbState?.nextCursor ??
    dbState?.lastCursor ??
    getBackfillResumeCursor(params.uid, params.apiSeasonId)

  return backfillPlayerRankSeasonToDatabase({
    ...params,
    startNextCursor,
    maxPagesThisRun: BACKFILL_CHUNK_MAX_PAGES,
  })
}

export async function shouldEnqueueSeasonBackfill(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
  officialSeasonGames: number | null,
  rankCount: number,
): Promise<boolean> {
  if (officialSeasonGames === null || officialSeasonGames <= 0) return false
  if (shouldDeferBackfillRetry(uid, apiSeasonId)) return false

  const dbState = await readPlayerSeasonBackfillState(prisma, uid, apiSeasonId)
  if (dbState?.retryAfter && dbState.retryAfter.getTime() > Date.now()) return false
  if (
    isSeasonDataCollectionComplete({
      dbState,
      rankCount,
      officialSeasonGames,
    })
  ) {
    return false
  }

  if (dbState?.status === 'running' && !isStaleRunningState(dbState)) return false
  if (isFullBackfillInflight(uid, apiSeasonId)) return false

  return true
}

export interface RunSeasonBackfillWorkerOptions {
  chainDepth?: number
  onChain?: (params: BackfillPlayerRankSeasonParams, chainDepth: number) => void
}

/** chunk worker — complete면 latest refresh, incomplete면 chunk continue */
export async function runSeasonBackfillWorker(
  params: BackfillPlayerRankSeasonParams,
  options: RunSeasonBackfillWorkerOptions = {},
): Promise<BackfillPlayerRankSeasonResult> {
  const chainDepth = options.chainDepth ?? 0
  const trace: BackfillWorkerTrace = {
    action: 'skipped',
    stateCreatedBeforeFetch: false,
    staleRunningDetected: false,
    staleRunningRecovered: false,
    scheduledNextChunk: false,
  }

  let dbState = await readPlayerSeasonBackfillState(params.prisma, params.uid, params.apiSeasonId)
  if (dbState?.retryAfter && dbState.retryAfter.getTime() > Date.now()) {
    const rankCount = await countPlayerMatchRankGamesForSeason(
      params.prisma,
      params.uid,
      params.displaySeasonId,
      params.apiSeasonId,
    )
    trace.action = 'cooldown'
    lastBackfillWorkerTrace = trace
    const stoppedReason =
      (dbState.lastStoppedReason as FullBackfillStoppedReason | null) ?? 'unknown'
    const diagnostics = emptyDiagnostics(params.officialSeasonGames, rankCount, rankCount, stoppedReason)
    return {
      rankCountBefore: rankCount,
      rankCountAfter: rankCount,
      pagesFetched: 0,
      matchesUpserted: 0,
      stoppedReason,
      durationMs: 0,
      skippedRetryDefer: true,
      diagnostics,
    }
  }

  const rankCountBefore = await countPlayerMatchRankGamesForSeason(
    params.prisma,
    params.uid,
    params.displaySeasonId,
    params.apiSeasonId,
  )

  const bootstrap = await bootstrapBackfillStateIfMissing({
    prisma: params.prisma,
    uid: params.uid,
    apiSeasonId: params.apiSeasonId,
    displaySeasonId: params.displaySeasonId,
    officialSeasonGames: params.officialSeasonGames,
    rankCount: rankCountBefore,
  })
  if (bootstrap.created) {
    trace.stateCreatedBeforeFetch = true
    trace.action = bootstrap.action
    dbState = await readPlayerSeasonBackfillState(params.prisma, params.uid, params.apiSeasonId)
  }

  if (isStaleRunningState(dbState)) {
    trace.staleRunningDetected = true
    trace.staleRunningRecovered = true
    trace.action = 'stale-running-recovered'
  } else if (
    isFullBackfillInflight(params.uid, params.apiSeasonId) &&
    dbState?.status !== 'complete'
  ) {
    trace.action = 'already-running'
    lastBackfillWorkerTrace = trace
    const diagnostics = emptyDiagnostics(
      params.officialSeasonGames,
      rankCountBefore,
      rankCountBefore,
      'unknown',
    )
    return {
      rankCountBefore,
      rankCountAfter: rankCountBefore,
      pagesFetched: 0,
      matchesUpserted: 0,
      stoppedReason: 'unknown',
      durationMs: 0,
      skippedDedupe: true,
      diagnostics,
    }
  }

  const official = params.officialSeasonGames
  const effectiveRankCount = effectiveBackfillCollectedGames(rankCountBefore, dbState)
  const useLatestRefreshOnly = shouldUseLatestRefreshOnly(dbState)
  const needsMoreGames =
    !useLatestRefreshOnly && official !== null && effectiveRankCount < official
  const isComplete =
    useLatestRefreshOnly ||
    (!needsMoreGames &&
      (official !== null && official > 0 && effectiveRankCount >= official))

  const resumeCursor =
    dbState?.nextCursor ??
    dbState?.lastCursor ??
    getBackfillResumeCursor(params.uid, params.apiSeasonId)

  if (isComplete) {
    trace.action = 'latest-refresh'
    await touchCompleteBackfillHeartbeat(params, effectiveRankCount)
  } else {
    trace.action = 'continue-chunk'
    await markRunningBeforeFetch(params, effectiveRankCount, resumeCursor)
    trace.stateCreatedBeforeFetch = true
  }

  const result = isComplete
    ? await refreshLatestRankMatchesForPlayer(params)
    : await continueSeasonBackfillChunk({
      ...params,
      startNextCursor: resumeCursor,
    })

  await persistBackfillStateFromResult(params, result, {
    preserveComplete: isComplete,
  })

  if (
    shouldChainNextBackfillChunk(result, params.officialSeasonGames) &&
    !shouldDeferBackfillRetry(params.uid, params.apiSeasonId)
  ) {
    if (chainDepth + 1 >= MAX_CONSECUTIVE_CHUNKS) {
      await writePlayerSeasonBackfillState(params.prisma, {
        uid: params.uid,
        apiSeasonId: params.apiSeasonId,
        displaySeasonId: params.displaySeasonId,
        status: 'partial',
        officialSeasonGames: params.officialSeasonGames,
        collectedGames: result.rankCountAfter,
        nextCursor: result.diagnostics.nextCursor ?? null,
        lastCursor: result.diagnostics.lastCursor ?? null,
        lastStoppedReason: result.stoppedReason,
        retryAfter: new Date(Date.now() + CHUNK_CHAIN_COOLDOWN_MS),
      })
    } else if (options.onChain) {
      trace.scheduledNextChunk = true
      options.onChain(params, chainDepth + 1)
    }
  }

  lastBackfillWorkerTrace = trace
  return result
}

export function scheduleInternalBackfillChunk(
  params: BackfillPlayerRankSeasonParams,
  run: (workerParams: BackfillPlayerRankSeasonParams, chainDepth: number) => Promise<void>,
  chainDepth: number,
): boolean {
  const key = progressKey(params.uid, params.apiSeasonId)
  const existing = chunkScheduleTimers.get(key)
  if (existing) clearTimeout(existing)

  chunkChainDepth.set(key, chainDepth)
  const timer = setTimeout(() => {
    chunkScheduleTimers.delete(key)
    void run(params, chainDepth).finally(() => {
      if (chunkChainDepth.get(key) === chainDepth) {
        chunkChainDepth.delete(key)
      }
    })
  }, CHUNK_CHAIN_SLEEP_MS)
  timer.unref?.()
  chunkScheduleTimers.set(key, timer)
  return true
}

export function getScheduledChunkDepth(uid: string, apiSeasonId: number): number | undefined {
  return chunkChainDepth.get(progressKey(uid, apiSeasonId))
}

export function shouldChainNextBackfillChunk(
  result: BackfillPlayerRankSeasonResult,
  officialSeasonGames: number | null,
): boolean {
  if (officialSeasonGames === null || officialSeasonGames <= 0) return false
  if (result.rankCountAfter >= officialSeasonGames) return false
  return result.stoppedReason === 'chunk-limit' || result.stoppedReason === 'safety-limit'
}
