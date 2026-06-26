import fallbackBaselineDoc from '../../data/roleScore/role-score-fallback-baselines.v1.json' with { type: 'json' }
import durationAdjustmentDoc from '../../data/roleScore/role-score-duration-adjustments.v1.json' with { type: 'json' }
import placementEffectDoc from '../../data/roleScore/team-flow-role-placement-effects.v1.json' with { type: 'json' }

import {
  lookupBaselineMetricsAtTier,
  type BaselineMetrics,
} from '../characterPerformanceGrade/baselineStore.js'
import type {
  CharacterFineGrade,
  CharacterGradeRole,
  GradeBaselineTierKey,
} from '../characterPerformanceGrade/config.js'
import { scoreToFineGrade } from '../characterPerformanceGrade/config.js'
import { clamp, computeRelativePerformance } from '../characterPerformanceGrade/metrics.js'

import {
  computeCombatContributionRatio,
  durationBucket,
  TEAM_LUCK_ROLE_SCORE_WEIGHTS,
  type TeamLuckRoleScoreMetric,
} from './teamLuckRoleScore.js'
import {
  DAMAGE_TIME_GLOBAL_VERSION,
  resolveDamageTimeGlobalMultiplier,
  type DamageTimeMultiplierResult,
} from './damageTimeGlobal.js'
import {
  ASYMMETRIC_METRIC_ADJUSTMENT_VERSION,
  asymmetricMetricAdjustment,
  type AsymmetricMetricAdjustmentPolicy,
} from './asymmetricMetricAdjustment.js'

export const ROLE_SCORE_V3_VERSION = 'role-score.v3'
export const ROLE_SCORE_V3_FALLBACK_BASELINE_VERSION = fallbackBaselineDoc.baselineVersion
export const ROLE_SCORE_V3_DURATION_ADJUSTMENT_VERSION = durationAdjustmentDoc.adjustmentVersion
export const ROLE_SCORE_V3_DAMAGE_TIME_GLOBAL_VERSION = DAMAGE_TIME_GLOBAL_VERSION
export const ROLE_SCORE_V3_METRIC_ADJUSTMENT_VERSION = ASYMMETRIC_METRIC_ADJUSTMENT_VERSION
export const TEAM_FLOW_PLACEMENT_EFFECT_VERSION = placementEffectDoc.effectVersion
export const PLACEMENT_ADJUSTMENT_VERSION = 'placement-adjustment.v2'
export const MATCH_GRADE_DIRECT_VERSION = 'match-grade-direct.v2'
export const TEAM_LUCK_DIRECT_VERSION = 'team-luck-direct.v1'

export const BASE_PLACEMENT_ADJUSTMENT: Readonly<Record<number, number>> = {
  1: 6,
  2: 4,
  3: 2,
  4: 1,
  5: -1,
  6: -2,
  7: -4,
  8: -6,
}

const TOP_EXCELLENCE_BONUS: Readonly<Record<number, number>> = {
  1: 2,
  2: 1.5,
  3: 1,
}

type BaselineRecord = {
  count: number
  means: BaselineMetrics
}

type BaselineFallbackLevel = 'exact' | 'tier-character' | 'tier-role' | 'tier-overall'
type DurationMetric = 'damageToPlayer' | 'viewContribution' | 'monsterKill' | 'deaths'

export interface RoleScoreV3Input {
  tierKey: GradeBaselineTierKey
  characterNum: number
  weaponTypeId: number | null | undefined
  role: CharacterGradeRole
  applyMetricAdjustment?: boolean
  placement?: number | null
  durationSeconds?: number | null
  damageToPlayer?: number | null
  kills?: number | null
  assists?: number | null
  teamKills?: number | null
  deaths?: number | null
  visionScore?: number | null
  monsterKill?: number | null
}

export interface RoleScoreV3MetricDetail {
  metric: TeamLuckRoleScoreMetric
  score: number
  rawMetricScore: number
  adjustedMetricScore: number
  adjustmentPolicy: AsymmetricMetricAdjustmentPolicy
  weight: number
  contribution: number
  rawContribution: number
  actual: number
  expected: number
  ratio: number | null
  metricPresetVersion: typeof ASYMMETRIC_METRIC_ADJUSTMENT_VERSION
}

