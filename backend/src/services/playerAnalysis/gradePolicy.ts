import { assignShadowGradeFromPercentile } from '../playerCharacterSnapshot/gradeDistribution.js'
import { resolvePercentileCapability } from '../playerCharacterSnapshot/percentile.js'
import type { AnalysisConfidence } from './reliability.js'

export type CohortConfidence = 'disabled' | 'tercile' | 'decile' | 'full'

export function resolveCohortConfidence(samplePlayers: number): CohortConfidence {
  const capability = resolvePercentileCapability(samplePlayers)
  if (capability === 'disabled') return 'disabled'
  if (capability === 'tercile-only') return 'tercile'
  if (capability === 'decile') return 'decile'
  return 'full'
}

export function formatPercentileDisplay(percentile: number | null, samplePlayers: number): string {
  if (percentile == null || !Number.isFinite(percentile)) return '비교 표본 부족'
  const capability = resolvePercentileCapability(samplePlayers)
  if (capability === 'disabled') return '비교 표본 부족'
  const topPercent = Math.max(0, Math.min(100, 100 - percentile))
  if (capability === 'tercile-only') {
    if (topPercent <= 33) return '상위권'
    if (topPercent <= 66) return '중위권'
    return '하위권'
  }
  if (capability === 'decile') {
    const bucket = Math.max(1, Math.min(9, Math.ceil(topPercent / 10)))
    return `상위 ${bucket}0%대`
  }
  return `상위 ${Math.round(topPercent)}%`
}

export function resolveFormalGrade(params: {
  percentile: number | null
  samplePlayers: number
  playerConfidence: AnalysisConfidence
  comparisonMatched: boolean
}): {
  grade: string | null
  gradeDisplay: string | null
  percentileDisplay: string
  cohortConfidence: CohortConfidence
  comparisonUnavailableReason: string | null
} {
  const cohortConfidence = resolveCohortConfidence(params.samplePlayers)
  const percentileDisplay = formatPercentileDisplay(params.percentile, params.samplePlayers)

  if (!params.comparisonMatched) {
    return {
      grade: null,
      gradeDisplay: null,
      percentileDisplay: '비교 표본 부족',
      cohortConfidence,
      comparisonUnavailableReason: 'matching-benchmark-unavailable',
    }
  }

  if (params.playerConfidence === 'exploratory' || params.playerConfidence === 'withheld') {
    return {
      grade: null,
      gradeDisplay: null,
      percentileDisplay,
      cohortConfidence,
      comparisonUnavailableReason: null,
    }
  }

  if (cohortConfidence === 'disabled') {
    return {
      grade: null,
      gradeDisplay: null,
      percentileDisplay: '비교 표본 부족',
      cohortConfidence,
      comparisonUnavailableReason: null,
    }
  }

  if (cohortConfidence === 'tercile') {
    return {
      grade: null,
      gradeDisplay: percentileDisplay,
      percentileDisplay,
      cohortConfidence,
      comparisonUnavailableReason: null,
    }
  }

  if (cohortConfidence === 'decile' || params.playerConfidence === 'provisional') {
    return {
      grade: null,
      gradeDisplay: percentileDisplay,
      percentileDisplay,
      cohortConfidence,
      comparisonUnavailableReason: null,
    }
  }

  const grade = assignShadowGradeFromPercentile(params.percentile)
  return {
    grade,
    gradeDisplay: grade,
    percentileDisplay,
    cohortConfidence,
    comparisonUnavailableReason: null,
  }
}
