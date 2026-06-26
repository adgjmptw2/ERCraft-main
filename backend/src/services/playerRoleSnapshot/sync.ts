import type { PrismaClient } from '@prisma/client'

import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import type { PlayerCharacterBenchmarkScope } from '../playerCharacterSnapshot/config.js'
import { PLAYER_ANALYSIS_BENCHMARK_VERSION } from '../playerCharacterSnapshot/config.js'
import { resolveExclusiveTierBandFromTierKey } from '../playerAnalysis/tierBand.js'
import { buildPlayerRoleSnapshots } from './builder.js'
import { writePlayerRoleSnapshots } from './store.js'
import {
  buildRoleCohortMaps,
  dedupeCharacterSnapshotsForRole,
  loadRoleCohortRows,
} from './cohort.js'

export async function upsertUserRoleSnapshots(
  prisma: PrismaClient,
  params: {
    rows: ReadonlyArray<PlayerMatchRow>
    canonicalUid: string
    displaySeasonId: number
    apiSeasonId: number
    benchmarkScope: PlayerCharacterBenchmarkScope
  },
): Promise<void> {
  const records = buildPlayerRoleSnapshots({
    rows: params.rows,
    canonicalUid: params.canonicalUid,
    displaySeasonId: params.displaySeasonId,
    apiSeasonId: params.apiSeasonId,
    benchmarkScope: params.benchmarkScope,
  })
  await writePlayerRoleSnapshots(prisma, records)
}

export async function syncSeasonRoleSnapshots(
  prisma: PrismaClient,
  params: {
    displaySeasonId: number
    apiSeasonId: number
    benchmarkScope: PlayerCharacterBenchmarkScope
    limit?: number
  },
): Promise<number> {
  const uids = await prisma.playerMatch.findMany({
    where: {
      displaySeasonId: params.displaySeasonId,
      apiSeasonId: params.apiSeasonId,
      gameMode: { in: ['rank', 'normal'] },
    },
    distinct: ['uid'],
    select: { uid: true },
    take: params.limit,
  })

  let synced = 0
  for (const { uid } of uids) {
    const rows = (await prisma.playerMatch.findMany({
      where: {
        uid,
        displaySeasonId: params.displaySeasonId,
        apiSeasonId: params.apiSeasonId,
        gameMode: { in: ['rank', 'normal'] },
      },
    })) as PlayerMatchRow[]
    if (rows.length === 0) continue
    await upsertUserRoleSnapshots(prisma, {
      rows,
      canonicalUid: uid,
      displaySeasonId: params.displaySeasonId,
      apiSeasonId: params.apiSeasonId,
      benchmarkScope: params.benchmarkScope,
    })
    synced += 1
  }
  return synced
}

async function loadCharacterSnapshotsStrict(
  prisma: PrismaClient,
  params: {
    displaySeasonId: number
    benchmarkScope: PlayerCharacterBenchmarkScope
  },
) {
  if (typeof (prisma as unknown as Record<string, unknown>).playerCharacterPerformanceSnapshot !== 'object') {
    return []
  }
  return prisma.playerCharacterPerformanceSnapshot.findMany({
    where: {
      displaySeasonId: params.displaySeasonId,
      benchmarkScope: params.benchmarkScope,
      sampleStatus: 'benchmarkEligible',
    },
  })
}

export function buildCharacterCohortMaps(
  snapshots: ReadonlyArray<{
    canonicalUid: string
    characterNum: number
    tierBand: string | null
    shadowScore: number | null
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
): {
  byCharacterTier: Map<string, number[]>
  metricPools: Map<string, Map<string, number[]>>
} {
  const byCharacterTier = new Map<string, number[]>()
  const metricPools = new Map<string, Map<string, number[]>>()
  const bestByCharUid = new Map<string, (typeof snapshots)[number]>()

  for (const row of snapshots) {
    if (row.shadowScore == null) continue
    const band = resolveExclusiveTierBandFromTierKey(row.tierBand ?? 'unranked')
    const uidKey = `${row.characterNum}:${band}:${row.canonicalUid}`
    const existing = bestByCharUid.get(uidKey)
    if (!existing) {
      bestByCharUid.set(uidKey, row)
    }
  }

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

  for (const row of bestByCharUid.values()) {
    const band = resolveExclusiveTierBandFromTierKey(row.tierBand ?? 'unranked')
    const charKey = `${row.characterNum}:${band}`
    const bucket = byCharacterTier.get(charKey) ?? []
    bucket.push(row.shadowScore!)
    byCharacterTier.set(charKey, bucket)

    for (const key of metricKeys) {
      const value =
        key === 'overallScore' ? row.shadowScore : (row as unknown as Record<string, number | null>)[key]
      if (value == null || !Number.isFinite(value)) continue
      const metricMap = metricPools.get(key) ?? new Map<string, number[]>()
      const pool = metricMap.get(charKey) ?? []
      pool.push(value)
      metricMap.set(charKey, pool)
      metricPools.set(key, metricMap)
    }
  }

  return { byCharacterTier, metricPools }
}

export async function loadAnalysisCohortBundle(
  prisma: PrismaClient,
  params: {
    displaySeasonId: number
    apiSeasonId: number
    benchmarkScope: PlayerCharacterBenchmarkScope
    window: 'season' | 'recent20'
    syncRoleSnapshots?: boolean
  },
) {
  if (params.syncRoleSnapshots) {
    await syncSeasonRoleSnapshots(prisma, {
      displaySeasonId: params.displaySeasonId,
      apiSeasonId: params.apiSeasonId,
      benchmarkScope: params.benchmarkScope,
    })
  }

  let roleRows = await loadRoleCohortRows(prisma, {
    displaySeasonId: params.displaySeasonId,
    benchmarkScope: params.benchmarkScope,
    window: params.window,
    benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
  })

  const characterSnapshots = await loadCharacterSnapshotsStrict(prisma, {
    displaySeasonId: params.displaySeasonId,
    benchmarkScope: params.benchmarkScope,
  })

  if (roleRows.length === 0 && characterSnapshots.length > 0) {
    const deduped = dedupeCharacterSnapshotsForRole(characterSnapshots)
    roleRows = deduped.map((row) => ({
      canonicalUid: row.canonicalUid,
      primaryRole: row.primaryRole!,
      tierBand: row.tierBand,
      overallScore: row.shadowScore,
      eligibleMatches: row.eligibleMatches,
      metrics: {
        winRate: row.winRate,
        damagePerMinute: row.damagePerMinute,
        visionPerMinute: row.visionPerMinute,
        teamKillParticipation: row.teamKillParticipation,
        averagePlacement: row.averagePlacement,
        consistencyScore: row.consistencyScore,
        averageKills: row.averageKills,
        averageDeaths: row.averageDeaths,
        averageSurvivalTime: row.averageSurvivalTime,
        radarAxes: {},
      },
    }))
  }

  const roleMaps = buildRoleCohortMaps(roleRows)
  const characterMaps = buildCharacterCohortMaps(characterSnapshots)

  return {
    roleRows,
    roleMaps,
    characterMaps,
    characterSnapshots,
  }
}
