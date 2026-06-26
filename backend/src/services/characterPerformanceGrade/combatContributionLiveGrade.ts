import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CURRENT_DISPLAY_SEASON } from '../../utils/seasonRankTierLadder.js'
import { isExperimentalLocalBenchmarkSourceEnabled } from './benchmarkSource.js'
import {
  buildComboKey,
  isParticipationShadowReady,
  loadCombatParticipationBaselineDocument,
  lookupParticipationComboBaseline,
  type CombatParticipationBaselineDocument,
  type CombatParticipationBaselineStat,
} from '../../audit/combatParticipationBaselineBuilder.js'
import type { EffectiveReadinessLevel } from '../../audit/roleMetricCalibration.js'
import { ROLE_METRIC_STABILITY_CONFIG } from '../../audit/roleMetricStabilityConfig.js'
import {
  COMBAT_PARTICIPATION_BASELINE_VERSION,
} from '../../audit/combatParticipationBaselineBuilder.js'
import {
  NORMALIZATION_EPSILON,
  OUTCOME_SCORE_WEIGHT,
  ROLE_SCORE_WEIGHT,
  type CharacterGradeRole,
  type GradeBaselineTierKey,
} from './config.js'
import {
  computeCombatContributionRatio,
  computeFinisherShare,
} from './combatParticipation.js'
import {
  resolveCombatLivePreset,
  type GradeCombatMetricFallbackReason,
  type GradeCombatMetricMode,
} from './combatParticipationConfig.js'
import {
  evaluateCombatPresetCompleteness,
  scoreCombatPresetFixedTotal,
  type CombatPresetMetricKey,
} from './combatPresetCompleteness.js'
import {
  lookupBaselineForCombination,
  lookupEliteCandidatesForMetric,
} from './baselineStore.js'
import {
  clamp,
  createNormalizationMeta,
  OUTCOME_METRIC_DEFINITIONS,
  recordNormalizationMode,
  ROLE_METRIC_DEFINITIONS,
  robustNormalizeMetricScore,
  weightedScore,
  type MatchGradeInput,
  type WeaponGroupScoreCore,
  type WeaponGroupStats,
} from './metrics.js'

export type { GradeCombatMetricFallbackReason, GradeCombatMetricMode }

export interface CombatContributionCoverageSnapshot {
  totalGames: number
  computableGames: number
  coverageRatio: number
  eligible: boolean
}

export interface CombatContributionLiveBlocklistDocument {
  version: number
  generatedAt: string
  blockedExactKeys: string[]
  reasons: Record<string, string>
  entries?: Array<{
    key: string
    reasons: string[]
    auditGeneratedAt?: string
    auditGroupCount?: number
  }>
}

export interface CombatContributionLiveContext {
  mode: GradeCombatMetricMode
  fallbackReason: GradeCombatMetricFallbackReason
  coverage: number | null
  baselineReadiness: EffectiveReadinessLevel | null
  presetComplete?: boolean
  missingPresetMetrics?: CombatPresetMetricKey[]
  effectivePresetWeightTotal?: number
}

const moduleDir = dirname(fileURLToPath(import.meta.url))

let cachedBaselineDocument: CombatParticipationBaselineDocument | null | undefined
let cachedBlocklist: CombatContributionLiveBlocklistDocument | null | undefined

export function resetCombatContributionLiveCaches(): void {
  cachedBaselineDocument = undefined
  cachedBlocklist = undefined
}

export function primeCombatContributionLiveCaches(params: {
  baselineDocument?: CombatParticipationBaselineDocument | null
  blocklist?: CombatContributionLiveBlocklistDocument | null
}): void {
  if (params.baselineDocument !== undefined) {
    cachedBaselineDocument = params.baselineDocument
  }
  if (params.blocklist !== undefined) {
    cachedBlocklist = params.blocklist
  }
}

