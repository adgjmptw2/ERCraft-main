import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import type { SeasonCharacterAggregateContract } from '../../contracts/player.js'
import type { PlayerMatchCharacterStatsMetaStatus } from '../../contracts/player.js'
import type { RankTier } from '../../utils/rankTier.js'
import { isGradeSupportedMode } from '../../types/matchesMode.js'
import percentileCalibrationDoc from '../../data/matchGradePercentileCalibration/match-grade-percentile-calibration.v2.json' with { type: 'json' }
import {
  computePercentileBaseScore,
  empiricalPercentileMidrank,
  evaluatePercentileCalibrationCandidate,
} from '../../analysis/shadow/matchGradePercentileCalibration.js'

import {
  lookupBaselineForCombination,
  lookupCharacterWeaponRole,
  lookupEliteCandidatesForMetric,
} from './baselineStore.js'
import {
  OUTCOME_SCORE_WEIGHT,
  ROLE_PRESET_WEIGHTS,
  ROLE_SCORE_WEIGHT,
  MIN_GRADE_SAMPLE_GAMES,
  MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE,
  MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE,
  MATCH_GRADE_S_ROLE_SCORE_GATE,
  applySampleConfidence,
  resolveGradeConfidence,
  scoreToFineGrade,
  type CharacterFineGrade,
  type CharacterGradeConfidence,
  type CharacterGradeRole,
  type CharacterGradeStatus,
  type GradeBaselineTierKey,
} from './config.js'
import {
  CHARACTER_AGGREGATE_GRADE_VERSION,
  computeCharacterAggregateGradeV2,
} from '../aggregateGrade.js'
import { AGGREGATE_GRADE_RUNTIME_VERSION } from '../gradeRuntimeConfig.js'
import {
  aggregateWeaponGroupStats,
  createNormalizationMeta,
  OUTCOME_METRIC_DEFINITIONS,
  recordNormalizationMode,
  ROLE_METRIC_DEFINITIONS,
  robustNormalizeMetricScore,
  weightedScore,
  type MatchGradeInput,
  type NormalizationMeta,
  type WeaponGroupStats,
  type WeaponGroupScoreCore,
} from './metrics.js'
import { rankTierToGradeBaselineKey } from './tierKey.js'
import { readStructuredMetricFromRow } from './structuredMetricRecovery.js'
import {
  computeWeaponGroupScoreWithLiveRoleMetrics,
  type GradeRoleMetricFallbackReason,
  type GradeRoleMetricMode,
} from './roleMetricLiveGrade.js'
import {
  computeWeaponGroupScoreWithCombatContribution,
  type GradeCombatMetricFallbackReason,
  type GradeCombatMetricMode,
} from './combatContributionLiveGrade.js'
import { CURRENT_DISPLAY_SEASON } from '../../utils/seasonRankTierLadder.js'
import { MATCH_GRADE_RUNTIME_VERSION } from '../gradeRuntimeConfig.js'
import { resolveResidualRoleBaseline } from '../teamLuckResidualBaseline.js'
import {
  computeCombatContributionRatio as computeTeamLuckCombatContributionRatio,
  computeTeamLuckRoleScore,
  deathsPer10m,
  perMinute,
} from '../roleScore/teamLuckRoleScore.js'
import {
  resolveTeamLuckRoleScoreBaseline,
} from '../roleScore/teamLuckRoleScoreBaseline.js'
import {
  computeMatchGradeV3,
  MATCH_GRADE_DIRECT_VERSION,
} from '../roleScore/roleScoreV3.js'

const H_PRIORITY_ROLE_METRIC_MODES: GradeRoleMetricMode[] = [
  'tank-t2',
  'tank-t1',
  'support-healer-s1',
]

export interface GradeFallbackMetadata {
  used: boolean
  baselineLevel: 'none' | 'exact' | 'tier-neighbor' | 'insufficient-baseline'
  normalization: 'none' | 'elite-anchor' | 'alternate-elite-anchor' | 'tier-only'
  combat: 'none' | 'live-metric' | 'legacy-combat' | 'blocked-exact-key' | 'fallback'
  reasons: string[]
}

export interface CharacterGradeFields {
  grade: CharacterFineGrade | null
  gradeScore: number | null
  gradeStatus: CharacterGradeStatus
  gradeConfidence: CharacterGradeConfidence | null
  gradeSampleSize: number
  gradeBaselineTierKey: string | null
  gradeRole: CharacterGradeRole | null
  gradeUsedFallback: boolean
  gradeFallback?: GradeFallbackMetadata
  gradeFallbackMetricCount?: number
  gradeRoleMetricMode?: GradeRoleMetricMode
  gradeRoleMetricFallbackReason?: GradeRoleMetricFallbackReason
  gradeRoleMetricCoverage?: number | null
  gradeRoleMetricBaselineReadiness?: 'unusable' | 'experimental' | 'provisional' | 'ready' | null
  gradeCombatMetricMode?: GradeCombatMetricMode
  gradeCombatMetricFallbackReason?: GradeCombatMetricFallbackReason
  gradeCombatMetricCoverage?: number | null
  gradeCombatMetricBaselineReadiness?: 'unusable' | 'experimental' | 'provisional' | 'ready' | null
  gradeCombatPresetComplete?: boolean
  gradeCombatMissingMetrics?: string[]
  gradeCombatEffectiveWeightTotal?: number | null
  gradeAggregation?: SeasonCharacterAggregateContract['gradeAggregation']
}

export interface WeaponGroupScoreResult extends WeaponGroupScoreCore {}

export interface StoredMatchGradeRow {
  gameMode?: string | null
  characterNum: number
  placement: number | null
  kills: number | null
  assists: number | null
  deaths: number | null
  teamKills: number | null
  damageToPlayer: number | null
  victory: boolean | null
  bestWeapon?: number | null
  gameDuration?: number | null
  roleMetricsVersion?: number | null
  viewContribution?: number | null
  monsterKill?: number | null
  damageFromPlayer?: number | null
  shieldDamageOffsetFromPlayer?: number | null
  teamRecover?: number | null
  rawJson?: unknown
}

