import type { PrismaClient } from '@prisma/client'

import {
  type CanonicalUidResolution,
  type SeasonStatsFingerprint,
  canonicalUserNum,
  resolveCanonicalUidForNickname,
} from '../cache/nicknameUidResolver.js'
import {
  persistVerifiedProfileAliases,
  readPersistedProfileAliases,
} from '../cache/profileIdentityAlias.js'
import { persistNicknameBinding } from '../cache/profileNicknameBinding.js'
import { isPrismaPlayerMatchReady } from '../cache/playerMatchStore.js'
import { readSeasonStatsCacheSnapshot, seasonStatsCacheId } from '../cache/seasonStatsCache.js'
import { traceProfileRead } from './profileReadTrace.js'

export type ProfileIdentityVerificationMethod =
  | 'canonical'
  | 'fingerprint'
  | 'known-alias'
  | 'current-lookup'
  | 'game-id-overlap'
  | 'backfill-fingerprint'
  | 'match-bootstrap'

export type IdentityResolutionStatus = 'complete' | 'partial'

export type IdentityCandidateDecision = 'accepted' | 'rejected'

export interface IdentityCandidateTrace {
  userNum: number
  source: string
  fingerprintPresent: boolean
  fingerprintMatch: boolean
  overlappingGameIds: number
  pmRowCount: number
  decision: IdentityCandidateDecision
  reason: string
}

export interface ResolvedProfileIdentity {
  requestedNickname: string
  normalizedNickname: string
  owner: {
    canonicalUid: string
    canonicalUserNum: number
  }
  sources: {
    profileUid: string
    seasonUids: string[]
    playerMatchUids: string[]
  }
  verification: {
    method: ProfileIdentityVerificationMethod
    status: IdentityResolutionStatus
    verifiedAliasUids: string[]
    devReasons?: Record<string, string>
    devTrace?: IdentityCandidateTrace[]
  }
  resolvedAt: string
}

export interface ResolveProfileIdentityParams {
  nickname: string
  lookupUid: string
  apiSeasonId: number
  statsFingerprint?: SeasonStatsFingerprint | null
  canonicalResolution?: CanonicalUidResolution
  bootstrapGameIds?: string[]
}

const PARTIAL_IDENTITY_CACHE_TTL_MS = 8_000
const COMPLETE_IDENTITY_CACHE_TTL_MS = 60_000

function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase()
}

function sortedUnique(uids: Iterable<string>): string[] {
  return [...new Set(uids)]
    .filter((uid) => typeof uid === 'string' && uid.length > 0)
    .sort()
}

function isDevEnv(): boolean {
  return process.env.NODE_ENV === 'development'
}

async function countRankPmRows(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
): Promise<number> {
  if (!uid || !isPrismaPlayerMatchReady(prisma)) return 0
  return prisma.playerMatch.count({
    where: { uid, apiSeasonId, gameMode: 'rank' },
  })
}

function nicknameMatches(stored: string | null | undefined, target: string): boolean {
  if (!stored) return false
  return stored.trim().toLowerCase() === target.trim().toLowerCase()
}

async function statsNicknameForUid(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
): Promise<string | null> {
  const stats = await readSeasonStatsCacheSnapshot(prisma, seasonStatsCacheId(uid, apiSeasonId))
  if (!stats?.length) return null
  for (const row of stats) {
    if (typeof row.nickname === 'string' && row.nickname.trim()) return row.nickname.trim()
  }
  return null
}

async function collectNicknameLinkedUids(
  prisma: PrismaClient,
  nickname: string,
): Promise<string[]> {
  if (typeof prisma.matchParticipant?.findMany !== 'function') return []
  const trimmed = nickname.trim()
  if (!trimmed) return []

  const participants = await prisma.matchParticipant.findMany({
    where: { nickname: trimmed },
    select: { uid: true },
    distinct: ['uid'],
    take: 16,
  })
  return participants
    .map((row) => row.uid)
    .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
}

