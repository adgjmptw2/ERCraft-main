import type { RoleMetricKey, TierOnlyTargetMetricKey } from './config.js'
import {
  ELITE_BASELINE_TIER_KEY,
  NORMALIZATION_EPSILON,
  TIER_ONLY_TARGET_RELATIVE_GAIN,
} from './config.js'
import type { GradeBaselineTierKey } from './config.js'
import { isBaselineSampleSufficient } from './tierKey.js'
import {
  resolveStructuredMetricCoverage,
  type StructuredMetricCoverage,
} from './structuredMetricRecovery.js'

export interface MatchGradeInput {
  placement: number
  kills: number
  assists: number
  deaths: number
  teamKills: number | null
  damageToPlayer: number | null
  visionScore: number | null
  visionFromStructured: boolean
  animalKills: number | null
  animalKillsFromStructured: boolean
  roleMetricsVersion: number | null
  gameDuration?: number | null
  damageFromPlayer: number | null
  damageFromPlayerFromStructured: boolean
  shieldDamageOffsetFromPlayer: number | null
  shieldFromStructured: boolean
  teamRecover: number | null
  teamRecoverFromStructured: boolean
  victory: boolean
  weaponTypeId: number | null
}

export interface WeaponGroupStats {
  characterNum: number
  weaponTypeId: number
  matchCount: number
  wins: number
  top3: number
  avgPlacement: number
  avgKills: number
  avgAssists: number
  avgDeaths: number
  avgTeamKills: number | null
  avgDamageToPlayer: number | null
  avgVisionScore: number | null
  avgAnimalKills: number | null
  visionCoverage: StructuredMetricCoverage
  animalKillCoverage: StructuredMetricCoverage
  winRate: number
  top3Rate: number
}

export interface WeaponGroupScoreCore {
  rawScore: number
  baselineTierKey: GradeBaselineTierKey
  usedFallback: boolean
  normalizationMeta: NormalizationMeta
  gradeFallbackMetricCount: number
  outcomeScore?: number | null
  roleScore?: number | null
}

const EPSILON = NORMALIZATION_EPSILON
const MIN_ELITE_SAMPLE_FOR_LEGACY = 30

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export type NormalizationMode = 'elite' | 'alternate-elite' | 'tier-only' | 'missing'

export interface RobustNormalizeResult {
  score: number | null
  mode: NormalizationMode
}

export interface NormalizationMeta {
  eliteMetricCount: number
  alternateEliteMetricCount: number
  tierOnlyMetricCount: number
  missingMetricCount: number
}

export function createNormalizationMeta(): NormalizationMeta {
  return {
    eliteMetricCount: 0,
    alternateEliteMetricCount: 0,
    tierOnlyMetricCount: 0,
    missingMetricCount: 0,
  }
}

export function recordNormalizationMode(
  meta: NormalizationMeta,
  mode: NormalizationMode,
): void {
  switch (mode) {
    case 'elite':
      meta.eliteMetricCount += 1
      break
    case 'alternate-elite':
      meta.alternateEliteMetricCount += 1
      break
    case 'tier-only':
      meta.tierOnlyMetricCount += 1
      break
    case 'missing':
      meta.missingMetricCount += 1
      break
  }
}

export function directionalDifference(
  anchorValue: number,
  tierValue: number,
  higherBetter: boolean,
): number {
  return higherBetter ? anchorValue - tierValue : tierValue - anchorValue
}

export function computeRelativePerformance(
  playerValue: number,
  tierValue: number,
  higherBetter: boolean,
): number | null {
  if (!Number.isFinite(playerValue) || !Number.isFinite(tierValue)) return null
  const denominator = Math.max(Math.abs(tierValue), EPSILON)
  return higherBetter
    ? (playerValue - tierValue) / denominator
    : (tierValue - playerValue) / denominator
}

export interface EliteCandidate {
  tierKey: GradeBaselineTierKey
  value: number
  count: number
}

