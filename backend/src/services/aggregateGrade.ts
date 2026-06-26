import calibrationDoc from '../data/aggregateGrade/aggregate-grade-calibration.v1.json' with { type: 'json' }
import type { CharacterFineGrade, CharacterGradeRole } from '../contracts/player.js'
import type { RankTier } from '../utils/rankTier.js'
import { rankTierToGradeBaselineKey } from './characterPerformanceGrade/tierKey.js'
import { scoreToFineGrade, type GradeBaselineTierKey } from './characterPerformanceGrade/config.js'

export const AGGREGATE_GRADE_CALIBRATION_VERSION = 'aggregate-grade-calibration.v1'
export const CHARACTER_AGGREGATE_GRADE_VERSION = 'character-aggregate-grade.v5-robust10'
export const OVERALL_AGGREGATE_GRADE_VERSION = 'overall-aggregate-grade.v5-dtg1'
export const AGGREGATE_GRADE_CUT_VERSION = 'aggregate-grade-shared-fine-cuts.v1'
export const AGGREGATE_GRADE_SHRINK_VERSION = 'aggregate-shrink-k1-10robust.v1'
export const AGGREGATE_GRADE_SHRINK_K = 1
export const ROBUST_AGGREGATE_MIN_SAMPLE = 10
export const ROBUST_AGGREGATE_LOW_TAIL_WEIGHT = 0.15
export const ROBUST_AGGREGATE_HIGH_TAIL_WEIGHT = 0.75

type Cut = { grade: CharacterFineGrade; min: number }

type CalibrationDoc = {
  version: string
  characterAggregateGradeVersion: string
  overallAggregateGradeVersion: string
  config: { defaultShrinkK: number }
  priors: {
    globalMatchScore: number
    rolePriors: Partial<Record<CharacterGradeRole, { meanMatchScore: number; sampleCount: number }>>
  }
  characterCalibration: { cuts: Cut[] }
  overallCalibration: { cuts: Cut[] }
}

const calibration = calibrationDoc as CalibrationDoc

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function average(values: ReadonlyArray<number>): number | null {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

export function applyAggregateSampleAdjustment(params: {
  rawScore: number
  sampleSize: number
  priorMean: number
  k?: number
}): number {
  const k = params.k ?? AGGREGATE_GRADE_SHRINK_K
  if (params.sampleSize <= 0) return params.priorMean
  if (params.sampleSize >= 20) return params.rawScore
  const confidence = params.sampleSize / (params.sampleSize + k)
  return params.priorMean + confidence * (params.rawScore - params.priorMean)
}

export function aggregateSampleConfidence(sampleSize: number, k = AGGREGATE_GRADE_SHRINK_K): number {
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) return 0
  if (sampleSize >= ROBUST_AGGREGATE_MIN_SAMPLE) return 1
  return sampleSize / (sampleSize + k)
}

export function scoreToAggregateGrade(
  score: number | null,
  scope: 'character' | 'overall',
): CharacterFineGrade | null {
  if (score == null || !Number.isFinite(score)) return null
  const cuts = scope === 'character'
    ? calibration.characterCalibration.cuts
    : calibration.overallCalibration.cuts
  for (const cut of cuts) {
    if (score >= cut.min) return cut.grade
  }
  return 'D-'
}

export function scoreToSharedFineAggregateGrade(score: number | null): CharacterFineGrade | null {
  if (score == null || !Number.isFinite(score)) return null
  return scoreToFineGrade(score)
}

export function aggregateRolePriorMean(role: CharacterGradeRole | null): number {
  if (!role) return calibration.priors.globalMatchScore
  return calibration.priors.rolePriors[role]?.meanMatchScore ?? calibration.priors.globalMatchScore
}

export function aggregateGlobalPriorMean(): number {
  return calibration.priors.globalMatchScore
}

export function characterPriorMeanFromRoles(
  roles: ReadonlyArray<{ role: CharacterGradeRole | null; weight: number }>,
): number {
  let weighted = 0
  let total = 0
  for (const row of roles) {
    if (!Number.isFinite(row.weight) || row.weight <= 0) continue
    weighted += aggregateRolePriorMean(row.role) * row.weight
    total += row.weight
  }
  return total > 0 ? weighted / total : aggregateGlobalPriorMean()
}

export interface AggregateMatchScoreEntry {
  score: number
  role: CharacterGradeRole | null
}

