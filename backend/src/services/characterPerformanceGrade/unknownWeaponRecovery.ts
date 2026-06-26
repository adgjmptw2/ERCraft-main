import type { PrismaClient } from '@prisma/client'

import type { BserUserGame } from '../../external/bserClient.js'
import { lookupCharacterWeaponRole } from './baselineStore.js'
import {
  classifyBestWeaponValue,
  type UnknownRoleReason,
  type WeaponBackfillSource,
} from './unknownRoleReason.js'

export interface PlayerMatchWeaponRow {
  id: bigint
  uid: string
  gameId: string
  gameMode: string
  characterNum: number
  bestWeapon: number | null
  rawJson: unknown
  createdAt: Date
}

export interface WeaponRecoveryCandidate {
  rowId: bigint
  uid: string
  gameId: string
  characterNum: number
  currentBestWeapon: number | null
  recoveredBestWeapon: number
  source: WeaponBackfillSource
  reason: UnknownRoleReason
}

function gameUid(game: BserUserGame): string | null {
  if (typeof game.uid === 'string' && game.uid.trim()) return game.uid
  if (typeof game.userId === 'string' && game.userId.trim()) return game.userId
  return null
}

function readBestWeaponFromGame(game: unknown): number | null {
  if (!game || typeof game !== 'object') return null
  const value = (game as { bestWeapon?: unknown }).bestWeapon
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

function readBestWeaponFromPlayerMatchRaw(rawJson: unknown, uid: string, characterNum: number): number | null {
  if (!rawJson || typeof rawJson !== 'object') return null
  const game = rawJson as BserUserGame
  const rowUid = gameUid(game)
  if (rowUid != null && rowUid !== uid) return null
  if (game.characterNum !== characterNum) return null
  return readBestWeaponFromGame(game)
}

export function readBestWeaponFromDetailRaw(
  rawJson: unknown,
  uid: string,
  characterNum: number,
): { weapon: number | null; ambiguous: boolean } {
  if (!Array.isArray(rawJson)) return { weapon: null, ambiguous: false }
  const matches: number[] = []
  for (const entry of rawJson) {
    if (!entry || typeof entry !== 'object') continue
    const game = entry as BserUserGame
    if (game.characterNum !== characterNum) continue
    const rowUid = gameUid(game)
    if (rowUid != null && rowUid !== uid) continue
    const weapon = readBestWeaponFromGame(game)
    if (weapon != null) matches.push(weapon)
  }
  const unique = [...new Set(matches)]
  if (unique.length === 1) return { weapon: unique[0]!, ambiguous: false }
  if (unique.length > 1) return { weapon: null, ambiguous: true }
  return { weapon: null, ambiguous: false }
}

export function resolveWeaponRecoveryForRow(params: {
  row: PlayerMatchWeaponRow
  participantBestWeapon: number | null
  detailRawJson: unknown | null
}): WeaponRecoveryCandidate | null {
  const weaponState = classifyBestWeaponValue(params.row.bestWeapon)
  if (weaponState === 'valid') return null

  const fromOwnRaw = readBestWeaponFromPlayerMatchRaw(
    params.row.rawJson,
    params.row.uid,
    params.row.characterNum,
  )
  if (fromOwnRaw != null) {
    return {
      rowId: params.row.id,
      uid: params.row.uid,
      gameId: params.row.gameId,
      characterNum: params.row.characterNum,
      currentBestWeapon: params.row.bestWeapon,
      recoveredBestWeapon: fromOwnRaw,
      source: 'player-match-raw-json',
      reason: weaponState === 'missing' ? 'missing-best-weapon' : 'invalid-best-weapon',
    }
  }

  if (params.participantBestWeapon != null) {
    return {
      rowId: params.row.id,
      uid: params.row.uid,
      gameId: params.row.gameId,
      characterNum: params.row.characterNum,
      currentBestWeapon: params.row.bestWeapon,
      recoveredBestWeapon: params.participantBestWeapon,
      source: 'match-participant',
      reason: weaponState === 'missing' ? 'missing-best-weapon' : 'invalid-best-weapon',
    }
  }

  if (params.detailRawJson != null) {
    const detail = readBestWeaponFromDetailRaw(
      params.detailRawJson,
      params.row.uid,
      params.row.characterNum,
    )
    if (detail.weapon != null) {
      return {
        rowId: params.row.id,
        uid: params.row.uid,
        gameId: params.row.gameId,
        characterNum: params.row.characterNum,
        currentBestWeapon: params.row.bestWeapon,
        recoveredBestWeapon: detail.weapon,
        source: 'match-detail-raw-json',
        reason: weaponState === 'missing' ? 'missing-best-weapon' : 'invalid-best-weapon',
      }
    }
  }

  return null
}

export function unknownReasonForMappedWeapon(
  characterNum: number,
  weaponTypeId: number,
  gameMode: string,
): UnknownRoleReason {
  if (gameMode !== 'rank') return 'unsupported-mode'
  const role = lookupCharacterWeaponRole(characterNum, weaponTypeId)
  if (role == null) return 'character-weapon-baseline-missing'
  return 'resolved-role'
}

export async function loadParticipantWeaponMap(
  prisma: PrismaClient,
  gameIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (gameIds.length === 0) return map
  const participants = await prisma.matchParticipant.findMany({
    where: { gameId: { in: gameIds } },
    select: { gameId: true, uid: true, characterNum: true, bestWeapon: true },
  })
  for (const row of participants) {
    if (!row.uid || row.bestWeapon == null || row.bestWeapon <= 0) continue
    map.set(`${row.gameId}:${row.uid}:${row.characterNum}`, row.bestWeapon)
  }
  return map
}

export async function loadDetailRawJsonMap(
  prisma: PrismaClient,
  gameIds: string[],
): Promise<Map<string, unknown>> {
  const map = new Map<string, unknown>()
  if (gameIds.length === 0) return map
  const details = await prisma.matchDetail.findMany({
    where: { gameId: { in: gameIds } },
    select: { gameId: true, rawJson: true },
  })
  for (const row of details) {
    if (row.rawJson != null) map.set(row.gameId, row.rawJson)
  }
  return map
}

export function participantMapKey(gameId: string, uid: string, characterNum: number): string {
  return `${gameId}:${uid}:${characterNum}`
}
