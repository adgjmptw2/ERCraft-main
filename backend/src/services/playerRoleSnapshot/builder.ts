import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import { filterRowsForShadowBenchmark } from '../playerCharacterSnapshot/matchFilter.js'
import type { PlayerCharacterBenchmarkScope } from '../playerCharacterSnapshot/config.js'
import { PLAYER_ANALYSIS_BENCHMARK_VERSION } from '../playerCharacterSnapshot/config.js'
import { aggregateScopedRowMetrics, sortRowsByRecency } from '../playerAnalysis/aggregate.js'
import { buildRoleSourceFingerprint, roleSnapshotId } from './fingerprint.js'
import type { PlayerRoleSnapshotRecord, RoleSnapshotWindow } from './types.js'

export function buildPlayerRoleSnapshots(params: {
  rows: ReadonlyArray<PlayerMatchRow>
  canonicalUid: string
  displaySeasonId: number
  apiSeasonId: number
  benchmarkScope: PlayerCharacterBenchmarkScope
}): PlayerRoleSnapshotRecord[] {
  const filtered = filterRowsForShadowBenchmark({
    rows: params.rows,
    canonicalUid: params.canonicalUid,
    scope: params.benchmarkScope,
    displaySeasonId: params.displaySeasonId,
    apiSeasonId: params.apiSeasonId,
  })
  const allRows = sortRowsByRecency(filtered.rows)
  const recentRows = allRows.slice(0, 20)

  const windows: Array<{ rowType: RoleSnapshotWindow; rows: PlayerMatchRow[] }> = [
    { rowType: 'season', rows: allRows },
    { rowType: 'recent20', rows: recentRows },
  ]

  const records: PlayerRoleSnapshotRecord[] = []
  for (const window of windows) {
    if (window.rows.length === 0) continue
    const metrics = aggregateScopedRowMetrics({
      rows: window.rows,
      displaySeasonId: params.displaySeasonId,
      apiSeasonId: params.apiSeasonId,
    })
    if (!metrics.primaryRole) continue

    const radarAxes: Record<string, number> = {}
    for (const axis of metrics.analysisAxes?.axes ?? []) {
      if (axis.score != null && Number.isFinite(axis.score)) {
        radarAxes[axis.axis] = axis.score
      }
    }

    const fingerprint = buildRoleSourceFingerprint(window.rows.map((row) => row.gameId))
    records.push({
      id: roleSnapshotId({
        canonicalUid: params.canonicalUid,
        displaySeasonId: params.displaySeasonId,
        primaryRole: metrics.primaryRole,
        rowType: window.rowType,
        benchmarkScope: params.benchmarkScope,
        benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
      }),
      canonicalUid: params.canonicalUid,
      displaySeasonId: params.displaySeasonId,
      apiSeasonId: params.apiSeasonId,
      rowType: window.rowType,
      primaryRole: metrics.primaryRole,
      benchmarkScope: params.benchmarkScope,
      benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
      eligibleMatches: metrics.games,
      overallScore: metrics.overallScore,
      tierBand: metrics.tierBand,
      metrics: {
        winRate: metrics.winRate,
        top3Rate: metrics.top3Rate,
        averagePlacement: metrics.averagePlacement,
        damagePerMinute: metrics.damagePerMinute,
        visionPerMinute: metrics.visionPerMinute,
        teamKillParticipation: metrics.teamKillParticipation,
        averageKills: metrics.averageKills,
        averageDeaths: metrics.averageDeaths,
        averageSurvivalTime: metrics.averageSurvivalTime,
        consistencyScore: metrics.consistencyScore,
        radarAxes,
      },
      sourceFingerprint: fingerprint,
      computedAt: new Date(),
    })
  }

  return records
}
