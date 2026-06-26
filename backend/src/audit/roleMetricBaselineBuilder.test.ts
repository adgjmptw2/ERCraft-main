import { describe, expect, it } from 'vitest'

import {
  buildRoleMetricBaselineDocument,
  computeBaselineMetricStat,
  isShadowReady,
  p95WinsorizedMean,
} from './roleMetricBaselineBuilder.js'

describe('roleMetricBaselineBuilder', () => {
  it('continuous readiness thresholds', () => {
    expect(computeBaselineMetricStat(Array.from({ length: 20 }, () => 1), 'damageFromPlayer').readiness).toBe('unusable')
    expect(computeBaselineMetricStat(Array.from({ length: 50 }, () => 1), 'damageFromPlayer').readiness).toBe('experimental')
    expect(computeBaselineMetricStat(Array.from({ length: 150 }, () => 1), 'damageFromPlayer').readiness).toBe('provisional')
    expect(computeBaselineMetricStat(Array.from({ length: 350 }, () => 1), 'damageFromPlayer').readiness).toBe('ready')
  })

  it('zero-heavy readiness uses positive count', () => {
    const values = [...Array.from({ length: 40 }, () => 0), ...Array.from({ length: 12 }, () => 100)]
    expect(computeBaselineMetricStat(values, 'teamRecover').readiness).toBe('experimental')
    expect(isShadowReady('experimental')).toBe(false)
    expect(isShadowReady('provisional')).toBe(true)
  })

  it('p95 winsorization', () => {
    const values = [1, 2, 3, 4, 100]
    expect(p95WinsorizedMean(values)).toBeLessThan(25)
  })

  it('builds exact combination baselines only', () => {
    const document = buildRoleMetricBaselineDocument([
      {
        gameId: 'g1',
        uid: 'u1',
        rankTierKey: 'meteorite_plus',
        characterNum: 73,
        weaponTypeId: 24,
        role: '서포터',
        playedAt: '2026-06-01T00:00:00.000Z',
        deaths: 1,
        damageFromPlayer: 1000,
        protectAbsorb: 100,
        shieldDamageOffsetFromPlayer: 100,
        teamRecover: 500,
        ccTimeToPlayer: 40,
        viewContribution: 20,
        monsterKill: 30,
        victory: true,
        placement: 2,
      },
    ])
    expect(document.combinations['meteorite_plus|73:24']).toBeDefined()
    expect(document.filters.roleMetricsVersion).toBe(1)
  })

  it('teamRecover live eligibility is healer-only', () => {
    const playedAt = (index: number) =>
      new Date(Date.UTC(2026, 5, 1 + (index % 28), index % 24)).toISOString()
    const template = {
      rankTierKey: 'meteorite_plus' as const,
      role: '서포터' as const,
      deaths: 1,
      damageFromPlayer: 10000,
      protectAbsorb: 100,
      shieldDamageOffsetFromPlayer: 1000,
      teamRecover: 5000,
      ccTimeToPlayer: 40,
      viewContribution: 20,
      monsterKill: 30,
      victory: true,
      placement: 3,
    }
    const healerRows = Array.from({ length: 400 }, (_, index) => ({
      ...template,
      gameId: `h-${index}`,
      uid: `healer-${index}`,
      characterNum: 73,
      weaponTypeId: 24,
      playedAt: playedAt(index),
    }))
    const utilityRows = Array.from({ length: 400 }, (_, index) => ({
      ...template,
      gameId: `u-${index}`,
      uid: `utility-${index}`,
      characterNum: 51,
      weaponTypeId: 22,
      playedAt: playedAt(index + 400),
    }))
    const document = buildRoleMetricBaselineDocument([...healerRows, ...utilityRows])
    expect(document.combinations['meteorite_plus|51:22']?.liveEligibility.teamRecover).toBe(false)
  })
})
