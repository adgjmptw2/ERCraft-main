import { describe, expect, it } from 'vitest'

import { refreshSeasonRecordTier } from './seasonRecordTier.js'

describe('refreshSeasonRecordTier master tier preservation', () => {
  it('preserves stored eternity label when leaderboard rank is missing', () => {
    const refreshed = refreshSeasonRecordTier({
      seasonNumber: 10,
      rank: { tier: '\uC774\uD130\uB2C8\uD2F0', rp: 8400 },
      tier: '\uC774\uD130\uB2C8\uD2F0',
      played: true,
      games: 15,
      wins: 10,
      losses: 5,
      winRate: 66.7,
      avgPlacement: 3,
      kda: 2.5,
      top3Rate: 40,
    })
    expect(refreshed.rank.tier).toBe('\uC774\uD130\uB2C8\uD2F0')
    expect(refreshed.tier).toBe('\uC774\uD130\uB2C8\uD2F0')
  })

  it('preserves stored demigod label when leaderboard rank is missing', () => {
    const refreshed = refreshSeasonRecordTier({
      seasonNumber: 9,
      rank: { tier: '\uB370\uBBF8\uAC13', rp: 8350 },
      tier: '\uB370\uBBF8\uAC13',
      played: true,
      games: 15,
      wins: 8,
      losses: 7,
      winRate: 53.3,
      avgPlacement: 4,
      kda: 2.1,
      top3Rate: 30,
    })
    expect(refreshed.rank.tier).toBe('\uB370\uBBF8\uAC13')
  })
})