async function collectBackfillGamesCandidates(
  prisma: PrismaClient,
  apiSeasonId: number,
  totalGames: number,
): Promise<string[]> {
  if (totalGames <= 0 || !isPrismaBackfillReady(prisma)) return []
  try {
    const rows = await prisma.playerSeasonBackfillState.findMany({
      where: { apiSeasonId, status: 'complete', collectedGames: totalGames },
      select: { uid: true },
      take: 32,
    })
    return rows.map((row) => row.uid)
  } catch {
    return []
  }
}

function isPrismaBackfillReady(prisma: PrismaClient): boolean {
  const delegate = (prisma as unknown as Record<string, unknown>).playerSeasonBackfillState
  return (
    typeof delegate === 'object' &&
    delegate !== null &&
    typeof (delegate as { findMany?: unknown }).findMany === 'function'
  )
}

async function collectFingerprintVerifiedUids(
  prisma: PrismaClient,
  nickname: string,
  apiSeasonId: number,
  fingerprint: SeasonStatsFingerprint,
): Promise<string[]> {
  const delegate = (prisma as unknown as Record<string, unknown>).seasonStatsCache
  if (typeof delegate !== 'object' || delegate === null) return []

  const rows = await prisma.seasonStatsCache.findMany({
    where: { id: { endsWith: `:${apiSeasonId}` } },
    select: { id: true, data: true },
    take: 400,
  })

  const uids: string[] = []

  for (const row of rows) {
    const sep = row.id.lastIndexOf(':')
    if (sep <= 0) continue
    const uid = row.id.slice(0, sep)
    if (!Array.isArray(row.data)) continue
    const stats = row.data as Array<{
      nickname?: string
      matchingTeamMode?: number
      totalGames?: number
      mmr?: number
    }>
    const squad = stats.find((entry) => entry.matchingTeamMode === 3) ?? stats[0]
    if (!squad || squad.totalGames !== fingerprint.totalGames || squad.mmr !== fingerprint.mmr) {
      continue
    }
    const cachedNick = stats.find((entry) => entry.nickname?.trim())?.nickname?.trim() ?? null
    const nickMatches =
      cachedNick !== null &&
      cachedNick.trim().toLowerCase() === nickname.trim().toLowerCase()
    if (!nickMatches) continue
    uids.push(uid)
  }

  return uids
}

function pmRowSlack(totalGames: number): number {
  if (totalGames <= 20) return 2
  return Math.max(10, Math.floor(totalGames * 0.05))
}

function pmRowsMatchFingerprint(
  candidatePmRows: number,
  fingerprint: SeasonStatsFingerprint,
): boolean {
  const slack = pmRowSlack(fingerprint.totalGames)
  return Math.abs(candidatePmRows - fingerprint.totalGames) <= slack
}

function minAliasOverlap(fingerprint: SeasonStatsFingerprint | null | undefined): number {
  if (!fingerprint || fingerprint.totalGames <= 0) return 3
  if (fingerprint.totalGames <= 7) return fingerprint.totalGames
  if (fingerprint.totalGames <= 15) {
    return Math.max(3, Math.floor(fingerprint.totalGames * 0.5))
  }
  if (fingerprint.totalGames <= 100) {
    return Math.max(7, Math.floor(fingerprint.totalGames * 0.5))
  }
  return Math.max(50, Math.floor(fingerprint.totalGames * 0.5))
}

async function countSharedRankGameIds(
  prisma: PrismaClient,
  uidA: string,
  uidB: string,
  apiSeasonId: number,
  minOverlapHint = 1,
): Promise<number> {
  if (!uidA || !uidB || uidA === uidB || !isPrismaPlayerMatchReady(prisma)) return 0

  const rowsA = await prisma.playerMatch.count({
    where: { uid: uidA, apiSeasonId, gameMode: 'rank' },
  })
  const rowsB = await prisma.playerMatch.count({
    where: { uid: uidB, apiSeasonId, gameMode: 'rank' },
  })
  if (rowsA === 0 || rowsB === 0) return 0

  const sampleSize = Math.min(rowsA, Math.max(64, Math.min(512, minOverlapHint * 2)))
  const sample = await prisma.playerMatch.findMany({
    where: { uid: uidA, apiSeasonId, gameMode: 'rank' },
    select: { gameId: true },
    take: sampleSize,
  })
  if (sample.length === 0) return 0
  const gameIds = sample.map((row) => row.gameId)
  const overlap = await prisma.playerMatch.count({
    where: {
      uid: uidB,
      apiSeasonId,
      gameMode: 'rank',
      gameId: { in: gameIds },
    },
  })

  if (
    overlap === sample.length &&
    Math.abs(rowsA - rowsB) <= pmRowSlack(Math.max(rowsA, rowsB))
  ) {
    return Math.min(rowsA, rowsB)
  }

  return overlap
}

