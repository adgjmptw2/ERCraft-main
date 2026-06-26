import { percentileRankMidrank } from '../playerCharacterSnapshot/percentile.js'
import { resolveFormalGrade, formatPercentileDisplay } from './gradePolicy.js'
import type { AnalysisConfidence } from './reliability.js'
import type { ComparisonScope, ComparisonWindow } from './types.js'
import type { ExclusiveTierBand } from './tierBand.js'
import { ADJACENT_TIER_BANDS } from './tierBand.js'

export type ComparisonType =
  | 'character-tier'
  | 'character-tier-adjacent'
  | 'role-tier'
  | 'role-tier-adjacent'
  | 'unavailable'

export interface ComparisonContext {
  comparisonType: ComparisonType
  comparisonScope: ComparisonScope
  comparisonWindow: ComparisonWindow
  samplePlayers: number
  tierBand: ExclusiveTierBand | null
  role: string | null
  characterNum: number | null
  benchmarkVersion: string
  displayLabel: string
  comparisonMatched: boolean
  comparisonUnavailableReason: string | null
}

export type MetricDirection = 'higher' | 'lower'

export const METRIC_DIRECTIONS: Record<string, MetricDirection> = {
  averagePlacement: 'lower',
  averageDeaths: 'lower',
  winRate: 'higher',
  top3Rate: 'higher',
  damagePerMinute: 'higher',
  visionPerMinute: 'higher',
  teamKillParticipation: 'higher',
  consistencyScore: 'higher',
  shadowScore: 'higher',
  overallScore: 'higher',
  averageKills: 'higher',
  averageAssists: 'higher',
  averageSurvivalTime: 'higher',
  creditPerMinute: 'higher',
  monsterKill: 'higher',
}

function directedPercentile(
  values: ReadonlyArray<number>,
  target: number,
  direction: MetricDirection,
): number | null {
  if (direction === 'lower') {
    return percentileRankMidrank(
      values.map((value) => -value),
      -target,
    )
  }
  return percentileRankMidrank(values, target)
}

export function buildMetricComparison(params: {
  metricKey: string
  playerValue: number | null
  cohortValues: ReadonlyArray<number>
  comparison: ComparisonContext
  playerConfidence: AnalysisConfidence
}): {
  value: number | null
  percentile: number | null
  label: string
  percentileDisplay: string
  grade: string | null
} {
  const direction = METRIC_DIRECTIONS[params.metricKey] ?? 'higher'
  const valid = params.cohortValues.filter((value) => Number.isFinite(value))
  if (params.playerValue == null || !Number.isFinite(params.playerValue) || valid.length === 0) {
    return {
      value: params.playerValue,
      percentile: null,
      label: '비교 표본 부족',
      percentileDisplay: '비교 표본 부족',
      grade: null,
    }
  }
  const percentile = directedPercentile(valid, params.playerValue, direction)
  const resolved = resolveFormalGrade({
    percentile,
    samplePlayers: params.comparison.samplePlayers,
    playerConfidence: params.playerConfidence,
    comparisonMatched: params.comparison.comparisonMatched,
  })
  const percentileDisplay = formatPercentileDisplay(percentile, params.comparison.samplePlayers)
  return {
    value: params.playerValue,
    percentile,
    label: resolved.percentileDisplay,
    percentileDisplay,
    grade: resolved.grade,
  }
}

function baseComparison(
  partial: Omit<ComparisonContext, 'comparisonMatched' | 'comparisonUnavailableReason'> & {
    samplePlayers: number
  },
): ComparisonContext {
  const matched = partial.comparisonType !== 'unavailable' && partial.samplePlayers >= 30
  return {
    ...partial,
    comparisonMatched: matched,
    comparisonUnavailableReason: matched ? null : 'matching-benchmark-unavailable',
  }
}

