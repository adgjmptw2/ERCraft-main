import { createHash } from 'node:crypto'

import candidateDoc from '../../data/roleTimeCurve/role-time-curve.v1.1.candidate.json' with { type: 'json' }
import fallbackBaselineDoc from '../../data/roleScore/role-score-fallback-baselines.v1.json' with { type: 'json' }
import durationAdjustmentDoc from '../../data/roleScore/role-score-duration-adjustments.v1.json' with { type: 'json' }
import {
  lookupBaselineMetricsAtTier,
  lookupCharacterWeaponRole,
  type BaselineMetrics,
} from '../../services/characterPerformanceGrade/baselineStore.js'
import {
  FINE_GRADE_CUTS,
  scoreToFineGrade,
  type CharacterFineGrade,
  type CharacterGradeRole,
  type GradeBaselineTierKey,
} from '../../services/characterPerformanceGrade/config.js'
import { clamp, computeRelativePerformance } from '../../services/characterPerformanceGrade/metrics.js'
import { rankTierToGradeBaselineKey } from '../../services/characterPerformanceGrade/tierKey.js'
import {
  computeMatchGradeV3,
  roleScoreV3PlacementAdjustment,
  ROLE_SCORE_V3_DURATION_ADJUSTMENT_VERSION,
  ROLE_SCORE_V3_FALLBACK_BASELINE_VERSION,
  ROLE_SCORE_V3_VERSION,
  type MatchGradeV3Result,
  type RoleScoreV3Input,
} from '../../services/roleScore/roleScoreV3.js'
import {
  durationBucket,
  TEAM_LUCK_ROLE_SCORE_WEIGHTS,
  type TeamLuckRoleScoreMetric,
} from '../../services/roleScore/teamLuckRoleScore.js'
import { getRankTierFromRp } from '../../utils/rankTier.js'
import {
  type RoleTimeCurveRole,
  interpolateCurve,
  toCurveRole,
} from './roleTimeCurve.js'
import type { RoleTimeCurveCandidateV11 } from './roleTimeCurveV11.js'

export const DAMAGE_SHADOW_EVALUATION_VERSION = 'damage-shadow-evaluation.v1.1'

const candidate = candidateDoc as RoleTimeCurveCandidateV11
const tierCharacterBaselines = fallbackBaselineDoc.tierCharacter as Record<string, BaselineRecord>
const tierRoleBaselines = fallbackBaselineDoc.tierRole as Record<string, BaselineRecord>
const tierOverallBaselines = fallbackBaselineDoc.tierOverall as Record<string, BaselineRecord>
const roleDurationMultipliers = durationAdjustmentDoc.roleDuration as Record<string, DurationRecord>
const roleGlobalMultipliers = durationAdjustmentDoc.roleGlobal as Record<string, DurationRecord>
const globalMultipliers = durationAdjustmentDoc.global as DurationRecord

type ShadowPolicy = 'A_INTERPOLATE_25_30' | 'B_HOLD_25'
type BaselineFallbackLevel = 'exact' | 'tier-character' | 'tier-role' | 'tier-overall'
type DurationFallbackLevel = 'role-duration' | 'role-global' | 'global'
type CurveFallbackReason = 'under-8m' | 'over-30m' | 'missing-curve' | null

interface BaselineRecord {
  count: number
  means: BaselineMetrics
}

interface DurationRecord {
  sampleCount: number
  multipliers: Record<'damageToPlayer' | 'viewContribution' | 'monsterKill' | 'deaths', number>
}

export interface DamageShadowPlayerMatchRow {
  uid: string
  gameId: string
  apiSeasonId: number
  displaySeasonId: number
  gameMode: string
  playedAt: Date
  characterNum: number
  bestWeapon: number | null
  placement: number | null
  kills: number | null
  assists: number | null
  teamKills: number | null
  deaths: number | null
  victory: boolean | null
  rpAfter: number | null
  gameDuration: number | null
  damageToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
}

export interface CurveMultiplierResult {
  multiplier: number
  curveRole: RoleTimeCurveRole
  fallbackReason: CurveFallbackReason
  source: 'candidate' | 'old-duration-fallback'
  policy: ShadowPolicy
}

