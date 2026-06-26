import type { Prisma, PrismaClient } from '@prisma/client'

import type { PlayerCharacterBenchmarkScope } from './config.js'
import { PLAYER_CHARACTER_SNAPSHOT_BENCHMARK_VERSION } from './config.js'
import type { PlayerCharacterSnapshotRecord } from './types.js'
import { snapshotId } from './fingerprint.js'

function isModelReady(prisma: PrismaClient): boolean {
  const delegate = (prisma as unknown as Record<string, unknown>).playerCharacterPerformanceSnapshot
  return (
    typeof delegate === 'object' &&
    delegate !== null &&
    typeof (delegate as { upsert?: unknown }).upsert === 'function'
  )
}

export async function readPlayerCharacterSnapshot(
  prisma: PrismaClient,
  params: {
    canonicalUid: string
    displaySeasonId: number
    characterNum: number
    benchmarkScope: PlayerCharacterBenchmarkScope
    benchmarkVersion?: string
  },
): Promise<PlayerCharacterSnapshotRecord | null> {
  if (!isModelReady(prisma)) return null
  const benchmarkVersion = params.benchmarkVersion ?? PLAYER_CHARACTER_SNAPSHOT_BENCHMARK_VERSION
  const id = snapshotId({
    canonicalUid: params.canonicalUid,
    displaySeasonId: params.displaySeasonId,
    characterNum: params.characterNum,
    benchmarkScope: params.benchmarkScope,
    benchmarkVersion,
  })
  const row = await prisma.playerCharacterPerformanceSnapshot.findUnique({ where: { id } })
  if (!row) return null
  return mapRow(row)
}

function mapRow(
  row: Prisma.PlayerCharacterPerformanceSnapshotGetPayload<object>,
): PlayerCharacterSnapshotRecord {
  return {
    id: row.id,
    canonicalUid: row.canonicalUid,
    displaySeasonId: row.displaySeasonId,
    apiSeasonId: row.apiSeasonId,
    characterNum: row.characterNum,
    benchmarkScope: row.benchmarkScope as PlayerCharacterBenchmarkScope,
    benchmarkVersion: row.benchmarkVersion,
    sampleStatus: row.sampleStatus as PlayerCharacterSnapshotRecord['sampleStatus'],
    eligibleMatches: row.eligibleMatches,
    averagePlacement: row.averagePlacement,
    winRate: row.winRate,
    top3Rate: row.top3Rate,
    averageKills: row.averageKills,
    averageDeaths: row.averageDeaths,
    teamKillParticipation: row.teamKillParticipation,
    damagePerMinute: row.damagePerMinute,
    damageShare: row.damageShare,
    visionPerMinute: row.visionPerMinute,
    averageSurvivalTime: row.averageSurvivalTime,
    consistencyScore: row.consistencyScore,
    shadowScore: row.shadowScore,
    primaryRole: row.primaryRole,
    tierBand: row.tierBand,
    sampleWindowStart: row.sampleWindowStart,
    sampleWindowEnd: row.sampleWindowEnd,
    sourceFingerprint: row.sourceFingerprint,
    computedAt: row.computedAt,
  }
}

export async function writePlayerCharacterSnapshot(
  prisma: PrismaClient,
  record: PlayerCharacterSnapshotRecord,
): Promise<'created' | 'updated' | 'reused'> {
  if (!isModelReady(prisma)) return 'reused'
  const existing = await prisma.playerCharacterPerformanceSnapshot.findUnique({
    where: { id: record.id },
    select: { sourceFingerprint: true },
  })
  if (existing?.sourceFingerprint === record.sourceFingerprint) {
    return 'reused'
  }
  const action = existing ? 'updated' : 'created'
  await prisma.playerCharacterPerformanceSnapshot.upsert({
    where: { id: record.id },
    create: {
      id: record.id,
      canonicalUid: record.canonicalUid,
      displaySeasonId: record.displaySeasonId,
      apiSeasonId: record.apiSeasonId,
      characterNum: record.characterNum,
      benchmarkScope: record.benchmarkScope,
      benchmarkVersion: record.benchmarkVersion,
      sampleStatus: record.sampleStatus,
      eligibleMatches: record.eligibleMatches,
      averagePlacement: record.averagePlacement,
      winRate: record.winRate,
      top3Rate: record.top3Rate,
      averageKills: record.averageKills,
      averageDeaths: record.averageDeaths,
      teamKillParticipation: record.teamKillParticipation,
      damagePerMinute: record.damagePerMinute,
      damageShare: record.damageShare,
      visionPerMinute: record.visionPerMinute,
      averageSurvivalTime: record.averageSurvivalTime,
      consistencyScore: record.consistencyScore,
      shadowScore: record.shadowScore,
      primaryRole: record.primaryRole,
      tierBand: record.tierBand,
      sampleWindowStart: record.sampleWindowStart,
      sampleWindowEnd: record.sampleWindowEnd,
      sourceFingerprint: record.sourceFingerprint,
      computedAt: record.computedAt,
    },
    update: {
      sampleStatus: record.sampleStatus,
      eligibleMatches: record.eligibleMatches,
      averagePlacement: record.averagePlacement,
      winRate: record.winRate,
      top3Rate: record.top3Rate,
      averageKills: record.averageKills,
      averageDeaths: record.averageDeaths,
      teamKillParticipation: record.teamKillParticipation,
      damagePerMinute: record.damagePerMinute,
      damageShare: record.damageShare,
      visionPerMinute: record.visionPerMinute,
      averageSurvivalTime: record.averageSurvivalTime,
      consistencyScore: record.consistencyScore,
      shadowScore: record.shadowScore,
      primaryRole: record.primaryRole,
      tierBand: record.tierBand,
      sampleWindowStart: record.sampleWindowStart,
      sampleWindowEnd: record.sampleWindowEnd,
      sourceFingerprint: record.sourceFingerprint,
      computedAt: record.computedAt,
    },
  })
  return action
}

export async function listSnapshotsForAudit(
  prisma: PrismaClient,
  params: {
    displaySeasonId: number
    benchmarkScope: PlayerCharacterBenchmarkScope
    benchmarkVersion?: string
  },
): Promise<PlayerCharacterSnapshotRecord[]> {
  if (!isModelReady(prisma)) return []
  const benchmarkVersion = params.benchmarkVersion ?? PLAYER_CHARACTER_SNAPSHOT_BENCHMARK_VERSION
  const rows = await prisma.playerCharacterPerformanceSnapshot.findMany({
    where: {
      displaySeasonId: params.displaySeasonId,
      benchmarkScope: params.benchmarkScope,
      benchmarkVersion,
    },
  })
  return rows.map(mapRow)
}