export function resolveCharacterComparison(params: {
  characterNum: number
  characterName: string
  tierBand: ExclusiveTierBand
  role: string | null
  comparisonScope: ComparisonScope
  comparisonWindow: ComparisonWindow
  cohortByCharacterTier: Map<string, number[]>
  cohortByRoleTier: Map<string, number[]>
  uniquePlayersByRoleTier: Map<string, number>
  benchmarkVersion: string
}): ComparisonContext {
  const exactKey = `${params.characterNum}:${params.tierBand}`
  const exact = params.cohortByCharacterTier.get(exactKey) ?? []
  if (exact.length >= 30) {
    return baseComparison({
      comparisonType: 'character-tier',
      comparisonScope: params.comparisonScope,
      comparisonWindow: params.comparisonWindow,
      samplePlayers: exact.length,
      tierBand: params.tierBand,
      role: params.role,
      characterNum: params.characterNum,
      benchmarkVersion: params.benchmarkVersion,
      displayLabel: `${params.characterName} 기준`,
    })
  }

  const merged = (ADJACENT_TIER_BANDS[params.tierBand] ?? []).flatMap((entry) =>
    params.cohortByCharacterTier.get(`${params.characterNum}:${entry}`) ?? [],
  )
  if (merged.length >= 30) {
    return baseComparison({
      comparisonType: 'character-tier-adjacent',
      comparisonScope: params.comparisonScope,
      comparisonWindow: params.comparisonWindow,
      samplePlayers: merged.length,
      tierBand: params.tierBand,
      role: params.role,
      characterNum: params.characterNum,
      benchmarkVersion: params.benchmarkVersion,
      displayLabel: `${params.characterName} 기준`,
    })
  }

  if (params.role) {
    const roleKey = `${params.role}:${params.tierBand}`
    const roleExact = params.cohortByRoleTier.get(roleKey) ?? []
    const rolePlayers = params.uniquePlayersByRoleTier.get(roleKey) ?? roleExact.length
    if (roleExact.length >= 30) {
      return baseComparison({
        comparisonType: 'role-tier',
        comparisonScope: params.comparisonScope,
        comparisonWindow: params.comparisonWindow,
        samplePlayers: rolePlayers,
        tierBand: params.tierBand,
        role: params.role,
        characterNum: params.characterNum,
        benchmarkVersion: params.benchmarkVersion,
        displayLabel: `${params.role} 기준`,
      })
    }
    const roleMerged = (ADJACENT_TIER_BANDS[params.tierBand] ?? []).flatMap(
      (entry) => params.cohortByRoleTier.get(`${params.role}:${entry}`) ?? [],
    )
    const mergedPlayers = roleMerged.length
    if (roleMerged.length >= 30) {
      return baseComparison({
        comparisonType: 'role-tier-adjacent',
        comparisonScope: params.comparisonScope,
        comparisonWindow: params.comparisonWindow,
        samplePlayers: mergedPlayers,
        tierBand: params.tierBand,
        role: params.role,
        characterNum: params.characterNum,
        benchmarkVersion: params.benchmarkVersion,
        displayLabel: `${params.role} 기준`,
      })
    }
  }

  return baseComparison({
    comparisonType: 'unavailable',
    comparisonScope: params.comparisonScope,
    comparisonWindow: params.comparisonWindow,
    samplePlayers: exact.length,
    tierBand: params.tierBand,
    role: params.role,
    characterNum: params.characterNum,
    benchmarkVersion: params.benchmarkVersion,
    displayLabel: '비교 표본 부족',
  })
}

export function resolveOverallComparison(params: {
  role: string | null
  tierBand: ExclusiveTierBand
  comparisonScope: ComparisonScope
  comparisonWindow: ComparisonWindow
  cohortByRoleTier: Map<string, number[]>
  uniquePlayersByRoleTier: Map<string, number>
  benchmarkVersion: string
}): ComparisonContext {
  if (!params.role) {
    return baseComparison({
      comparisonType: 'unavailable',
      comparisonScope: params.comparisonScope,
      comparisonWindow: params.comparisonWindow,
      samplePlayers: 0,
      tierBand: params.tierBand,
      role: null,
      characterNum: null,
      benchmarkVersion: params.benchmarkVersion,
      displayLabel: '비교 표본 부족',
    })
  }
  const roleKey = `${params.role}:${params.tierBand}`
  const exact = params.cohortByRoleTier.get(roleKey) ?? []
  const uniquePlayers = params.uniquePlayersByRoleTier.get(roleKey) ?? exact.length
  if (exact.length >= 30) {
    return baseComparison({
      comparisonType: 'role-tier',
      comparisonScope: params.comparisonScope,
      comparisonWindow: params.comparisonWindow,
      samplePlayers: uniquePlayers,
      tierBand: params.tierBand,
      role: params.role,
      characterNum: null,
      benchmarkVersion: params.benchmarkVersion,
      displayLabel: `${params.role} 기준`,
    })
  }
  const merged = (ADJACENT_TIER_BANDS[params.tierBand] ?? []).flatMap(
    (entry) => params.cohortByRoleTier.get(`${params.role}:${entry}`) ?? [],
  )
  if (merged.length >= 30) {
    return baseComparison({
      comparisonType: 'role-tier-adjacent',
      comparisonScope: params.comparisonScope,
      comparisonWindow: params.comparisonWindow,
      samplePlayers: merged.length,
      tierBand: params.tierBand,
      role: params.role,
      characterNum: null,
      benchmarkVersion: params.benchmarkVersion,
      displayLabel: `${params.role} 기준`,
    })
  }
  return baseComparison({
    comparisonType: 'unavailable',
    comparisonScope: params.comparisonScope,
    comparisonWindow: params.comparisonWindow,
    samplePlayers: exact.length,
    tierBand: params.tierBand,
    role: params.role,
    characterNum: null,
    benchmarkVersion: params.benchmarkVersion,
    displayLabel: '비교 표본 부족',
  })
}
