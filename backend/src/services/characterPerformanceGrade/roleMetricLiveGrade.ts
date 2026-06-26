import { CURRENT_DISPLAY_SEASON } from '../../utils/seasonRankTierLadder.js'
import { isExperimentalLocalBenchmarkSourceEnabled } from './benchmarkSource.js'
import {
  loadRoleMetricBaselineDocument,
  lookupComboBaseline,
  type RoleMetricBaselineDocument,
  type RoleMetricBaselineStat,
  type RoleMetricComboBaseline,
  type RoleMetricDerivedBaselineStat,
} from '../../audit/roleMetricBaselineBuilder.js'
import type { EffectiveReadinessLevel } from '../../audit/roleMetricCalibration.js'
import { computeTankingEfficiencyValue } from '../../audit/roleMetricStability.js'
import { ROLE_METRIC_STABILITY_CONFIG } from '../../audit/roleMetricStabilityConfig.js'
import {
  NORMALIZATION_EPSILON,
  OUTCOME_SCORE_WEIGHT,
  ROLE_PRESET_WEIGHTS,
  ROLE_SCORE_WEIGHT,
  type CharacterGradeRole,
  type GradeBaselineTierKey,
} from './config.js'
import {
  aggregateWeaponGroupStats,
  clamp,
  createNormalizationMeta,
  OUTCOME_METRIC_DEFINITIONS,
  recordNormalizationMode,
  ROLE_METRIC_DEFINITIONS,
  robustNormalizeMetricScore,
  weightedScore,
  type MatchGradeInput,
  type WeaponGroupStats,
} from './metrics.js'
import {
  lookupBaselineForCombination,
  lookupEliteCandidatesForMetric,
} from './baselineStore.js'
import { resolveStructuredMetricCoverage } from './structuredMetricRecovery.js'
import { resolveSupportSubtype } from './supportSubtype.js'
import type { WeaponGroupScoreCore } from './metrics.js'

export type GradeRoleMetricMode =
  | 'legacy'
  | 'tank-t1'
  | 'tank-t2'
  | 'support-healer-s1'
  | 'support-utility-legacy'

export type GradeRoleMetricFallbackReason =
  | 'baseline-unavailable'
  | 'readiness-insufficient'
  | 'bootstrap-unstable'
  | 'validation-unstable'
  | 'coverage-insufficient'
  | 'sample-insufficient'
  | 'invalid-anchor'
  | 'season-mismatch'
  | 'source-disabled'
  | null

export const TANK_LIVE_PRESET = {
  damageToPlayer: 6,
  playerKill: 3,
  teamKill: 18,
  playerAssistant: 16,
  survival: 23,
  viewContribution: 12,
  monsterKill: 7,
  tankingUtility: 15,
} as const

export const SUPPORT_HEALER_LIVE_PRESET = {
  damageToPlayer: 4,
  playerKill: 2,
  teamKill: 18,
  playerAssistant: 22,
  survival: 16,
  viewContribution: 17,
  monsterKill: 3,
  supportUtility: 18,
} as const

export interface RoleMetricCoverageSnapshot {
  totalGames: number
  nonNullGames: number
  coverageRatio: number
  eligible: boolean
}

export interface LiveRoleMetricContext {
  mode: GradeRoleMetricMode
  fallbackReason: GradeRoleMetricFallbackReason
  coverage: number | null
  baselineReadiness: EffectiveReadinessLevel | null
}

let cachedLiveBaselineDocument: RoleMetricBaselineDocument | null | undefined

export function resetLiveRoleMetricBaselineCache(): void {
  cachedLiveBaselineDocument = undefined
}

export function primeLiveRoleMetricBaselineCache(
  document: RoleMetricBaselineDocument | null,
): void {
  cachedLiveBaselineDocument = document
}

export function getLiveRoleMetricBaselineDocument(): RoleMetricBaselineDocument | null {
  if (cachedLiveBaselineDocument !== undefined) {
    return cachedLiveBaselineDocument
  }
  try {
    const document = loadRoleMetricBaselineDocument()
    const sampleCombo = Object.values(document.combinations)[0]
    if (!sampleCombo?.liveEligibility || !sampleCombo.derivedMetrics?.tankingEfficiency) {
      cachedLiveBaselineDocument = null
      return null
    }
    cachedLiveBaselineDocument = document
  } catch {
    cachedLiveBaselineDocument = null
  }
  return cachedLiveBaselineDocument
}

