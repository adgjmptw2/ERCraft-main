import type { PlayerMatchRow } from '../utils/playerMatchDedup.js'
import type { CharacterFineGrade, CharacterGradeRole, GradeBaselineTierKey } from '../services/characterPerformanceGrade/config.js'
import {
  OUTCOME_SCORE_WEIGHT,
  ROLE_SCORE_WEIGHT,
  applySampleConfidence,
  scoreToFineGrade,
} from '../services/characterPerformanceGrade/config.js'
import {
  aggregateWeaponGroupStats,
  clamp,
  computeRelativePerformance,
  createNormalizationMeta,
  OUTCOME_METRIC_DEFINITIONS,
  recordNormalizationMode,
  ROLE_METRIC_DEFINITIONS,
  robustNormalizeMetricScore,
  weightedScore,
  type MatchGradeInput,
  type WeaponGroupStats,
} from '../services/characterPerformanceGrade/metrics.js'
import {
  lookupBaselineForCombination,
  lookupCharacterWeaponRole,
  lookupEliteCandidatesForMetric,
} from '../services/characterPerformanceGrade/baselineStore.js'
import { playerMatchRowToGradeInput } from '../services/characterPerformanceGrade/compute.js'
import { readStructuredMetricFromRow } from '../services/characterPerformanceGrade/structuredMetricRecovery.js'
import { applyCharacterPerformanceGrades } from '../services/characterPerformanceGrade/compute.js'
import type { SeasonCharacterAggregateContract } from '../contracts/player.js'
import type { RankTier } from '../utils/rankTier.js'

import {
  hashUid,
  isShadowReady,
  lookupComboBaseline,
  type RoleMetricBaselineDocument,
  type RoleMetricBaselineRow,
  type RoleMetricBaselineStat,
  type ShadowBaselineMetricName,
} from './roleMetricBaselineBuilder.js'

export type ShadowNormalizationMethod = 'winsorized_mean_p90' | 'median_p90' | 'mean_stddev'

export const TANK_SHADOW_PRESET_T1: Record<string, number> = {
  damageToPlayer: 6,
  playerKill: 3,
  teamKill: 18,
  playerAssistant: 16,
  survival: 23,
  viewContribution: 12,
  monsterKill: 7,
  tankingUtility: 15,
}

export const SUPPORT_SHADOW_PRESET_S1: Record<string, number> = {
  damageToPlayer: 4,
  playerKill: 2,
  teamKill: 18,
  playerAssistant: 22,
  survival: 16,
  viewContribution: 17,
  monsterKill: 3,
  supportUtility: 18,
}

export interface ShadowGradeResult {
  currentGrade: CharacterFineGrade | null
  currentScore: number | null
  shadowGradeT1: CharacterFineGrade | null
  shadowScoreT1: number | null
  shadowGradeT2: CharacterFineGrade | null
  shadowScoreT2: number | null
  shadowGradeS1: CharacterFineGrade | null
  shadowScoreS1: number | null
  shadowGradeS2: CharacterFineGrade | null
  shadowScoreS2: number | null
  unsupportedReason: string | null
}

export interface NormalizationMethodComparison {
  method: ShadowNormalizationMethod
  validComboCount: number
  invalidComboCount: number
  saturationCount: number
  zeroMedianCount: number
  anchorEqualCount: number
  recommendationScore: number
}

export interface GradeChangeSummary {
  sampleCount: number
  meanScoreDelta: number | null
  medianScoreDelta: number | null
  meanAbsScoreDelta: number | null
  maxScoreDelta: number | null
  oneStepChangeRate: number | null
  twoPlusStepChangeRate: number | null
  coarseBucketChangeRate: number | null
}

export interface RecoveryComparisonSummary {
  changedCount: number
  unchangedCount: number
  excludedByCoverageCount: number
  meanScoreDelta: number | null
  maxScoreDelta: number | null
  twoPlusStepCount: number
  byCharacter: Array<{
    characterNum: number
    weaponTypeId: number
    label: string
    beforeGrade: CharacterFineGrade | null
    afterGrade: CharacterFineGrade | null
    beforeScore: number | null
    afterScore: number | null
    visionCoverage: number | null
    animalCoverage: number | null
  }>
}