export interface RoleScoreV3Result {
  score: number | null
  baselineLevel: BaselineFallbackLevel | null
  baselineSampleCount: number | null
  durationBucket: string
  durationFallbackLevel: 'role-duration' | 'role-global' | 'global' | null
  metricScores: Partial<Record<TeamLuckRoleScoreMetric, number>>
  metricDetails: RoleScoreV3MetricDetail[]
  missingMetrics: TeamLuckRoleScoreMetric[]
  effectiveWeight: number
  expectedMetrics: {
    damageToPlayer: number | null
    combatContribution: number | null
    deaths: number | null
    viewContribution: number | null
    monsterKill: number | null
  }
  damageTime?: DamageTimeMultiplierResult
}

export interface MatchGradeV3Result {
  roleScore: number
  placementAdjustment: number
  score: number
  grade: CharacterFineGrade
  roleScoreDetail: RoleScoreV3Result
}

export interface AdjustedContributionV3Result {
  roleScore: number
  adjustedContribution: number
  placementEffect: number
  placementEffectSampleCount: number | null
  placementEffectFallbackLevel: 'role-placement' | 'role-global' | 'global'
  roleScoreDetail: RoleScoreV3Result
}

const tierCharacterBaselines = fallbackBaselineDoc.tierCharacter as Record<string, BaselineRecord>
const tierRoleBaselines = fallbackBaselineDoc.tierRole as Record<string, BaselineRecord>
const tierOverallBaselines = fallbackBaselineDoc.tierOverall as Record<string, BaselineRecord>
const roleDurationMultipliers = durationAdjustmentDoc.roleDuration as Record<string, DurationRecord>
const roleGlobalMultipliers = durationAdjustmentDoc.roleGlobal as Record<string, DurationRecord>
const globalMultipliers = durationAdjustmentDoc.global as DurationRecord
const rolePlacementEffects = placementEffectDoc.rolePlacement as Record<string, PlacementEffectRecord>
const roleGlobalEffects = placementEffectDoc.roleGlobal as Record<string, PlacementEffectRecord>
const globalEffect = placementEffectDoc.global as PlacementEffectRecord

interface DurationRecord {
  sampleCount: number
  multipliers: Record<DurationMetric, number>
}

interface PlacementEffectRecord {
  sampleCount: number
  meanRoleScore: number
  effect?: number
}