export function resolveRoleMetricFieldCoverage(
  matches: ReadonlyArray<MatchGradeInput>,
  hasValue: (match: MatchGradeInput) => boolean,
): RoleMetricCoverageSnapshot {
  const totalGames = matches.length
  const nonNullGames = matches.filter(hasValue).length
  const coverage = resolveStructuredMetricCoverage(totalGames, nonNullGames)
  return {
    totalGames: coverage.totalGames,
    nonNullGames: coverage.structuredGames,
    coverageRatio: coverage.coverageRatio,
    eligible: coverage.eligible,
  }
}

export function resolveTankingEfficiencyCoverage(
  matches: ReadonlyArray<MatchGradeInput>,
): RoleMetricCoverageSnapshot {
  return resolveRoleMetricFieldCoverage(matches, (match) => {
    if (!match.damageFromPlayerFromStructured) return false
    return match.deaths != null && Number.isFinite(match.deaths)
  })
}

export function resolveTeamRecoverCoverage(
  matches: ReadonlyArray<MatchGradeInput>,
): RoleMetricCoverageSnapshot {
  return resolveRoleMetricFieldCoverage(
    matches,
    (match) => match.teamRecoverFromStructured && match.teamRecover != null,
  )
}

export function resolveShieldCoverage(
  matches: ReadonlyArray<MatchGradeInput>,
): RoleMetricCoverageSnapshot {
  return resolveRoleMetricFieldCoverage(
    matches,
    (match) => match.shieldFromStructured && match.shieldDamageOffsetFromPlayer != null,
  )
}

function winsorizeAndAverage(values: number[], cap: number | null): number | null {
  if (values.length === 0 || cap == null) return null
  const winsorized = values.map((value) => Math.min(value, cap))
  return winsorized.reduce((sum, value) => sum + value, 0) / winsorized.length
}

export function normalizeLiveRoleMetricScore(
  playerValue: number | null,
  stat: RoleMetricBaselineStat | RoleMetricDerivedBaselineStat,
): number | null {
  if (playerValue == null || !Number.isFinite(playerValue)) return null
  const baseline = stat.p95WinsorizedMean
  const upperAnchor = stat.p90
  if (
    baseline == null ||
    upperAnchor == null ||
    !Number.isFinite(baseline) ||
    !Number.isFinite(upperAnchor) ||
    upperAnchor <= baseline + ROLE_METRIC_STABILITY_CONFIG.anchorGapEpsilon
  ) {
    return null
  }

  const denominator = Math.max(Math.abs(baseline), NORMALIZATION_EPSILON)
  const relativePerformance = (playerValue - baseline) / denominator
  if (!Number.isFinite(relativePerformance)) return null

  if (relativePerformance <= 0) {
    return clamp(65 + 45 * relativePerformance, 20, 65)
  }

  const progress = (playerValue - baseline) / (upperAnchor - baseline)
  if (!Number.isFinite(progress)) return null
  return clamp(65 + 23 * progress, 65, 100)
}