function resolveBlocklistPath(): string {
  const candidates = [
    join(moduleDir, '..', 'data', 'characterGrade', 'combat-contribution-live-blocklist.v1.json'),
    join(
      moduleDir,
      '..',
      '..',
      'src',
      'data',
      'characterGrade',
      'combat-contribution-live-blocklist.v1.json',
    ),
    join(
      moduleDir,
      '..',
      '..',
      '..',
      'src',
      'data',
      'characterGrade',
      'combat-contribution-live-blocklist.v1.json',
    ),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[candidates.length - 1]!
}

export function loadCombatContributionLiveBlocklist(
  path: string = resolveBlocklistPath(),
): CombatContributionLiveBlocklistDocument {
  if (!existsSync(path)) {
    return { version: 1, generatedAt: '', blockedExactKeys: [], reasons: {} }
  }
  return JSON.parse(readFileSync(path, 'utf8')) as CombatContributionLiveBlocklistDocument
}

export function getCombatContributionLiveBlocklist(): CombatContributionLiveBlocklistDocument {
  if (cachedBlocklist !== undefined) return cachedBlocklist ?? loadCombatContributionLiveBlocklist()
  cachedBlocklist = loadCombatContributionLiveBlocklist()
  return cachedBlocklist
}

export function isExactKeyCombatBlocked(
  rankTierKey: string,
  characterNum: number,
  weaponTypeId: number,
  blocklist: CombatContributionLiveBlocklistDocument = getCombatContributionLiveBlocklist(),
): boolean {
  const key = buildComboKey(rankTierKey, characterNum, weaponTypeId)
  return blocklist.blockedExactKeys.includes(key)
}

export function getCombatContributionBaselineDocument(): CombatParticipationBaselineDocument | null {
  if (cachedBaselineDocument !== undefined) return cachedBaselineDocument
  try {
    const document = loadCombatParticipationBaselineDocument()
    if (document.version !== COMBAT_PARTICIPATION_BASELINE_VERSION) {
      cachedBaselineDocument = null
      return null
    }
    cachedBaselineDocument = document
  } catch {
    cachedBaselineDocument = null
  }
  return cachedBaselineDocument
}

function winsorizeAndAverage(values: number[], cap: number | null): number | null {
  if (values.length === 0 || cap == null) return null
  const winsorized = values.map((value) => Math.min(value, cap))
  return winsorized.reduce((sum, value) => sum + value, 0) / winsorized.length
}

function normalizeCombatContributionScore(
  playerValue: number | null,
  stat: CombatParticipationBaselineStat,
): number | null {
  if (playerValue == null || !Number.isFinite(playerValue) || playerValue < 0) return null
  const baseline = stat.p95WinsorizedMean
  const upperAnchor = stat.p90
  if (
    baseline == null ||
    upperAnchor == null ||
    !Number.isFinite(baseline) ||
    !Number.isFinite(upperAnchor) ||
    upperAnchor <= baseline + ROLE_METRIC_STABILITY_CONFIG.anchorGapEpsilon
  ) {
    return null
  }

  const denominator = Math.max(Math.abs(baseline), NORMALIZATION_EPSILON)
  const relativePerformance = (playerValue - baseline) / denominator
  if (!Number.isFinite(relativePerformance)) return null

  if (relativePerformance <= 0) {
    return clamp(65 + 45 * relativePerformance, 20, 65)
  }

  const progress = (playerValue - baseline) / (upperAnchor - baseline)
  if (!Number.isFinite(progress)) return null
  return clamp(65 + 23 * progress, 65, 100)
}

export function normalizeCombatContributionScoreForAudit(
  playerValue: number | null,
  stat: CombatParticipationBaselineStat,
): number | null {
  return normalizeCombatContributionScore(playerValue, stat)
}

export function aggregateCombatMetricAverageForAudit(
  matches: ReadonlyArray<MatchGradeInput>,
  readValue: (match: MatchGradeInput) => number | null,
  p95Cap: number | null,
): number | null {
  return aggregateCombatMetricAverage(matches, readValue, p95Cap)
}

export function resolveCombatContributionCoverage(
  matches: ReadonlyArray<MatchGradeInput>,
): CombatContributionCoverageSnapshot {
  const totalGames = matches.length
  const computableGames = matches.filter((match) => {
    if (match.kills == null || match.assists == null || match.teamKills == null) return false
    return (
      computeCombatContributionRatio({
        playerKill: match.kills,
        playerAssistant: match.assists,
        teamKill: match.teamKills,
      }) != null
    )
  }).length
  const coverageRatio = totalGames > 0 ? computableGames / totalGames : 0
  return {
    totalGames,
    computableGames,
    coverageRatio,
    eligible: totalGames >= 5 && computableGames >= 5 && coverageRatio >= 0.8,
  }
}

export function resolveCombatContributionAttempt(params: {
  role: CharacterGradeRole
  playerTierKey: GradeBaselineTierKey
  stats: WeaponGroupStats
  matches: ReadonlyArray<MatchGradeInput>
  displaySeasonId: number
}): CombatContributionLiveContext {
  const legacyContext = (): CombatContributionLiveContext => ({
    mode: 'legacy-k-a-tk',
    fallbackReason: null,
    coverage: null,
    baselineReadiness: null,
  })

  if (!isExperimentalLocalBenchmarkSourceEnabled()) {
    return { ...legacyContext(), fallbackReason: 'source-disabled' }
  }

  const livePreset = resolveCombatLivePreset(
    params.role,
    params.stats.characterNum,
    params.stats.weaponTypeId,
  )
  if (!livePreset) {
    return { ...legacyContext(), fallbackReason: 'metric-missing' }
  }

  const document = getCombatContributionBaselineDocument()
  if (!document) {
    return { ...legacyContext(), fallbackReason: 'baseline-unavailable' }
  }
  if (
    document.seasonId !== params.displaySeasonId ||
    params.displaySeasonId !== CURRENT_DISPLAY_SEASON
  ) {
    return { ...legacyContext(), fallbackReason: 'season-mismatch' }
  }

  const comboBaseline = lookupParticipationComboBaseline(
    document,
    params.playerTierKey,
    params.stats.characterNum,
    params.stats.weaponTypeId,
  )
  if (!comboBaseline) {
    return { ...legacyContext(), fallbackReason: 'baseline-unavailable' }
  }

  const contributionStat = comboBaseline.metrics['participationAssistWeighted_0.7']
  if (!isParticipationShadowReady(contributionStat.readiness)) {
    return {
      mode: 'legacy-k-a-tk',
      fallbackReason: 'readiness-insufficient',
      coverage: null,
      baselineReadiness: contributionStat.readiness,
    }
  }

  if (
    isExactKeyCombatBlocked(
      params.playerTierKey,
      params.stats.characterNum,
      params.stats.weaponTypeId,
    )
  ) {
    return {
      mode: 'legacy-k-a-tk',
      fallbackReason: 'exact-key-blocked',
      coverage: null,
      baselineReadiness: contributionStat.readiness,
    }
  }

  const coverage = resolveCombatContributionCoverage(params.matches)
  if (params.matches.length < 5) {
    return {
      mode: 'legacy-k-a-tk',
      fallbackReason: 'sample-insufficient',
      coverage: coverage.coverageRatio,
      baselineReadiness: contributionStat.readiness,
    }
  }
  if (!coverage.eligible) {
    return {
      mode: 'legacy-k-a-tk',
      fallbackReason: 'coverage-insufficient',
      coverage: coverage.coverageRatio,
      baselineReadiness: contributionStat.readiness,
      presetComplete: false,
      missingPresetMetrics: ['combatContribution'],
      effectivePresetWeightTotal: 0,
    }
  }

  const presetCompleteness = evaluateCombatPresetCompleteness({
    role: params.role,
    characterNum: params.stats.characterNum,
    weaponTypeId: params.stats.weaponTypeId,
    stats: params.stats,
    matches: params.matches,
  })
  if (!presetCompleteness.complete) {
    return {
      mode: 'legacy-k-a-tk',
      fallbackReason: 'preset-incomplete',
      coverage: coverage.coverageRatio,
      baselineReadiness: contributionStat.readiness,
      presetComplete: false,
      missingPresetMetrics: presetCompleteness.missingMetrics,
      effectivePresetWeightTotal: presetCompleteness.effectiveWeightTotal,
    }
  }

  return {
    mode: livePreset.mode,
    fallbackReason: null,
    coverage: coverage.coverageRatio,
    baselineReadiness: contributionStat.readiness,
    presetComplete: true,
    missingPresetMetrics: [],
    effectivePresetWeightTotal: 100,
  }
}

function scoreExistingRoleMetric(
  stats: WeaponGroupStats,
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
  weightKey: string,
): number | null {
  const baseline = lookupBaselineForCombination(
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  if (!baseline) return null
  const definition = ROLE_METRIC_DEFINITIONS.find((entry) => entry.weightKey === weightKey)
  if (!definition) return null
  const playerValue = definition.readPlayer(stats)
  const tierValue = definition.readBaseline(baseline.metrics)
  if (playerValue == null || tierValue == null) return null
  return robustNormalizeMetricScore({
    playerValue,
    tierValue,
    eliteCandidates: lookupEliteCandidatesForMetric(
      playerTierKey,
      stats.characterNum,
      stats.weaponTypeId,
      (metrics) => definition.readBaseline(metrics),
    ),
    higherBetter: definition.higherBetter,
    metricKey: definition.tierOnlyKey,
  }).score
}

function aggregateCombatMetricAverage(
  matches: ReadonlyArray<MatchGradeInput>,
  readValue: (match: MatchGradeInput) => number | null,
  p95Cap: number | null,
): number | null {
  const values = matches.flatMap((match) => {
    const value = readValue(match)
    return value == null || !Number.isFinite(value) || value < 0 ? [] : [value]
  })
  return winsorizeAndAverage(values, p95Cap)
}

function computeCombatContributionRoleScore(params: {
  stats: WeaponGroupStats
  matches: ReadonlyArray<MatchGradeInput>
  role: CharacterGradeRole
  playerTierKey: GradeBaselineTierKey
  preset: Record<string, number>
  document: CombatParticipationBaselineDocument
}): number | null {
  const combo = lookupParticipationComboBaseline(
    params.document,
    params.playerTierKey,
    params.stats.characterNum,
    params.stats.weaponTypeId,
  )
  if (!combo) return null

  const contributionStat = combo.metrics['participationAssistWeighted_0.7']
  const finisherStat = combo.metrics.finisherShare
  const contributionAvg = aggregateCombatMetricAverage(
    params.matches,
    (match) =>
      computeCombatContributionRatio({
        playerKill: match.kills,
        playerAssistant: match.assists,
        teamKill: match.teamKills,
      }),
    contributionStat.p95,
  )
  const contributionScore = normalizeCombatContributionScore(contributionAvg, contributionStat)

  const entries: Array<{ score: number; weight: number }> = []
  for (const [key, weight] of Object.entries(params.preset)) {
    if (weight <= 0) continue
    if (key === 'combatContribution' || key === 'combatParticipation') {
      if (contributionScore == null) return null
      entries.push({ score: contributionScore, weight })
      continue
    }
    if (key === 'finisherShare') {
      const finisherAvg = aggregateCombatMetricAverage(
        params.matches,
        (match) =>
          computeFinisherShare({
            playerKill: match.kills,
            playerAssistant: match.assists,
            teamKill: match.teamKills,
          }),
        finisherStat.p95,
      )
      const finisherScore = normalizeCombatContributionScore(finisherAvg, finisherStat)
      if (finisherScore == null) return null
      entries.push({ score: finisherScore, weight })
      continue
    }
    if (key === 'playerKill' || key === 'playerAssistant' || key === 'teamKill') {
      continue
    }
    const score = scoreExistingRoleMetric(params.stats, params.role, params.playerTierKey, key)
    if (score == null) return null
    entries.push({ score, weight })
  }

  return scoreCombatPresetFixedTotal(entries, 100)
}

function computeOutcomeScore(
  stats: WeaponGroupStats,
  playerTierKey: GradeBaselineTierKey,
  meta: ReturnType<typeof createNormalizationMeta>,
): number | null {
  const baseline = lookupBaselineForCombination(
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  if (!baseline) return null

  const outcomeEntries = OUTCOME_METRIC_DEFINITIONS.map((definition) => {
    const playerValue = definition.readPlayer(stats)
    const tierValue = definition.readBaseline(baseline.metrics)
    if (playerValue == null || tierValue == null) return null
    const normalized = robustNormalizeMetricScore({
      playerValue,
      tierValue,
      eliteCandidates: lookupEliteCandidatesForMetric(
        playerTierKey,
        stats.characterNum,
        stats.weaponTypeId,
        (metrics) => definition.readBaseline(metrics),
      ),
      higherBetter: definition.higherBetter,
      metricKey: definition.tierOnlyKey,
    })
    recordNormalizationMode(meta, normalized.mode)
    if (normalized.score == null) return null
    return { score: normalized.score, weight: definition.weight }
  }).filter((entry): entry is { score: number; weight: number } => entry != null)

  return weightedScore(outcomeEntries)
}

export function computeWeaponGroupScoreWithCombatContribution(params: {
  stats: WeaponGroupStats
  matches: MatchGradeInput[]
  role: CharacterGradeRole
  playerTierKey: GradeBaselineTierKey
  displaySeasonId: number
  legacyScore: WeaponGroupScoreCore | null
}): WeaponGroupScoreCore & CombatContributionLiveContext {
  const meta = createNormalizationMeta()
  const attempt = resolveCombatContributionAttempt({
    role: params.role,
    playerTierKey: params.playerTierKey,
    stats: params.stats,
    matches: params.matches,
    displaySeasonId: params.displaySeasonId,
  })

  if (attempt.mode === 'legacy-k-a-tk' || attempt.fallbackReason != null) {
    if (params.legacyScore) {
      return {
        ...params.legacyScore,
        ...attempt,
      }
    }
    return {
      rawScore: 0,
      baselineTierKey: params.playerTierKey,
      usedFallback: true,
      normalizationMeta: meta,
      gradeFallbackMetricCount: 0,
      ...attempt,
    }
  }

  const livePreset = resolveCombatLivePreset(
    params.role,
    params.stats.characterNum,
    params.stats.weaponTypeId,
  )
  const document = getCombatContributionBaselineDocument()
  if (!livePreset || !document) {
    if (params.legacyScore) {
      return {
        ...params.legacyScore,
        mode: 'legacy-k-a-tk',
        fallbackReason: 'baseline-unavailable',
        coverage: attempt.coverage,
        baselineReadiness: attempt.baselineReadiness,
      }
    }
    return {
      rawScore: 0,
      baselineTierKey: params.playerTierKey,
      usedFallback: true,
      normalizationMeta: meta,
      gradeFallbackMetricCount: 0,
      mode: 'legacy-k-a-tk',
      fallbackReason: 'baseline-unavailable',
      coverage: attempt.coverage,
      baselineReadiness: attempt.baselineReadiness,
    }
  }

  const outcomeScore = computeOutcomeScore(params.stats, params.playerTierKey, meta)
  const roleScore = computeCombatContributionRoleScore({
    stats: params.stats,
    matches: params.matches,
    role: params.role,
    playerTierKey: params.playerTierKey,
    preset: livePreset.preset,
    document,
  })

  if (outcomeScore == null || roleScore == null) {
    if (params.legacyScore) {
      return {
        ...params.legacyScore,
        mode: 'legacy-k-a-tk',
        fallbackReason: 'invalid-anchor',
        coverage: attempt.coverage,
        baselineReadiness: attempt.baselineReadiness,
      }
    }
    return {
      rawScore: 0,
      baselineTierKey: params.playerTierKey,
      usedFallback: true,
      normalizationMeta: meta,
      gradeFallbackMetricCount: 0,
      mode: 'legacy-k-a-tk',
      fallbackReason: 'invalid-anchor',
      coverage: attempt.coverage,
      baselineReadiness: attempt.baselineReadiness,
    }
  }

  const dakBaseline = lookupBaselineForCombination(
    params.playerTierKey,
    params.stats.characterNum,
    params.stats.weaponTypeId,
  )

  return {
    rawScore: outcomeScore * OUTCOME_SCORE_WEIGHT + roleScore * ROLE_SCORE_WEIGHT,
    baselineTierKey: dakBaseline?.tierKey ?? params.playerTierKey,
    usedFallback: params.legacyScore?.usedFallback ?? dakBaseline?.usedFallback ?? false,
    normalizationMeta: params.legacyScore?.normalizationMeta ?? meta,
    gradeFallbackMetricCount: params.legacyScore?.gradeFallbackMetricCount ?? 0,
    outcomeScore,
    roleScore,
    ...attempt,
  }
}

export function evaluateCombatLiveSafety(params: {
  beforeScore: number
  afterScore: number
  beforeGrade: string | null
  afterGrade: string | null
}): { blocked: boolean; reason: string | null } {
  const scoreDelta = Math.abs(params.afterScore - params.beforeScore)
  if (scoreDelta > 10) {
    return { blocked: true, reason: 'max-score-delta-exceeds-10' }
  }
  if (scoreDelta > 5) {
    return { blocked: true, reason: 'mean-abs-score-delta-exceeds-5' }
  }
  return { blocked: false, reason: null }
}