export interface DamageShadowRowResult {
  uidHash: string
  gameIdHash: string
  policy: ShadowPolicy
  tierKey: GradeBaselineTierKey
  role: CharacterGradeRole
  curveRole: RoleTimeCurveRole
  characterNum: number
  weaponTypeId: number
  placement: number
  victory: boolean
  durationSeconds: number
  durationBucket: string
  oldDurationFallbackLevel: DurationFallbackLevel
  oldBaselineLevel: BaselineFallbackLevel
  oldBaselineSampleCount: number
  curveFallbackReason: CurveFallbackReason
  oldExpectedDamage: number
  oldDamageRatio: number
  oldDamageScore: number
  oldWeightedContribution: number
  oldMatchScore: number
  oldMatchGrade: CharacterFineGrade
  oldRoleScore: number
  oldPlacementAdjustment: number
  curveMultiplier: number
  shadowExpectedDamage: number
  shadowDamageRatio: number
  shadowDamageScore: number
  shadowWeightedContribution: number
  shadowRoleScore: number
  shadowPlacementAdjustment: number
  shadowMatchScore: number
  shadowMatchGrade: CharacterFineGrade
  damageScoreDelta: number
  matchScoreDelta: number
  gradeStepDelta: number
}

export interface DamageShadowGroupStats {
  key: string
  sampleCount: number
  oldDamageRatio: Distribution
  shadowDamageRatio: Distribution
  damageScoreMeanDelta: number
  matchScoreMeanDelta: number
  gradeChange: {
    up: number
    same: number
    down: number
    upRate: number
    sameRate: number
    downRate: number
    onePlusStepChangeCount: number
  }
  maxChange: DamageShadowOutlier | null
  fallbackUseCount: number
}

export interface DamageShadowOutlier {
  uidHash: string
  gameIdHash: string
  policy: ShadowPolicy
  role: CharacterGradeRole
  curveRole: RoleTimeCurveRole
  tierKey: GradeBaselineTierKey
  characterNum: number
  weaponTypeId: number
  placement: number
  victory: boolean
  durationSeconds: number
  oldExpectedDamage: number
  shadowExpectedDamage: number
  curveMultiplier: number
  oldDamageRatio: number
  shadowDamageRatio: number
  oldDamageScore: number
  shadowDamageScore: number
  oldMatchScore: number
  shadowMatchScore: number
  oldMatchGrade: CharacterFineGrade
  shadowMatchGrade: CharacterFineGrade
  matchScoreDelta: number
  curveFallbackReason: CurveFallbackReason
}

export interface DamageShadowEvaluationReport {
  version: typeof DAMAGE_SHADOW_EVALUATION_VERSION
  generatedAt: string
  source: 'PlayerMatch'
  readOnly: true
  runtimeApplied: false
  candidateVersion: string
  productionVersions: {
    roleScore: string
    fallbackBaseline: string
    durationAdjustment: string
  }
  formulas: {
    shadowExpectedDamage: string
    note: string
  }
  sample: {
    totalRows: number
    rankRows: number
    evaluatedRows: number
    skipped: Record<string, number>
  }
  policies: Record<ShadowPolicy, PolicyEvaluation>
  multiplierComparison: MultiplierComparisonRow[]
  shortGameCheck: ShortGameCheck[]
  biasChecks: {
    utilitySupportTrend: string
    assassinTrend: string
    tankTrend: string
    dealerGap: string
  }
  notes: string[]
}

export interface PolicyEvaluation {
  overall: DamageShadowGroupStats
  byRole: DamageShadowGroupStats[]
  byDurationBucket: DamageShadowGroupStats[]
  byTier: DamageShadowGroupStats[]
  byCombination: DamageShadowGroupStats[]
  byPlacement: DamageShadowGroupStats[]
  byVictory: DamageShadowGroupStats[]
  byFastLong: DamageShadowGroupStats[]
  fallbackUseCount: number
  gradeTransitionCounts: Record<string, number>
}

export interface MultiplierComparisonRow {
  role: CharacterGradeRole
  curveRole: RoleTimeCurveRole
  minute: number
  oldDurationMultiplier: number
  candidateMultiplierA: number
  candidateMultiplierB: number
  deltaA: number
  deltaB: number
}

export interface ShortGameCheck {
  role: CharacterGradeRole
  curveRole: RoleTimeCurveRole
  minute: 8
  candidateMultiplier: number
  oldDurationMultiplier: number
  potentialBoostRatio: number
  note: string
}

interface Distribution {
  mean: number
  median: number
  p10: number
  p90: number
}

interface BuildEvaluationResult {
  report: DamageShadowEvaluationReport
  outliers: DamageShadowOutlier[]
}