async function collectGameLinkedUidCounts(
  prisma: PrismaClient,
  seedUids: string[],
  apiSeasonId: number,
  bootstrapGameIds: string[] = [],
): Promise<Map<string, number>> {
  if (!isPrismaPlayerMatchReady(prisma)) return new Map()

  const gameIds = new Set<string>(bootstrapGameIds.filter(Boolean))
  for (const uid of seedUids) {
    const rows = await prisma.playerMatch.findMany({
      where: { uid, apiSeasonId, gameMode: 'rank' },
      select: { gameId: true },
      take: 48,
    })
    for (const row of rows) gameIds.add(row.gameId)
  }
  if (gameIds.size === 0) return new Map()

  const linked = await prisma.playerMatch.findMany({
    where: {
      apiSeasonId,
      gameMode: 'rank',
      gameId: { in: [...gameIds] },
    },
    select: { uid: true, gameId: true },
  })

  const seedSet = new Set(seedUids)
  const overlapByUid = new Map<string, Set<string>>()
  for (const row of linked) {
    if (!row.uid || seedSet.has(row.uid)) continue
    const bucket = overlapByUid.get(row.uid) ?? new Set<string>()
    bucket.add(row.gameId)
    overlapByUid.set(row.uid, bucket)
  }

  return new Map(
    [...overlapByUid.entries()].map(([uid, games]) => [uid, games.size]),
  )
}

function identityStatus(
  verifiedAliasCount: number,
  playerMatchUidCount: number,
  canonicalPmRows: number,
  profilePmRows: number,
  statsFingerprint: SeasonStatsFingerprint | null | undefined,
): IdentityResolutionStatus {
  if (verifiedAliasCount > 0 || playerMatchUidCount > 1) return 'complete'
  if (canonicalPmRows > 0 || profilePmRows > 0) return 'complete'
  if (statsFingerprint && statsFingerprint.totalGames > 0) return 'partial'
  return 'partial'
}

function minRequiredAliasOverlap(fingerprint: SeasonStatsFingerprint): number {
  if (fingerprint.totalGames <= 15) return fingerprint.totalGames
  return Math.max(
    minAliasOverlap(fingerprint),
    Math.floor(fingerprint.totalGames * 0.99),
  )
}

async function countBootstrapGameOverlap(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
  bootstrapGameIds: string[],
): Promise<number> {
  if (!bootstrapGameIds.length || !isPrismaPlayerMatchReady(prisma)) return 0
  return prisma.playerMatch.count({
    where: {
      uid,
      apiSeasonId,
      gameMode: 'rank',
      gameId: { in: bootstrapGameIds },
    },
  })
}

