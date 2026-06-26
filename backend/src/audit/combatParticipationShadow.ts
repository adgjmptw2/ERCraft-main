import type { PlayerMatchRow } from '../utils/playerMatchDedup.js'
import type { CharacterFineGrade, CharacterGradeRole, GradeBaselineTierKey } from '../services/characterPerformanceGrade/config.js'
import {
  OUTCOME_SCORE_WEIGHT,
  ROLE_PRESET_WEIGHTS,
  ROLE_SCORE_WEIGHT,
  applySampleConfidence,
  scoreToFineGrade,
} from '../services/characterPerformanceGrade/config.js'
import {
  aggregateWeaponGroupStats,
  clamp,
  OUTCOME_METRIC_DEFINITIONS,
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
import { applyCharacterPerformanceGrades } from '../services/characterPerformanceGrade/compute.js'
import type { SeasonCharacterAggregateContract } from '../contracts/player.js'
import type { RankTier } from '../utils/rankTier.js'
import {
  computeParticipationAssistWeighted,
  computeParticipationRaw,
  computeFinisherShare,
} from '../services/characterPerformanceGrade/combatParticipation.js'
import {
  buildCombatShadowPresetC0,
  buildCombatShadowPresetC1,
  buildCombatShadowPresetC2,
  buildCombatShadowPresetC3,
  type CombatShadowPresetId,
} from '../services/characterPerformanceGrade/combatParticipationConfig.js'
import { summarizeGradeChanges, type GradeChangeSummary } from './roleMetricShadow.js'
import {
  hashUid,
  isParticipationShadowReady,
  lookupParticipationComboBaseline,
  type CombatParticipationBaselineDocument,
  type CombatParticipationRow,
  toCombatParticipationRow,
} from './combatParticipationBaselineBuilder.js'
import { ROLE_METRIC_STABILITY_CONFIG } from './roleMetricStabilityConfig.js'
import { NORMALIZATION_EPSILON } from '../services/characterPerformanceGrade/config.js'

export type ParticipationNormalizationMethod =
  | 'winsorized_mean_p90'
  | 'median_p90'
  | 'percentile_rank'

export interface FieldSemanticsReport {
  participantRowCount: number
  uniqueGameCount: number
  playerKillLeTeamKillRate: number | null
  playerAssistantLeTeamKillRate: number | null
  sumKaOverTeamKillRate: number | null
  teamKillZeroRate: number | null
  /** gameId-only 일치율은 다팀 경기에서 무의미하므로 사용하지 않음 */
  teamKillConsistencyVerification:
    | 'indeterminate-no-team-number-in-participant-rows'
    | 'verified-by-game-and-team'
    | null
  teamKillConsistentWithinGameAndTeamRate: number | null
  participationOverOneRate: number | null
  victoryAvgTeamKill: number | null
  defeatAvgTeamKill: number | null
  fieldMapping: {
    playerKill: 'PlayerMatch.kills'
    playerAssistant: 'PlayerMatch.assists'
    teamKill: 'PlayerMatch.teamKills'
    gameRank: 'PlayerMatch.placement'
    totalFieldKill: 'not-persisted-in-PlayerMatch'
    teamNumber: 'MatchDetail-only-not-PlayerMatch'
  }
}

export interface CombatParticipationReportBundle {
  generatedAt: string
  fieldSemantics: FieldSemanticsReport
  distribution: Record<string, unknown>
  correlation: Record<string, unknown>
  shadowResults: Record<string, unknown>
  recommendedParticipationFormula: string
  recommendedFinisherRoles: string[]
  recommendedNormalization: ParticipationNormalizationMethod
  recommendedShadowPreset: CombatShadowPresetId
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length
  let num = 0
  let denX = 0
  let denY = 0
  for (let index = 0; index < xs.length; index += 1) {
    const dx = (xs[index] ?? 0) - meanX
    const dy = (ys[index] ?? 0) - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  if (denX === 0 || denY === 0) return null
  return num / Math.sqrt(denX * denY)
}

export function analyzeFieldSemantics(rows: ReadonlyArray<CombatParticipationRow>): FieldSemanticsReport {
  let pkLeTk = 0
  let paLeTk = 0
  let sumOver = 0
  let teamZero = 0
  let overOne = 0
  let valid = 0
  const victoryTeamKills: number[] = []
  const defeatTeamKills: number[] = []

  for (const row of rows) {
    const pk = row.playerKill
    const pa = row.playerAssistant
    const tk = row.teamKill
    if (pk == null || pa == null || tk == null) continue
    valid += 1
    if (pk <= tk) pkLeTk += 1
    if (pa <= tk) paLeTk += 1
    if (tk > 0 && (pk + pa) / tk > 1) sumOver += 1
    if (tk <= 0) teamZero += 1
    const raw = computeParticipationRaw({ playerKill: pk, playerAssistant: pa, teamKill: tk })
    if (raw != null && raw > 1) overOne += 1
    if (row.victory === true) victoryTeamKills.push(tk)
    if (row.victory === false) defeatTeamKills.push(tk)
  }

  const byGame = new Map<string, Set<number>>()
  for (const row of rows) {
    if (row.teamKill == null) continue
    const bucket = byGame.get(row.gameId) ?? new Set<number>()
    bucket.add(row.teamKill)
    byGame.set(row.gameId, bucket)
  }

  const avg = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null

  return {
    participantRowCount: rows.length,
    uniqueGameCount: new Set(rows.map((row) => row.gameId)).size,
    playerKillLeTeamKillRate: valid > 0 ? pkLeTk / valid : null,
    playerAssistantLeTeamKillRate: valid > 0 ? paLeTk / valid : null,
    sumKaOverTeamKillRate: valid > 0 ? sumOver / valid : null,
    teamKillZeroRate: valid > 0 ? teamZero / valid : null,
    teamKillConsistencyVerification: 'indeterminate-no-team-number-in-participant-rows',
    teamKillConsistentWithinGameAndTeamRate: null,
    participationOverOneRate: valid > 0 ? overOne / valid : null,
    victoryAvgTeamKill: avg(victoryTeamKills),
    defeatAvgTeamKill: avg(defeatTeamKills),
    fieldMapping: {
      playerKill: 'PlayerMatch.kills',
      playerAssistant: 'PlayerMatch.assists',
      teamKill: 'PlayerMatch.teamKills',
      gameRank: 'PlayerMatch.placement',
      totalFieldKill: 'not-persisted-in-PlayerMatch',
      teamNumber: 'MatchDetail-only-not-PlayerMatch',
    },
  }
}

export function analyzeTeamKillConsistencyByTeam(
  rows: ReadonlyArray<{ gameId: string; teamNumber: number | null; teamKill: number | null }>,
): {
  verification: 'verified-by-game-and-team' | 'indeterminate-no-team-number-in-participant-rows'
  consistentWithinGameAndTeamRate: number | null
  sampledGroups: number
} {
  const withTeam = rows.filter((row) => row.teamNumber != null && row.teamKill != null)
  if (withTeam.length === 0) {
    return {
      verification: 'indeterminate-no-team-number-in-participant-rows',
      consistentWithinGameAndTeamRate: null,
      sampledGroups: 0,
    }
  }

  const byGameTeam = new Map<string, Set<number>>()
  for (const row of withTeam) {
    const key = `${row.gameId}:${row.teamNumber}`
    const bucket = byGameTeam.get(key) ?? new Set<number>()
    bucket.add(row.teamKill!)
    byGameTeam.set(key, bucket)
  }

  let consistent = 0
  for (const values of byGameTeam.values()) {
    if (values.size <= 1) consistent += 1
  }

  return {
    verification: 'verified-by-game-and-team',
    consistentWithinGameAndTeamRate:
      byGameTeam.size > 0 ? consistent / byGameTeam.size : null,
    sampledGroups: byGameTeam.size,
  }
}

function normalizeParticipationScore(
  playerValue: number | null,
  stat: {
    p95WinsorizedMean: number | null
    p90: number | null
    median: number | null
    p95: number | null
  },
  method: ParticipationNormalizationMethod,
  allValues: number[],
): number | null {
  if (playerValue == null || !Number.isFinite(playerValue)) return null
  if (method === 'percentile_rank') {
    if (allValues.length === 0) return null
    const sorted = [...allValues].sort((a, b) => a - b)
    const rank = sorted.filter((value) => value <= playerValue).length
    return clamp(20 + (rank / sorted.length) * 80, 20, 100)
  }
  const baseline = method === 'median_p90' ? stat.median : stat.p95WinsorizedMean
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
  const relativePerformance = (playerValue - baseline) / Math.max(Math.abs(baseline), NORMALIZATION_EPSILON)
  if (relativePerformance <= 0) return clamp(65 + 45 * relativePerformance, 20, 65)
  const progress = (playerValue - baseline) / (upperAnchor - baseline)
  return clamp(65 + 23 * progress, 65, 100)
}

function averageParticipation(
  matches: ReadonlyArray<MatchGradeInput>,
  assistWeight: number,
): number | null {
  const values = matches.flatMap((match) => {
    const value = computeParticipationAssistWeighted(
      {
        playerKill: match.kills,
        playerAssistant: match.assists,
        teamKill: match.teamKills,
      },
      assistWeight,
    )
    return value == null ? [] : [value]
  })
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function averageFinisher(matches: ReadonlyArray<MatchGradeInput>): number | null {
  const values = matches.flatMap((match) => {
    const value = computeFinisherShare({
      playerKill: match.kills,
      playerAssistant: match.assists,
      teamKill: match.teamKills,
    })
    return value == null ? [] : [value]
  })
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
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
        (metrics) => definition.readBaseline(baseline.metrics),
      ),
      higherBetter: definition.higherBetter,
      metricKey: definition.tierOnlyKey,
    })
    if (normalized.score == null) return null
    return { score: normalized.score, weight: definition.weight }
  }).filter((entry): entry is { score: number; weight: number } => entry != null)
  return weightedScore(entries)
}

