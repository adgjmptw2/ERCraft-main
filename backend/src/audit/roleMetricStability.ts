import type { EffectiveReadinessLevel } from './roleMetricCalibration.js'
import { p95WinsorizedMean } from './roleMetricBaselineBuilder.js'
import {
  ROLE_METRIC_STABILITY_CONFIG,
  type RoleMetricStabilityConfig,
} from './roleMetricStabilityConfig.js'

export interface BootstrapResult {
  iterations: number
  seed: number
  baselineMean: number
  baselineStdDev: number
  baselineCv: number | null
  upperAnchorMean: number
  upperAnchorStdDev: number
  upperAnchorCv: number | null
  positiveAnchorRate: number
  baselineP05: number
  baselineP95: number
  upperAnchorP05: number
  upperAnchorP95: number
  stable: boolean
  failureReasons: string[]
}

export interface TrainValidationResult {
  trainCount: number
  validationCount: number
  trainWinsorizedMean: number | null
  validationWinsorizedMean: number | null
  trainP90: number | null
  validationP90: number | null
  baselineRelativeDiff: number | null
  p90RelativeDiff: number | null
  stable: boolean
  failureReasons: string[]
}

export interface LiveEligibilityFlags {
  tankingEfficiency: boolean
  shieldDamageOffsetFromPlayer: boolean
  teamRecover: boolean
  ccTimeToPlayer: boolean
}

export type LiveMetricKey = keyof LiveEligibilityFlags

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0] ?? 0
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower] ?? 0
  const weight = index - lower
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function coefficientOfVariation(values: number[], mean: number): number | null {
  if (!Number.isFinite(mean) || Math.abs(mean) <= ROLE_METRIC_STABILITY_CONFIG.zeroHeavyMeanEpsilon) {
    return null
  }
  return stdDev(values) / Math.abs(mean)
}

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

export function computeTankingEfficiencyValue(
  damageFromPlayer: number | null,
  deaths: number | null,
): number | null {
  if (damageFromPlayer == null || deaths == null) return null
  if (!Number.isFinite(damageFromPlayer) || !Number.isFinite(deaths)) return null
  return damageFromPlayer / (1 + Math.max(0, deaths))
}

export function computeMetricP90(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return percentile(sorted, 0.9)
}

export function runMetricBootstrap(
  values: number[],
  readiness: EffectiveReadinessLevel,
  options: {
    zeroHeavy: boolean
    positiveCount: number
    config?: RoleMetricStabilityConfig
    seed?: number
  },
): BootstrapResult {
  const config = options.config ?? ROLE_METRIC_STABILITY_CONFIG
  const seed = options.seed ?? config.bootstrapSeed
  const failureReasons: string[] = []

  if (readiness !== 'provisional' && readiness !== 'ready') {
    failureReasons.push('readiness-insufficient')
  }
  if (values.length < 30) {
    failureReasons.push('sample-insufficient')
  }

  const rng = createSeededRng(seed)
  const baselineSamples: number[] = []
  const upperSamples: number[] = []
  let positiveAnchorCount = 0

  for (let i = 0; i < config.bootstrapIterations; i += 1) {
    const sample: number[] = []
    for (let j = 0; j < values.length; j += 1) {
      const index = Math.floor(rng() * values.length)
      sample.push(values[index]!)
    }
    const winsorizedMean = p95WinsorizedMean(sample)
    const p90 = computeMetricP90(sample)
    if (winsorizedMean == null || p90 == null || !Number.isFinite(winsorizedMean) || !Number.isFinite(p90)) {
      failureReasons.push('nan-infinity')
      continue
    }
    baselineSamples.push(winsorizedMean)
    upperSamples.push(p90)
    if (p90 > winsorizedMean + config.anchorGapEpsilon) {
      positiveAnchorCount += 1
    }
  }

  const baselineMean =
    baselineSamples.length > 0
      ? baselineSamples.reduce((sum, value) => sum + value, 0) / baselineSamples.length
      : 0
  const upperAnchorMean =
    upperSamples.length > 0
      ? upperSamples.reduce((sum, value) => sum + value, 0) / upperSamples.length
      : 0
  const positiveAnchorRate =
    config.bootstrapIterations > 0 ? positiveAnchorCount / config.bootstrapIterations : 0

  const baselineSorted = [...baselineSamples].sort((a, b) => a - b)
  const upperSorted = [...upperSamples].sort((a, b) => a - b)
  const baselineP05 = percentile(baselineSorted, 0.05)
  const baselineP95 = percentile(baselineSorted, 0.95)
  const upperAnchorP05 = percentile(upperSorted, 0.05)
  const upperAnchorP95 = percentile(upperSorted, 0.95)

  const baselineCv = coefficientOfVariation(baselineSamples, baselineMean)
  const upperAnchorCv = coefficientOfVariation(upperSamples, upperAnchorMean)

  if (baselineSamples.length < config.bootstrapIterations) {
    failureReasons.push('bootstrap-incomplete')
  }
  if (options.zeroHeavy) {
    if (options.positiveCount < 10) {
      failureReasons.push('positive-sample-insufficient')
    }
    if (positiveAnchorRate < config.positiveAnchorRateMin) {
      failureReasons.push('positive-anchor-rate-low')
    }
    if (!(baselineP95 > baselineP05 + config.anchorGapEpsilon)) {
      failureReasons.push('baseline-range-invalid')
    }
    if (!(upperAnchorP95 > upperAnchorP05 + config.anchorGapEpsilon)) {
      failureReasons.push('upper-range-invalid')
    }
  } else {
    if (baselineCv != null && baselineCv > config.baselineCvMax) {
      failureReasons.push('baseline-cv-high')
    }
    if (upperAnchorCv != null && upperAnchorCv > config.upperAnchorCvMax) {
      failureReasons.push('upper-anchor-cv-high')
    }
    if (positiveAnchorRate < config.positiveAnchorRateMin) {
      failureReasons.push('positive-anchor-rate-low')
    }
    if (baselineP05 > 0 && baselineP95 / baselineP05 > config.bootstrapBaselineRangeMaxRatio) {
      failureReasons.push('baseline-range-wide')
    }
  }

  const uniqueFailures = [...new Set(failureReasons)]
  return {
    iterations: config.bootstrapIterations,
    seed,
    baselineMean,
    baselineStdDev: stdDev(baselineSamples),
    baselineCv,
    upperAnchorMean,
    upperAnchorStdDev: stdDev(upperSamples),
    upperAnchorCv,
    positiveAnchorRate,
    baselineP05,
    baselineP95,
    upperAnchorP05,
    upperAnchorP95,
    stable: uniqueFailures.length === 0,
    failureReasons: uniqueFailures,
  }
}