export function robustNormalizeMetricScore(params: {
  playerValue: number | null
  tierValue: number | null
  eliteCandidates: ReadonlyArray<EliteCandidate>
  higherBetter: boolean
  metricKey: TierOnlyTargetMetricKey
}): RobustNormalizeResult {
  const { playerValue, tierValue, eliteCandidates, higherBetter, metricKey } = params

  if (playerValue == null || tierValue == null) {
    return { score: null, mode: 'missing' }
  }
  if (!Number.isFinite(playerValue) || !Number.isFinite(tierValue)) {
    return { score: null, mode: 'missing' }
  }

  const relativePerformance = computeRelativePerformance(playerValue, tierValue, higherBetter)
  if (relativePerformance == null || !Number.isFinite(relativePerformance)) {
    return { score: null, mode: 'missing' }
  }

  const tierOnlyTarget = TIER_ONLY_TARGET_RELATIVE_GAIN[metricKey]

  if (relativePerformance <= 0) {
    return {
      score: clamp(65 + 45 * relativePerformance, 20, 65),
      mode: 'tier-only',
    }
  }

  for (const candidate of eliteCandidates) {
    if (!isBaselineSampleSufficient(candidate.count)) continue
    if (!Number.isFinite(candidate.value)) continue

    const signedGap = directionalDifference(candidate.value, tierValue, higherBetter)
    if (Math.abs(signedGap) <= EPSILON) continue
    if (signedGap <= EPSILON) continue

    const eliteRelativeImprovement =
      signedGap / Math.max(Math.abs(tierValue), EPSILON)
    if (!Number.isFinite(eliteRelativeImprovement)) continue
    if (eliteRelativeImprovement < tierOnlyTarget * 0.2) continue

    const progress = relativePerformance / eliteRelativeImprovement
    if (!Number.isFinite(progress)) continue

    return {
      score: clamp(65 + 23 * progress, 65, 100),
      mode: candidate.tierKey === ELITE_BASELINE_TIER_KEY ? 'elite' : 'alternate-elite',
    }
  }

  const progress = relativePerformance / tierOnlyTarget
  if (!Number.isFinite(progress)) {
    return { score: null, mode: 'missing' }
  }

  return {
    score: clamp(65 + 23 * progress, 65, 100),
    mode: 'tier-only',
  }
}

/** @deprecated 테스트 호환 — robustNormalizeMetricScore 위임 */
export function normalizeMetricScore(
  playerValue: number,
  tierValue: number,
  eliteValue: number,
  higherBetter: boolean,
  metricKey: TierOnlyTargetMetricKey = 'averagePlayerKill',
): number | null {
  return robustNormalizeMetricScore({
    playerValue,
    tierValue,
    eliteCandidates: [{ tierKey: ELITE_BASELINE_TIER_KEY, value: eliteValue, count: MIN_ELITE_SAMPLE_FOR_LEGACY }],
    higherBetter,
    metricKey,
  }).score
}

export interface OutcomeMetricDefinition {
  key: 'winRate' | 'top3Rate' | 'averagePlace'
  weight: number
  higherBetter: boolean
  tierOnlyKey: TierOnlyTargetMetricKey
  readPlayer: (stats: WeaponGroupStats) => number | null
  readBaseline: (metrics: {
    winRate: number
    top3Rate: number
    averagePlace: number
  }) => number | null
}

export interface RoleMetricDefinition {
  key: RoleMetricKey
  weightKey: RoleMetricKey
  higherBetter: boolean
  tierOnlyKey: TierOnlyTargetMetricKey
  readPlayer: (stats: WeaponGroupStats) => number | null
  readBaseline: (metrics: {
    averageDamageToPlayer: number
    averagePlayerKill: number
    averageTeamKill: number
    averagePlayerAssistant: number
    averageDeaths: number
    averageViewContribution: number
    averageMonsterKill: number
  }) => number | null
}

export function weightedScore(
  entries: ReadonlyArray<{ score: number; weight: number }>,
): number | null {
  let totalWeight = 0
  let weighted = 0
  for (const entry of entries) {
    if (!Number.isFinite(entry.score) || entry.weight <= 0) continue
    totalWeight += entry.weight
    weighted += entry.score * entry.weight
  }
  if (totalWeight <= 0) return null
  return weighted / totalWeight
}

