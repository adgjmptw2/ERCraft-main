import type { CollectorIdentityQueue, PrismaClient } from '@prisma/client'

import type { BserClient } from '../external/bserClient.js'
import { uidToUserNum } from '../external/bserMapper.js'
import type { SeasonCatalog } from '../external/seasonCatalog.js'
import type { CollectorConfig } from './config.js'
import { computeIdentityPriority } from './identityPriority.js'
import {
  applyVerifiedIdentity,
  buildIdentityPriorityContext,
  type IdentityApiCall,
  type IdentityResolveErrorCode,
  resolveGroupNickname,
} from './identityResolver.js'
import { displayIdentityNickname, normalizeIdentityNickname } from './identityNickname.js'
import {
  verifyGroupWithTieredPages,
  type GroupVerificationCandidate,
} from './groupVerification.js'
import {
  availableIdentityWhere,
  finishCollectorIdentity,
  identityRetryDelay,
  isNicknameGroupable,
  leaseUntil,
} from './identityQueue.js'

export interface CollectorIdentityGroup {
  normalizedNickname: string
  displayNickname: string
  candidates: CollectorIdentityQueue[]
  candidateCount: number
  priority: number
}

export interface IdentityGroupDryRunStats {
  pendingIdentities: number
  uniqueNormalizedNicknames: number
  averageCandidatesPerNickname: number
  maxCandidatesPerNickname: number
  groupableNicknames: number
  ambiguousNicknames: number
  estimatedGroups: number
  estimatedSingleResolveApi: number
  estimatedGroupVerificationPages: number
  estimatedApiSaved: number
}

export interface IdentityGroupProcessResult {
  fatal: boolean
  budgetExhausted: boolean
  nicknameResolveApi: number
  nicknameBindingHits: number
  nicknameCacheHits: number
  verificationPages: number
  candidateGameIdsChecked: number
  candidatesResolved: number
  candidatesMismatch: number
  candidatesOutOfWindow: number
  candidatesNotFound: number
  candidatesAmbiguous: number
  candidatesDeferred: number
  candidatesAlreadyLinked: number
  playerMatchRowsWritten: number
  usersEnqueued: number
  estimatedApiSaved: number
}