export interface MatchPerformanceGradeFields {
  matchGrade: CharacterFineGrade | null
  matchGradeScore: number | null
  matchGradeBaselineTierKey: string | null
  matchGradeRole: CharacterGradeRole | null
  matchGradeUsedFallback: boolean
  matchGradeFallback?: GradeFallbackMetadata
  matchGradeOutcomeScore?: number | null
  matchGradeRoleScore?: number | null
  matchGradeDamageEvidence?: {
    actualDamage: number | null
    baselineDamage: number | null
    oldExpectedDamage: number | null
    expectedDamage: number | null
    oldMultiplier: number | null
    globalMultiplier: number | null
    finalMultiplier: number | null
    damageRatio: number | null
    damageScore: number | null
    weightedContribution: number | null
    rawMetricScore?: number | null
    adjustedMetricScore?: number | null
    rawWeightedContribution?: number | null
    adjustedWeightedContribution?: number | null
    adjustmentPolicy?: string
    durationPolicy: string
    presetVersion: string
  }
  matchGradeMetricEvidence?: Array<{
    metric: string
    actualValue: number | null
    expectedValue: number | null
    ratio: number | null
    rawMetricScore: number | null
    adjustedMetricScore: number | null
    adjustmentPolicy: string
    weight: number
    rawWeightedContribution: number | null
    adjustedWeightedContribution: number | null
    metricPresetVersion: string
  }>
}

function roundEvidence(value: number | null | undefined, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 10 ** digits) / 10 ** digits
}

function storedMatchRowToGradeInput(row: StoredMatchGradeRow): MatchGradeInput | null {
  const weaponTypeId = row.bestWeapon ?? null
  if (weaponTypeId == null || weaponTypeId <= 0) return null

  const structuredSource = {
    roleMetricsVersion: row.roleMetricsVersion ?? null,
    viewContribution: row.viewContribution ?? null,
    monsterKill: row.monsterKill ?? null,
    rawJson: row.rawJson,
  }
  const vision = readStructuredMetricFromRow(structuredSource, 'viewContribution')
  const animal = readStructuredMetricFromRow(structuredSource, 'monsterKill')
  const structured = row.roleMetricsVersion === 1

  return {
    placement: row.placement ?? 0,
    kills: row.kills ?? 0,
    assists: row.assists ?? 0,
    deaths: row.deaths ?? 0,
    teamKills: row.teamKills ?? null,
    damageToPlayer: row.damageToPlayer ?? null,
    visionScore: vision.value,
    visionFromStructured: vision.fromStructured,
    animalKills: animal.value,
    animalKillsFromStructured: animal.fromStructured,
    roleMetricsVersion: row.roleMetricsVersion ?? null,
    gameDuration: row.gameDuration ?? null,
    damageFromPlayer: structured ? row.damageFromPlayer ?? null : null,
    damageFromPlayerFromStructured: structured && row.damageFromPlayer != null,
    shieldDamageOffsetFromPlayer: structured ? row.shieldDamageOffsetFromPlayer ?? null : null,
    shieldFromStructured: structured && row.shieldDamageOffsetFromPlayer != null,
    teamRecover: structured ? row.teamRecover ?? null : null,
    teamRecoverFromStructured: structured && row.teamRecover != null,
    victory: row.victory === true,
    weaponTypeId,
  }
}

export function playerMatchRowToGradeInput(row: PlayerMatchRow): MatchGradeInput | null {
  return storedMatchRowToGradeInput(row)
}

function emptyMatchGrade(): MatchPerformanceGradeFields {
  return {
    matchGrade: null,
    matchGradeScore: null,
    matchGradeBaselineTierKey: null,
    matchGradeRole: null,
    matchGradeUsedFallback: false,
    matchGradeFallback: emptyFallbackMetadata(),
    matchGradeOutcomeScore: null,
    matchGradeRoleScore: null,
    matchGradeDamageEvidence: undefined,
    matchGradeMetricEvidence: undefined,
  }
}

function emptyFallbackMetadata(): GradeFallbackMetadata {
  return {
    used: false,
    baselineLevel: 'none',
    normalization: 'none',
    combat: 'none',
    reasons: [],
  }
}

function buildGradeFallbackMetadata(params: {
  scored: WeaponGroupScoreResult
  requestedTierKey: GradeBaselineTierKey
  combatFallbackReason?: GradeCombatMetricFallbackReason
  combatMode?: GradeCombatMetricMode
}): GradeFallbackMetadata {
  const reasons: string[] = []
  const baselineLevel =
    params.scored.baselineTierKey === params.requestedTierKey
      ? ('exact' as const)
      : ('tier-neighbor' as const)
  if (baselineLevel === 'tier-neighbor') reasons.push('tier-neighbor')

  let normalization: GradeFallbackMetadata['normalization'] = 'none'
  if (params.scored.normalizationMeta.tierOnlyMetricCount > 0) {
    normalization = 'tier-only'
    reasons.push('tier-only')
  } else if (params.scored.normalizationMeta.alternateEliteMetricCount > 0) {
    normalization = 'alternate-elite-anchor'
    reasons.push('alternate-elite-anchor')
  } else if (params.scored.normalizationMeta.eliteMetricCount > 0) {
    normalization = 'elite-anchor'
  }

  let combat: GradeFallbackMetadata['combat'] = 'none'
  if (params.combatMode === 'legacy-k-a-tk') {
    combat = params.combatFallbackReason === 'exact-key-blocked'
      ? 'blocked-exact-key'
      : params.combatFallbackReason
        ? 'fallback'
        : 'legacy-combat'
    reasons.push(combat)
    if (params.combatFallbackReason) reasons.push(`combat:${params.combatFallbackReason}`)
  } else if (params.combatMode) {
    combat = 'live-metric'
  }

  const used =
    baselineLevel !== 'exact' ||
    normalization === 'tier-only' ||
    normalization === 'alternate-elite-anchor' ||
    combat === 'legacy-combat' ||
    combat === 'blocked-exact-key' ||
    combat === 'fallback' ||
    params.scored.usedFallback

  return {
    used,
    baselineLevel,
    normalization,
    combat,
    reasons: [...new Set(reasons)],
  }
}

