import type {
  MatchDetailContract,
  MatchDetailTeamContract,
  MatchParticipantContract,
} from '../contracts/matchDetail.js'
import type { BserUserGame } from './bserClient.js'
import { mapToMatchSummary } from './bserMapper.js'
import type { SeasonCatalog } from './seasonCatalog.js'

function readParticipantUid(game: BserUserGame): string | null {
  if (typeof game.uid === 'string' && game.uid.trim()) return game.uid
  if (typeof game.userId === 'string' && game.userId.trim()) return game.userId
  return null
}

function readRpAfter(game: BserUserGame): number | undefined {
  return game.rpAfter ?? game.mmrAfter ?? game.rp ?? game.rankPoint
}

function readRpDelta(game: BserUserGame): number | undefined {
  return game.rpDelta ?? game.mmrGain ?? game.rpGain ?? game.rankPointGain
}

function mapParticipantRow(
  game: BserUserGame,
  characterNames: ReadonlyMap<number, string>,
  catalog?: SeasonCatalog,
): MatchParticipantContract {
  const summary = mapToMatchSummary(readParticipantUid(game) ?? 'unknown', game, characterNames, catalog)
  return {
    participantId: `${game.gameId}:${game.teamNumber ?? 0}:${game.gameRank}:${game.characterNum}:${game.nickname ?? ''}`,
    uid: readParticipantUid(game),
    nickname: game.nickname ?? null,
    teamNumber: game.teamNumber ?? null,
    teamRank: game.gameRank,
    placement: game.gameRank,
    characterNum: game.characterNum,
    characterName: summary.characterName,
    skinCode: game.skinCode ?? null,
    accountLevel: game.accountLevel ?? null,
    characterLevel: game.characterLevel ?? null,
    kills: game.playerKill ?? 0,
    deaths: game.playerDeaths ?? (game.victory === 1 ? 0 : 1),
    assists: game.playerAssistant ?? 0,
    teamKills: game.teamKill ?? game.teamKills ?? null,
    damageToPlayer: game.damageToPlayer ?? game.playerDamage ?? game.damageToPlayers ?? null,
    damageToMonster: game.damageToMonster ?? null,
    damageTaken: game.damageFromPlayer ?? null,
    credit: game.totalGainVFCredit ?? null,
    visionScore: game.viewContribution ?? null,
    rpAfter: readRpAfter(game) ?? null,
    rpDelta: readRpDelta(game) ?? null,
    bestWeapon: game.bestWeapon ?? null,
    tacticalSkillGroup: game.tacticalSkillGroup ?? null,
    traitFirstCore: game.traitFirstCore ?? null,
    traitFirstSub: game.traitFirstSub,
    traitSecondSub: game.traitSecondSub,
    equipment: game.equipment,
    equipmentGrade: game.equipmentGrade,
    cobaltInfusions: summary.cobaltInfusions,
    gameMode: summary.gameMode,
  }
}

function groupTeams(participants: MatchParticipantContract[]): MatchDetailTeamContract[] {
  const byTeam = new Map<number, MatchParticipantContract[]>()
  for (const row of participants) {
    const teamNumber = row.teamNumber ?? 0
    const bucket = byTeam.get(teamNumber) ?? []
    bucket.push(row)
    byTeam.set(teamNumber, bucket)
  }

  return [...byTeam.entries()]
    .map(([teamNumber, rows]) => {
      const sorted = [...rows].sort((a, b) => a.placement - b.placement)
      const teamRank = sorted[0]?.placement ?? 99
      return {
        teamNumber,
        teamRank,
        participants: sorted.map((row) => ({ ...row, teamRank })),
      }
    })
    .sort((a, b) => a.teamRank - b.teamRank || a.teamNumber - b.teamNumber)
}

export function mapBserGamesToMatchDetail(params: {
  gameId: string
  games: ReadonlyArray<BserUserGame>
  characterNames: ReadonlyMap<number, string>
  catalog?: SeasonCatalog
}): MatchDetailContract {
  if (params.games.length === 0) {
    return {
      gameId: params.gameId,
      gameMode: 'normal',
      playedAt: new Date(0).toISOString(),
      detailStatus: 'unavailable',
      teams: [],
    }
  }

  const head = params.games[0]
  const participants = params.games.map((game) =>
    mapParticipantRow(game, params.characterNames, params.catalog),
  )
  const summary = mapToMatchSummary(
    readParticipantUid(head) ?? 'unknown',
    head,
    params.characterNames,
    params.catalog,
  )

  return {
    gameId: params.gameId,
    apiSeasonId: head.seasonId ?? null,
    displaySeasonId: summary.seasonNumber ?? head.seasonId ?? null,
    gameMode: summary.gameMode ?? 'normal',
    matchingMode: head.matchingMode ?? null,
    matchingTeamMode: head.matchingTeamMode ?? null,
    playedAt: new Date(head.startDtm).toISOString(),
    durationSeconds: head.playTime ?? head.duration ?? null,
    detailStatus: 'ready',
    teams: groupTeams(participants),
  }
}
