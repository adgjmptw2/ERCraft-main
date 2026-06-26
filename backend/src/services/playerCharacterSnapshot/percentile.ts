import { quantileInterpolated } from '../../analysis/shadow/matchGradePercentileCalibration.js'
import {
  COHORT_PERCENTILE_THRESHOLDS,
  SHADOW_PERCENTILE_POINTS,
  type ShadowAuditMetricKey,
} from './config.js'
import type { PlayerCharacterSnapshotRecord, ShadowPercentileTable } from './types.js'

export function resolvePercentileCapability(
  uniqueUsers: number,
): 'disabled' | 'tercile-only' | 'decile' | 'full-percent' | 'high-confidence' {
  if (uniqueUsers < COHORT_PERCENTILE_THRESHOLDS.disabledBelow) return 'disabled'
  if (uniqueUsers <= COHORT_PERCENTILE_THRESHOLDS.tercileMax) return 'tercile-only'
  if (uniqueUsers <= COHORT_PERCENTILE_THRESHOLDS.decileMax) return 'decile'
  if (uniqueUsers <= COHORT_PERCENTILE_THRESHOLDS.fullPercentMax) return 'full-percent'
  return 'high-confidence'
}

export function readMetricValue(
  snapshot: PlayerCharacterSnapshotRecord,
  metric: ShadowAuditMetricKey,
): number | null {
  const value = snapshot[metric]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function computePercentileTable(params: {
  cohortKey: string
  metric: ShadowAuditMetricKey
  snapshots: ReadonlyArray<PlayerCharacterSnapshotRecord>
  benchmarkEligibleOnly?: boolean
}): ShadowPercentileTable {
  const pool = params.benchmarkEligibleOnly
    ? params.snapshots.filter((row) => row.sampleStatus === 'benchmarkEligible')
    : [...params.snapshots]
  const values = pool
    .map((row) => readMetricValue(row, params.metric))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b)

  const percentiles: Record<string, number | null> = {}
  for (const point of SHADOW_PERCENTILE_POINTS) {
    const key = `p${String(Math.round(point * 100)).padStart(2, '0')}`
    percentiles[key] = quantileInterpolated(values, point)
  }

  return {
    metric: params.metric,
    cohortKey: params.cohortKey,
    sampleSize: values.length,
    percentiles,
  }
}

export function percentileRankMidrank(values: ReadonlyArray<number>, target: number): number | null {
  if (values.length === 0 || !Number.isFinite(target)) return null
  const sorted = [...values].sort((a, b) => a - b)
  const below = sorted.filter((value) => value < target).length
  const equal = sorted.filter((value) => value === target).length
  return ((below + equal / 2) / sorted.length) * 100
}
