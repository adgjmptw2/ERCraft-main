import {
  computeCombatContributionRatio,
  computeFinisherShare,
} from './combatParticipation.js'
import {
  resolveCombatLivePreset,
  usesFinisherShareInLivePreset,
  type CombatShadowPreset,
  type GradeCombatMetricMode,
} from './combatParticipationConfig.js'
import type { CharacterGradeRole } from './config.js'
import { ROLE_METRIC_DEFINITIONS, type MatchGradeInput, type WeaponGroupStats } from './metrics.js'
import {
  STRUCTURED_METRIC_COVERAGE_RATIO,
  STRUCTURED_METRIC_MIN_GAMES,
  resolveStructuredMetricCoverage,
} from './structuredMetricRecovery.js'

export type CombatPresetMetricKey =
  | 'damageToPlayer'
  | 'combatContribution'
  | 'finisherShare'
  | 'deaths'
  | 'viewContribution'
  | 'monsterKill'

export interface CombatPresetCompletenessResult {
  complete: boolean
  missingMetrics: CombatPresetMetricKey[]
  configuredWeightTotal: number
  enabledWeightTotal: number
  effectiveWeightTotal: number
}

const PRESET_WEIGHT_KEY_TO_METRIC: Record<string, CombatPresetMetricKey | null> = {
  damageToPlayer: 'damageToPlayer',
  combatContribution: 'combatContribution',
  combatParticipation: 'combatContribution',
  finisherShare: 'finisherShare',
  survival: 'deaths',
  viewContribution: 'viewContribution',
  monsterKill: 'monsterKill',
  playerKill: null,
  playerAssistant: null,
  teamKill: null,
}

function resolveBasicNumericCoverage(
  matches: ReadonlyArray<MatchGradeInput>,
  readValue: (match: MatchGradeInput) => number | null,
): boolean {
  const totalGames = matches.length
  const validGames = matches.filter((match) => {
    const value = readValue(match)
    return value != null && Number.isFinite(value)
  }).length
  const coverage = resolveStructuredMetricCoverage(totalGames, validGames)
  return coverage.eligible
}

export function resolveCombatContributionMetricCoverage(
  matches: ReadonlyArray<MatchGradeInput>,
): boolean {
  const totalGames = matches.length
  const validGames = matches.filter((match) => {
    if (match.kills == null || match.assists == null || match.teamKills == null) return false
    return (
      computeCombatContributionRatio({
        playerKill: match.kills,
        playerAssistant: match.assists,
        teamKill: match.teamKills,
      }) != null
    )
  }).length
  return resolveStructuredMetricCoverage(totalGames, validGames).eligible
}

export function resolveFinisherShareMetricCoverage(
  matches: ReadonlyArray<MatchGradeInput>,
): boolean {
  const totalGames = matches.length
  const validGames = matches.filter((match) => {
    if (match.kills == null || match.teamKills == null) return false
    return (
      computeFinisherShare({
        playerKill: match.kills,
        playerAssistant: match.assists,
        teamKill: match.teamKills,
      }) != null
    )
  }).length
  return resolveStructuredMetricCoverage(totalGames, validGames).eligible
}

function isMetricReady(
  metric: CombatPresetMetricKey,
  stats: WeaponGroupStats,
  matches: ReadonlyArray<MatchGradeInput>,
): boolean {
  if (matches.length < STRUCTURED_METRIC_MIN_GAMES) return false

  switch (metric) {
    case 'damageToPlayer':
      return resolveBasicNumericCoverage(matches, (match) => match.damageToPlayer)
    case 'deaths':
      return resolveBasicNumericCoverage(matches, (match) => match.deaths)
    case 'combatContribution':
      return resolveCombatContributionMetricCoverage(matches)
    case 'finisherShare':
      return resolveFinisherShareMetricCoverage(matches)
    case 'viewContribution':
      return stats.visionCoverage.eligible
    case 'monsterKill':
      return stats.animalKillCoverage.eligible
    default:
      return false
  }
}

export function resolveRequiredCombatPresetMetrics(
  preset: CombatShadowPreset,
): CombatPresetMetricKey[] {
  const required = new Set<CombatPresetMetricKey>()
  for (const [key, weight] of Object.entries(preset)) {
    if (weight <= 0) continue
    const metric = PRESET_WEIGHT_KEY_TO_METRIC[key]
    if (metric) required.add(metric)
  }
  return [...required]
}

export function evaluateCombatPresetCompleteness(params: {
  role: CharacterGradeRole
  characterNum: number
  weaponTypeId: number
  stats: WeaponGroupStats
  matches: ReadonlyArray<MatchGradeInput>
}): CombatPresetCompletenessResult & { mode: GradeCombatMetricMode | null } {
  const livePreset = resolveCombatLivePreset(
    params.role,
    params.characterNum,
    params.weaponTypeId,
  )
  if (!livePreset) {
    return {
      mode: null,
      complete: false,
      missingMetrics: [],
      configuredWeightTotal: 0,
      enabledWeightTotal: 0,
      effectiveWeightTotal: 0,
    }
  }

  const configuredWeightTotal = Object.values(livePreset.preset).reduce(
    (sum, weight) => sum + weight,
    0,
  )
  const requiredMetrics = resolveRequiredCombatPresetMetrics(livePreset.preset)
  const missingMetrics = requiredMetrics.filter(
    (metric) => !isMetricReady(metric, params.stats, params.matches),
  )

  let enabledWeightTotal = 0
  for (const [key, weight] of Object.entries(livePreset.preset)) {
    if (weight <= 0) continue
    const metric = PRESET_WEIGHT_KEY_TO_METRIC[key]
    if (!metric) continue
    if (!missingMetrics.includes(metric)) {
      enabledWeightTotal += weight
    }
  }

  const complete = missingMetrics.length === 0 && configuredWeightTotal === 100

  return {
    mode: livePreset.mode,
    complete,
    missingMetrics,
    configuredWeightTotal,
    enabledWeightTotal,
    effectiveWeightTotal: complete ? 100 : enabledWeightTotal,
  }
}

export function usesFinisherInCombatPreset(preset: CombatShadowPreset): boolean {
  return usesFinisherShareInLivePreset(preset)
}

export function scoreCombatPresetFixedTotal(
  entries: ReadonlyArray<{ score: number; weight: number }>,
  expectedWeightTotal = 100,
): number | null {
  if (entries.length === 0) return null
  let totalWeight = 0
  let weighted = 0
  for (const entry of entries) {
    if (!Number.isFinite(entry.score) || entry.weight <= 0) return null
    totalWeight += entry.weight
    weighted += entry.score * entry.weight
  }
  if (totalWeight !== expectedWeightTotal) return null
  return weighted / expectedWeightTotal
}

export function readLegacyRoleMetricPlayerValue(
  stats: WeaponGroupStats,
  weightKey: string,
): number | null {
  const definition = ROLE_METRIC_DEFINITIONS.find((entry) => entry.weightKey === weightKey)
  if (!definition) return null
  return definition.readPlayer(stats)
}
