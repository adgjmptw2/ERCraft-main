import { NORMALIZATION_EPSILON } from '../services/characterPerformanceGrade/config.js'

export const ROLE_METRIC_STABILITY_CONFIG = {
  bootstrapIterations: 500,
  bootstrapSeed: 391108,
  baselineCvMax: 0.15,
  upperAnchorCvMax: 0.2,
  positiveAnchorRateMin: 0.95,
  anchorGapEpsilon: NORMALIZATION_EPSILON,
  trainValidationBaselineMaxRelativeDiff: 0.25,
  trainValidationP90MaxRelativeDiff: 0.3,
  trainValidationMinValidationSamples: 30,
  bootstrapBaselineRangeMaxRatio: 10,
  zeroHeavyMeanEpsilon: 1,
} as const

export type RoleMetricStabilityConfig = typeof ROLE_METRIC_STABILITY_CONFIG
