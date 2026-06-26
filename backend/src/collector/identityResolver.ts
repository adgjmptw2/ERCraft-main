import type { CollectorIdentityQueue, PrismaClient } from '@prisma/client'

import { persistVerifiedProfileAliases } from '../cache/profileIdentityAlias.js'
import { persistNicknameBinding } from '../cache/profileNicknameBinding.js'
import { upsertPlayerMatches } from '../cache/playerMatchStore.js'
import type { BserClient, BserUserGame } from '../external/bserClient.js'
import { mapToMatchSummary, uidToUserNum } from '../external/bserMapper.js'
import type { SeasonCatalog } from '../external/seasonCatalog.js'
import type { CollectorConfig } from './config.js'
import { computeIdentityPriority, type IdentityPriorityContext } from './identityPriority.js'
import {
  verifyIdentityWithTieredPages,
  type IdentityVerificationTarget,
  type IdentityVerificationTier,
} from './identityVerification.js'
import { normalizeIdentityNickname } from './identityNickname.js'
import { enqueueCollectorUser } from './queue.js'
import { computeUserQueuePriorityFromRp } from './userQueuePriority.js'

export type IdentityResolveErrorCode =
  | 'unresolved-no-nickname'
  | 'unresolved-not-found'
  | 'unresolved-game-mismatch'
  | 'unresolved-game-out-of-window'
  | 'unresolved-ambiguous'
  | 'unresolved-unverified'

export type IdentityCacheHitKind =
  | 'binding-hit'
  | 'nickname-cache-hit'
  | 'not-found-cache-hit'
  | 'ambiguous-cache-hit'
  | 'official-api-resolve'
  | null

export interface IdentityResolveRequestStats {
  nicknameResolveCount: number
  verifyGameCount: number
  totalRequestCount: number
  verificationTier: IdentityVerificationTier | 'out-of-window' | null
  cacheHit: IdentityCacheHitKind
}

export interface IdentityResolveSuccess {
  ok: true
  uid: string
  userNum: number
  verificationStatus: 'verified-binding' | 'verified-game-overlap'
  requestStats: IdentityResolveRequestStats
  playerMatchRowsWritten: number
  userEnqueued: boolean
}

export interface IdentityResolveFailure {
  ok: false
  errorCode: IdentityResolveErrorCode
  requestStats: IdentityResolveRequestStats
  retryable: boolean
  retryAfterMs: number | null
}

export type IdentityResolveResult = IdentityResolveSuccess | IdentityResolveFailure

interface NicknameCacheEntry {
  expiresAt: number
  result:
    | { kind: 'hit'; uid: string; nickname: string }
    | { kind: 'not-found' }
    | { kind: 'ambiguous' }
}

const SUCCESS_CACHE_MS = 7 * 24 * 60 * 60 * 1000
const NOT_FOUND_CACHE_MS = 24 * 60 * 60 * 1000
const AMBIGUOUS_CACHE_MS = 6 * 60 * 60 * 1000

const nicknameCache = new Map<string, NicknameCacheEntry>()

function normalizeNickname(nickname: string): string {
  return normalizeIdentityNickname(nickname) ?? nickname.trim().toLowerCase()
}

function participantMatchKey(game: BserUserGame): string {
  return `${game.nickname ?? ''}:${game.teamNumber ?? 0}:${game.characterNum}`
}

function identityParticipantKey(row: CollectorIdentityQueue): string {
  return `${row.nickname}:${row.teamNumber}:${row.characterNum}`
}

function emptyRequestStats(): IdentityResolveRequestStats {
  return {
    nicknameResolveCount: 0,
    verifyGameCount: 0,
    totalRequestCount: 0,
    verificationTier: null,
    cacheHit: null,
  }
}

function failure(
  errorCode: IdentityResolveErrorCode,
  requestStats: IdentityResolveRequestStats,
): IdentityResolveFailure {
  const retryPolicy: Record<
    IdentityResolveErrorCode,
    { retryable: boolean; retryAfterMs: number | null }
  > = {
    'unresolved-no-nickname': { retryable: false, retryAfterMs: null },
    'unresolved-not-found': { retryable: true, retryAfterMs: NOT_FOUND_CACHE_MS },
    'unresolved-game-mismatch': { retryable: false, retryAfterMs: null },
    'unresolved-game-out-of-window': { retryable: false, retryAfterMs: null },
    'unresolved-ambiguous': { retryable: false, retryAfterMs: null },
    'unresolved-unverified': { retryable: true, retryAfterMs: 30 * 60 * 1000 },
  }
  const policy = retryPolicy[errorCode]
  return { ok: false, errorCode, requestStats, ...policy }
}

