import type { MatchSummary } from '@/types/match'
import type { ProductionAnalysisAxesDTO, TeamPerformanceSummaryDTO } from '@/types/player'

export type AnalysisGrade =
  | 'S+'
  | 'S'
  | 'S-'
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D+'
  | 'D'
  | 'D-'

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
  overallPerformanceScore?: number | null
  overallScoreSource?:
    | 'overall-v2-hybrid'
    | 'overall-aggregate-grade-v2'
    | 'overall-aggregate-grade-v3'
    | 'overall-aggregate-grade-v4'
    | 'character-grade-weighted-average'
    | 'character-grade-weighted-average-fallback'
    | 'legacy-profile-analysis'
    | 'unavailable'
  basePerformanceScore?: number | null
  outcomePerformanceScore?: number | null
  consistencyScore?: number | null
  outcomeModifier?: number
  consistencyModifier?: number
  totalModifier?: number
  overallConfidence?: number
  overallConfidenceLabel?: 'high' | 'medium' | 'low' | 'insufficient'
  gradedCharacterCount?: number
  weightedMatchCount?: number
  teamPerformanceSummary?: TeamPerformanceSummaryDTO
  confidenceStatus?: 'ready' | 'low-sample' | 'unavailable'
  /** @deprecated empirical percentile only. Do not store performanceScore here. */
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
  characterNum?: number
  characterName: string
  matchCount: number
  avgPlacement: number
  avgKills: number
  avgAssists: number
  /** 경기당 평균 팀 킬 */
  avgTeamKills: number | null
  /** 경기당 평균 플레이어 대상 딜량 */
  avgDamageToPlayers: number | null
  kda: number
  /** 해당 캐릭터 랭크 경기 RP 변동 합계 */
  totalRpDelta?: number | null
  top3Rate: number
  winRate: number
  overallScore: number | null
}

export interface CharacterAnalysisReport extends CharacterAnalysisSummary {
  status: CharacterAnalysisStatus
  overallGrade: AnalysisGrade | null
  gradeLabel: string
  grade?: import('@/utils/characterGrade').CharacterFineGrade | null
  gradeScore?: number | null
  gradeStatus?:
    | 'ok'
    | 'insufficient-sample'
    | 'partial-data'
    | 'missing-baseline'
  gradeConfidence?: 'insufficient' | 'provisional' | 'low' | 'medium' | 'high' | null
  gradeSampleSize?: number
  gradeBaselineTierKey?: string | null
  gradeRole?: string | null
  gradeUsedFallback?: boolean
  gradeFallback?: {
    used: boolean
    baselineLevel: string
    normalization: string
    combat: string
    reasons: string[]
  }
  gradeAggregation?: {
    aggregationPolicy: 'plain-mean-k1' | 'robust-weighted-10pct'
    matchCount: number
    tailCount: number
    lowTailWeight: number
    highTailWeight: number
    ordinaryMean: number | null
    robustRaw: number | null
    confidence: number
    finalScore: number | null
    grade: import('@/utils/characterGrade').CharacterFineGrade | null
    presetVersion: string
  }
  analysisAxes?: ProductionAnalysisAxesDTO
  feedback: string
}