function round(value: number, digits = 4): number {
  return Math.round(value * 10 ** digits) / 10 ** digits
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function rowTierKey(row: DamageShadowPlayerMatchRow): GradeBaselineTierKey | null {
  const tier = getRankTierFromRp(row.rpAfter ?? 0, null, row.displaySeasonId)
  return rankTierToGradeBaselineKey(tier)
}

export function resolveProductionDamageBaseline(input: RoleScoreV3Input): {
  metrics: BaselineMetrics | null
  level: BaselineFallbackLevel | null
  count: number | null
} {
  if (input.weaponTypeId == null) return { metrics: null, level: null, count: null }

  const exact = lookupBaselineMetricsAtTier(input.tierKey, input.characterNum, input.weaponTypeId)
  if (exact) return { metrics: exact, level: 'exact', count: exact.count }

  const tierCharacter = tierCharacterBaselines[`tier:${input.tierKey}|character:${input.characterNum}`]
  if (tierCharacter) {
    return { metrics: tierCharacter.means, level: 'tier-character', count: tierCharacter.count }
  }

  const tierRole = tierRoleBaselines[`tier:${input.tierKey}|role:${input.role}`]
  if (tierRole) return { metrics: tierRole.means, level: 'tier-role', count: tierRole.count }

  const tierOverall = tierOverallBaselines[`tier:${input.tierKey}`]
  if (tierOverall) return { metrics: tierOverall.means, level: 'tier-overall', count: tierOverall.count }

  return { metrics: null, level: null, count: null }
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

export function resolveProductionDamageDurationMultiplier(role: CharacterGradeRole, seconds: number | null | undefined): {
  multiplier: number
  fallbackLevel: DurationFallbackLevel
  bucket: string
} {
  const bucket = durationBucket(seconds)
  const roleDuration = bucket !== 'unknown-duration' ? roleDurationMultipliers[`role:${role}|duration:${bucket}`] : null
  if (roleDuration) {
    return {
      multiplier: round((roleDuration.multipliers.damageToPlayer ?? 1) * durationWithinBucketScalar(seconds, bucket), 6),
      fallbackLevel: 'role-duration',
      bucket,
    }
  }
  const roleGlobal = roleGlobalMultipliers[`role:${role}`]
  if (roleGlobal) {
    return {
      multiplier: round((roleGlobal.multipliers.damageToPlayer ?? 1) * durationWithinBucketScalar(seconds, bucket), 6),
      fallbackLevel: 'role-global',
      bucket,
    }
  }
  return {
    multiplier: round((globalMultipliers.multipliers.damageToPlayer ?? 1) * durationWithinBucketScalar(seconds, bucket), 6),
    fallbackLevel: 'global',
    bucket,
  }
}

export function normalizeDamageScore(actual: number | null | undefined, expected: number | null | undefined): number | null {
  if (!isFiniteNumber(actual) || !isFiniteNumber(expected)) return null
  const relative = computeRelativePerformance(actual, expected, true)
  if (relative == null || !Number.isFinite(relative)) return null
  return round(clamp(65 + 45 * relative, 20, 100), 4)
}

export function computeShadowExpectedDamage(baseAverageDamageToPlayer: number, curveMultiplier: number): number | null {
  if (!isFiniteNumber(baseAverageDamageToPlayer) || !isFiniteNumber(curveMultiplier)) return null
  return round(baseAverageDamageToPlayer * curveMultiplier, 4)
}

export function resolveDamageCurveMultiplier(params: {
  role: CharacterGradeRole
  durationSeconds: number
  policy: ShadowPolicy
  fallbackMultiplier: number
  candidateOverride?: RoleTimeCurveCandidateV11
}): CurveMultiplierResult {
  const curveRole = toCurveRole(params.role)
  const doc = params.candidateOverride ?? candidate
  const curve = doc.curves[curveRole]?.damageToPlayer
  const minutes = params.durationSeconds / 60

  if (!curve) {
    return {
      multiplier: params.fallbackMultiplier,
      curveRole,
      fallbackReason: 'missing-curve',
      source: 'old-duration-fallback',
      policy: params.policy,
    }
  }

  if (minutes < 8) {
    return {
      multiplier: params.fallbackMultiplier,
      curveRole,
      fallbackReason: 'under-8m',
      source: 'old-duration-fallback',
      policy: params.policy,
    }
  }

  if (minutes > 30) {
    return {
      multiplier: params.fallbackMultiplier,
      curveRole,
      fallbackReason: 'over-30m',
      source: 'old-duration-fallback',
      policy: params.policy,
    }
  }

  const points = curve.points.map((point) => ({ minute: point.minute, value: point.normalizedMultiplier }))
  if (params.policy === 'B_HOLD_25' && minutes > 25) {
    return {
      multiplier: round(interpolateCurve(points, 25), 6),
      curveRole,
      fallbackReason: null,
      source: 'candidate',
      policy: params.policy,
    }
  }

  return {
    multiplier: round(interpolateCurve(points, minutes), 6),
    curveRole,
    fallbackReason: null,
    source: 'candidate',
    policy: params.policy,
  }
}

function weightedMean(entries: ReadonlyArray<{ score: number | null; weight: number }>): {
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
    score: effectiveWeight > 0 ? round(weighted / effectiveWeight, 4) : null,
    effectiveWeight,
  }
}

function gradeStep(grade: CharacterFineGrade): number {
  const ascending = [...FINE_GRADE_CUTS].reverse().map((cut) => cut.grade)
  return ascending.indexOf(grade)
}

function distribution(values: readonly number[]): Distribution {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (finite.length === 0) return { mean: 0, median: 0, p10: 0, p90: 0 }
  return {
    mean: round(finite.reduce((sum, value) => sum + value, 0) / finite.length),
    median: round(quantileSorted(finite, 0.5)),
    p10: round(quantileSorted(finite, 0.1)),
    p90: round(quantileSorted(finite, 0.9)),
  }
}

function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower] ?? 0
  const weight = position - lower
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight
}