function readCachedNickname(key: string): NicknameCacheEntry['result'] | null {
  const cached = nicknameCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    nicknameCache.delete(key)
    return null
  }
  return cached.result
}

function writeNicknameCache(key: string, result: NicknameCacheEntry['result']): void {
  const ttl =
    result.kind === 'hit'
      ? SUCCESS_CACHE_MS
      : result.kind === 'not-found'
        ? NOT_FOUND_CACHE_MS
        : AMBIGUOUS_CACHE_MS
  nicknameCache.set(key, { result, expiresAt: Date.now() + ttl })
}

export function clearIdentityNicknameCacheForTests(): void {
  nicknameCache.clear()
}

export function readNicknameCacheForTests(key: string): NicknameCacheEntry['result'] | null {
  return readCachedNickname(key)
}

export interface GroupNicknameResolveResult {
  uid: string | null
  bindingHit: boolean
  cacheHit: IdentityCacheHitKind
  errorCode: IdentityResolveErrorCode | null
  fatal: boolean
  budgetExhausted: boolean
}

async function resolveGroupFromDatabase(
  prisma: PrismaClient,
  nickname: string,
): Promise<
  | { uid: string; userNum: number }
  | { error: 'unresolved-ambiguous' }
  | null
> {
  const trimmed = nickname.trim()
  const { readPersistedNicknameBinding } = await import('../cache/profileNicknameBinding.js')
  const binding = await readPersistedNicknameBinding(prisma, trimmed)
  const candidates = await collectNicknameUidCandidates(prisma, trimmed)
  if (binding) {
    const conflicting = candidates.filter((uid) => uid !== binding.canonicalUid)
    if (conflicting.length > 0) return { error: 'unresolved-ambiguous' }
    return { uid: binding.canonicalUid, userNum: binding.canonicalUserNum }
  }
  if (candidates.length > 1) return { error: 'unresolved-ambiguous' }
  if (candidates.length === 1) {
    return { uid: candidates[0]!, userNum: uidToUserNum(candidates[0]!) }
  }
  return null
}

export async function resolveGroupNickname(
  prisma: PrismaClient,
  bser: BserClient,
  displayNickname: string,
  callApi: IdentityApiCall,
): Promise<GroupNicknameResolveResult> {
  const nickname = displayNickname.trim()
  const empty: GroupNicknameResolveResult = {
    uid: null,
    bindingHit: false,
    cacheHit: null,
    errorCode: 'unresolved-no-nickname',
    fatal: false,
    budgetExhausted: false,
  }
  if (!nickname) return empty

  const dbResolved = await resolveGroupFromDatabase(prisma, nickname)
  if (dbResolved && 'error' in dbResolved) {
    return {
      uid: null,
      bindingHit: false,
      cacheHit: 'ambiguous-cache-hit',
      errorCode: 'unresolved-ambiguous',
      fatal: false,
      budgetExhausted: false,
    }
  }
  if (dbResolved) {
    return {
      uid: dbResolved.uid,
      bindingHit: true,
      cacheHit: 'binding-hit',
      errorCode: null,
      fatal: false,
      budgetExhausted: false,
    }
  }

  const cacheKey = normalizeNickname(nickname)
  const cached = readCachedNickname(cacheKey)
  if (cached?.kind === 'not-found') {
    return {
      uid: null,
      bindingHit: false,
      cacheHit: 'not-found-cache-hit',
      errorCode: 'unresolved-not-found',
      fatal: false,
      budgetExhausted: false,
    }
  }
  if (cached?.kind === 'ambiguous') {
    return {
      uid: null,
      bindingHit: false,
      cacheHit: 'ambiguous-cache-hit',
      errorCode: 'unresolved-ambiguous',
      fatal: false,
      budgetExhausted: false,
    }
  }
  if (cached?.kind === 'hit') {
    return {
      uid: cached.uid,
      bindingHit: false,
      cacheHit: 'nickname-cache-hit',
      errorCode: null,
      fatal: false,
      budgetExhausted: false,
    }
  }

  const nickResult = await callApi('identityNicknameResolve', () => bser.getUserByNickname(nickname))
  if (!nickResult.ok) {
    return {
      uid: null,
      bindingHit: false,
      cacheHit: null,
      errorCode: 'unresolved-unverified',
      fatal: false,
      budgetExhausted: true,
    }
  }
  const user = nickResult.value
  if (!user) {
    writeNicknameCache(cacheKey, { kind: 'not-found' })
    return {
      uid: null,
      bindingHit: false,
      cacheHit: 'official-api-resolve',
      errorCode: 'unresolved-not-found',
      fatal: false,
      budgetExhausted: false,
    }
  }
  writeNicknameCache(cacheKey, { kind: 'hit', uid: user.uid, nickname: user.nickname })
  return {
    uid: user.uid,
    bindingHit: false,
    cacheHit: 'official-api-resolve',
    errorCode: null,
    fatal: false,
    budgetExhausted: false,
  }
}

