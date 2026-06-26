import type { PrismaClient } from '@prisma/client'

import { readSeasonStatsCache, seasonStatsCacheId } from '../cache/seasonStatsCache.js'
import type { PlayerSeasonsContract } from '../contracts/season.js'
import { mapToSeasonRecord } from '../external/bserMapper.js'
import type { SeasonCatalog } from '../external/seasonCatalog.js'
import { hydrateSeasonsGridContract } from './seasonsHistoricalMerge.js'

/** per-season stats cache만으로 그리드 조립 — upstream 호출 없음 */
export async function buildSeasonsGridFromStatsCache(
  prisma: PrismaClient,
  uid: string,
  from: number,
  to: number,
  currentSeason: number,
  catalog: SeasonCatalog,
): Promise<PlayerSeasonsContract | null> {
  const displaySeasons = Array.from({ length: to - from + 1 }, (_, index) => from + index)
  const seasons = await Promise.all(
    displaySeasons.map(async (displaySeason) => {
      const apiSeasonId = catalog.apiIdForDisplay(displaySeason)
      if (apiSeasonId === null) {
        return mapToSeasonRecord(displaySeason, null, [])
      }
      const stats = await readSeasonStatsCache(prisma, seasonStatsCacheId(uid, apiSeasonId))
      if (!stats || stats.length === 0) {
        return mapToSeasonRecord(displaySeason, null, [])
      }
      return mapToSeasonRecord(displaySeason, null, stats)
    }),
  )
  const playedCount = seasons.filter((season) => season.played).length
  if (playedCount === 0) return null
  return hydrateSeasonsGridContract(prisma, uid, { currentSeason, seasons })
}

export function withSeasonsPartialStatus(
  body: PlayerSeasonsContract,
  partial: boolean,
): PlayerSeasonsContract {
  if (!partial) return body
  return { ...body, status: 'partial' }
}
