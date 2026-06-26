import { describe, expect, it } from 'vitest'

import {
  compareNormalizationMethods,
  computeTankingEfficiency,
  playerMatchRowToGradeInputLegacy,
  summarizeGradeChanges,
} from './roleMetricShadow.js'
import { buildRoleMetricBaselineDocument } from './roleMetricBaselineBuilder.js'

describe('roleMetricShadow', () => {
  it('tankingEfficiency with deaths=0', () => {
    expect(computeTankingEfficiency(10000, 0)).toBe(10000)
    expect(computeTankingEfficiency(10000, 2)).toBe(10000 / 3)
  })

  it('legacy grade input does not use structured columns', () => {
    const input = playerMatchRowToGradeInputLegacy({
      bestWeapon: 24,
      placement: 2,
      kills: 1,
      assists: 2,
      deaths: 1,
      teamKills: 8,
      damageToPlayer: 5000,
      victory: true,
      roleMetricsVersion: 1,
      viewContribution: 50,
      monsterKill: 40,
      rawJson: null,
    } as never)
    expect(input?.visionScore).toBeNull()
    expect(input?.visionFromStructured).toBe(false)
  })

  it('summarize grade changes', () => {
    const summary = summarizeGradeChanges([
      { before: 70, after: 72, beforeGrade: 'B+', afterGrade: 'A-' },
      { before: 68, after: 68, beforeGrade: 'B', afterGrade: 'B' },
    ])
    expect(summary.sampleCount).toBe(2)
    expect(summary.meanScoreDelta).toBe(1)
    expect(summary.oneStepChangeRate).toBe(0.5)
  })

  it('normalization comparison prefers winsorized mean', () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      gameId: `g${index}`,
      uid: `u${index % 3}`,
      rankTierKey: 'meteorite_plus',
      characterNum: 76,
      weaponTypeId: 3,
      role: '탱커',
      playedAt: '2026-06-01T00:00:00.000Z',
      deaths: 1,
      damageFromPlayer: 1000 + index * 10,
      protectAbsorb: 0,
      shieldDamageOffsetFromPlayer: index % 5 === 0 ? 500 : 0,
      teamRecover: 0,
      ccTimeToPlayer: 30,
      viewContribution: 10,
      monsterKill: 20,
      victory: true,
      placement: 2,
    }))
    const document = buildRoleMetricBaselineDocument(rows)
    const comparisons = compareNormalizationMethods(document)
    expect(comparisons.length).toBe(3)
    expect(comparisons.some((entry) => entry.method === 'winsorized_mean_p90')).toBe(true)
  })
})
