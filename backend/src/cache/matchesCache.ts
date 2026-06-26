import type { Prisma, PrismaClient } from '@prisma/client'

import type { MatchSummaryContract } from '../contracts/player.js'
import { isPrismaCacheModelReady } from './prismaCacheReady.js'

/** 최근 경기 목록 — 5분 후 재조회 */
export const MATCHES_CACHE_TTL_MS = 5 * 60_000

export interface CachedMatchesPayload {
  items: MatchSummaryContract[]
  next?: number
}

import type { MatchesQueryMode } from '../types/matchesMode.js'

export type MatchesCacheMode = MatchesQueryMode

export function matchesCacheId(uid: string, mode: MatchesQueryMode = 'all'): string {
  switch (mode) {
    case 'rank':
      return `${uid}:rank`
    case 'normal':
      return `${uid}:normal`
    case 'cobalt':
      return `${uid}:cobalt`
    case 'union':
      return `${uid}:union`
    case 'all':
    default:
      return `${uid}:0`
  }
}

function isMatchSummaryContract(value: unknown): value is MatchSummaryContract {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.matchId === 'string' &&
    typeof row.userNum === 'number' &&
    typeof row.characterName === 'string' &&
    typeof row.placement === 'number' &&
    typeof row.kills === 'number' &&
    typeof row.deaths === 'number' &&
    typeof row.assists === 'number' &&
    typeof row.gameStartedAt === 'string' &&
    typeof row.victory === 'boolean'
  )
}

function parseCachedMatches(data: unknown): MatchSummaryContract[] | null {
  if (!Array.isArray(data)) return null
  if (!data.every(isMatchSummaryContract)) return null
  return data
}

export function isMatchesCacheValid(expiresAt: Date, now = Date.now()): boolean {
  return expiresAt.getTime() > now
}

export async function readMatchesCache(
  prisma: PrismaClient,
  id: string,
): Promise<CachedMatchesPayload | null> {
  if (!isPrismaCacheModelReady(prisma, 'matchesCache')) return null
  const row = await prisma.matchesCache.findUnique({ where: { id } })
  if (!row) return null
  if (!isMatchesCacheValid(row.expiresAt)) return null
  const items = parseCachedMatches(row.data)
  if (items === null) return null
  return {
    items,
    next: row.next ?? undefined,
  }
}

export async function readMatchesCacheSnapshot(
  prisma: PrismaClient,
  id: string,
): Promise<CachedMatchesPayload | null> {
  if (!isPrismaCacheModelReady(prisma, 'matchesCache')) return null
  const row = await prisma.matchesCache.findUnique({ where: { id } })
  if (!row) return null
  const items = parseCachedMatches(row.data)
  if (items === null) return null
  return {
    items,
    next: row.next ?? undefined,
  }
}

export async function writeMatchesCache(
  prisma: PrismaClient,
  id: string,
  payload: CachedMatchesPayload,
): Promise<void> {
  if (!isPrismaCacheModelReady(prisma, 'matchesCache')) return
  const now = new Date()
  const expiresAt = new Date(now.getTime() + MATCHES_CACHE_TTL_MS)
  const data = payload.items as unknown as Prisma.InputJsonValue

  await prisma.matchesCache.upsert({
    where: { id },
    create: {
      id,
      data,
      next: payload.next ?? null,
      cachedAt: now,
      expiresAt,
    },
    update: {
      data,
      next: payload.next ?? null,
      cachedAt: now,
      expiresAt,
    },
  })
}
