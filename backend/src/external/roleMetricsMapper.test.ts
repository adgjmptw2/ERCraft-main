import { describe, expect, it } from 'vitest'

import { mapToMatchSummary } from '../external/bserMapper.js'
import {
  parseRoleMetricsV1,
  ROLE_METRICS_VERSION,
  roleMetricsToDbFields,
} from '../external/roleMetricsMapper.js'

describe('roleMetricsMapper', () => {
  it('damageOffsetedByShield_Player → shieldDamageOffsetFromPlayer', () => {
    const parsed = parseRoleMetricsV1({
      gameId: 1,
      seasonId: 1,
      matchingMode: 3,
      matchingTeamMode: 1,
      characterNum: 30,
      characterLevel: 1,
      gameRank: 1,
      playerKill: 0,
      playerAssistant: 0,
      monsterKill: 10,
      victory: 0,
      startDtm: '2026-01-01T00:00:00Z',
      damageFromPlayer: 5000,
      protectAbsorb: 1200,
      damageOffsetedByShield_Player: 3400,
      teamRecover: 800,
      ccTimeToPlayer: 42.5,
      viewContribution: 18,
    })

    expect(parsed?.shieldDamageOffsetFromPlayer).toBe(3400)
    expect(parsed?.version).toBe(ROLE_METRICS_VERSION)
  })

  it('0은 유효, 음수·NaN·Infinity는 null', () => {
    const parsed = parseRoleMetricsV1({
      gameId: 1,
      seasonId: 1,
      matchingMode: 3,
      matchingTeamMode: 1,
      characterNum: 30,
      characterLevel: 1,
      gameRank: 1,
      playerKill: 0,
      playerAssistant: 0,
      monsterKill: 0,
      victory: 0,
      startDtm: '2026-01-01T00:00:00Z',
      protectAbsorb: -1,
      teamRecover: 0,
      ccTimeToPlayer: Number.NaN,
      viewContribution: Number.POSITIVE_INFINITY,
    })

    expect(parsed?.protectAbsorb).toBeNull()
    expect(parsed?.teamRecover).toBe(0)
    expect(parsed?.ccTimeToPlayer).toBeNull()
    expect(parsed?.viewContribution).toBeNull()
    expect(parsed?.monsterKill).toBe(0)
  })

  it('mapToMatchSummary에 roleMetrics 포함, rawJson 미포함', () => {
    const summary = mapToMatchSummary(
      'uid-test',
      {
        gameId: 99,
        seasonId: 1,
        matchingMode: 3,
        matchingTeamMode: 1,
        characterNum: 73,
        characterLevel: 1,
        gameRank: 1,
        playerKill: 0,
        playerAssistant: 0,
        monsterKill: 3,
        victory: 1,
        startDtm: '2026-01-01T00:00:00Z',
        damageFromPlayer: 1000,
        teamRecover: 500,
        ccTimeToPlayer: 10,
        viewContribution: 5,
      },
      new Map([[73, '샬럿']]),
    )

    expect(summary.roleMetrics?.damageFromPlayer).toBe(1000)
    expect(summary.roleMetrics?.teamRecover).toBe(500)
    expect('rawJson' in summary).toBe(false)
  })

  it('roleMetricsToDbFields는 version과 capturedAt 포함', () => {
    const parsed = parseRoleMetricsV1({
      gameId: 1,
      seasonId: 1,
      matchingMode: 3,
      matchingTeamMode: 1,
      characterNum: 1,
      characterLevel: 1,
      gameRank: 1,
      playerKill: 0,
      playerAssistant: 0,
      monsterKill: 1,
      victory: 0,
      startDtm: '2026-01-01T00:00:00Z',
      damageFromPlayer: 100,
    })
    expect(parsed).not.toBeNull()
    const dbFields = roleMetricsToDbFields(parsed!, new Date('2026-06-19T00:00:00Z'))
    expect(dbFields.roleMetricsVersion).toBe(1)
    expect(dbFields.roleMetricsCapturedAt.toISOString()).toBe('2026-06-19T00:00:00.000Z')
  })
})
