import { buildPlayStyleAnalysis } from '@/analysis/playStyleAnalysis'
import { buildPlayerAnalysisReport, buildPopulationMetricsFromMatches } from '@/analysis/playerReport'
import type { PlayerPlayStyleAnalysis } from '@/analysis/playStyleTypes'
import type { PlayerAnalysisReport } from '@/analysis/types'
import type { MatchSummary } from '@/types/match'
import { resolveCharacterDisplayName } from '@/utils/characterMap'

export function matchesCharacterKey(match: MatchSummary, characterKey: string): boolean {
  const key = characterKey.trim()
  if (!key) return false
  const resolved = resolveCharacterDisplayName(match.characterNum, match.characterName)
  const raw = match.characterName?.trim() ?? ''
  return resolved === key || raw === key
}

export function filterMatchesByCharacter(
  matches: MatchSummary[],
  characterKey: string,
): MatchSummary[] {
  return matches.filter((match) => matchesCharacterKey(match, characterKey))
}

function filterPopulationMatchSets(
  sets: MatchSummary[][],
  characterKey: string,
  minSample = 3,
): MatchSummary[][] {
  return sets
    .map((set) => filterMatchesByCharacter(set, characterKey))
    .filter((set) => set.length >= minSample)
}

export function buildCharacterScopedPlayStyleAnalysis(params: {
  characterKey: string
  playerMatches: MatchSummary[]
  populationMatchSets: MatchSummary[][]
  tierPopulationMatchSets?: MatchSummary[][]
  basisLabel: string
}): PlayerPlayStyleAnalysis {
  const playerMatches = filterMatchesByCharacter(params.playerMatches, params.characterKey)

  return buildPlayStyleAnalysis({
    playerMatches,
    populationMatchSets: filterPopulationMatchSets(
      params.populationMatchSets,
      params.characterKey,
    ),
    tierPopulationMatchSets: params.tierPopulationMatchSets
      ? filterPopulationMatchSets(params.tierPopulationMatchSets, params.characterKey)
      : undefined,
    basisLabel: params.basisLabel,
  })
}

export function buildCharacterScopedPlayerReport(params: {
  characterKey: string
  nickname: string
  playerMatches: MatchSummary[]
  populationMatches: MatchSummary[]
  baselineLabel?: string
}): PlayerAnalysisReport | null {
  const playerMatches = filterMatchesByCharacter(params.playerMatches, params.characterKey)
  const populationMatches = filterMatchesByCharacter(
    params.populationMatches,
    params.characterKey,
  )

  return buildPlayerAnalysisReport({
    nickname: params.nickname,
    playerMatches,
    populationMetrics: buildPopulationMetricsFromMatches(populationMatches),
    baselineLabel: params.baselineLabel ?? '동일 캐릭터 데모 평균',
  })
}
