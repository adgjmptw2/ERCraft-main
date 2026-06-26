import { describe, expect, it } from 'vitest'

import { toPlayerMatchInput } from '../cache/playerMatchStore.js'

describe('playerMatchStore role metrics', () => {
  it('roleMetricsVersion=1과 선택 필드만 저장 payload에 포함', () => {
    const input = toPlayerMatchInput(
      'uid-1',
      {
        matchId: '123',
        userNum: 1,
        characterName: '샬럿',
        placement: 1,
        kills: 0,
        deaths: 0,
        assists: 0,
        gameStartedAt: '2026-01-01T00:00:00Z',
        victory: true,
        characterNum: 73,
        bestWeapon: 24,
        roleMetrics: {
          damageFromPlayer: 1000,
          protectAbsorb: 200,
          shieldDamageOffsetFromPlayer: 300,
          teamRecover: 400,
          ccTimeToPlayer: 12.5,
          viewContribution: 8,
          monsterKill: 5,
          version: 1,
        },
      },
      { apiSeasonId: 39, displaySeasonId: 11 },
    )

    expect(input.damageFromPlayer).toBe(1000)
    expect(input.teamRecover).toBe(400)
    expect(input.roleMetricsVersion).toBe(1)
    expect(input.roleMetricsCapturedAt).toBeInstanceOf(Date)
    expect(input.rawJson).toBeUndefined()
  })
})
