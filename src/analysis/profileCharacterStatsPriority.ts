import {
  combatRichnessScore,
  hasValidPlayerMatchReports,
  resolveStableCharacterStatsSelection,
  sumCharacterReportGames,
} from '@/analysis/characterStatsStability'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { PlayerSeasonAggregateDTO } from '@/types/player'

export type ProfileCharacterStatsSource =
  | 'player-match'
  | 'aggregate'
  | 'official-stats'
  | 'recent-matches'
  | 'none'

export interface SelectProfileCharacterReportsInput {
  aggregate: PlayerSeasonAggregateDTO | null | undefined
  aggregateReports: CharacterAnalysisReport[]
  statsReports: CharacterAnalysisReport[]
  recentReports: CharacterAnalysisReport[]
  playerMatchReports: CharacterAnalysisReport[]
  aggregateShouldWait: boolean
}

export interface SelectProfileCharacterReportsResult {
  reports: CharacterAnalysisReport[]
  source: ProfileCharacterStatsSource
  preferOfficialStatsDespitePartial: boolean
}

export { combatRichnessScore, sumCharacterReportGames } from '@/analysis/characterStatsStability'

function isFiniteCombatValue(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

function pickFiniteNumber(
  preferred: number | null | undefined,
  fallback: number | null | undefined,
): number {
  if (isFiniteCombatValue(preferred)) return preferred as number
  if (isFiniteCombatValue(fallback)) return fallback as number
  return Number.NaN
}

function pickNullableNumber(
  preferred: number | null | undefined,
  fallback: number | null | undefined,
): number | null {
  if (isFiniteCombatValue(preferred)) return preferred as number
  if (isFiniteCombatValue(fallback)) return fallback as number
  return null
}

function pickGradeLabel(preferred: string | null | undefined, fallback: string | null | undefined): string {
  const preferredLabel = preferred?.trim()
  if (preferredLabel && preferredLabel !== '-' && preferredLabel !== '시즌') return preferredLabel
  const fallbackLabel = fallback?.trim()
  if (fallbackLabel && fallbackLabel !== '-' && fallbackLabel !== '시즌') return fallbackLabel
  return preferredLabel ?? fallbackLabel ?? '-'
}

function hasPerformanceGrade(row: CharacterAnalysisReport): boolean {
  return row.gradeStatus === 'ok' && row.grade != null && row.gradeScore != null
}

function characterReportKey(row: CharacterAnalysisReport): string {
  return row.characterNum != null && row.characterNum > 0
    ? `num:${row.characterNum}`
    : `name:${row.characterName}`
}

export function mergeCharacterReports(
  primary: CharacterAnalysisReport[],
  secondary: CharacterAnalysisReport[],
): CharacterAnalysisReport[] {
  const merged = new Map<string, CharacterAnalysisReport>()

  for (const row of primary) {
    merged.set(characterReportKey(row), row)
  }

  for (const row of secondary) {
    const key = characterReportKey(row)
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, row)
      continue
    }

    const mergedTotalRpDelta = pickNullableNumber(existing.totalRpDelta, row.totalRpDelta)
    const gradeSource = hasPerformanceGrade(existing)
      ? existing
      : hasPerformanceGrade(row)
        ? row
        : existing
    const gradeFields = hasPerformanceGrade(gradeSource)
      ? {
          grade: gradeSource.grade ?? null,
          gradeScore: gradeSource.gradeScore ?? null,
          gradeStatus: gradeSource.gradeStatus,
          gradeConfidence: gradeSource.gradeConfidence ?? null,
          gradeSampleSize: gradeSource.gradeSampleSize,
          gradeBaselineTierKey: gradeSource.gradeBaselineTierKey ?? null,
          gradeRole: gradeSource.gradeRole ?? null,
          gradeUsedFallback: gradeSource.gradeUsedFallback ?? false,
          gradeFallback: gradeSource.gradeFallback,
        }
      : {}

    merged.set(key, {
      ...existing,
      matchCount: Math.max(existing.matchCount, row.matchCount),
      avgPlacement: pickFiniteNumber(existing.avgPlacement, row.avgPlacement),
      avgKills: pickFiniteNumber(existing.avgKills, row.avgKills),
      avgAssists: pickFiniteNumber(existing.avgAssists, row.avgAssists),
      avgTeamKills: pickNullableNumber(existing.avgTeamKills, row.avgTeamKills),
      avgDamageToPlayers: pickNullableNumber(existing.avgDamageToPlayers, row.avgDamageToPlayers),
      kda: pickFiniteNumber(existing.kda, row.kda),
      winRate: pickFiniteNumber(existing.winRate, row.winRate),
      top3Rate: pickFiniteNumber(existing.top3Rate, row.top3Rate),
      overallGrade: existing.overallGrade ?? row.overallGrade,
      ...gradeFields,
      gradeLabel: pickGradeLabel(gradeSource.gradeLabel, pickGradeLabel(existing.gradeLabel, row.gradeLabel)),
      ...(mergedTotalRpDelta != null ? { totalRpDelta: mergedTotalRpDelta } : {}),
      status: existing.status === 'ok' || row.status === 'ok' ? 'ok' : existing.status,
      feedback: existing.feedback || row.feedback,
    })
  }

  return [...merged.values()].sort((a, b) => b.matchCount - a.matchCount)
}

