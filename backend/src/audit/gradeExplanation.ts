import {
  buildComboKey,
  loadCombatParticipationBaselineDocument,
  lookupParticipationComboBaseline,
} from './combatParticipationBaselineBuilder.js'
import type {
  CharacterGradeExplanation,
  GradeMetricExplanation,
  GradeScoreSectionExplanation,
} from './gradeExplanationTypes.js'
import {
  OUTCOME_SCORE_WEIGHT,
  ROLE_SCORE_WEIGHT,
  ROLE_PRESET_WEIGHTS,
  applySampleConfidence,
  sampleConfidenceFactor,
  scoreToFineGrade,
  type CharacterFineGrade,
  type CharacterGradeRole,
  type GradeBaselineTierKey,
} from '../services/characterPerformanceGrade/config.js'
import {
  getBaselineSnapshotMeta,
  lookupBaselineForCombination,
  lookupEliteCandidatesForMetric,
  type BaselineMetrics,
} from '../services/characterPerformanceGrade/baselineStore.js'
import {
  computeLegacyWeaponGroupScoreForAudit,
  computeWeaponGroupScore,
} from '../services/characterPerformanceGrade/compute.js'
import {
  computeCombatContributionRatio,
  computeFinisherShare,
} from '../services/characterPerformanceGrade/combatParticipation.js'
import {
  aggregateCombatMetricAverageForAudit,
  computeWeaponGroupScoreWithCombatContribution,
  getCombatContributionBaselineDocument,
  normalizeCombatContributionScoreForAudit,
  resolveCombatContributionAttempt,
} from '../services/characterPerformanceGrade/combatContributionLiveGrade.js'
import {
  resolveCombatLivePreset,
  type GradeCombatMetricMode,
} from '../services/characterPerformanceGrade/combatParticipationConfig.js'
import {
  computeWeaponGroupScoreWithLiveRoleMetrics,
  type GradeRoleMetricMode,
} from '../services/characterPerformanceGrade/roleMetricLiveGrade.js'
import {
  OUTCOME_METRIC_DEFINITIONS,
  ROLE_METRIC_DEFINITIONS,
  robustNormalizeMetricScore,
  weightedScore,
  type MatchGradeInput,
  type WeaponGroupStats,
} from '../services/characterPerformanceGrade/metrics.js'
import { evaluateCombatPresetCompleteness, scoreCombatPresetFixedTotal } from '../services/characterPerformanceGrade/combatPresetCompleteness.js'
import { resolveSupportSubtype } from '../services/characterPerformanceGrade/supportSubtype.js'
import { CURRENT_DISPLAY_SEASON } from '../utils/seasonRankTierLadder.js'

const H_PRIORITY_MODES: GradeRoleMetricMode[] = ['tank-t2', 'tank-t1', 'support-healer-s1']

function resolveConfidenceFactor(sampleSize: number): number {
  return sampleConfidenceFactor(sampleSize)
}

function weightedContribution(score: number | null, weight: number): number | null {
  if (score == null || weight <= 0) return null
  return (score * weight) / 100
}

function fineGradeStepDistance(a: CharacterFineGrade | null, b: CharacterFineGrade | null): number {
  const order = ['D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S-', 'S', 'S+']
  if (!a || !b) return 0
  const ai = order.indexOf(a)
  const bi = order.indexOf(b)
  if (ai < 0 || bi < 0) return 0
  return Math.abs(ai - bi)
}

function mapOutcomeMetricKey(key: string): GradeMetricExplanation['metric'] {
  if (key === 'averagePlace') return 'averagePlacement'
  return key as GradeMetricExplanation['metric']
}

function mapRoleMetricKey(key: string): GradeMetricExplanation['metric'] {
  switch (key) {
    case 'playerKill':
      return 'kills'
    case 'playerAssistant':
      return 'assists'
    case 'teamKill':
      return 'teamKills'
    case 'survival':
      return 'deaths'
    case 'damageToPlayer':
      return 'damageToPlayer'
    case 'viewContribution':
      return 'viewContribution'
    case 'monsterKill':
      return 'monsterKill'
    default:
      return key as GradeMetricExplanation['metric']
  }
}

