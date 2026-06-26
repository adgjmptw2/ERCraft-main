import { describe, expect, it } from 'vitest'

import { dedupeCharacterSnapshotsForRole } from './cohort.js'

describe('playerRoleSnapshot cohort dedupe', () => {
  it('keeps one sample per uid per role tier', () => {
    const deduped = dedupeCharacterSnapshotsForRole([
      {
        canonicalUid: 'u1',
        characterNum: 1,
        tierBand: 'diamond_plus',
        primaryRole: '스증 딜러',
        shadowScore: 70,
        eligibleMatches: 10,
        damagePerMinute: null,
        visionPerMinute: null,
        teamKillParticipation: null,
        averagePlacement: null,
        winRate: null,
        consistencyScore: null,
        averageKills: null,
        averageDeaths: null,
        averageSurvivalTime: null,
      },
      {
        canonicalUid: 'u1',
        characterNum: 2,
        tierBand: 'diamond_plus',
        primaryRole: '스증 딜러',
        shadowScore: 80,
        eligibleMatches: 22,
        damagePerMinute: null,
        visionPerMinute: null,
        teamKillParticipation: null,
        averagePlacement: null,
        winRate: null,
        consistencyScore: null,
        averageKills: null,
        averageDeaths: null,
        averageSurvivalTime: null,
      },
    ])
    expect(deduped).toHaveLength(1)
    expect(deduped[0]?.eligibleMatches).toBe(22)
    expect(deduped[0]?.shadowScore).toBe(80)
  })
})
