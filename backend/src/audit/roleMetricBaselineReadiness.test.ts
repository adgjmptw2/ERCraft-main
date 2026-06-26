import { describe, expect, it } from 'vitest'

import {
  buildBaselineReadinessReport,
  computeMetricDistribution,
  type RoleMetricRowSnapshot,
} from './roleMetricBaselineReadiness.js'

function row(partial: Partial<RoleMetricRowSnapshot>): RoleMetricRowSnapshot {
  return {
    gameId: 'g1',
    rankTierKey: 'gold',
    characterNum: 73,
    weaponTypeId: 24,
    role: '서포터',
    damageFromPlayer: null,
    protectAbsorb: null,
    shieldDamageOffsetFromPlayer: null,
    teamRecover: null,
    ccTimeToPlayer: null,
    viewContribution: null,
    monsterKill: null,
    deaths: null,
    rpAfter: 2500,
    displaySeasonId: 11,
    ...partial,
  }
}

describe('roleMetricBaselineReadiness', () => {
  it('표본 수 readiness 계산', () => {
    const rows = Array.from({ length: 35 }, (_, index) =>
      row({ teamRecover: index % 3 === 0 ? 0 : 100 + index }),
    )
    const metric = computeMetricDistribution(rows, 'teamRecover', [
      { min: 300, level: 'ready' },
      { min: 100, level: 'provisional' },
      { min: 30, level: 'experimental' },
      { min: 0, level: 'unusable' },
    ])
    expect(metric.nonNullCount).toBe(35)
    expect(metric.readiness).toBe('experimental')
    expect(metric.zeroRate).toBeGreaterThan(0)
    expect(metric.nonZeroMean).not.toBeNull()
  })

  it('percentile 계산', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) =>
      row({ damageFromPlayer: value * 100 }),
    )
    const metric = computeMetricDistribution(rows, 'damageFromPlayer', [
      { min: 0, level: 'unusable' },
    ])
    expect(metric.p50).toBe(550)
    expect(metric.p90).not.toBeNull()
  })

  it('상관성 보고 포함', () => {
    const report = buildBaselineReadinessReport([
      row({ protectAbsorb: 100, shieldDamageOffsetFromPlayer: 120, damageFromPlayer: 1000, deaths: 2 }),
      row({ protectAbsorb: 200, shieldDamageOffsetFromPlayer: 220, damageFromPlayer: 2000, deaths: 3 }),
      row({ protectAbsorb: 300, shieldDamageOffsetFromPlayer: 310, damageFromPlayer: 3000, deaths: 4 }),
    ])
    expect(report.correlations.protectAbsorb_vs_shieldDamageOffsetFromPlayer.sampleCount).toBe(3)
  })
})
