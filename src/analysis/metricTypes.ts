export type AnalysisMetricAvailability =
  | 'available'
  | 'derived'
  | 'requiresMatchDetail'
  | 'requiresDataset'
  | 'unavailable'

export type AnalysisMetricCategory =
  | 'result'
  | 'combat'
  | 'survival'
  | 'macro'
  | 'support'
  | 'consistency'
  | 'team'

export type AnalysisMetricValueType = 'number' | 'percent' | 'time' | 'score' | 'text'

export type AnalysisMetricStatus = 'ready' | 'partial' | 'future' | 'unavailable'

export type AnalysisMetricTone = 'positive' | 'neutral' | 'warning'

export type AnalysisDataConfidence = 'high' | 'medium' | 'low' | 'insufficient'

export interface AnalysisMetricDefinition {
  id: string
  label: string
  category: AnalysisMetricCategory
  availability: AnalysisMetricAvailability
  description: string
  sourceHint: string
  valueType: AnalysisMetricValueType
  higherIsBetter: boolean
  isPrimary: boolean
  requiresTeamDetail: boolean
  requiresPopulationDataset: boolean
  /** 역할 추정·가중치 등 실험 지표 — UI 핵심 노출 제외 */
  experimental?: boolean
  hidden?: boolean
}

export interface AnalysisMetricViewModel {
  id: string
  label: string
  value: number | string | null
  formattedValue: string
  unit?: string
  description: string
  category: AnalysisMetricCategory
  availability: AnalysisMetricAvailability
  status: AnalysisMetricStatus
  tone: AnalysisMetricTone
  helperText?: string
  isPrimary: boolean
}

export interface AnalysisSectionViewModel {
  id: AnalysisMetricCategory
  label: string
  metrics: AnalysisMetricViewModel[]
}

export interface PlayerAnalysisViewModel {
  sampleSize: number
  sampleLabel: string
  headline: string
  insightLine: string
  dataConfidence: AnalysisDataConfidence
  /** 추정 성향 — 확정 역할 판정 아님 */
  estimatedTendency: string | null
  secondaryTendency: string | null
  rolePrimaryLabel: string | null
  roleSecondaryLabel: string | null
  roleConfidence: 'low' | 'medium' | 'high' | null
  roleReasonSummary: string | null
  playStyleBasisLabel: string
  summaryMetrics: AnalysisMetricViewModel[]
  sections: AnalysisSectionViewModel[]
  radarAxes: {
    axis: string
    label: string
    score: number
    keyword: string
  }[]
  chartData: { subject: string; value: number; referenceAvg: number; fullMark: number }[]
  analysisScore: number | null
  futureMetrics: AnalysisMetricViewModel[]
  unavailableMetrics: AnalysisMetricViewModel[]
  strengths: string[]
  improvements: string[]
  dataNote: string | null
}