async function collectNicknameUidCandidates(
  prisma: PrismaClient,
  nickname: string,
): Promise<string[]> {
  const trimmed = nickname.trim()
  const rows = await prisma.matchParticipant.findMany({
    where: { nickname: trimmed, uid: { not: null } },
    distinct: ['uid'],
    select: { uid: true },
    take: 16,
  })
  return rows.map((row) => row.uid).filter((uid): uid is string => Boolean(uid))
}

async function resolveFromDatabase(
  prisma: PrismaClient,
  row: CollectorIdentityQueue,
): Promise<
  | { uid: string; userNum: number; verificationStatus: 'verified-binding' }
  | { error: 'unresolved-ambiguous' }
  | null
> {
  const nickname = row.nickname.trim()
  const sameGameRows = await prisma.matchParticipant.findMany({
    where: { gameId: row.sourceGameId, nickname },
    select: { uid: true },
  })
  const sameGameUids = [...new Set(sameGameRows.map((entry) => entry.uid).filter(Boolean))]
  if (sameGameUids.length > 1) return { error: 'unresolved-ambiguous' }
  if (sameGameUids.length === 1) {
    const uid = sameGameUids[0]!
    return { uid, userNum: uidToUserNum(uid), verificationStatus: 'verified-binding' }
  }

  const { readPersistedNicknameBinding } = await import('../cache/profileNicknameBinding.js')
  const binding = await readPersistedNicknameBinding(prisma, nickname)
  if (binding) {
    const candidates = await collectNicknameUidCandidates(prisma, nickname)
    const conflicting = candidates.filter((uid) => uid !== binding.canonicalUid)
    if (conflicting.length > 0) return { error: 'unresolved-ambiguous' }
    return {
      uid: binding.canonicalUid,
      userNum: binding.canonicalUserNum,
      verificationStatus: 'verified-binding',
    }
  }

  const candidates = await collectNicknameUidCandidates(prisma, nickname)
  if (candidates.length > 1) return { error: 'unresolved-ambiguous' }
  if (candidates.length === 1) {
    return {
      uid: candidates[0]!,
      userNum: uidToUserNum(candidates[0]!),
      verificationStatus: 'verified-binding',
    }
  }

  return null
}

