import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import {
  assertPlayerMatchRowOwner,
  filterPlayerMatchRowsByOwner,
} from '../../utils/playerMatchOwnership.js'
import { deduplicatePlayerMatchRowsByGameId } from '../../utils/playerMatchDedup.js'
import { isGradeSupportedMode } from '../../types/matchesMode.js'
import type { PlayerCharacterBenchmarkScope } from './config.js'
import type { MatchFilterStats } from './types.js'
import { isValidGameId } from './fingerprint.js'

const UNION_MATCHING_MODE = 7

function isUnionRow(row: Pick<PlayerMatchRow, 'gameMode' | 'matchingMode'>): boolean {
  return row.gameMode === 'union' || row.matchingMode === UNION_MATCHING_MODE
}

function isCobaltRow(row: Pick<PlayerMatchRow, 'gameMode' | 'matchingMode'>): boolean {
  return row.gameMode === 'cobalt' || row.matchingMode === 6
}

export function matchesBenchmarkScope(
  row: Pick<PlayerMatchRow, 'gameMode' | 'matchingMode'>,
  scope: PlayerCharacterBenchmarkScope,
): boolean {
  if (isCobaltRow(row) || isUnionRow(row)) return false
  if (scope === 'all') return row.gameMode === 'rank' || row.gameMode === 'normal'
  if (scope === 'rank') return isGradeSupportedMode(row.gameMode)
  return row.gameMode === 'normal'
}

export function filterRowsForShadowBenchmark(params: {
  rows: ReadonlyArray<PlayerMatchRow>
  canonicalUid: string
  scope: PlayerCharacterBenchmarkScope
  displaySeasonId: number
  apiSeasonId: number
  participantGameIds?: ReadonlySet<string>
}): { rows: PlayerMatchRow[]; stats: MatchFilterStats } {
  const stats: MatchFilterStats = {
    totalRowsScanned: params.rows.length,
    excludedInvalidGameId: 0,
    excludedUnsupportedMode: 0,
    excludedOwnershipMismatch: 0,
    excludedMissingParticipant: 0,
    excludedDuplicateGameId: 0,
    eligibleRows: 0,
  }

  const seasonRows = params.rows.filter((row) => {
    if (row.displaySeasonId !== params.displaySeasonId && row.apiSeasonId !== params.apiSeasonId) {
      return false
    }
    if (!isValidGameId(row.gameId)) {
      stats.excludedInvalidGameId += 1
      return false
    }
    if (!matchesBenchmarkScope(row, params.scope)) {
      stats.excludedUnsupportedMode += 1
      return false
    }
    return true
  })

  const ownershipFiltered: PlayerMatchRow[] = []
  for (const row of seasonRows) {
    const mismatch = assertPlayerMatchRowOwner(row, params.canonicalUid)
    if (mismatch) {
      stats.excludedOwnershipMismatch += 1
      continue
    }
    if (params.participantGameIds && !params.participantGameIds.has(row.gameId)) {
      stats.excludedMissingParticipant += 1
      continue
    }
    ownershipFiltered.push(row)
  }

  const deduped = deduplicatePlayerMatchRowsByGameId(ownershipFiltered, params.canonicalUid)
  stats.excludedDuplicateGameId = Math.max(
    0,
    ownershipFiltered.length - deduped.deduplicatedMatchCount,
  )
  const owned = filterPlayerMatchRowsByOwner(deduped.rows, params.canonicalUid)
  stats.eligibleRows = owned.length
  return { rows: owned, stats }
}

export function mergeFilterStats(target: MatchFilterStats, delta: MatchFilterStats): void {
  target.totalRowsScanned += delta.totalRowsScanned
  target.excludedInvalidGameId += delta.excludedInvalidGameId
  target.excludedUnsupportedMode += delta.excludedUnsupportedMode
  target.excludedOwnershipMismatch += delta.excludedOwnershipMismatch
  target.excludedMissingParticipant += delta.excludedMissingParticipant
  target.excludedDuplicateGameId += delta.excludedDuplicateGameId
  target.eligibleRows += delta.eligibleRows
}