function computeCombatShadowRoleScore(params: {
  stats: WeaponGroupStats
  matches: MatchGradeInput[]
  role: CharacterGradeRole
  playerTierKey: GradeBaselineTierKey
  preset: Record<string, number>
  participationDocument: CombatParticipationBaselineDocument
  normalization: ParticipationNormalizationMethod
}): { score: number | null; unsupportedReason: string | null } {
  const combo = lookupParticipationComboBaseline(
    params.participationDocument,
    params.playerTierKey,
    params.stats.characterNum,
    params.stats.weaponTypeId,
  )
  const participationStat = combo?.metrics['participationAssistWeighted_0.7']
  const finisherStat = combo?.metrics.finisherShare
  const participationValues =
    combo != null
      ? params.matches.flatMap((match) => {
          const value = computeParticipationAssistWeighted(
            {
              playerKill: match.kills,
              playerAssistant: match.assists,
              teamKill: match.teamKills,
            },
            0.7,
          )
          return value == null ? [] : [value]
        })
      : []

  const entries: Array<{ score: number; weight: number }> = []
  for (const [key, weight] of Object.entries(params.preset)) {
    if (weight <= 0) continue
    if (key === 'combatParticipation') {
      if (!participationStat || !isParticipationShadowReady(participationStat.readiness)) {
        return { score: null, unsupportedReason: 'participation-baseline-unready' }
      }
      const avg = averageParticipation(params.matches, 0.7)
      const score = normalizeParticipationScore(
        avg,
        participationStat,
        params.normalization,
        participationValues,
      )
      if (score == null) return { score: null, unsupportedReason: 'participation-normalization-failed' }
      entries.push({ score, weight })
      continue
    }
    if (key === 'finisherShare') {
      if (!finisherStat || !isParticipationShadowReady(finisherStat.readiness)) {
        return { score: null, unsupportedReason: 'finisher-baseline-unready' }
      }
      const avg = averageFinisher(params.matches)
      const finisherValues = params.matches.flatMap((match) => {
        const value = computeFinisherShare({
          playerKill: match.kills,
          playerAssistant: match.assists,
          teamKill: match.teamKills,
        })
        return value == null ? [] : [value]
      })
      const score = normalizeParticipationScore(
        avg,
        finisherStat,
        params.normalization,
        finisherValues,
      )
      if (score == null) return { score: null, unsupportedReason: 'finisher-normalization-failed' }
      entries.push({ score, weight })
      continue
    }
    if (key === 'tankingUtility' || key === 'supportUtility') {
      return { score: null, unsupportedReason: 'utility-not-in-39.11I-shadow' }
    }
    const score = scoreExistingRoleMetric(params.stats, params.role, params.playerTierKey, key)
    if (score == null) continue
    entries.push({ score, weight })
  }
  return { score: weightedScore(entries), unsupportedReason: null }
}

