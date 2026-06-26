import type { PlayerSeasonsContract } from '../contracts/season.js'
import type { BserUserRank, BserUserStat } from '../external/bserClient.js'
import {
  hasPlacement,
  mmrToSeasonRank,
  resolveDisplayedRp,
  resolveLeaderboardRank,
} from '../external/bserMapper.js'
import { refreshSeasonsContractTiers } from './seasonRecordTier.js'

function formatSeasonTierLabel(
  rank: PlayerSeasonsContract['seasons'][number]['rank'],
): string {
  if (rank.division) return `${rank.tier} ${rank.division}`
  return rank.tier
}

/** stats API squad.rank를 리더보드 #로 잘못 붙인 구 캐시 행 */
export function isLikelyLegacyStatsSourcedLeaderboardRow(
  season: PlayerSeasonsContract['seasons'][number],
): boolean {
  const position = season.rank.rank
  const rp = season.rank.rp
  if (position == null || position <= 0 || rp <= 0) return false
  return position <= 1000 && rp < 8300
}

export async function rehydrateCurrentSeasonRankInSeasonsGrid(
  body: PlayerSeasonsContract,
  params: {
    currentDisplaySeason: number
    from: number
    to: number
    apiSeasonId: number | null
    fetchRank: () => Promise<BserUserRank | null>
    fetchStats: () => Promise<BserUserStat[]>
  },
): Promise<PlayerSeasonsContract> {
  const { currentDisplaySeason, from, to, apiSeasonId, fetchRank, fetchStats } = params
  if (
    apiSeasonId === null ||
    from > currentDisplaySeason ||
    to < currentDisplaySeason
  ) {
    return refreshSeasonsContractTiers(body)
  }

  const seasonIdx = body.seasons.findIndex(
    (season) => season.seasonNumber === currentDisplaySeason,
  )
  if (seasonIdx < 0) return refreshSeasonsContractTiers(body)

  const [rankApi, stats] = await Promise.all([fetchRank(), fetchStats()])
  if (!rankApi || !hasPlacement(rankApi)) {
    return refreshSeasonsContractTiers(body)
  }

  const rp = resolveDisplayedRp(rankApi, stats)
  if (rp == null) {
    return refreshSeasonsContractTiers(body)
  }

  const position = resolveLeaderboardRank(rankApi)
  const seasonRank = mmrToSeasonRank(rp, position, currentDisplaySeason)

  const seasons = body.seasons.map((season) => {
    if (season.seasonNumber !== currentDisplaySeason) return season
    return {
      ...season,
      rank: seasonRank,
      tier: formatSeasonTierLabel(seasonRank),
    }
  })

  return refreshSeasonsContractTiers({ ...body, seasons })
}