function round(value: number, digits = 4): number {
  return Math.round(value * 10 ** digits) / 10 ** digits
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function weightedMean(entries: Array<{ score: number | null; weight: number }>): {
  score: number | null
  effectiveWeight: number
} {
  let weighted = 0
  let effectiveWeight = 0
  for (const entry of entries) {
    if (entry.score == null || !Number.isFinite(entry.score) || entry.weight <= 0) continue
    weighted += entry.score * entry.weight
    effectiveWeight += entry.weight
  }
  return {
    score: effectiveWeight > 0 ? round(weighted / effectiveWeight) : null,
    effectiveWeight,
  }
}

function normalizeMetricScore(params: {
  actual: number | null | undefined
  expected: number | null | undefined
  higherBetter: boolean
}): number | null {
  if (!isFiniteNumber(params.actual) || !isFiniteNumber(params.expected)) return null
  const relative = computeRelativePerformance(params.actual, params.expected, params.higherBetter)
  if (relative == null || !Number.isFinite(relative)) return null
  return round(clamp(65 + 45 * relative, 20, 100))
}

function combatBaseline(metrics: BaselineMetrics): number | null {
  return computeCombatContributionRatio({
    playerKill: metrics.averagePlayerKill,
    playerAssistant: metrics.averagePlayerAssistant,
    teamKill: metrics.averageTeamKill,
  })
}

function findBaseline(params: RoleScoreV3Input): {
  level: BaselineFallbackLevel | null
  metrics: BaselineMetrics | null
  count: number | null
} {
  if (params.weaponTypeId != null && params.weaponTypeId > 0) {
    const exact = lookupBaselineMetricsAtTier(params.tierKey, params.characterNum, params.weaponTypeId)
    if (exact) return { level: 'exact', metrics: exact, count: exact.count }
  }

  const tierCharacter = tierCharacterBaselines[`${params.tierKey}:${params.characterNum}`]
  if (tierCharacter) {
    return { level: 'tier-character', metrics: tierCharacter.means, count: tierCharacter.count }
  }

  const tierRole = tierRoleBaselines[`${params.tierKey}:${params.role}`]
  if (tierRole) {
    return { level: 'tier-role', metrics: tierRole.means, count: tierRole.count }
  }

  const tierOverall = tierOverallBaselines[params.tierKey]
  if (tierOverall) {
    return { level: 'tier-overall', metrics: tierOverall.means, count: tierOverall.count }
  }

  return { level: null, metrics: null, count: null }
}

function resolveDurationRecord(role: CharacterGradeRole, seconds: number | null | undefined): {
  bucket: string
  record: DurationRecord
  fallbackLevel: RoleScoreV3Result['durationFallbackLevel']
} {
  const bucket = durationBucket(seconds)
  const roleDuration =
    bucket !== 'unknown-duration' ? roleDurationMultipliers[`role:${role}|duration:${bucket}`] : null
  if (roleDuration) return { bucket, record: roleDuration, fallbackLevel: 'role-duration' }

  const roleGlobal = roleGlobalMultipliers[`role:${role}`]
  if (roleGlobal) return { bucket, record: roleGlobal, fallbackLevel: 'role-global' }

  return { bucket, record: globalMultipliers, fallbackLevel: 'global' }
}

function applyDurationMultiplier(
  value: number,
  metric: DurationMetric,
  record: DurationRecord,
  seconds: number | null | undefined,
  bucket: string,
): number {
  return round(value * (record.multipliers[metric] ?? 1) * durationWithinBucketScalar(seconds, bucket))
}

function durationMetricMultiplier(
  metric: DurationMetric,
  record: DurationRecord,
  seconds: number | null | undefined,
  bucket: string,
): number {
  return round((record.multipliers[metric] ?? 1) * durationWithinBucketScalar(seconds, bucket), 6)
}

function durationWithinBucketScalar(seconds: number | null | undefined, bucket: string): number {
  if (!isFiniteNumber(seconds) || seconds <= 0) return 1
  const midpointByBucket: Record<string, number> = {
    'duration-lt-15m': 750,
    'duration-15-20m': 1050,
    'duration-20-25m': 1350,
    'duration-25-30m': 1650,
    'duration-30m-plus': 1950,
  }
  const midpoint = midpointByBucket[bucket]
  return midpoint ? clamp(seconds / midpoint, 0.75, 1.25) : 1
}

export function roleScoreV3BasePlacementAdjustment(placement: number | null | undefined): number | null {
  return isFiniteNumber(placement) ? (BASE_PLACEMENT_ADJUSTMENT[placement] ?? null) : null
}

export function roleScoreV3PlacementAdjustment(params: {
  placement: number | null | undefined
  roleScore: number | null | undefined
}): number | null {
  const baseAdjustment = roleScoreV3BasePlacementAdjustment(params.placement)
  if (baseAdjustment == null || !isFiniteNumber(params.roleScore)) return null

  if (baseAdjustment > 0) {
    const topGate = clamp((params.roleScore - 45) / 20, 0, 1)
    const positiveFactor = 0.2 + 0.8 * topGate
    const excellenceFactor = clamp((params.roleScore - 75) / 15, 0, 1)
    const excellenceBonus =
      (TOP_EXCELLENCE_BONUS[params.placement ?? 0] ?? 0) * excellenceFactor
    return round(baseAdjustment * positiveFactor + excellenceBonus, 4)
  }

  if (baseAdjustment < 0) {
    const strongPerformance = clamp((params.roleScore - 60) / 25, 0, 1)
    const negativeFactor = 1 - 0.75 * strongPerformance
    return round(baseAdjustment * negativeFactor, 4)
  }

  return 0
}

export function computeRoleScoreV3(input: RoleScoreV3Input): RoleScoreV3Result {
  const baseline = findBaseline(input)
  const duration = resolveDurationRecord(input.role, input.durationSeconds)
  const applyMetricAdjustment = input.applyMetricAdjustment !== false
  const missingMetrics: TeamLuckRoleScoreMetric[] = []
  const metricScores: Partial<Record<TeamLuckRoleScoreMetric, number>> = {}
  const metricDetails: RoleScoreV3MetricDetail[] = []
  const weights = TEAM_LUCK_ROLE_SCORE_WEIGHTS[input.role]

  if (!baseline.metrics) {
    return {
      score: null,
      baselineLevel: null,
      baselineSampleCount: null,
      durationBucket: duration.bucket,
      durationFallbackLevel: duration.fallbackLevel,
      metricScores,
      metricDetails,
      missingMetrics: Object.keys(weights) as TeamLuckRoleScoreMetric[],
      effectiveWeight: 0,
      expectedMetrics: {
        damageToPlayer: null,
        combatContribution: null,
        deaths: null,
        viewContribution: null,
        monsterKill: null,
      },
      damageTime: undefined,
    }
  }

  const legacyDamageMultiplier = durationMetricMultiplier(
    'damageToPlayer',
    duration.record,
    input.durationSeconds,
    duration.bucket,
  )
  const damageTime = resolveDamageTimeGlobalMultiplier({
    durationSeconds: input.durationSeconds,
    legacyMultiplier: legacyDamageMultiplier,
  })

  const expectedMetrics = {
    damageToPlayer: round(baseline.metrics.averageDamageToPlayer * damageTime.multiplier),
    combatContribution: combatBaseline(baseline.metrics),
    deaths: applyDurationMultiplier(
      baseline.metrics.averageDeaths,
      'deaths',
      duration.record,
      input.durationSeconds,
      duration.bucket,
    ),
    viewContribution: applyDurationMultiplier(
      baseline.metrics.averageViewContribution,
      'viewContribution',
      duration.record,
      input.durationSeconds,
      duration.bucket,
    ),
    monsterKill: applyDurationMultiplier(
      baseline.metrics.averageMonsterKill,
      'monsterKill',
      duration.record,
      input.durationSeconds,
      duration.bucket,
    ),
  }

  const actualMetrics = {
    damage: input.damageToPlayer ?? null,
    combatContribution: computeCombatContributionRatio({
      playerKill: input.kills ?? null,
      playerAssistant: input.assists ?? null,
      teamKill: input.teamKills ?? null,
    }),
    survival: input.deaths ?? null,
    vision: input.visionScore ?? null,
    monster: input.monsterKill ?? null,
  }

  const expectedByMetric = {
    damage: expectedMetrics.damageToPlayer,
    combatContribution: expectedMetrics.combatContribution,
    survival: expectedMetrics.deaths,
    vision: expectedMetrics.viewContribution,
    monster: expectedMetrics.monsterKill,
  }

  const entries = (Object.keys(weights) as TeamLuckRoleScoreMetric[]).map((metric) => {
    const score = normalizeMetricScore({
      actual: actualMetrics[metric],
      expected: expectedByMetric[metric],
      higherBetter: metric !== 'survival',
    })
    const adjusted =
      score == null
        ? null
        : applyMetricAdjustment
          ? asymmetricMetricAdjustment(score)
          : {
              rawMetricScore: round(score),
              adjustedMetricScore: round(score),
              adjustmentPolicy: 'unadjusted' as const,
              version: ASYMMETRIC_METRIC_ADJUSTMENT_VERSION,
            }
    if (score == null || adjusted == null) {
      missingMetrics.push(metric)
      return { score: null, weight: weights[metric] }
    }

    const expected = expectedByMetric[metric] ?? null
    const actual = actualMetrics[metric] ?? null
    const ratio =
      actual != null && expected != null && Number.isFinite(actual) && Number.isFinite(expected) && expected !== 0
        ? metric === 'survival'
          ? expected / actual
          : actual / expected
        : null

    metricScores[metric] = adjusted.adjustedMetricScore
    metricDetails.push({
      metric,
      score: adjusted.adjustedMetricScore,
      rawMetricScore: adjusted.rawMetricScore,
      adjustedMetricScore: adjusted.adjustedMetricScore,
      adjustmentPolicy: adjusted.adjustmentPolicy,
      weight: weights[metric],
      contribution: round((adjusted.adjustedMetricScore * weights[metric]) / 100),
      rawContribution: round((adjusted.rawMetricScore * weights[metric]) / 100),
      actual: actual ?? 0,
      expected: expected ?? 0,
      ratio: ratio == null || !Number.isFinite(ratio) ? null : round(ratio, 4),
      metricPresetVersion: ASYMMETRIC_METRIC_ADJUSTMENT_VERSION,
    })
    return { score: adjusted.adjustedMetricScore, weight: weights[metric] }
  })

  const result = weightedMean(entries)
  return {
    score: result.score,
    baselineLevel: baseline.level,
    baselineSampleCount: baseline.count,
    durationBucket: duration.bucket,
    durationFallbackLevel: duration.fallbackLevel,
    metricScores,
    metricDetails,
    missingMetrics,
    effectiveWeight: result.effectiveWeight,
    expectedMetrics,
    damageTime,
  }
}

export function computeMatchGradeV3(input: RoleScoreV3Input): MatchGradeV3Result | null {
  const roleScoreDetail = computeRoleScoreV3(input)
  if (roleScoreDetail.score == null) return null
  const placementAdjustment = roleScoreV3PlacementAdjustment({
    placement: input.placement,
    roleScore: roleScoreDetail.score,
  })
  if (placementAdjustment == null) return null

  const score = round(clamp(roleScoreDetail.score + placementAdjustment, 0, 100), 2)
  return {
    roleScore: roleScoreDetail.score,
    placementAdjustment,
    score,
    grade: scoreToFineGrade(score),
    roleScoreDetail,
  }
}

export function resolvePlacementEffectV3(params: {
  role: CharacterGradeRole
  placement: number | null | undefined
}): {
  effect: number
  sampleCount: number | null
  fallbackLevel: AdjustedContributionV3Result['placementEffectFallbackLevel']
} {
  if (isFiniteNumber(params.placement)) {
    const exact = rolePlacementEffects[`role:${params.role}|placement:${params.placement}`]
    if (exact && isFiniteNumber(exact.effect)) {
      return { effect: exact.effect, sampleCount: exact.sampleCount, fallbackLevel: 'role-placement' }
    }
  }

  const roleGlobal = roleGlobalEffects[`role:${params.role}`]
  if (roleGlobal) return { effect: 0, sampleCount: roleGlobal.sampleCount, fallbackLevel: 'role-global' }

  return { effect: 0, sampleCount: globalEffect.sampleCount, fallbackLevel: 'global' }
}

export function computeAdjustedContributionV3(input: RoleScoreV3Input): AdjustedContributionV3Result | null {
  const roleScoreDetail = computeRoleScoreV3({ ...input, applyMetricAdjustment: false })
  if (roleScoreDetail.score == null) return null
  const placementEffect = resolvePlacementEffectV3({
    role: input.role,
    placement: input.placement,
  })
  return {
    roleScore: roleScoreDetail.score,
    adjustedContribution: round(roleScoreDetail.score - placementEffect.effect, 4),
    placementEffect: placementEffect.effect,
    placementEffectSampleCount: placementEffect.sampleCount,
    placementEffectFallbackLevel: placementEffect.fallbackLevel,
    roleScoreDetail,
  }
}

export function teamFlowCenterV3(): number {
  return placementEffectDoc.center
}

export function teamFlowWeatherThresholdsV3(): {
  p10: number
  p30: number
  p70: number
  p90: number
} {
  return placementEffectDoc.weatherThresholds
}