async function discoverOverlapAliasPeer(
  prisma: PrismaClient,
  params: {
    nickname: string
    canonicalUid: string
    profileUid: string
    apiSeasonId: number
    statsFingerprint: SeasonStatsFingerprint
    seedUids: string[]
    bootstrapGameIds: string[]
    canonicalResolution: CanonicalUidResolution
    verifiedAliasUids: Set<string>
    traceCandidate: (
      uid: string,
      source: string,
      decision: IdentityCandidateDecision,
      reason: string,
      overlap?: number,
      fingerprintMatch?: boolean,
    ) => Promise<void>
  },
): Promise<{ uid: string; source: ProfileIdentityVerificationMethod } | null> {
  const {
    nickname,
    canonicalUid,
    profileUid,
    apiSeasonId,
    statsFingerprint,
    seedUids,
    bootstrapGameIds,
    canonicalResolution,
    verifiedAliasUids,
    traceCandidate,
  } = params

  const minRequired = minRequiredAliasOverlap(statsFingerprint)
  const candidateScores = new Map<string, { score: number; overlap: number; source: string }>()

  const consider = async (uid: string, source: string) => {
    if (uid === canonicalUid || uid === profileUid || verifiedAliasUids.has(uid)) return
    const pmRows = await countRankPmRows(prisma, uid, apiSeasonId)
    if (!pmRowsMatchFingerprint(pmRows, statsFingerprint)) {
      await traceCandidate(uid, source, 'rejected', 'season-mismatch', 0)
      return
    }
    let overlap = 0
    for (const seed of seedUids) {
      overlap = Math.max(
        overlap,
        await countSharedRankGameIds(prisma, seed, uid, apiSeasonId, minRequired),
      )
    }
    if (bootstrapGameIds.length > 0) {
      overlap = Math.max(
        overlap,
        await countBootstrapGameOverlap(prisma, uid, apiSeasonId, bootstrapGameIds),
      )
    }
    if (overlap < minRequired) {
      await traceCandidate(uid, source, 'rejected', 'no-game-overlap', overlap)
      return
    }
    const nick = await statsNicknameForUid(prisma, uid, apiSeasonId)
    const nickBonus = nicknameMatches(nick, nickname) ? 1_000_000 : 0
    const tieBonus =
      uid === canonicalResolution.bserUid ? 100 : uid === profileUid ? 50 : 0
    const score = nickBonus + tieBonus + overlap
    const existing = candidateScores.get(uid)
    if (!existing || score > existing.score) {
      candidateScores.set(uid, { score, overlap, source })
    }
  }

  for (const uid of await collectBackfillGamesCandidates(
    prisma,
    apiSeasonId,
    statsFingerprint.totalGames,
  )) {
    await consider(uid, 'backfill-fingerprint')
  }

  const gameLinked = await collectGameLinkedUidCounts(
    prisma,
    [...seedUids, ...verifiedAliasUids],
    apiSeasonId,
    bootstrapGameIds,
  )
  for (const [uid] of gameLinked) {
    await consider(uid, bootstrapGameIds.length > 0 ? 'match-bootstrap' : 'game-id-overlap')
  }

  if (candidateScores.size === 0) return null

  const [bestUid, best] = [...candidateScores.entries()].sort(
    (a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]),
  )[0]
  const bestNick = await statsNicknameForUid(prisma, bestUid, apiSeasonId)
  if (!nicknameMatches(bestNick, nickname)) {
    await traceCandidate(bestUid, best.source, 'rejected', 'nickname-mismatch', best.overlap, true)
    return null
  }
  await traceCandidate(bestUid, best.source, 'accepted', 'game-id-overlap', best.overlap, true)
  return {
    uid: bestUid,
    source: best.source === 'match-bootstrap' ? 'match-bootstrap' : 'game-id-overlap',
  }
}

