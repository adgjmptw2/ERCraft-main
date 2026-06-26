import type { PrismaClient } from '@prisma/client'

import { getLocalCollectedGamesStatus } from './benchmarkStatus.js'
import { auditUnknownRoleRows } from './unknownRoleAudit.js'
import {
  loadDetailRawJsonMap,
  loadParticipantWeaponMap,
  participantMapKey,
  resolveWeaponRecoveryForRow,
  type PlayerMatchWeaponRow,
} from './unknownWeaponRecovery.js'
import { classifyBestWeaponValue } from './unknownRoleReason.js'
import { saveUnknownBackfillCutoff } from './unknownCohortCutoff.js'

export interface UnknownWeaponBackfillResult {
  dryRun: boolean
  scanned: number
  updated: number
  skippedAlreadyValid: number
  skippedNoRecovery: number
  skippedAmbiguous: number
  failed: number
  staleSnapshotsMarked: number
  bySource: Record<string, number>
  samples: Array<{
    rowId: string
    gameId: string
    uid: string
    before: number | null
    after: number
    source: string
  }>
  unknownBefore: number
  unknownAfter: number
}

async function markGradeSnapshotsStale(prisma: PrismaClient, uid: string): Promise<number> {
  const aggregateDelegate = (prisma as unknown as {
    seasonAggregateCache?: {
      updateMany?: (args: {
        where: { uid: string }
        data: { cacheStatus: string }
      }) => Promise<{ count: number }>
    }
  }).seasonAggregateCache
  if (typeof aggregateDelegate?.updateMany !== 'function') return 0
  const result = await aggregateDelegate.updateMany({
    where: { uid },
    data: { cacheStatus: 'stale' },
  })
  return result.count ?? 0
}

export async function backfillUnknownWeaponRows(
  prisma: PrismaClient,
  options: {
    dryRun?: boolean
    maxRows?: number
    batchSize?: number
  } = {},
): Promise<UnknownWeaponBackfillResult> {
  const dryRun = options.dryRun ?? false
  const maxRows = Math.max(1, options.maxRows ?? 1000)
  const batchSize = Math.max(1, Math.min(200, options.batchSize ?? 100))
  const beforeStatus = await getLocalCollectedGamesStatus(prisma)
  const unknownBefore =
    beforeStatus?.byRole.find((row) => row.role === 'unknown')?.games ??
    beforeStatus?.unknownBreakdown.noWeapon ??
    0

  const candidates = await prisma.playerMatch.findMany({
    where: {
      gameMode: 'rank',
      OR: [{ bestWeapon: null }, { bestWeapon: { lte: 0 } }],
    },
    select: {
      id: true,
      uid: true,
      gameId: true,
      gameMode: true,
      characterNum: true,
      bestWeapon: true,
      rawJson: true,
      createdAt: true,
    },
    take: maxRows,
    orderBy: { id: 'asc' },
  })

  let updated = 0
  let skippedAlreadyValid = 0
  let skippedNoRecovery = 0
  let skippedAmbiguous = 0
  let failed = 0
  let staleSnapshotsMarked = 0
  const bySource: Record<string, number> = {}
  const samples: UnknownWeaponBackfillResult['samples'] = []
  const touchedUids = new Set<string>()

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize)
    const gameIds = [...new Set(batch.map((row) => row.gameId))]
    const [participantMap, detailMap] = await Promise.all([
      loadParticipantWeaponMap(prisma, gameIds),
      loadDetailRawJsonMap(prisma, gameIds),
    ])

    for (const row of batch) {
      if (classifyBestWeaponValue(row.bestWeapon) === 'valid') {
        skippedAlreadyValid += 1
        continue
      }
      const recovery = resolveWeaponRecoveryForRow({
        row: row as PlayerMatchWeaponRow,
        participantBestWeapon:
          participantMap.get(participantMapKey(row.gameId, row.uid, row.characterNum)) ?? null,
        detailRawJson: detailMap.get(row.gameId) ?? null,
      })
      if (!recovery) {
        skippedNoRecovery += 1
        continue
      }

      if (dryRun) {
        updated += 1
        bySource[recovery.source] = (bySource[recovery.source] ?? 0) + 1
        if (samples.length < 20) {
          samples.push({
            rowId: row.id.toString(),
            gameId: row.gameId,
            uid: row.uid,
            before: row.bestWeapon,
            after: recovery.recoveredBestWeapon,
            source: recovery.source,
          })
        }
        continue
      }

      try {
        const result = await prisma.playerMatch.updateMany({
          where: {
            id: row.id,
            OR: [{ bestWeapon: null }, { bestWeapon: { lte: 0 } }],
          },
          data: { bestWeapon: recovery.recoveredBestWeapon },
        })
        if (result.count === 0) {
          skippedAmbiguous += 1
          continue
        }
        updated += 1
        bySource[recovery.source] = (bySource[recovery.source] ?? 0) + 1
        touchedUids.add(row.uid)
        if (samples.length < 20) {
          samples.push({
            rowId: row.id.toString(),
            gameId: row.gameId,
            uid: row.uid,
            before: row.bestWeapon,
            after: recovery.recoveredBestWeapon,
            source: recovery.source,
          })
        }
      } catch {
        failed += 1
      }
    }
  }

  if (!dryRun) {
    for (const uid of touchedUids) {
      staleSnapshotsMarked += await markGradeSnapshotsStale(prisma, uid)
    }
  }

  const afterStatus = dryRun ? beforeStatus : await getLocalCollectedGamesStatus(prisma)
  const unknownAfter =
    afterStatus?.byRole.find((row) => row.role === 'unknown')?.games ??
    afterStatus?.unknownBreakdown.noWeapon ??
    unknownBefore

  if (!dryRun) {
    await saveUnknownBackfillCutoff({
      completedAt: new Date().toISOString(),
      unknownBefore,
      unknownAfter,
    })
  }

  return {
    dryRun,
    scanned: candidates.length,
    updated,
    skippedAlreadyValid,
    skippedNoRecovery,
    skippedAmbiguous,
    failed,
    staleSnapshotsMarked,
    bySource,
    samples,
    unknownBefore,
    unknownAfter: dryRun ? unknownBefore - updated : unknownAfter,
  }
}
