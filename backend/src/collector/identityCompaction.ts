import type { CollectorIdentityQueue, PrismaClient } from '@prisma/client'

import { uidToUserNum } from '../external/bserMapper.js'
import type { CollectorConfig } from './config.js'
import { displayIdentityNickname } from './identityNickname.js'
import { applyVerifiedIdentity } from './identityResolver.js'
import { finishCollectorIdentity, isNicknameGroupable } from './identityQueue.js'

export interface IdentityCompactionResult {
  scanned: number
  resolvedWithoutApi: number
  deferredOldSource: number
  ambiguousConflict: number
  duplicateSkip: number
  alreadyComplete: number
  unchanged: number
  failed: number
}

function isClearlyOldSource(playedAtMs: number | null, deferDays: number): boolean {
  if (playedAtMs == null) return false
  return Date.now() - playedAtMs > deferDays * 24 * 60 * 60 * 1000
}

async function readSourcePlayedAtMs(
  prisma: PrismaClient,
  sourceGameId: string,
): Promise<number | null> {
  const detail = await prisma.matchDetail.findUnique({
    where: { gameId: sourceGameId },
    select: { playedAt: true },
  })
  if (!detail?.playedAt) return null
  return detail.playedAt.getTime()
}

async function tryResolveAlreadyLinked(
  prisma: PrismaClient,
  row: CollectorIdentityQueue,
): Promise<{ uid: string; userNum: number } | null> {
  const nickname = displayIdentityNickname(row.nickname)
  const participants = await prisma.matchParticipant.findMany({
    where: {
      gameId: row.sourceGameId,
      nickname,
      characterNum: row.characterNum,
      teamNumber: row.teamNumber,
    },
    select: { uid: true },
  })
  const uids = [...new Set(participants.map((p) => p.uid).filter(Boolean))]
  if (uids.length === 1) {
    const uid = uids[0]!
    return { uid, userNum: uidToUserNum(uid) }
  }
  return null
}

async function hasPlayerMatch(
  prisma: PrismaClient,
  row: CollectorIdentityQueue,
  uid: string,
): Promise<boolean> {
  const count = await prisma.playerMatch.count({
    where: { uid, gameId: row.sourceGameId },
  })
  return count > 0
}

export async function compactIdentityQueue(
  prisma: PrismaClient,
  config: CollectorConfig,
  options: {
    dryRun?: boolean
    maxRows?: number
    characterNames?: ReadonlyMap<number, string>
  } = {},
): Promise<IdentityCompactionResult> {
  const result: IdentityCompactionResult = {
    scanned: 0,
    resolvedWithoutApi: 0,
    deferredOldSource: 0,
    ambiguousConflict: 0,
    duplicateSkip: 0,
    alreadyComplete: 0,
    unchanged: 0,
    failed: 0,
  }

  const rows = await prisma.collectorIdentityQueue.findMany({
    where: { status: { in: ['pending', 'retry'] } },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'asc' }],
    take: options.maxRows ?? config.identityCompactionBatchSize,
  })

  for (const row of rows) {
    result.scanned += 1
    try {
      const nickname = displayIdentityNickname(row.nickname)
      if (!(await isNicknameGroupable(prisma, nickname))) {
        if (!options.dryRun) {
          await finishCollectorIdentity(prisma, row, 'unresolved', {
            lastErrorCode: 'unresolved-ambiguous',
          })
        }
        result.ambiguousConflict += 1
        continue
      }

      const playedAtMs = await readSourcePlayedAtMs(prisma, row.sourceGameId)
      if (isClearlyOldSource(playedAtMs, config.identityOldSourceDeferDays)) {
        if (!options.dryRun) {
          await finishCollectorIdentity(prisma, row, 'unresolved', {
            lastErrorCode: 'deferred-old-source',
          })
        }
        result.deferredOldSource += 1
        continue
      }

      const linked = await tryResolveAlreadyLinked(prisma, row)
      if (linked) {
        if (await hasPlayerMatch(prisma, row, linked.uid)) {
          if (!options.dryRun) {
            await finishCollectorIdentity(prisma, row, 'resolved', {
              resolvedUid: linked.uid,
              resolvedUserNum: BigInt(linked.userNum),
              verificationStatus: 'verified-binding',
              lastErrorCode: null,
            })
          }
          result.alreadyComplete += 1
          continue
        }
        if (!options.dryRun) {
          await applyVerifiedIdentity(prisma, row, linked.uid, {
            verificationStatus: 'verified-binding',
            characterNames: options.characterNames ?? new Map<number, string>(),
            discoveryDepth: 0,
          })
          await finishCollectorIdentity(prisma, row, 'resolved', {
            resolvedUid: linked.uid,
            resolvedUserNum: BigInt(linked.userNum),
            verificationStatus: 'verified-binding',
            lastErrorCode: null,
          })
        }
        result.resolvedWithoutApi += 1
        continue
      }

      const resolvedSibling = await prisma.collectorIdentityQueue.findFirst({
        where: {
          sourceGameId: row.sourceGameId,
          nickname: row.nickname,
          characterNum: row.characterNum,
          teamNumber: row.teamNumber,
          status: 'resolved',
        },
        select: { id: true },
      })
      if (resolvedSibling && resolvedSibling.id !== row.id) {
        if (!options.dryRun) {
          await finishCollectorIdentity(prisma, row, 'resolved', {
            lastErrorCode: 'duplicate-skip',
          })
        }
        result.duplicateSkip += 1
        continue
      }

      result.unchanged += 1
    } catch {
      result.failed += 1
    }
  }

  return result
}
