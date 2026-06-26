import type { PrismaClient } from '@prisma/client'

import { readPersistedProfileAliasUids } from '../cache/profileIdentityAlias.js'
import {
  deleteNicknameBinding,
  readPersistedNicknameBinding,
} from '../cache/profileNicknameBinding.js'
import type { BserUserStat } from '../external/bserClient.js'
import { uidToUserNum } from '../external/bserMapper.js'
import { readSeasonAggregateCache, seasonAggregateCacheId } from './seasonAggregateCache.js'
import { isPrismaPlayerMatchReady } from './playerMatchStore.js'
import {
  isPrismaBackfillStateReady,
  readPlayerSeasonBackfillState,
} from './playerSeasonBackfillState.js'
import { readSeasonStatsCacheSnapshot, seasonStatsCacheId } from './seasonStatsCache.js'

export interface SeasonStatsFingerprint {
  totalGames: number
  mmr: number
}

export interface ResolveCanonicalUidOptions {
  apiSeasonId?: number
  statsFingerprint?: SeasonStatsFingerprint | null
}

export interface CanonicalUidResolution {
  uid: string
  swapped: boolean
  bserUid: string
  storedUid: string | null
  reason?: string
}

function nicknameMatches(stored: string | null | undefined, target: string): boolean {
  if (!stored) return false
  return stored.trim().toLowerCase() === target.trim().toLowerCase()
}

function statsNickname(stats: BserUserStat[] | null): string | null {
  if (!stats) return null
  for (const row of stats) {
    if (typeof row.nickname === 'string' && row.nickname.trim()) return row.nickname.trim()
  }
  return null
}

function squadStat(stats: BserUserStat[] | null): BserUserStat | null {
  if (!stats || stats.length === 0) return null
  return stats.find((row) => row.matchingTeamMode === 3) ?? stats[0] ?? null
}

function parseStatsCacheData(data: unknown): BserUserStat[] | null {
  if (!Array.isArray(data)) return null
  return data as BserUserStat[]
}

function statsCacheUidFromId(id: string): string | null {
  const sep = id.lastIndexOf(':')
  if (sep <= 0) return null
  return id.slice(0, sep)
}

async function statsNicknameForUid(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
): Promise<string | null> {
  const stats = await readSeasonStatsCacheSnapshot(prisma, seasonStatsCacheId(uid, apiSeasonId))
  return statsNickname(stats)
}

/** nickname과 연결된 uid 후보 — 기존 row merge/delete 없이 조회만 */
async function collectNicknameUidCandidates(
  prisma: PrismaClient,
  nickname: string,
  apiSeasonId?: number,
): Promise<string[]> {
  const trimmed = nickname.trim()
  if (!trimmed) return []

  const uids = new Set<string>()

  if (typeof prisma.matchParticipant?.findMany === 'function') {
    const participants = await prisma.matchParticipant.findMany({
      where: { nickname: trimmed },
      select: { uid: true, nickname: true },
      distinct: ['uid'],
      take: 16,
    })
    for (const row of participants) {
      if (row.uid && nicknameMatches(row.nickname, trimmed)) uids.add(row.uid)
    }
  }

  if (apiSeasonId !== undefined && isPrismaBackfillStateReady(prisma)) {
    const seasonStates = await prisma.playerSeasonBackfillState.findMany({
      where: { apiSeasonId },
      select: { uid: true, status: true, collectedGames: true },
      orderBy: { collectedGames: 'desc' },
      take: 48,
    })
    for (const state of seasonStates) {
      if (uids.has(state.uid)) continue
      const cachedNick = await statsNicknameForUid(prisma, state.uid, apiSeasonId)
      if (nicknameMatches(cachedNick, trimmed)) uids.add(state.uid)
    }
  }

  if (isPrismaBackfillStateReady(prisma)) {
    const completeStates = await prisma.playerSeasonBackfillState.findMany({
      where: apiSeasonId !== undefined ? { apiSeasonId, status: 'complete' } : { status: 'complete' },
      select: { uid: true, apiSeasonId: true, collectedGames: true },
      orderBy: { collectedGames: 'desc' },
      take: apiSeasonId !== undefined ? 64 : 24,
    })
    for (const state of completeStates) {
      if (uids.has(state.uid)) continue
      const seasonId = apiSeasonId ?? state.apiSeasonId
      const cachedStats = await readSeasonStatsCacheSnapshot(
        prisma,
        seasonStatsCacheId(state.uid, seasonId),
      )
      if (nicknameMatches(statsNickname(cachedStats), trimmed)) {
        uids.add(state.uid)
      }
    }
  }

  return [...uids]
}

