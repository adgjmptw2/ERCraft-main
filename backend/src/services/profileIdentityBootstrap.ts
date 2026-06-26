import type { PrismaClient } from '@prisma/client'

import { persistVerifiedProfileAliases } from '../cache/profileIdentityAlias.js'
import {
  persistNicknameBinding,
  readPersistedNicknameBinding,
} from '../cache/profileNicknameBinding.js'
import { readMatchesCacheSnapshot, matchesCacheId } from '../cache/matchesCache.js'
import { isPrismaPlayerMatchReady } from '../cache/playerMatchStore.js'
import { playerSeasonsCacheId } from '../cache/playerSeasonsCache.js'
import { canonicalUserNum } from '../cache/nicknameUidResolver.js'
import { traceProfileRead } from '../utils/profileReadTrace.js'

const MAX_PARTICIPANT_GAME_IDS = 32
const MAX_OVERLAP_UID_CANDIDATES = 64
const MAX_CLUSTER_COMPARE = 24

export interface ProfileIdentityBootstrapResult {
  bootstrapped: boolean
  canonicalUid: string
  aliasUids: string[]
  participantGameCount: number
  evidenceGameCount: number
  method: 'participant-game-overlap'
}

function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase()
}

function minParticipantOverlap(participantGameCount: number): number {
  if (participantGameCount <= 0) return Number.POSITIVE_INFINITY
  if (participantGameCount <= 3) return participantGameCount
  return Math.max(2, Math.min(3, Math.ceil(participantGameCount * 0.25)))
}

function minAliasOverlap(pmCount: number, participantOverlap: number): number {
  if (pmCount <= 0 || participantOverlap <= 0) return Number.POSITIVE_INFINITY
  if (pmCount <= 3) return pmCount
  return Math.max(3, Math.min(pmCount, participantOverlap))
}

async function collectParticipantGameIds(
  prisma: PrismaClient,
  nickname: string,
): Promise<string[]> {
  if (typeof prisma.matchParticipant?.findMany !== 'function') return []
  const trimmed = nickname.trim()
  if (!trimmed) return []

  const rows = await prisma.matchParticipant.findMany({
    where: { nickname: trimmed },
    select: { gameId: true },
    distinct: ['gameId'],
    take: MAX_PARTICIPANT_GAME_IDS,
  })
  return rows.map((row) => row.gameId).filter((id) => id.length > 0)
}

async function expandEvidenceGameIds(
  prisma: PrismaClient,
  participantGameIds: string[],
  candidateUids: string[],
): Promise<Set<string>> {
  const evidence = new Set<string>(participantGameIds)
  for (const uid of candidateUids.slice(0, 8)) {
    const snapshot = await readMatchesCacheSnapshot(prisma, matchesCacheId(uid, 'all'))
    if (!snapshot?.items.length) continue
    for (const item of snapshot.items.slice(0, 16)) {
      if (item.matchId) evidence.add(item.matchId)
    }
  }
  return evidence
}

interface OverlapCandidate {
  uid: string
  overlap: number
  pmCount: number
}

async function listOverlapCandidates(
  prisma: PrismaClient,
  evidenceGameIds: string[],
  apiSeasonId: number,
  minOverlap: number,
): Promise<OverlapCandidate[]> {
  if (!isPrismaPlayerMatchReady(prisma) || evidenceGameIds.length === 0) return []

  const rows = await prisma.playerMatch.groupBy({
    by: ['uid'],
    where: {
      gameId: { in: evidenceGameIds },
      gameMode: 'rank',
      apiSeasonId,
    },
    _count: { gameId: true },
    orderBy: { _count: { gameId: 'desc' } },
    take: MAX_OVERLAP_UID_CANDIDATES,
  })

  const candidates: OverlapCandidate[] = []
  for (const row of rows) {
    if (row._count.gameId < minOverlap) continue
    const pmCount = await prisma.playerMatch.count({
      where: { uid: row.uid, apiSeasonId, gameMode: 'rank' },
    })
    if (pmCount <= 0) continue
    candidates.push({ uid: row.uid, overlap: row._count.gameId, pmCount })
  }
  return candidates
}

