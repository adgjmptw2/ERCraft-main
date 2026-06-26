import { PrismaClient } from '@prisma/client'

import {
  CHARACTER_GRADE_MATCH_MODE,
  computeCharacterGradeSourceFingerprint,
  readCharacterGradeSnapshot,
  writeCharacterGradeSnapshot,
} from '../cache/characterGradeSnapshot.js'
import { buildCurrentSeasonCharacterStatsFromVerifiedSources } from '../cache/currentSeasonCharacterStats.js'
import { uidToUserNum } from '../external/bserMapper.js'
import { applyCharacterPerformanceGrades } from '../services/characterPerformanceGrade/compute.js'
import { computeOverallGradeV2ForCharacterStats } from '../services/overallGradeV2Hybrid.js'
import { getRankTierFromRp } from '../utils/rankTier.js'

export interface DamageTimeRobustBackfillResult {
  scanned: number
  written: number
  skippedFresh: number
  skippedEmpty: number
  failed: number
  failures: Array<{ uid: string; apiSeasonId: number; displaySeasonId: number; reason: string }>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasRequiredGradeEvidence(
  rows: ReadonlyArray<{ gradeStatus?: string | null; gradeSampleSize?: number; gradeAggregation?: unknown }>,
): boolean {
  return rows.every((row) => {
    if (row.gradeStatus !== 'ok') return true
    if ((row.gradeSampleSize ?? 0) < 10) return true
    return typeof row.gradeAggregation === 'object' && row.gradeAggregation !== null
  })
}

export async function backfillDamageTimeRobustGrades(
  prisma = new PrismaClient(),
): Promise<DamageTimeRobustBackfillResult> {
  const result: DamageTimeRobustBackfillResult = {
    scanned: 0,
    written: 0,
    skippedFresh: 0,
    skippedEmpty: 0,
    failed: 0,
    failures: [],
  }

  const targets = await prisma.playerMatch.findMany({
    where: { gameMode: CHARACTER_GRADE_MATCH_MODE },
    distinct: ['uid', 'apiSeasonId', 'displaySeasonId'],
    select: { uid: true, apiSeasonId: true, displaySeasonId: true },
    orderBy: [{ uid: 'asc' }, { apiSeasonId: 'asc' }, { displaySeasonId: 'asc' }],
  })

  for (const target of targets) {
    result.scanned += 1
    try {
      const canonicalUserNum = uidToUserNum(target.uid)
      const fingerprint = await computeCharacterGradeSourceFingerprint(prisma, {
        uid: target.uid,
        apiSeasonId: target.apiSeasonId,
        matchMode: CHARACTER_GRADE_MATCH_MODE,
      })
      const snapshot = await readCharacterGradeSnapshot(prisma, {
        canonicalUserNum,
        apiSeasonId: target.apiSeasonId,
        matchMode: CHARACTER_GRADE_MATCH_MODE,
      })
      if (
        snapshot?.sourceFingerprint === fingerprint.value &&
        snapshot.status === 'ready' &&
        hasRequiredGradeEvidence(snapshot.characterStats)
      ) {
        result.skippedFresh += 1
        continue
      }

      const latestRank = await prisma.playerMatch.findFirst({
        where: {
          uid: target.uid,
          apiSeasonId: target.apiSeasonId,
          displaySeasonId: target.displaySeasonId,
          gameMode: CHARACTER_GRADE_MATCH_MODE,
          rpAfter: { not: null },
        },
        orderBy: [{ playedAt: 'desc' }, { gameId: 'desc' }],
        select: { rpAfter: true },
      })
      const playerTier =
        latestRank?.rpAfter != null
          ? getRankTierFromRp(latestRank.rpAfter, null, target.displaySeasonId)
          : null

      const pmStats = await buildCurrentSeasonCharacterStatsFromVerifiedSources(prisma, {
        uid: target.uid,
        apiSeasonId: target.apiSeasonId,
        displaySeasonId: target.displaySeasonId,
      })
      if (pmStats.characterStats.length === 0) {
        result.skippedEmpty += 1
        continue
      }

      const graded = applyCharacterPerformanceGrades({
        rows: pmStats.rows,
        characterStats: pmStats.characterStats,
        metaStatus: 'complete',
        playerTier,
      })
      const computedAt = new Date()
      const overallGradeV2 = computeOverallGradeV2ForCharacterStats({
        canonicalUserNum,
        matchMode: CHARACTER_GRADE_MATCH_MODE,
        characterStats: graded,
        rows: pmStats.rows,
        playerTier,
        sourceFingerprint: fingerprint.value,
        computedAt,
      })
      await writeCharacterGradeSnapshot(prisma, {
        uid: target.uid,
        canonicalUserNum,
        apiSeasonId: target.apiSeasonId,
        displaySeasonId: target.displaySeasonId,
        matchMode: CHARACTER_GRADE_MATCH_MODE,
        sourceFingerprint: fingerprint.value,
        status: 'ready',
        characterStats: graded,
        meta: {
          status: 'complete',
          snapshotStatus: 'ready',
          userNum: canonicalUserNum,
          seasonId: target.displaySeasonId,
          generatedAt: computedAt.toISOString(),
          rowCount: graded.length,
          matchCount: pmStats.deduplicatedMatchCount,
          sourceCount: pmStats.sourceCount,
          rawMatchCount: pmStats.rawMatchCount,
          deduplicatedMatchCount: pmStats.deduplicatedMatchCount,
          sourceFingerprint: fingerprint.value,
          computedAt: computedAt.toISOString(),
          overallGradeVersion: overallGradeV2?.overallGradeVersion,
        },
        overallGradeV2,
        computedAt,
      })
      result.written += 1
    } catch (error) {
      result.failed += 1
      result.failures.push({
        uid: target.uid,
        apiSeasonId: target.apiSeasonId,
        displaySeasonId: target.displaySeasonId,
        reason: errorMessage(error),
      })
    }
  }

  return result
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = new PrismaClient()
  try {
    const result = await backfillDamageTimeRobustGrades(prisma)
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}
