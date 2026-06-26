import type { MatchSummaryContract } from '../contracts/player.js'
import type { MatchDetailContract, MatchParticipantContract } from '../contracts/matchDetail.js'
import type { BserUserGame } from '../external/bserClient.js'
import { mapToMatchSummary } from '../external/bserMapper.js'
import type { SeasonCatalog } from '../external/seasonCatalog.js'
import type { PlayerMatchRow } from './playerMatchDedup.js'

export const REQUESTED_PLAYER_NOT_FOUND_IN_MATCH = 'requested-player-not-found-in-match'

export interface PlayerMatchOwnershipMismatch {
  ownerUid: string
  rowUid: string
  sourceParticipantUid: string | null
  gameId: string
}

export function readRawParticipantUid(rawJson: unknown): string | null {
  if (typeof rawJson !== 'object' || rawJson === null) return null
  const record = rawJson as Record<string, unknown>
  if (typeof record.uid === 'string' && record.uid.trim()) return record.uid.trim()
  if (typeof record.userId === 'string' && record.userId.trim()) return record.userId.trim()
  if (typeof record.userNum === 'number' && Number.isFinite(record.userNum)) {
    return String(record.userNum)
  }
  return null
}

export function rawGameMatchesCanonical(
  game: BserUserGame,
  canonicalUid: string,
  canonicalUserNum?: number,
): boolean {
  const uid =
    typeof game.uid === 'string' && game.uid.trim()
      ? game.uid.trim()
      : typeof game.userId === 'string' && game.userId.trim()
        ? game.userId.trim()
        : null
  if (uid && uid === canonicalUid) return true
  if (
    canonicalUserNum != null &&
    typeof game.userNum === 'number' &&
    Number.isFinite(game.userNum) &&
    game.userNum === canonicalUserNum
  ) {
    return true
  }
  return false
}

export function assertPlayerMatchRowOwner(
  row: Pick<PlayerMatchRow, 'uid' | 'gameId' | 'rawJson'>,
  canonicalUid: string,
): PlayerMatchOwnershipMismatch | null {
  if (row.uid !== canonicalUid) {
    return {
      ownerUid: canonicalUid,
      rowUid: row.uid,
      sourceParticipantUid: readRawParticipantUid(row.rawJson),
      gameId: row.gameId,
    }
  }
  const sourceUid = readRawParticipantUid(row.rawJson)
  if (sourceUid && sourceUid !== canonicalUid) {
    return {
      ownerUid: canonicalUid,
      rowUid: row.uid,
      sourceParticipantUid: sourceUid,
      gameId: row.gameId,
    }
  }
  return null
}

export function filterPlayerMatchRowsByOwner<T extends Pick<PlayerMatchRow, 'uid' | 'gameId' | 'rawJson'>>(
  rows: ReadonlyArray<T>,
  canonicalUid: string,
): T[] {
  return rows.filter((row) => assertPlayerMatchRowOwner(row, canonicalUid) === null)
}

export function flattenMatchDetailParticipants(
  detail: MatchDetailContract,
): MatchParticipantContract[] {
  return detail.teams.flatMap((team) => team.participants)
}

export function selectMatchDetailParticipant(
  detail: MatchDetailContract,
  rawGames: ReadonlyArray<BserUserGame> | null | undefined,
  canonicalUid: string,
  canonicalUserNum?: number,
): { participant: MatchParticipantContract; rawGame: BserUserGame | null } | null {
  const participants = flattenMatchDetailParticipants(detail)
  const byUid = participants.find((row) => row.uid === canonicalUid)
  if (byUid) {
    const rawGame =
      rawGames?.find((game) => rawGameMatchesCanonical(game, canonicalUid, canonicalUserNum)) ?? null
    return { participant: byUid, rawGame }
  }

  if (canonicalUserNum != null && rawGames && rawGames.length > 0) {
    const rawGame = rawGames.find((game) => rawGameMatchesCanonical(game, canonicalUid, canonicalUserNum))
    if (rawGame) {
      const participant =
        participants.find(
          (row) =>
            row.uid === canonicalUid ||
            (row.nickname != null &&
              row.nickname === rawGame.nickname &&
              row.characterNum === rawGame.characterNum),
        ) ?? null
      if (participant) return { participant, rawGame }
    }
  }

  return null
}

export function mapParticipantToMatchSummary(
  gameId: string,
  canonicalUid: string,
  canonicalUserNum: number,
  participant: MatchParticipantContract,
  rawGame: BserUserGame | null,
  characterNames: ReadonlyMap<number, string>,
  catalog?: SeasonCatalog,
): MatchSummaryContract {
  if (rawGame) {
    return {
      ...mapToMatchSummary(canonicalUid, rawGame, characterNames, catalog),
      userNum: canonicalUserNum,
      matchId: gameId,
    }
  }

  return {
    matchId: gameId,
    userNum: canonicalUserNum,
    characterNum: participant.characterNum,
    characterName: participant.characterName ?? `char #${participant.characterNum}`,
    placement: participant.placement,
    kills: participant.kills,
    deaths: participant.deaths ?? 0,
    assists: participant.assists,
    gameStartedAt: new Date(0).toISOString(),
    victory: participant.placement === 1,
    gameMode: participant.gameMode ?? 'normal',
    cobaltInfusions: participant.cobaltInfusions ?? undefined,
    accountLevel: participant.accountLevel ?? undefined,
    characterLevel: participant.characterLevel ?? undefined,
    skinCode: participant.skinCode ?? undefined,
    bestWeapon: participant.bestWeapon ?? undefined,
    tacticalSkillGroup: participant.tacticalSkillGroup ?? undefined,
    traitFirstCore: participant.traitFirstCore ?? undefined,
    traitFirstSub: participant.traitFirstSub ?? undefined,
    traitSecondSub: participant.traitSecondSub ?? undefined,
    equipment: participant.equipment ?? undefined,
    equipmentGrade: participant.equipmentGrade ?? undefined,
    teamKills: participant.teamKills ?? undefined,
    damageToPlayers: participant.damageToPlayer ?? undefined,
    playerDamage: participant.damageToPlayer ?? undefined,
    rpAfter: participant.rpAfter ?? undefined,
    rpDelta: participant.rpDelta ?? undefined,
  }
}