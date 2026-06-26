import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { buildCombatParticipationBaselineDocument } from '../../audit/combatParticipationBaselineBuilder.js'
import type { CombatParticipationRow } from '../../audit/combatParticipationBaselineBuilder.js'
import { buildRoleMetricBaselineDocument } from '../../audit/roleMetricBaselineBuilder.js'
import { CURRENT_DISPLAY_SEASON } from '../../utils/seasonRankTierLadder.js'
import {
  computeCombatContributionRatio,
  computeFinisherShare,
  COMBAT_CONTRIBUTION_ASSIST_WEIGHT,
} from './combatParticipation.js'
import {
  COMBAT_LIVE_PRESET_ASSASSIN,
  COMBAT_LIVE_PRESET_DEALER_AUTO,
  COMBAT_LIVE_PRESET_DEALER_SKILL,
  COMBAT_LIVE_PRESET_BRUISER_AUTO,
  COMBAT_LIVE_PRESET_BRUISER_SKILL,
  COMBAT_LIVE_PRESET_HEALER_COMBAT,
  COMBAT_LIVE_PRESET_TANK_FALLBACK,
  COMBAT_LIVE_PRESET_UTILITY_COMBAT,
  resolveCombatLivePreset,
  sumCombatLivePresetWeights,
  usesFinisherShareInLivePreset,
} from './combatParticipationConfig.js'
import {
  computeWeaponGroupScoreWithCombatContribution,
  getCombatContributionLiveBlocklist,
  isExactKeyCombatBlocked,
  primeCombatContributionLiveCaches,
  resetCombatContributionLiveCaches,
  resolveCombatContributionAttempt,
  resolveCombatContributionCoverage,
} from './combatContributionLiveGrade.js'
import { computeWeaponGroupScore } from './compute.js'
import { aggregateWeaponGroupStats, createNormalizationMeta, type MatchGradeInput } from './metrics.js'
import {
  primeLiveRoleMetricBaselineCache,
  resetLiveRoleMetricBaselineCache,
} from './roleMetricLiveGrade.js'

function match(overrides: Partial<MatchGradeInput> = {}): MatchGradeInput {
  return {
    placement: 3,
    kills: 4,
    assists: 3,
    deaths: 1,
    teamKills: 10,
    damageToPlayer: 12000,
    visionScore: 12,
    visionFromStructured: true,
    animalKills: 18,
    animalKillsFromStructured: true,
    roleMetricsVersion: null,
    damageFromPlayer: null,
    damageFromPlayerFromStructured: false,
    shieldDamageOffsetFromPlayer: null,
    shieldFromStructured: false,
    teamRecover: null,
    teamRecoverFromStructured: false,
    victory: true,
    weaponTypeId: 10,
    ...overrides,
  }
}

function participationRows(count: number, overrides: Partial<CombatParticipationRow> = {}): CombatParticipationRow[] {
  return Array.from({ length: count }, (_, index) => ({
    gameId: `g-${index}`,
    uid: 'u1',
    rankTierKey: 'mithril_plus',
    characterNum: 2,
    weaponTypeId: 10,
    role: '평타 딜러',
    playedAt: new Date().toISOString(),
    playerKill: 4,
    playerAssistant: 3,
    teamKill: 10,
    damageToPlayer: 12000,
    victory: true,
    placement: 2,
    ...overrides,
  }))
}