function toShadowInput(row: DamageShadowPlayerMatchRow): { input: RoleScoreV3Input; role: CharacterGradeRole } | null {
  if (row.gameMode !== 'rank') return null
  if (row.bestWeapon == null || row.bestWeapon <= 0) return null
  const tierKey = rowTierKey(row)
  if (!tierKey) return null
  const role = lookupCharacterWeaponRole(row.characterNum, row.bestWeapon)
  if (!role) return null
  return {
    role,
    input: {
      tierKey,
      characterNum: row.characterNum,
      weaponTypeId: row.bestWeapon,
      role,
      placement: row.placement,
      durationSeconds: row.gameDuration,
      damageToPlayer: row.damageToPlayer,
      kills: row.kills,
      assists: row.assists,
      teamKills: row.teamKills,
      deaths: row.deaths,
      visionScore: row.viewContribution,
      monsterKill: row.monsterKill,
    },
  }
}

function metricDetail(old: MatchGradeV3Result, metric: TeamLuckRoleScoreMetric) {
  return old.roleScoreDetail.metricDetails.find((detail) => detail.metric === metric) ?? null
}

function evaluateRowForPolicy(row: DamageShadowPlayerMatchRow, policy: ShadowPolicy): DamageShadowRowResult | null {
  const resolved = toShadowInput(row)
  if (!resolved) return null
  if (!isFiniteNumber(row.gameDuration) || row.gameDuration <= 0) return null
  if (!isFiniteNumber(row.placement) || row.placement <= 0) return null
  if (!isFiniteNumber(row.damageToPlayer)) return null

  const { input, role } = resolved
  const old = computeMatchGradeV3(input)
  if (!old) return null
  const damageDetail = metricDetail(old, 'damage')
  if (!damageDetail) return null

  const baseline = resolveProductionDamageBaseline(input)
  if (!baseline.metrics || !baseline.level || baseline.count == null) return null
  const oldDuration = resolveProductionDamageDurationMultiplier(role, row.gameDuration)
  const curve = resolveDamageCurveMultiplier({
    role,
    durationSeconds: row.gameDuration,
    policy,
    fallbackMultiplier: oldDuration.multiplier,
  })
  const shadowExpectedDamage = computeShadowExpectedDamage(baseline.metrics.averageDamageToPlayer, curve.multiplier)
  if (shadowExpectedDamage == null) return null
  const shadowDamageScore = normalizeDamageScore(row.damageToPlayer, shadowExpectedDamage)
  if (shadowDamageScore == null) return null

  const weights = TEAM_LUCK_ROLE_SCORE_WEIGHTS[role]
  const shadowRoleEntries = old.roleScoreDetail.metricDetails.map((detail) => ({
    score: detail.metric === 'damage' ? shadowDamageScore : detail.score,
    weight: weights[detail.metric],
  }))
  const shadowRoleScore = weightedMean(shadowRoleEntries).score
  if (shadowRoleScore == null) return null

  const shadowPlacementAdjustment = roleScoreV3PlacementAdjustment({
    placement: row.placement,
    roleScore: shadowRoleScore,
  })
  if (shadowPlacementAdjustment == null) return null

  const shadowMatchScore = round(clamp(shadowRoleScore + shadowPlacementAdjustment, 0, 100), 2)
  const shadowMatchGrade = scoreToFineGrade(shadowMatchScore)
  const oldDamageRatio = row.damageToPlayer / damageDetail.expected
  const shadowDamageRatio = row.damageToPlayer / shadowExpectedDamage

  return {
    uidHash: stableHash(row.uid),
    gameIdHash: stableHash(row.gameId),
    policy,
    tierKey: input.tierKey,
    role,
    curveRole: curve.curveRole,
    characterNum: row.characterNum,
    weaponTypeId: row.bestWeapon ?? 0,
    placement: row.placement,
    victory: row.victory === true,
    durationSeconds: row.gameDuration,
    durationBucket: old.roleScoreDetail.durationBucket,
    oldDurationFallbackLevel: old.roleScoreDetail.durationFallbackLevel ?? oldDuration.fallbackLevel,
    oldBaselineLevel: old.roleScoreDetail.baselineLevel ?? baseline.level,
    oldBaselineSampleCount: old.roleScoreDetail.baselineSampleCount ?? baseline.count,
    curveFallbackReason: curve.fallbackReason,
    oldExpectedDamage: round(damageDetail.expected, 4),
    oldDamageRatio: round(oldDamageRatio, 6),
    oldDamageScore: damageDetail.score,
    oldWeightedContribution: damageDetail.contribution,
    oldMatchScore: old.score,
    oldMatchGrade: old.grade,
    oldRoleScore: old.roleScore,
    oldPlacementAdjustment: old.placementAdjustment,
    curveMultiplier: curve.multiplier,
    shadowExpectedDamage,
    shadowDamageRatio: round(shadowDamageRatio, 6),
    shadowDamageScore,
    shadowWeightedContribution: round((shadowDamageScore * damageDetail.weight) / 100),
    shadowRoleScore,
    shadowPlacementAdjustment,
    shadowMatchScore,
    shadowMatchGrade,
    damageScoreDelta: round(shadowDamageScore - damageDetail.score, 4),
    matchScoreDelta: round(shadowMatchScore - old.score, 4),
    gradeStepDelta: gradeStep(shadowMatchGrade) - gradeStep(old.grade),
  }
}