export function aggregateWeaponGroupStats(
  characterNum: number,
  weaponTypeId: number,
  matches: MatchGradeInput[],
): WeaponGroupStats | null {
  if (matches.length === 0) return null

  let wins = 0
  let top3 = 0
  let placementSum = 0
  let killsSum = 0
  let assistsSum = 0
  let deathsSum = 0
  let teamKillsSum = 0
  let teamKillsCount = 0
  let damageSum = 0
  let damageCount = 0
  let visionStructuredCount = 0
  let visionStructuredSum = 0
  let animalStructuredCount = 0
  let animalStructuredSum = 0

  for (const match of matches) {
    if (match.victory) wins += 1
    if (match.placement > 0 && match.placement <= 3) top3 += 1
    placementSum += match.placement
    killsSum += match.kills
    assistsSum += match.assists
    deathsSum += match.deaths
    if (match.teamKills != null) {
      teamKillsSum += match.teamKills
      teamKillsCount += 1
    }
    if (match.damageToPlayer != null) {
      damageSum += match.damageToPlayer
      damageCount += 1
    }
    if (match.visionFromStructured && match.visionScore != null) {
      visionStructuredSum += match.visionScore
      visionStructuredCount += 1
    }
    if (match.animalKillsFromStructured && match.animalKills != null) {
      animalStructuredSum += match.animalKills
      animalStructuredCount += 1
    }
  }

  const matchCount = matches.length
  const visionCoverage = resolveStructuredMetricCoverage(matchCount, visionStructuredCount)
  const animalKillCoverage = resolveStructuredMetricCoverage(matchCount, animalStructuredCount)

  return {
    characterNum,
    weaponTypeId,
    matchCount,
    wins,
    top3,
    avgPlacement: placementSum / matchCount,
    avgKills: killsSum / matchCount,
    avgAssists: assistsSum / matchCount,
    avgDeaths: deathsSum / matchCount,
    avgTeamKills: teamKillsCount > 0 ? teamKillsSum / teamKillsCount : null,
    avgDamageToPlayer: damageCount > 0 ? damageSum / damageCount : null,
    avgVisionScore:
      visionCoverage.eligible && visionStructuredCount > 0
        ? visionStructuredSum / visionStructuredCount
        : null,
    avgAnimalKills:
      animalKillCoverage.eligible && animalStructuredCount > 0
        ? animalStructuredSum / animalStructuredCount
        : null,
    visionCoverage,
    animalKillCoverage,
    winRate: wins / matchCount,
    top3Rate: top3 / matchCount,
  }
}

export const ROLE_METRIC_DEFINITIONS: RoleMetricDefinition[] = [
  {
    key: 'damageToPlayer',
    weightKey: 'damageToPlayer',
    higherBetter: true,
    tierOnlyKey: 'averageDamageToPlayer',
    readPlayer: (stats) => stats.avgDamageToPlayer,
    readBaseline: (metrics) => metrics.averageDamageToPlayer,
  },
  {
    key: 'playerKill',
    weightKey: 'playerKill',
    higherBetter: true,
    tierOnlyKey: 'averagePlayerKill',
    readPlayer: (stats) => stats.avgKills,
    readBaseline: (metrics) => metrics.averagePlayerKill,
  },
  {
    key: 'teamKill',
    weightKey: 'teamKill',
    higherBetter: true,
    tierOnlyKey: 'averageTeamKill',
    readPlayer: (stats) => stats.avgTeamKills,
    readBaseline: (metrics) => metrics.averageTeamKill,
  },
  {
    key: 'playerAssistant',
    weightKey: 'playerAssistant',
    higherBetter: true,
    tierOnlyKey: 'averagePlayerAssistant',
    readPlayer: (stats) => stats.avgAssists,
    readBaseline: (metrics) => metrics.averagePlayerAssistant,
  },
  {
    key: 'survival',
    weightKey: 'survival',
    higherBetter: false,
    tierOnlyKey: 'averageDeaths',
    readPlayer: (stats) => stats.avgDeaths,
    readBaseline: (metrics) => metrics.averageDeaths,
  },
  {
    key: 'viewContribution',
    weightKey: 'viewContribution',
    higherBetter: true,
    tierOnlyKey: 'averageViewContribution',
    readPlayer: (stats) => stats.avgVisionScore,
    readBaseline: (metrics) => metrics.averageViewContribution,
  },
  {
    key: 'monsterKill',
    weightKey: 'monsterKill',
    higherBetter: true,
    tierOnlyKey: 'averageMonsterKill',
    readPlayer: (stats) => stats.avgAnimalKills,
    readBaseline: (metrics) => metrics.averageMonsterKill,
  },
]

export const OUTCOME_METRIC_DEFINITIONS: OutcomeMetricDefinition[] = [
  {
    key: 'winRate',
    weight: 30,
    higherBetter: true,
    tierOnlyKey: 'winRate',
    readPlayer: (stats) => stats.winRate,
    readBaseline: (metrics) => metrics.winRate,
  },
  {
    key: 'top3Rate',
    weight: 30,
    higherBetter: true,
    tierOnlyKey: 'top3Rate',
    readPlayer: (stats) => stats.top3Rate,
    readBaseline: (metrics) => metrics.top3Rate,
  },
  {
    key: 'averagePlace',
    weight: 40,
    higherBetter: false,
    tierOnlyKey: 'averagePlace',
    readPlayer: (stats) => stats.avgPlacement,
    readBaseline: (metrics) => metrics.averagePlace,
  },
]
