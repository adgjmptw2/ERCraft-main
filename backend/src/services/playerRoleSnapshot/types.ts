import type { PlayerCharacterBenchmarkScope } from '../playerCharacterSnapshot/config.js'
import type { ExclusiveTierBand } from '../playerAnalysis/tierBand.js'

export type RoleSnapshotWindow = 'season' | 'recent20'

export interface PlayerRoleSnapshotMetrics {
  winRate: number | null
  top3Rate: number | null
  averagePlacement: number | null
  damagePerMinute: number | null
  visionPerMinute: number | null
  teamKillParticipation: number | null
  averageKills: number | null
  averageDeaths: number | null
  averageSurvivalTime: number | null
  consistencyScore: number | null
  radarAxes: Record<string, number>
}

export interface PlayerRoleSnapshotRecord {
  id: string
  canonicalUid: string
  displaySeasonId: number
  apiSeasonId: number
  rowType: RoleSnapshotWindow
  primaryRole: string
  benchmarkScope: PlayerCharacterBenchmarkScope
  benchmarkVersion: string
  eligibleMatches: number
  overallScore: number | null
  tierBand: ExclusiveTierBand | null
  metrics: PlayerRoleSnapshotMetrics
  sourceFingerprint: string
  computedAt: Date
}
