import type { Prisma, PrismaClient } from '@prisma/client'
import { Prisma as PrismaNamespace } from '@prisma/client'

import type { MatchDetailContract, MatchParticipantContract } from '../contracts/matchDetail.js'
import type { MatchSummaryContract } from '../contracts/player.js'

export function isPrismaMatchDetailReady(prisma: PrismaClient): boolean {
  const delegate = (prisma as unknown as Record<string, unknown>).matchDetail
  return (
    typeof delegate === 'object' &&
    delegate !== null &&
    typeof (delegate as { findUnique?: unknown }).findUnique === 'function'
  )
}

function toStoredJsonArray(value: number[] | undefined): Prisma.InputJsonValue | typeof PrismaNamespace.JsonNull {
  if (!value || value.length === 0) return PrismaNamespace.JsonNull
  return value as Prisma.InputJsonValue
}

function toStoredJson(value: unknown): Prisma.InputJsonValue | typeof PrismaNamespace.JsonNull {
  if (value === undefined || value === null) return PrismaNamespace.JsonNull
  return value as Prisma.InputJsonValue
}

function readJsonNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const nums = value.filter((entry): entry is number => typeof entry === 'number')
  return nums.length > 0 ? nums : undefined
}

function readVisionScoreFromGame(game: unknown): number | null {
  if (!game || typeof game !== 'object') return null
  const value = (game as { viewContribution?: unknown }).viewContribution
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function participantMatchKey(participant: {
  nickname?: string | null
  teamNumber?: number | null
  characterNum: number
}): string {
  return `${participant.nickname ?? ''}:${participant.teamNumber ?? 0}:${participant.characterNum}`
}

function enrichParticipantsVisionFromRawJson(
  participants: MatchParticipantContract[],
  rawGames: unknown,
): MatchParticipantContract[] {
  if (!Array.isArray(rawGames) || rawGames.length === 0) return participants

  const visionByKey = new Map<string, number>()
  for (const game of rawGames) {
    const visionScore = readVisionScoreFromGame(game)
    if (visionScore == null) continue
    if (!game || typeof game !== 'object') continue
    const row = game as {
      nickname?: string | null
      teamNumber?: number | null
      characterNum?: number
    }
    if (typeof row.characterNum !== 'number') continue
    visionByKey.set(
      participantMatchKey({
        nickname: row.nickname ?? null,
        teamNumber: row.teamNumber ?? null,
        characterNum: row.characterNum,
      }),
      visionScore,
    )
  }

  if (visionByKey.size === 0) return participants

  return participants.map((participant) => {
    const visionScore = visionByKey.get(participantMatchKey(participant))
    return visionScore != null ? { ...participant, visionScore } : participant
  })
}

function participantFromRow(row: {
  id: bigint
  uid: string | null
  nickname: string | null
  teamNumber: number | null
  teamRank: number | null
  placement: number | null
  characterNum: number
  characterName: string | null
  skinCode: number | null
  accountLevel: number | null
  characterLevel: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  teamKills: number | null
  damageToPlayer: number | null
  damageToMonster: number | null
  damageTaken: number | null
  credit: number | null
  rpAfter: number | null
  rpDelta: number | null
  bestWeapon: number | null
  tacticalSkillGroup: number | null
  traitFirstCore: number | null
  traitFirstSub: unknown
  traitSecondSub: unknown
  equipment: unknown
  equipmentGrade: unknown
  cobaltInfusions: unknown
  gameId: string
}): MatchParticipantContract {
  return {
    participantId: String(row.id),
    uid: row.uid,
    nickname: row.nickname,
    teamNumber: row.teamNumber,
    teamRank: row.teamRank,
    placement: row.placement ?? 99,
    characterNum: row.characterNum,
    characterName: row.characterName,
    skinCode: row.skinCode,
    accountLevel: row.accountLevel,
    characterLevel: row.characterLevel,
    kills: row.kills ?? 0,
    deaths: row.deaths ?? 0,
    assists: row.assists ?? 0,
    teamKills: row.teamKills,
    damageToPlayer: row.damageToPlayer,
    damageToMonster: row.damageToMonster,
    damageTaken: row.damageTaken,
    credit: row.credit,
    rpAfter: row.rpAfter,
    rpDelta: row.rpDelta,
    bestWeapon: row.bestWeapon,
    tacticalSkillGroup: row.tacticalSkillGroup,
    traitFirstCore: row.traitFirstCore,
    traitFirstSub: readJsonNumberArray(row.traitFirstSub),
    traitSecondSub: readJsonNumberArray(row.traitSecondSub),
    equipment: row.equipment as MatchSummaryContract['equipment'],
    equipmentGrade: row.equipmentGrade as MatchSummaryContract['equipmentGrade'],
    cobaltInfusions: readJsonNumberArray(row.cobaltInfusions),
  }
}

function groupParticipants(rows: MatchParticipantContract[]): MatchDetailContract['teams'] {
  const byTeam = new Map<number, MatchParticipantContract[]>()
  for (const row of rows) {
    const teamNumber = row.teamNumber ?? 0
    const bucket = byTeam.get(teamNumber) ?? []
    bucket.push(row)
    byTeam.set(teamNumber, bucket)
  }
  return [...byTeam.entries()]
    .map(([teamNumber, participants]) => {
      const sorted = [...participants].sort((a, b) => a.placement - b.placement)
      return {
        teamNumber,
        teamRank: sorted[0]?.teamRank ?? sorted[0]?.placement ?? 99,
        participants: sorted,
      }
    })
    .sort((a, b) => a.teamRank - b.teamRank || a.teamNumber - b.teamNumber)
}

export async function readMatchDetailFromDb(
  prisma: PrismaClient,
  gameId: string,
): Promise<MatchDetailContract | null> {
  if (!isPrismaMatchDetailReady(prisma)) return null

  const row = await prisma.matchDetail.findUnique({
    where: { gameId },
    include: {
      participants: {
        orderBy: [{ teamNumber: 'asc' }, { placement: 'asc' }],
      },
    },
  })
  if (!row) return null

  const participants = enrichParticipantsVisionFromRawJson(
    row.participants.map(participantFromRow),
    row.rawJson,
  )
  return {
    gameId: row.gameId,
    apiSeasonId: row.apiSeasonId,
    displaySeasonId: row.displaySeasonId,
    gameMode: row.gameMode as MatchDetailContract['gameMode'],
    matchingMode: row.matchingMode,
    matchingTeamMode: row.matchingTeamMode,
    playedAt: row.playedAt.toISOString(),
    durationSeconds: row.durationSeconds,
    detailStatus: 'ready',
    teams: groupParticipants(participants),
  }
}

export async function writeMatchDetailToDb(
  prisma: PrismaClient,
  detail: MatchDetailContract,
  rawGames: unknown,
): Promise<void> {
  if (!isPrismaMatchDetailReady(prisma) || detail.detailStatus !== 'ready') return

  const participants = detail.teams.flatMap((team) => team.participants)
  await prisma.$transaction(async (tx) => {
    await tx.matchDetail.upsert({
      where: { gameId: detail.gameId },
      create: {
        gameId: detail.gameId,
        apiSeasonId: detail.apiSeasonId ?? null,
        displaySeasonId: detail.displaySeasonId ?? null,
        gameMode: detail.gameMode ?? 'normal',
        matchingMode: detail.matchingMode ?? null,
        matchingTeamMode: detail.matchingTeamMode ?? null,
        playedAt: new Date(detail.playedAt),
        durationSeconds: detail.durationSeconds ?? null,
        rawJson: toStoredJson(rawGames),
      },
      update: {
        apiSeasonId: detail.apiSeasonId ?? null,
        displaySeasonId: detail.displaySeasonId ?? null,
        gameMode: detail.gameMode ?? 'normal',
        matchingMode: detail.matchingMode ?? null,
        matchingTeamMode: detail.matchingTeamMode ?? null,
        playedAt: new Date(detail.playedAt),
        durationSeconds: detail.durationSeconds ?? null,
        rawJson: toStoredJson(rawGames),
      },
    })

    await tx.matchParticipant.deleteMany({ where: { gameId: detail.gameId } })
    if (participants.length > 0) {
      await tx.matchParticipant.createMany({
        data: participants.map((row) => ({
          gameId: detail.gameId,
          uid: row.uid ?? null,
          nickname: row.nickname ?? null,
          teamNumber: row.teamNumber ?? null,
          teamRank: row.teamRank ?? null,
          placement: row.placement,
          characterNum: row.characterNum,
          characterName: row.characterName ?? null,
          skinCode: row.skinCode ?? null,
          accountLevel: row.accountLevel ?? null,
          characterLevel: row.characterLevel ?? null,
          kills: row.kills,
          deaths: row.deaths,
          assists: row.assists,
          teamKills: row.teamKills ?? null,
          damageToPlayer: row.damageToPlayer ?? null,
          damageToMonster: row.damageToMonster ?? null,
          damageTaken: row.damageTaken ?? null,
          credit: row.credit ?? null,
          rpAfter: row.rpAfter ?? null,
          rpDelta: row.rpDelta ?? null,
          bestWeapon: row.bestWeapon ?? null,
          tacticalSkillGroup: row.tacticalSkillGroup ?? null,
          traitFirstCore: row.traitFirstCore ?? null,
          traitFirstSub: toStoredJson(row.traitFirstSub),
          traitSecondSub: toStoredJson(row.traitSecondSub),
          equipment: toStoredJson(row.equipment),
          equipmentGrade: toStoredJson(row.equipmentGrade),
          cobaltInfusions: toStoredJsonArray(row.cobaltInfusions),
          rawJson: PrismaNamespace.JsonNull,
        })),
      })
    }

    const teamLuckMetricCache = (tx as unknown as {
      teamLuckMetricCache?: { deleteMany?: (args: { where: { matchId: string } }) => Promise<unknown> }
    }).teamLuckMetricCache
    if (typeof teamLuckMetricCache?.deleteMany === 'function') {
      await teamLuckMetricCache.deleteMany({ where: { matchId: detail.gameId } })
    }
  })
}