export async function resolveVerifiedSourceUids(
  prisma: PrismaClient,
  params: ResolveProfileIdentityParams & {
    canonicalUid: string
    canonicalResolution: CanonicalUidResolution
  },
): Promise<{
  seasonUids: string[]
  playerMatchUids: string[]
  verifiedAliasUids: string[]
  method: ProfileIdentityVerificationMethod
  status: IdentityResolutionStatus
  devReasons: Record<string, string>
  devTrace: IdentityCandidateTrace[]
}> {
  const {
    nickname,
    lookupUid,
    canonicalUid,
    apiSeasonId,
    statsFingerprint,
    canonicalResolution,
    bootstrapGameIds = [],
  } = params
  const devReasons: Record<string, string> = {}
  const devTrace: IdentityCandidateTrace[] = []
  const verifiedAliasUids = new Set<string>()
  let method: ProfileIdentityVerificationMethod = 'canonical'

  const profileUid = lookupUid
  const fingerprintPresent = statsFingerprint != null && statsFingerprint.totalGames > 0

  const traceCandidate = async (
    uid: string,
    source: string,
    decision: IdentityCandidateDecision,
    reason: string,
    overlap = 0,
    fingerprintMatch = false,
  ) => {
    if (!isDevEnv()) return
    devTrace.push({
      userNum: canonicalUserNum(uid),
      source,
      fingerprintPresent,
      fingerprintMatch,
      overlappingGameIds: overlap,
      pmRowCount: await countRankPmRows(prisma, uid, apiSeasonId),
      decision,
      reason,
    })
    devReasons[uid] = decision === 'accepted' ? `verified-${reason}` : `rejected-${reason}`
  }

  await traceCandidate(canonicalUid, 'canonical', 'accepted', 'canonical')
  if (profileUid !== canonicalUid) {
    await traceCandidate(profileUid, 'current-lookup', 'accepted', 'current-lookup')
  }

  for (const persisted of await readPersistedProfileAliases(prisma, canonicalUid)) {
    if (persisted.sourceUid === canonicalUid) continue
    const aliasNick = await statsNicknameForUid(prisma, persisted.sourceUid, apiSeasonId)
    if (aliasNick && !nicknameMatches(aliasNick, nickname)) {
      await traceCandidate(persisted.sourceUid, 'known-alias', 'rejected', 'alias-nickname-mismatch')
      continue
    }
    verifiedAliasUids.add(persisted.sourceUid)
    await traceCandidate(persisted.sourceUid, 'known-alias', 'accepted', 'persisted-alias')
    if (method === 'canonical') method = 'known-alias'
  }
  if (verifiedAliasUids.size > 0) {
    traceProfileRead({
      event: 'identity-db-hit',
      uid: canonicalUid,
      identityStatus: 'complete',
      playerMatchUidCount: verifiedAliasUids.size + 1,
    })
  }

  const seedUids = sortedUnique([canonicalUid, profileUid, canonicalResolution.bserUid])

  if (canonicalResolution.swapped && canonicalResolution.storedUid) {
    verifiedAliasUids.add(canonicalResolution.storedUid)
    await traceCandidate(canonicalResolution.storedUid, 'known-alias', 'accepted', 'known-alias')
    method = 'known-alias'
  }

  const overlapHint = minAliasOverlap(statsFingerprint)

  if (statsFingerprint) {
    for (const uid of await collectFingerprintVerifiedUids(
      prisma,
      nickname,
      apiSeasonId,
      statsFingerprint,
    )) {
      if (uid === canonicalUid) continue
      const candidatePmRows = await countRankPmRows(prisma, uid, apiSeasonId)
      if (!pmRowsMatchFingerprint(candidatePmRows, statsFingerprint)) {
        await traceCandidate(uid, 'fingerprint-cache', 'rejected', 'season-mismatch', 0, true)
        continue
      }
      verifiedAliasUids.add(uid)
      await traceCandidate(uid, 'fingerprint-cache', 'accepted', 'fingerprint', 0, true)
      if (method === 'canonical') method = 'fingerprint'
    }

    for (const uid of await collectBackfillGamesCandidates(
      prisma,
      apiSeasonId,
      statsFingerprint.totalGames,
    )) {
      if (uid === canonicalUid || uid === profileUid || verifiedAliasUids.has(uid)) continue
      const candidatePmRows = await countRankPmRows(prisma, uid, apiSeasonId)
      if (!pmRowsMatchFingerprint(candidatePmRows, statsFingerprint)) {
        await traceCandidate(uid, 'backfill-fingerprint', 'rejected', 'season-mismatch', 0, true)
        continue
      }
      const nick = await statsNicknameForUid(prisma, uid, apiSeasonId)
      if (!nicknameMatches(nick, nickname)) {
        await traceCandidate(uid, 'backfill-fingerprint', 'rejected', 'nickname-only', 0, true)
        continue
      }
      verifiedAliasUids.add(uid)
      await traceCandidate(uid, 'backfill-fingerprint', 'accepted', 'fingerprint', 0, true)
      if (method === 'canonical') method = 'backfill-fingerprint'
    }

    const overlapPeer = await discoverOverlapAliasPeer(prisma, {
      nickname,
      canonicalUid,
      profileUid,
      apiSeasonId,
      statsFingerprint,
      seedUids,
      bootstrapGameIds,
      canonicalResolution,
      verifiedAliasUids,
      traceCandidate,
    })
    if (overlapPeer) {
      verifiedAliasUids.add(overlapPeer.uid)
      if (method === 'canonical') method = overlapPeer.source
    }
  }

  for (const uid of await collectNicknameLinkedUids(prisma, nickname)) {
    if (uid === canonicalUid || uid === profileUid || verifiedAliasUids.has(uid)) continue
    const overlap = await countSharedRankGameIds(
      prisma,
      canonicalUid,
      uid,
      apiSeasonId,
      overlapHint,
    )
    if (overlap > 0) {
      const linkedNick = await statsNicknameForUid(prisma, uid, apiSeasonId)
      if (!nicknameMatches(linkedNick, nickname)) {
        await traceCandidate(uid, 'participant-index', 'rejected', 'nickname-mismatch', overlap)
        continue
      }
      verifiedAliasUids.add(uid)
      await traceCandidate(uid, 'participant-index', 'accepted', 'game-id-overlap', overlap)
      if (method === 'canonical') method = 'game-id-overlap'
    } else {
      await traceCandidate(uid, 'participant-index', 'rejected', 'nickname-only')
    }
  }

  const seasonUidSet = new Set<string>([profileUid, canonicalUid, ...verifiedAliasUids])
  const playerMatchUidSet = new Set<string>([canonicalUid, ...verifiedAliasUids])
  if (profileUid !== canonicalUid) {
    playerMatchUidSet.add(profileUid)
  }

  for (const uid of verifiedAliasUids) {
    if (!devReasons[uid]) devReasons[uid] = 'verified-known-alias'
  }

  const playerMatchUids = sortedUnique(playerMatchUidSet)
  const verifiedAlias = sortedUnique(verifiedAliasUids)
  const canonicalPmRows = await countRankPmRows(prisma, canonicalUid, apiSeasonId)
  const profilePmRows =
    profileUid !== canonicalUid
      ? await countRankPmRows(prisma, profileUid, apiSeasonId)
      : 0
  const status = identityStatus(
    verifiedAlias.length,
    playerMatchUids.length,
    canonicalPmRows,
    profilePmRows,
    statsFingerprint,
  )

  return {
    seasonUids: sortedUnique(seasonUidSet),
    playerMatchUids,
    verifiedAliasUids: verifiedAlias,
    method,
    status,
    devReasons,
    devTrace,
  }
}