function relativeDiff(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null
  const denom = Math.max(Math.abs(a), ROLE_METRIC_STABILITY_CONFIG.anchorGapEpsilon)
  return Math.abs(a - b) / denom
}

export function runTrainValidationStability(
  trainValues: number[],
  validationValues: number[],
  config: RoleMetricStabilityConfig = ROLE_METRIC_STABILITY_CONFIG,
): TrainValidationResult {
  const failureReasons: string[] = []
  const trainWinsorizedMean = p95WinsorizedMean(trainValues)
  const validationWinsorizedMean = p95WinsorizedMean(validationValues)
  const trainP90 = computeMetricP90(trainValues)
  const validationP90 = computeMetricP90(validationValues)

  if (validationValues.length < config.trainValidationMinValidationSamples) {
    failureReasons.push('validation-sample-insufficient')
  }

  const baselineRelativeDiff = relativeDiff(trainWinsorizedMean, validationWinsorizedMean)
  const p90RelativeDiff = relativeDiff(trainP90, validationP90)

  if (
    trainWinsorizedMean == null ||
    validationWinsorizedMean == null ||
    trainP90 == null ||
    validationP90 == null
  ) {
    failureReasons.push('anchor-missing')
  } else {
    if (!(trainP90 > trainWinsorizedMean + config.anchorGapEpsilon)) {
      failureReasons.push('train-anchor-gap-invalid')
    }
    if (!(validationP90 > validationWinsorizedMean + config.anchorGapEpsilon)) {
      failureReasons.push('validation-anchor-gap-invalid')
    }
    if (
      baselineRelativeDiff != null &&
      baselineRelativeDiff > config.trainValidationBaselineMaxRelativeDiff
    ) {
      failureReasons.push('baseline-drift-high')
    }
    if (p90RelativeDiff != null && p90RelativeDiff > config.trainValidationP90MaxRelativeDiff) {
      failureReasons.push('p90-drift-high')
    }
  }

  const uniqueFailures = [...new Set(failureReasons)]
  return {
    trainCount: trainValues.length,
    validationCount: validationValues.length,
    trainWinsorizedMean,
    validationWinsorizedMean,
    trainP90,
    validationP90,
    baselineRelativeDiff,
    p90RelativeDiff,
    stable: uniqueFailures.length === 0,
    failureReasons: uniqueFailures,
  }
}

export function resolveLiveMetricEligibility(params: {
  readiness: EffectiveReadinessLevel
  bootstrap: BootstrapResult
  trainValidation: TrainValidationResult
  enableLive: boolean
}): boolean {
  if (!params.enableLive) return false
  if (params.readiness !== 'provisional' && params.readiness !== 'ready') return false
  if (!params.bootstrap.stable) return false
  if (!params.trainValidation.stable) return false
  return true
}