function addSkip(skipped: Record<string, number>, key: string): void {
  skipped[key] = (skipped[key] ?? 0) + 1
}

function evaluateRows(rows: readonly DamageShadowPlayerMatchRow[], policy: ShadowPolicy): {
  results: DamageShadowRowResult[]
  skipped: Record<string, number>
} {
  const results: DamageShadowRowResult[] = []
  const skipped: Record<string, number> = {}

  for (const row of rows) {
    if (row.gameMode !== 'rank') {
      addSkip(skipped, 'non-rank')
      continue
    }
    const resolved = toShadowInput(row)
    if (!resolved) {
      addSkip(skipped, 'missing-tier-role-or-weapon')
      continue
    }
    if (!isFiniteNumber(row.gameDuration) || row.gameDuration <= 0) {
      addSkip(skipped, 'missing-duration')
      continue
    }
    if (!isFiniteNumber(row.damageToPlayer)) {
      addSkip(skipped, 'missing-damage')
      continue
    }
    const result = evaluateRowForPolicy(row, policy)
    if (!result) {
      addSkip(skipped, 'unscored')
      continue
    }
    results.push(result)
  }

  return { results, skipped }
}

function outlierFromResult(result: DamageShadowRowResult): DamageShadowOutlier {
  return {
    uidHash: result.uidHash,
    gameIdHash: result.gameIdHash,
    policy: result.policy,
    role: result.role,
    curveRole: result.curveRole,
    tierKey: result.tierKey,
    characterNum: result.characterNum,
    weaponTypeId: result.weaponTypeId,
    placement: result.placement,
    victory: result.victory,
    durationSeconds: result.durationSeconds,
    oldExpectedDamage: result.oldExpectedDamage,
    shadowExpectedDamage: result.shadowExpectedDamage,
    curveMultiplier: result.curveMultiplier,
    oldDamageRatio: result.oldDamageRatio,
    shadowDamageRatio: result.shadowDamageRatio,
    oldDamageScore: result.oldDamageScore,
    shadowDamageScore: result.shadowDamageScore,
    oldMatchScore: result.oldMatchScore,
    shadowMatchScore: result.shadowMatchScore,
    oldMatchGrade: result.oldMatchGrade,
    shadowMatchGrade: result.shadowMatchGrade,
    matchScoreDelta: result.matchScoreDelta,
    curveFallbackReason: result.curveFallbackReason,
  }
}