async function findParticipantRawGame(
  prisma: PrismaClient,
  row: CollectorIdentityQueue,
): Promise<BserUserGame | null> {
  const detail = await prisma.matchDetail.findUnique({
    where: { gameId: row.sourceGameId },
    select: { rawJson: true },
  })
  if (!detail?.rawJson || !Array.isArray(detail.rawJson)) return null
  const targetKey = identityParticipantKey(row)
  for (const raw of detail.rawJson) {
    if (!raw || typeof raw !== 'object') continue
    const game = raw as unknown as BserUserGame
    if (participantMatchKey(game) === targetKey) return game
  }
  return null
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

async function invalidateCachesForUid(prisma: PrismaClient, uid: string, gameId: string): Promise<void> {
  const teamLuckDelegate = (prisma as unknown as {
    teamLuckMetricCache?: { deleteMany?: (args: { where: { matchId: string } }) => Promise<unknown> }
  }).teamLuckMetricCache
  if (typeof teamLuckDelegate?.deleteMany === 'function') {
    await teamLuckDelegate.deleteMany({ where: { matchId: gameId } })
  }

  const gradeDelegate = (prisma as unknown as {
    characterGradeSnapshot?: { deleteMany?: (args: { where: { uid: string } }) => Promise<unknown> }
  }).characterGradeSnapshot
  if (typeof gradeDelegate?.deleteMany === 'function') {
    await gradeDelegate.deleteMany({ where: { uid } })
  }

  const aggregateDelegate = (prisma as unknown as {
    seasonAggregateCache?: {
      updateMany?: (args: {
        where: { uid: string }
        data: { cacheStatus: string }
      }) => Promise<unknown>
    }
  }).seasonAggregateCache
  if (typeof aggregateDelegate?.updateMany === 'function') {
    await aggregateDelegate.updateMany({
      where: { uid },
      data: { cacheStatus: 'stale' },
    })
  }
}

export async function buildIdentityPriorityContext(
  prisma: PrismaClient,
  row: CollectorIdentityQueue,
): Promise<IdentityPriorityContext> {
  const nickname = row.nickname.trim()
  const [occurrenceRows, binding, playedAtMs] = await Promise.all([
    prisma.collectorIdentityQueue.groupBy({
      by: ['nickname'],
      where: { nickname, status: { in: ['pending', 'retry', 'running'] } },
      _count: { nickname: true },
    }),
    import('../cache/profileNicknameBinding.js').then((mod) =>
      mod.readPersistedNicknameBinding(prisma, nickname),
    ),
    readSourcePlayedAtMs(prisma, row.sourceGameId),
  ])

  const participantCount = await prisma.matchParticipant.count({
    where: { gameId: row.sourceGameId, uid: { not: null } },
  })

  return {
    nicknameOccurrenceCount: occurrenceRows[0]?._count.nickname ?? 1,
    sourcePlayedAtMs: playedAtMs,
    hasBindingHint: binding != null,
    teamLuckResolvable: participantCount >= 2 && participantCount < 3,
    sampleSparseBonus: 0,
  }
}

export async function applyVerifiedIdentity(
  prisma: PrismaClient,
  row: CollectorIdentityQueue,
  uid: string,
  params: {
    verificationStatus: IdentityResolveSuccess['verificationStatus']
    characterNames: ReadonlyMap<number, string>
    catalog?: SeasonCatalog
    discoveryDepth: number
  },
): Promise<{ playerMatchRowsWritten: number; userEnqueued: boolean }> {
  const nickname = row.nickname.trim()
  const userNum = uidToUserNum(uid)
  const rawGame = await findParticipantRawGame(prisma, row)
  let playerMatchRowsWritten = 0
  let userPriority = 55

  await prisma.$transaction(async (tx) => {
    await tx.matchParticipant.updateMany({
      where: {
        gameId: row.sourceGameId,
        nickname,
        characterNum: row.characterNum,
        teamNumber: row.teamNumber,
        uid: null,
      },
      data: { uid },
    })
    await persistNicknameBinding(tx as unknown as PrismaClient, nickname, uid)
    await persistVerifiedProfileAliases(tx as unknown as PrismaClient, uid, [
      { sourceUid: uid, verificationMethod: 'game-id-overlap' },
    ])
  })

  if (rawGame) {
    const match = mapToMatchSummary(uid, rawGame, params.characterNames, params.catalog)
    const displaySeasonId =
      params.catalog?.displayForApiId(rawGame.seasonId) ?? match.seasonNumber ?? rawGame.seasonId
    userPriority = computeUserQueuePriorityFromRp(match.rpAfter, displaySeasonId)
    playerMatchRowsWritten = await upsertPlayerMatches(prisma, uid, [match], {
      apiSeasonId: rawGame.seasonId,
      displaySeasonId,
      matchingMode: rawGame.matchingMode ?? null,
      matchingTeamMode: rawGame.matchingTeamMode ?? null,
      storeRawJson: true,
      rawJson: rawGame,
    })
  }

  await invalidateCachesForUid(prisma, uid, row.sourceGameId)

  const userEnqueued = await enqueueCollectorUser(prisma, {
    uid,
    userNum,
    nickname,
    priority: userPriority,
    discoveryDepth: params.discoveryDepth,
    discoveredFromGameId: row.sourceGameId,
  })

  return { playerMatchRowsWritten, userEnqueued }
}

export type IdentityApiCall = <T>(
  category: 'identityNicknameResolve' | 'identityGameVerification',
  fn: () => Promise<T>,
) => Promise<{ ok: true; value: T } | { ok: false }>

export async function resolveCollectorIdentity(
  prisma: PrismaClient,
  bser: BserClient,
  row: CollectorIdentityQueue,
  config: CollectorConfig,
  callApi: IdentityApiCall,
): Promise<IdentityResolveResult> {
  const requestStats = emptyRequestStats()
  const nickname = row.nickname.trim()
  if (!nickname) {
    return failure('unresolved-no-nickname', requestStats)
  }

  const priorityContext = await buildIdentityPriorityContext(prisma, row)
  const priority = computeIdentityPriority({ row, context: priorityContext })

  const dbResolved = await resolveFromDatabase(prisma, row)
  if (dbResolved && 'error' in dbResolved) {
    requestStats.cacheHit = 'ambiguous-cache-hit'
    return failure('unresolved-ambiguous', requestStats)
  }

  if (dbResolved) {
    requestStats.cacheHit = 'binding-hit'
    return {
      ok: true,
      uid: dbResolved.uid,
      userNum: dbResolved.userNum,
      verificationStatus: dbResolved.verificationStatus,
      requestStats,
      playerMatchRowsWritten: 0,
      userEnqueued: false,
    }
  }

  let uid: string | null = null
  let verificationStatus: IdentityResolveSuccess['verificationStatus'] = 'verified-game-overlap'

  const cacheKey = normalizeNickname(nickname)
  const cached = readCachedNickname(cacheKey)
  if (cached?.kind === 'not-found') {
    requestStats.cacheHit = 'not-found-cache-hit'
    return failure('unresolved-not-found', requestStats)
  }
  if (cached?.kind === 'ambiguous') {
    requestStats.cacheHit = 'ambiguous-cache-hit'
    return failure('unresolved-ambiguous', requestStats)
  }
  if (cached?.kind === 'hit') {
    uid = cached.uid
    requestStats.cacheHit = 'nickname-cache-hit'
  } else {
    const nickResult = await callApi('identityNicknameResolve', () => bser.getUserByNickname(nickname))
    if (!nickResult.ok) {
      return failure('unresolved-unverified', requestStats)
    }
    requestStats.nicknameResolveCount += 1
    requestStats.totalRequestCount += 1
    requestStats.cacheHit = 'official-api-resolve'
    const user = nickResult.value
    if (!user) {
      writeNicknameCache(cacheKey, { kind: 'not-found' })
      return failure('unresolved-not-found', requestStats)
    }
    uid = user.uid
    writeNicknameCache(cacheKey, { kind: 'hit', uid: user.uid, nickname: user.nickname })
  }

  if (!uid) {
    return failure('unresolved-not-found', requestStats)
  }

  const target: IdentityVerificationTarget = {
    sourceGameId: row.sourceGameId,
    nickname,
    teamNumber: row.teamNumber,
    characterNum: row.characterNum,
    seasonId: row.seasonId,
    matchingMode: row.matchingMode,
    sourcePlayedAtMs: priorityContext.sourcePlayedAtMs,
  }

  let cursor: number | undefined
  const verification = await verifyIdentityWithTieredPages(config, {
    priority,
    target,
    fetchPage: async (nextCursor) => {
      const pageResult = await callApi('identityGameVerification', () =>
        bser.getUserGames(uid!, nextCursor ?? cursor),
      )
      if (!pageResult.ok) return null
      cursor = pageResult.value.next
      requestStats.verifyGameCount += 1
      requestStats.totalRequestCount += 1
      return pageResult.value
    },
  })

  requestStats.verificationTier = verification.resolvedTier

  if (verification.found) {
    return {
      ok: true,
      uid,
      userNum: uidToUserNum(uid),
      verificationStatus: 'verified-game-overlap',
      requestStats,
      playerMatchRowsWritten: 0,
      userEnqueued: false,
    }
  }

  if (verification.resolvedTier === 'out-of-window') {
    return failure('unresolved-game-out-of-window', requestStats)
  }

  return failure('unresolved-game-mismatch', requestStats)
}

export async function countIdentityDryRunCandidates(
  prisma: PrismaClient,
): Promise<{
  identityCandidates: number
  bindingHits: number
  resolveNeeded: number
  quickCandidates: number
  normalCandidates: number
  deepCandidates: number
}> {
  const pending = await prisma.collectorIdentityQueue.count({
    where: { status: { in: ['pending', 'retry'] } },
  })
  const participants = await prisma.matchParticipant.count({
    where: { uid: null, nickname: { not: null } },
  })
  const total = Math.max(pending, participants)

  let bindingHits = 0
  let quickCandidates = 0
  let normalCandidates = 0
  let deepCandidates = 0

  const sample = await prisma.collectorIdentityQueue.findMany({
    where: { status: { in: ['pending', 'retry'] } },
    take: 200,
    orderBy: [{ priority: 'asc' }, { updatedAt: 'asc' }],
  })

  for (const row of sample) {
    const context = await buildIdentityPriorityContext(prisma, row)
    const priority = computeIdentityPriority({ row, context: context })
    if (context.hasBindingHint) bindingHits += 1
    if (priority <= 30) quickCandidates += 1
    else if (priority <= 70) normalCandidates += 1
    else deepCandidates += 1
  }

  return {
    identityCandidates: total,
    bindingHits,
    resolveNeeded: Math.max(0, total - bindingHits),
    quickCandidates,
    normalCandidates,
    deepCandidates,
  }
}
