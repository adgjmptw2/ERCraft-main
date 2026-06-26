import type { MatchSummary } from '@/types/match'
import { DEMO_LATEST_SEASON } from '@/mocks/seasonHistory'
import { isRankGameMode, resolveGameMode } from '@/utils/gameMode'

export const ANALYSIS_RECENT_RANK_LIMIT = 20

export type AnalysisScope = 'recent20' | 'seasonAll'

export function isCurrentAnalysisSeason(
  seasonNumber: number,
  latestSeason: number = DEMO_LATEST_SEASON,
): boolean {
  return seasonNumber >= latestSeason
}

export function resolveAnalysisScope(
  seasonNumber: number,
  scope: AnalysisScope,
  latestSeason: number = DEMO_LATEST_SEASON,
): AnalysisScope {
  if (!isCurrentAnalysisSeason(seasonNumber, latestSeason)) {
    return 'seasonAll'
  }

  return scope
}

export function filterRankMatches(matches: MatchSummary[]): MatchSummary[] {
  return matches.filter((match) => isRankGameMode(resolveGameMode(match)))
}

export function selectAnalysisMatches(
  seasonMatches: MatchSummary[],
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
  latestSeason: number = DEMO_LATEST_SEASON,
): MatchSummary[] {
  const rankOnly = filterRankMatches(seasonMatches)
  const effectiveScope = resolveAnalysisScope(seasonNumber, scope, latestSeason)

  if (effectiveScope === 'recent20') {
    return rankOnly.slice(0, ANALYSIS_RECENT_RANK_LIMIT)
  }

  return rankOnly
}

export function getAnalysisBasisLabel(
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
  latestSeason: number = DEMO_LATEST_SEASON,
): string {
  const effectiveScope = resolveAnalysisScope(seasonNumber, scope, latestSeason)

  if (effectiveScope === 'recent20') {
    return '랭크 · 최근 20판 기준'
  }

  return `랭크 · S${seasonNumber} 시즌 전체 기준`
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function analysisSeedFromMatches(
  matches: MatchSummary[],
  seasonNumber: number,
  scope: AnalysisScope = 'recent20',
): number {
  const scopeSalt = scope === 'recent20' ? 0 : 7_000

  if (matches.length === 0) return seasonNumber + scopeSalt

  const matchSeed = matches.reduce((sum, match) => sum + hashString(match.matchId), 0)
  return seasonNumber * 1000 + scopeSalt + (matchSeed % 10_000)
}
