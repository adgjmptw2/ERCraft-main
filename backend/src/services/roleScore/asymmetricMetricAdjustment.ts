export const ASYMMETRIC_METRIC_ADJUSTMENT_VERSION = 'metric-adjust-asym-v1'
export const ASYMMETRIC_METRIC_NEUTRAL = 65

export type AsymmetricMetricAdjustmentPolicy =
  | 'unadjusted'
  | 'severe-low-1.00'
  | 'mild-low-0.75'
  | 'neutral'
  | 'strength-1.20'
  | 'exceptional-strength-1.35'
  | 'clamped-min-30'
  | 'clamped-max-95'

export interface AsymmetricMetricAdjustmentResult {
  rawMetricScore: number
  adjustedMetricScore: number
  adjustmentPolicy: AsymmetricMetricAdjustmentPolicy
  version: typeof ASYMMETRIC_METRIC_ADJUSTMENT_VERSION
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 4): number {
  return Math.round(value * 10 ** digits) / 10 ** digits
}

export function asymmetricMetricAdjustment(rawMetricScore: number): AsymmetricMetricAdjustmentResult | null {
  if (!Number.isFinite(rawMetricScore)) return null

  let adjusted: number
  let policy: AsymmetricMetricAdjustmentPolicy

  if (rawMetricScore < 50) {
    adjusted = 65 + (50 - 65) * 0.75 + (rawMetricScore - 50)
    policy = 'severe-low-1.00'
  } else if (rawMetricScore < 65) {
    adjusted = 65 + (rawMetricScore - 65) * 0.75
    policy = 'mild-low-0.75'
  } else if (rawMetricScore === 65) {
    adjusted = 65
    policy = 'neutral'
  } else if (rawMetricScore <= 80) {
    adjusted = 65 + (rawMetricScore - 65) * 1.2
    policy = 'strength-1.20'
  } else {
    adjusted = 65 + (80 - 65) * 1.2 + (rawMetricScore - 80) * 1.35
    policy = 'exceptional-strength-1.35'
  }

  const clamped = clamp(adjusted, 30, 95)
  if (clamped <= 30 && adjusted < 30) policy = 'clamped-min-30'
  if (clamped >= 95 && adjusted > 95) policy = 'clamped-max-95'

  return {
    rawMetricScore: round(rawMetricScore),
    adjustedMetricScore: round(clamped),
    adjustmentPolicy: policy,
    version: ASYMMETRIC_METRIC_ADJUSTMENT_VERSION,
  }
}
