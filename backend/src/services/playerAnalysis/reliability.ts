export const ANALYSIS_RELIABILITY_K = 15

export type AnalysisConfidence = 'exploratory' | 'provisional' | 'official' | 'withheld'

export function resolveAnalysisConfidence(games: number): AnalysisConfidence {
  if (games >= 20) return 'official'
  if (games >= 10) return 'provisional'
  if (games >= 3) return 'exploratory'
  return 'withheld'
}

export function applyReliabilityShrink(params: {
  playerScore: number | null
  cohortMean: number | null
  games: number
  k?: number
}): number | null {
  const { playerScore, cohortMean, games } = params
  const k = params.k ?? ANALYSIS_RELIABILITY_K
  if (playerScore == null || !Number.isFinite(playerScore)) return null
  if (cohortMean == null || !Number.isFinite(cohortMean)) return playerScore
  if (games <= 0) return null
  const reliability = games / (games + k)
  return reliability * playerScore + (1 - reliability) * cohortMean
}