function metricWeightDefaults(weight: number): Pick<
  GradeMetricExplanation,
  | 'configuredWeight'
  | 'enabledWeight'
  | 'effectiveWeightAfterNormalization'
  | 'weightedContributionBeforeNormalization'
  | 'weightedContributionAfterNormalization'
> {
  return {
    configuredWeight: weight,
    enabledWeight: 0,
    effectiveWeightAfterNormalization: 0,
    weightedContributionBeforeNormalization: null,
    weightedContributionAfterNormalization: null,
  }
}

function finalizeSectionWeightFields(
  metrics: GradeMetricExplanation[],
  useFixedTotal: boolean,
): GradeScoreSectionExplanation['metrics'] {
  const configuredWeightTotal = metrics.reduce((sum, metric) => sum + metric.configuredWeight, 0)
  const enabledWeightTotal = metrics.reduce(
    (sum, metric) => sum + (metric.normalizedScore != null && metric.enabled ? metric.configuredWeight : 0),
    0,
  )
  const scale = useFixedTotal
    ? 1
    : enabledWeightTotal > 0
      ? 100 / enabledWeightTotal
      : 0

  return metrics.map((metric) => {
    const enabledWeight =
      metric.enabled && metric.normalizedScore != null ? metric.configuredWeight : 0
    const effectiveWeightAfterNormalization = enabledWeight * scale
    const before =
      metric.normalizedScore != null
        ? (metric.normalizedScore * metric.configuredWeight) / 100
        : null
    const after =
      metric.normalizedScore != null
        ? (metric.normalizedScore * effectiveWeightAfterNormalization) / 100
        : null
    return {
      ...metric,
      weight: metric.configuredWeight,
      enabledWeight,
      effectiveWeightAfterNormalization,
      weightedContributionBeforeNormalization: before,
      weightedContributionAfterNormalization: after,
      weightedContribution: after,
    }
  })
}

function sectionWeightTotals(metrics: GradeMetricExplanation[]) {
  const configuredWeightTotal = metrics.reduce((sum, metric) => sum + metric.configuredWeight, 0)
  const enabledWeightTotal = metrics.reduce((sum, metric) => sum + metric.enabledWeight, 0)
  const effectiveWeightTotal = metrics.reduce(
    (sum, metric) => sum + metric.effectiveWeightAfterNormalization,
    0,
  )
  return { configuredWeightTotal, enabledWeightTotal, effectiveWeightTotal }
}

function buildDakMetricExplanation(params: {
  metric: GradeMetricExplanation['metric']
  weight: number
  playerValue: number | null
  tierValue: number | null
  higherBetter: boolean
  tierOnlyKey: string
  readBaseline: (metrics: BaselineMetrics) => number | null
  playerTierKey: GradeBaselineTierKey
  characterNum: number
  weaponTypeId: number
  baselineTier: string | null
  sampleCount: number | null
  coverage: number | null
  enabled?: boolean
  exclusionReason?: string | null
}): GradeMetricExplanation {
  if (!params.enabled) {
    return {
      metric: params.metric,
      enabled: false,
      exclusionReason: params.exclusionReason ?? 'disabled',
      weight: params.weight,
      ...metricWeightDefaults(params.weight),
      userValue: params.playerValue,
      baselineValue: params.tierValue,
      upperAnchorValue: null,
      baselineTier: params.baselineTier,
      baselineSource: 'dakgg-static-snapshot',
      normalizedScore: null,
      weightedContribution: null,
      sampleCount: params.sampleCount,
      coverage: params.coverage,
      readiness: null,
      usedFallback: false,
      fallbackReason: null,
    }
  }

  if (params.playerValue == null || params.tierValue == null) {
    return {
      metric: params.metric,
      enabled: true,
      exclusionReason: 'missing-value',
      weight: params.weight,
      ...metricWeightDefaults(params.weight),
      userValue: params.playerValue,
      baselineValue: params.tierValue,
      upperAnchorValue: null,
      baselineTier: params.baselineTier,
      baselineSource: 'dakgg-static-snapshot',
      normalizedScore: null,
      weightedContribution: null,
      sampleCount: params.sampleCount,
      coverage: params.coverage,
      readiness: null,
      usedFallback: false,
      fallbackReason: null,
    }
  }

  const eliteCandidates = lookupEliteCandidatesForMetric(
    params.playerTierKey,
    params.characterNum,
    params.weaponTypeId,
    params.readBaseline,
  )
  const normalized = robustNormalizeMetricScore({
    playerValue: params.playerValue,
    tierValue: params.tierValue,
    eliteCandidates,
    higherBetter: params.higherBetter,
    metricKey: params.tierOnlyKey as never,
  })
  const upperAnchor =
    eliteCandidates.find((candidate) => candidate.tierKey === 'in1000')?.value ??
    eliteCandidates[0]?.value ??
    null

  return {
    metric: params.metric,
    enabled: true,
    exclusionReason: null,
    weight: params.weight,
    ...metricWeightDefaults(params.weight),
    userValue: params.playerValue,
    baselineValue: params.tierValue,
    upperAnchorValue: upperAnchor,
    baselineTier: params.baselineTier,
    baselineSource: 'dakgg-static-snapshot',
    normalizedScore: normalized.score,
    weightedContribution: weightedContribution(normalized.score, params.weight),
    sampleCount: params.sampleCount,
    coverage: params.coverage,
    readiness: null,
    usedFallback: normalized.mode === 'tier-only' || normalized.mode === 'alternate-elite',
    fallbackReason: normalized.mode === 'missing' ? 'normalization-missing' : normalized.mode,
  }
}