function matchGradeFromScore(params: {
  score: number
  roleScore?: number | null
  outcomeScore?: number | null
}): CharacterFineGrade {
  let cappedScore = params.score
  const roleScore = params.roleScore ?? null
  const outcomeScore = params.outcomeScore ?? null

  if (
    cappedScore >= 95 &&
    (roleScore == null ||
      roleScore < MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE ||
      outcomeScore == null ||
      outcomeScore < MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE)
  ) {
    cappedScore = 94.99
  }

  if (
    cappedScore >= 84 &&
    (roleScore == null || roleScore < MATCH_GRADE_S_ROLE_SCORE_GATE)
  ) {
    cappedScore = 83.99
  }

  return scoreToFineGrade(cappedScore)
}

const percentileCalibrationResiduals = percentileCalibrationDoc.residualCdf.sortedResiduals as number[]
const percentileCalibrationScores = percentileCalibrationDoc.productionTargetDistribution.sortedScores as number[]
const percentileCalibrationGates = percentileCalibrationDoc.gates

export const MATCH_GRADE_PERCENTILE_CALIBRATION_VERSION =
  percentileCalibrationDoc.calibrationVersion
export const MATCH_GRADE_VERSION =
  MATCH_GRADE_RUNTIME_VERSION === 'v3-direct'
    ? MATCH_GRADE_DIRECT_VERSION
    : percentileCalibrationDoc.matchGradeVersion

function computeV3MatchPerformanceGrade(params: {
  row: StoredMatchGradeRow
  playerTier: RankTier | null
  displaySeasonId?: number
}): MatchPerformanceGradeFields {
  if (params.row.gameMode != null && !isGradeSupportedMode(params.row.gameMode)) {
    return emptyMatchGrade()
  }

  const playerTierKey = params.playerTier ? rankTierToGradeBaselineKey(params.playerTier) : null
  const input = storedMatchRowToGradeInput(params.row)
  const weaponTypeId = input?.weaponTypeId ?? null
  const role =
    playerTierKey && weaponTypeId != null && weaponTypeId > 0
      ? lookupCharacterWeaponRole(params.row.characterNum, weaponTypeId)
      : null
  if (!playerTierKey || !input || !role || weaponTypeId == null || weaponTypeId <= 0) {
    return computeLegacyMatchPerformanceGrade(params)
  }

  const v3 = computeMatchGradeV3({
    tierKey: playerTierKey,
    characterNum: params.row.characterNum,
    weaponTypeId,
    role,
    placement: params.row.placement ?? null,
    durationSeconds: params.row.gameDuration ?? null,
    damageToPlayer: input.damageToPlayer,
    kills: input.kills,
    assists: input.assists,
    teamKills: input.teamKills,
    deaths: input.deaths,
    visionScore: input.visionScore,
    monsterKill: input.animalKills,
  })
  if (!v3) return computeLegacyMatchPerformanceGrade(params)
  const damageDetail = v3.roleScoreDetail.metricDetails.find((entry) => entry.metric === 'damage')
  const damageTime = v3.roleScoreDetail.damageTime
  const expectedDamage = v3.roleScoreDetail.expectedMetrics.damageToPlayer
  const baselineDamage =
    damageTime && expectedDamage != null && damageTime.multiplier > 0
      ? expectedDamage / damageTime.multiplier
      : null
  const oldExpectedDamage =
    baselineDamage != null && damageTime ? baselineDamage * damageTime.legacyMultiplier : null
  const actualDamage = input.damageToPlayer ?? null
  const damageRatio =
    actualDamage != null && expectedDamage != null && expectedDamage > 0
      ? actualDamage / expectedDamage
      : null

  return {
    matchGrade: v3.grade,
    matchGradeScore: v3.score,
    matchGradeBaselineTierKey: playerTierKey,
    matchGradeRole: role,
    matchGradeUsedFallback: v3.roleScoreDetail.baselineLevel !== 'exact',
    matchGradeFallback: {
      used: v3.roleScoreDetail.baselineLevel !== 'exact',
      baselineLevel: v3.roleScoreDetail.baselineLevel === 'exact' ? 'exact' : 'tier-neighbor',
      normalization: 'tier-only',
      combat: 'live-metric',
      reasons:
        v3.roleScoreDetail.baselineLevel === 'exact'
          ? []
          : [`v3:${v3.roleScoreDetail.baselineLevel}`],
    },
    matchGradeOutcomeScore: null,
    matchGradeRoleScore: v3.roleScore,
    matchGradeMetricEvidence: v3.roleScoreDetail.metricDetails.map((detail) => ({
      metric: detail.metric,
      actualValue: roundEvidence(detail.actual, 4),
      expectedValue: roundEvidence(detail.expected, 4),
      ratio: roundEvidence(detail.ratio, 4),
      rawMetricScore: roundEvidence(detail.rawMetricScore, 4),
      adjustedMetricScore: roundEvidence(detail.adjustedMetricScore, 4),
      adjustmentPolicy: detail.adjustmentPolicy,
      weight: detail.weight,
      rawWeightedContribution: roundEvidence(detail.rawContribution, 4),
      adjustedWeightedContribution: roundEvidence(detail.contribution, 4),
      metricPresetVersion: detail.metricPresetVersion,
    })),
    matchGradeDamageEvidence: damageTime
      ? {
          actualDamage: roundEvidence(actualDamage, 2),
          baselineDamage: roundEvidence(baselineDamage, 2),
          oldExpectedDamage: roundEvidence(oldExpectedDamage, 2),
          expectedDamage: roundEvidence(expectedDamage, 2),
          oldMultiplier: roundEvidence(damageTime.legacyMultiplier, 6),
          globalMultiplier: roundEvidence(damageTime.globalMultiplier, 6),
          finalMultiplier: roundEvidence(damageTime.multiplier, 6),
          damageRatio: roundEvidence(damageRatio, 4),
          damageScore: roundEvidence(damageDetail?.adjustedMetricScore, 2),
          weightedContribution: roundEvidence(damageDetail?.contribution, 2),
          rawMetricScore: roundEvidence(damageDetail?.rawMetricScore, 2),
          adjustedMetricScore: roundEvidence(damageDetail?.adjustedMetricScore, 2),
          rawWeightedContribution: roundEvidence(damageDetail?.rawContribution, 2),
          adjustedWeightedContribution: roundEvidence(damageDetail?.contribution, 2),
          adjustmentPolicy: damageDetail?.adjustmentPolicy,
          durationPolicy: damageTime.policy,
          presetVersion: damageTime.presetVersion,
        }
      : undefined,
  }
}