function groupStats(key: string, rows: readonly DamageShadowRowResult[]): DamageShadowGroupStats {
  const up = rows.filter((row) => row.gradeStepDelta > 0).length
  const down = rows.filter((row) => row.gradeStepDelta < 0).length
  const same = rows.length - up - down
  const max = rows.reduce<DamageShadowRowResult | null>((best, row) => {
    if (!best) return row
    return Math.abs(row.matchScoreDelta) > Math.abs(best.matchScoreDelta) ? row : best
  }, null)
  return {
    key,
    sampleCount: rows.length,
    oldDamageRatio: distribution(rows.map((row) => row.oldDamageRatio)),
    shadowDamageRatio: distribution(rows.map((row) => row.shadowDamageRatio)),
    damageScoreMeanDelta: round(mean(rows.map((row) => row.damageScoreDelta))),
    matchScoreMeanDelta: round(mean(rows.map((row) => row.matchScoreDelta))),
    gradeChange: {
      up,
      same,
      down,
      upRate: rows.length > 0 ? round(up / rows.length, 6) : 0,
      sameRate: rows.length > 0 ? round(same / rows.length, 6) : 0,
      downRate: rows.length > 0 ? round(down / rows.length, 6) : 0,
      onePlusStepChangeCount: rows.filter((row) => Math.abs(row.gradeStepDelta) >= 1).length,
    },
    maxChange: max ? outlierFromResult(max) : null,
    fallbackUseCount: rows.filter((row) => row.curveFallbackReason != null).length,
  }
}

function mean(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite)
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0
}

function grouped<T extends string | number>(rows: readonly DamageShadowRowResult[], makeKey: (row: DamageShadowRowResult) => T): DamageShadowGroupStats[] {
  const map = new Map<string, DamageShadowRowResult[]>()
  for (const row of rows) {
    const key = String(makeKey(row))
    map.set(key, [...(map.get(key) ?? []), row])
  }
  return [...map.entries()]
    .map(([key, value]) => groupStats(key, value))
    .sort((a, b) => b.sampleCount - a.sampleCount || a.key.localeCompare(b.key))
}

function sufficientCombinations(rows: readonly DamageShadowRowResult[]): DamageShadowGroupStats[] {
  return grouped(rows, (row) => `${row.tierKey}:${row.characterNum}:${row.weaponTypeId}`)
    .filter((group) => group.sampleCount >= 30)
    .slice(0, 40)
}

function fastLongKey(row: DamageShadowRowResult): string {
  const minutes = row.durationSeconds / 60
  if (minutes < 15) return 'fast-under-15m'
  if (minutes >= 25) return 'long-25m-plus'
  return 'middle-15-25m'
}

