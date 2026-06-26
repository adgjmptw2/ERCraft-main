import type { CharacterAnalysisReport } from '@/analysis/types'

import {
  evaluateStatsIdentityMatch,
  isStatsIdentityMatched,
} from '@/utils/profileOwnerGate'

import type {
  ProfileCharacterStatsSource,
  SelectProfileCharacterReportsResult,
} from '@/analysis/profileCharacterStatsPriority'

export const CHARACTER_STATS_SOURCE_PRIORITY: Record<ProfileCharacterStatsSource, number> = {
  'player-match': 40,
  aggregate: 30,
  'recent-matches': 20,
  'official-stats': 10,
  none: 0,
}

function isFiniteCombatValue(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

export function sumCharacterReportGames(reports: CharacterAnalysisReport[]): number {
  return reports.reduce((sum, row) => sum + row.matchCount, 0)
}

export function combatRichnessScore(reports: CharacterAnalysisReport[]): number {
  let score = 0
  for (const row of reports) {
    if (isFiniteCombatValue(row.kda)) score += 3
    if (isFiniteCombatValue(row.avgKills)) score += 1
    if (isFiniteCombatValue(row.avgAssists)) score += 1
    if (isFiniteCombatValue(row.avgTeamKills)) score += 1
    if (isFiniteCombatValue(row.avgDamageToPlayers)) score += 1
    const grade = row.gradeLabel?.trim()
    if (grade && grade !== '-' && grade !== '시즌') score += 1
  }
  return score
}

export interface CharacterStatsQuality {
  rowCount: number
  gamesTotal: number
  finiteMetricCount: number
  combatRichness: number
  sourcePriority: number
}

function countFiniteMetrics(reports: CharacterAnalysisReport[]): number {
  let count = 0
  for (const row of reports) {
    if (isFiniteCombatValue(row.kda)) count += 1
    if (isFiniteCombatValue(row.avgKills)) count += 1
    if (isFiniteCombatValue(row.avgAssists)) count += 1
    if (isFiniteCombatValue(row.avgTeamKills)) count += 1
    if (isFiniteCombatValue(row.avgDamageToPlayers)) count += 1
  }
  return count
}

export function measureCharacterStatsQuality(
  selection: SelectProfileCharacterReportsResult,
): CharacterStatsQuality {
  return {
    rowCount: selection.reports.length,
    gamesTotal: sumCharacterReportGames(selection.reports),
    finiteMetricCount: countFiniteMetrics(selection.reports),
    combatRichness: combatRichnessScore(selection.reports),
    sourcePriority: CHARACTER_STATS_SOURCE_PRIORITY[selection.source],
  }
}

export function isRichCharacterStatsSelection(
  selection: SelectProfileCharacterReportsResult,
): boolean {
  if (selection.reports.length === 0) return false
  return measureCharacterStatsQuality(selection).combatRichness > 0
}

export function hasValidPlayerMatchReports(reports: CharacterAnalysisReport[]): boolean {
  if (reports.length === 0) return false
  return reports.some(
    (row) =>
      row.matchCount > 0 &&
      (isFiniteCombatValue(row.kda) ||
        isFiniteCombatValue(row.avgKills) ||
        isFiniteCombatValue(row.avgTeamKills) ||
        isFiniteCombatValue(row.avgDamageToPlayers)),
  )
}

export function buildCharacterStatsIdentityKey(params: {
  nickname: string
  userNum: number
  seasonId: number
  routeSummaryReady: boolean
}): string | null {
  if (!params.routeSummaryReady || !Number.isFinite(params.seasonId) || params.seasonId <= 0) {
    return null
  }
  const nick = params.nickname.trim().toLowerCase()
  if (params.userNum > 0) return `${nick}:${params.userNum}:${params.seasonId}`
  return `${nick}:_:${params.seasonId}`
}

export function provisionalCharacterStatsIdentityKey(
  nickname: string,
  seasonId: number,
): string | null {
  if (!Number.isFinite(seasonId) || seasonId <= 0) return null
  return `${nickname.trim().toLowerCase}:_:${seasonId}`
}

export function statsIdentityMatches(
  summaryUserNum: number,
  statsUserNum: number | null | undefined,
): boolean {
  return isStatsIdentityMatched(evaluateStatsIdentityMatch(summaryUserNum, statsUserNum))
}

const EMPTY_CHARACTER_STATS_SELECTION: SelectProfileCharacterReportsResult = {
  reports: [],
  source: 'none',
  preferOfficialStatsDespitePartial: false,
}

export type CharacterStatsAcceptDecision =
  | 'accept'
  | 'accept_newer_authoritative'
  | 'keep_equal'
  | 'reject_identity_mismatch'
  | 'reject_transient_empty'
  | 'reject_source_downgrade'
  | 'reject_combat_downgrade'

export interface CharacterStatsAcceptContext {
  identityMatched: boolean
  incomingDataUpdatedAt?: number
  stableDataUpdatedAt?: number
  playerMatchMetaStatus?: 'complete' | 'partial' | 'unavailable'
}

export function evaluateCharacterStatsAcceptDecision(
  stable: SelectProfileCharacterReportsResult,
  incoming: SelectProfileCharacterReportsResult,
  context: CharacterStatsAcceptContext,
): CharacterStatsAcceptDecision {
  if (!context.identityMatched) return 'reject_identity_mismatch'

  const stableQuality = measureCharacterStatsQuality(stable)
  const incomingQuality = measureCharacterStatsQuality(incoming)

  if (stableQuality.combatRichness <= 0) {
    if (incomingQuality.rowCount === 0 && context.playerMatchMetaStatus === 'partial') {
      return 'reject_transient_empty'
    }
    return incomingQuality.rowCount > 0 || incomingQuality.combatRichness > 0 ? 'accept' : 'keep_equal'
  }

  if (incomingQuality.rowCount === 0) {
    if (context.playerMatchMetaStatus === 'complete') return 'accept'
    return 'reject_transient_empty'
  }

  if (incomingQuality.combatRichness === 0 && stableQuality.combatRichness > 0) {
    if (
      stable.source === 'player-match' &&
      incoming.source === 'player-match' &&
      context.playerMatchMetaStatus === 'complete'
    ) {
      return 'accept_newer_authoritative'
    }
    return 'reject_combat_downgrade'
  }

  if (
    stable.source === 'player-match' &&
    incoming.source === 'official-stats' &&
    stableQuality.combatRichness > incomingQuality.combatRichness
  ) {
    return 'reject_source_downgrade'
  }

  if (
    stableQuality.sourcePriority > incomingQuality.sourcePriority + 5 &&
    incomingQuality.combatRichness < stableQuality.combatRichness
  ) {
    return 'reject_source_downgrade'
  }

  if (
    stable.source === 'player-match' &&
    incoming.source === 'player-match' &&
    stableQuality.combatRichness > 0 &&
    incomingQuality.combatRichness > 0
  ) {
    const stableGames = stableQuality.gamesTotal
    const incomingGames = incomingQuality.gamesTotal
    const stableUpdatedAt = context.stableDataUpdatedAt ?? 0
    const incomingUpdatedAt = context.incomingDataUpdatedAt ?? 0
    if (incomingUpdatedAt > stableUpdatedAt && incomingGames >= stableGames) {
      return 'accept_newer_authoritative'
    }
    if (
      incomingGames < stableGames &&
      incomingQuality.combatRichness >= stableQuality.combatRichness &&
      context.playerMatchMetaStatus === 'complete'
    ) {
      return 'accept_newer_authoritative'
    }
    if (
      incomingQuality.combatRichness === stableQuality.combatRichness &&
      incomingGames === stableGames &&
      incomingQuality.rowCount === stableQuality.rowCount
    ) {
      return 'keep_equal'
    }
  }

  if (
    stableQuality.rowCount >= 4 &&
    incomingQuality.rowCount < Math.min(stableQuality.rowCount, 4) &&
    incomingQuality.combatRichness < stableQuality.combatRichness
  ) {
    return 'reject_combat_downgrade'
  }

  return 'accept'
}

export function isCharacterStatsDowngrade(
  stable: SelectProfileCharacterReportsResult,
  incoming: SelectProfileCharacterReportsResult,
  context: Pick<CharacterStatsAcceptContext, 'identityMatched' | 'playerMatchMetaStatus'> = {
    identityMatched: true,
  },
): boolean {
  const decision = evaluateCharacterStatsAcceptDecision(stable, incoming, context)
  return (
    decision === 'reject_transient_empty' ||
    decision === 'reject_source_downgrade' ||
    decision === 'reject_combat_downgrade'
  )
}

export function shouldPersistCharacterStatsSnapshot(
  selection: SelectProfileCharacterReportsResult,
): boolean {
  return isRichCharacterStatsSelection(selection)
}

export function shouldAcceptIncomingCharacterStats(
  stable: SelectProfileCharacterReportsResult | null,
  incoming: SelectProfileCharacterReportsResult,
  context: CharacterStatsAcceptContext,
): boolean {
  if (!context.identityMatched) return false
  if (!stable) return true
  const decision = evaluateCharacterStatsAcceptDecision(stable, incoming, context)
  return (
    decision === 'accept' ||
    decision === 'accept_newer_authoritative' ||
    decision === 'keep_equal'
  )
}

export type CharacterStatsPickReason =
  | 'incoming'
  | 'stable'
  | 'identity-mismatch'
  | 'no-stable'

export function resolveStableCharacterStatsSelection(params: {
  incoming: SelectProfileCharacterReportsResult
  stable: SelectProfileCharacterReportsResult | null
  identityMatched: boolean
  acceptContext?: Omit<CharacterStatsAcceptContext, 'identityMatched'>
}): {
  selection: SelectProfileCharacterReportsResult
  pickReason: CharacterStatsPickReason
  decision?: CharacterStatsAcceptDecision
} {
  const { incoming, stable, identityMatched, acceptContext } = params
  const context: CharacterStatsAcceptContext = {
    identityMatched,
    ...acceptContext,
  }

  if (!identityMatched) {
    return {
      selection: EMPTY_CHARACTER_STATS_SELECTION,
      pickReason: 'identity-mismatch',
      decision: 'reject_identity_mismatch',
    }
  }

  if (!stable) {
    return { selection: incoming, pickReason: 'no-stable', decision: 'accept' }
  }

  const decision = evaluateCharacterStatsAcceptDecision(stable, incoming, context)
  if (shouldAcceptIncomingCharacterStats(stable, incoming, context)) {
    return { selection: incoming, pickReason: 'incoming', decision }
  }

  return { selection: stable, pickReason: 'stable', decision }
}

export function pickRicherCharacterStatsSelection(
  left: SelectProfileCharacterReportsResult,
  right: SelectProfileCharacterReportsResult,
): SelectProfileCharacterReportsResult {
  const leftQuality = measureCharacterStatsQuality(left)
  const rightQuality = measureCharacterStatsQuality(right)

  if (rightQuality.combatRichness > leftQuality.combatRichness) return right
  if (leftQuality.combatRichness > rightQuality.combatRichness) return left
  if (rightQuality.sourcePriority > leftQuality.sourcePriority) return right
  if (leftQuality.sourcePriority > rightQuality.sourcePriority) return left
  if (rightQuality.rowCount > leftQuality.rowCount) return right
  if (leftQuality.rowCount > rightQuality.rowCount) return left
  return right
}
