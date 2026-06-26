import type { Prisma, PrismaClient } from '@prisma/client'

import type { PlayerSeasonsContract } from '../contracts/season.js'
import { isLikelyLegacyStatsSourcedLeaderboardRow } from '../utils/seasonSeasonsRankHydrate.js'
import { isPrismaCacheModelReady } from './prismaCacheReady.js'
import {
  CURRENT_SEASON_STATS_TTL_MS,
  isSeasonStatsCacheValid,
  readSeasonStatsCache,
  seasonStatsCacheId,
} from './seasonStatsCache.js'

export function playerSeasonsCacheId(uid: string, from: number, to: number): string {
  return `${uid}:${from}:${to}`
}

function isSeasonRankContract(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.tier === 'string' && typeof row.rp === 'number'
}

function isSeasonRecordContract(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.seasonNumber === 'number' &&
    isSeasonRankContract(row.rank) &&
    typeof row.tier === 'string' &&
    typeof row.played === 'boolean'
  )
}

function parsePlayerSeasonsContract(data: unknown): PlayerSeasonsContract | null {
  if (typeof data !== 'object' || data === null) return null
  const row = data as Record<string, unknown>
  if (typeof row.currentSeason !== 'number' || !Array.isArray(row.seasons)) return null
  if (!row.seasons.every(isSeasonRecordContract)) return null
  return {
    currentSeason: row.currentSeason,
    seasons: row.seasons as PlayerSeasonsContract['seasons'],
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}

export async function readPlayerSeasonsCache(
  prisma: PrismaClient,
  id: string,
): Promise<PlayerSeasonsContract | null> {
  if (!isPrismaCacheModelReady(prisma, 'playerSeasonsCache')) return null
  const row = await prisma.playerSeasonsCache.findUnique({ where: { id } })
  if (!row) return null
  if (!isSeasonStatsCacheValid(row.expiresAt)) return null
  return parsePlayerSeasonsContract(row.data)
}

/** TTL 만료여도 rank API 기반 마스터 티어 복원용으로 읽기 */
export async function readPlayerSeasonsCacheIncludingStale(
  prisma: PrismaClient,
  id: string,
): Promise<PlayerSeasonsContract | null> {
  if (!isPrismaCacheModelReady(prisma, 'playerSeasonsCache')) return null
  const row = await prisma.playerSeasonsCache.findUnique({ where: { id } })
  if (!row) return null
  return parsePlayerSeasonsContract(row.data)
}

export async function listPlayerSeasonsCacheBodiesForUid(
  prisma: PrismaClient,
  uid: string,
): Promise<PlayerSeasonsContract[]> {
  if (!isPrismaCacheModelReady(prisma, 'playerSeasonsCache')) return []
  const rows = await prisma.playerSeasonsCache.findMany({
    where: { id: { startsWith: `${uid}:` } },
    select: { data: true },
    orderBy: { cachedAt: 'desc' },
  })
  const bodies: PlayerSeasonsContract[] = []
  for (const row of rows) {
    const parsed = parsePlayerSeasonsContract(row.data)
    if (parsed) bodies.push(parsed)
  }
  return bodies
}

export function playerSeasonsCacheExpiresAt(
  from: number,
  to: number,
  currentDisplaySeason: number | null,
  now = Date.now(),
): Date | null {
  if (
    currentDisplaySeason !== null &&
    from <= currentDisplaySeason &&
    to >= currentDisplaySeason
  ) {
    return new Date(now + CURRENT_SEASON_STATS_TTL_MS)
  }
  return null
}

export async function writePlayerSeasonsCache(
  prisma: PrismaClient,
  id: string,
  body: PlayerSeasonsContract,
  from: number,
  to: number,
  currentDisplaySeason: number | null,
): Promise<void> {
  if (!isPrismaCacheModelReady(prisma, 'playerSeasonsCache')) return
  const now = new Date()
  const expiresAt = playerSeasonsCacheExpiresAt(from, to, currentDisplaySeason, now.getTime())
  const payload = body as unknown as Prisma.InputJsonValue

  const update = {
    data: payload,
    cachedAt: now,
    expiresAt,
  }

  try {
    await prisma.playerSeasonsCache.upsert({
      where: { id },
      create: {
        id,
        ...update,
      },
      update,
    })
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error)) throw error
    await prisma.playerSeasonsCache.update({
      where: { id },
      data: update,
    })
  }
}

/** 청크 캐시 — 앞 시즌은 played인데 바로 다음 시즌만 비어 있으면 stale 의심 */
export function isLikelyStalePlayerSeasonsChunk(
  cached: PlayerSeasonsContract,
  from: number,
  to: number,
): boolean {
  const inRange = cached.seasons
    .filter((season) => season.seasonNumber >= from && season.seasonNumber <= to)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)

  for (let index = 0; index < inRange.length - 1; index += 1) {
    const current = inRange[index]
    const next = inRange[index + 1]
    if (
      current?.played &&
      current.games > 0 &&
      next &&
      !next.played &&
      next.games === 0
    ) {
      return true
    }
  }
  return false
}

/** seasonStatsCache에 경기가 있는데 청크는 미플레이면 stale */
export async function isPlayerSeasonsChunkStaleAgainstStatsCache(
  prisma: PrismaClient,
  uid: string,
  cached: PlayerSeasonsContract,
  apiIdForDisplay: (displaySeason: number) => number | null,
): Promise<boolean> {
  if (!isPrismaCacheModelReady(prisma, 'seasonStatsCache')) return false

  for (const season of cached.seasons) {
    if (season.played) continue
    const apiSeasonId = apiIdForDisplay(season.seasonNumber)
    if (apiSeasonId === null) continue
    const stats = await readSeasonStatsCache(prisma, seasonStatsCacheId(uid, apiSeasonId))
    if (!stats || stats.length === 0) continue
    const squad = stats.find((row) => row.matchingTeamMode === 3) ?? stats[0]
    if ((squad?.totalGames ?? 0) > 0) return true
  }
  return false
}

function hasLegacyStatsSourcedLeaderboardRow(
  cached: PlayerSeasonsContract,
  from: number,
  to: number,
): boolean {
  return cached.seasons.some(
    (season) =>
      season.seasonNumber >= from &&
      season.seasonNumber <= to &&
      isLikelyLegacyStatsSourcedLeaderboardRow(season),
  )
}

export async function shouldRefetchPlayerSeasonsChunk(
  prisma: PrismaClient,
  uid: string,
  cached: PlayerSeasonsContract,
  from: number,
  to: number,
  apiIdForDisplay: (displaySeason: number) => number | null,
): Promise<boolean> {
  if (isLikelyStalePlayerSeasonsChunk(cached, from, to)) return true
  if (hasLegacyStatsSourcedLeaderboardRow(cached, from, to)) return true
  return isPlayerSeasonsChunkStaleAgainstStatsCache(prisma, uid, cached, apiIdForDisplay)
}
