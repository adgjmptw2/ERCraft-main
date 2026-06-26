import type { PrismaClient } from '@prisma/client'

import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import {
  BENCHMARK_ELIGIBLE_MIN_MATCHES,
  EXPLORATORY_MIN_MATCHES,
  PLAYER_CHARACTER_SNAPSHOT_BENCHMARK_VERSION,
  PROVISIONAL_MIN_MATCHES,
  SHADOW_AUDIT_METRICS,
  type PlayerCharacterBenchmarkScope,
} from './config.js'
import { buildSourceFingerprint, snapshotId } from './fingerprint.js'
import { filterRowsForShadowBenchmark, mergeFilterStats } from './matchFilter.js'
import {
  aggregatePlayerCharacterSnapshot,
  meetsExploratoryMinimum,
  resolveSampleStatus,
} from './metrics.js'
import { buildShadowGradeDistribution } from './gradeDistribution.js'
import {
  computePercentileTable,
  readMetricValue,
  resolvePercentileCapability,
} from './percentile.js'
import { listSnapshotsForAudit, writePlayerCharacterSnapshot } from './store.js'
import type {
  CharacterSampleCounts,
  CohortReadiness,
  MatchFilterStats,
  PlayerCharacterShadowAuditReport,
  PlayerCharacterSnapshotRecord,
  SnapshotBuildStats,
} from './types.js'

function median(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  }
  return sorted[mid] ?? null
}

function metricNullRate(
  snapshots: ReadonlyArray<PlayerCharacterSnapshotRecord>,
  key: keyof PlayerCharacterSnapshotRecord,
): number {
  if (snapshots.length === 0) return 0
  const nullCount = snapshots.filter((row) => row[key] == null).length
  return Math.round((nullCount / snapshots.length) * 10000) / 100
}

function buildCohortReadiness(
  snapshots: ReadonlyArray<PlayerCharacterSnapshotRecord>,
): CohortReadiness {
  const uniqueUsers = new Set(snapshots.map((row) => row.canonicalUid)).size
  const eligibleMatches = snapshots.map((row) => row.eligibleMatches)
  const tierDistribution: Record<string, number> = {}
  const roleDistribution: Record<string, number> = {}
  for (const row of snapshots) {
    const tier = row.tierBand ?? 'unknown'
    tierDistribution[tier] = (tierDistribution[tier] ?? 0) + 1
    const role = row.primaryRole ?? 'unknown'
    roleDistribution[role] = (roleDistribution[role] ?? 0) + 1
  }

  const metricNullRates: Record<string, number> = {}
  for (const metric of SHADOW_AUDIT_METRICS) {
    metricNullRates[metric] = metricNullRate(snapshots, metric)
  }

  return {
    uniqueUsers,
    avgEligibleMatches:
      eligibleMatches.length > 0
        ? Math.round(
            (eligibleMatches.reduce((sum, value) => sum + value, 0) / eligibleMatches.length) * 100,
          ) / 100
        : null,
    medianEligibleMatches: median(eligibleMatches),
    metricNullRates,
    tierDistribution,
    roleDistribution,
    percentileCapability: resolvePercentileCapability(uniqueUsers),
  }
}

async function loadParticipantGameIds(
  prisma: PrismaClient,
  uid: string,
  gameIds: ReadonlyArray<string>,
): Promise<Set<string>> {
  if (typeof prisma.matchParticipant?.findMany !== 'function' || gameIds.length === 0) {
    return new Set(gameIds)
  }
  const rows = await prisma.matchParticipant.findMany({
    where: {
      gameId: { in: [...gameIds] },
      uid,
    },
    select: { gameId: true },
  })
  return new Set(rows.map((row) => row.gameId))
}

