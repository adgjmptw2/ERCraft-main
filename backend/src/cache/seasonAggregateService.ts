import type { PrismaClient } from '@prisma/client'

import type { MatchSummaryContract, PlayerSeasonAggregateContract } from '../contracts/player.js'
import { uidToUserNum } from '../external/bserMapper.js'
import {
  readMatchesCacheSnapshot,
  matchesCacheId,
} from './matchesCache.js'
import {
  countPlayerMatchRankGamesForSeason,
  isPrismaPlayerMatchReady,
  readPlayerMatchRankSummariesForAggregate,
} from './playerMatchStore.js'
import {
  readSeasonAggregateCache,
  seasonAggregateCacheId,
  writeSeasonAggregateCache,
} from './seasonAggregateCache.js'
import {
  buildSeasonAggregate,
  countSeasonRankGames,
  type BuiltSeasonAggregate,
} from './seasonAggregateBuilder.js'
import {
  readSeasonStatsCacheSnapshot,
  seasonStatsCacheId,
} from './seasonStatsCache.js'

export {
  pickSeasonAggregateResponseBody,
  seasonAggregateHasMoreInformation,
  seasonAggregateIsDowngrade,
  seasonAggregateShouldReplaceCache,
  seasonAggregateWriteSkipReason,
} from './seasonAggregateCompare.js'

export interface SeasonAggregateCacheRequest {
  prisma: PrismaClient
  uid: string
  apiSeasonId: number
  displaySeasonId: number
  isCurrent: boolean
  characterNames?: ReadonlyMap<number, string>
  now?: Date
}

const refreshInflight = new Map<string, Promise<BuiltSeasonAggregate>>()

function aggregateKey(uid: string, apiSeasonId: number): string {
  return `${uid}:${apiSeasonId}`
}

/** rank cache 우선 — 동일 matchId는 rank 항목이 all 항목을 덮어씀 */
export function mergeRankAndAllMatchItems(
  rankItems: ReadonlyArray<MatchSummaryContract>,
  allItems: ReadonlyArray<MatchSummaryContract>,
): MatchSummaryContract[] {
  const rankById = new Map(rankItems.map((item) => [item.matchId, item] as const))
  const allById = new Map(allItems.map((item) => [item.matchId, item] as const))
  const orderedIds: string[] = []
  const seen = new Set<string>()

  for (const item of rankItems) {
    if (seen.has(item.matchId)) continue
    seen.add(item.matchId)
    orderedIds.push(item.matchId)
  }
  for (const item of allItems) {
    if (seen.has(item.matchId)) continue
    seen.add(item.matchId)
    orderedIds.push(item.matchId)
  }

  return orderedIds.map((matchId) => rankById.get(matchId) ?? allById.get(matchId)!)
}

export async function readMergedMatchesForAggregate(
  prisma: PrismaClient,
  uid: string,
): Promise<MatchSummaryContract[]> {
  const [rankCached, allCached] = await Promise.all([
    readMatchesCacheSnapshot(prisma, matchesCacheId(uid, 'rank')),
    readMatchesCacheSnapshot(prisma, matchesCacheId(uid)),
  ])
  return mergeRankAndAllMatchItems(rankCached?.items ?? [], allCached?.items ?? [])
}

export async function countRankCacheSeasonGames(
  prisma: PrismaClient,
  uid: string,
  displaySeasonId: number,
  apiSeasonId: number,
): Promise<number> {
  const rankCached = await readMatchesCacheSnapshot(prisma, matchesCacheId(uid, 'rank'))
  if (!rankCached) return 0
  return countSeasonRankGames(rankCached.items, displaySeasonId, apiSeasonId)
}

export type AggregateMatchInputSource = 'playerMatch' | 'matchesCache'

export interface ReadAggregateMatchesResult {
  matches: MatchSummaryContract[]
  inputSource: AggregateMatchInputSource
  playerMatchCount: number
  fallbackReason?: string
}