function buildOutcomeSection(
  stats: WeaponGroupStats,
  playerTierKey: GradeBaselineTierKey,
): GradeScoreSectionExplanation {
  const baseline = lookupBaselineForCombination(
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  const rawMetrics = OUTCOME_METRIC_DEFINITIONS.map((definition) =>
    buildDakMetricExplanation({
      metric: mapOutcomeMetricKey(definition.key),
      weight: definition.weight,
      playerValue: definition.readPlayer(stats),
      tierValue: baseline ? definition.readBaseline(baseline.metrics) : null,
      higherBetter: definition.higherBetter,
      tierOnlyKey: definition.tierOnlyKey,
      readBaseline: (metrics) => definition.readBaseline(metrics),
      playerTierKey,
      characterNum: stats.characterNum,
      weaponTypeId: stats.weaponTypeId,
      baselineTier: baseline?.tierKey ?? null,
      sampleCount: stats.matchCount,
      coverage: null,
      enabled: baseline != null,
      exclusionReason: baseline ? null : 'baseline-unavailable',
    }),
  )
  const metrics = finalizeSectionWeightFields(rawMetrics, true)
  const totals = sectionWeightTotals(metrics)
  const score = weightedScore(
    metrics.flatMap((metric) =>
      metric.normalizedScore == null ? [] : [{ score: metric.normalizedScore, weight: metric.weight }],
    ),
  )
  return {
    weight: OUTCOME_SCORE_WEIGHT * 100,
    score,
    presetId: 'outcome-fixed',
    ...totals,
    metrics,
  }
}


function buildCombatMetricExplanation(params: {
  metric: 'combatContribution' | 'finisherShare'
  weight: number
  stats: WeaponGroupStats
  matches: MatchGradeInput[]
  playerTierKey: GradeBaselineTierKey
}): GradeMetricExplanation {
  const document = getCombatContributionBaselineDocument()
  const combo = document
    ? lookupParticipationComboBaseline(
        document,
        params.playerTierKey,
        params.stats.characterNum,
        params.stats.weaponTypeId,
      )
    : null
  const statKey =
    params.metric === 'combatContribution'
      ? 'participationAssistWeighted_0.7'
      : 'finisherShare'
  const stat = combo?.metrics[statKey]
  if (!stat) {
    return {
      metric: params.metric,
      enabled: false,
      exclusionReason: 'baseline-unavailable',
      weight: params.weight,
      ...metricWeightDefaults(params.weight),
      userValue: null,
      baselineValue: null,
      upperAnchorValue: null,
      baselineTier: params.playerTierKey,
      baselineSource: 'ercraft-aggregated-official-bser',
      normalizedScore: null,
      weightedContribution: null,
      sampleCount: params.stats.matchCount,
      coverage: null,
      readiness: null,
      usedFallback: false,
      fallbackReason: null,
    }
  }

  const values = params.matches.flatMap((match) => {
    const input = {
      playerKill: match.kills,
      playerAssistant: match.assists,
      teamKill: match.teamKills,
    }
    const value =
      params.metric === 'combatContribution'
        ? computeCombatContributionRatio(input)
        : computeFinisherShare(input)
    return value == null ? [] : [value]
  })
  const userValue = aggregateCombatMetricAverageForAudit(
    params.matches,
    (match) => {
      const input = {
        playerKill: match.kills,
        playerAssistant: match.assists,
        teamKill: match.teamKills,
      }
      return params.metric === 'combatContribution'
        ? computeCombatContributionRatio(input)
        : computeFinisherShare(input)
    },
    stat.p95,
  )
  const baselineValue = stat.p95WinsorizedMean
  const upperAnchorValue = stat.p90
  const normalizedScore = normalizeCombatContributionScoreForAudit(userValue, stat)

  return {
    metric: params.metric,
    enabled: params.weight > 0,
    exclusionReason: params.weight > 0 ? null : 'not-in-preset',
    weight: params.weight,
    ...metricWeightDefaults(params.weight),
    userValue,
    baselineValue,
    upperAnchorValue,
    baselineTier: params.playerTierKey,
    baselineSource: 'ercraft-aggregated-official-bser',
    normalizedScore,
    weightedContribution: weightedContribution(normalizedScore, params.weight),
    sampleCount: values.length,
    coverage: params.stats.matchCount > 0 ? values.length / params.stats.matchCount : null,
    readiness: stat.readiness,
    usedFallback: false,
    fallbackReason: null,
  }
}

function buildLegacyRoleSection(
  stats: WeaponGroupStats,
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
): GradeScoreSectionExplanation {
  const baseline = lookupBaselineForCombination(
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  const roleWeights = ROLE_PRESET_WEIGHTS[role]
  const rawMetrics = ROLE_METRIC_DEFINITIONS.map((definition) => {
    const weight = roleWeights[definition.weightKey]
    return buildDakMetricExplanation({
      metric: mapRoleMetricKey(definition.key),
      weight,
      playerValue: definition.readPlayer(stats),
      tierValue: baseline ? definition.readBaseline(baseline.metrics) : null,
      higherBetter: definition.higherBetter,
      tierOnlyKey: definition.tierOnlyKey,
      readBaseline: (metrics) => definition.readBaseline(metrics),
      playerTierKey,
      characterNum: stats.characterNum,
      weaponTypeId: stats.weaponTypeId,
      baselineTier: baseline?.tierKey ?? null,
      sampleCount: stats.matchCount,
      coverage:
        definition.key === 'viewContribution'
          ? stats.visionCoverage.coverageRatio
          : definition.key === 'monsterKill'
            ? stats.animalKillCoverage.coverageRatio
            : null,
      enabled: weight > 0 && baseline != null,
      exclusionReason: weight <= 0 ? 'weight-zero' : baseline ? null : 'baseline-unavailable',
    })
  })
  const metrics = finalizeSectionWeightFields(rawMetrics, false)
  const totals = sectionWeightTotals(metrics)
  const score = weightedScore(
    metrics.flatMap((metric) =>
      metric.normalizedScore == null ? [] : [{ score: metric.normalizedScore, weight: metric.weight }],
    ),
  )
  return {
    weight: ROLE_SCORE_WEIGHT * 100,
    score,
    presetId: 'legacy-k-a-tk',
    ...totals,
    metrics,
  }
}

function buildCombatRoleSection(
  stats: WeaponGroupStats,
  matches: MatchGradeInput[],
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
  combatMode: GradeCombatMetricMode,
): GradeScoreSectionExplanation {
  const preset = resolveCombatLivePreset(role, stats.characterNum, stats.weaponTypeId)
  const baseline = lookupBaselineForCombination(
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  const metrics: GradeMetricExplanation[] = []

  if (!preset) {
    return {
      weight: ROLE_SCORE_WEIGHT * 100,
      score: null,
      presetId: combatMode,
      configuredWeightTotal: 0,
      enabledWeightTotal: 0,
      effectiveWeightTotal: 0,
      metrics: [],
    }
  }

  for (const [key, weight] of Object.entries(preset.preset)) {
    if (weight <= 0) continue
    if (key === 'combatContribution' || key === 'combatParticipation') {
      metrics.push(
        buildCombatMetricExplanation({
          metric: 'combatContribution',
          weight,
          stats,
          matches,
          playerTierKey,
        }),
      )
      continue
    }
    if (key === 'finisherShare') {
      metrics.push(
        buildCombatMetricExplanation({
          metric: 'finisherShare',
          weight,
          stats,
          matches,
          playerTierKey,
        }),
      )
      continue
    }
    const definition = ROLE_METRIC_DEFINITIONS.find((entry) => entry.weightKey === key)
    if (!definition) continue
    metrics.push(
      buildDakMetricExplanation({
        metric: mapRoleMetricKey(definition.key),
        weight,
        playerValue: definition.readPlayer(stats),
        tierValue: baseline ? definition.readBaseline(baseline.metrics) : null,
        higherBetter: definition.higherBetter,
        tierOnlyKey: definition.tierOnlyKey,
        readBaseline: (metrics) => definition.readBaseline(metrics),
        playerTierKey,
        characterNum: stats.characterNum,
        weaponTypeId: stats.weaponTypeId,
        baselineTier: baseline?.tierKey ?? null,
        sampleCount: stats.matchCount,
        coverage:
          definition.key === 'viewContribution'
            ? stats.visionCoverage.coverageRatio
            : definition.key === 'monsterKill'
              ? stats.animalKillCoverage.coverageRatio
              : null,
        enabled: baseline != null,
      }),
    )
  }

  const finalizedMetrics = finalizeSectionWeightFields(metrics, true)
  const totals = sectionWeightTotals(finalizedMetrics)
  const score = scoreCombatPresetFixedTotal(
    finalizedMetrics.flatMap((metric) =>
      metric.normalizedScore == null
        ? []
        : [{ score: metric.normalizedScore, weight: metric.configuredWeight }],
    ),
    100,
  )

  return {
    weight: ROLE_SCORE_WEIGHT * 100,
    score,
    presetId: combatMode,
    ...totals,
    metrics: finalizedMetrics,
  }
}

function resolveBaselineMetadata(params: {
  combatPlayedAtFrom: string | null
  combatPlayedAtTo: string | null
}) {
  const dak = getBaselineSnapshotMeta()
  let combatDoc: ReturnType<typeof loadCombatParticipationBaselineDocument> | null = null
  try {
    combatDoc = loadCombatParticipationBaselineDocument()
  } catch {
    combatDoc = getCombatContributionBaselineDocument()
  }
  const dakAt = dak.collectedAt ? Date.parse(dak.collectedAt) : null
  const combatAt = combatDoc?.generatedAt ? Date.parse(combatDoc.generatedAt) : null
  const gapDays =
    dakAt != null && combatAt != null ? Math.abs(combatAt - dakAt) / (1000 * 60 * 60 * 24) : null
  let combatSpanDays: number | null = null
  if (params.combatPlayedAtFrom && params.combatPlayedAtTo) {
    combatSpanDays =
      (Date.parse(params.combatPlayedAtTo) - Date.parse(params.combatPlayedAtFrom)) /
      (1000 * 60 * 60 * 24)
  }

  return {
    dakSnapshotGeneratedAt: dak.collectedAt,
    dakPeriodDays: dak.periodDays,
    combatGeneratedAt: combatDoc?.generatedAt ?? null,
    combatPlayedAtFrom: params.combatPlayedAtFrom,
    combatPlayedAtTo: params.combatPlayedAtTo,
    combatParticipantRowCount: combatDoc?.participantRowCount ?? null,
    combatUniqueGameCount: combatDoc?.uniqueGameCount ?? null,
    baselinePeriodGapDays: gapDays,
    baselinePeriodWarning: (gapDays ?? 0) > 14 || (combatSpanDays ?? 0) > 60,
  }
}

export function buildWeaponGroupGradeExplanation(params: {
  stats: WeaponGroupStats
  matches: MatchGradeInput[]
  role: CharacterGradeRole
  playerTierKey: GradeBaselineTierKey
  displaySeasonId?: number
  combatPlayedAtFrom?: string | null
  combatPlayedAtTo?: string | null
}): CharacterGradeExplanation {
  const displaySeasonId = params.displaySeasonId ?? CURRENT_DISPLAY_SEASON
  const supportSubtype =
    params.role === '서포터'
      ? resolveSupportSubtype(params.stats.characterNum, params.stats.weaponTypeId, params.role)
      : null

  const legacyScore = computeLegacyWeaponGroupScoreForAudit(
    params.stats,
    params.role,
    params.playerTierKey,
  )
  const liveScored = computeWeaponGroupScore(
    params.stats,
    params.role,
    params.playerTierKey,
    params.matches,
    displaySeasonId,
  )
  const combatAttempt = resolveCombatContributionAttempt({
    role: params.role,
    playerTierKey: params.playerTierKey,
    stats: params.stats,
    matches: params.matches,
    displaySeasonId,
  })
  const combatScored = computeWeaponGroupScoreWithCombatContribution({
    stats: params.stats,
    matches: params.matches,
    role: params.role,
    playerTierKey: params.playerTierKey,
    displaySeasonId,
    legacyScore: legacyScore,
  })
  const hScored =
    params.role === '탱커' || params.role === '서포터'
      ? computeWeaponGroupScoreWithLiveRoleMetrics({
          stats: params.stats,
          matches: params.matches,
          role: params.role,
          playerTierKey: params.playerTierKey,
          displaySeasonId,
          legacyScore: legacyScore,
        })
      : null

  const outcome = buildOutcomeSection(params.stats, params.playerTierKey)
  const legacyRole = buildLegacyRoleSection(params.stats, params.role, params.playerTierKey)

  const liveCombatMode = liveScored.combatMode ?? 'legacy-k-a-tk'
  const liveRoleMetricMode = liveScored.mode ?? 'legacy'
  const roleScore =
    liveCombatMode !== 'legacy-k-a-tk'
      ? buildCombatRoleSection(
          params.stats,
          params.matches,
          params.role,
          params.playerTierKey,
          liveCombatMode,
        )
      : H_PRIORITY_MODES.includes(liveRoleMetricMode as GradeRoleMetricMode)
        ? buildLegacyRoleSection(params.stats, params.role, params.playerTierKey)
        : legacyRole

  if (H_PRIORITY_MODES.includes(liveRoleMetricMode as GradeRoleMetricMode)) {
    roleScore.presetId = liveRoleMetricMode
  }

  const rawScore = liveScored.rawScore
  const confidenceFactor = resolveConfidenceFactor(params.stats.matchCount)
  const finalScore = applySampleConfidence(rawScore, params.stats.matchCount)
  const finalGrade = scoreToFineGrade(finalScore)

  const legacyGrade = legacyScore ? scoreToFineGrade(legacyScore.rawScore) : null
  const combatGrade =
    combatScored.mode !== 'legacy-k-a-tk' ? scoreToFineGrade(combatScored.rawScore) : null
  const hGrade =
    hScored && H_PRIORITY_MODES.includes(hScored.mode as GradeRoleMetricMode)
      ? scoreToFineGrade(hScored.rawScore)
      : null

  const fallbackReasons: string[] = []
  if (liveScored.usedFallback) fallbackReasons.push('normalization-fallback')
  if (liveScored.combatFallbackReason) fallbackReasons.push(liveScored.combatFallbackReason)
  if (liveScored.fallbackReason) fallbackReasons.push(liveScored.fallbackReason)

  const combatRoleSection =
    combatScored.mode !== 'legacy-k-a-tk'
      ? buildCombatRoleSection(
          params.stats,
          params.matches,
          params.role,
          params.playerTierKey,
          combatScored.mode,
        )
      : null

  const presetCompleteness = evaluateCombatPresetCompleteness({
    role: params.role,
    characterNum: params.stats.characterNum,
    weaponTypeId: params.stats.weaponTypeId,
    stats: params.stats,
    matches: params.matches,
  })

  return {
    characterNum: params.stats.characterNum,
    weaponTypeId: params.stats.weaponTypeId,
    role: params.role,
    supportSubtype,
    matchCount: params.stats.matchCount,
    finalGrade,
    finalScore: Math.round(finalScore * 100) / 100,
    rawScoreBeforeConfidence: Math.round(rawScore * 100) / 100,
    confidenceFactor: Math.round(confidenceFactor * 10000) / 10000,
    outcome,
    roleScore,
    modes: {
      roleMetricMode: liveRoleMetricMode,
      combatMetricMode: liveCombatMode,
    },
    presetCompleteness: {
      complete: liveScored.combatPresetComplete ?? presetCompleteness.complete,
      missingMetrics: liveScored.combatMissingMetrics ?? presetCompleteness.missingMetrics,
      configuredWeightTotal: presetCompleteness.configuredWeightTotal,
      enabledWeightTotal: liveScored.combatEffectiveWeightTotal ?? presetCompleteness.enabledWeightTotal,
      effectiveWeightTotal: liveScored.combatEffectiveWeightTotal ?? presetCompleteness.effectiveWeightTotal,
    },
    fallback: {
      used: liveScored.usedFallback || fallbackReasons.length > 0,
      reasons: fallbackReasons,
    },
    baselineMetadata: resolveBaselineMetadata({
      combatPlayedAtFrom: params.combatPlayedAtFrom ?? null,
      combatPlayedAtTo: params.combatPlayedAtTo ?? null,
    }),
    comparison: {
      legacyRawScore: legacyScore ? Math.round(legacyScore.rawScore * 100) / 100 : null,
      legacyGrade,
      legacyRoleScore: legacyRole.score ? Math.round(legacyRole.score * 100) / 100 : null,
      legacyRoleMetrics: legacyRole.metrics,
      combatRawScore:
        combatScored.mode !== 'legacy-k-a-tk'
          ? Math.round(combatScored.rawScore * 100) / 100
          : null,
      combatGrade,
      combatRoleScore: combatRoleSection?.score
        ? Math.round(combatRoleSection.score * 100) / 100
        : null,
      hRoleRawScore: hGrade != null && hScored ? Math.round(hScored.rawScore * 100) / 100 : null,
      hRoleGrade: hGrade,
      hRoleScore: null,
      liveRawScore: Math.round(rawScore * 100) / 100,
      liveGrade: finalGrade,
      scoreDelta:
        legacyScore != null ? Math.round((rawScore - legacyScore.rawScore) * 100) / 100 : null,
      gradeStepDelta: fineGradeStepDistance(legacyGrade, finalGrade),
    },
  }
}

export function formatGradeExplanationText(explanation: CharacterGradeExplanation): string {
  const lines = [
    `character=${explanation.characterNum} weapon=${explanation.weaponTypeId} role=${explanation.role}`,
    `matchCount=${explanation.matchCount} grade=${explanation.finalGrade} score=${explanation.finalScore}`,
    `rawBeforeConfidence=${explanation.rawScoreBeforeConfidence} confidence=${explanation.confidenceFactor}`,
    `modes role=${explanation.modes.roleMetricMode} combat=${explanation.modes.combatMetricMode}`,
    '',
    'outcome:',
    ...explanation.outcome.metrics.map(
      (metric) =>
        `  ${metric.metric} user=${metric.userValue} baseline=${metric.baselineValue} score=${metric.normalizedScore} contrib=${metric.weightedContribution} w=${metric.weight}`,
    ),
    '',
    `role (${explanation.roleScore.presetId}):`,
    ...explanation.roleScore.metrics.map(
      (metric) =>
        `  ${metric.metric} user=${metric.userValue} baseline=${metric.baselineValue} score=${metric.normalizedScore} contrib=${metric.weightedContribution} w=${metric.weight}`,
    ),
    '',
    'comparison:',
    `  legacy=${explanation.comparison.legacyRawScore} live=${explanation.comparison.liveRawScore} delta=${explanation.comparison.scoreDelta}`,
  ]
  return `${lines.join('\n')}\n`
}

export { buildComboKey, fineGradeStepDistance }
