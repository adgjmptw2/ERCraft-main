import type { Prisma, PrismaClient } from '@prisma/client'

import type { BserUserStat } from '../external/bserClient.js'
import { isPrismaCacheModelReady } from './prismaCacheReady.js'

/** 현재 시즌 stats — 1시간 후 재조회 */
export const CURRENT_SEASON_STATS_TTL_MS = 60 * 60_000

export function seasonStatsCacheId(uid: string, apiSeasonId: number): string {
  return `${uid}:${apiSeasonId}`
}

function isBserUserStat(value: unknown): value is BserUserStat {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.seasonId === 'number' &&
    typeof row.matchingMode === 'number' &&
    typeof row.matchingTeamMode === 'number' &&
    typeof row.mmr === 'number'
  )
}

function parseCachedStats(data: unknown): BserUserStat[] | null {
  if (!Array.isArray(data)) return null
  if (!data.every(isBserUserStat)) return null
  return data
}

export function isSeasonStatsCacheValid(
  expiresAt: Date | null,
  now = Date.now(),
): boolean {
  if (expiresAt === null) return true
  return expiresAt.getTime() > now
}

export async function readSeasonStatsCache(
  prisma: PrismaClient,
  id: string,
): Promise<BserUserStat[] | null> {
  if (!isPrismaCacheModelReady(prisma, 'seasonStatsCache')) return null
  const row = await prisma.seasonStatsCache.findUnique({ where: { id } })
  if (!row) return null
  if (!isSeasonStatsCacheValid(row.expiresAt)) return null
  const parsed = parseCachedStats(row.data)
  // negative cache — 빈 배열도 유효한 캐시 hit
  if (parsed === null) return null
  return parsed
}

export async function readSeasonStatsCacheSnapshot(
  prisma: PrismaClient,
  id: string,
): Promise<BserUserStat[] | null> {
  if (!isPrismaCacheModelReady(prisma, 'seasonStatsCache')) return null
  const row = await prisma.seasonStatsCache.findUnique({ where: { id } })
  if (!row) return null
  return parseCachedStats(row.data)
}

export async function deleteSeasonStatsCache(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
): Promise<boolean> {
  if (!isPrismaCacheModelReady(prisma, 'seasonStatsCache')) return false
  const id = seasonStatsCacheId(uid, apiSeasonId)
  try {
    await prisma.seasonStatsCache.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function writeSeasonStatsCache(
  prisma: PrismaClient,
  id: string,
  stats: BserUserStat[],
  isCurrent: boolean,
): Promise<void> {
  if (!isPrismaCacheModelReady(prisma, 'seasonStatsCache')) return
  const now = new Date()
  const expiresAt = isCurrent ? new Date(now.getTime() + CURRENT_SEASON_STATS_TTL_MS) : null

  const payload = stats as unknown as Prisma.InputJsonValue

  await prisma.seasonStatsCache.upsert({
    where: { id },
    create: {
      id,
      data: payload,
      isCurrent,
      cachedAt: now,
      expiresAt,
    },
    update: {
      data: payload,
      isCurrent,
      cachedAt: now,
      expiresAt,
    },
  })
}
