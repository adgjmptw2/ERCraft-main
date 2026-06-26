import { describe, expect, it, beforeEach } from 'vitest'

import {
  evaluateCombatPresetCompleteness,
  resolveRequiredCombatPresetMetrics,
  scoreCombatPresetFixedTotal,
} from './combatPresetCompleteness.js'
import { COMBAT_LIVE_PRESET_UTILITY_COMBAT } from './combatParticipationConfig.js'
import { aggregateWeaponGroupStats, type MatchGradeInput } from './metrics.js'
import {
  primeCombatContributionLiveCaches,
  resetCombatContributionLiveCaches,
  resolveCombatContributionAttempt,
} from './combatContributionLiveGrade.js'
import { buildCombatParticipationBaselineDocument } from '../../audit/combatParticipationBaselineBuilder.js'
import { CURRENT_DISPLAY_SEASON } from '../../utils/seasonRankTierLadder.js'
import { computeWeaponGroupScore } from './compute.js'

function match(overrides: Partial<MatchGradeInput> = {}): MatchGradeInput {
  return {
    placement: 4,
    kills: 1,
    assists: 5,
    deaths: 2,
    teamKills: 10,
    damageToPlayer: 5000,
    visionScore: null,
    visionFromStructured: false,
    animalKills: null,
    animalKillsFromStructured: false,
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

describe('combatPresetCompleteness', () => {
  beforeEach(() => {
    process.env.CHARACTER_GRADE_BENCHMARK_SOURCE = 'experimental-local'
    resetCombatContributionLiveCaches()
  })

  it('lists required utility support metrics without finisher', () => {
    const required = resolveRequiredCombatPresetMetrics(COMBAT_LIVE_PRESET_UTILITY_COMBAT)
    expect(required).toContain('damageToPlayer')
    expect(required).toContain('combatContribution')
    expect(required).toContain('deaths')
    expect(required).toContain('viewContribution')
    expect(required).toContain('monsterKill')
    expect(required).not.toContain('finisherShare')
  })

  it('marks complete when all required metrics are ready', () => {
    const matches = Array.from({ length: 10 }, () =>
      match({ visionScore: 12, visionFromStructured: true, animalKills: 8, animalKillsFromStructured: true }),
    )
    const stats = aggregateWeaponGroupStats(69, 9, matches)!
    const result = evaluateCombatPresetCompleteness({
      role: '서포터',
      characterNum: 69,
      weaponTypeId: 9,
      stats,
      matches,
    })
    expect(result.complete).toBe(true)
    expect(result.missingMetrics).toEqual([])
    expect(result.effectiveWeightTotal).toBe(100)
  })

  it('fails when viewContribution coverage is insufficient (leni-like)', () => {
    const matches = Array.from({ length: 69 }, (_, index) =>
      match({
        visionScore: index < 6 ? 12 : null,
        visionFromStructured: index < 6,
        animalKills: index < 6 ? 8 : null,
        animalKillsFromStructured: index < 6,
      }),
    )
    const stats = aggregateWeaponGroupStats(69, 9, matches)!
    const result = evaluateCombatPresetCompleteness({
      role: '서포터',
      characterNum: 69,
      weaponTypeId: 9,
      stats,
      matches,
    })
    expect(result.complete).toBe(false)
    expect(result.missingMetrics).toContain('viewContribution')
    expect(result.missingMetrics).toContain('monsterKill')
    expect(result.enabledWeightTotal).toBeLessThan(100)
  })

  it('does not renormalize incomplete preset scores', () => {
    expect(
      scoreCombatPresetFixedTotal(
        [
          { score: 70, weight: 10 },
          { score: 65, weight: 25 },
        ],
        100,
      ),
    ).toBeNull()
  })

  it('leni blocked key and preset incomplete fallback to legacy', () => {
    const rows = Array.from({ length: 150 }, (_, index) => ({
      gameId: `g-${index}`,
      uid: `u-${index}`,
      rankTierKey: 'meteorite_plus' as const,
      characterNum: 69,
      weaponTypeId: 9,
      role: '서포터' as const,
      playedAt: new Date().toISOString(),
      playerKill: 1,
      playerAssistant: 5,
      teamKill: 10,
      damageToPlayer: 5000,
      victory: false,
      placement: 4,
    }))
    const document = buildCombatParticipationBaselineDocument(rows, CURRENT_DISPLAY_SEASON)
    primeCombatContributionLiveCaches({
      baselineDocument: document,
      blocklist: {
        version: 1,
        generatedAt: '',
        blockedExactKeys: ['meteorite_plus|69:9'],
        reasons: { 'meteorite_plus|69:9': 'audit-block' },
      },
    })
    const matches = Array.from({ length: 69 }, (_, index) =>
      match({
        visionScore: index < 6 ? 12 : null,
        visionFromStructured: index < 6,
        animalKills: index < 6 ? 8 : null,
        animalKillsFromStructured: index < 6,
      }),
    )
    const stats = aggregateWeaponGroupStats(69, 9, matches)!
    const attempt = resolveCombatContributionAttempt({
      role: '서포터',
      playerTierKey: 'meteorite_plus',
      stats,
      matches,
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    })
    expect(attempt.fallbackReason).toBe('exact-key-blocked')

    primeCombatContributionLiveCaches({
      baselineDocument: document,
      blocklist: { version: 1, generatedAt: '', blockedExactKeys: [], reasons: {} },
    })
    const incompleteAttempt = resolveCombatContributionAttempt({
      role: '서포터',
      playerTierKey: 'meteorite_plus',
      stats,
      matches,
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    })
    expect(incompleteAttempt.fallbackReason).toBe('preset-incomplete')

    const scored = computeWeaponGroupScore(stats, '서포터', 'meteorite_plus', matches)
    expect(scored.combatMode).toBe('role-score-v3')
    expect(scored.combatPresetComplete).toBe(false)
    expect(scored.rawScore).toBeGreaterThan(0)
  })
})