function candidateId(row: CollectorIdentityQueue): string {
  return row.id.toString()
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

function isClearlyOldSource(playedAtMs: number | null, deferDays: number): boolean {
  if (playedAtMs == null) return false
  const ageMs = Date.now() - playedAtMs
  return ageMs > deferDays * 24 * 60 * 60 * 1000
}

export async function auditIdentityGroupDryRun(
  prisma: PrismaClient,
  config: CollectorConfig,
): Promise<IdentityGroupDryRunStats> {
  const rows = await prisma.collectorIdentityQueue.findMany({
    where: { status: { in: ['pending', 'retry'] } },
    select: { nickname: true },
  })

  const byNick = new Map<string, number>()
  const displayByKey = new Map<string, string>()
  for (const row of rows) {
    const key = normalizeIdentityNickname(row.nickname)
    if (!key) continue
    byNick.set(key, (byNick.get(key) ?? 0) + 1)
    if (!displayByKey.has(key)) displayByKey.set(key, displayIdentityNickname(row.nickname))
  }

  let ambiguous = 0
  let groupable = 0
  for (const [key] of byNick) {
    const display = displayByKey.get(key) ?? key
    if (await isNicknameGroupable(prisma, display)) groupable += 1
    else ambiguous += 1
  }

  const counts = [...byNick.values()]
  const total = rows.length
  const unique = byNick.size
  const avg = unique > 0 ? total / unique : 0
  const max = counts.length > 0 ? Math.max(...counts) : 0
  const groupSize = Math.min(config.identityGroupSize, config.identityGroupMaxSourceGames)

  let estimatedGroups = 0
  let estimatedPages = 0
  let estimatedSaved = 0
  for (const count of counts) {
    const groups = Math.ceil(count / groupSize)
    estimatedGroups += groups
    estimatedPages += groups * 2
    estimatedSaved += Math.max(0, count - 1) + Math.max(0, count - 1) * 2
  }

  return {
    pendingIdentities: total,
    uniqueNormalizedNicknames: unique,
    averageCandidatesPerNickname: Math.round(avg * 100) / 100,
    maxCandidatesPerNickname: max,
    groupableNicknames: groupable,
    ambiguousNicknames: ambiguous,
    estimatedGroups,
    estimatedSingleResolveApi: unique,
    estimatedGroupVerificationPages: estimatedPages,
    estimatedApiSaved: estimatedSaved,
  }
}

export async function claimNextIdentityGroup(
  prisma: PrismaClient,
  config: CollectorConfig,
): Promise<CollectorIdentityGroup | null> {
  const now = new Date()
  const pool = await prisma.collectorIdentityQueue.findMany({
    where: availableIdentityWhere(now),
    orderBy: [{ priority: 'asc' }, { updatedAt: 'asc' }],
    take: 120,
  })

  const seenNormalized = new Set<string>()
  for (const seed of pool) {
    const normalized = normalizeIdentityNickname(seed.nickname)
    if (!normalized || seenNormalized.has(normalized)) continue
    seenNormalized.add(normalized)

    const display = displayIdentityNickname(seed.nickname)
    if (!(await isNicknameGroupable(prisma, display))) continue

    const peers = pool
      .filter((row) => normalizeIdentityNickname(row.nickname) === normalized)
      .slice(0, config.identityGroupSize)

    if (peers.length === 0) continue

    const claimed: CollectorIdentityQueue[] = []
    for (const peer of peers) {
      const updated = await prisma.collectorIdentityQueue.updateMany({
        where: {
          id: peer.id,
          OR: availableIdentityWhere(now).OR,
        },
        data: {
          status: 'running',
          leaseOwner: config.workerId,
          leaseExpiresAt: leaseUntil(config),
          attemptCount: { increment: 1 },
        },
      })
      if (updated.count === 1) {
        const row = await prisma.collectorIdentityQueue.findUnique({ where: { id: peer.id } })
        if (row) claimed.push(row)
      }
    }

    if (claimed.length === 0) continue

    let priority = 99
    for (const row of claimed) {
      const ctx = await buildIdentityPriorityContext(prisma, row)
      priority = Math.min(priority, computeIdentityPriority({ row, context: ctx }))
    }

    return {
      normalizedNickname: normalized,
      displayNickname: display,
      candidates: claimed.slice(0, config.identityGroupMaxSourceGames),
      candidateCount: claimed.length,
      priority,
    }
  }

  return null
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

function finishErrorPolicy(
  code: IdentityResolveErrorCode,
  attemptCount: number,
  maxRetries: number,
): { status: 'unresolved' | 'retry'; retryable: boolean } {
  const retryable =
    (code === 'unresolved-not-found' || code === 'unresolved-unverified') && attemptCount < maxRetries
  return { status: retryable ? 'retry' : 'unresolved', retryable }
}

export async function processIdentityGroup(
  prisma: PrismaClient,
  bser: BserClient,
  group: CollectorIdentityGroup,
  config: CollectorConfig,
  callApi: IdentityApiCall,
  params: {
    characterNames: ReadonlyMap<number, string>
    catalog?: SeasonCatalog
    discoveryDepth: number
  },
): Promise<IdentityGroupProcessResult> {
  const result: IdentityGroupProcessResult = {
    fatal: false,
    budgetExhausted: false,
    nicknameResolveApi: 0,
    nicknameBindingHits: 0,
    nicknameCacheHits: 0,
    verificationPages: 0,
    candidateGameIdsChecked: 0,
    candidatesResolved: 0,
    candidatesMismatch: 0,
    candidatesOutOfWindow: 0,
    candidatesNotFound: 0,
    candidatesAmbiguous: 0,
    candidatesDeferred: 0,
    candidatesAlreadyLinked: 0,
    playerMatchRowsWritten: 0,
    usersEnqueued: 0,
    estimatedApiSaved: 0,
  }

  const pendingRows: CollectorIdentityQueue[] = []

  for (const row of group.candidates) {
    const linked = await tryResolveAlreadyLinked(prisma, row)
    if (linked) {
      const applied = await applyVerifiedIdentity(prisma, row, linked.uid, {
        verificationStatus: 'verified-binding',
        characterNames: params.characterNames,
        catalog: params.catalog,
        discoveryDepth: params.discoveryDepth,
      })
      result.candidatesAlreadyLinked += 1
      result.candidatesResolved += 1
      result.playerMatchRowsWritten += applied.playerMatchRowsWritten
      if (applied.userEnqueued) result.usersEnqueued += 1
      await finishCollectorIdentity(prisma, row, 'resolved', {
        resolvedUid: linked.uid,
        resolvedUserNum: BigInt(linked.userNum),
        verificationStatus: 'verified-binding',
        lastErrorCode: null,
      })
      continue
    }

    const playedAtMs = await readSourcePlayedAtMs(prisma, row.sourceGameId)
    if (isClearlyOldSource(playedAtMs, config.identityOldSourceDeferDays)) {
      result.candidatesDeferred += 1
      await finishCollectorIdentity(prisma, row, 'unresolved', {
        lastErrorCode: 'deferred-old-source',
      })
      continue
    }

    pendingRows.push(row)
  }

  if (pendingRows.length === 0) return result

  const nickResolve = await resolveGroupNickname(prisma, bser, group.displayNickname, callApi)
  if (nickResolve.budgetExhausted) {
    result.budgetExhausted = true
    for (const row of pendingRows) {
      await finishCollectorIdentity(prisma, row, 'retry', {
        nextAttemptAt: identityRetryDelay(row.attemptCount),
        lastErrorCode: 'unresolved-unverified',
      })
    }
    return result
  }

  if (nickResolve.bindingHit) result.nicknameBindingHits += 1
  if (nickResolve.cacheHit === 'nickname-cache-hit') result.nicknameCacheHits += 1
  if (nickResolve.cacheHit === 'official-api-resolve') result.nicknameResolveApi += 1
  if (nickResolve.cacheHit === 'not-found-cache-hit') result.nicknameCacheHits += 1
  if (nickResolve.cacheHit === 'ambiguous-cache-hit') result.nicknameCacheHits += 1

  if (nickResolve.errorCode) {
    for (const row of pendingRows) {
      if (nickResolve.errorCode === 'unresolved-not-found') result.candidatesNotFound += 1
      if (nickResolve.errorCode === 'unresolved-ambiguous') result.candidatesAmbiguous += 1
      const rowPolicy = finishErrorPolicy(nickResolve.errorCode, row.attemptCount, config.identityMaxRetries)
      await finishCollectorIdentity(prisma, row, rowPolicy.status, {
        nextAttemptAt: rowPolicy.retryable ? identityRetryDelay(row.attemptCount) : null,
        lastErrorCode: nickResolve.errorCode,
      })
    }
    return result
  }

  const uid = nickResolve.uid!
  let cursor: number | undefined

  const verificationCandidates: GroupVerificationCandidate[] = []
  for (const row of pendingRows) {
    const playedAtMs = await readSourcePlayedAtMs(prisma, row.sourceGameId)
    verificationCandidates.push({
      candidateId: candidateId(row),
      sourcePlayedAtMs: playedAtMs,
      target: {
        sourceGameId: row.sourceGameId,
        nickname: group.displayNickname,
        teamNumber: row.teamNumber,
        characterNum: row.characterNum,
        seasonId: row.seasonId,
        matchingMode: row.matchingMode,
        sourcePlayedAtMs: playedAtMs,
      },
    })
  }

  const verification = await verifyGroupWithTieredPages(config, {
    priority: group.priority,
    candidates: verificationCandidates,
    fetchPage: async (nextCursor) => {
      const pageResult = await callApi('identityGameVerification', () =>
        bser.getUserGames(uid, nextCursor ?? cursor),
      )
      if (!pageResult.ok) return null
      cursor = pageResult.value.next
      return pageResult.value
    },
  })

  result.verificationPages = verification.totalPages
  result.candidateGameIdsChecked = verification.candidateGameIdsChecked

  const resolvedRows: CollectorIdentityQueue[] = []
  const batchLimit = config.identityResolveBatchSize

  for (const row of pendingRows) {
    const outcome = verification.outcomes.get(candidateId(row)) ?? 'unresolved-game-mismatch'
    if (outcome === 'resolved') {
      resolvedRows.push(row)
      continue
    }
    if (outcome === 'unresolved-game-out-of-window') {
      result.candidatesOutOfWindow += 1
      await finishCollectorIdentity(prisma, row, 'unresolved', {
        lastErrorCode: 'unresolved-game-out-of-window',
      })
      continue
    }
    result.candidatesMismatch += 1
    await finishCollectorIdentity(prisma, row, 'unresolved', {
      lastErrorCode: 'unresolved-game-mismatch',
    })
  }

  for (let index = 0; index < resolvedRows.length; index += batchLimit) {
    const batch = resolvedRows.slice(index, index + batchLimit)
    for (const row of batch) {
      try {
        const applied = await applyVerifiedIdentity(prisma, row, uid, {
          verificationStatus: 'verified-game-overlap',
          characterNames: params.characterNames,
          catalog: params.catalog,
          discoveryDepth: params.discoveryDepth,
        })
        result.candidatesResolved += 1
        result.playerMatchRowsWritten += applied.playerMatchRowsWritten
        if (applied.userEnqueued) result.usersEnqueued += 1
        await finishCollectorIdentity(prisma, row, 'resolved', {
          resolvedUid: uid,
          resolvedUserNum: BigInt(uidToUserNum(uid)),
          verificationStatus: 'verified-game-overlap',
          lastErrorCode: null,
        })
      } catch {
        await finishCollectorIdentity(prisma, row, 'retry', {
          nextAttemptAt: identityRetryDelay(row.attemptCount),
          lastErrorCode: 'apply-failed',
        })
      }
    }
  }

  const oldPerCandidateEstimate =
    pendingRows.length + pendingRows.length * Math.max(1, result.verificationPages)
  const newActual = result.nicknameResolveApi + result.verificationPages
  result.estimatedApiSaved = Math.max(0, oldPerCandidateEstimate - newActual)

  return result
}
