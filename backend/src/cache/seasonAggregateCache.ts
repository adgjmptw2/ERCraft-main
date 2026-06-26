import type { Prisma, PrismaClient } from '@prisma/client'

import type {
  PlayerSeasonAggregateContract,
  SeasonAggregateCacheStatus,
  SeasonCharacterAggregateContract,
  RpSeriesPointContract,
} from '../contracts/player.js'
import { seasonAggregateShouldReplaceCache, seasonAggregateWriteSkipReason } from './seasonAggregateCompare.js'
import { isPrismaCacheModelReady } from './prismaCacheReady.js'

export const CURRENT_SEASON_AGGREGATE_TTL_MS = 60 * 60_000

export function seasonAggregateCacheId(uid: string, apiSeasonId: number): string {
  return `${uid}:${apiSeasonId}`
}

function isMissingTableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const row = error as { code?: unknown; message?: unknown }
  return (
    row.code === 'P2021' ||
    (typeof row.message === 'string' &&
      row.message.includes('season_aggregate_cache') &&
      row.message.includes('does not exist'))
  )
}

function isCacheStatus(value: unknown): value is SeasonAggregateCacheStatus {
  return value === 'ready' || value === 'warming' || value === 'stale' || value === 'partial'
}

function isSeasonCharacterAggregate(value: unknown): value is SeasonCharacterAggregateContract {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.characterNum === 'number' &&
    typeof row.games === 'number' &&
    typeof row.wins === 'number' &&
    typeof row.winRate === 'number' &&
    typeof row.kills === 'number' &&
    typeof row.assists === 'number' &&
    typeof row.deaths === 'number'
  )
}

function isRpSeriesPoint(value: unknown): value is RpSeriesPointContract {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.dateLabel === 'string' &&
    typeof row.rpAfter === 'number' &&
    Number.isFinite(row.rpAfter)
  )
}

function parseCharacterStats(data: unknown): SeasonCharacterAggregateContract[] | null {
  if (!Array.isArray(data)) return null
  if (!data.every(isSeasonCharacterAggregate)) return null
  return data
}

function parseRpSeries(data: unknown): RpSeriesPointContract[] | null {
  if (!Array.isArray(data)) return null
  if (!data.every(isRpSeriesPoint)) return null
  return data
}

export function isSeasonAggregateCacheValid(
  expiresAt: Date | null,
  cacheStatus: SeasonAggregateCacheStatus,
  now = Date.now(),
): boolean {
  if (cacheStatus === 'warming') return false
  if (expiresAt === null) return true
  return expiresAt.getTime() > now
}

function parseSeasonAggregateCacheRow(
  row: {
    userNum: bigint
    displaySeasonId: number
    apiSeasonId: number
    cacheStatus: unknown
    characterStats: unknown
    rpSeries: unknown
    lastRefreshedAt: Date
  },
): PlayerSeasonAggregateContract | null {
  if (!isCacheStatus(row.cacheStatus)) return null
  const characterStats = parseCharacterStats(row.characterStats)
  const rpSeries = parseRpSeries(row.rpSeries)
  if (characterStats === null || rpSeries === null) return null

  return {
    userNum: Number(row.userNum),
    seasonId: row.displaySeasonId,
    apiSeasonId: row.apiSeasonId,
    cacheStatus: row.cacheStatus,
    characterStats,
    rpSeries,
    lastRefreshedAt: row.lastRefreshedAt.toISOString(),
  }
}

export async function readSeasonAggregateCache(
  prisma: PrismaClient,
  id: string,
): Promise<PlayerSeasonAggregateContract | null> {
  if (!isPrismaCacheModelReady(prisma, 'seasonAggregateCache')) return null
  let row: Awaited<ReturnType<PrismaClient['seasonAggregateCache']['findUnique']>>
  try {
    row = await prisma.seasonAggregateCache.findUnique({ where: { id } })
  } catch (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  if (!row) return null
  const parsed = parseSeasonAggregateCacheRow(row)
  if (!parsed) return null
  if (!isSeasonAggregateCacheValid(row.expiresAt, parsed.cacheStatus)) return null
  return parsed
}

export async function deleteSeasonAggregateCache(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
): Promise<boolean> {
  if (!isPrismaCacheModelReady(prisma, 'seasonAggregateCache')) return false
  const id = seasonAggregateCacheId(uid, apiSeasonId)
  try {
    await prisma.seasonAggregateCache.delete({ where: { id } })
    return true
  } catch (error) {
    if (isMissingTableError(error)) return false
    return false
  }
}

async function readSeasonAggregateCacheUnchecked(
  prisma: PrismaClient,
  id: string,
): Promise<PlayerSeasonAggregateContract | null> {
  if (!isPrismaCacheModelReady(prisma, 'seasonAggregateCache')) return null
  try {
    const row = await prisma.seasonAggregateCache.findUnique({ where: { id } })
    if (!row) return null
    return parseSeasonAggregateCacheRow(row)
  } catch (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
}

export type SeasonAggregateCacheWriteResult = 'written' | 'skipped' | 'unavailable'

export async function writeSeasonAggregateCache(
  prisma: PrismaClient,
  uid: string,
  body: PlayerSeasonAggregateContract,
  options: { isCurrent: boolean; now?: Date } = { isCurrent: true },
): Promise<SeasonAggregateCacheWriteResult> {
  if (!isPrismaCacheModelReady(prisma, 'seasonAggregateCache')) return 'unavailable'
  const now = options.now ?? new Date()
  const expiresAt = options.isCurrent
    ? new Date(now.getTime() + CURRENT_SEASON_AGGREGATE_TTL_MS)
    : null

  try {
    const cacheId = seasonAggregateCacheId(uid, body.apiSeasonId)
    const existing = await readSeasonAggregateCacheUnchecked(prisma, cacheId)
    if (existing && !seasonAggregateShouldReplaceCache(body, existing)) {
      if (process.env.NODE_ENV !== 'production') {
        const skipReason = seasonAggregateWriteSkipReason(body, existing)
        console.info('[seasonAggregateCache] write skipped', {
          uid,
          apiSeasonId: body.apiSeasonId,
          skipReason,
          existingGames: existing.characterStats.reduce((sum, row) => sum + row.games, 0),
          incomingGames: body.characterStats.reduce((sum, row) => sum + row.games, 0),
        })
      }
      return 'skipped'
    }

    await prisma.seasonAggregateCache.upsert({
      where: { id: seasonAggregateCacheId(uid, body.apiSeasonId) },
      create: {
        id: seasonAggregateCacheId(uid, body.apiSeasonId),
        uid,
        userNum: BigInt(body.userNum),
        apiSeasonId: body.apiSeasonId,
        displaySeasonId: body.seasonId,
        cacheStatus: body.cacheStatus,
        characterStats: body.characterStats as unknown as Prisma.InputJsonValue,
        rpSeries: body.rpSeries as unknown as Prisma.InputJsonValue,
        cachedAt: now,
        lastRefreshedAt: new Date(body.lastRefreshedAt),
        expiresAt,
      },
      update: {
        userNum: BigInt(body.userNum),
        displaySeasonId: body.seasonId,
        cacheStatus: body.cacheStatus,
        characterStats: body.characterStats as unknown as Prisma.InputJsonValue,
        rpSeries: body.rpSeries as unknown as Prisma.InputJsonValue,
        cachedAt: now,
        lastRefreshedAt: new Date(body.lastRefreshedAt),
        expiresAt,
      },
    })
    return 'written'
  } catch (error) {
    if (isMissingTableError(error)) return 'unavailable'
    throw error
  }
}
