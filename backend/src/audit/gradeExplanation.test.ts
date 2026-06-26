import { describe, expect, it, beforeEach } from 'vitest'

import { buildWeaponGroupGradeExplanation } from './gradeExplanation.js'
import { buildWeaponGroupComparisonRow, summarizeRolloutRows } from './gradeRolloutAudit.js'
import {
  primeCombatContributionLiveCaches,
  resetCombatContributionLiveCaches,
} from '../services/characterPerformanceGrade/combatContributionLiveGrade.js'
import { resetLiveRoleMetricBaselineCache } from '../services/characterPerformanceGrade/roleMetricLiveGrade.js'
import {
  applySampleConfidence,
  scoreToFineGrade,
} from '../services/characterPerformanceGrade/config.js'
import { aggregateWeaponGroupStats, type MatchGradeInput } from '../services/characterPerformanceGrade/metrics.js'
import { computeWeaponGroupScore } from '../services/characterPerformanceGrade/compute.js'

function match(overrides: Partial<MatchGradeInput> = {}): MatchGradeInput {
  return {
    placement: 3,
    kills: 2,
    assists: 8,
    deaths: 2,
    teamKills: 12,
    damageToPlayer: 4500,
    visionScore: 18,
    visionFromStructured: true,
    animalKills: 12,
    animalKillsFromStructured: true,
    roleMetricsVersion: null,
    damageFromPlayer: null,
    damageFromPlayerFromStructured: false,
    shieldDamageOffsetFromPlayer: null,
    shieldFromStructured: false,
    teamRecover: null,
    teamRecoverFromStructured: false,
    victory: false,
    weaponTypeId: 9,
    ...overrides,
  }
}

describe('gradeExplanation', () => {
  beforeEach(() => {
    resetLiveRoleMetricBaselineCache()
    resetCombatContributionLiveCaches()
  })

  it('builds metric explanations with weightedContribution', () => {
    const matches = Array.from({ length: 10 }, () => match())
    const stats = aggregateWeaponGroupStats(69, 9, matches)!
    const explanation = buildWeaponGroupGradeExplanation({
      stats,
      matches,
      role: '서포터',
      playerTierKey: 'meteorite_plus',
    })
    expect(explanation.outcome.metrics.length).toBe(3)
    for (const metric of explanation.outcome.metrics) {
      if (metric.normalizedScore != null && metric.weight > 0) {
        expect(metric.weightedContribution).toBeCloseTo((metric.normalizedScore * metric.weight) / 100, 5)
      }
    }
    expect(explanation.matchCount).toBe(10)
  })

  it('rawScore and confidence match live compute', () => {
    const matches = Array.from({ length: 69 }, (_, index) =>
      match({ victory: index % 5 === 0, placement: 4, kills: 1, assists: 5 }),
    )
    const stats = aggregateWeaponGroupStats(69, 9, matches)!
    const live = computeWeaponGroupScore(stats, '서포터', 'meteorite_plus', matches)
    const explanation = buildWeaponGroupGradeExplanation({
      stats,
      matches,
      role: '서포터',
      playerTierKey: 'meteorite_plus',
    })
    expect(explanation.rawScoreBeforeConfidence).toBe(Math.round(live.rawScore * 100) / 100)
    const expectedFinal = applySampleConfidence(live.rawScore, 69)
    expect(explanation.finalScore).toBeCloseTo(Math.round(expectedFinal * 100) / 100, 2)
    expect(explanation.finalGrade).toBe(scoreToFineGrade(expectedFinal))
  })

  it('combat mode hides legacy K/A/TK contributions in role metrics when combat applied', () => {
    primeCombatContributionLiveCaches({ baselineDocument: null, blocklist: null })
    const matches = Array.from({ length: 10 }, () => match())
    const stats = aggregateWeaponGroupStats(2, 10, matches)!
    const explanation = buildWeaponGroupGradeExplanation({
      stats,
      matches,
      role: '평타 딜러',
      playerTierKey: 'meteorite_plus',
    })
    if (explanation.modes.combatMetricMode !== 'legacy-k-a-tk') {
      const legacyKills = explanation.roleScore.metrics.find((metric) => metric.metric === 'kills')
      expect(legacyKills).toBeUndefined()
    }
  })

  it('summarize rollout rows', () => {
    const summary = summarizeRolloutRows([
      {
        anonymousProfileId: 'profile_a',
        characterNum: 69,
        weaponTypeId: 9,
        role: '서포터',
        playerTierKey: 'meteorite_plus',
        exactKey: 'meteorite_plus|69:9',
        matchCount: 10,
        legacyRawScore: 70,
        liveRawScore: 71.5,
        legacyGrade: 'B+',
        liveGrade: 'B+',
        scoreDelta: 1.5,
        gradeStepDelta: 0,
        coarseChanged: false,
        combatApplied: true,
        combatMode: 'support-utility-combat',
        roleMetricMode: 'support-utility-legacy',
        combatFallbackReason: null,
      },
    ])
    expect(summary.appliedGroupCount).toBe(1)
    expect(summary.meanScoreDelta).toBeCloseTo(1.5)
  })

  it('legacy comparison row matches weapon group score', () => {
    const matches = Array.from({ length: 8 }, () => match())
    const row = buildWeaponGroupComparisonRow({
      uid: 'uid-test',
      characterNum: 69,
      weaponTypeId: 9,
      matches,
      playerTierKey: 'meteorite_plus',
    })
    expect(row?.matchCount).toBe(8)
    expect(row?.legacyRawScore).not.toBeNull()
    expect(row?.liveRawScore).not.toBeNull()
  })
})