/** BSER uid 변경 시 stats fingerprint로 동일 유저 후보 uid 탐색 */
async function collectFingerprintUidCandidates(
  prisma: PrismaClient,
  nickname: string,
  apiSeasonId: number,
  fingerprint: SeasonStatsFingerprint,
): Promise<string[]> {
  if (fingerprint.totalGames <= 0) return []

  const delegate = (prisma as unknown as Record<string, unknown>).seasonStatsCache
  if (typeof delegate !== 'object' || delegate === null) return []

  const rows = await prisma.seasonStatsCache.findMany({
    where: { id: { endsWith: `:${apiSeasonId}` } },
    select: { id: true, data: true },
    take: 400,
  })

  const uids = new Set<string>()
  for (const row of rows) {
    const uid = statsCacheUidFromId(row.id)
    if (!uid) continue
    const stats = parseStatsCacheData(row.data)
    const squad = squadStat(stats)
    if (!squad) continue
    if (squad.totalGames !== fingerprint.totalGames || squad.mmr !== fingerprint.mmr) continue

    const cachedNick = statsNickname(stats)
    if (!nicknameMatches(cachedNick, nickname)) continue
    uids.add(uid)
  }

  return [...uids]
}

async function collectSeasonAggregateUidCandidates(
  prisma: PrismaClient,
  nickname: string,
  apiSeasonId: number,
): Promise<string[]> {
  const delegate = (prisma as unknown as Record<string, unknown>).seasonAggregateCache
  if (typeof delegate !== 'object' || delegate === null) return []

  const rows = await prisma.seasonAggregateCache.findMany({
    where: { apiSeasonId, cacheStatus: { in: ['ready', 'partial'] } },
    select: { uid: true },
    orderBy: { lastRefreshedAt: 'desc' },
    take: 32,
  })

  const uids: string[] = []
  for (const row of rows) {
    const cachedNick = await statsNicknameForUid(prisma, row.uid, apiSeasonId)
    if (nicknameMatches(cachedNick, nickname)) uids.push(row.uid)
  }
  return uids
}

async function scoreUidProfileData(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId?: number,
  fingerprint?: SeasonStatsFingerprint | null,
  nickname?: string,
): Promise<number> {
  let score = 0

  if (apiSeasonId !== undefined && isPrismaBackfillStateReady(prisma)) {
    const state = await readPlayerSeasonBackfillState(prisma, uid, apiSeasonId)
    if (state?.status === 'complete') {
      const official = state.officialSeasonGames ?? 0
      const collected = state.collectedGames
      score = Math.max(
        score,
        official > 0 && collected >= official ? 20_000 + collected : 10_000 + collected,
      )
    } else if (state) {
      score = Math.max(score, 2_000 + state.collectedGames)
    }

    const aggregate = await readSeasonAggregateCache(prisma, seasonAggregateCacheId(uid, apiSeasonId))
    if (aggregate?.cacheStatus === 'ready') {
      score = Math.max(score, 8_000 + aggregate.rpSeries.length + aggregate.characterStats.length)
    } else if (aggregate) {
      score = Math.max(score, 3_000 + aggregate.rpSeries.length)
    }

    if (isPrismaPlayerMatchReady(prisma)) {
      const rankCount = await prisma.playerMatch.count({
        where: { uid, apiSeasonId, gameMode: 'rank' },
      })
      score = Math.max(score, rankCount)
      if (
        fingerprint &&
        rankCount > 0 &&
        Math.abs(rankCount - fingerprint.totalGames) <=
          Math.max(10, Math.floor(fingerprint.totalGames * 0.05))
      ) {
        score = Math.max(score, 50_000 + rankCount)
      }
    }

    const seasonsDelegate = (prisma as unknown as Record<string, unknown>).playerSeasonsCache
    if (
      typeof seasonsDelegate === 'object' &&
      seasonsDelegate !== null &&
      nickname &&
      apiSeasonId !== undefined
    ) {
      const cachedNick = await statsNicknameForUid(prisma, uid, apiSeasonId)
      if (nicknameMatches(cachedNick, nickname)) {
        const grid = await prisma.playerSeasonsCache.findUnique({
          where: { id: `${uid}:1:11` },
          select: { data: true },
        })
        if (grid?.data && typeof grid.data === 'object' && grid.data !== null) {
          const seasons = (grid.data as { seasons?: Array<{ played?: boolean }> }).seasons ?? []
          const playedCount = seasons.filter((season) => season.played).length
          score = Math.max(score, 80_000 + playedCount * 100)
        }
      }
    }

    return score
  }

  if (isPrismaBackfillStateReady(prisma)) {
    const completeStates = await prisma.playerSeasonBackfillState.findMany({
      where: { uid, status: 'complete' },
      select: { collectedGames: true, officialSeasonGames: true },
      take: 4,
    })
    for (const state of completeStates) {
      const completeBonus =
        state.officialSeasonGames != null &&
        state.officialSeasonGames > 0 &&
        state.collectedGames >= state.officialSeasonGames
          ? 2_000
          : 1_000
      score = Math.max(score, completeBonus + state.collectedGames)
    }
  }

  if (isPrismaPlayerMatchReady(prisma)) {
    const rankCount = await prisma.playerMatch.count({
      where: { uid, gameMode: 'rank' },
    })
    score = Math.max(score, rankCount)
  }

  return score
}