function buildPreset(
  presetId: CombatShadowPresetId,
  role: CharacterGradeRole,
  characterNum: number,
  weaponTypeId: number,
): { preset: Record<string, number> | null; unsupportedReason: string | null } {
  switch (presetId) {
    case 'C0':
      return { preset: buildCombatShadowPresetC0(role), unsupportedReason: null }
    case 'C1':
      return { preset: buildCombatShadowPresetC1(role), unsupportedReason: null }
    case 'C2':
      return buildCombatShadowPresetC2(role, characterNum, weaponTypeId)
    case 'C3':
      return buildCombatShadowPresetC3(role, characterNum, weaponTypeId)
    default:
      return { preset: null, unsupportedReason: 'unknown-preset' }
  }
}

export function buildCombatParticipationReport(params: {
  rows: PlayerMatchRow[]
  participationDocument: CombatParticipationBaselineDocument
  playerTierKey: GradeBaselineTierKey
}): CombatParticipationReportBundle {
  const combatRows = params.rows
    .map((row) =>
      toCombatParticipationRow({
        gameId: row.gameId,
        uid: row.uid,
        characterNum: row.characterNum,
        bestWeapon: row.bestWeapon,
        rpAfter: row.rpAfter,
        displaySeasonId: row.displaySeasonId,
        playedAt: row.playedAt,
        kills: row.kills,
        assists: row.assists,
        teamKills: row.teamKills,
        damageToPlayer: row.damageToPlayer,
        victory: row.victory,
        placement: row.placement,
      }),
    )
    .filter((row): row is CombatParticipationRow => row != null)

  const fieldSemantics = analyzeFieldSemantics(combatRows)
  const assistCandidates = [0.5, 0.7, 1.0] as const
  const assistComparison = assistCandidates.map((weight) => {
    const values = combatRows.flatMap((row) => {
      const value = computeParticipationAssistWeighted(
        {
          playerKill: row.playerKill,
          playerAssistant: row.playerAssistant,
          teamKill: row.teamKill,
        },
        weight,
      )
      return value == null ? [] : [value]
    })
    const overOne = values.filter((value) => value > 1).length
    return {
      assistWeight: weight,
      validCount: values.length,
      overOneRate: values.length > 0 ? overOne / values.length : null,
      mean: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    }
  })

  const canonicalComboCount = new Set(
    combatRows.map((row) => `${row.characterNum}:${row.weaponTypeId}`),
  ).size

  const weaponGroups = new Map<string, { matches: MatchGradeInput[]; characterNum: number; weaponTypeId: number }>()
  for (const row of params.rows) {
    const input = playerMatchRowToGradeInput(row)
    if (!input?.weaponTypeId) continue
    const key = `${row.characterNum}:${input.weaponTypeId}`
    const bucket = weaponGroups.get(key) ?? {
      matches: [],
      characterNum: row.characterNum,
      weaponTypeId: input.weaponTypeId,
    }
    bucket.matches.push(input)
    weaponGroups.set(key, bucket)
  }

  const presetIds: CombatShadowPresetId[] = ['C0', 'C1', 'C2', 'C3']
  const normalizationMethods: ParticipationNormalizationMethod[] = [
    'winsorized_mean_p90',
    'median_p90',
    'percentile_rank',
  ]
  const shadowByPreset: Record<string, GradeChangeSummary> = {}
  const pairsByPreset: Record<string, Array<{ before: number; after: number; beforeGrade: CharacterFineGrade | null; afterGrade: CharacterFineGrade | null }>> = {}

  for (const presetId of presetIds) {
    const pairs: Array<{ before: number; after: number; beforeGrade: CharacterFineGrade | null; afterGrade: CharacterFineGrade | null }> = []
    for (const group of weaponGroups.values()) {
      const role = lookupCharacterWeaponRole(group.characterNum, group.weaponTypeId)
      if (!role) continue
      const stats = aggregateWeaponGroupStats(group.characterNum, group.weaponTypeId, group.matches)
      if (!stats) continue
      const legacyPreset = buildCombatShadowPresetC0(role)
      const legacyRoleEntries = Object.entries(legacyPreset).flatMap(([key, weight]) => {
        if (weight <= 0) return []
        const score = scoreExistingRoleMetric(stats, role, params.playerTierKey, key)
        return score == null ? [] : [{ score, weight }]
      })
      const legacyRoleScore = weightedScore(legacyRoleEntries)
      const outcomeScore = computeOutcomeScore(stats, params.playerTierKey)
      if (legacyRoleScore == null || outcomeScore == null) continue
      const before = outcomeScore * OUTCOME_SCORE_WEIGHT + legacyRoleScore * ROLE_SCORE_WEIGHT
      const beforeGrade = scoreToFineGrade(applySampleConfidence(before, stats.matchCount))

      const built = buildPreset(presetId, role, group.characterNum, group.weaponTypeId)
      if (!built.preset) continue
      const shadowRole = computeCombatShadowRoleScore({
        stats,
        matches: group.matches,
        role,
        playerTierKey: params.playerTierKey,
        preset: built.preset,
        participationDocument: params.participationDocument,
        normalization: 'winsorized_mean_p90',
      })
      if (shadowRole.score == null) continue
      const after = outcomeScore * OUTCOME_SCORE_WEIGHT + shadowRole.score * ROLE_SCORE_WEIGHT
      const afterGrade = scoreToFineGrade(applySampleConfidence(after, stats.matchCount))
      pairs.push({ before, after, beforeGrade, afterGrade })
    }
    pairsByPreset[presetId] = pairs
    shadowByPreset[presetId] = summarizeGradeChanges(pairs)
  }

  const highFinisherLowDamage = combatRows.filter((row) => {
    const finisher = computeFinisherShare({
      playerKill: row.playerKill,
      playerAssistant: row.playerAssistant,
      teamKill: row.teamKill,
    })
    const damage = row.damageToPlayer ?? 0
    return finisher != null && finisher >= 0.5 && damage < 5000
  }).length

  const lowFinisherHighDamage = combatRows.filter((row) => {
    const finisher = computeFinisherShare({
      playerKill: row.playerKill,
      playerAssistant: row.playerAssistant,
      teamKill: row.teamKill,
    })
    const damage = row.damageToPlayer ?? 0
    return finisher != null && finisher <= 0.2 && damage >= 15000
  }).length

  const pairedParticipationDamage = combatRows.flatMap((row) => {
    const participation = computeParticipationAssistWeighted(
      {
        playerKill: row.playerKill,
        playerAssistant: row.playerAssistant,
        teamKill: row.teamKill,
      },
      0.7,
    )
    if (participation == null || row.damageToPlayer == null) return []
    return [{ participation, damage: row.damageToPlayer }]
  })
  const pairedFinisherDamage = combatRows.flatMap((row) => {
    const finisher = computeFinisherShare({
      playerKill: row.playerKill,
      playerAssistant: row.playerAssistant,
      teamKill: row.teamKill,
    })
    if (finisher == null || row.damageToPlayer == null) return []
    return [{ finisher, damage: row.damageToPlayer }]
  })

  const correlation = {
    playerKill_vs_playerAssistant: pearson(
      combatRows.map((row) => row.playerKill ?? 0),
      combatRows.map((row) => row.playerAssistant ?? 0),
    ),
    playerKill_vs_teamKill: pearson(
      combatRows.map((row) => row.playerKill ?? 0),
      combatRows.map((row) => row.teamKill ?? 0),
    ),
    playerAssistant_vs_teamKill: pearson(
      combatRows.map((row) => row.playerAssistant ?? 0),
      combatRows.map((row) => row.teamKill ?? 0),
    ),
    participation_vs_damageToPlayer: pearson(
      pairedParticipationDamage.map((entry) => entry.participation),
      pairedParticipationDamage.map((entry) => entry.damage),
    ),
    finisherShare_vs_damageToPlayer: pearson(
      pairedFinisherDamage.map((entry) => entry.finisher),
      pairedFinisherDamage.map((entry) => entry.damage),
    ),
    legacyKatkWeightShare: Object.fromEntries(
      Object.entries(ROLE_PRESET_WEIGHTS).map(([role, weights]) => [
        role,
        (weights.playerKill + weights.playerAssistant + weights.teamKill) / 100,
      ]),
    ),
  }

  return {
    generatedAt: new Date().toISOString(),
    fieldSemantics,
    distribution: {
      canonicalCharacterWeaponComboCount: canonicalComboCount,
      exactCombinationBaselineKeyCount: params.participationDocument.exactCombinationCount,
      dbWeaponGroupCount: weaponGroups.size,
      assistWeightComparison: assistComparison,
      highFinisherLowDamageCount: highFinisherLowDamage,
      lowFinisherHighDamageCount: lowFinisherHighDamage,
      normalizationMethodsCompared: normalizationMethods,
    },
    correlation,
    shadowResults: {
      byPreset: shadowByPreset,
      sampleCounts: Object.fromEntries(
        presetIds.map((presetId) => [presetId, pairsByPreset[presetId]?.length ?? 0]),
      ),
    },
    recommendedParticipationFormula: 'participationAssistWeighted_0.7 with teamKill<=0 excluded (null)',
    recommendedFinisherRoles: ['암살자', '평타 딜러', '스증 딜러'],
    recommendedNormalization: 'winsorized_mean_p90',
    recommendedShadowPreset: 'C2',
  }
}

