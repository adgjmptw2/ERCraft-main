import type { ProductionAnalysisAxesContract } from '../../contracts/player.js'
import type { ExclusiveTierBand } from './tierBand.js'
import type { ComparisonType } from './benchmark.js'
import type { AnalysisConfidence } from './reliability.js'
import type { CohortConfidence } from './gradePolicy.js'

export type PlayerAnalysisScope = 'all' | 'rank'
export type ComparisonScope = 'all' | 'rank'
export type ComparisonWindow = 'season' | 'recent20'

export interface PlayerAnalysisMetricCard {
  key: string
  label: string
  value: number | null
  displayValue: string
  percentileLabel: string
  comparisonLabel: string
  samplePlayers: number | null
  unavailable?: boolean
  percentile?: number | null
  percentileDisplay?: string
  grade?: string | null
}

export interface PlayerAnalysisRadarAxis {
  axis: string
  label: string
  playerScore: number | null
  cohortMedian: number | null
}

export interface PlayerAnalysisRowComparison {
  comparisonType: ComparisonType
  comparisonScope: ComparisonScope
  comparisonWindow: ComparisonWindow
  samplePlayers: number
  tierBand: ExclusiveTierBand | null
  role: string | null
  characterNum?: number | null
  benchmarkVersion: string
  displayLabel: string
  comparisonMatched: boolean
  comparisonUnavailableReason: string | null
}

export interface PlayerAnalysisScopeRowBase {
  games: number
  winRate: number | null
  top3Rate: number | null
  averagePlacement: number | null
  primaryRole: string | null
  overallScore: number | null
  grade: string | null
  gradeDisplay: string | null
  percentile: number | null
  percentileDisplay: string | null
  confidence: AnalysisConfidence
  playerConfidence: AnalysisConfidence
  cohortConfidence: CohortConfidence
  metrics: PlayerAnalysisMetricCard[]
  radarAxes: PlayerAnalysisRadarAxis[]
  comparison: PlayerAnalysisRowComparison
}

export interface PlayerAnalysisOverallRow extends PlayerAnalysisScopeRowBase {
  type: 'overall'
  label: string
  subtitle: string
}

export interface PlayerAnalysisRecent20Row extends PlayerAnalysisScopeRowBase {
  type: 'recent20'
  label: string
  subtitle: string
}

export interface PlayerAnalysisCharacterRow extends PlayerAnalysisScopeRowBase {
  type: 'character'
  characterNum: number
  characterName: string
  label: string
  characterRank: number | null
  isTopCharacter: boolean
  lastPlayedAt: string | null
}

export type PlayerAnalysisScopeRow =
  | PlayerAnalysisOverallRow
  | PlayerAnalysisRecent20Row
  | PlayerAnalysisCharacterRow

export interface PlayerAnalysisTotals {
  eligibleMatches: number
  includedRankMatches: number
  rankMatches: number
  normalMatches: number
  excludedNormal: number
  excludedCobalt: number
  excludedUnion: number
  excludedDuplicate: number
  excludedOwnership: number
}

export interface PlayerAnalysisResponse {
  owner: {
    canonicalUid: string
    nickname: string
    seasonId: number
  }
  scope: PlayerAnalysisScope
  sourceFingerprint: string
  computedAt: string
  totals: PlayerAnalysisTotals
  rows: PlayerAnalysisScopeRow[]
  productionAxesVersion?: string
}

export interface ScopedRowMetrics {
  games: number
  winRate: number | null
  top3Rate: number | null
  averagePlacement: number | null
  averageKills: number | null
  averageAssists: number | null
  averageDeaths: number | null
  damagePerMinute: number | null
  visionPerMinute: number | null
  teamKillParticipation: number | null
  averageSurvivalTime: number | null
  consistencyScore: number | null
  overallScore: number | null
  primaryRole: string | null
  tierBand: ExclusiveTierBand
  analysisAxes: ProductionAnalysisAxesContract | null
}
