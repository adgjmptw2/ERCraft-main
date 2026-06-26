import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import {
  normalizeLiveRoleMetricScore,
  resetLiveRoleMetricBaselineCache,
  primeLiveRoleMetricBaselineCache,
  resolveLiveRoleMetricAttempt,
  resolveRoleMetricFieldCoverage,
  resolveTankingEfficiencyCoverage,
  sumLivePresetWeights,
  TANK_LIVE_PRESET,
  SUPPORT_HEALER_LIVE_PRESET,
} from './roleMetricLiveGrade.js'
import { computeWeaponGroupScore } from './compute.js'
import type { MatchGradeInput } from './metrics.js'
import { aggregateWeaponGroupStats } from './metrics.js'
import { buildRoleMetricBaselineDocument } from '../../audit/roleMetricBaselineBuilder.js'
import { CURRENT_DISPLAY_SEASON } from '../../utils/seasonRankTierLadder.js'
import {
  primeCombatContributionLiveCaches,
  resetCombatContributionLiveCaches,
} from './combatContributionLiveGrade.js'

function match(overrides: Partial<MatchGradeInput> = {}): MatchGradeInput {
  return {
    placement: 3,
    kills: 1,
    assists: 2,
    deaths: 1,
    teamKills: 8,
    damageToPlayer: 5000,
    visionScore: 10,
    visionFromStructured: true,
    animalKills: 20,
    animalKillsFromStructured: true,
    roleMetricsVersion: 1,
    damageFromPlayer: 8000,
    damageFromPlayerFromStructured: true,
    shieldDamageOffsetFromPlayer: 1000,
    shieldFromStructured: true,
    teamRecover: 500,
    teamRecoverFromStructured: true,
    victory: false,
    weaponTypeId: 13,
    ...overrides,
  }
}