async function pmGameSignature(
  prisma: PrismaClient,
  uid: string,
  apiSeasonId: number,
): Promise<string | null> {
  const rows = await prisma.playerMatch.findMany({
    where: { uid, apiSeasonId, gameMode: 'rank' },
    select: { gameId: true },
    orderBy: { gameId: 'asc' },
    take: 1024,
  })
  if (rows.length === 0) return null
  return rows.map((row) => row.gameId).join(',')
}

interface GameCluster {
  signature: string
  uids: string[]
  pmCount: number
  participantOverlap: number
  hasSeasons: boolean
  score: number
}

async function buildClusters(
  prisma: PrismaClient,
  candidates: OverlapCandidate[],
  participantGameIdSet: Set<string>,
  apiSeasonId: number,
): Promise<GameCluster[]> {
  const bySignature = new Map<string, GameCluster>()
  const compare = candidates
    .sort((a, b) => b.overlap - a.overlap || b.pmCount - a.pmCount || a.uid.localeCompare(b.uid))
    .slice(0, MAX_CLUSTER_COMPARE)

  for (const candidate of compare) {
    const signature = await pmGameSignature(prisma, candidate.uid, apiSeasonId)
    if (!signature) continue

    const existing = bySignature.get(signature)
    if (existing) {
      existing.uids.push(candidate.uid)
      existing.participantOverlap = Math.max(existing.participantOverlap, candidate.overlap)
      continue
    }

    const hasSeasons =
      typeof prisma.playerSeasonsCache?.findUnique === 'function'
        ? (await prisma.playerSeasonsCache.findUnique({
            where: { id: playerSeasonsCacheId(candidate.uid, 1, 11) },
            select: { id: true },
          })) != null
        : false

    const score =
      candidate.overlap * 100_000 + candidate.pmCount * 100 + (hasSeasons ? 500 : 0)

    bySignature.set(signature, {
      signature,
      uids: [candidate.uid],
      pmCount: candidate.pmCount,
      participantOverlap: candidate.overlap,
      hasSeasons,
      score,
    })
  }

  return [...bySignature.values()].sort(
    (a, b) => b.score - a.score || b.pmCount - a.pmCount || a.signature.localeCompare(b.signature),
  )
}

async function countSharedGames(
  prisma: PrismaClient,
  uidA: string,
  uidB: string,
  apiSeasonId: number,
): Promise<number> {
  if (!uidA || !uidB || uidA === uidB || !isPrismaPlayerMatchReady(prisma)) return 0
  const sample = await prisma.playerMatch.findMany({
    where: { uid: uidA, apiSeasonId, gameMode: 'rank' },
    select: { gameId: true },
    take: 128,
  })
  if (sample.length === 0) return 0
  return prisma.playerMatch.count({
    where: {
      uid: uidB,
      apiSeasonId,
      gameMode: 'rank',
      gameId: { in: sample.map((row) => row.gameId) },
    },
  })
}

function pickWinningCluster(clusters: GameCluster[], minOverlap: number): GameCluster | null {
  const eligible = clusters.filter((cluster) => cluster.participantOverlap >= minOverlap)
  if (eligible.length === 0) return null

  const winner = eligible[0]
  const runnerUp = eligible[1]
  if (!winner) return null

  if (runnerUp && runnerUp.score === winner.score && runnerUp.signature !== winner.signature) {
    return null
  }

  return winner
}

/**
 * binding/alias가 비어 있을 때 match_participant + PlayerMatch gameId 증거로 identity를 복원한다.
 * fingerprint 단독 매칭은 사용하지 않는다.
 */
