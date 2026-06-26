import { scoreToFineGrade, type CharacterFineGrade } from '../../services/characterPerformanceGrade/config.js'
import { clamp } from '../../services/characterPerformanceGrade/metrics.js'

export type PercentileCalibrationCandidateId = 'P0' | 'P4' | 'P6'

export interface PercentileGateThresholds {
  sFamily: number
  s: number
  sPlus: number
}

export interface PercentileCalibrationInput {
  residualPercentile: number
  baseScore: number
  placement: number
}

export interface PercentileCalibrationResult {
  candidate: PercentileCalibrationCandidateId
  baseScore: number
  score: number
  grade: CharacterFineGrade
  placementModifier: number
}

export const PERCENTILE_PLACEMENT_ADJUSTMENTS: Record<
  PercentileCalibrationCandidateId,
  Record<number, number>
> = {
  P0: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
  },
  P4: {
    1: 4,
    2: 3,
    3: 2,
    4: 0.5,
    5: -0.5,
    6: -2,
    7: -3,
    8: -4,
  },
  P6: {
    1: 6,
    2: 4.5,
    3: 3,
    4: 1,
    5: -1,
    6: -3,
    7: -4.5,
    8: -6,
  },
}

export function percentilePlacementAdjustment(
  candidate: PercentileCalibrationCandidateId,
  placement: number,
): number | null {
  return PERCENTILE_PLACEMENT_ADJUSTMENTS[candidate][placement] ?? null
}

export function quantileInterpolated(sortedValues: readonly number[], percentile: number): number | null {
  if (sortedValues.length === 0 || !Number.isFinite(percentile)) return null
  if (sortedValues.length === 1) return sortedValues[0] ?? null

  const p = clamp(percentile, 0, 1)
  const index = (sortedValues.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const lowerValue = sortedValues[lower]
  const upperValue = sortedValues[upper]
  if (lowerValue == null || upperValue == null) return null
  if (lower === upper) return lowerValue

  const weight = index - lower
  return lowerValue * (1 - weight) + upperValue * weight
}

export function empiricalPercentileMidrank(
  sortedValues: readonly number[],
  value: number,
): number | null {
  if (sortedValues.length === 0 || !Number.isFinite(value)) return null
  if (sortedValues.length === 1) return 0.5

  const lower = lowerBound(sortedValues, value)
  const upper = upperBound(sortedValues, value)
  const midIndex = upper > lower ? (lower + upper - 1) / 2 : lower
  return clamp(midIndex / (sortedValues.length - 1), 0, 1)
}

export function computePercentileBaseScore(params: {
  targetProductionScores: readonly number[]
  residualPercentile: number
}): number | null {
  const score = quantileInterpolated(params.targetProductionScores, params.residualPercentile)
  return score == null ? null : round2(score)
}

export function gateThresholdFromProductionRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 1
  return round6(clamp(1 - ratio, 0, 1))
}

export function gradePercentileCalibrationScore(params: {
  score: number
  residualPercentile: number
  placement: number
  thresholds: PercentileGateThresholds
}): CharacterFineGrade {
  let cappedScore = params.score

  if (
    cappedScore >= 95 &&
    (params.residualPercentile < params.thresholds.sPlus || params.placement > 3)
  ) {
    cappedScore = 94.99
  }

  if (cappedScore >= 88 && params.residualPercentile < params.thresholds.s) {
    cappedScore = 87.99
  }

  if (cappedScore >= 84 && params.residualPercentile < params.thresholds.sFamily) {
    cappedScore = 83.99
  }

  return scoreToFineGrade(cappedScore)
}

export function evaluatePercentileCalibrationCandidate(params: {
  candidate: PercentileCalibrationCandidateId
  input: PercentileCalibrationInput
  thresholds: PercentileGateThresholds
}): PercentileCalibrationResult | null {
  if (
    !Number.isFinite(params.input.residualPercentile) ||
    !Number.isFinite(params.input.baseScore)
  ) {
    return null
  }

  const placementModifier = percentilePlacementAdjustment(params.candidate, params.input.placement)
  if (placementModifier == null) return null

  const score = round2(clamp(params.input.baseScore + placementModifier, 0, 100))
  return {
    candidate: params.candidate,
    baseScore: round2(params.input.baseScore),
    score,
    grade: gradePercentileCalibrationScore({
      score,
      residualPercentile: params.input.residualPercentile,
      placement: params.input.placement,
      thresholds: params.thresholds,
    }),
    placementModifier,
  }
}

function lowerBound(sortedValues: readonly number[], value: number): number {
  let low = 0
  let high = sortedValues.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if ((sortedValues[mid] ?? Number.POSITIVE_INFINITY) < value) low = mid + 1
    else high = mid
  }
  return low
}

function upperBound(sortedValues: readonly number[], value: number): number {
  let low = 0
  let high = sortedValues.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if ((sortedValues[mid] ?? Number.POSITIVE_INFINITY) <= value) low = mid + 1
    else high = mid
  }
  return low
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
