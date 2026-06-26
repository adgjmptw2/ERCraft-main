import type { PrismaClient } from '@prisma/client'

import { readPersistedProfileAliasUids } from '../cache/profileIdentityAlias.js'
import { readPersistedNicknameBinding } from '../cache/profileNicknameBinding.js'
import {
  playerSeasonsCacheId,
  readPlayerSeasonsCache,
  readPlayerSeasonsCacheIncludingStale,
  shouldRefetchPlayerSeasonsChunk,
} from '../cache/playerSeasonsCache.js'
import { isPrismaPlayerMatchReady } from '../cache/playerMatchStore.js'
import {
  hasProfileCacheDataForUids,
  hasStoredSeasonHistory,
} from '../cache/profileLastRefreshedAt.js'
import type { SeasonStatsFingerprint } from '../cache/nicknameUidResolver.js'
import { resolveCanonicalUidForNickname } from '../cache/nicknameUidResolver.js'
import type { BserUserStat } from '../external/bserClient.js'
import type { SeasonCatalog } from '../external/seasonCatalog.js'
import type { PlayerSeasonsContract } from '../contracts/season.js'
import type { ResolvedProfileIdentity } from '../utils/resolvedProfileIdentity.js'
import { readSeasonStatsCacheSnapshot, seasonStatsCacheId } from '../cache/seasonStatsCache.js'
import { traceProfileRead } from '../utils/profileReadTrace.js'

export interface ProfileReadAvailability {
  hasCurrentPlayerMatches: boolean
  hasSeasonHistory: boolean
  hasAccountLevel: boolean
  identityStatus: 'complete' | 'partial' | 'fallback'
}

export interface ProfileReadContext {
  requestedNickname: string
  identity: ResolvedProfileIdentity
  currentSeason: {
    displaySeasonNumber: number
    apiSeasonId: number
  }
  availability: ProfileReadAvailability
}

export function squadStatsFingerprint(
  stats: ReadonlyArray<BserUserStat> | null | undefined,
): SeasonStatsFingerprint | null {
  const squad = stats?.find((row) => row.matchingTeamMode === 3) ?? stats?.[0]
  if (!squad || squad.totalGames <= 0) return null
  return { totalGames: squad.totalGames, mmr: squad.mmr }
}

async function statsNicknameLinkedUids(
  prisma: PrismaClient,
  nickname: string,
  apiSeasonId: number,
): Promise<string[]> {
  const trimmed = nickname.trim()
  if (!trimmed) return []

  const uids = new Set<string>()

  if (typeof prisma.matchParticipant?.findMany === 'function') {
    const participants = await prisma.matchParticipant.findMany({
      where: { nickname: trimmed },
      select: { uid: true },
      distinct: ['uid'],
      take: 16,
    })
    for (const row of participants) {
      if (row.uid) uids.add(row.uid)
    }
  }

  const delegate = (prisma as unknown as Record<string, unknown>).seasonStatsCache
  if (typeof delegate === 'object' && delegate !== null) {
    const suffix = `:${apiSeasonId}`
    const rows = await prisma.seasonStatsCache.findMany({
      where: { id: { endsWith: suffix } },
      select: { id: true, data: true },
      take: 200,
    })
    for (const row of rows) {
      const sep = row.id.lastIndexOf(':')
      if (sep <= 0) continue
      const uid = row.id.slice(0, sep)
      if (!Array.isArray(row.data)) continue
      const stats = row.data as Array<{ nickname?: string }>
      const nick = stats.find((entry) => entry.nickname?.trim())?.nickname?.trim()
      if (nick && nick.toLowerCase() === trimmed.toLowerCase()) uids.add(uid)
    }
  }

  return [...uids]
}