export async function buildPlayerCharacterSnapshots(
  prisma: PrismaClient,
  params: {
    displaySeasonId: number
    apiSeasonId: number
    benchmarkScope: PlayerCharacterBenchmarkScope
    benchmarkVersion?: string
    validateParticipants?: boolean
  },
): Promise<{
  snapshots: PlayerCharacterSnapshotRecord[]
  buildStats: SnapshotBuildStats
  filterStats: MatchFilterStats
}> {
  const benchmarkVersion = params.benchmarkVersion ?? PLAYER_CHARACTER_SNAPSHOT_BENCHMARK_VERSION
  const gameMode = params.benchmarkScope === 'rank' ? 'rank' : 'normal'
  const rawRows = (await prisma.playerMatch.findMany({
    where: {
      displaySeasonId: params.displaySeasonId,
      apiSeasonId: params.apiSeasonId,
      gameMode,
    },
  })) as PlayerMatchRow[]

  const byUid = new Map<string, PlayerMatchRow[]>()
  for (const row of rawRows) {
    const bucket = byUid.get(row.uid) ?? []
    bucket.push(row)
    byUid.set(row.uid, bucket)
  }

  const filterStats: MatchFilterStats = {
    totalRowsScanned: 0,
    excludedInvalidGameId: 0,
    excludedUnsupportedMode: 0,
    excludedOwnershipMismatch: 0,
    excludedMissingParticipant: 0,
    excludedDuplicateGameId: 0,
    eligibleRows: 0,
  }
  const buildStats: SnapshotBuildStats = {
    created: 0,
    updated: 0,
    reused: 0,
    snapshotsWritten: 0,
  }
  const snapshots: PlayerCharacterSnapshotRecord[] = []
  const computedAt = new Date()

  for (const [canonicalUid, uidRows] of byUid) {
    let participantGameIds: Set<string> | undefined
    if (params.validateParticipants) {
      participantGameIds = await loadParticipantGameIds(
        prisma,
        canonicalUid,
        uidRows.map((row) => row.gameId),
      )
    }

    const filtered = filterRowsForShadowBenchmark({
      rows: uidRows,
      canonicalUid,
      scope: params.benchmarkScope,
      displaySeasonId: params.displaySeasonId,
      apiSeasonId: params.apiSeasonId,
      participantGameIds,
    })
    mergeFilterStats(filterStats, filtered.stats)
    if (filtered.rows.length === 0) continue

    const byCharacter = new Map<number, PlayerMatchRow[]>()
    for (const row of filtered.rows) {
      const bucket = byCharacter.get(row.characterNum) ?? []
      bucket.push(row)
      byCharacter.set(row.characterNum, bucket)
    }

    for (const [characterNum, characterRows] of byCharacter) {
      if (!meetsExploratoryMinimum(characterRows.length)) continue
      const metrics = aggregatePlayerCharacterSnapshot(characterRows, {
        canonicalUid,
        characterNum,
        displaySeasonId: params.displaySeasonId,
        apiSeasonId: params.apiSeasonId,
      })
      if (!metrics) continue

      const fingerprint = buildSourceFingerprint(characterRows.map((row) => row.gameId))
      const record: PlayerCharacterSnapshotRecord = {
        id: snapshotId({
          canonicalUid,
          displaySeasonId: params.displaySeasonId,
          characterNum,
          benchmarkScope: params.benchmarkScope,
          benchmarkVersion,
        }),
        canonicalUid,
        displaySeasonId: params.displaySeasonId,
        apiSeasonId: params.apiSeasonId,
        characterNum,
        benchmarkScope: params.benchmarkScope,
        benchmarkVersion,
        sampleStatus: resolveSampleStatus(metrics.eligibleMatches),
        sourceFingerprint: fingerprint,
        computedAt,
        ...metrics,
      }

      const action = await writePlayerCharacterSnapshot(prisma, record)
      buildStats[action] += 1
      if (action !== 'reused') buildStats.snapshotsWritten += 1
      snapshots.push(record)
    }
  }

  return { snapshots, buildStats, filterStats }
}

