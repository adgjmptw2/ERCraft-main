import { SHADOW_GRADE_BANDS } from './config.js'
import type { PlayerCharacterSnapshotRecord, ShadowGradeDistributionRow } from './types.js'
import { percentileRankMidrank } from './percentile.js'

export function assignShadowGradeFromPercentile(percentile: number | null): string | null {
  if (percentile == null || !Number.isFinite(percentile)) return null
  for (const band of SHADOW_GRADE_BANDS) {
    if (percentile >= band.minPercentile && percentile < band.maxPercentile) {
      return band.grade
    }
    if (band.grade === 'S+' && percentile >= band.minPercentile) return band.grade
  }
  return 'D-'
}

export function buildShadowGradeDistribution(
  snapshots: ReadonlyArray<PlayerCharacterSnapshotRecord>,
  params: { minCohortUsers: number },
): ShadowGradeDistributionRow[] {
  const eligible = snapshots.filter((row) => row.sampleStatus === 'benchmarkEligible')
  if (eligible.length < params.minCohortUsers) {
    return SHADOW_GRADE_BANDS.map((band) => ({
      grade: band.grade,
      assignedUsers: 0,
      boundaryScore: null,
    }))
  }

  const scores = eligible
    .map((row) => row.shadowScore)
    .filter((value): value is number => value != null && Number.isFinite(value))
  if (scores.length < params.minCohortUsers) {
    return SHADOW_GRADE_BANDS.map((band) => ({
      grade: band.grade,
      assignedUsers: 0,
      boundaryScore: null,
    }))
  }

  const assignments = new Map<string, number>()
  for (const band of SHADOW_GRADE_BANDS) {
    assignments.set(band.grade, 0)
  }

  for (const snapshot of eligible) {
    const score = snapshot.shadowScore
    if (score == null) continue
    const percentile = percentileRankMidrank(scores, score)
    const grade = assignShadowGradeFromPercentile(percentile)
    if (!grade) continue
    assignments.set(grade, (assignments.get(grade) ?? 0) + 1)
  }

  return SHADOW_GRADE_BANDS.map((band) => ({
    grade: band.grade,
    assignedUsers: assignments.get(band.grade) ?? 0,
    boundaryScore: percentileBoundaryScore(scores, band.minPercentile),
  }))
}

function percentileBoundaryScore(
  scores: ReadonlyArray<number>,
  percentile: number,
): number | null {
  const sorted = [...scores].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  if (index < 0 || index >= sorted.length) return null
  return sorted[index] ?? null
}