export async function resolveProfileIdentity(
  prisma: PrismaClient,
  params: ResolveProfileIdentityParams,
): Promise<ResolvedProfileIdentity> {
  const requestedNickname = params.nickname.trim()
  const normalizedNickname = normalizeNickname(requestedNickname)

  const canonicalResolution =
    params.canonicalResolution ??
    (await resolveCanonicalUidForNickname(prisma, requestedNickname, params.lookupUid, {
      apiSeasonId: params.apiSeasonId,
      statsFingerprint: params.statsFingerprint ?? undefined,
    }))

  const canonicalUid = canonicalResolution.uid
  const verified = await resolveVerifiedSourceUids(prisma, {
    ...params,
    nickname: requestedNickname,
    canonicalUid,
    canonicalResolution,
  })

  if (verified.verifiedAliasUids.length > 0) {
    void persistVerifiedProfileAliases(
      prisma,
      canonicalUid,
      verified.verifiedAliasUids.map((sourceUid) => ({
        sourceUid,
        verificationMethod: verified.method,
      })),
    ).catch(() => {})
  }

  if (
    canonicalUid === params.lookupUid ||
    verified.verifiedAliasUids.includes(params.lookupUid)
  ) {
    void persistNicknameBinding(prisma, requestedNickname, canonicalUid).catch(() => {})
  }

  return {
    requestedNickname,
    normalizedNickname,
    owner: {
      canonicalUid,
      canonicalUserNum: canonicalUserNum(canonicalUid),
    },
    sources: {
      profileUid: params.lookupUid,
      seasonUids: verified.seasonUids,
      playerMatchUids: verified.playerMatchUids,
    },
    verification: {
      method: verified.method,
      status: verified.status,
      verifiedAliasUids: verified.verifiedAliasUids,
      devReasons: isDevEnv() ? verified.devReasons : undefined,
      devTrace: isDevEnv() ? verified.devTrace : undefined,
    },
    resolvedAt: new Date().toISOString(),
  }
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class ProfileIdentityCache {
  private readonly cache = new Map<string, CacheEntry<ResolvedProfileIdentity>>()
  private readonly inflight = new Map<string, Promise<ResolvedProfileIdentity>>()

  private cacheKey(normalizedNickname: string, apiSeasonId: number): string {
    return `${normalizedNickname}:${apiSeasonId}`
  }

  get(normalizedNickname: string, apiSeasonId: number): ResolvedProfileIdentity | undefined {
    const key = this.cacheKey(normalizedNickname, apiSeasonId)
    const entry = this.cache.get(key)
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) this.cache.delete(key)
      return undefined
    }
    return entry.value
  }

  set(identity: ResolvedProfileIdentity, apiSeasonId: number): void {
    const ttl =
      identity.verification.status === 'complete'
        ? COMPLETE_IDENTITY_CACHE_TTL_MS
        : PARTIAL_IDENTITY_CACHE_TTL_MS
    const key = this.cacheKey(identity.normalizedNickname, apiSeasonId)
    this.cache.set(key, {
      value: identity,
      expiresAt: Date.now() + ttl,
    })
  }

  invalidateNickname(normalizedNickname: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${normalizedNickname}:`)) {
        this.cache.delete(key)
      }
    }
  }

  shouldUpgrade(
    cached: ResolvedProfileIdentity,
    params: ResolveProfileIdentityParams,
  ): boolean {
    if (
      cached.verification.verifiedAliasUids.length === 0 &&
      cached.sources.playerMatchUids.length <= 1 &&
      ((params.statsFingerprint?.totalGames ?? 0) > 0 ||
        (params.bootstrapGameIds?.length ?? 0) > 0)
    ) {
      return true
    }
    if (cached.verification.status === 'complete') return false
    if (params.statsFingerprint && params.statsFingerprint.totalGames > 0) return true
    if (params.bootstrapGameIds && params.bootstrapGameIds.length > 0) return true
    return false
  }

  isBetterIdentity(
    current: ResolvedProfileIdentity,
    candidate: ResolvedProfileIdentity,
  ): boolean {
    if (candidate.verification.status === 'complete' && current.verification.status !== 'complete') {
      return true
    }
    return candidate.sources.playerMatchUids.length > current.sources.playerMatchUids.length
  }

  async resolve(
    prisma: PrismaClient,
    params: ResolveProfileIdentityParams,
    loader: () => Promise<ResolvedProfileIdentity>,
  ): Promise<ResolvedProfileIdentity> {
    const normalizedNickname = normalizeNickname(params.nickname)
    const cached = this.get(normalizedNickname, params.apiSeasonId)
    if (cached && !this.shouldUpgrade(cached, params)) {
      return cached
    }

    const inflightKey = this.cacheKey(normalizedNickname, params.apiSeasonId)
    let pending = this.inflight.get(inflightKey)
    if (!pending) {
      pending = loader().then((identity) => {
        const existing = this.get(normalizedNickname, params.apiSeasonId)
        if (existing && !this.isBetterIdentity(existing, identity)) {
          return existing
        }
        this.set(identity, params.apiSeasonId)
        return identity
      })
      this.inflight.set(inflightKey, pending)
    }

    try {
      const resolved = await pending
      if (this.shouldUpgrade(resolved, params)) {
        const upgraded = await loader()
        if (this.isBetterIdentity(resolved, upgraded)) {
          this.set(upgraded, params.apiSeasonId)
          return upgraded
        }
      }
      return resolved
    } finally {
      if (this.inflight.get(inflightKey) === pending) {
        this.inflight.delete(inflightKey)
      }
    }
  }
}
