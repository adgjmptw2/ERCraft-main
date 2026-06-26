import type { PlayerSeasonAggregateDTO, SeasonCharacterAggregateDTO } from '@/types/player'

export function seasonAggregateProfileKey(
  nickname: string,
  userNum: number,
  seasonId: number,
): string {
  return `${nickname.trim().toLowerCase()}:${userNum}:${seasonId}`
}

/** focus/refetch stash — canonical uid 변경 시에도 nickname+season 기준 유지 */
export function seasonAggregateStashKey(nickname: string, seasonId: number): string {
  return `${nickname.trim().toLowerCase()}:${seasonId}`
}

function isFiniteCombatValue(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

function aggregateCombatRichnessScore(rows: SeasonCharacterAggregateDTO[]): number {
  let score = 0
  for (const row of rows) {
    if (isFiniteCombatValue(row.kda)) score += 3
    if (isFiniteCombatValue(row.avgKills)) score += 1
    if (isFiniteCombatValue(row.avgDamage)) score += 1
    if (isFiniteCombatValue(row.avgTeamKills)) score += 1
    const grade = row.gradeLabel?.trim()
    if (grade && grade !== '-' && grade !== '시즌') score += 1
  }
  return score
}

function formatGameCount(value: number): string {
  return value.toLocaleString('ko-KR')
}

export function resolveSeasonAggregateCollectedGames(
  aggregate: PlayerSeasonAggregateDTO,
): number | null {
  const fromCoverage = aggregate.coverage?.collectedGames ?? null
  const fromBackfill = aggregate.backfillProgress?.collectedGames ?? null
  if (fromCoverage == null && fromBackfill == null) return null
  return Math.max(fromCoverage ?? 0, fromBackfill ?? 0)
}

export function formatSeasonAggregateCoverageText(
  aggregate: PlayerSeasonAggregateDTO,
): string | null {
  const collectedGames = resolveSeasonAggregateCollectedGames(aggregate)
  const officialSeasonGames = aggregate.coverage?.officialSeasonGames ?? null
  if (collectedGames == null && officialSeasonGames == null) return null

  if (officialSeasonGames != null && officialSeasonGames > 0) {
    if (collectedGames != null && collectedGames >= officialSeasonGames) {
      return `저장된 시즌 기록 ${formatGameCount(officialSeasonGames)}전`
    }
    if (collectedGames != null && collectedGames > 0) {
      const missingGames = Math.max(officialSeasonGames - collectedGames, 0)
      return `저장된 ${formatGameCount(collectedGames)}전 표시 중 · 새 기록 ${formatGameCount(missingGames)}전 확인 중`
    }
    return `공식 시즌 기록 ${formatGameCount(officialSeasonGames)}전 수집 중`
  }

  if (collectedGames != null) {
    return collectedGames > 0
      ? `저장된 ${formatGameCount(collectedGames)}전 표시 중`
      : '시즌 기록 수집 중'
  }

  return null
}

/** refetch/downgrade 시 UI가 빈 snapshot으로 떨어지는지 판별 */
export function isSeasonAggregateDisplayDowngrade(
  next: PlayerSeasonAggregateDTO,
  previous: PlayerSeasonAggregateDTO,
): boolean {
  if (previous.rpSeries.length > 0 && next.rpSeries.length === 0) return true
  if (previous.characterStats.length > 0 && next.characterStats.length === 0) return true

  const prevCharGames = previous.characterStats.reduce((sum, row) => sum + row.games, 0)
  const nextCharGames = next.characterStats.reduce((sum, row) => sum + row.games, 0)
  if (
    previous.characterStats.length > 0 &&
    next.characterStats.length < previous.characterStats.length &&
    nextCharGames < prevCharGames
  ) {
    return true
  }

  const prevCombat = aggregateCombatRichnessScore(previous.characterStats)
  const nextCombat = aggregateCombatRichnessScore(next.characterStats)
  if (
    prevCombat > 0 &&
    nextCombat === 0 &&
    next.characterStats.length > 0 &&
    nextCharGames >= prevCharGames
  ) {
    return true
  }

  const prevCollected = previous.coverage?.collectedGames ?? prevCharGames
  const nextCollected = next.coverage?.collectedGames ?? nextCharGames
  if (prevCollected > 0 && nextCollected < prevCollected) {
    return true
  }

  if (
    nextCollected > prevCollected &&
    previous.rpSeries.length > 0 &&
    next.rpSeries.length < previous.rpSeries.length
  ) {
    return true
  }

  return false
}

export function isSeasonAggregateDisplayUpgrade(
  next: PlayerSeasonAggregateDTO,
  previous: PlayerSeasonAggregateDTO,
): boolean {
  if (next.rpSeries.length > previous.rpSeries.length) return true
  if (
    previous.rpSeries.length === 0 &&
    next.rpSeries.length > 0
  ) {
    return true
  }

  const prevCombat = aggregateCombatRichnessScore(previous.characterStats)
  const nextCombat = aggregateCombatRichnessScore(next.characterStats)
  if (nextCombat > prevCombat) return true

  const prevCharGames = previous.characterStats.reduce((sum, row) => sum + row.games, 0)
  const nextCharGames = next.characterStats.reduce((sum, row) => sum + row.games, 0)
  if (nextCharGames > prevCharGames && nextCombat >= prevCombat) return true

  return false
}

export function isSeasonAggregateProfileMatch(
  aggregate: PlayerSeasonAggregateDTO,
  summaryUserNum: number,
  selectedSeason: number,
): boolean {
  return aggregate.userNum === summaryUserNum && aggregate.seasonId === selectedSeason
}

export function resolveProfileSeasonAggregate(params: {
  raw: PlayerSeasonAggregateDTO | undefined
  summaryUserNum: number | undefined
  selectedSeason: number
  lastValid: PlayerSeasonAggregateDTO | null
}): {
  aggregate: PlayerSeasonAggregateDTO | null
  lastValid: PlayerSeasonAggregateDTO | null
  pickReason: 'raw' | 'stashed' | 'none' | 'reject-mismatch' | 'reject-downgrade'
} {
  const { raw, summaryUserNum, selectedSeason, lastValid } = params

  if (summaryUserNum == null) {
    return { aggregate: null, lastValid: null, pickReason: 'none' }
  }

  const lastValidForProfile =
    lastValid && lastValid.seasonId === selectedSeason ? lastValid : null

  if (!raw) {
    return {
      aggregate: lastValidForProfile,
      lastValid: lastValidForProfile,
      pickReason: lastValidForProfile ? 'stashed' : 'none',
    }
  }

  if (raw.seasonId !== selectedSeason) {
    return {
      aggregate: lastValidForProfile,
      lastValid: lastValidForProfile,
      pickReason: 'reject-mismatch',
    }
  }

  const userNumMatches = raw.userNum === summaryUserNum

  if (!userNumMatches && lastValidForProfile) {
    if (isSeasonAggregateDisplayDowngrade(raw, lastValidForProfile)) {
      return {
        aggregate: lastValidForProfile,
        lastValid: lastValidForProfile,
        pickReason: 'reject-downgrade',
      }
    }
    if (isSeasonAggregateDisplayUpgrade(raw, lastValidForProfile)) {
      return { aggregate: raw, lastValid: raw, pickReason: 'raw' }
    }
    return {
      aggregate: lastValidForProfile,
      lastValid: lastValidForProfile,
      pickReason: 'stashed',
    }
  }

  if (!userNumMatches) {
    return { aggregate: raw, lastValid: raw, pickReason: 'raw' }
  }

  if (lastValidForProfile && isSeasonAggregateDisplayDowngrade(raw, lastValidForProfile)) {
    return {
      aggregate: lastValidForProfile,
      lastValid: lastValidForProfile,
      pickReason: 'reject-downgrade',
    }
  }

  return { aggregate: raw, lastValid: raw, pickReason: 'raw' }
}