describe('roleMetricLiveGrade', () => {
  beforeEach(() => {
    process.env.CHARACTER_GRADE_BENCHMARK_SOURCE = 'experimental-local'
    resetLiveRoleMetricBaselineCache()
    resetCombatContributionLiveCaches()
    primeCombatContributionLiveCaches({ baselineDocument: null, blocklist: null })
  })

  afterEach(() => {
    delete process.env.CHARACTER_GRADE_BENCHMARK_SOURCE
  })

  it('live preset weights sum to 100', () => {
    expect(sumLivePresetWeights(TANK_LIVE_PRESET)).toBe(100)
    expect(sumLivePresetWeights(SUPPORT_HEALER_LIVE_PRESET)).toBe(100)
    expect(TANK_LIVE_PRESET.monsterKill).toBe(7)
    expect(SUPPORT_HEALER_LIVE_PRESET.monsterKill).toBe(3)
  })

  it('coverage 80% gate', () => {
    const eligible = resolveRoleMetricFieldCoverage(
      Array.from({ length: 10 }, () => match({ teamRecover: 100, teamRecoverFromStructured: true })),
      (row) => row.teamRecoverFromStructured && row.teamRecover != null,
    )
    expect(eligible.eligible).toBe(true)

    const ineligible = resolveRoleMetricFieldCoverage(
      [
        ...Array.from({ length: 4 }, () => match({ teamRecover: 100, teamRecoverFromStructured: true })),
        ...Array.from({ length: 6 }, () => match({ teamRecover: null, teamRecoverFromStructured: false })),
      ],
      (row) => row.teamRecoverFromStructured && row.teamRecover != null,
    )
    expect(ineligible.eligible).toBe(false)
  })

  it('0 값을 유효하게 coverage에 포함', () => {
    const coverage = resolveRoleMetricFieldCoverage(
      Array.from({ length: 10 }, () => match({ teamRecover: 0, teamRecoverFromStructured: true })),
      (row) => row.teamRecoverFromStructured && row.teamRecover != null,
    )
    expect(coverage.nonNullGames).toBe(10)
    expect(coverage.eligible).toBe(true)
  })

  it('normalize live role metric score', () => {
    const score = normalizeLiveRoleMetricScore(120, {
      totalCount: 100,
      nonNullCount: 100,
      zeroCount: 0,
      positiveCount: 100,
      mean: 80,
      median: 75,
      p10: 50,
      p25: 60,
      p75: 90,
      p90: 110,
      p95: 120,
      standardDeviation: 10,
      p95WinsorizedMean: 85,
      readiness: 'provisional',
    })
    expect(score).not.toBeNull()
    expect(score!).toBeGreaterThan(65)
  })

  it('utility 서포터는 support-utility-legacy', () => {
    const matches = Array.from({ length: 10 }, () => match({
      weaponTypeId: 9,
      teamRecover: 9000,
      teamRecoverFromStructured: true,
    }))
    const stats = aggregateWeaponGroupStats(69, 9, matches)!
    const attempt = resolveLiveRoleMetricAttempt(
      '서포터',
      'meteorite_plus',
      stats,
      matches,
      CURRENT_DISPLAY_SEASON,
    )
    expect(attempt.context.mode).toBe('support-utility-legacy')
    expect(attempt.context.fallbackReason).toBeNull()
  })

  it('utility는 teamRecover baseline ready여도 live 미적용', () => {
    const matches = Array.from({ length: 10 }, () => match({
      weaponTypeId: 22,
      teamRecover: 5000,
      teamRecoverFromStructured: true,
    }))
    const stats = aggregateWeaponGroupStats(51, 22, matches)!
    const attempt = resolveLiveRoleMetricAttempt(
      '서포터',
      'meteorite_plus',
      stats,
      matches,
      CURRENT_DISPLAY_SEASON,
    )
    expect(attempt.context.mode).toBe('support-utility-legacy')
  })

  it('production default disables local live role baselines', () => {
    delete process.env.CHARACTER_GRADE_BENCHMARK_SOURCE
    const matches = Array.from({ length: 10 }, () => match({
      damageFromPlayer: 8000,
      damageFromPlayerFromStructured: true,
    }))
    const stats = aggregateWeaponGroupStats(85, 13, matches)!
    const attempt = resolveLiveRoleMetricAttempt(
      '탱커',
      'mithril_plus',
      stats,
      matches,
      CURRENT_DISPLAY_SEASON,
    )
    expect(attempt.context.mode).toBe('legacy')
    expect(attempt.context.fallbackReason).toBe('source-disabled')
  })

  it('healer without live eligibility falls back to legacy', () => {
    const matches = Array.from({ length: 10 }, () => match({
      weaponTypeId: 24,
      teamRecover: 500,
      teamRecoverFromStructured: true,
    }))
    const stats = aggregateWeaponGroupStats(73, 24, matches)!
    const attempt = resolveLiveRoleMetricAttempt(
      '서포터',
      'meteorite_plus',
      stats,
      matches,
      CURRENT_DISPLAY_SEASON,
    )
    expect(attempt.context.mode).toBe('legacy')
    expect(attempt.context.fallbackReason).not.toBeNull()
  })

  it('healer with live eligibility and coverage resolves support-healer-s1', () => {
    const playedAt = (index: number) =>
      new Date(Date.UTC(2026, 5, 1 + (index % 28), index % 24)).toISOString()
    const rows = Array.from({ length: 400 }, (_, index) => ({
      gameId: `h-${index}`,
      uid: `healer-${index}`,
      rankTierKey: 'meteorite_plus' as const,
      characterNum: 73,
      weaponTypeId: 24,
      role: '서포터' as const,
      playedAt: playedAt(index),
      deaths: 1,
      damageFromPlayer: 10000 + (index % 50) * 100,
      protectAbsorb: 100,
      shieldDamageOffsetFromPlayer: 1000,
      teamRecover: 5000 + (index % 30) * 50,
      ccTimeToPlayer: 40,
      viewContribution: 20,
      monsterKill: 30,
      victory: true,
      placement: 3,
    }))
    const built = buildRoleMetricBaselineDocument(rows, CURRENT_DISPLAY_SEASON)
    expect(built.combinations['meteorite_plus|73:24']?.liveEligibility.teamRecover).toBe(true)

    primeLiveRoleMetricBaselineCache(built)

    const matches = Array.from({ length: 10 }, () => match({
      weaponTypeId: 24,
      teamRecover: 500,
      teamRecoverFromStructured: true,
    }))
    const stats = aggregateWeaponGroupStats(73, 24, matches)!
    const attempt = resolveLiveRoleMetricAttempt(
      '서포터',
      'meteorite_plus',
      stats,
      matches,
      CURRENT_DISPLAY_SEASON,
    )
    expect(attempt.context.mode).toBe('support-healer-s1')
    expect(attempt.context.fallbackReason).toBeNull()
  })

  it('레니 점수가 teamRecover 변경에 영향받지 않음', () => {
    const lowRecover = Array.from({ length: 10 }, () => match({
      weaponTypeId: 9,
      teamRecover: 0,
      teamRecoverFromStructured: true,
    }))
    const highRecover = Array.from({ length: 10 }, () => match({
      weaponTypeId: 9,
      teamRecover: 15000,
      teamRecoverFromStructured: true,
    }))
    const statsLow = aggregateWeaponGroupStats(69, 9, lowRecover)!
    const statsHigh = aggregateWeaponGroupStats(69, 9, highRecover)!
    const scoreLow = computeWeaponGroupScore(statsLow, '서포터', 'meteorite_plus', lowRecover)
    const scoreHigh = computeWeaponGroupScore(statsHigh, '서포터', 'meteorite_plus', highRecover)
    expect(scoreLow?.mode).toBeUndefined()
    expect(scoreHigh?.mode).toBeUndefined()
    expect(scoreLow?.combatMode).toBe('role-score-v3')
    expect(scoreHigh?.combatMode).toBe('role-score-v3')
    expect(scoreLow?.rawScore).toBe(scoreHigh?.rawScore)
  })

  it('coverage gate forces legacy fallback', () => {
    const matches = Array.from({ length: 10 }, (_, index) => match({
      damageFromPlayer: index < 3 ? 8000 : null,
      damageFromPlayerFromStructured: index < 3,
      deaths: 1,
    }))
    const coverage = resolveTankingEfficiencyCoverage(matches)
    expect(coverage.eligible).toBe(false)
  })
})
