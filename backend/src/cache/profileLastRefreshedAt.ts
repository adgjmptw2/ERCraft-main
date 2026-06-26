import type { PrismaClient } from '@prisma/client'

import { readManualProfileRefresh } from './profileRefreshState.js'
import { isPrismaPlayerMatchReady } from './playerMatchStore.js'
import { readPlayerSeasonBackfillState } from './playerSeasonBackfillState.js'

function maxDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null
  return new Date(Math.max(...dates.map((d) => d.getTime())))
}

/** summary lastRefreshedAt — 기존 DB updatedAt 조합 */
export async function resolveProfileLastRefreshedAt(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
): Promise<Date | null> {
  const candidates: Date[] = []

  const manualRefreshedAt = await readManualProfileRefresh(prisma, uid)
  if (manualRefreshedAt) candidates.push(manualRefreshedAt)

  if (isPrismaPlayerMatchReady(prisma)) {
    const latest = await prisma.playerMatch.findMany({
      where: { uid },
      orderBy: { updatedAt: 'desc' },
      take: 1,
      select: { updatedAt: true },
    })
    if (latest[0]?.updatedAt) candidates.push(latest[0].updatedAt)
  }

  const backfill = await readPlayerSeasonBackfillState(prisma, uid, apiSeasonId)
  if (backfill?.lastRunAt) candidates.push(backfill.lastRunAt)
  if (backfill?.finishedAt) candidates.push(backfill.finishedAt)

  return maxDate(candidates)
}

/** 캐시 우선 — 완료된 프로필은 명시적 갱신 전 backfill 자동 시작 금지. partial/최초는 허용 */
export function shouldAllowAutoProfileBackfill(params: {
  profileCached: boolean
  explicitRefresh: boolean
  backfillComplete: boolean
}): boolean {
  if (params.explicitRefresh) return true
  if (!params.profileCached) return true
  return !params.backfillComplete
}

/** 최초 수집 판정 — PlayerMatch 존재 여부 */
export async function hasProfileCacheData(
  prisma: PrismaClient,
  uid: string,
): Promise<boolean> {
  return hasProfileCacheDataForUids(prisma, [uid])
}

/** verified source 집합 기준 PlayerMatch 존재 여부 */
export async function hasProfileCacheDataForUids(
  prisma: PrismaClient,
  uids: string[],
): Promise<boolean> {
  if (!isPrismaPlayerMatchReady(prisma)) return false
  const unique = [...new Set(uids.filter((uid) => uid.length > 0))]
  if (unique.length === 0) return false
  const row = await prisma.playerMatch.findFirst({
    where: { uid: { in: unique } },
    select: { id: true },
  })
  return row != null
}

/** DB에 저장된 시즌 그리드 캐시 존재 여부 */
export async function hasStoredSeasonHistory(
  prisma: PrismaClient,
  canonicalUid: string,
  candidateUids: string[],
  from: number,
  to: number,
): Promise<boolean> {
  const { readPlayerSeasonsCache, playerSeasonsCacheId } = await import('./playerSeasonsCache.js')
  const uids = [...new Set([canonicalUid, ...candidateUids].filter((uid) => uid.length > 0))]
  for (const uid of uids) {
    const cached = await readPlayerSeasonsCache(prisma, playerSeasonsCacheId(uid, from, to))
    if (cached && cached.seasons.some((season) => season.played)) return true
  }
  return false
}