/** PlayerMatch rank 우선 — 없으면 MatchesCache rank+all merge fallback */
export async function readMatchesForSeasonAggregate(
  prisma: PrismaClient,
  params: {
    uid: string
    apiSeasonId: number
    displaySeasonId: number
  },
): Promise<ReadAggregateMatchesResult> {
  const userNum = uidToUserNum(params.uid)
  const playerMatchCount = await countPlayerMatchRankGamesForSeason(
    prisma,
    params.uid,
    params.displaySeasonId,
    params.apiSeasonId,
  )

  if (playerMatchCount > 0 && isPrismaPlayerMatchReady(prisma)) {
    const matches = await readPlayerMatchRankSummariesForAggregate(prisma, {
      uid: params.uid,
      userNum,
      apiSeasonId: params.apiSeasonId,
      displaySeasonId: params.displaySeasonId,
    })
    return {
      matches,
      inputSource: 'playerMatch',
      playerMatchCount,
    }
  }

  return {
    matches: await readMergedMatchesForAggregate(prisma, params.uid),
    inputSource: 'matchesCache',
    playerMatchCount: 0,
    fallbackReason: !isPrismaPlayerMatchReady(prisma) ? 'store-not-ready' : 'empty-player-match',
  }
}

/** aggregate rebuild 비교용 — PlayerMatch rank count 우선, 없으면 MatchesCache rank count */
export async function countAggregateRankGames(
  prisma: PrismaClient,
  uid: string,
  displaySeasonId: number,
  apiSeasonId: number,
): Promise<number> {
  const playerMatchCount = await countPlayerMatchRankGamesForSeason(
    prisma,
    uid,
    displaySeasonId,
    apiSeasonId,
  )
  if (playerMatchCount > 0) return playerMatchCount
  return countRankCacheSeasonGames(prisma, uid, displaySeasonId, apiSeasonId)
}

export function aggregateCollectedGames(aggregate: PlayerSeasonAggregateContract): number {
  const fromCoverage = aggregate.coverage?.collectedGames
  if (fromCoverage != null) return fromCoverage
  return aggregate.characterStats.reduce((sum, row) => sum + row.games, 0)
}

export function seasonAggregateNeedsRankCacheRebuild(
  aggregate: PlayerSeasonAggregateContract,
  rankGameCount: number,
): boolean {
  if (rankGameCount <= 0) return false
  return rankGameCount > aggregateCollectedGames(aggregate)
}

/** PlayerMatch 또는 MatchesCache rank count 기준 rebuild 필요 여부 */
export const seasonAggregateNeedsMatchInputRebuild = seasonAggregateNeedsRankCacheRebuild

export async function readValidSeasonAggregate(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
): Promise<PlayerSeasonAggregateContract | null> {
  const cached = await readSeasonAggregateCache(
    prisma,
    seasonAggregateCacheId(uid, apiSeasonId),
  )
  if (cached?.cacheStatus !== 'ready') return null
  return cached
}

export async function buildAndWriteSeasonAggregateFromCaches(
  request: SeasonAggregateCacheRequest,
): Promise<BuiltSeasonAggregate> {
  const [stats, matchRead] = await Promise.all([
    readSeasonStatsCacheSnapshot(
      request.prisma,
      seasonStatsCacheId(request.uid, request.apiSeasonId),
    ),
    readMatchesForSeasonAggregate(request.prisma, {
      uid: request.uid,
      apiSeasonId: request.apiSeasonId,
      displaySeasonId: request.displaySeasonId,
    }),
  ])

  const aggregate = buildSeasonAggregate({
    uid: request.uid,
    apiSeasonId: request.apiSeasonId,
    displaySeasonId: request.displaySeasonId,
    stats,
    matches: matchRead.matches,
    matchInputSource: matchRead.inputSource,
    characterNames: request.characterNames,
    now: request.now,
    rankGameCount: matchRead.playerMatchCount,
  })

  await writeSeasonAggregateCache(request.prisma, request.uid, aggregate, {
    isCurrent: request.isCurrent,
    now: request.now,
  })

  return aggregate
}

export async function refreshSeasonAggregateFromCaches(
  request: SeasonAggregateCacheRequest,
): Promise<PlayerSeasonAggregateContract | BuiltSeasonAggregate> {
  const cached = await readValidSeasonAggregate(
    request.prisma,
    request.uid,
    request.apiSeasonId,
  )
  if (cached) {
    const rankGameCount = await countAggregateRankGames(
      request.prisma,
      request.uid,
      request.displaySeasonId,
      request.apiSeasonId,
    )
    if (!seasonAggregateNeedsRankCacheRebuild(cached, rankGameCount)) {
      return cached
    }
  }

  const key = aggregateKey(request.uid, request.apiSeasonId)
  const inflight = refreshInflight.get(key)
  if (inflight) return inflight

  const load = buildAndWriteSeasonAggregateFromCaches(request)
  refreshInflight.set(key, load)
  try {
    return await load
  } finally {
    if (refreshInflight.get(key) === load) {
      refreshInflight.delete(key)
    }
  }
}
