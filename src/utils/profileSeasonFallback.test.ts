import { describe, expect, it } from 'vitest'

import type { PlayerSummary } from '@/types/player'
import { buildFallbackSeasonSnapshot, shouldRefetchSeasonsDueToRankDrift } from '@/utils/profileSeasonFallback'

const summary: PlayerSummary = {
  userNum: 1,
  nickname: '절단마술사',
  level: 50,
  tier: 'DIAMOND2',
}

describe('buildFallbackSeasonSnapshot', () => {
  it('summary·stats 없이도 최소 스냅샷 생성', () => {
    const snap = buildFallbackSeasonSnapshot(summary, 20)
    expect(snap.seasonNumber).toBe(20)
    expect(snap.tier).toBeTruthy()
    expect(snap.games).toBeGreaterThanOrEqual(0)
  })

  it('stats가 있으면 승패·KDA 반영', () => {
    const snap = buildFallbackSeasonSnapshot(summary, 20, {
      userNum: 1,
      seasonId: 20,
      games: 10,
      wins: 6,
      losses: 4,
      kills: 30,
      deaths: 10,
      assists: 20,
      top3: 5,
      mmr: 2400,
    })
    expect(snap.wins).toBe(6)
    expect(snap.losses).toBe(4)
    expect(snap.rank.rp).toBe(2400)
  })

  it('summary RP가 stats mmr보다 우선', () => {
    const snap = buildFallbackSeasonSnapshot(
      { ...summary, rp: 7324, tier: 'METEORITE1' },
      11,
      {
        userNum: 1,
        seasonId: 11,
        games: 10,
        winRate: 30,
        avgKills: 2,
        avgPlacement: 4,
        kda: 3,
        kdaString: '3.00',
        mostPlayedCharacter: { name: '엠마', count: 10 },
        tier: '데미갓',
        mmr: 8024,
      },
    )

    expect(snap.rank.rp).toBe(7324)
  })

  it('summary가 언랭크여도 stats DTO tier가 있으면 fallback tier로 사용', () => {
    const snap = buildFallbackSeasonSnapshot(
      { ...summary, tier: 'Unranked' },
      11,
      {
        games: 10,
        winRate: 30,
        avgKills: 2,
        avgPlacement: 4,
        kda: 3.5,
        kdaString: '3.50',
        mostPlayedCharacter: { name: '엠마', count: 10 },
        tier: '미스릴',
        mmr: 8308,
      },
    )

    expect(snap.tier).toBe('미스릴')
    expect(snap.rank).toMatchObject({ tier: '미스릴', rp: 8308 })
  })
})

describe('shouldRefetchSeasonsDueToRankDrift', () => {
  it('flags rank API RP drift against summary stats RP', () => {
    expect(
      shouldRefetchSeasonsDueToRankDrift(
        { ...summary, rp: 8024 },
        {
          currentSeason: 11,
          seasons: [
            {
              seasonNumber: 11,
              rank: { tier: '메테오라이트', division: 1, rp: 7324, rank: 4201 },
              tier: '메테오라이트 1',
              played: true,
              wins: 1,
              losses: 0,
              avgPlacement: 1,
              kda: 3,
              top3Rate: 100,
            },
          ],
        },
        11,
      ),
    ).toBe(true)
  })

  it('flags legacy stats rank used as leaderboard position', () => {
    expect(
      shouldRefetchSeasonsDueToRankDrift(
        { ...summary, rp: 7324 },
        {
          currentSeason: 11,
          seasons: [
            {
              seasonNumber: 11,
              rank: { tier: '데미갓', rp: 8024, rank: 740 },
              tier: '데미갓',
              played: true,
              wins: 1,
              losses: 0,
              avgPlacement: 1,
              kda: 3,
              top3Rate: 100,
            },
          ],
        },
        11,
      ),
    ).toBe(true)
  })
})