export function formatCombatParticipationReportText(report: CombatParticipationReportBundle): string {
  const lines = [
    '=== ERCraft Combat Participation Shadow (39.11I) ===',
    `generatedAt: ${report.generatedAt}`,
    '',
    '1. field semantics',
    `   participantRows=${report.fieldSemantics.participantRowCount}`,
    `   uniqueGames=${report.fieldSemantics.uniqueGameCount}`,
    `   playerKill<=teamKill=${report.fieldSemantics.playerKillLeTeamKillRate?.toFixed(4) ?? 'null'}`,
    `   (K+A)/TK>1=${report.fieldSemantics.sumKaOverTeamKillRate?.toFixed(4) ?? 'null'}`,
    `   teamKillZero=${report.fieldSemantics.teamKillZeroRate?.toFixed(4) ?? 'null'}`,
    `   participation>1=${report.fieldSemantics.participationOverOneRate?.toFixed(4) ?? 'null'}`,
    '',
    '2. assist weight comparison',
    ...((report.distribution.assistWeightComparison as Array<{ assistWeight: number; overOneRate: number | null }>) ?? []).map(
      (entry) => `   assist=${entry.assistWeight} overOne=${entry.overOneRate?.toFixed(4) ?? 'null'}`,
    ),
    '',
    '3. shadow preset deltas',
    ...Object.entries(
      (report.shadowResults as { byPreset: Record<string, GradeChangeSummary> }).byPreset,
    ).map(
      ([presetId, summary]) =>
        `   ${presetId} meanAbsDelta=${summary.meanAbsScoreDelta?.toFixed(3) ?? 'null'} twoPlus=${((summary.twoPlusStepChangeRate ?? 0) * 100).toFixed(1)}%`,
    ),
    '',
    '4. recommendation',
    `   participation=${report.recommendedParticipationFormula}`,
    `   normalization=${report.recommendedNormalization}`,
    `   preset=${report.recommendedShadowPreset}`,
    `   finisherRoles=${report.recommendedFinisherRoles.join(', ')}`,
  ]
  return `${lines.join('\n')}\n`
}

export function verifyLiveGradesUnchanged(params: {
  rows: PlayerMatchRow[]
  characterStats: SeasonCharacterAggregateContract[]
  playerTier: RankTier | null
}): boolean {
  const first = applyCharacterPerformanceGrades({
    rows: params.rows,
    characterStats: params.characterStats,
    metaStatus: 'complete',
    playerTier: params.playerTier,
  })
  const second = applyCharacterPerformanceGrades({
    rows: params.rows,
    characterStats: params.characterStats,
    metaStatus: 'complete',
    playerTier: params.playerTier,
  })
  return JSON.stringify(first) === JSON.stringify(second)
}

export { hashUid }