function gradeTransitionCounts(rows: readonly DamageShadowRowResult[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const key = `${row.oldMatchGrade}->${row.shadowMatchGrade}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

function policyEvaluation(rows: readonly DamageShadowRowResult[]): PolicyEvaluation {
  return {
    overall: groupStats('overall', rows),
    byRole: grouped(rows, (row) => row.role),
    byDurationBucket: grouped(rows, (row) => row.durationBucket),
    byTier: grouped(rows, (row) => row.tierKey),
    byCombination: sufficientCombinations(rows),
    byPlacement: grouped(rows, (row) => row.placement),
    byVictory: grouped(rows, (row) => (row.victory ? 'victory' : 'non-victory')),
    byFastLong: grouped(rows, fastLongKey),
    fallbackUseCount: rows.filter((row) => row.curveFallbackReason != null).length,
    gradeTransitionCounts: gradeTransitionCounts(rows),
  }
}

function multiplierComparison(): MultiplierComparisonRow[] {
  const roles = Object.keys(TEAM_LUCK_ROLE_SCORE_WEIGHTS) as CharacterGradeRole[]
  const minutes = [8, 10, 12, 15, 18, 20, 22, 25, 28, 30]
  const rows: MultiplierComparisonRow[] = []
  for (const role of roles) {
    const fallbackMultiplier = 1
    const curveRole = toCurveRole(role)
    for (const minute of minutes) {
      const old = resolveProductionDamageDurationMultiplier(role, minute * 60).multiplier
      const a = resolveDamageCurveMultiplier({
        role,
        durationSeconds: minute * 60,
        policy: 'A_INTERPOLATE_25_30',
        fallbackMultiplier,
      }).multiplier
      const b = resolveDamageCurveMultiplier({
        role,
        durationSeconds: minute * 60,
        policy: 'B_HOLD_25',
        fallbackMultiplier,
      }).multiplier
      rows.push({
        role,
        curveRole,
        minute,
        oldDurationMultiplier: old,
        candidateMultiplierA: a,
        candidateMultiplierB: b,
        deltaA: round(a - old, 6),
        deltaB: round(b - old, 6),
      })
    }
  }
  return rows
}

function shortGameCheck(): ShortGameCheck[] {
  const roles = Object.keys(TEAM_LUCK_ROLE_SCORE_WEIGHTS) as CharacterGradeRole[]
  return roles.map((role) => {
    const old = resolveProductionDamageDurationMultiplier(role, 8 * 60).multiplier
    const candidateMultiplier = resolveDamageCurveMultiplier({
      role,
      durationSeconds: 8 * 60,
      policy: 'A_INTERPOLATE_25_30',
      fallbackMultiplier: old,
    }).multiplier
    return {
      role,
      curveRole: toCurveRole(role),
      minute: 8,
      candidateMultiplier,
      oldDurationMultiplier: old,
      potentialBoostRatio: candidateMultiplier > 0 ? round(old / candidateMultiplier, 4) : 0,
      note:
        candidateMultiplier < old * 0.7
          ? '8m candidate multiplier is much lower than old duration multiplier; short games can receive a large damage-ratio boost.'
          : '8m candidate multiplier is close enough to old duration multiplier for shadow review.',
    }
  })
}

function trendLabel(group: DamageShadowGroupStats | undefined): string {
  if (!group) return 'no-sample'
  if (group.matchScoreMeanDelta <= -1) return `down ${group.matchScoreMeanDelta}`
  if (group.matchScoreMeanDelta >= 1) return `up ${group.matchScoreMeanDelta}`
  return `near-flat ${group.matchScoreMeanDelta}`
}

function biasChecks(policy: PolicyEvaluation): DamageShadowEvaluationReport['biasChecks'] {
  const byRole = new Map(policy.byRole.map((group) => [group.key, group]))
  const aa = byRole.get('평타 딜러')
  const ap = byRole.get('스증 딜러')
  return {
    utilitySupportTrend: trendLabel(byRole.get('서포터')),
    assassinTrend: trendLabel(byRole.get('암살자')),
    tankTrend: trendLabel(byRole.get('탱커')),
    dealerGap:
      aa && ap
        ? `aa=${aa.matchScoreMeanDelta}, skill=${ap.matchScoreMeanDelta}, delta=${round(aa.matchScoreMeanDelta - ap.matchScoreMeanDelta)}`
        : 'no-sample',
  }
}

export function buildDamageShadowEvaluation(
  rows: readonly DamageShadowPlayerMatchRow[],
  generatedAt = new Date().toISOString(),
): BuildEvaluationResult {
  const policyA = evaluateRows(rows, 'A_INTERPOLATE_25_30')
  const policyB = evaluateRows(rows, 'B_HOLD_25')
  const evalA = policyEvaluation(policyA.results)
  const evalB = policyEvaluation(policyB.results)
  const outliers = [...policyA.results, ...policyB.results]
    .sort((a, b) => Math.abs(b.matchScoreDelta) - Math.abs(a.matchScoreDelta))
    .slice(0, 100)
    .map(outlierFromResult)

  const report: DamageShadowEvaluationReport = {
    version: DAMAGE_SHADOW_EVALUATION_VERSION,
    generatedAt,
    source: 'PlayerMatch',
    readOnly: true,
    runtimeApplied: false,
    candidateVersion: candidate.version,
    productionVersions: {
      roleScore: ROLE_SCORE_V3_VERSION,
      fallbackBaseline: ROLE_SCORE_V3_FALLBACK_BASELINE_VERSION,
      durationAdjustment: ROLE_SCORE_V3_DURATION_ADJUSTMENT_VERSION,
    },
    formulas: {
      shadowExpectedDamage:
        'existing DAK.GG tier+character+weapon absolute averageDamageToPlayer baseline * role-time-curve.v1.1 damage normalizedMultiplier',
      note:
        'candidate absoluteExpectedValue is not used as the final damage baseline; existing ratio-to-score conversion and damage weight are reused.',
    },
    sample: {
      totalRows: rows.length,
      rankRows: rows.filter((row) => row.gameMode === 'rank').length,
      evaluatedRows: policyA.results.length,
      skipped: policyA.skipped,
    },
    policies: {
      A_INTERPOLATE_25_30: evalA,
      B_HOLD_25: evalB,
    },
    multiplierComparison: multiplierComparison(),
    shortGameCheck: shortGameCheck(),
    biasChecks: biasChecks(evalA),
    notes: [
      'Shadow only: production match, character, overall, team luck, and carry burden scoring are not modified.',
      'Rows under 8 minutes and over 30 minutes use the existing duration multiplier fallback in shadow output.',
      'Vision, monster, deaths, and survival curves are not applied in this evaluation.',
    ],
  }

  return { report, outliers }
}

export function formatDamageShadowMarkdown(report: DamageShadowEvaluationReport): string {
  const a = report.policies.A_INTERPOLATE_25_30
  const b = report.policies.B_HOLD_25
  const roleRows = a.byRole
    .map(
      (row) =>
        `| ${row.key} | ${row.sampleCount} | ${row.oldDamageRatio.median} | ${row.shadowDamageRatio.median} | ${row.damageScoreMeanDelta} | ${row.matchScoreMeanDelta} | ${row.gradeChange.up}/${row.gradeChange.same}/${row.gradeChange.down} | ${row.fallbackUseCount} |`,
    )
    .join('\n')
  const durationRows = a.byDurationBucket
    .map(
      (row) =>
        `| ${row.key} | ${row.sampleCount} | ${row.oldDamageRatio.median} | ${row.shadowDamageRatio.median} | ${row.damageScoreMeanDelta} | ${row.matchScoreMeanDelta} | ${row.gradeChange.onePlusStepChangeCount} | ${row.fallbackUseCount} |`,
    )
    .join('\n')
  const multiplierRows = report.multiplierComparison
    .map(
      (row) =>
        `| ${row.role} | ${row.minute} | ${row.oldDurationMultiplier} | ${row.candidateMultiplierA} | ${row.candidateMultiplierB} | ${row.deltaA} | ${row.deltaB} |`,
    )
    .join('\n')

  return `# Damage Curve Shadow Evaluation v1.1

- Generated: ${report.generatedAt}
- Runtime applied: ${report.runtimeApplied}
- Candidate: ${report.candidateVersion}
- Evaluated rank rows: ${report.sample.evaluatedRows} / ${report.sample.rankRows}
- Formula: ${report.formulas.shadowExpectedDamage}

## Overall

| Policy | Samples | Old ratio p50 | Shadow ratio p50 | Damage score delta | Match score delta | Grade up/same/down | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|---:|
| A interpolate 25-30 | ${a.overall.sampleCount} | ${a.overall.oldDamageRatio.median} | ${a.overall.shadowDamageRatio.median} | ${a.overall.damageScoreMeanDelta} | ${a.overall.matchScoreMeanDelta} | ${a.overall.gradeChange.up}/${a.overall.gradeChange.same}/${a.overall.gradeChange.down} | ${a.fallbackUseCount} |
| B hold 25 | ${b.overall.sampleCount} | ${b.overall.oldDamageRatio.median} | ${b.overall.shadowDamageRatio.median} | ${b.overall.damageScoreMeanDelta} | ${b.overall.matchScoreMeanDelta} | ${b.overall.gradeChange.up}/${b.overall.gradeChange.same}/${b.overall.gradeChange.down} | ${b.fallbackUseCount} |

## By Role (Policy A)

| Role | Samples | Old ratio p50 | Shadow ratio p50 | Damage score delta | Match score delta | Grade up/same/down | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|---:|
${roleRows}

## By Duration (Policy A)

| Duration | Samples | Old ratio p50 | Shadow ratio p50 | Damage score delta | Match score delta | Grade step changes | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|---:|
${durationRows}

## Existing vs Candidate Multipliers

| Role | Minute | Old duration | Candidate A | Candidate B | Delta A | Delta B |
|---|---:|---:|---:|---:|---:|---:|
${multiplierRows}

## Bias Checks

- Utility support: ${report.biasChecks.utilitySupportTrend}
- Assassin: ${report.biasChecks.assassinTrend}
- Tank: ${report.biasChecks.tankTrend}
- AA/skill dealer gap: ${report.biasChecks.dealerGap}

## Notes

${report.notes.map((note) => `- ${note}`).join('\n')}
`
}