export interface ShadowReportBundle {
  generatedAt: string
  baselineSummary: {
    comboCount: number
    rowCount: number
    readinessCounts: Record<string, number>
    applicableCombos: string[]
    unsupportedCombos: string[]
  }
  normalizationComparison: NormalizationMethodComparison[]
  recommendedNormalization: ShadowNormalizationMethod
  tankerShadow: {
    t1: GradeChangeSummary
    t2: GradeChangeSummary
  }
  supporterShadow: {
    s1: GradeChangeSummary
    s2: GradeChangeSummary
  }
  recoveryComparison: RecoveryComparisonSummary
  outcomeControlled: {
    tankEfficiencyRankLift: number | null
    teamRecoverRankLift: number | null
  }
  stability: {
    trainValidationMeanGap: number | null
    splitHalfRankCorrelation: number | null
    bootstrapBaselineStdDev: number | null
  }
  profileSpotlight: Array<{
    profileId: string
    characterNum: number
    currentGrade: CharacterFineGrade | null
    shadowGradeT1: CharacterFineGrade | null
    shadowGradeS1: CharacterFineGrade | null
    recoveryDelta: number | null
  }>
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i += 1) {
    const vx = xs[i]! - meanX
    const vy = ys[i]! - meanY
    num += vx * vy
    dx += vx * vx
    dy += vy * vy
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

function spearman(xs: number[], ys: number[]): number | null {
  const rank = (values: number[]) => {
    const indexed = values.map((value, index) => ({ value, index }))
    indexed.sort((a, b) => a.value - b.value)
    const ranks = new Array<number>(values.length)
    for (let i = 0; i < indexed.length; i += 1) {
      ranks[indexed[i]!.index] = i + 1
    }
    return ranks
  }
  return pearson(rank(xs), rank(ys))
}

export function computeTankingEfficiency(
  damageFromPlayer: number | null,
  deaths: number | null,
): number | null {
  if (damageFromPlayer == null || !Number.isFinite(damageFromPlayer)) return null
  const deathCount = Math.max(0, deaths ?? 0)
  return damageFromPlayer / (1 + deathCount)
}

function resolveAnchors(
  stat: RoleMetricBaselineStat,
  method: ShadowNormalizationMethod,
): { baseline: number | null; upper: number | null; valid: boolean } {
  if (method === 'winsorized_mean_p90') {
    const baseline = stat.p95WinsorizedMean
    const upper = stat.p90
    return {
      baseline,
      upper,
      valid: baseline != null && upper != null && upper > baseline,
    }
  }
  if (method === 'median_p90') {
    const baseline = stat.median
    const upper = stat.p90
    return {
      baseline,
      upper,
      valid: baseline != null && upper != null && upper > baseline && !(baseline === 0 && stat.zeroCount > 0),
    }
  }
  const baseline = stat.mean
  const upper =
    baseline != null && stat.standardDeviation != null
      ? baseline + stat.standardDeviation
      : null
  return {
    baseline,
    upper,
    valid: baseline != null && upper != null && upper > baseline,
  }
}

export function normalizeShadowMetricScore(
  playerValue: number | null,
  stat: RoleMetricBaselineStat,
  method: ShadowNormalizationMethod,
): number | null {
  if (playerValue == null || !Number.isFinite(playerValue)) return null
  const { baseline, upper, valid } = resolveAnchors(stat, method)
  if (!valid || baseline == null || upper == null) return null
  const relative = computeRelativePerformance(playerValue, baseline, true)
  if (relative == null) return null
  if (relative <= 0) {
    return clamp(65 + 45 * relative, 20, 65)
  }
  const eliteRelative = (upper - baseline) / Math.max(Math.abs(baseline), 1e-6)
  if (eliteRelative <= 0) return null
  return clamp(65 + 23 * (relative / eliteRelative), 65, 100)
}

export function compareNormalizationMethods(
  document: RoleMetricBaselineDocument,
): NormalizationMethodComparison[] {
  const methods: ShadowNormalizationMethod[] = [
    'winsorized_mean_p90',
    'median_p90',
    'mean_stddev',
  ]
  return methods.map((method) => {
    let validComboCount = 0
    let invalidComboCount = 0
    let saturationCount = 0
    let zeroMedianCount = 0
    let anchorEqualCount = 0

    for (const combo of Object.values(document.combinations)) {
      for (const metric of ['damageFromPlayer', 'teamRecover', 'shieldDamageOffsetFromPlayer'] as ShadowBaselineMetricName[]) {
        const stat = combo.metrics[metric]
        if (!isShadowReady(stat.readiness)) continue
        const { baseline, upper, valid } = resolveAnchors(stat, method)
        if (!valid) {
          invalidComboCount += 1
          if (method === 'median_p90' && stat.median === 0) zeroMedianCount += 1
          if (baseline != null && upper != null && baseline === upper) anchorEqualCount += 1
          continue
        }
        validComboCount += 1
        const saturated = normalizeShadowMetricScore(stat.p95 ?? upper!, stat, method)
        if (saturated != null && saturated >= 99.5) saturationCount += 1
      }
    }

    const recommendationScore =
      validComboCount * 2 - invalidComboCount - saturationCount * 3 - zeroMedianCount - anchorEqualCount

    return {
      method,
      validComboCount,
      invalidComboCount,
      saturationCount,
      zeroMedianCount,
      anchorEqualCount,
      recommendationScore,
    }
  })
}

export function playerMatchRowToGradeInputLegacy(row: PlayerMatchRow): MatchGradeInput | null {
  const weaponTypeId = row.bestWeapon ?? null
  if (weaponTypeId == null || weaponTypeId <= 0) return null
  const vision = readStructuredMetricFromRow({ ...row, roleMetricsVersion: null }, 'viewContribution')
  const animal = readStructuredMetricFromRow({ ...row, roleMetricsVersion: null }, 'monsterKill')
  return {
    placement: row.placement ?? 0,
    kills: row.kills ?? 0,
    assists: row.assists ?? 0,
    deaths: row.deaths ?? 0,
    teamKills: row.teamKills ?? null,
    damageToPlayer: row.damageToPlayer ?? null,
    visionScore: vision.value,
    visionFromStructured: false,
    animalKills: animal.value,
    animalKillsFromStructured: false,
    roleMetricsVersion: null,
    damageFromPlayer: null,
    damageFromPlayerFromStructured: false,
    shieldDamageOffsetFromPlayer: null,
    shieldFromStructured: false,
    teamRecover: null,
    teamRecoverFromStructured: false,
    victory: row.victory === true,
    weaponTypeId,
  }
}

function computeOutcomeScore(
  stats: WeaponGroupStats,
  playerTierKey: GradeBaselineTierKey,
): number | null {
  const baseline = lookupBaselineForCombination(
    playerTierKey,
    stats.characterNum,
    stats.weaponTypeId,
  )
  if (!baseline) return null
  const meta = createNormalizationMeta()
  const entries = OUTCOME_METRIC_DEFINITIONS.map((definition) => {
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
  return weightedScore(entries)
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

function averageMetricFromRows(
  rows: ReadonlyArray<RoleMetricBaselineRow>,
  read: (row: RoleMetricBaselineRow) => number | null,
): number | null {
  const values = rows.map(read).filter((value): value is number => value != null && Number.isFinite(value))
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function computeTankUtilityScore(
  rows: ReadonlyArray<RoleMetricBaselineRow>,
  comboBaseline: ReturnType<typeof lookupComboBaseline>,
  method: ShadowNormalizationMethod,
  useShield: boolean,
): number | null {
  if (!comboBaseline) return null
  const efficiencyValues = rows
    .map((row) => computeTankingEfficiency(row.damageFromPlayer, row.deaths))
    .filter((value): value is number => value != null)
  if (efficiencyValues.length === 0) return null

  const efficiencyStat = comboBaseline.metrics.damageFromPlayer
  const efficiencyAvg =
    efficiencyValues.reduce((sum, value) => sum + value, 0) / efficiencyValues.length
  const efficiencyScore = normalizeShadowMetricScore(efficiencyAvg, efficiencyStat, method)
  if (efficiencyScore == null) return null

  if (!useShield) return efficiencyScore

  const shieldStat = comboBaseline.metrics.shieldDamageOffsetFromPlayer
  if (!isShadowReady(shieldStat.readiness)) return efficiencyScore

  const shieldAvg = averageMetricFromRows(rows, (row) => row.shieldDamageOffsetFromPlayer)
  const shieldScore = normalizeShadowMetricScore(shieldAvg, shieldStat, method)
  if (shieldScore == null) return efficiencyScore
  return efficiencyScore * 0.7 + shieldScore * 0.3
}

function computeSupportUtilityScore(
  rows: ReadonlyArray<RoleMetricBaselineRow>,
  comboBaseline: ReturnType<typeof lookupComboBaseline>,
  method: ShadowNormalizationMethod,
  useCc: boolean,
): number | null {
  if (!comboBaseline) return null
  const recoverStat = comboBaseline.metrics.teamRecover
  if (!isShadowReady(recoverStat.readiness)) return null

  const recoverAvg = averageMetricFromRows(rows, (row) => row.teamRecover)
  const recoverScore = normalizeShadowMetricScore(recoverAvg, recoverStat, method)
  if (recoverScore == null) return null
  if (!useCc) return recoverScore

  const ccStat = comboBaseline.metrics.ccTimeToPlayer
  if (!isShadowReady(ccStat.readiness)) return recoverScore
  const ccAvg = averageMetricFromRows(rows, (row) => row.ccTimeToPlayer)
  const ccScore = normalizeShadowMetricScore(ccAvg, ccStat, method)
  if (ccScore == null) return recoverScore
  return recoverScore * 0.7 + ccScore * 0.3
}

function computeShadowRoleScore(
  stats: WeaponGroupStats,
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
  preset: Record<string, number>,
  utilityKey: 'tankingUtility' | 'supportUtility',
  utilityScore: number | null,
): number | null {
  const entries: Array<{ score: number; weight: number }> = []
  for (const [key, weight] of Object.entries(preset)) {
    if (weight <= 0) continue
    if (key === utilityKey) {
      if (utilityScore == null) return null
      entries.push({ score: utilityScore, weight })
      continue
    }
    const score = scoreExistingRoleMetric(stats, role, playerTierKey, key)
    if (score == null) continue
    entries.push({ score, weight })
  }
  return weightedScore(entries)
}

function computeShadowGradeForGroup(
  stats: WeaponGroupStats,
  rows: ReadonlyArray<RoleMetricBaselineRow>,
  role: CharacterGradeRole,
  playerTierKey: GradeBaselineTierKey,
  document: RoleMetricBaselineDocument,
  method: ShadowNormalizationMethod,
  preset: Record<string, number>,
  utilityKey: 'tankingUtility' | 'supportUtility',
  utilityScore: number | null,
): number | null {
  const outcomeScore = computeOutcomeScore(stats, playerTierKey)
  const roleScore = computeShadowRoleScore(
    stats,
    role,
    playerTierKey,
    preset,
    utilityKey,
    utilityScore,
  )
  if (outcomeScore == null || roleScore == null) return null
  return outcomeScore * OUTCOME_SCORE_WEIGHT + roleScore * ROLE_SCORE_WEIGHT
}

function fineGradeStepDistance(a: CharacterFineGrade | null, b: CharacterFineGrade | null): number {
  const order = ['D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S-', 'S', 'S+']
  if (!a || !b) return 0
  const ai = order.indexOf(a)
  const bi = order.indexOf(b)
  if (ai < 0 || bi < 0) return 0
  return Math.abs(ai - bi)
}

function coarseBucket(grade: CharacterFineGrade | null): string | null {
  if (!grade) return null
  return grade.charAt(0)
}

export function summarizeGradeChanges(
  pairs: ReadonlyArray<{ before: number | null; after: number | null; beforeGrade: CharacterFineGrade | null; afterGrade: CharacterFineGrade | null }>,
): GradeChangeSummary {
  const deltas = pairs
    .filter((pair) => pair.before != null && pair.after != null)
    .map((pair) => (pair.after! - pair.before!))
  const absDeltas = deltas.map(Math.abs)
  const stepChanges = pairs.map((pair) => fineGradeStepDistance(pair.beforeGrade, pair.afterGrade))
  const coarseChanges = pairs.filter(
    (pair) => coarseBucket(pair.beforeGrade) !== coarseBucket(pair.afterGrade),
  ).length

  const median = (values: number[]) => {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : sorted[mid] ?? null
  }

  return {
    sampleCount: pairs.length,
    meanScoreDelta: deltas.length > 0 ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null,
    medianScoreDelta: median(deltas),
    meanAbsScoreDelta: absDeltas.length > 0 ? absDeltas.reduce((sum, value) => sum + value, 0) / absDeltas.length : null,
    maxScoreDelta: absDeltas.length > 0 ? Math.max(...absDeltas) : null,
    oneStepChangeRate: stepChanges.length > 0 ? stepChanges.filter((value) => value === 1).length / stepChanges.length : null,
    twoPlusStepChangeRate: stepChanges.length > 0 ? stepChanges.filter((value) => value >= 2).length / stepChanges.length : null,
    coarseBucketChangeRate: pairs.length > 0 ? coarseChanges / pairs.length : null,
  }
}

export function compareStructuredMetricRecovery(params: {
  rows: PlayerMatchRow[]
  characterStats: SeasonCharacterAggregateContract[]
  playerTier: RankTier | null
}): RecoveryComparisonSummary {
  const before = applyCharacterPerformanceGrades({
    rows: params.rows.map((row) => ({ ...row, roleMetricsVersion: null, viewContribution: null, monsterKill: null })),
    characterStats: params.characterStats,
    metaStatus: 'complete',
    playerTier: params.playerTier,
  })
  const after = applyCharacterPerformanceGrades({
    rows: params.rows,
    characterStats: params.characterStats,
    metaStatus: 'complete',
    playerTier: params.playerTier,
  })

  const byCharacter: RecoveryComparisonSummary['byCharacter'] = []
  let changedCount = 0
  let unchangedCount = 0
  let excludedByCoverageCount = 0
  const deltas: number[] = []
  let twoPlusStepCount = 0

  for (const stat of params.characterStats) {
    const beforeRow = before.find((row) => row.characterNum === stat.characterNum)
    const afterRow = after.find((row) => row.characterNum === stat.characterNum)
    const characterRows = params.rows.filter((row) => row.characterNum === stat.characterNum)
    const weaponTypeId = characterRows[0]?.bestWeapon ?? 0
    const legacyInputs = characterRows
      .map(playerMatchRowToGradeInputLegacy)
      .filter((input): input is MatchGradeInput => input != null)
    const structuredInputs = characterRows
      .map(playerMatchRowToGradeInput)
      .filter((input): input is MatchGradeInput => input != null)
    const legacyStats =
      weaponTypeId > 0 ? aggregateWeaponGroupStats(stat.characterNum, weaponTypeId, legacyInputs) : null
    const structuredStats =
      weaponTypeId > 0 ? aggregateWeaponGroupStats(stat.characterNum, weaponTypeId, structuredInputs) : null
    const visionCoverage = structuredStats?.visionCoverage.coverageRatio ?? null
    const animalCoverage = structuredStats?.animalKillCoverage.coverageRatio ?? null
    const excluded =
      (visionCoverage != null && visionCoverage < 0.8) ||
      (animalCoverage != null && animalCoverage < 0.8)

    if (excluded) excludedByCoverageCount += 1

    const beforeScore = beforeRow?.gradeScore ?? null
    const afterScore = afterRow?.gradeScore ?? null
    if (beforeScore != null && afterScore != null) {
      const delta = afterScore - beforeScore
      if (Math.abs(delta) > 0.01) changedCount += 1
      else unchangedCount += 1
      deltas.push(delta)
      twoPlusStepCount += fineGradeStepDistance(beforeRow?.grade ?? null, afterRow?.grade ?? null) >= 2 ? 1 : 0
    }

    byCharacter.push({
      characterNum: stat.characterNum,
      weaponTypeId,
      label: `${stat.characterNum}:${weaponTypeId}`,
      beforeGrade: beforeRow?.grade ?? null,
      afterGrade: afterRow?.grade ?? null,
      beforeScore,
      afterScore,
      visionCoverage,
      animalCoverage,
    })
  }

  return {
    changedCount,
    unchangedCount,
    excludedByCoverageCount,
    meanScoreDelta: deltas.length > 0 ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null,
    maxScoreDelta: deltas.length > 0 ? Math.max(...deltas.map(Math.abs)) : null,
    twoPlusStepCount,
    byCharacter,
  }
}

export function buildShadowReport(params: {
  baselineRows: ReadonlyArray<RoleMetricBaselineRow>
  document: RoleMetricBaselineDocument
  playerRows: ReadonlyArray<PlayerMatchRow>
  characterStats: SeasonCharacterAggregateContract[]
  playerTier: RankTier | null
  playerTierKey: GradeBaselineTierKey
}): ShadowReportBundle {
  const normalizationComparison = compareNormalizationMethods(params.document)
  const recommendedNormalization =
    [...normalizationComparison].sort((a, b) => b.recommendationScore - a.recommendationScore)[0]
      ?.method ?? 'winsorized_mean_p90'

  const readinessCounts: Record<string, number> = {}
  const applicableCombos: string[] = []
  const unsupportedCombos: string[] = []
  for (const [comboKey, combo] of Object.entries(params.document.combinations)) {
    for (const metric of ['teamRecover', 'shieldDamageOffsetFromPlayer', 'damageFromPlayer'] as const) {
      const readiness = combo.metrics[metric].readiness
      readinessCounts[readiness] = (readinessCounts[readiness] ?? 0) + 1
    }
    const tankReady = isShadowReady(combo.metrics.shieldDamageOffsetFromPlayer.readiness)
    const supportReady = isShadowReady(combo.metrics.teamRecover.readiness)
    if (combo.role === '탱커' && tankReady) applicableCombos.push(comboKey)
    if (combo.role === '서포터' && supportReady) applicableCombos.push(comboKey)
    if (combo.role === '탱커' && !tankReady) unsupportedCombos.push(comboKey)
    if (combo.role === '서포터' && !supportReady) unsupportedCombos.push(comboKey)
  }

  const tankPairsT1: Array<{ before: number | null; after: number | null; beforeGrade: CharacterFineGrade | null; afterGrade: CharacterFineGrade | null }> = []
  const tankPairsT2: typeof tankPairsT1 = []
  const supportPairsS1: typeof tankPairsT1 = []
  const supportPairsS2: typeof tankPairsT1 = []

  const groups = new Map<string, RoleMetricBaselineRow[]>()
  for (const row of params.baselineRows) {
    const key = `${row.uid}|${row.characterNum}|${row.weaponTypeId}`
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  }

  for (const groupRows of groups.values()) {
    const sample = groupRows[0]!
    if (sample.role !== '탱커' && sample.role !== '서포터') continue
    const matchInputs = groupRows.map((row) => ({
      placement: row.placement ?? 0,
      kills: 0,
      assists: 0,
      deaths: row.deaths ?? 0,
      teamKills: null,
      damageToPlayer: null,
      visionScore: row.viewContribution,
      visionFromStructured: true,
      animalKills: row.monsterKill,
      animalKillsFromStructured: true,
      roleMetricsVersion: 1,
      damageFromPlayer: row.damageFromPlayer,
      damageFromPlayerFromStructured: row.damageFromPlayer != null,
      shieldDamageOffsetFromPlayer: row.shieldDamageOffsetFromPlayer,
      shieldFromStructured: row.shieldDamageOffsetFromPlayer != null,
      teamRecover: row.teamRecover,
      teamRecoverFromStructured: row.teamRecover != null,
      victory: row.victory === true,
      weaponTypeId: sample.weaponTypeId,
    }))
    const stats = aggregateWeaponGroupStats(sample.characterNum, sample.weaponTypeId, matchInputs)
    if (!stats) continue
    const comboBaseline = lookupComboBaseline(
      params.document,
      sample.rankTierKey,
      sample.characterNum,
      sample.weaponTypeId,
    )
    const currentInputs = params.playerRows
      .filter(
        (row) =>
          row.uid === sample.uid &&
          row.characterNum === sample.characterNum &&
          row.bestWeapon === sample.weaponTypeId,
      )
      .map(playerMatchRowToGradeInput)
      .filter((input): input is MatchGradeInput => input != null)
    const currentStats = aggregateWeaponGroupStats(sample.characterNum, sample.weaponTypeId, currentInputs)
    if (!currentStats) continue
    const currentScore = computeShadowGradeForGroup(
      currentStats,
      groupRows,
      sample.role as CharacterGradeRole,
      params.playerTierKey,
      params.document,
      recommendedNormalization,
      sample.role === '탱커' ? TANK_SHADOW_PRESET_T1 : SUPPORT_SHADOW_PRESET_S1,
      sample.role === '탱커' ? 'tankingUtility' : 'supportUtility',
      sample.role === '탱커'
        ? computeTankUtilityScore(groupRows, comboBaseline, recommendedNormalization, false)
        : computeSupportUtilityScore(groupRows, comboBaseline, recommendedNormalization, false),
    )
    const currentGrade = currentScore != null ? scoreToFineGrade(applySampleConfidence(currentScore, stats.matchCount)) : null

    if (sample.role === '탱커') {
      const t1Score = computeShadowGradeForGroup(
        stats,
        groupRows,
        '탱커',
        params.playerTierKey,
        params.document,
        recommendedNormalization,
        TANK_SHADOW_PRESET_T1,
        'tankingUtility',
        computeTankUtilityScore(groupRows, comboBaseline, recommendedNormalization, false),
      )
      const t2Score = computeShadowGradeForGroup(
        stats,
        groupRows,
        '탱커',
        params.playerTierKey,
        params.document,
        recommendedNormalization,
        TANK_SHADOW_PRESET_T1,
        'tankingUtility',
        computeTankUtilityScore(groupRows, comboBaseline, recommendedNormalization, true),
      )
      const t1Grade = t1Score != null ? scoreToFineGrade(applySampleConfidence(t1Score, stats.matchCount)) : null
      const t2Grade = t2Score != null ? scoreToFineGrade(applySampleConfidence(t2Score, stats.matchCount)) : null
      tankPairsT1.push({ before: currentScore, after: t1Score, beforeGrade: currentGrade, afterGrade: t1Grade })
      tankPairsT2.push({ before: currentScore, after: t2Score, beforeGrade: currentGrade, afterGrade: t2Grade })
    } else {
      const s1Score = computeShadowGradeForGroup(
        stats,
        groupRows,
        '서포터',
        params.playerTierKey,
        params.document,
        recommendedNormalization,
        SUPPORT_SHADOW_PRESET_S1,
        'supportUtility',
        computeSupportUtilityScore(groupRows, comboBaseline, recommendedNormalization, false),
      )
      const s2Score = computeShadowGradeForGroup(
        stats,
        groupRows,
        '서포터',
        params.playerTierKey,
        params.document,
        recommendedNormalization,
        SUPPORT_SHADOW_PRESET_S1,
        'supportUtility',
        computeSupportUtilityScore(groupRows, comboBaseline, recommendedNormalization, true),
      )
      const s1Grade = s1Score != null ? scoreToFineGrade(applySampleConfidence(s1Score, stats.matchCount)) : null
      const s2Grade = s2Score != null ? scoreToFineGrade(applySampleConfidence(s2Score, stats.matchCount)) : null
      supportPairsS1.push({ before: currentScore, after: s1Score, beforeGrade: currentGrade, afterGrade: s1Grade })
      supportPairsS2.push({ before: currentScore, after: s2Score, beforeGrade: currentGrade, afterGrade: s2Grade })
    }
  }

  const sortedRows = [...params.baselineRows].sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt))
  const splitIndex = Math.floor(sortedRows.length * 0.7)
  const trainRows = sortedRows.slice(0, splitIndex)
  const validationRows = sortedRows.slice(splitIndex)
  const trainMeans = trainRows
    .map((row) => row.damageFromPlayer)
    .filter((value): value is number => value != null)
  const validationMeans = validationRows
    .map((row) => row.damageFromPlayer)
    .filter((value): value is number => value != null)
  const trainValidationMeanGap =
    trainMeans.length > 0 && validationMeans.length > 0
      ? Math.abs(
          trainMeans.reduce((sum, value) => sum + value, 0) / trainMeans.length -
            validationMeans.reduce((sum, value) => sum + value, 0) / validationMeans.length,
        )
      : null

  const halfA = sortedRows.filter((_, index) => index % 2 === 0)
  const halfB = sortedRows.filter((_, index) => index % 2 === 1)
  const halfScoresA = halfA.map((row) => computeTankingEfficiency(row.damageFromPlayer, row.deaths) ?? 0)
  const halfScoresB = halfB.map((row) => computeTankingEfficiency(row.damageFromPlayer, row.deaths) ?? 0)
  const splitHalfRankCorrelation = spearman(halfScoresA.slice(0, Math.min(halfScoresA.length, halfScoresB.length)), halfScoresB.slice(0, Math.min(halfScoresA.length, halfScoresB.length)))

  const recoveryComparison = compareStructuredMetricRecovery({
    rows: [...params.playerRows],
    characterStats: params.characterStats,
    playerTier: params.playerTier,
  })

  const profileMap = new Map<string, PlayerMatchRow[]>()
  for (const row of params.playerRows) {
    const profileId = hashUid(row.uid)
    const bucket = profileMap.get(profileId) ?? []
    bucket.push(row)
    profileMap.set(profileId, bucket)
  }
  const profileSpotlight = [...profileMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 1)
    .flatMap(([profileId, rows]) => {
      const characters = [...new Set(rows.map((row) => row.characterNum))]
      return characters.slice(0, 8).map((characterNum) => {
        const before = recoveryComparison.byCharacter.find((entry) => entry.characterNum === characterNum)
        return {
          profileId,
          characterNum,
          currentGrade: before?.afterGrade ?? null,
          shadowGradeT1: null,
          shadowGradeS1: null,
          recoveryDelta:
            before?.beforeScore != null && before.afterScore != null
              ? before.afterScore - before.beforeScore
              : null,
        }
      })
    })

  return {
    generatedAt: new Date().toISOString(),
    baselineSummary: {
      comboCount: Object.keys(params.document.combinations).length,
      rowCount: params.baselineRows.length,
      readinessCounts,
      applicableCombos: [...new Set(applicableCombos)],
      unsupportedCombos: [...new Set(unsupportedCombos)],
    },
    normalizationComparison,
    recommendedNormalization,
    tankerShadow: {
      t1: summarizeGradeChanges(tankPairsT1),
      t2: summarizeGradeChanges(tankPairsT2),
    },
    supporterShadow: {
      s1: summarizeGradeChanges(supportPairsS1),
      s2: summarizeGradeChanges(supportPairsS2),
    },
    recoveryComparison,
    outcomeControlled: {
      tankEfficiencyRankLift: splitHalfRankCorrelation,
      teamRecoverRankLift: pearson(
        params.baselineRows
          .filter((row) => row.role === '서포터')
          .map((row) => row.teamRecover ?? 0),
        params.baselineRows
          .filter((row) => row.role === '서포터')
          .map((row) => (row.victory ? 1 : 0)),
      ),
    },
    stability: {
      trainValidationMeanGap,
      splitHalfRankCorrelation,
      bootstrapBaselineStdDev: null,
    },
    profileSpotlight,
  }
}

export function formatShadowReportText(report: ShadowReportBundle): string {
  const lines = [
    '=== ERCraft Role Metric Shadow (39.11G) ===',
    `generatedAt: ${report.generatedAt}`,
    '',
    '1. 시야·동물 킬 복구',
    `   changed=${report.recoveryComparison.changedCount} unchanged=${report.recoveryComparison.unchangedCount}`,
    `   excludedByCoverage=${report.recoveryComparison.excludedByCoverageCount}`,
    `   meanScoreDelta=${report.recoveryComparison.meanScoreDelta ?? 'null'}`,
    '',
    '2. baseline readiness',
    `   combos=${report.baselineSummary.comboCount} rows=${report.baselineSummary.rowCount}`,
    `   applicable=${report.baselineSummary.applicableCombos.length}`,
    `   unsupported=${report.baselineSummary.unsupportedCombos.length}`,
    '',
    '3. normalization',
    ...report.normalizationComparison.map(
      (entry) =>
        `   ${entry.method}: valid=${entry.validComboCount} invalid=${entry.invalidComboCount} score=${entry.recommendationScore}`,
    ),
    `   recommended=${report.recommendedNormalization}`,
    '',
    '4. tanker shadow',
    `   T1 meanAbsDelta=${report.tankerShadow.t1.meanAbsScoreDelta ?? 'null'}`,
    `   T2 meanAbsDelta=${report.tankerShadow.t2.meanAbsScoreDelta ?? 'null'}`,
    '',
    '5. supporter shadow',
    `   S1 meanAbsDelta=${report.supporterShadow.s1.meanAbsScoreDelta ?? 'null'}`,
    `   S2 meanAbsDelta=${report.supporterShadow.s2.meanAbsScoreDelta ?? 'null'}`,
    '',
    '6. stability',
    `   trainValidationMeanGap=${report.stability.trainValidationMeanGap ?? 'null'}`,
    `   splitHalfRankCorrelation=${report.stability.splitHalfRankCorrelation ?? 'null'}`,
    '',
    '7. 39.11H recommendation',
    '   - viewContribution/monsterKill: structured recovery with 80% coverage gate',
    '   - shadow tanker: T2 shield composite when baseline provisional+',
    '   - shadow supporter: S1 teamRecover exact combo only',
    `   - normalization: ${report.recommendedNormalization}`,
  ]
  return lines.join('\n')
}