describe('combatContributionLiveGrade', () => {
  beforeEach(() => {
    process.env.CHARACTER_GRADE_BENCHMARK_SOURCE = 'experimental-local'
    resetCombatContributionLiveCaches()
    resetLiveRoleMetricBaselineCache()
  })

  afterEach(() => {
    delete process.env.CHARACTER_GRADE_BENCHMARK_SOURCE
  })

  it('combatContributionRatio formula and teamKill 0 null', () => {
    expect(
      computeCombatContributionRatio({
        playerKill: 4,
        playerAssistant: 2,
        teamKill: 10,
      }),
    ).toBeCloseTo((4 + 2 * COMBAT_CONTRIBUTION_ASSIST_WEIGHT) / 10)
    expect(
      computeCombatContributionRatio({
        playerKill: 4,
        playerAssistant: 2,
        teamKill: 0,
      }),
    ).toBeNull()
    expect(
      computeCombatContributionRatio({
        playerKill: 4,
        playerAssistant: 2,
        teamKill: 10,
      })! > 1,
    ).toBe(false)
    expect(
      computeCombatContributionRatio({
        playerKill: 9,
        playerAssistant: 2,
        teamKill: 10,
      }),
    ).toBeGreaterThan(1)
  })

  it('finisherShare and role finisher usage', () => {
    expect(computeFinisherShare({ playerKill: 4, playerAssistant: 2, teamKill: 10 })).toBe(0.4)
    expect(usesFinisherShareInLivePreset(COMBAT_LIVE_PRESET_ASSASSIN)).toBe(true)
    expect(usesFinisherShareInLivePreset(COMBAT_LIVE_PRESET_BRUISER_AUTO)).toBe(false)
    expect(usesFinisherShareInLivePreset(COMBAT_LIVE_PRESET_TANK_FALLBACK)).toBe(false)
    expect(usesFinisherShareInLivePreset(COMBAT_LIVE_PRESET_HEALER_COMBAT)).toBe(false)
    expect(usesFinisherShareInLivePreset(COMBAT_LIVE_PRESET_UTILITY_COMBAT)).toBe(false)
  })

  it('live C3 preset sums to 100', () => {
    expect(sumCombatLivePresetWeights(COMBAT_LIVE_PRESET_DEALER_AUTO)).toBe(100)
    expect(sumCombatLivePresetWeights(COMBAT_LIVE_PRESET_DEALER_SKILL)).toBe(100)
    expect(sumCombatLivePresetWeights(COMBAT_LIVE_PRESET_ASSASSIN)).toBe(100)
    expect(sumCombatLivePresetWeights(COMBAT_LIVE_PRESET_BRUISER_AUTO)).toBe(100)
    expect(sumCombatLivePresetWeights(COMBAT_LIVE_PRESET_BRUISER_SKILL)).toBe(100)
    expect(sumCombatLivePresetWeights(COMBAT_LIVE_PRESET_TANK_FALLBACK)).toBe(100)
    expect(sumCombatLivePresetWeights(COMBAT_LIVE_PRESET_HEALER_COMBAT)).toBe(100)
    expect(sumCombatLivePresetWeights(COMBAT_LIVE_PRESET_UTILITY_COMBAT)).toBe(100)
  })

  it('coverage 80% gate', () => {
    const eligible = resolveCombatContributionCoverage(
      Array.from({ length: 10 }, () => match({ teamKills: 10 })),
    )
    expect(eligible.eligible).toBe(true)

    const ineligible = resolveCombatContributionCoverage([
      ...Array.from({ length: 4 }, () => match({ teamKills: 10 })),
      ...Array.from({ length: 6 }, () => match({ teamKills: 0 })),
    ])
    expect(ineligible.eligible).toBe(false)
  })

  it('experimental readiness is not live eligible', () => {
    const rows = participationRows(80)
    const document = buildCombatParticipationBaselineDocument(rows, CURRENT_DISPLAY_SEASON)
    primeCombatContributionLiveCaches({ baselineDocument: document, blocklist: null })
    const stats = aggregateWeaponGroupStats(2, 10, Array.from({ length: 10 }, () => match()))
    const attempt = resolveCombatContributionAttempt({
      role: '평타 딜러',
      playerTierKey: 'mithril_plus',
      stats: stats!,
      matches: Array.from({ length: 10 }, () => match()),
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    })
    expect(attempt.mode).toBe('legacy-k-a-tk')
    expect(attempt.fallbackReason).toBe('readiness-insufficient')
  })

  it('production default disables local live combat baselines', () => {
    delete process.env.CHARACTER_GRADE_BENCHMARK_SOURCE
    const rows = participationRows(150)
    const document = buildCombatParticipationBaselineDocument(rows, CURRENT_DISPLAY_SEASON)
    primeCombatContributionLiveCaches({ baselineDocument: document, blocklist: null })
    const matches = Array.from({ length: 10 }, () => match())
    const stats = aggregateWeaponGroupStats(2, 10, matches)
    const attempt = resolveCombatContributionAttempt({
      role: '평타 딜러',
      playerTierKey: 'mithril_plus',
      stats: stats!,
      matches,
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    })
    expect(attempt.mode).toBe('legacy-k-a-tk')
    expect(attempt.fallbackReason).toBe('source-disabled')
  })

  it('provisional readiness with coverage applies dealer-combat-c3', () => {
    const rows = participationRows(150)
    const document = buildCombatParticipationBaselineDocument(rows, CURRENT_DISPLAY_SEASON)
    primeCombatContributionLiveCaches({ baselineDocument: document, blocklist: { version: 1, generatedAt: '', blockedExactKeys: [], reasons: {} } })
    const matches = Array.from({ length: 10 }, () => match())
    const stats = aggregateWeaponGroupStats(2, 10, matches)
    const attempt = resolveCombatContributionAttempt({
      role: '평타 딜러',
      playerTierKey: 'mithril_plus',
      stats: stats!,
      matches,
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    })
    expect(attempt.mode).toBe('dealer-combat-c3')
    expect(attempt.fallbackReason).toBeNull()
  })

  it('blocked exact key falls back to legacy', () => {
    const rows = participationRows(150)
    const document = buildCombatParticipationBaselineDocument(rows, CURRENT_DISPLAY_SEASON)
    primeCombatContributionLiveCaches({
      baselineDocument: document,
      blocklist: {
        version: 1,
        generatedAt: '',
        blockedExactKeys: ['mithril_plus|2:10'],
        reasons: { 'mithril_plus|2:10': 'test-block' },
      },
    })
    const stats = aggregateWeaponGroupStats(2, 10, Array.from({ length: 10 }, () => match()))
    const attempt = resolveCombatContributionAttempt({
      role: '평타 딜러',
      playerTierKey: 'mithril_plus',
      stats: stats!,
      matches: Array.from({ length: 10 }, () => match()),
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    })
    expect(attempt.fallbackReason).toBe('exact-key-blocked')
    expect(isExactKeyCombatBlocked('mithril_plus', 2, 10)).toBe(true)
  })

  it('combat failure does not null grade — legacy score returned', () => {
    const rows = participationRows(150)
    const document = buildCombatParticipationBaselineDocument(rows, CURRENT_DISPLAY_SEASON)
    primeCombatContributionLiveCaches({ baselineDocument: document, blocklist: null })
    const matches = Array.from({ length: 3 }, () => match())
    const stats = aggregateWeaponGroupStats(2, 10, matches)
    const legacy = computeWeaponGroupScoreWithCombatContribution({
      stats: stats!,
      matches,
      role: '평타 딜러',
      playerTierKey: 'mithril_plus',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      legacyScore: {
        rawScore: 72,
        baselineTierKey: 'mithril_plus',
        usedFallback: false,
        normalizationMeta: createNormalizationMeta(),
        gradeFallbackMetricCount: 0,
      },
    })
    expect(legacy.mode).toBe('legacy-k-a-tk')
    expect(legacy.rawScore).toBe(72)
  })

  it('role-score-v3 is the production default before legacy tank live metric priority', () => {
    const playedAt = (index: number) =>
      new Date(Date.UTC(2026, 5, 1 + (index % 28), index % 24)).toISOString()
    const rows = Array.from({ length: 400 }, (_, index) => ({
      gameId: `t-${index}`,
      uid: `tank-${index}`,
      rankTierKey: 'mithril_plus' as const,
      characterNum: 85,
      weaponTypeId: 13,
      role: '탱커' as const,
      playedAt: playedAt(index),
      deaths: 2,
      damageFromPlayer: 9000 + (index % 40) * 100,
      protectAbsorb: 100,
      shieldDamageOffsetFromPlayer: 1200 + (index % 20) * 50,
      teamRecover: null,
      ccTimeToPlayer: 40,
      viewContribution: 10,
      monsterKill: 5,
      victory: true,
      placement: 3,
    }))
    const roleDoc = buildRoleMetricBaselineDocument(rows, CURRENT_DISPLAY_SEASON)
    expect(roleDoc.combinations['mithril_plus|85:13']?.liveEligibility.tankingEfficiency).toBe(true)
    primeLiveRoleMetricBaselineCache(roleDoc)
    const combatRows = participationRows(400, { characterNum: 85, weaponTypeId: 13, role: '탱커' })
    primeCombatContributionLiveCaches({
      baselineDocument: buildCombatParticipationBaselineDocument(combatRows, CURRENT_DISPLAY_SEASON),
      blocklist: null,
    })

    const matches = Array.from({ length: 10 }, () =>
      match({
        weaponTypeId: 13,
        damageFromPlayer: 9000,
        damageFromPlayerFromStructured: true,
        shieldDamageOffsetFromPlayer: 1200,
        shieldFromStructured: true,
      }),
    )
    const stats = aggregateWeaponGroupStats(85, 13, matches)
    const scored = computeWeaponGroupScore(stats!, '탱커', 'mithril_plus', matches, CURRENT_DISPLAY_SEASON)
    expect(scored.mode).toBeUndefined()
    expect(scored.combatMode).toBe('role-score-v3')
  })

  it('utility support preset has no finisher or teamRecover weights', () => {
    const preset = resolveCombatLivePreset('서포터', 69, 9)?.preset
    expect(preset?.finisherShare).toBeUndefined()
    expect(preset?.teamRecover).toBeUndefined()
    expect(preset?.playerKill).toBeUndefined()
  })

  it('loads blocklist JSON from src/data when running from dist', () => {
    resetCombatContributionLiveCaches()
    const blocklist = getCombatContributionLiveBlocklist()
    expect(blocklist.blockedExactKeys.length).toBeGreaterThan(0)
    expect(isExactKeyCombatBlocked('meteorite_plus', 69, 9)).toBe(true)
  })
})