function scoreExistingRoleMetric(
  stats: WeaponGroupStats,
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
  weightKey: string,
): number | null {
  const baseline = lookupBaselineForCombination(
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  if (!baseline) return null
  const definition = ROLE_METRIC_DEFINITIONS.find((entry) => entry.weightKey === weightKey)
  if (!definition) return null
  const playerValue = definition.readPlayer(stats)
  const tierValue = definition.readBaseline(baseline.metrics)
  if (playerValue == null || tierValue == null) return null
  return robustNormalizeMetricScore({
    playerValue,
    tierValue,
    eliteCandidates: lookupEliteCandidatesForMetric(
      playerTierKey,
      stats.characterNum,
      stats.weaponTypeId,
      (metrics) => definition.readBaseline(metrics),
    ),
    higherBetter: definition.higherBetter,
    metricKey: definition.tierOnlyKey,
  }).score
}

function aggregateLiveMetricAverage(
  matches: ReadonlyArray<MatchGradeInput>,
  readValue: (match: MatchGradeInput) => number | null,
  p95Cap: number | null,
): number | null {
  const values = matches.flatMap((match) => {
    const value = readValue(match)
    return value == null ? [] : [value]
  })
  return winsorizeAndAverage(values, p95Cap)
}

function computeTankingUtilityScore(
  matches: ReadonlyArray<MatchGradeInput>,
  comboBaseline: RoleMetricComboBaseline,
  useShield: boolean,
): number | null {
  const efficiencyStat = comboBaseline.derivedMetrics.tankingEfficiency
  const efficiencyAvg = aggregateLiveMetricAverage(
    matches,
    (match) =>
      match.damageFromPlayerFromStructured
        ? computeTankingEfficiencyValue(match.damageFromPlayer, match.deaths)
        : null,
    efficiencyStat.p95,
  )
  const efficiencyScore = normalizeLiveRoleMetricScore(efficiencyAvg, efficiencyStat)
  if (efficiencyScore == null) return null
  if (!useShield) return efficiencyScore

  const shieldStat = comboBaseline.metrics.shieldDamageOffsetFromPlayer
  const shieldAvg = aggregateLiveMetricAverage(
    matches,
    (match) => (match.shieldFromStructured ? match.shieldDamageOffsetFromPlayer : null),
    shieldStat.p95,
  )
  const shieldScore = normalizeLiveRoleMetricScore(shieldAvg, shieldStat)
  if (shieldScore == null) return efficiencyScore
  return efficiencyScore * 0.7 + shieldScore * 0.3
}

function computeSupportUtilityScore(
  matches: ReadonlyArray<MatchGradeInput>,
  comboBaseline: RoleMetricComboBaseline,
): number | null {
  const recoverStat = comboBaseline.metrics.teamRecover
  const recoverAvg = aggregateLiveMetricAverage(
    matches,
    (match) => (match.teamRecoverFromStructured ? match.teamRecover : null),
    recoverStat.p95,
  )
  return normalizeLiveRoleMetricScore(recoverAvg, recoverStat)
}

function computeLiveRoleScore(
  stats: WeaponGroupStats,
  matches: ReadonlyArray<MatchGradeInput>,
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
  preset: Record<string, number>,
  utilityKey: 'tankingUtility' | 'supportUtility',
  utilityScore: number | null,
): number | null {
  const entries: Array<{ score: number; weight: number }> = []
  for (const [key, weight] of Object.entries(preset)) {
    if (weight <= 0) continue
    if (key === utilityKey) {
      if (utilityScore == null) return null
      entries.push({ score: utilityScore, weight })
      continue
    }
    const score = scoreExistingRoleMetric(stats, role, playerTierKey, key)
    if (score == null) continue
    entries.push({ score, weight })
  }
  return weightedScore(entries)
}

function computeOutcomeScore(
  stats: WeaponGroupStats,
  playerTierKey: GradeBaselineTierKey,
  meta: ReturnType<typeof createNormalizationMeta>,
): number | null {
  const baseline = lookupBaselineForCombination(
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  if (!baseline) return null

  const outcomeEntries = OUTCOME_METRIC_DEFINITIONS.map((definition) => {
    const playerValue = definition.readPlayer(stats)
    const tierValue = definition.readBaseline(baseline.metrics)
    if (playerValue == null || tierValue == null) return null
    const normalized = robustNormalizeMetricScore({
      playerValue,
      tierValue,
      eliteCandidates: lookupEliteCandidatesForMetric(
        playerTierKey,
        stats.characterNum,
        stats.weaponTypeId,
        (metrics) => definition.readBaseline(metrics),
      ),
      higherBetter: definition.higherBetter,
      metricKey: definition.tierOnlyKey,
    })
    recordNormalizationMode(meta, normalized.mode)
    if (normalized.score == null) return null
    return { score: normalized.score, weight: definition.weight }
  }).filter((entry): entry is { score: number; weight: number } => entry != null)

  return weightedScore(outcomeEntries)
}

function legacyFallbackContext(reason: GradeRoleMetricFallbackReason): LiveRoleMetricContext {
  return {
    mode: 'legacy',
    fallbackReason: reason,
    coverage: null,
    baselineReadiness: null,
  }
}

export function resolveLiveRoleMetricAttempt(
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
  stats: WeaponGroupStats,
  matches: ReadonlyArray<MatchGradeInput>,
  displaySeasonId: number,
): {
  context: LiveRoleMetricContext
  comboBaseline: RoleMetricComboBaseline | null
  utilityScore: number | null
} {
  const supportSubtype =
    role === '서포터'
      ? resolveSupportSubtype(stats.characterNum, stats.weaponTypeId, role)
      : null

  if (supportSubtype === 'utility') {
    return {
      context: {
        mode: 'support-utility-legacy',
        fallbackReason: null,
        coverage: null,
        baselineReadiness: null,
      },
      comboBaseline: null,
      utilityScore: null,
    }
  }

  if (!isExperimentalLocalBenchmarkSourceEnabled()) {
    return {
      context: legacyFallbackContext('source-disabled'),
      comboBaseline: null,
      utilityScore: null,
    }
  }

  const document = getLiveRoleMetricBaselineDocument()
  if (!document) {
    return { context: legacyFallbackContext('baseline-unavailable'), comboBaseline: null, utilityScore: null }
  }
  if (document.seasonId !== displaySeasonId || displaySeasonId !== CURRENT_DISPLAY_SEASON) {
    return { context: legacyFallbackContext('season-mismatch'), comboBaseline: null, utilityScore: null }
  }

  const comboBaseline = lookupComboBaseline(
    document,
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  if (!comboBaseline) {
    return { context: legacyFallbackContext('baseline-unavailable'), comboBaseline: null, utilityScore: null }
  }

  if (role === '탱커') {
    if (!comboBaseline.liveEligibility.tankingEfficiency) {
      return {
        context: {
          mode: 'legacy',
          fallbackReason: comboBaseline.derivedMetrics.tankingEfficiency.bootstrap.stable
            ? 'validation-unstable'
            : 'bootstrap-unstable',
          coverage: null,
          baselineReadiness: comboBaseline.derivedMetrics.tankingEfficiency.readiness,
        },
        comboBaseline,
        utilityScore: null,
      }
    }

    const tankCoverage = resolveTankingEfficiencyCoverage(matches)
    if (!tankCoverage.eligible) {
      return {
        context: {
          mode: 'legacy',
          fallbackReason: 'coverage-insufficient',
          coverage: tankCoverage.coverageRatio,
          baselineReadiness: comboBaseline.derivedMetrics.tankingEfficiency.readiness,
        },
        comboBaseline,
        utilityScore: null,
      }
    }

    const shieldEligible =
      comboBaseline.liveEligibility.shieldDamageOffsetFromPlayer &&
      resolveShieldCoverage(matches).eligible
    const utilityScore = computeTankingUtilityScore(matches, comboBaseline, shieldEligible)
    if (utilityScore == null) {
      return {
        context: legacyFallbackContext('invalid-anchor'),
        comboBaseline,
        utilityScore: null,
      }
    }

    return {
      context: {
        mode: shieldEligible ? 'tank-t2' : 'tank-t1',
        fallbackReason: null,
        coverage: tankCoverage.coverageRatio,
        baselineReadiness: comboBaseline.derivedMetrics.tankingEfficiency.readiness,
      },
      comboBaseline,
      utilityScore,
    }
  }

  if (role === '서포터') {
    if (!comboBaseline.liveEligibility.teamRecover) {
      return {
        context: {
          mode: 'legacy',
          fallbackReason: comboBaseline.metrics.teamRecover.readiness === 'experimental' ||
            comboBaseline.metrics.teamRecover.readiness === 'unusable'
            ? 'readiness-insufficient'
            : 'bootstrap-unstable',
          coverage: null,
          baselineReadiness: comboBaseline.metrics.teamRecover.readiness,
        },
        comboBaseline,
        utilityScore: null,
      }
    }

    const recoverCoverage = resolveTeamRecoverCoverage(matches)
    if (!recoverCoverage.eligible) {
      return {
        context: {
          mode: 'legacy',
          fallbackReason: 'coverage-insufficient',
          coverage: recoverCoverage.coverageRatio,
          baselineReadiness: comboBaseline.metrics.teamRecover.readiness,
        },
        comboBaseline,
        utilityScore: null,
      }
    }

    const utilityScore = computeSupportUtilityScore(matches, comboBaseline)
    if (utilityScore == null) {
      return {
        context: legacyFallbackContext('invalid-anchor'),
        comboBaseline,
        utilityScore: null,
      }
    }

    return {
      context: {
        mode: 'support-healer-s1',
        fallbackReason: null,
        coverage: recoverCoverage.coverageRatio,
        baselineReadiness: comboBaseline.metrics.teamRecover.readiness,
      },
      comboBaseline,
      utilityScore,
    }
  }

  return { context: legacyFallbackContext(null), comboBaseline, utilityScore: null }
}

export function computeWeaponGroupScoreWithLiveRoleMetrics(params: {
  stats: WeaponGroupStats
  matches: MatchGradeInput[]
  role: CharacterGradeRole
  playerTierKey: GradeBaselineTierKey
  displaySeasonId: number
  legacyScore: WeaponGroupScoreCore | null
}): WeaponGroupScoreCore & LiveRoleMetricContext {
  const meta = createNormalizationMeta()
  const attempt = resolveLiveRoleMetricAttempt(
    params.role,
    params.playerTierKey,
    params.stats,
    params.matches,
    params.displaySeasonId,
  )

  if (
    attempt.context.mode === 'legacy' ||
    attempt.context.mode === 'support-utility-legacy' ||
    attempt.utilityScore == null ||
    !attempt.comboBaseline
  ) {
    if (params.legacyScore) {
      return {
        ...params.legacyScore,
        ...attempt.context,
      }
    }
    return {
      rawScore: 0,
      baselineTierKey: params.playerTierKey,
      usedFallback: true,
      normalizationMeta: meta,
      gradeFallbackMetricCount: 0,
      ...attempt.context,
    }
  }

  const outcomeScore = computeOutcomeScore(params.stats, params.playerTierKey, meta)
  const preset =
    params.role === '탱커'
      ? TANK_LIVE_PRESET
      : SUPPORT_HEALER_LIVE_PRESET
  const utilityKey = params.role === '탱커' ? 'tankingUtility' : 'supportUtility'
  const roleScore = computeLiveRoleScore(
    params.stats,
    params.matches,
    params.role,
    params.playerTierKey,
    preset,
    utilityKey,
    attempt.utilityScore,
  )

  if (outcomeScore == null || roleScore == null) {
    if (params.legacyScore) {
      return {
        ...params.legacyScore,
        mode: 'legacy',
        fallbackReason: 'invalid-anchor',
        coverage: attempt.context.coverage,
        baselineReadiness: attempt.context.baselineReadiness,
      }
    }
    return {
      rawScore: 0,
      baselineTierKey: params.playerTierKey,
      usedFallback: true,
      normalizationMeta: meta,
      gradeFallbackMetricCount: 0,
      mode: 'legacy',
      fallbackReason: 'invalid-anchor',
      coverage: attempt.context.coverage,
      baselineReadiness: attempt.context.baselineReadiness,
    }
  }

  const dakBaseline = lookupBaselineForCombination(
    params.playerTierKey,
    params.stats.characterNum,
    params.stats.weaponTypeId,
  )

  return {
    rawScore: outcomeScore * OUTCOME_SCORE_WEIGHT + roleScore * ROLE_SCORE_WEIGHT,
    baselineTierKey: dakBaseline?.tierKey ?? params.playerTierKey,
    usedFallback: dakBaseline?.usedFallback ?? false,
    normalizationMeta: meta,
    gradeFallbackMetricCount: 0,
    outcomeScore,
    roleScore,
    ...attempt.context,
  }
}

export function sumLivePresetWeights(preset: Record<string, number>): number {
  return Object.values(preset).reduce((sum, weight) => sum + weight, 0)
}
