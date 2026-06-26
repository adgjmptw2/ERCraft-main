import { describe, expect, it } from 'vitest'

import {
  resolveStructuredMetricCoverage,
  readStructuredMetricFromRow,
  STRUCTURED_METRIC_COVERAGE_RATIO,
  STRUCTURED_METRIC_MIN_GAMES,
} from './structuredMetricRecovery.js'
import { aggregateWeaponGroupStats } from './metrics.js'

describe('structuredMetricRecovery', () => {
  it('coverage 80% 미만이면 eligible=false', () => {
    const coverage = resolveStructuredMetricCoverage(32, 10)
    expect(coverage.coverageRatio).toBeCloseTo(10 / 32)
    expect(coverage.eligible).toBe(false)
  })

  it('coverage 80% 이상이면 eligible=true', () => {
    const coverage = resolveStructuredMetricCoverage(32, 30)
    expect(coverage.coverageRatio).toBeCloseTo(30 / 32)
    expect(coverage.eligible).toBe(true)
  })

  it('structured column 우선 사용', () => {
    const vision = readStructuredMetricFromRow(
      {
        roleMetricsVersion: 1,
        viewContribution: 42,
        rawJson: { viewContribution: 10 },
      },
      'viewContribution',
    )
    expect(vision.value).toBe(42)
    expect(vision.fromStructured).toBe(true)
  })

  it('eligible일 때 structured 평균만 사용', () => {
    const matches = Array.from({ length: 10 }, (_, index) => ({
      placement: 3,
      kills: 1,
      assists: 2,
      deaths: 1,
      teamKills: 8,
      damageToPlayer: 5000,
      visionScore: index < 8 ? 20 : null,
      visionFromStructured: index < 8,
      animalKills: index < 8 ? 30 : null,
      animalKillsFromStructured: index < 8,
      roleMetricsVersion: 1,
      damageFromPlayer: null,
      damageFromPlayerFromStructured: false,
      shieldDamageOffsetFromPlayer: null,
      shieldFromStructured: false,
      teamRecover: null,
      teamRecoverFromStructured: false,
      victory: false,
      weaponTypeId: 24,
    }))
    const stats = aggregateWeaponGroupStats(73, 24, matches)
    expect(stats?.visionCoverage.eligible).toBe(true)
    expect(stats?.avgVisionScore).toBe(20)
    expect(stats?.animalKillCoverage.eligible).toBe(true)
    expect(stats?.avgAnimalKills).toBe(30)
  })

  it('MIN_GAMES 미달이면 eligible=false', () => {
    const coverage = resolveStructuredMetricCoverage(4, 4)
    expect(coverage.eligible).toBe(false)
    expect(STRUCTURED_METRIC_MIN_GAMES).toBe(5)
    expect(STRUCTURED_METRIC_COVERAGE_RATIO).toBe(0.8)
  })
})