export interface AggregateGradeEvidence {
  aggregationPolicy: 'plain-mean-k1' | 'robust-weighted-10pct'
  matchCount: number
  tailCount: number
  lowTailWeight: typeof ROBUST_AGGREGATE_LOW_TAIL_WEIGHT
  highTailWeight: typeof ROBUST_AGGREGATE_HIGH_TAIL_WEIGHT
  ordinaryMean: number | null
  robustRaw: number | null
  confidence: number
  finalScore: number | null
  grade: CharacterFineGrade | null
  presetVersion: typeof CHARACTER_AGGREGATE_GRADE_VERSION
}

export function robustWeightedMean10Pct(values: ReadonlyArray<number>): {
  ordinaryMean: number | null
  robustRaw: number | null
  tailCount: number
  weightedCount: number
} {
  const entries = values
    .map((score, index) => ({ score, index }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => (a.score === b.score ? a.index - b.index : a.score - b.score))
  const ordinaryMean = average(entries.map((entry) => entry.score))
  if (entries.length === 0 || ordinaryMean == null) {
    return { ordinaryMean: null, robustRaw: null, tailCount: 0, weightedCount: 0 }
  }

  const tailCount = Math.ceil(entries.length * 0.1)
  let weightedSum = 0
  let weightSum = 0
  entries.forEach((entry, index) => {
    const weight =
      index < tailCount
        ? ROBUST_AGGREGATE_LOW_TAIL_WEIGHT
        : index >= entries.length - tailCount
          ? ROBUST_AGGREGATE_HIGH_TAIL_WEIGHT
          : 1
    weightedSum += entry.score * weight
    weightSum += weight
  })
  return {
    ordinaryMean,
    robustRaw: weightSum > 0 ? weightedSum / weightSum : null,
    tailCount,
    weightedCount: weightSum,
  }
}

export function computeCharacterAggregateGradeV2(params: {
  entries: ReadonlyArray<AggregateMatchScoreEntry>
}): {
  rawScore: number | null
  priorMean: number
  adjustedScore: number | null
  grade: CharacterFineGrade | null
  eligibleMatchCount: number
  roles: CharacterGradeRole[]
  aggregation: AggregateGradeEvidence
} {
  const validEntries = params.entries.filter((row) => Number.isFinite(row.score))
  const rawScore = average(validEntries.map((row) => row.score))
  const roleWeights = validEntries.map((row) => ({ role: row.role, weight: 1 }))
  const priorMean = characterPriorMeanFromRoles(roleWeights)
  if (rawScore == null) {
    return {
      rawScore: null,
      priorMean,
      adjustedScore: null,
      grade: null,
      eligibleMatchCount: 0,
      roles: [],
      aggregation: {
        aggregationPolicy: 'plain-mean-k1',
        matchCount: 0,
        tailCount: 0,
        lowTailWeight: ROBUST_AGGREGATE_LOW_TAIL_WEIGHT,
        highTailWeight: ROBUST_AGGREGATE_HIGH_TAIL_WEIGHT,
        ordinaryMean: null,
        robustRaw: null,
        confidence: 0,
        finalScore: null,
        grade: null,
        presetVersion: CHARACTER_AGGREGATE_GRADE_VERSION,
      },
    }
  }
  const robust =
    validEntries.length >= ROBUST_AGGREGATE_MIN_SAMPLE
      ? robustWeightedMean10Pct(validEntries.map((row) => row.score))
      : null
  const aggregationPolicy =
    robust && robust.robustRaw != null ? 'robust-weighted-10pct' : 'plain-mean-k1'
  const adjustedScore =
    robust && robust.robustRaw != null
      ? robust.robustRaw
      : applyAggregateSampleAdjustment({
          rawScore,
          sampleSize: validEntries.length,
          priorMean,
        })
  const grade = scoreToSharedFineAggregateGrade(adjustedScore)
  const confidence = aggregateSampleConfidence(validEntries.length)
  return {
    rawScore: round(rawScore),
    priorMean: round(priorMean),
    adjustedScore: round(adjustedScore),
    grade,
    eligibleMatchCount: validEntries.length,
    roles: [...new Set(validEntries.map((row) => row.role).filter((role): role is CharacterGradeRole => role != null))],
    aggregation: {
      aggregationPolicy,
      matchCount: validEntries.length,
      tailCount: robust?.tailCount ?? 0,
      lowTailWeight: ROBUST_AGGREGATE_LOW_TAIL_WEIGHT,
      highTailWeight: ROBUST_AGGREGATE_HIGH_TAIL_WEIGHT,
      ordinaryMean: round(rawScore),
      robustRaw: robust?.robustRaw == null ? null : round(robust.robustRaw),
      confidence: round(confidence, 4),
      finalScore: round(adjustedScore),
      grade,
      presetVersion: CHARACTER_AGGREGATE_GRADE_VERSION,
    },
  }
}

export function computeOverallAggregateGradeV2(params: {
  entries: ReadonlyArray<AggregateMatchScoreEntry>
  gradedCharacterCount: number
  sourceFingerprint?: string
  computedAt?: Date
}): {
  overallGradeVersion: typeof OVERALL_AGGREGATE_GRADE_VERSION
  overallPerformanceScore: number | null
  overallGrade: CharacterFineGrade | null
    overallScoreSource: 'overall-aggregate-grade-v4'
  basePerformanceScore: number | null
  outcomePerformanceScore: number | null
  consistencyScore: number | null
  outcomeModifier: number
  consistencyModifier: number
  totalModifier: number
  overallConfidence: number
  overallConfidenceLabel: 'high' | 'medium' | 'low' | 'insufficient'
  weightedMatchCount: number
  gradedCharacterCount: number
  sourceFingerprint?: string
  computedAt?: string
} | null {
  const entries = params.entries.filter((row) => Number.isFinite(row.score))
  const rawScore = average(entries.map((row) => row.score))
  if (rawScore == null) return null
  const priorMean = aggregateGlobalPriorMean()
  const adjustedScore = applyAggregateSampleAdjustment({
    rawScore,
    sampleSize: entries.length,
    priorMean,
  })
  const sampleSize = entries.length
  const confidence =
    sampleSize >= 40 ? 'high'
      : sampleSize >= 20 ? 'medium'
        : sampleSize >= 5 ? 'low'
          : 'insufficient'
  return {
    overallGradeVersion: OVERALL_AGGREGATE_GRADE_VERSION,
    overallPerformanceScore: round(adjustedScore),
    overallGrade: scoreToSharedFineAggregateGrade(adjustedScore),
    overallScoreSource: 'overall-aggregate-grade-v4',
    basePerformanceScore: round(rawScore),
    outcomePerformanceScore: null,
    consistencyScore: null,
    outcomeModifier: 0,
    consistencyModifier: 0,
    totalModifier: round(adjustedScore - rawScore),
    overallConfidence: round(aggregateSampleConfidence(sampleSize), 4),
    overallConfidenceLabel: confidence,
    weightedMatchCount: sampleSize,
    gradedCharacterCount: params.gradedCharacterCount,
    sourceFingerprint: params.sourceFingerprint,
    computedAt: params.computedAt?.toISOString(),
  }
}

export function aggregateGradeVersions(): {
  calibrationVersion: typeof AGGREGATE_GRADE_CALIBRATION_VERSION
  characterAggregateGradeVersion: typeof CHARACTER_AGGREGATE_GRADE_VERSION
  overallAggregateGradeVersion: typeof OVERALL_AGGREGATE_GRADE_VERSION
  aggregateGradeCutVersion: typeof AGGREGATE_GRADE_CUT_VERSION
  aggregateShrinkVersion: typeof AGGREGATE_GRADE_SHRINK_VERSION
  shrinkK: typeof AGGREGATE_GRADE_SHRINK_K
} {
  return {
    calibrationVersion: AGGREGATE_GRADE_CALIBRATION_VERSION,
    characterAggregateGradeVersion: CHARACTER_AGGREGATE_GRADE_VERSION,
    overallAggregateGradeVersion: OVERALL_AGGREGATE_GRADE_VERSION,
    aggregateGradeCutVersion: AGGREGATE_GRADE_CUT_VERSION,
    aggregateShrinkVersion: AGGREGATE_GRADE_SHRINK_VERSION,
    shrinkK: AGGREGATE_GRADE_SHRINK_K,
  }
}

export function aggregateGradeFingerprintVersion(): string {
  return [
    AGGREGATE_GRADE_CALIBRATION_VERSION,
    CHARACTER_AGGREGATE_GRADE_VERSION,
    OVERALL_AGGREGATE_GRADE_VERSION,
    AGGREGATE_GRADE_CUT_VERSION,
    AGGREGATE_GRADE_SHRINK_VERSION,
    `k${AGGREGATE_GRADE_SHRINK_K}`,
  ].join('+')
}

export function tierKeyForAggregate(playerTier: RankTier | null): GradeBaselineTierKey | null {
  return playerTier ? rankTierToGradeBaselineKey(playerTier) : null
}
