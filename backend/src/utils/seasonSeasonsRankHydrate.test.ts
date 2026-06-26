import { describe, expect, it, vi } from 'vitest'

import type { PlayerSeasonsContract } from '../contracts/season.js'
import type { BserUserRank, BserUserStat } from '../external/bserClient.js'
import {
  isLikelyLegacyStatsSourcedLeaderboardRow,
  rehydrateCurrentSeasonRankInSeasonsGrid,
} from './seasonSeasonsRankHydrate.js'

const staleBody: PlayerSeasonsContract = {
  currentSeason: 11,
  seasons: [
    {
      seasonNumber: 11,
      rank: { tier: '데미갓', rp: 8024, rank: 740 },
      tier: '데미갓',
      played: true,
      games: 100,
      wins: 10,
      losses: 90,
      winRate: 10,
      kda: 2,
      top3Rate: 20,
      avgPlacement: 5,
    },
  ],
}

const squadStats: BserUserStat[] = [
  {
    seasonId: 39,
    matchingMode: 3,
    matchingTeamMode: 3,
    mmr: 8024,
    nickname: '찬형',
    rank: 740,
    rankSize: 1000,
    totalGames: 55,
    totalWins: 16,
    totalTeamKills: 0,
    totalDeaths: 39,
    averageRank: 3.6,
    averageKills: 4,
    averageAssistants: 3,
    top1: 0.1,
    top3: 0.5,
  },
]

describe('isLikelyLegacyStatsSourcedLeaderboardRow', () => {
  it('flags stats rank used as leaderboard position', () => {
    expect(isLikelyLegacyStatsSourcedLeaderboardRow(staleBody.seasons[0]!)).toBe(true)
  })

  it('does not flag legitimate demigod rows', () => {
    expect(
      isLikelyLegacyStatsSourcedLeaderboardRow({
        ...staleBody.seasons[0]!,
        rank: { tier: '데미갓', rp: 8350, rank: 740 },
      }),
    ).toBe(false)
  })
})

describe('rehydrateCurrentSeasonRankInSeasonsGrid', () => {
  it('uses stats RP and rank API leaderboard position', async () => {
    const fetchRank = vi.fn(async (): Promise<BserUserRank> => ({
      mmr: 7324,
      nickname: '찬형',
      rank: 4201,
      serverRank: 5095,
    }))
    const fetchStats = vi.fn(async () => squadStats)

    const hydrated = await rehydrateCurrentSeasonRankInSeasonsGrid(staleBody, {
      currentDisplaySeason: 11,
      from: 11,
      to: 11,
      apiSeasonId: 11,
      fetchRank,
      fetchStats,
    })

    expect(fetchRank).toHaveBeenCalledOnce()
    expect(fetchStats).toHaveBeenCalledOnce()
    expect(hydrated.seasons[0]?.rank).toMatchObject({
      rp: 8024,
      rank: 4201,
      tier: '미스릴',
    })
  })

  it('skips rank API when chunk excludes current season', async () => {
    const fetchRank = vi.fn()
    const fetchStats = vi.fn()

    await rehydrateCurrentSeasonRankInSeasonsGrid(staleBody, {
      currentDisplaySeason: 11,
      from: 10,
      to: 10,
      apiSeasonId: 11,
      fetchRank,
      fetchStats,
    })

    expect(fetchRank).not.toHaveBeenCalled()
    expect(fetchStats).not.toHaveBeenCalled()
  })
})