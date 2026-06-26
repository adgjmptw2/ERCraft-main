export type PlayerAnalysisScope = 'all' | 'rank'

export type AnalysisRowSelection = 'overall' | 'recent20' | `character:${number}`

export type CohortConfidence = 'disabled' | 'tercile' | 'decile' | 'full'

export interface PlayerAnalysisMetricCardDTO {
  key: string
  label: string
  value: number | null
  displayValue: string
  percentileLabel: string
  percentileDisplay?: string | null
  comparisonLabel: string
  samplePlayers: number | null
  unavailable?: boolean
  percentile?: number | null
  grade?: string | null
}

export interface PlayerAnalysisRadarAxisDTO {
  axis: string
  label: string
  playerScore: number | null
  cohortMedian: number | null
}

export interface PlayerAnalysisRowComparisonDTO {
  comparisonType: string
  comparisonScope?: 'all' | 'rank'
  comparisonWindow?: 'season' | 'recent20'
  samplePlayers: number
  tierBand: string | null
  role: string | null
  characterNum?: number | null
  benchmarkVersion: string
  displayLabel: string
  comparisonMatched?: boolean
  comparisonUnavailableReason?: string | null
}

export interface PlayerAnalysisScopeRowDTO {
  type: 'overall' | 'recent20' | 'character'
  label: string
  subtitle?: string
  characterNum?: number
  characterName?: string
  characterRank?: number | null
  isTopCharacter?: boolean
  lastPlayedAt?: string | null
  games: number
  winRate: number | null
  top3Rate: number | null
  averagePlacement: number | null
  primaryRole: string | null
  overallScore: number | null
  grade: string | null
  gradeDisplay?: string | null
  percentile?: number | null
  percentileDisplay?: string | null
  confidence: 'exploratory' | 'provisional' | 'official' | 'withheld'
  playerConfidence?: 'exploratory' | 'provisional' | 'official' | 'withheld'
  cohortConfidence?: CohortConfidence
  metrics: PlayerAnalysisMetricCardDTO[]
  radarAxes: PlayerAnalysisRadarAxisDTO[]
  comparison: PlayerAnalysisRowComparisonDTO
}

export interface PlayerAnalysisResponseDTO {
  owner: {
    canonicalUid: string
    nickname: string
    seasonId: number
  }
  scope: PlayerAnalysisScope
  sourceFingerprint: string
  computedAt: string
  totals: {
    eligibleMatches: number
    includedRankMatches?: number
    rankMatches: number
    normalMatches: number
    excludedNormal?: number
    excludedCobalt: number
    excludedUnion: number
    excludedDuplicate: number
    excludedOwnership: number
  }
  rows: PlayerAnalysisScopeRowDTO[]
}
