import type { PrismaClient } from '@prisma/client'

import { listPlayerSeasonsCacheBodiesForUid } from '../cache/playerSeasonsCache.js'
import type { PlayerSeasonsContract, SeasonRecordContract } from '../contracts/season.js'
import { refreshSeasonsContractTiers } from './seasonRecordTier.js'

function isMasterTierLabel(label: string | null | undefined): boolean {
  const value = label?.trim() ?? ''
  if (!value) return false
  return value === '\uC774\uD130\uB2C8\uD2F0' || value.startsWith('\uC774\uD130\uB2C8\uD2F0') || value === '\uB370\uBBF8\uAC13' || value.startsWith('\uB370\uBBF8\uAC13')
}

function historicalRowScore(row: SeasonRecordContract): number {
  let score = 0
  if (row.rank.rank != null && row.rank.rank > 0) score += 10
  if (isMasterTierLabel(row.rank.tier) || isMasterTierLabel(row.tier)) score += 5
  if (row.games > 0) score += 1
  return score
}

function pickBestHistoricalRows(
  historical: SeasonRecordContract[],
): Map<number, SeasonRecordContract> {
  const bySeason = new Map<number, SeasonRecordContract>()
  for (const row of historical) {
    if (!row.played) continue
    const existing = bySeason.get(row.seasonNumber)
    if (!existing || historicalRowScore(row) > historicalRowScore(existing)) {
      bySeason.set(row.seasonNumber, row)
    }
  }
  return bySeason
}

export function mergeSeasonsWithHistoricalRecords(
  seasons: SeasonRecordContract[],
  historical: SeasonRecordContract[],
): SeasonRecordContract[] {
  const hints = pickBestHistoricalRows(historical)
  if (hints.size === 0) return seasons

  return seasons.map((season) => {
    if (!season.played) return season
    const hint = hints.get(season.seasonNumber)
    if (!hint) return season

    const missingRank = season.rank.rank == null || season.rank.rank <= 0
    const missingMaster =
      !isMasterTierLabel(season.rank.tier) &&
      !isMasterTierLabel(season.tier) &&
      (isMasterTierLabel(hint.rank.tier) || isMasterTierLabel(hint.tier))

    if (!missingRank && !missingMaster) return season

    const mergedRank = {
      ...season.rank,
      tier: hint.rank.tier,
      division: hint.rank.division ?? season.rank.division,
      rp: season.rank.rp > 0 ? season.rank.rp : hint.rank.rp,
      rank:
        hint.rank.rank != null && hint.rank.rank > 0
          ? hint.rank.rank
          : season.rank.rank,
    }

    return {
      ...season,
      rank: mergedRank,
      tier: hint.tier || season.tier,
    }
  })
}

export async function hydrateSeasonsGridContract(
  prisma: PrismaClient,
  uid: string,
  body: PlayerSeasonsContract,
): Promise<PlayerSeasonsContract> {
  const caches = await listPlayerSeasonsCacheBodiesForUid(prisma, uid)
  const historical = caches.flatMap((entry) => entry.seasons)
  const merged = mergeSeasonsWithHistoricalRecords(body.seasons, historical)
  return refreshSeasonsContractTiers({ ...body, seasons: merged })
}
