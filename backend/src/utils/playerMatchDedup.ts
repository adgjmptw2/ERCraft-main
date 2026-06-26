import type { Prisma } from '@prisma/client'

export type PlayerMatchRow = Prisma.PlayerMatchGetPayload<object>

function rowCompletenessScore(row: PlayerMatchRow): number {
  let score = 0
  if (row.kills != null) score += 1
  if (row.deaths != null) score += 1
  if (row.assists != null) score += 1
  if (row.teamKills != null) score += 1
  if (row.damageToPlayer != null) score += 1
  if (row.accountLevel != null) score += 1
  if (row.bestWeapon != null) score += 1
  if (row.equipment != null) score += 1
  return score
}

function rowUpdatedAtMs(row: PlayerMatchRow): number {
  const updatedAt = row.updatedAt
  if (updatedAt instanceof Date) return updatedAt.getTime()
  if (typeof updatedAt === 'string') return Date.parse(updatedAt)
  return 0
}

function pickPreferredRow(
  existing: PlayerMatchRow,
  candidate: PlayerMatchRow,
  canonicalUid: string,
): PlayerMatchRow {
  const existingCanonical = existing.uid === canonicalUid
  const candidateCanonical = candidate.uid === canonicalUid
  if (existingCanonical !== candidateCanonical) {
    return candidateCanonical ? candidate : existing
  }

  const existingScore = rowCompletenessScore(existing)
  const candidateScore = rowCompletenessScore(candidate)

  const existingUpdated = rowUpdatedAtMs(existing)
  const candidateUpdated = rowUpdatedAtMs(candidate)
  if (candidateUpdated !== existingUpdated) {
    return candidateUpdated > existingUpdated ? candidate : existing
  }

  if (candidateScore !== existingScore) {
    return candidateScore > existingScore ? candidate : existing
  }

  return candidate.uid.localeCompare(existing.uid) < 0 ? candidate : existing
}

/** 동일 gameId 중복 row — canonical 우선, 합산·평균 금지 */
export function deduplicatePlayerMatchRowsByGameId(
  rows: ReadonlyArray<PlayerMatchRow>,
  canonicalUid: string,
): {
  rows: PlayerMatchRow[]
  rawMatchCount: number
  deduplicatedMatchCount: number
} {
  const rawMatchCount = rows.length
  const byGameId = new Map<string, PlayerMatchRow>()

  for (const row of rows) {
    const gameId = row.gameId
    if (!gameId) continue
    const existing = byGameId.get(gameId)
    if (!existing) {
      byGameId.set(gameId, row)
      continue
    }
    byGameId.set(gameId, pickPreferredRow(existing, row, canonicalUid))
  }

  const deduped = [...byGameId.values()].sort(
    (a, b) => rowUpdatedAtMs(b) - rowUpdatedAtMs(a) || a.gameId.localeCompare(b.gameId),
  )

  return {
    rows: deduped,
    rawMatchCount,
    deduplicatedMatchCount: deduped.length,
  }
}
