import type { Prisma, PrismaClient } from '@prisma/client'

import type { PlayerRoleSnapshotRecord } from './types.js'

const COMPOUND_KEY = 'canonicalUid_displaySeasonId_primaryRole_rowType_benchmarkScope_benchmarkVersion' as const

function isModelReady(prisma: PrismaClient): boolean {
  const delegate = (prisma as unknown as Record<string, unknown>).playerRolePerformanceSnapshot
  return (
    typeof delegate === 'object' &&
    delegate !== null &&
    typeof (delegate as { upsert?: unknown }).upsert === 'function'
  )
}

export async function writePlayerRoleSnapshot(
  prisma: PrismaClient,
  record: PlayerRoleSnapshotRecord,
): Promise<'created' | 'updated' | 'reused'> {
  if (!isModelReady(prisma)) return 'reused'

  const compoundWhere = {
    canonicalUid: record.canonicalUid,
    displaySeasonId: record.displaySeasonId,
    primaryRole: record.primaryRole,
    rowType: record.rowType,
    benchmarkScope: record.benchmarkScope,
    benchmarkVersion: record.benchmarkVersion,
  }

  const existing = await prisma.playerRolePerformanceSnapshot.findUnique({
    where: { [COMPOUND_KEY]: compoundWhere },
    select: { sourceFingerprint: true },
  })
  if (existing?.sourceFingerprint === record.sourceFingerprint) {
    return 'reused'
  }

  const action = existing ? 'updated' : 'created'
  const metricsJson = record.metrics as unknown as Prisma.InputJsonValue

  await prisma.playerRolePerformanceSnapshot.upsert({
    where: { [COMPOUND_KEY]: compoundWhere },
    create: {
      id: record.id,
      canonicalUid: record.canonicalUid,
      displaySeasonId: record.displaySeasonId,
      apiSeasonId: record.apiSeasonId,
      rowType: record.rowType,
      primaryRole: record.primaryRole,
      benchmarkScope: record.benchmarkScope,
      benchmarkVersion: record.benchmarkVersion,
      eligibleMatches: record.eligibleMatches,
      overallScore: record.overallScore,
      tierBand: record.tierBand,
      metrics: metricsJson,
      sourceFingerprint: record.sourceFingerprint,
      computedAt: record.computedAt,
    },
    update: {
      apiSeasonId: record.apiSeasonId,
      eligibleMatches: record.eligibleMatches,
      overallScore: record.overallScore,
      tierBand: record.tierBand,
      metrics: metricsJson,
      sourceFingerprint: record.sourceFingerprint,
      computedAt: record.computedAt,
    },
  })

  return action
}

export async function writePlayerRoleSnapshots(
  prisma: PrismaClient,
  records: ReadonlyArray<PlayerRoleSnapshotRecord>,
): Promise<void> {
  for (const record of records) {
    await writePlayerRoleSnapshot(prisma, record)
  }
}