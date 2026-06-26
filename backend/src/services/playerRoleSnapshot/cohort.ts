import type { PrismaClient } from '@prisma/client'

import type { PlayerCharacterBenchmarkScope } from '../playerCharacterSnapshot/config.js'
import { resolveExclusiveTierBandFromTierKey } from '../playerAnalysis/tierBand.js'
import type { RoleSnapshotWindow } from './types.js'

export interface RoleCohortRow {
  canonicalUid: string
  primaryRole: string
  tierBand: string | null
  overallScore: number | null
  eligibleMatches: number
  metrics: {
    winRate?: number | null
    top3Rate?: number | null
    averagePlacement?: number | null
    damagePerMinute?: number | null
    visionPerMinute?: number | null
    teamKillParticipation?: number | null
    averageKills?: number | null
    averageDeaths?: number | null
    averageSurvivalTime?: number | null
    consistencyScore?: number | null
    radarAxes?: Record<string, number>
  } | null
}

export async function loadRoleCohortRows(
  prisma: PrismaClient,
  params: {
    displaySeasonId: number
    benchmarkScope: PlayerCharacterBenchmarkScope
    window: RoleSnapshotWindow
    benchmarkVersion: string
  },
): Promise<RoleCohortRow[]> {
  if (typeof (prisma as unknown as Record<string, unknown>).playerRolePerformanceSnapshot !== 'object') {
    return []
  }

  const rows = await prisma.playerRolePerformanceSnapshot.findMany({
    where: {
      displaySeasonId: params.displaySeasonId,
      benchmarkScope: params.benchmarkScope,
      rowType: params.window,
      benchmarkVersion: params.benchmarkVersion,
    },
  })

  return rows.map((row) => ({
    canonicalUid: row.canonicalUid,
    primaryRole: row.primaryRole,
    tierBand: row.tierBand,
    overallScore: row.overallScore,
    eligibleMatches: row.eligibleMatches,
    metrics: (row.metrics as RoleCohortRow['metrics']) ?? null,
  }))
}

export function dedupeCharacterSnapshotsForRole(
  snapshots: ReadonlyArray<{
    canonicalUid: string
    characterNum: number
    tierBand: string | null
    primaryRole: string | null
    shadowScore: number | null
    eligibleMatches: number
    damagePerMinute: number | null
    visionPerMinute: number | null
    teamKillParticipation: number | null
    averagePlacement: number | null
    winRate: number | null
    consistencyScore: number | null
    averageKills: number | null
    averageDeaths: number | null
    averageSurvivalTime: number | null
  }>,
): typeof snapshots {
  const bestByUidRole = new Map<string, (typeof snapshots)[number]>()
  for (const row of snapshots) {
    if (!row.primaryRole || row.shadowScore == null) continue
    const band = resolveExclusiveTierBandFromTierKey(row.tierBand ?? 'unranked')
    const key = `${row.canonicalUid}:${row.primaryRole}:${band}`
    const existing = bestByUidRole.get(key)
    if (!existing || row.eligibleMatches > existing.eligibleMatches) {
      bestByUidRole.set(key, row)
    }
  }
  return [...bestByUidRole.values()]
}

export function buildRoleCohortMaps(rows: ReadonlyArray<RoleCohortRow>): {
  byRoleTier: Map<string, number[]>
  uniquePlayersByRoleTier: Map<string, number>
  roleMetricPools: Map<string, Map<string, number[]>>
  roleAxisPools: Map<string, Map<string, number[]>>
} {
  const byRoleTier = new Map<string, number[]>()
  const uniquePlayersByRoleTier = new Map<string, number>()
  const roleMetricPools = new Map<string, Map<string, number[]>>()
  const roleAxisPools = new Map<string, Map<string, number[]>>()

  const metricKeys = [
    'overallScore',
    'winRate',
    'top3Rate',
    'averagePlacement',
    'damagePerMinute',
    'visionPerMinute',
    'teamKillParticipation',
    'averageKills',
    'averageDeaths',
    'averageSurvivalTime',
    'consistencyScore',
  ] as const

  for (const row of rows) {
    if (row.overallScore == null || !row.primaryRole) continue
    const band = resolveExclusiveTierBandFromTierKey(row.tierBand ?? 'unranked')
    const roleKey = `${row.primaryRole}:${band}`

    const scoreBucket = byRoleTier.get(roleKey) ?? []
    scoreBucket.push(row.overallScore)
    byRoleTier.set(roleKey, scoreBucket)
    uniquePlayersByRoleTier.set(roleKey, scoreBucket.length)

    for (const key of metricKeys) {
      const value =
        key === 'overallScore'
          ? row.overallScore
          : (row.metrics as Record<string, number | null> | null)?.[key] ?? null
      if (value == null || !Number.isFinite(value)) continue
      const metricMap = roleMetricPools.get(key) ?? new Map<string, number[]>()
      const pool = metricMap.get(roleKey) ?? []
      pool.push(value)
      metricMap.set(roleKey, pool)
      roleMetricPools.set(key, metricMap)
    }

    const axes = row.metrics?.radarAxes ?? {}
    for (const [axis, score] of Object.entries(axes)) {
      if (!Number.isFinite(score)) continue
      const axisMap = roleAxisPools.get(axis) ?? new Map<string, number[]>()
      const pool = axisMap.get(roleKey) ?? []
      pool.push(score)
      axisMap.set(roleKey, pool)
      roleAxisPools.set(axis, axisMap)
    }
  }

  return { byRoleTier, uniquePlayersByRoleTier, roleMetricPools, roleAxisPools }
}

export function medianFromPool(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  }
  return sorted[mid] ?? null
}

export function buildCohortAxisMedians(
  roleAxisPools: Map<string, Map<string, number[]>>,
  roleKey: string,
): Map<string, number> {
  const medians = new Map<string, number>()
  for (const [axis, pools] of roleAxisPools) {
    const values = pools.get(roleKey) ?? []
    const med = medianFromPool(values)
    if (med != null) medians.set(axis, Math.round(med * 100) / 100)
  }
  return medians
}