function computeMatchGradeV3FromInput(params: {
  characterNum: number
  input: MatchGradeInput
  playerTierKey: GradeBaselineTierKey
  role: CharacterGradeRole
}): ReturnType<typeof computeMatchGradeV3> {
  return computeMatchGradeV3({
    tierKey: params.playerTierKey,
    characterNum: params.characterNum,
    weaponTypeId: params.input.weaponTypeId,
    role: params.role,
    placement: params.input.placement,
    durationSeconds: params.input.gameDuration ?? null,
    damageToPlayer: params.input.damageToPlayer,
    kills: params.input.kills,
    assists: params.input.assists,
    teamKills: params.input.teamKills,
    deaths: params.input.deaths,
    visionScore: params.input.visionScore,
    monsterKill: params.input.animalKills,
  })
}

function computeP4MatchGrade(params: {
  row: StoredMatchGradeRow
  playerTierKey: GradeBaselineTierKey
  role: CharacterGradeRole
  roleScore: number | null | undefined
  displaySeasonId: number
}): { score: number; grade: CharacterFineGrade } | null {
  const roleScore = params.roleScore ?? null
  const weaponTypeId = params.row.bestWeapon ?? null
  const placement = params.row.placement ?? null
  const durationSeconds = params.row.gameDuration ?? null
  if (
    roleScore == null ||
    weaponTypeId == null ||
    weaponTypeId <= 0 ||
    placement == null ||
    placement < 1 ||
    placement > 8 ||
    durationSeconds == null ||
    durationSeconds <= 0
  ) {
    return null
  }

  const baseline = resolveResidualRoleBaseline({
    season: params.displaySeasonId,
    mode: 'rank',
    tier: params.playerTierKey,
    characterNum: params.row.characterNum,
    weaponTypeId,
    role: params.role,
    placement,
    durationSeconds,
  })
  const expected = baseline.expectedRolePerformanceScore
  if (expected == null) return null

  const residualPercentile = empiricalPercentileMidrank(
    percentileCalibrationResiduals,
    roleScore - expected,
  )
  if (residualPercentile == null) return null
  const baseScore = computePercentileBaseScore({
    targetProductionScores: percentileCalibrationScores,
    residualPercentile,
  })
  if (baseScore == null) return null

  const result = evaluatePercentileCalibrationCandidate({
    candidate: 'P4',
    input: {
      residualPercentile,
      baseScore,
      placement,
    },
    thresholds: percentileCalibrationGates,
  })
  return result ? { score: result.score, grade: result.grade } : null
}

function computeLegacyMatchPerformanceGrade(params: {
  row: StoredMatchGradeRow
  playerTier: RankTier | null
  displaySeasonId?: number
}): MatchPerformanceGradeFields {
  if (params.row.gameMode != null && !isGradeSupportedMode(params.row.gameMode)) {
    return emptyMatchGrade()
  }

  const playerTierKey = params.playerTier ? rankTierToGradeBaselineKey(params.playerTier) : null
  if (!playerTierKey) return emptyMatchGrade()

  const input = storedMatchRowToGradeInput(params.row)
  if (!input) return emptyMatchGrade()

  const characterNum = params.row.characterNum
  const weaponTypeId = input.weaponTypeId
  if (weaponTypeId == null || weaponTypeId <= 0) return emptyMatchGrade()

  const role = lookupCharacterWeaponRole(characterNum, weaponTypeId)
  if (!role) return emptyMatchGrade()

  const stats = aggregateWeaponGroupStats(characterNum, weaponTypeId, [input])
  if (!stats) return emptyMatchGrade()

  const scored = computeWeaponGroupScore(
    stats,
    role,
    playerTierKey,
    [input],
    params.displaySeasonId ?? CURRENT_DISPLAY_SEASON,
  )
  if (!scored || !Number.isFinite(scored.rawScore)) return emptyMatchGrade()

  const score = Math.round(scored.rawScore * 100) / 100
  const fallback = buildGradeFallbackMetadata({
    scored,
    requestedTierKey: playerTierKey,
    combatMode: scored.combatMode,
    combatFallbackReason: scored.combatFallbackReason,
  })
  return {
    matchGrade: matchGradeFromScore({
      score,
      roleScore: scored.roleScore,
      outcomeScore: scored.outcomeScore,
    }),
    matchGradeScore: score,
    matchGradeBaselineTierKey: scored.baselineTierKey,
    matchGradeRole: role,
    matchGradeUsedFallback: fallback.used,
    matchGradeFallback: fallback,
    matchGradeOutcomeScore: scored.outcomeScore ?? null,
    matchGradeRoleScore: scored.roleScore ?? null,
  }
}

export function computeMatchPerformanceGrade(params: {
  row: StoredMatchGradeRow
  playerTier: RankTier | null
  displaySeasonId?: number
}): MatchPerformanceGradeFields {
  if (MATCH_GRADE_RUNTIME_VERSION === 'v3-direct') {
    return computeV3MatchPerformanceGrade(params)
  }

  const legacy = computeLegacyMatchPerformanceGrade(params)
  if (legacy.matchGrade == null || legacy.matchGradeScore == null) return legacy
  if (params.row.gameMode != null && !isGradeSupportedMode(params.row.gameMode)) return legacy

  const playerTierKey = params.playerTier ? rankTierToGradeBaselineKey(params.playerTier) : null
  const input = storedMatchRowToGradeInput(params.row)
  const weaponTypeId = input?.weaponTypeId ?? null
  const role =
    playerTierKey && weaponTypeId != null && weaponTypeId > 0
      ? lookupCharacterWeaponRole(params.row.characterNum, weaponTypeId)
      : null
  if (!playerTierKey || !role) return legacy

  const p4 = computeP4MatchGrade({
    row: params.row,
    playerTierKey,
    role,
    roleScore: legacy.matchGradeRoleScore,
    displaySeasonId: params.displaySeasonId ?? CURRENT_DISPLAY_SEASON,
  })
  if (!p4) return legacy

  return {
    ...legacy,
    matchGrade: p4.grade,
    matchGradeScore: p4.score,
  }
}

