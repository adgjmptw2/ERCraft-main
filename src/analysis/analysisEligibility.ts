import type { MatchSummary } from '@/types/match'
import { resolveCharacterDisplayName } from '@/utils/gameLabels'
import {
  isCobaltGameMode,
  isNormalGameMode,
  isRankGameMode,
  isUnionGameMode,
  resolveGameMode,
  type GameMode,
} from '@/utils/gameMode'

export type AnalysisMatchScope = 'all' | 'rank'

export const ALL_CHARACTER_ANALYSIS_MIN_ELIGIBLE = 20
export const ALL_CHARACTER_CONFIDENCE_HIGH_MIN = 30
export const SPECIFIC_CHARACTER_ANALYSIS_MIN_ELIGIBLE = 3

export interface AnalysisEligibilityBreakdown {
  totalMatches: number
  scopePoolMatches: number
  eligibleMatches: number
  excludedCobalt: number
  excludedUnion: number
  excludedDuplicate: number
  excludedSeason: number
  excludedInvalid: number
  excludedOutOfScope: number
  excludedCharacter: number
  /** @deprecated use excludedOutOfScope */
  excludedNonRank: number
}

export interface AnalysisEligibilityResult {
  matches: MatchSummary[]
  analysisEligibleMatches: number
  scope: AnalysisMatchScope
  breakdown: AnalysisEligibilityBreakdown
}

export interface ComputeAnalysisEligibilityParams {
  matches: ReadonlyArray<MatchSummary>
  seasonNumber: number
  seasonFallback: number
  characterKey?: string | null
  acceptLoadedSeasonFallback?: boolean
  scope?: AnalysisMatchScope
}

function matchesCharacterFilter(match: MatchSummary, characterKey: string): boolean {
  const resolved = resolveCharacterDisplayName(match.characterNum, match.characterName)
  return match.characterName === characterKey || resolved === characterKey
}

export function isAnalysisScopeGameMode(mode: GameMode, scope: AnalysisMatchScope): boolean {
  if (isCobaltGameMode(mode) || isUnionGameMode(mode)) return false
  if (scope === 'rank') return isRankGameMode(mode)
  return isRankGameMode(mode) || isNormalGameMode(mode)
}

function scopePoolLabel(scope: AnalysisMatchScope): string {
  return scope === 'all' ? '\uB7AD\uD06C\u00B7\uC77C\uBC18' : '\uB7AD\uD06C'
}

function matchesSeason(
  match: MatchSummary,
  seasonNumber: number,
  seasonFallback: number,
  acceptLoadedSeasonFallback: boolean,
): boolean {
  const matchSeason = match.seasonNumber ?? seasonFallback
  return acceptLoadedSeasonFallback || matchSeason === seasonNumber
}

export function computeAnalysisEligibility(
  params: ComputeAnalysisEligibilityParams,
): AnalysisEligibilityResult {
  const scope = params.scope ?? 'all'
  const breakdown: AnalysisEligibilityBreakdown = {
    totalMatches: params.matches.length,
    scopePoolMatches: 0,
    eligibleMatches: 0,
    excludedCobalt: 0,
    excludedUnion: 0,
    excludedDuplicate: 0,
    excludedSeason: 0,
    excludedInvalid: 0,
    excludedOutOfScope: 0,
    excludedCharacter: 0,
    excludedNonRank: 0,
  }

  const seen = new Set<string>()
  const eligible: MatchSummary[] = []
  const characterKey = params.characterKey?.trim() || null
  const acceptLoadedSeasonFallback = params.acceptLoadedSeasonFallback === true

  for (const match of params.matches) {
    if (!matchesSeason(match, params.seasonNumber, params.seasonFallback, acceptLoadedSeasonFallback)) {
      breakdown.excludedSeason += 1
      continue
    }

    const matchId = match.matchId?.trim()
    if (!matchId) {
      breakdown.excludedInvalid += 1
      continue
    }

    const mode = resolveGameMode(match)
    if (isCobaltGameMode(mode)) {
      breakdown.excludedCobalt += 1
      continue
    }
    if (isUnionGameMode(mode)) {
      breakdown.excludedUnion += 1
      continue
    }
    if (!isAnalysisScopeGameMode(mode, scope)) {
      breakdown.excludedOutOfScope += 1
      breakdown.excludedNonRank += 1
      continue
    }

    breakdown.scopePoolMatches += 1

    if (seen.has(matchId)) {
      breakdown.excludedDuplicate += 1
      continue
    }
    seen.add(matchId)

    if (characterKey && !matchesCharacterFilter(match, characterKey)) {
      breakdown.excludedCharacter += 1
      continue
    }

    eligible.push(match)
  }

  breakdown.eligibleMatches = eligible.length

  return {
    matches: eligible,
    analysisEligibleMatches: eligible.length,
    scope,
    breakdown,
  }
}

export function isAllCharacterAnalysisSampleSufficient(eligibleCount: number): boolean {
  return eligibleCount >= ALL_CHARACTER_ANALYSIS_MIN_ELIGIBLE
}

export function isSpecificCharacterAnalysisSampleSufficient(eligibleCount: number): boolean {
  return eligibleCount >= SPECIFIC_CHARACTER_ANALYSIS_MIN_ELIGIBLE
}

export function formatAllCharacterInsufficientMessage(
  breakdown: AnalysisEligibilityBreakdown,
  scope: AnalysisMatchScope = 'all',
): string {
  const required = ALL_CHARACTER_ANALYSIS_MIN_ELIGIBLE
  const scopeLabel = scopePoolLabel(scope)
  if (scope === 'all') {
    return `\uCD5C\uADFC ${scopeLabel} \uACBD\uAE30 ${breakdown.scopePoolMatches}\uD310 \u00B7 \uC804\uCCB4 \uACBD\uAE30 \uAE30\uC900 \uBD84\uC11D\uC5D0\uB294 ${required}\uD310\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`
  }
  return `\uCD5C\uADFC ${scopeLabel} \uACBD\uAE30 ${breakdown.scopePoolMatches}\uD310 \u00B7 \uBD84\uC11D \uAC00\uB2A5 \uACBD\uAE30 ${required}\uD310\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`
}

export function formatAllCharacterSampleBasisNote(
  breakdown: AnalysisEligibilityBreakdown,
  confidenceLabel: string,
  scope: AnalysisMatchScope = 'all',
): string {
  const scopeLabel = scopePoolLabel(scope)
  return `\uCD5C\uADFC ${scopeLabel} \uACBD\uAE30 ${breakdown.scopePoolMatches}\uD310 \uAE30\uC900 \u00B7 \uBD84\uC11D \uAC00\uB2A5 \uACBD\uAE30 ${breakdown.eligibleMatches}\uD310 \u00B7 \uC2E0\uB8B0\uB3C4: ${confidenceLabel}`
}

export function resolveAllCharacterDataConfidence(
  eligibleCount: number,
): 'insufficient' | 'medium' | 'high' {
  if (eligibleCount < ALL_CHARACTER_ANALYSIS_MIN_ELIGIBLE) return 'insufficient'
  if (eligibleCount < ALL_CHARACTER_CONFIDENCE_HIGH_MIN) return 'medium'
  return 'high'
}