async function collectBackfillUidCandidates(
  prisma: PrismaClient,
  nickname: string,
  apiSeasonId: number,
  collectedGames: number,
): Promise<string[]> {
  if (!isPrismaBackfillStateReady(prisma) || collectedGames <= 0) return []
  const rows = await prisma.playerSeasonBackfillState.findMany({
    where: { apiSeasonId, status: 'complete', collectedGames },
    select: { uid: true },
    take: 32,
  })
  const uids: string[] = []
  for (const row of rows) {
    const cachedNick = await statsNicknameForUid(prisma, row.uid, apiSeasonId)
    if (nicknameMatches(cachedNick, nickname)) uids.push(row.uid)
  }
  return uids
}

function pickBestUid(
  bserUid: string,
  candidates: string[],
  scores: Map<string, number>,
): { uid: string; storedUid: string | null; reason: string } {
  let bestUid = bserUid
  let bestScore = scores.get(bserUid) ?? 0
  let storedUid: string | null = null
  let reason = 'bser-uid'

  for (const candidate of [...candidates].sort()) {
    if (candidate === bserUid) continue
    const score = scores.get(candidate) ?? 0
    if (score > bestScore || (score === bestScore && candidate < bestUid)) {
      bestScore = score
      bestUid = candidate
      storedUid = candidate
      reason = 'db-richer-profile'
    }
  }

  return { uid: bestUid, storedUid, reason }
}

/**
 * BSER nickname lookup uid와 DB에 이미 수집된 uid가 다를 때,
 * complete backfill / aggregate / PlayerMatch가 더 풍부한 canonical uid를 선택한다.
 */
async function isTrustedNicknameBinding(
  prisma: PrismaClient,
  bserUid: string,
  canonicalUid: string,
): Promise<boolean> {
  if (!bserUid || !canonicalUid) return false
  if (canonicalUid === bserUid) return true
  const aliasUids = await readPersistedProfileAliasUids(prisma, canonicalUid)
  return aliasUids.includes(bserUid)
}

export async function resolveCanonicalUidForNickname(
  prisma: PrismaClient,
  nickname: string,
  bserUid: string,
  options?: ResolveCanonicalUidOptions,
): Promise<CanonicalUidResolution> {
  const binding = await readPersistedNicknameBinding(prisma, nickname)
  if (binding) {
    if (
      !isPrismaPlayerMatchReady(prisma) ||
      (await prisma.playerMatch.count({ where: { uid: binding.canonicalUid } })) > 0
    ) {
      return {
        uid: binding.canonicalUid,
        swapped: binding.canonicalUid !== bserUid,
        bserUid,
        storedUid: binding.canonicalUid,
        reason: 'nickname-binding',
      }
    }
  }

  const apiSeasonId = options?.apiSeasonId
  const candidateSet = new Set<string>([bserUid])

  for (const uid of await collectNicknameUidCandidates(prisma, nickname, apiSeasonId)) {
    candidateSet.add(uid)
  }

  if (apiSeasonId !== undefined) {
    for (const uid of await collectSeasonAggregateUidCandidates(prisma, nickname, apiSeasonId)) {
      candidateSet.add(uid)
    }
    if (options?.statsFingerprint) {
      for (const uid of await collectFingerprintUidCandidates(
        prisma,
        nickname,
        apiSeasonId,
        options.statsFingerprint,
      )) {
        candidateSet.add(uid)
      }
      for (const uid of await collectBackfillUidCandidates(
        prisma,
        nickname,
        apiSeasonId,
        options.statsFingerprint.totalGames,
      )) {
        candidateSet.add(uid)
      }
    }
  }

  const candidates = [...candidateSet]
  const scores = new Map<string, number>()
  for (const uid of candidates) {
    scores.set(
      uid,
      await scoreUidProfileData(prisma, uid, apiSeasonId, options?.statsFingerprint, nickname),
    )
  }

  const picked = pickBestUid(bserUid, candidates, scores)
  if (picked.uid !== bserUid && apiSeasonId !== undefined) {
    const cachedNick = await statsNicknameForUid(prisma, picked.uid, apiSeasonId)
    if (cachedNick && !nicknameMatches(cachedNick, nickname)) {
      return {
        uid: bserUid,
        swapped: false,
        bserUid,
        storedUid: null,
      }
    }
  }
  const swapped = picked.uid !== bserUid

  return {
    uid: picked.uid,
    swapped,
    bserUid,
    storedUid: picked.storedUid,
    reason: swapped ? picked.reason : undefined,
  }
}

/** canonical uid 보호 — 응답 userNum은 선택된 uid 기준 */
export function canonicalUserNum(uid: string): number {
  return uidToUserNum(uid)
}
