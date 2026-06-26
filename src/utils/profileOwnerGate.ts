import type { PlayerStatsDTO } from '@/types/player'
import type { PlayerSeasonsResponse } from '@/types/season'

export type StatsIdentityMatchResult = 'matched' | 'unverified' | 'mismatched' | 'pending'

export type StatsOwnerGatePendingReason = 'summary-pending' | 'owner-unverified'
export type StatsOwnerGateRejectedReason = 'owner-mismatch' | 'contract-conflict'

export type StatsOwnerGateResult =
  | { status: 'accepted'; data: PlayerStatsDTO; ownerUserNum: number }
  | { status: 'pending'; reason: StatsOwnerGatePendingReason }
  | { status: 'rejected'; reason: StatsOwnerGateRejectedReason }

export function evaluateStatsIdentityMatch(
  expectedUserNum: number | null | undefined,
  incomingUserNum: number | null | undefined,
): StatsIdentityMatchResult {
  if (expectedUserNum == null || !Number.isFinite(expectedUserNum) || expectedUserNum <= 0) {
    return 'pending'
  }
  if (incomingUserNum == null || !Number.isFinite(incomingUserNum) || incomingUserNum <= 0) {
    return 'unverified'
  }
  return incomingUserNum === expectedUserNum ? 'matched' : 'mismatched'
}

export function isStatsIdentityMatched(result: StatsIdentityMatchResult): boolean {
  return result === 'matched'
}

function isValidOwnerUserNum(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0
}

export function resolveStatsPayloadUserNum(stats: PlayerStatsDTO | null | undefined): number | null {
  if (!stats) return null
  const topLevel = stats.userNum
  const metaUserNum = stats.playerMatchCharacterStatsMeta?.userNum
  if (isValidOwnerUserNum(topLevel) && isValidOwnerUserNum(metaUserNum) && topLevel !== metaUserNum) {
    return null
  }
  if (isValidOwnerUserNum(topLevel)) return topLevel
  if (isValidOwnerUserNum(metaUserNum)) return metaUserNum
  return null
}

export function gateStatsPayloadWithResult(
  stats: PlayerStatsDTO | null | undefined,
  expectedUserNum: number | null | undefined,
): StatsOwnerGateResult {
  if (!isValidOwnerUserNum(expectedUserNum)) {
    return { status: 'pending', reason: 'summary-pending' }
  }
  if (!stats) {
    return { status: 'pending', reason: 'owner-unverified' }
  }
  const topLevel = stats.userNum
  const metaUserNum = stats.playerMatchCharacterStatsMeta?.userNum
  if (
    isValidOwnerUserNum(topLevel) &&
    isValidOwnerUserNum(metaUserNum) &&
    topLevel !== metaUserNum
  ) {
    return { status: 'rejected', reason: 'contract-conflict' }
  }
  const incomingUserNum = resolveStatsPayloadUserNum(stats)
  const match = evaluateStatsIdentityMatch(expectedUserNum, incomingUserNum)
  if (match === 'pending') {
    return { status: 'pending', reason: 'summary-pending' }
  }
  if (match === 'unverified') {
    return { status: 'pending', reason: 'owner-unverified' }
  }
  if (match === 'mismatched') {
    return { status: 'rejected', reason: 'owner-mismatch' }
  }
  return { status: 'accepted', data: stats, ownerUserNum: incomingUserNum! }
}

export function gateStatsPayload(
  stats: PlayerStatsDTO | null | undefined,
  expectedUserNum: number | null | undefined,
): PlayerStatsDTO | null {
  const result = gateStatsPayloadWithResult(stats, expectedUserNum)
  return result.status === 'accepted' ? result.data : null
}

export function seasonsOwnerMatches(
  expectedNickname: string,
  expectedUserNum: number | null | undefined,
  payload: PlayerSeasonsResponse | null | undefined,
  requestedFrom: number,
  requestedTo: number,
): boolean {
  if (!payload) return false
  if (expectedUserNum == null || expectedUserNum <= 0) return false
  if (payload.owner) {
    if (payload.owner.userNum !== expectedUserNum) return false
    if (payload.owner.nickname.trim().toLowerCase() !== expectedNickname.trim().toLowerCase()) {
      return false
    }
  }
  if (payload.requestedRange) {
    if (payload.requestedRange.from !== requestedFrom || payload.requestedRange.to !== requestedTo) {
      return false
    }
  }
  return true
}

export function gateSeasonsPayload(
  payload: PlayerSeasonsResponse | undefined,
  expectedNickname: string,
  expectedUserNum: number | null | undefined,
  requestedFrom: number,
  requestedTo: number,
): PlayerSeasonsResponse | undefined {
  if (!payload) return undefined
  if (!seasonsOwnerMatches(expectedNickname, expectedUserNum, payload, requestedFrom, requestedTo)) {
    return undefined
  }
  return payload
}

export function gateMatchItemsByOwner<T extends { userNum: number }>(
  items: readonly T[],
  expectedUserNum: number | null | undefined,
): T[] {
  if (expectedUserNum == null || !Number.isFinite(expectedUserNum) || expectedUserNum <= 0) {
    return []
  }
  return items.filter((item) => item.userNum === expectedUserNum)
}
