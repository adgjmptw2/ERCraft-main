import { describe, expect, it } from 'vitest'

import {
  buildCombatParticipationBaselineDocument,
  computeParticipationBaselineStat,
} from './combatParticipationBaselineBuilder.js'

describe('combatParticipationBaselineBuilder', () => {
  it('computes overOneCount', () => {
    const stat = computeParticipationBaselineStat([0.5, 1.2, 0.8, null])
    expect(stat.validCount).toBe(3)
    expect(stat.overOneCount).toBe(1)
    expect(stat.nullCount).toBe(1)
  })

  it('builds exact combination baselines', () => {
    const document = buildCombatParticipationBaselineDocument([
      {
        gameId: 'g1',
        uid: 'u1',
        rankTierKey: 'meteorite_plus',
        characterNum: 1,
        weaponTypeId: 1,
        role: '평타 딜러',
        playedAt: '2026-06-01T00:00:00.000Z',
        playerKill: 3,
        playerAssistant: 2,
        teamKill: 10,
        damageToPlayer: 5000,
        victory: true,
        placement: 2,
      },
    ])
    expect(document.exactCombinationCount).toBe(1)
    expect(document.source).toBe('official-bser-match-rows-aggregated-by-ercraft')
  })
})