export async function runPlayerCharacterShadowAudit(
  prisma: PrismaClient,
  params: {
    displaySeasonId: number
    apiSeasonId: number
    benchmarkScope: PlayerCharacterBenchmarkScope
    benchmarkVersion?: string
    validateParticipants?: boolean
  },
): Promise<PlayerCharacterShadowAuditReport> {
  const benchmarkVersion = params.benchmarkVersion ?? PLAYER_CHARACTER_SNAPSHOT_BENCHMARK_VERSION
  const built = await buildPlayerCharacterSnapshots(prisma, params)
  const snapshots =
    built.snapshots.length > 0
      ? built.snapshots
      : await listSnapshotsForAudit(prisma, {
          displaySeasonId: params.displaySeasonId,
          benchmarkScope: params.benchmarkScope,
          benchmarkVersion,
        })

  const uniqueUsers = new Set(snapshots.map((row) => row.canonicalUid)).size
  const tierUserCounts: Record<string, number> = {}
  const roleUserCounts: Record<string, number> = {}
  for (const row of snapshots) {
    const tier = row.tierBand ?? 'unknown'
    tierUserCounts[tier] = (tierUserCounts[tier] ?? 0) + 1
    const role = row.primaryRole ?? 'unknown'
    roleUserCounts[role] = (roleUserCounts[role] ?? 0) + 1
  }

  const metricNullRates: Record<string, number> = {}
  for (const metric of SHADOW_AUDIT_METRICS) {
    metricNullRates[metric] = metricNullRate(snapshots, metric)
  }

  const byCharacter = new Map<number, PlayerCharacterSnapshotRecord[]>()
  for (const row of snapshots) {
    const bucket = byCharacter.get(row.characterNum) ?? []
    bucket.push(row)
    byCharacter.set(row.characterNum, bucket)
  }

  const characterSampleCounts: CharacterSampleCounts[] = [...byCharacter.entries()]
    .map(([characterNum, rows]) => ({
      characterNum,
      users3Plus: rows.filter((row) => row.eligibleMatches >= EXPLORATORY_MIN_MATCHES).length,
      users10Plus: rows.filter((row) => row.eligibleMatches >= PROVISIONAL_MIN_MATCHES).length,
      users20Plus: rows.filter((row) => row.eligibleMatches >= BENCHMARK_ELIGIBLE_MIN_MATCHES).length,
    }))
    .sort((a, b) => b.users20Plus - a.users20Plus || a.characterNum - b.characterNum)

  const cohortsByCharacter: Record<string, CohortReadiness> = {}
  const cohortsByCharacterTier: Record<string, CohortReadiness> = {}
  const cohortsByRoleTier: Record<string, CohortReadiness> = {}
  const percentiles = []
  const gradeDistributions: Record<string, ReturnType<typeof buildShadowGradeDistribution>> = {}

  let sufficientCharacterCount = 0
  let insufficientCharacterCount = 0

  for (const [characterNum, rows] of byCharacter) {
    const benchmarkRows = rows.filter((row) => row.sampleStatus === 'benchmarkEligible')
    const readiness = buildCohortReadiness(benchmarkRows)
    cohortsByCharacter[String(characterNum)] = readiness
    if (readiness.uniqueUsers >= 30) sufficientCharacterCount += 1
    else insufficientCharacterCount += 1

    const tierGroups = new Map<string, PlayerCharacterSnapshotRecord[]>()
    const roleTierGroups = new Map<string, PlayerCharacterSnapshotRecord[]>()
    for (const row of benchmarkRows) {
      const tierKey = `${characterNum}:${row.tierBand ?? 'unknown'}`
      const tierBucket = tierGroups.get(tierKey) ?? []
      tierBucket.push(row)
      tierGroups.set(tierKey, tierBucket)

      const roleTierKey = `${row.primaryRole ?? 'unknown'}:${row.tierBand ?? 'unknown'}`
      const roleBucket = roleTierGroups.get(roleTierKey) ?? []
      roleBucket.push(row)
      roleTierGroups.set(roleTierKey, roleBucket)
    }

    for (const [key, group] of tierGroups) {
      cohortsByCharacterTier[key] = buildCohortReadiness(group)
    }
    for (const [key, group] of roleTierGroups) {
      cohortsByRoleTier[key] = buildCohortReadiness(group)
    }

    if (readiness.percentileCapability !== 'disabled') {
      for (const metric of SHADOW_AUDIT_METRICS) {
        percentiles.push(
          computePercentileTable({
            cohortKey: `season:${params.displaySeasonId}:character:${characterNum}`,
            metric,
            snapshots: benchmarkRows,
            benchmarkEligibleOnly: true,
          }),
        )
      }
      gradeDistributions[String(characterNum)] = buildShadowGradeDistribution(benchmarkRows, {
        minCohortUsers: 30,
      })
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    displaySeasonId: params.displaySeasonId,
    apiSeasonId: params.apiSeasonId,
    benchmarkScope: params.benchmarkScope,
    benchmarkVersion,
    uniqueUsers,
    snapshotCount: snapshots.length,
    buildStats: built.buildStats,
    filterStats: built.filterStats,
    characterSampleCounts,
    tierUserCounts,
    roleUserCounts,
    metricNullRates,
    cohorts: {
      byCharacter: cohortsByCharacter,
      byCharacterTier: cohortsByCharacterTier,
      byRoleTier: cohortsByRoleTier,
    },
    percentiles,
    gradeDistributions,
    sufficientCharacterCount,
    insufficientCharacterCount,
    limitations: [
      'damageShare is not persisted per-player in PlayerMatch; stored as null.',
      'averageSurvivalTime uses gameDuration seconds as proxy.',
      'shadowScore reuses existing character grade aggregate formula (gradeScore).',
      'Formal competitive percentiles use benchmarkScope=rank only; normal scope is audit-only.',
    ],
  }
}

export function snapshotMetricValuesForTest(
  snapshots: ReadonlyArray<PlayerCharacterSnapshotRecord>,
  metric: keyof PlayerCharacterSnapshotRecord,
): Array<number | null> {
  return snapshots.map((row) => readMetricValue(row, metric as never))
}
