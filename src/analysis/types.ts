import type { MatchSummary } from '@/types/match'

export type AnalysisGrade = 'S' | 'A' | 'B' | 'C' | 'D'

export type AnalysisMetricKey =
  | 'avgPlacement'
  | 'avgKills'
  | 'avgAssists'
  | 'kda'
  | 'top3Rate'
  | 'winRate'

export type MetricDirection = 'higher-better' | 'lower-better'

export interface PlayerMetricSnapshot {
  avgPlacement: number
  avgKills: number
  avgAssists: number
  kda: number
  top3Rate: number
  winRate: number
  matchCount: number
}

export interface MetricComparison {
  key: AnalysisMetricKey
  label: string
  direction: MetricDirection
  playerValue: number | null
  populationMean: number | null
  percentile: number | null
  grade: AnalysisGrade | null
  description: string
}

export interface FeedbackItem {
  type: 'strength' | 'weakness' | 'info'
  message: string
}

export interface PlayerAnalysisReport {
  status: 'ok' | 'insufficient'
  overallGrade: AnalysisGrade | null
  overallPercentile: number | null
  summary: string
  metrics: MetricComparison[]
  strengths: FeedbackItem[]
  weaknesses: FeedbackItem[]
  feedbackItems: FeedbackItem[]
  sampleSize: number
  baselineLabel: string
  playerMatchCount: number
  bestCharacter: { name: string; avgPlacement: number; games: number } | null
}

export interface BuildPlayerAnalysisReportParams {
  nickname: string
  playerMatches: MatchSummary[]
  populationMetrics: PlayerMetricSnapshot[]
  baselineLabel?: string
  minPlayerMatches?: number
  minPopulationSize?: number
}

export type CharacterAnalysisStatus = 'ok' | 'insufficient-sample'

export interface CharacterAnalysisSummary {
  characterName: string
  matchCount: number
  avgPlacement: number
  avgKills: number
  avgAssists: number
  kda: number
  top3Rate: number
  winRate: number
  overallScore: number | null
}

export interface CharacterAnalysisReport extends CharacterAnalysisSummary {
  status: CharacterAnalysisStatus
  overallGrade: AnalysisGrade | null
  gradeLabel: string
  feedback: string
}