export async function bootstrapProfileIdentityFromDb(
  prisma: PrismaClient,
  nickname: string,
  lookupUid: string,
  apiSeasonId: number,
): Promise<ProfileIdentityBootstrapResult | null> {
  const normalizedNickname = normalizeNickname(nickname)
  if (!normalizedNickname) return null

  const existingBinding = await readPersistedNicknameBinding(prisma, nickname)
  if (existingBinding) return null

  const participantGameIds = await collectParticipantGameIds(prisma, nickname)
  if (participantGameIds.length === 0) return null

  const minOverlap = minParticipantOverlap(participantGameIds.length)
  const participantGameIdSet = new Set(participantGameIds)

  const initialCandidates = await listOverlapCandidates(
    prisma,
    participantGameIds,
    apiSeasonId,
    minOverlap,
  )
  if (initialCandidates.length === 0) return null

  const evidenceGameIds = await expandEvidenceGameIds(
    prisma,
    participantGameIds,
    initialCandidates.map((row) => row.uid),
  )

  const candidates = await listOverlapCandidates(
    prisma,
    [...evidenceGameIds],
    apiSeasonId,
    minOverlap,
  )
  if (candidates.length === 0) return null

  const clusters = await buildClusters(prisma, candidates, participantGameIdSet, apiSeasonId)
  const winner = pickWinningCluster(clusters, minOverlap)
  if (!winner) return null

  const canonicalUid = [...winner.uids].sort()[0]
  const aliasUids = new Set<string>()

  for (const uid of winner.uids) {
    if (uid !== canonicalUid) aliasUids.add(uid)
  }

  if (lookupUid && lookupUid !== canonicalUid) {
    const shared = await countSharedGames(prisma, canonicalUid, lookupUid, apiSeasonId)
    const required = minAliasOverlap(winner.pmCount, winner.participantOverlap)
    if (shared >= required) {
      aliasUids.add(lookupUid)
    }
  }

  const lookupLinked =
    !lookupUid || lookupUid === canonicalUid || aliasUids.has(lookupUid)
  if (!lookupLinked) {
    traceProfileRead({
      event: 'identity-db-bootstrap-rejected',
      nickname,
      uid: lookupUid,
      source: 'participant-game-overlap-unlinked',
      identityStatus: 'partial',
    })
    return null
  }

  await persistNicknameBinding(prisma, nickname, canonicalUid)
  if (aliasUids.size > 0) {
    await persistVerifiedProfileAliases(
      prisma,
      canonicalUid,
      [...aliasUids].map((sourceUid) => ({
        sourceUid,
        verificationMethod: 'game-id-overlap' as const,
      })),
    )
  }

  traceProfileRead({
    event: 'identity-db-bootstrap',
    nickname,
    uid: canonicalUid,
    playerMatchUidCount: winner.uids.length,
    source: 'participant-game-overlap',
    identityStatus: 'complete',
  })

  return {
    bootstrapped: true,
    canonicalUid,
    aliasUids: [...aliasUids],
    participantGameCount: participantGameIds.length,
    evidenceGameCount: evidenceGameIds.size,
    method: 'participant-game-overlap',
  }
}

export function buildIdentityFromBootstrap(
  nickname: string,
  lookupUid: string,
  bootstrap: ProfileIdentityBootstrapResult,
): {
  canonicalUid: string
  playerMatchUids: string[]
  verifiedAliasUids: string[]
} {
  const verifiedAliasUids = [...new Set(bootstrap.aliasUids)].filter((uid) => uid !== bootstrap.canonicalUid)
  const playerMatchUids = [...new Set([bootstrap.canonicalUid, ...verifiedAliasUids])].sort()
  if (lookupUid && !playerMatchUids.includes(lookupUid) && lookupUid !== bootstrap.canonicalUid) {
    playerMatchUids.push(lookupUid)
    playerMatchUids.sort()
  }
  return {
    canonicalUid: bootstrap.canonicalUid,
    playerMatchUids,
    verifiedAliasUids,
  }
}

export { canonicalUserNum }
