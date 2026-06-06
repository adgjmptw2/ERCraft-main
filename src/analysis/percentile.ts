import type { AnalysisGrade } from '@/analysis/types'

export function clampPercentile(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export interface PercentileRankParams {
  value: number
  populationValues: number[]
  higherIsBetter: boolean
}

export function calculatePercentileRank(params: PercentileRankParams): number | null {
  const { value, populationValues, higherIsBetter } = params
  if (populationValues.length === 0 || !Number.isFinite(value)) return null

  let below = 0
  let equal = 0
  for (const v of populationValues) {
    if (!Number.isFinite(v)) continue
    if (v < value) below++
    else if (v === value) equal++
  }

  const raw = ((below + equal * 0.5) / populationValues.length) * 100
  return clampPercentile(higherIsBetter ? raw : 100 - raw)
}

export function gradeFromPercentile(percentile: number): AnalysisGrade {
  if (percentile >= 90) return 'S'
  if (percentile >= 75) return 'A'
  if (percentile >= 50) return 'B'
  if (percentile >= 25) return 'C'
  return 'D'
}

export function mean(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v))
  if (valid.length === 0) return null
  return valid.reduce((s, v) => s + v, 0) / valid.length
}