export async function resolveDbStatsFingerprint(
  prisma: PrismaClient,
  nickname: string,
  lookupUid: string,
  apiSeasonId: number,
): Promise<SeasonStatsFingerprint | null> {
  const direct = squadStatsFingerprint(
    await readSeasonStatsCacheSnapshot(prisma, seasonStatsCacheId(lookupUid, apiSeasonId)),
  )
  if (direct) return direct

  const candidates = await statsNicknameLinkedUids(prisma, nickname, apiSeasonId)
  for (const uid of candidates) {
    if (uid === lookupUid) continue
    const fingerprint = squadStatsFingerprint(
      await readSeasonStatsCacheSnapshot(prisma, seasonStatsCacheId(uid, apiSeasonId)),
    )
    if (fingerprint) return fingerprint
  }
  return null
}

export async function resolveCanonicalUidFromDb(
  prisma: PrismaClient,
  nickname: string,
  lookupUid: string,
  apiSeasonId: number,
  statsFingerprint?: SeasonStatsFingerprint | null,
): Promise<string> {
  const binding = await readPersistedNicknameBinding(prisma, nickname)
  if (binding) return binding.canonicalUid

  const fingerprint =
    statsFingerprint ?? (await resolveDbStatsFingerprint(prisma, nickname, lookupUid, apiSeasonId))
  const resolution = await resolveCanonicalUidForNickname(prisma, nickname.trim(), lookupUid, {
    apiSeasonId,
    statsFingerprint: fingerprint ?? undefined,
  })
  return resolution.uid
}

export async function buildSeasonsCacheUidCandidates(
  prisma: PrismaClient,
  nickname: string,
  lookupUid: string,
  canonicalUid: string,
  apiSeasonId: number,
): Promise<string[]> {
  const uids = new Set<string>([canonicalUid, lookupUid])
  const binding = await readPersistedNicknameBinding(prisma, nickname)
  if (binding) uids.add(binding.canonicalUid)
  for (const uid of await readPersistedProfileAliasUids(prisma, canonicalUid)) {
    uids.add(uid)
  }
  for (const uid of await statsNicknameLinkedUids(prisma, nickname, apiSeasonId)) {
    uids.add(uid)
  }
  return [...uids].filter((uid) => uid.length > 0)
}

export interface SeasonsDbReadResult {
  body: PlayerSeasonsContract
  uid: string
  source: 'db'
}

export async function tryReadSeasonsGridFromDb(
  prisma: PrismaClient,
  candidateUids: string[],
  from: number,
  to: number,
  catalog: SeasonCatalog,
  options?: { acceptStale?: boolean },
): Promise<SeasonsDbReadResult | null> {
  const apiIdForDisplay = (displaySeason: number) => catalog.apiIdForDisplay(displaySeason)

  for (const uid of candidateUids) {
    const cacheId = playerSeasonsCacheId(uid, from, to)
    const cached =
      (await readPlayerSeasonsCache(prisma, cacheId)) ??
      (await readPlayerSeasonsCacheIncludingStale(prisma, cacheId))
    if (!cached) continue
    const stale = await shouldRefetchPlayerSeasonsChunk(
      prisma,
      uid,
      cached,
      from,
      to,
      apiIdForDisplay,
    )
    if (stale && !options?.acceptStale) continue
    traceProfileRead({
      event: 'seasons-db-hit',
      uid,
      from,
      to,
      seasonCount: cached.seasons.length,
    })
    return { body: cached, uid, source: 'db' }
  }
  return null
}

export async function buildProfileAvailability(
  prisma: PrismaClient,
  identity: ResolvedProfileIdentity,
  apiSeasonId: number,
  displaySeasonNumber: number,
): Promise<ProfileReadAvailability> {
  const playerMatchUids = identity.sources.playerMatchUids
  const [hasCurrentPlayerMatches, hasSeasonHistory] = await Promise.all([
    hasProfileCacheDataForUids(prisma, playerMatchUids),
    hasStoredSeasonHistory(prisma, identity.owner.canonicalUid, playerMatchUids, 1, displaySeasonNumber),
  ])

  return {
    hasCurrentPlayerMatches,
    hasSeasonHistory,
    hasAccountLevel: false,
    identityStatus:
      identity.verification.status === 'complete'
        ? 'complete'
        : identity.verification.verifiedAliasUids.length > 0
          ? 'complete'
          : 'partial',
  }
}