export function isAggregateReady(
  aggregate: PlayerSeasonAggregateDTO | null | undefined,
): boolean {
  return aggregate?.cacheStatus === 'ready'
}

export function isAggregateIncomplete(
  aggregate: PlayerSeasonAggregateDTO | null | undefined,
): boolean {
  if (!aggregate) return false
  return (
    aggregate.cacheStatus === 'partial' ||
    aggregate.cacheStatus === 'warming' ||
    aggregate.cacheStatus === 'stale' ||
    aggregate.isRefreshing === true
  )
}

export function officialStatsRicherThanAggregate(
  statsReports: CharacterAnalysisReport[],
  aggregateReports: CharacterAnalysisReport[],
): boolean {
  if (statsReports.length === 0) return false
  if (aggregateReports.length === 0) return true

  const statsCharacters = statsReports.length
  const aggregateCharacters = aggregateReports.length
  if (statsCharacters > aggregateCharacters) return true
  if (statsCharacters < aggregateCharacters) return false

  return sumCharacterReportGames(statsReports) > sumCharacterReportGames(aggregateReports)
}

export function aggregateReportsAreCombatSparse(reports: CharacterAnalysisReport[]): boolean {
  if (reports.length === 0) return true
  return combatRichnessScore(reports) === 0
}

export function selectProfileCharacterReports(
  input: SelectProfileCharacterReportsInput,
): SelectProfileCharacterReportsResult {
  const {
    aggregate,
    aggregateReports,
    statsReports,
    recentReports,
    playerMatchReports,
    aggregateShouldWait,
  } = input

  if (hasValidPlayerMatchReports(playerMatchReports)) {
    const withOfficial = mergeCharacterReports(playerMatchReports, statsReports)
    const reports =
      aggregateReports.length > 0
        ? mergeCharacterReports(withOfficial, aggregateReports)
        : withOfficial
    return {
      reports,
      source: 'player-match',
      preferOfficialStatsDespitePartial: false,
    }
  }

  if (aggregateShouldWait) {
    if (statsReports.length > 0) {
      return {
        reports: statsReports,
        source: 'official-stats',
        preferOfficialStatsDespitePartial: false,
      }
    }
    return { reports: [], source: 'none', preferOfficialStatsDespitePartial: false }
  }

  if (isAggregateReady(aggregate) && aggregateReports.length > 0) {
    const statsRicher = officialStatsRicherThanAggregate(statsReports, aggregateReports)
    const aggregateSparse = aggregateReportsAreCombatSparse(aggregateReports)

    if (statsRicher && statsReports.length > 0) {
      return {
        reports: mergeCharacterReports(statsReports, aggregateReports),
        source: 'official-stats',
        preferOfficialStatsDespitePartial: true,
      }
    }

    if (aggregateSparse && statsReports.length > 0) {
      return {
        reports: mergeCharacterReports(aggregateReports, statsReports),
        source: 'aggregate',
        preferOfficialStatsDespitePartial: false,
      }
    }

    if (statsReports.length > 0) {
      return {
        reports: mergeCharacterReports(aggregateReports, statsReports),
        source: 'aggregate',
        preferOfficialStatsDespitePartial: false,
      }
    }

    return { reports: aggregateReports, source: 'aggregate', preferOfficialStatsDespitePartial: false }
  }

  const statsRicher = officialStatsRicherThanAggregate(statsReports, aggregateReports)
  if (isAggregateIncomplete(aggregate) && statsRicher && statsReports.length > 0) {
    return {
      reports: mergeCharacterReports(statsReports, aggregateReports),
      source: 'official-stats',
      preferOfficialStatsDespitePartial: true,
    }
  }

  if (aggregateReports.length > 0) {
    if (statsReports.length > 0) {
      return {
        reports: mergeCharacterReports(aggregateReports, statsReports),
        source: 'aggregate',
        preferOfficialStatsDespitePartial: false,
      }
    }
    return { reports: aggregateReports, source: 'aggregate', preferOfficialStatsDespitePartial: false }
  }

  if (statsReports.length > 0) {
    return { reports: statsReports, source: 'official-stats', preferOfficialStatsDespitePartial: false }
  }

  if (recentReports.length > 0) {
    return {
      reports: recentReports,
      source: 'recent-matches',
      preferOfficialStatsDespitePartial: false,
    }
  }

  return { reports: [], source: 'none', preferOfficialStatsDespitePartial: false }
}

/** focus/refetch 시 combat-rich 캐릭터 통계가 sparse 응답으로 덮이지 않게 */
export function resolveProfileCharacterReportSelection(params: {
  stashKey: string
  selection: SelectProfileCharacterReportsResult
  lastRich: { key: string; selection: SelectProfileCharacterReportsResult } | null
}): {
  selection: SelectProfileCharacterReportsResult
  pickReason: 'current' | 'stashed' | 'none'
} {
  const { stashKey, selection, lastRich } = params
  const last = lastRich?.key === stashKey ? lastRich.selection : null

  if (last) {
    const resolved = resolveStableCharacterStatsSelection({
      incoming: selection,
      stable: last,
      identityMatched: true,
    })
    if (resolved.pickReason === 'stable') {
      return { selection: resolved.selection, pickReason: 'stashed' }
    }
  }

  if (selection.reports.length === 0 && last) {
    return { selection: last, pickReason: 'stashed' }
  }

  return { selection, pickReason: last ? 'current' : 'none' }
}