export function computeLegacyMatchPerformanceGradeForCalibration(params: {
  row: StoredMatchGradeRow
  playerTier: RankTier | null
  displaySeasonId?: number
}): MatchPerformanceGradeFields {
  return computeLegacyMatchPerformanceGrade(params)
}

function emptyGrade(status: CharacterGradeStatus, sampleSize = 0): CharacterGradeFields {
  return {
    grade: null,
    gradeScore: null,
    gradeStatus: status,
    gradeConfidence: sampleSize > 0 ? resolveGradeConfidence(sampleSize) : null,
    gradeSampleSize: sampleSize,
    gradeBaselineTierKey: null,
    gradeRole: null,
    gradeUsedFallback: false,
    gradeFallback: emptyFallbackMetadata(),
    gradeFallbackMetricCount: 0,
  }
}

function countGradeFallbackMetrics(meta: NormalizationMeta): number {
  return meta.tierOnlyMetricCount + meta.alternateEliteMetricCount
}

function usedNormalizationFallback(meta: NormalizationMeta): boolean {
  return countGradeFallbackMetrics(meta) > 0
}

export function computeWeaponGroupScore(
  stats: WeaponGroupStats,
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
  matches: MatchGradeInput[] = [],
  displaySeasonId: number = CURRENT_DISPLAY_SEASON,
): WeaponGroupScoreResult & {
  mode?: GradeRoleMetricMode
  fallbackReason?: GradeRoleMetricFallbackReason
  coverage?: number | null
  baselineReadiness?: CharacterGradeFields['gradeRoleMetricBaselineReadiness']
  combatMode?: GradeCombatMetricMode
  combatFallbackReason?: GradeCombatMetricFallbackReason
  combatCoverage?: number | null
  combatBaselineReadiness?: CharacterGradeFields['gradeCombatMetricBaselineReadiness']
  combatPresetComplete?: boolean
  combatMissingMetrics?: string[]
  combatEffectiveWeightTotal?: number | null
} {
  if (MATCH_GRADE_RUNTIME_VERSION === 'v3-direct' && matches.length > 0) {
    const v3Entries = matches
      .map((match) =>
        computeMatchGradeV3FromInput({
          characterNum: stats.characterNum,
          input: match,
          playerTierKey,
          role,
        }),
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    const rawScore = weightedScore(v3Entries.map((entry) => ({ score: entry.score, weight: 1 })))
    const roleScore = weightedScore(v3Entries.map((entry) => ({ score: entry.roleScore, weight: 1 })))
    if (rawScore != null && roleScore != null) {
      const fallbackCount = v3Entries.filter(
        (entry) => entry.roleScoreDetail.baselineLevel !== 'exact',
      ).length
      return {
        rawScore,
        roleScore,
        outcomeScore: null,
        baselineTierKey: playerTierKey,
        usedFallback: fallbackCount > 0,
        normalizationMeta: createNormalizationMeta(),
        gradeFallbackMetricCount: fallbackCount,
        fallbackReason: null,
        coverage: v3Entries.length / Math.max(matches.length, 1),
        baselineReadiness: 'ready',
        combatMode: 'role-score-v3',
        combatFallbackReason: null,
        combatCoverage: v3Entries.length / Math.max(matches.length, 1),
        combatBaselineReadiness: 'ready',
        combatPresetComplete: v3Entries.every((entry) => entry.roleScoreDetail.missingMetrics.length === 0),
        combatMissingMetrics: [
          ...new Set(v3Entries.flatMap((entry) => entry.roleScoreDetail.missingMetrics)),
        ],
        combatEffectiveWeightTotal:
          v3Entries.reduce((sum, entry) => sum + entry.roleScoreDetail.effectiveWeight, 0) /
          v3Entries.length,
      }
    }
  }

  const legacy = computeLegacyWeaponGroupScore(stats, role, playerTierKey)
  const legacyFallback = (): WeaponGroupScoreResult & {
    mode?: GradeRoleMetricMode
    fallbackReason?: GradeRoleMetricFallbackReason
    coverage?: number | null
    baselineReadiness?: CharacterGradeFields['gradeRoleMetricBaselineReadiness']
    combatMode?: GradeCombatMetricMode
    combatFallbackReason?: GradeCombatMetricFallbackReason
    combatCoverage?: number | null
    combatBaselineReadiness?: CharacterGradeFields['gradeCombatMetricBaselineReadiness']
    combatPresetComplete?: boolean
    combatMissingMetrics?: string[]
    combatEffectiveWeightTotal?: number | null
  } =>
    legacy ?? {
      rawScore: 0,
      baselineTierKey: playerTierKey,
      usedFallback: true,
      normalizationMeta: createNormalizationMeta(),
      gradeFallbackMetricCount: 0,
      mode: 'legacy',
      fallbackReason: null,
      coverage: null,
      baselineReadiness: null,
      combatMode: 'legacy-k-a-tk',
      combatFallbackReason: null,
      combatCoverage: null,
      combatBaselineReadiness: null,
      combatPresetComplete: false,
      combatMissingMetrics: [],
      combatEffectiveWeightTotal: null,
    }

  const roleScoreV2Entries = matches
    .map((match) => {
      const baseline = resolveTeamLuckRoleScoreBaseline({
        role,
        durationSeconds: match.gameDuration ?? null,
      })
      if (!baseline.baseline) return null
      const scored = computeTeamLuckRoleScore(
        {
          role,
          damageToPlayer: match.damageToPlayer,
          damageToPlayerPerMinute: perMinute(match.damageToPlayer, match.gameDuration ?? null),
          combatContribution: computeTeamLuckCombatContributionRatio({
            playerKill: match.kills,
            playerAssistant: match.assists,
            teamKill: match.teamKills,
          }),
          deathsPer10m: deathsPer10m(match.deaths, match.gameDuration ?? null),
          visionScore: match.visionScore,
          visionScorePerMinute: perMinute(match.visionScore, match.gameDuration ?? null),
          monsterKill: match.animalKills,
          monsterKillPerMinute: perMinute(match.animalKills, match.gameDuration ?? null),
        },
        baseline.baseline,
      )
      if (scored.score == null) return null
      return {
        score: scored.score,
        effectiveWeight: scored.effectiveWeight,
        missingMetrics: scored.missingMetrics,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)

  const roleScoreV2 = weightedScore(roleScoreV2Entries.map((entry) => ({
    score: entry.score,
    weight: 1,
  })))
  if (legacy && roleScoreV2 != null) {
    const rawScore = (legacy.outcomeScore ?? 0) * OUTCOME_SCORE_WEIGHT + roleScoreV2 * ROLE_SCORE_WEIGHT
    const missingMetrics = [...new Set(roleScoreV2Entries.flatMap((entry) => entry.missingMetrics))]
    return {
      ...legacy,
      rawScore,
      roleScore: roleScoreV2,
      combatMode: 'role-score-v2',
      combatFallbackReason: null,
      combatCoverage: roleScoreV2Entries.length / Math.max(matches.length, 1),
      combatBaselineReadiness: 'ready',
      combatPresetComplete: missingMetrics.length === 0,
      combatMissingMetrics: missingMetrics,
      combatEffectiveWeightTotal:
        roleScoreV2Entries.length > 0
          ? roleScoreV2Entries.reduce((sum, entry) => sum + entry.effectiveWeight, 0) /
            roleScoreV2Entries.length
          : null,
    }
  }

  let roleMetricResult:
    | (WeaponGroupScoreResult & {
        mode?: GradeRoleMetricMode
        fallbackReason?: GradeRoleMetricFallbackReason
        coverage?: number | null
        baselineReadiness?: CharacterGradeFields['gradeRoleMetricBaselineReadiness']
      })
    | null = null

  if (matches.length > 0 && (role === '탱커' || role === '서포터')) {
    roleMetricResult = computeWeaponGroupScoreWithLiveRoleMetrics({
      stats,
      matches,
      role,
      playerTierKey,
      displaySeasonId,
      legacyScore: legacy,
    })
    if (
      roleMetricResult.mode != null &&
      H_PRIORITY_ROLE_METRIC_MODES.includes(roleMetricResult.mode)
    ) {
      return {
        ...roleMetricResult,
        combatMode: 'legacy-k-a-tk',
        combatFallbackReason: null,
        combatCoverage: null,
        combatBaselineReadiness: null,
        combatPresetComplete: false,
        combatMissingMetrics: [],
        combatEffectiveWeightTotal: null,
      }
    }
  }

  const combatResult = computeWeaponGroupScoreWithCombatContribution({
    stats,
    matches,
    role,
    playerTierKey,
    displaySeasonId,
    legacyScore: legacy,
  })

  if (combatResult.mode !== 'legacy-k-a-tk') {
    return {
      ...combatResult,
      mode: roleMetricResult?.mode ?? 'legacy',
      fallbackReason: roleMetricResult?.fallbackReason ?? null,
      coverage: roleMetricResult?.coverage ?? null,
      baselineReadiness: roleMetricResult?.baselineReadiness ?? null,
      combatMode: combatResult.mode,
      combatFallbackReason: combatResult.fallbackReason,
      combatCoverage: combatResult.coverage,
      combatBaselineReadiness: combatResult.baselineReadiness,
      combatPresetComplete: combatResult.presetComplete ?? true,
      combatMissingMetrics: combatResult.missingPresetMetrics ?? [],
      combatEffectiveWeightTotal: combatResult.effectivePresetWeightTotal ?? 100,
    }
  }

  const fallback = legacyFallback()
  return {
    ...fallback,
    mode: roleMetricResult?.mode ?? fallback.mode ?? 'legacy',
    fallbackReason: roleMetricResult?.fallbackReason ?? fallback.fallbackReason ?? null,
    coverage: roleMetricResult?.coverage ?? fallback.coverage ?? null,
    baselineReadiness: roleMetricResult?.baselineReadiness ?? fallback.baselineReadiness ?? null,
    combatMode: 'legacy-k-a-tk',
    combatFallbackReason: combatResult.fallbackReason,
    combatCoverage: combatResult.coverage,
    combatBaselineReadiness: combatResult.baselineReadiness,
    combatPresetComplete: combatResult.presetComplete ?? false,
    combatMissingMetrics: combatResult.missingPresetMetrics ?? [],
    combatEffectiveWeightTotal: combatResult.effectivePresetWeightTotal ?? null,
  }
}

function computeLegacyWeaponGroupScore(
  stats: WeaponGroupStats,
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
): WeaponGroupScoreResult | null {
  const baseline = lookupBaselineForCombination(
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  if (!baseline) return null

  const meta = createNormalizationMeta()

  const outcomeEntries = OUTCOME_METRIC_DEFINITIONS.map((definition) => {
    const playerValue = definition.readPlayer(stats)
    const tierValue = definition.readBaseline(baseline.metrics)
    if (playerValue == null || tierValue == null) return null
    const eliteCandidates = lookupEliteCandidatesForMetric(
      playerTierKey,
      stats.characterNum,
      stats.weaponTypeId,
      (metrics) => definition.readBaseline(metrics),
    )
    const normalized = robustNormalizeMetricScore({
      playerValue,
      tierValue,
      eliteCandidates,
      higherBetter: definition.higherBetter,
      metricKey: definition.tierOnlyKey,
    })
    recordNormalizationMode(meta, normalized.mode)
    if (normalized.score == null) return null
    return { score: normalized.score, weight: definition.weight }
  }).filter((entry): entry is { score: number; weight: number } => entry != null)

  const outcomeScore = weightedScore(outcomeEntries)
  if (outcomeScore == null) return null

  const roleWeights = ROLE_PRESET_WEIGHTS[role]
  const roleEntries = ROLE_METRIC_DEFINITIONS.map((definition) => {
    const weight = roleWeights[definition.weightKey]
    const playerValue = definition.readPlayer(stats)
    const tierValue = definition.readBaseline(baseline.metrics)
    if (playerValue == null || tierValue == null) return null
    const eliteCandidates = lookupEliteCandidatesForMetric(
      playerTierKey,
      stats.characterNum,
      stats.weaponTypeId,
      (metrics) => definition.readBaseline(metrics),
    )
    const normalized = robustNormalizeMetricScore({
      playerValue,
      tierValue,
      eliteCandidates,
      higherBetter: definition.higherBetter,
      metricKey: definition.tierOnlyKey,
    })
    recordNormalizationMode(meta, normalized.mode)
    if (normalized.score == null) return null
    return { score: normalized.score, weight }
  }).filter((entry): entry is { score: number; weight: number } => entry != null)

  const roleScore = weightedScore(roleEntries)
  if (roleScore == null) return null

  return {
    rawScore: outcomeScore * OUTCOME_SCORE_WEIGHT + roleScore * ROLE_SCORE_WEIGHT,
    baselineTierKey: baseline.tierKey,
    usedFallback: baseline.usedFallback || usedNormalizationFallback(meta),
    normalizationMeta: meta,
    gradeFallbackMetricCount: countGradeFallbackMetrics(meta),
    outcomeScore,
    roleScore,
  }
}

/** 39.11K audit — live 경로 변경 없이 legacy-only 점수 조회 */
export function computeLegacyWeaponGroupScoreForAudit(
  stats: WeaponGroupStats,
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
): WeaponGroupScoreResult | null {
  return computeLegacyWeaponGroupScore(stats, role, playerTierKey)
}

function computeCharacterGrade(
  characterNum: number,
  matches: MatchGradeInput[],
  playerTierKey: GradeBaselineTierKey,
  displaySeasonId: number = CURRENT_DISPLAY_SEASON,
): CharacterGradeFields {
  if (
    AGGREGATE_GRADE_RUNTIME_VERSION === 'v2-k5-calibrated' ||
    AGGREGATE_GRADE_RUNTIME_VERSION === 'v3-shared-fine-cuts' ||
    AGGREGATE_GRADE_RUNTIME_VERSION === 'v4-shared-fine-cuts-k1'
  ) {
    const validSampleSize = matches.filter((match) => {
      const weaponTypeId = match.weaponTypeId
      return weaponTypeId != null && weaponTypeId > 0 && lookupCharacterWeaponRole(characterNum, weaponTypeId)
    }).length
    if (validSampleSize < MIN_GRADE_SAMPLE_GAMES) {
      return emptyGrade('insufficient-sample', validSampleSize)
    }

    const entries: Array<{ score: number; role: CharacterGradeRole | null }> = []
    const roleCounts = new Map<CharacterGradeRole, number>()
    let usedFallback = false
    let fallbackMetricCount = 0
    let combatEffectiveWeightSum = 0
    let combatEffectiveWeightCount = 0
    const missingMetrics = new Set<string>()

    for (const match of matches) {
      const weaponTypeId = match.weaponTypeId
      if (weaponTypeId == null || weaponTypeId <= 0) continue
      const role = lookupCharacterWeaponRole(characterNum, weaponTypeId)
      if (!role) continue
      const v3 = computeMatchGradeV3FromInput({
        characterNum,
        input: match,
        playerTierKey,
        role,
      })
      if (!v3) continue
      entries.push({ score: v3.score, role })
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1)
      usedFallback = usedFallback || v3.roleScoreDetail.baselineLevel !== 'exact'
      if (v3.roleScoreDetail.baselineLevel !== 'exact') fallbackMetricCount += 1
      for (const metric of v3.roleScoreDetail.missingMetrics) missingMetrics.add(metric)
      if (Number.isFinite(v3.roleScoreDetail.effectiveWeight)) {
        combatEffectiveWeightSum += v3.roleScoreDetail.effectiveWeight
        combatEffectiveWeightCount += 1
      }
    }

    if (entries.length < MIN_GRADE_SAMPLE_GAMES) {
      return emptyGrade('insufficient-sample', entries.length)
    }

    const aggregate = computeCharacterAggregateGradeV2({ entries })
    if (aggregate.adjustedScore == null || aggregate.grade == null) {
      return emptyGrade('missing-baseline', entries.length)
    }
    const primaryRole =
      [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? aggregate.roles[0] ?? null
    if (!primaryRole) return emptyGrade('missing-baseline', entries.length)

    return {
      grade: aggregate.grade,
      gradeScore: aggregate.adjustedScore,
      gradeStatus: 'ok',
      gradeConfidence: resolveGradeConfidence(entries.length),
      gradeSampleSize: entries.length,
      gradeBaselineTierKey: playerTierKey,
      gradeRole: primaryRole,
      gradeUsedFallback: usedFallback,
      gradeFallback: {
        used: usedFallback,
        baselineLevel: usedFallback ? 'tier-neighbor' : 'exact',
        normalization: 'tier-only',
        combat: 'live-metric',
        reasons: usedFallback ? [`${CHARACTER_AGGREGATE_GRADE_VERSION}:fallback-baseline`] : [],
      },
      gradeFallbackMetricCount: fallbackMetricCount,
      gradeRoleMetricMode: undefined,
      gradeRoleMetricFallbackReason: null,
      gradeRoleMetricCoverage: entries.length / Math.max(validSampleSize, 1),
      gradeRoleMetricBaselineReadiness: 'ready',
      gradeCombatMetricMode: 'role-score-v3',
      gradeCombatMetricFallbackReason: null,
      gradeCombatMetricCoverage: entries.length / Math.max(validSampleSize, 1),
      gradeCombatMetricBaselineReadiness: 'ready',
      gradeCombatPresetComplete: missingMetrics.size === 0,
      gradeCombatMissingMetrics: [...missingMetrics],
      gradeCombatEffectiveWeightTotal:
        combatEffectiveWeightCount > 0 ? combatEffectiveWeightSum / combatEffectiveWeightCount : null,
      gradeAggregation: aggregate.aggregation,
    }
  }

  const weaponGroups = new Map<number, MatchGradeInput[]>()
  for (const match of matches) {
    const weaponTypeId = match.weaponTypeId
    if (weaponTypeId == null || weaponTypeId <= 0) continue
    const bucket = weaponGroups.get(weaponTypeId) ?? []
    bucket.push(match)
    weaponGroups.set(weaponTypeId, bucket)
  }

  const validSampleSize = [...weaponGroups.values()].reduce((sum, group) => sum + group.length, 0)
  if (validSampleSize < MIN_GRADE_SAMPLE_GAMES) {
    return emptyGrade('insufficient-sample', validSampleSize)
  }

  const scoredGroups: Array<{
    rawScore: number
    matchCount: number
    baselineTierKey: GradeBaselineTierKey
    role: CharacterGradeRole
    usedFallback: boolean
    normalizationMeta: NormalizationMeta
    gradeFallbackMetricCount: number
    mode: GradeRoleMetricMode
    fallbackReason: GradeRoleMetricFallbackReason
    coverage: number | null
    baselineReadiness: CharacterGradeFields['gradeRoleMetricBaselineReadiness']
    combatMode: GradeCombatMetricMode
    combatFallbackReason: GradeCombatMetricFallbackReason
    combatCoverage: number | null
    combatBaselineReadiness: CharacterGradeFields['gradeCombatMetricBaselineReadiness']
    combatPresetComplete: boolean
    combatMissingMetrics: string[]
    combatEffectiveWeightTotal: number | null
  }> = []

  for (const [weaponTypeId, groupMatches] of weaponGroups) {
    const role = lookupCharacterWeaponRole(characterNum, weaponTypeId)
    if (!role) continue
    const stats = aggregateWeaponGroupStats(characterNum, weaponTypeId, groupMatches)
    if (!stats) continue
    const scored = computeWeaponGroupScore(stats, role, playerTierKey, groupMatches, displaySeasonId)
    if (!scored) continue
    scoredGroups.push({
      rawScore: scored.rawScore,
      matchCount: stats.matchCount,
      baselineTierKey: scored.baselineTierKey,
      role,
      usedFallback: scored.usedFallback,
      normalizationMeta: scored.normalizationMeta,
      gradeFallbackMetricCount: scored.gradeFallbackMetricCount,
      mode: scored.mode ?? 'legacy',
      fallbackReason: scored.fallbackReason ?? null,
      coverage: scored.coverage ?? null,
      baselineReadiness: scored.baselineReadiness ?? null,
      combatMode: scored.combatMode ?? 'legacy-k-a-tk',
      combatFallbackReason: scored.combatFallbackReason ?? null,
      combatCoverage: scored.combatCoverage ?? null,
      combatBaselineReadiness: scored.combatBaselineReadiness ?? null,
      combatPresetComplete: scored.combatPresetComplete ?? false,
      combatMissingMetrics: scored.combatMissingMetrics ?? [],
      combatEffectiveWeightTotal: scored.combatEffectiveWeightTotal ?? null,
    })
  }

  if (scoredGroups.length === 0) {
    return emptyGrade('missing-baseline', validSampleSize)
  }

  const rawScore = weightedScore(
    scoredGroups.map((group) => ({ score: group.rawScore, weight: group.matchCount })),
  )
  if (rawScore == null) {
    return emptyGrade('missing-baseline', validSampleSize)
  }

  const finalScore = applySampleConfidence(rawScore, validSampleSize)
  const primaryGroup = scoredGroups.reduce((best, current) =>
    current.matchCount > best.matchCount ? current : best,
  )
  const fallback = buildGradeFallbackMetadata({
    scored: {
      rawScore: primaryGroup.rawScore,
      baselineTierKey: primaryGroup.baselineTierKey,
      usedFallback: primaryGroup.usedFallback,
      normalizationMeta: primaryGroup.normalizationMeta,
      gradeFallbackMetricCount: primaryGroup.gradeFallbackMetricCount,
    },
    requestedTierKey: playerTierKey,
    combatMode: primaryGroup.combatMode,
    combatFallbackReason: primaryGroup.combatFallbackReason,
  })

  return {
    grade: scoreToFineGrade(finalScore),
    gradeScore: Math.round(finalScore * 100) / 100,
    gradeStatus: 'ok',
    gradeConfidence: resolveGradeConfidence(validSampleSize),
    gradeSampleSize: validSampleSize,
    gradeBaselineTierKey: primaryGroup.baselineTierKey,
    gradeRole: primaryGroup.role,
    gradeUsedFallback: scoredGroups.some((group) => group.usedFallback) || fallback.used,
    gradeFallback: fallback,
    gradeFallbackMetricCount: scoredGroups.reduce(
      (sum, group) => sum + group.gradeFallbackMetricCount,
      0,
    ),
    gradeRoleMetricMode: primaryGroup.mode,
    gradeRoleMetricFallbackReason: primaryGroup.fallbackReason,
    gradeRoleMetricCoverage: primaryGroup.coverage,
    gradeRoleMetricBaselineReadiness: primaryGroup.baselineReadiness,
    gradeCombatMetricMode: primaryGroup.combatMode,
    gradeCombatMetricFallbackReason: primaryGroup.combatFallbackReason,
    gradeCombatMetricCoverage: primaryGroup.combatCoverage,
    gradeCombatMetricBaselineReadiness: primaryGroup.combatBaselineReadiness,
    gradeCombatPresetComplete: primaryGroup.combatPresetComplete,
    gradeCombatMissingMetrics: primaryGroup.combatMissingMetrics,
    gradeCombatEffectiveWeightTotal: primaryGroup.combatEffectiveWeightTotal,
  }
}

export function applyCharacterPerformanceGrades(params: {
  rows: PlayerMatchRow[]
  characterStats: SeasonCharacterAggregateContract[]
  metaStatus: PlayerMatchCharacterStatsMetaStatus
  playerTier: RankTier | null
}): SeasonCharacterAggregateContract[] {
  if (params.metaStatus !== 'complete') {
    return params.characterStats.map((row) => ({
      ...row,
      ...emptyGrade('partial-data', row.games),
    }))
  }

  const playerTierKey = params.playerTier ? rankTierToGradeBaselineKey(params.playerTier) : null
  if (!playerTierKey) {
    return params.characterStats.map((row) => ({
      ...row,
      ...emptyGrade('missing-baseline', row.games),
    }))
  }

  const matchesByCharacter = new Map<number, MatchGradeInput[]>()
  for (const row of params.rows) {
    if (!isGradeSupportedMode(row.gameMode)) continue
    const input = playerMatchRowToGradeInput(row)
    if (!input) continue
    const bucket = matchesByCharacter.get(row.characterNum) ?? []
    bucket.push(input)
    matchesByCharacter.set(row.characterNum, bucket)
  }

  return params.characterStats.map((stat) => {
    const characterMatches = matchesByCharacter.get(stat.characterNum) ?? []
    const grade = computeCharacterGrade(stat.characterNum, characterMatches, playerTierKey, CURRENT_DISPLAY_SEASON)
    return {
      ...stat,
      ...grade,
    }
  })
}
