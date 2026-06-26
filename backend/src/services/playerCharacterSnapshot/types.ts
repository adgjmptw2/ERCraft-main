import type {
  PlayerCharacterBenchmarkScope,
  PlayerCharacterSampleStatus,
  ShadowAuditMetricKey,
} from './config.js'

export interface PlayerCharacterSnapshotMetrics {
  eligibleMatches: number
  averagePlacement: number | null
  winRate: number | null
  top3Rate: number | null
  averageKills: number | null
  averageDeaths: number | null
  teamKillParticipation: number | null
  damagePerMinute: number | null
  damageShare: number | null
  visionPerMinute: number | null
  averageSurvivalTime: number | null
  consistencyScore: number | null
  shadowScore: number | null
  primaryRole: string | null
  tierBand: string | null
  sampleWindowStart: Date
  sampleWindowEnd: Date
}

export interface PlayerCharacterSnapshotRecord extends PlayerCharacterSnapshotMetrics {
  id: string
  canonicalUid: string
  displaySeasonId: number
  apiSeasonId: number
  characterNum: number
  benchmarkScope: PlayerCharacterBenchmarkScope
  benchmarkVersion: string
  sampleStatus: PlayerCharacterSampleStatus
  sourceFingerprint: string
  computedAt: Date
}

export interface MatchFilterStats {
  totalRowsScanned: number
  excludedInvalidGameId: number
  excludedUnsupportedMode: number
  excludedOwnershipMismatch: number
  excludedMissingParticipant: number
  excludedDuplicateGameId: number
  eligibleRows: number
}

export interface SnapshotBuildStats {
  created: number
  updated: number
  reused: number
  snapshotsWritten: number
}

export interface CohortReadiness {
  uniqueUsers: number
  avgEligibleMatches: number | null
  medianEligibleMatches: number | null
  metricNullRates: Record<string, number>
  tierDistribution: Record<string, number>
  roleDistribution: Record<string, number>
  percentileCapability:
    | 'disabled'
    | 'tercile-only'
    | 'decile'
    | 'full-percent'
    | 'high-confidence'
}

export interface CharacterSampleCounts {
  characterNum: number
  users3Plus: number
  users10Plus: number
  users20Plus: number
}

export interface ShadowPercentileTable {
  metric: ShadowAuditMetricKey
  cohortKey: string
  sampleSize: number
  percentiles: Record<string, number | null>
}

export interface ShadowGradeDistributionRow {
  grade: string
  assignedUsers: number
  boundaryScore: number | null
}

export interface PlayerCharacterShadowAuditReport {
  generatedAt: string
  displaySeasonId: number
  apiSeasonId: number
  benchmarkScope: PlayerCharacterBenchmarkScope
  benchmarkVersion: string
  uniqueUsers: number
  snapshotCount: number
  buildStats: SnapshotBuildStats
  filterStats: MatchFilterStats
  characterSampleCounts: CharacterSampleCounts[]
  tierUserCounts: Record<string, number>
  roleUserCounts: Record<string, number>
  metricNullRates: Record<string, number>
  cohorts: {
    byCharacter: Record<string, CohortReadiness>
    byCharacterTier: Record<string, CohortReadiness>
    byRoleTier: Record<string, CohortReadiness>
  }
  percentiles: ShadowPercentileTable[]
  gradeDistributions: Record<string, ShadowGradeDistributionRow[]>
  sufficientCharacterCount: number
  insufficientCharacterCount: number
  limitations: string[]
}
