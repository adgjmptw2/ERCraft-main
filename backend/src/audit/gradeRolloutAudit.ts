import { createHash } from 'node:crypto'

import { buildComboKey } from './combatParticipationBaselineBuilder.js'
import { buildWeaponGroupGradeExplanation } from './gradeExplanation.js'
import type {
  RolloutAuditSummary,
  WeaponGroupComparisonRow,
} from './gradeExplanationTypes.js'
import { summarizeGradeChanges } from './roleMetricShadow.js'
import {
  computeLegacyWeaponGroupScoreForAudit,
  computeWeaponGroupScore,
  playerMatchRowToGradeInput,
} from '../services/characterPerformanceGrade/compute.js'
import { lookupCharacterWeaponRole } from '../services/characterPerformanceGrade/baselineStore.js'
import { aggregateWeaponGroupStats } from '../services/characterPerformanceGrade/metrics.js'
import { scoreToFineGrade } from '../services/characterPerformanceGrade/config.js'
import { resolveSupportSubtype } from '../services/characterPerformanceGrade/supportSubtype.js'
import type { PlayerMatchRow } from '../utils/playerMatchDedup.js'
import { rankTierToGradeBaselineKey } from '../services/characterPerformanceGrade/tierKey.js'
import { getRankTierFromRp } from '../utils/rankTier.js'
import { evaluateExactKeyRolloutSafety } from '../services/characterPerformanceGrade/combatRolloutSafety.js'
import { CURRENT_DISPLAY_SEASON } from '../utils/seasonRankTierLadder.js'

export function hashProfileId(uid: string): string {
  return `profile_${createHash('sha256').update(uid).digest('hex').slice(0, 12)}`
}

function coarseBucket(grade: string | null): string | null {
  if (!grade) return null
  return grade.charAt(0)
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower] ?? null
  const weight = index - lower
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight
}

export function buildWeaponGroupComparisonRow(params: {
  uid: string
  characterNum: number
  weaponTypeId: number
  matches: ReturnType<typeof playerMatchRowToGradeInput>[]
  playerTierKey: string
}): WeaponGroupComparisonRow | null {
  const role = lookupCharacterWeaponRole(params.characterNum, params.weaponTypeId)
  const validMatches = params.matches.filter((match): match is NonNullable<typeof match> => match != null)
  if (!role || validMatches.length === 0) return null

  const stats = aggregateWeaponGroupStats(params.characterNum, params.weaponTypeId, validMatches)
  if (!stats) return null

  const legacy = computeLegacyWeaponGroupScoreForAudit(
    stats,
    role,
    params.playerTierKey as never,
  )
  const live = computeWeaponGroupScore(stats, role, params.playerTierKey as never, validMatches)
  const legacyGrade = legacy ? scoreToFineGrade(legacy.rawScore) : null
  const liveGrade = scoreToFineGrade(live.rawScore)
  const scoreDelta = legacy ? live.rawScore - legacy.rawScore : null

  const order = ['D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S-', 'S', 'S+']
  const gradeStepDelta =
    legacyGrade && liveGrade
      ? Math.abs(order.indexOf(liveGrade) - order.indexOf(legacyGrade))
      : null

  const combatMode = live.combatMode ?? 'legacy-k-a-tk'
  return {
    anonymousProfileId: hashProfileId(params.uid),
    characterNum: params.characterNum,
    weaponTypeId: params.weaponTypeId,
    role,
    playerTierKey: params.playerTierKey,
    exactKey: buildComboKey(params.playerTierKey, params.characterNum, params.weaponTypeId),
    matchCount: stats.matchCount,
    legacyRawScore: legacy ? Math.round(legacy.rawScore * 100) / 100 : null,
    liveRawScore: Math.round(live.rawScore * 100) / 100,
    legacyGrade,
    liveGrade,
    scoreDelta: scoreDelta != null ? Math.round(scoreDelta * 100) / 100 : null,
    gradeStepDelta,
    coarseChanged: coarseBucket(legacyGrade) !== coarseBucket(liveGrade),
    combatApplied: combatMode !== 'legacy-k-a-tk',
    combatMode,
    roleMetricMode: live.mode ?? 'legacy',
    combatFallbackReason: live.combatFallbackReason ?? null,
  }
}

export function summarizeRolloutRows(rows: ReadonlyArray<WeaponGroupComparisonRow>): RolloutAuditSummary {
  const applied = rows.filter((row) => row.combatApplied)
  const legacy = rows.filter((row) => !row.combatApplied)
  const pairs = rows.flatMap((row) =>
    row.legacyRawScore != null && row.liveRawScore != null
      ? [
          {
            before: row.legacyRawScore,
            after: row.liveRawScore,
            beforeGrade: row.legacyGrade as never,
            afterGrade: row.liveGrade as never,
          },
        ]
      : [],
  )
  const summary = summarizeGradeChanges(pairs)
  const deltas = pairs.map((pair) => pair.after - pair.before)
  const absDeltas = deltas.map(Math.abs)

  return {
    generatedAt: new Date().toISOString(),
    appliedGroupCount: applied.length,
    legacyGroupCount: legacy.length,
    meanScoreDelta: summary.meanScoreDelta,
    medianScoreDelta: summary.medianScoreDelta,
    meanAbsScoreDelta: summary.meanAbsScoreDelta,
    p90AbsScoreDelta: percentile(absDeltas, 0.9),
    p95AbsScoreDelta: percentile(absDeltas, 0.95),
    maxIncrease: deltas.length > 0 ? Math.max(...deltas) : null,
    maxDecrease: deltas.length > 0 ? Math.min(...deltas) : null,
    maxAbsScoreDelta: summary.maxScoreDelta,
    sameGradeRate:
      pairs.length > 0
        ? pairs.filter((pair) => pair.beforeGrade === pair.afterGrade).length / pairs.length
        : null,
    oneStepChangeRate: summary.oneStepChangeRate,
    twoPlusStepChangeRate: summary.twoPlusStepChangeRate,
    coarseBucketChangeRate: summary.coarseBucketChangeRate,
  }
}

export function groupRowsByRole(rows: ReadonlyArray<WeaponGroupComparisonRow>) {
  const map = new Map<string, WeaponGroupComparisonRow[]>()
  for (const row of rows) {
    const bucket = map.get(row.role) ?? []
    bucket.push(row)
    map.set(row.role, bucket)
  }
  return Object.fromEntries(
    [...map.entries()].map(([role, groupRows]) => [role, summarizeRolloutRows(groupRows)]),
  )
}

export function groupRowsByTier(rows: ReadonlyArray<WeaponGroupComparisonRow>) {
  const map = new Map<string, WeaponGroupComparisonRow[]>()
  for (const row of rows) {
    const bucket = map.get(row.playerTierKey) ?? []
    bucket.push(row)
    map.set(row.playerTierKey, bucket)
  }
  return Object.fromEntries(
    [...map.entries()].map(([tier, groupRows]) => [tier, summarizeRolloutRows(groupRows)]),
  )
}

export function groupRowsByExactKey(rows: ReadonlyArray<WeaponGroupComparisonRow>) {
  const map = new Map<string, WeaponGroupComparisonRow[]>()
  for (const row of rows) {
    const bucket = map.get(row.exactKey) ?? []
    bucket.push(row)
    map.set(row.exactKey, bucket)
  }
  const result: Record<
    string,
    RolloutAuditSummary & {
      groupCount: number
      legacyMean: number | null
      liveMean: number | null
      blocklistPass: boolean
      blocklistReasons: string[]
    }
  > = {}
  for (const [key, groupRows] of map) {
    const summary = summarizeRolloutRows(groupRows)
    const legacyMean =
      groupRows.filter((row) => row.legacyRawScore != null).length > 0
        ? groupRows.reduce((sum, row) => sum + (row.legacyRawScore ?? 0), 0) /
          groupRows.filter((row) => row.legacyRawScore != null).length
        : null
    const liveMean =
      groupRows.filter((row) => row.liveRawScore != null).length > 0
        ? groupRows.reduce((sum, row) => sum + (row.liveRawScore ?? 0), 0) /
          groupRows.filter((row) => row.liveRawScore != null).length
        : null
    const coarseChangeCount = groupRows.filter((row) => row.coarseChanged).length
    const safety = evaluateExactKeyRolloutSafety({
      groupCount: groupRows.length,
      meanScoreDelta: summary.meanScoreDelta,
      meanAbsScoreDelta: summary.meanAbsScoreDelta,
      maxAbsScoreDelta: summary.maxAbsScoreDelta,
      coarseBucketChangeRate: summary.coarseBucketChangeRate,
      twoPlusStepChangeRate: summary.twoPlusStepChangeRate,
      coarseChangeCount,
    })
    result[key] = {
      ...summary,
      groupCount: groupRows.length,
      legacyMean: legacyMean != null ? Math.round(legacyMean * 100) / 100 : null,
      liveMean: liveMean != null ? Math.round(liveMean * 100) / 100 : null,
      blocklistPass: safety.blocklistPass,
      blocklistReasons: safety.reasons,
    }
  }
  return result
}

export function summarizeApplicationBreakdown(rows: ReadonlyArray<WeaponGroupComparisonRow>) {
  const hModes = new Set(['tank-t1', 'tank-t2', 'support-healer-s1'])
  return {
    totalGroups: rows.length,
    hModeGroups: rows.filter((row) => hModes.has(row.roleMetricMode)).length,
    jCombatAppliedGroups: rows.filter((row) => row.combatApplied).length,
    legacyGroups: rows.filter((row) => !row.combatApplied).length,
    presetIncompleteFallbackGroups: rows.filter((row) => row.combatFallbackReason === 'preset-incomplete')
      .length,
    exactKeyBlockedFallbackGroups: rows.filter((row) => row.combatFallbackReason === 'exact-key-blocked')
      .length,
    coverageFallbackGroups: rows.filter((row) => row.combatFallbackReason === 'coverage-insufficient')
      .length,
  }
}

export function auditFinisherOverlap(
  rows: ReadonlyArray<WeaponGroupComparisonRow>,
  buildExplanation: (row: WeaponGroupComparisonRow) => ReturnType<typeof buildWeaponGroupGradeExplanation> | null,
) {
  const dealerRoles = new Set(['평타 딜러', '스증 딜러', '암살자'])
  const samples = rows
    .filter((row) => row.combatApplied && dealerRoles.has(row.role))
    .map((row) => {
      const explanation = buildExplanation(row)
      if (!explanation) return null
      const combat = explanation.roleScore.metrics.find((metric) => metric.metric === 'combatContribution')
      const finisher = explanation.roleScore.metrics.find((metric) => metric.metric === 'finisherShare')
      const damage = explanation.roleScore.metrics.find((metric) => metric.metric === 'damageToPlayer')
      const combatContrib = combat?.weightedContribution ?? 0
      const finisherContrib = finisher?.weightedContribution ?? 0
      const damageContrib = damage?.weightedContribution ?? 0
      const roleScore = explanation.roleScore.score ?? 0
      const combined = combatContrib + finisherContrib
      const ratio = roleScore > 0 ? combined / roleScore : null
      return {
        anonymousProfileId: row.anonymousProfileId,
        exactKey: row.exactKey,
        role: row.role,
        combatWeightedContribution: combatContrib,
        finisherWeightedContribution: finisherContrib,
        damageWeightedContribution: damageContrib,
        combinedWeightedContribution: combined,
        roleScore,
        combinedShareOfRoleScore: ratio,
        reviewNeeded: ratio != null && ratio > 0.3,
        scoreDelta: row.scoreDelta,
        finisherScore: finisher?.normalizedScore ?? null,
        damageScore: damage?.normalizedScore ?? null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)

  const withScores = samples.filter(
    (sample) => sample.finisherScore != null && sample.damageScore != null,
  )
  const highFinisherLowDamage = [...withScores]
    .sort(
      (a, b) =>
        (b.finisherScore! - b.damageScore!) - (a.finisherScore! - a.damageScore!),
    )[0] ?? null
  const lowFinisherHighDamage = [...withScores]
    .sort(
      (a, b) =>
        (a.finisherScore! - a.damageScore!) - (b.finisherScore! - b.damageScore!),
    )[0] ?? null
  const maxKillsDoublePath = [...samples].sort(
    (a, b) => b.combinedWeightedContribution - a.combinedWeightedContribution,
  )[0] ?? null

  return {
    sampleCount: samples.length,
    reviewNeededCount: samples.filter((sample) => sample.reviewNeeded).length,
    maxCombinedShare: samples.reduce(
      (max, sample) => Math.max(max, sample.combinedShareOfRoleScore ?? 0),
      0,
    ),
    maxKillsDoublePath,
    highFinisherLowDamage,
    lowFinisherHighDamage,
    samples: samples
      .sort(
        (a, b) =>
          (b.combinedShareOfRoleScore ?? 0) - (a.combinedShareOfRoleScore ?? 0),
      )
      .slice(0, 50),
  }
}

export function collectProfileWeaponGroups(rows: ReadonlyArray<PlayerMatchRow>) {
  const profileMap = new Map<string, Map<string, PlayerMatchRow[]>>()
  for (const row of rows) {
    const charWeapon = `${row.characterNum}:${row.bestWeapon}`
    const profiles = profileMap.get(row.uid) ?? new Map<string, PlayerMatchRow[]>()
    const bucket = profiles.get(charWeapon) ?? []
    bucket.push(row)
    profiles.set(charWeapon, bucket)
    profileMap.set(row.uid, profiles)
  }
  return profileMap
}

export function buildAllComparisonRows(
  rows: ReadonlyArray<PlayerMatchRow>,
  displaySeasonId: number = CURRENT_DISPLAY_SEASON,
): WeaponGroupComparisonRow[] {
  const profileMap = collectProfileWeaponGroups(rows)
  const comparisonRows: WeaponGroupComparisonRow[] = []

  for (const [uid, weaponGroups] of profileMap) {
    const allRows = [...weaponGroups.values()].flat()
    const latestRow = allRows.reduce((latest, row) =>
      !latest || row.playedAt > latest.playedAt ? row : latest,
    )
    const playerTier = getRankTierFromRp(latestRow?.rpAfter ?? 0, null, displaySeasonId)
    const playerTierKey = rankTierToGradeBaselineKey(playerTier) ?? 'meteorite_plus'

    for (const [key, groupRows] of weaponGroups) {
      const [characterNum, weaponTypeId] = key.split(':').map(Number)
      const matches = groupRows.map((row) => playerMatchRowToGradeInput(row))
      const comparison = buildWeaponGroupComparisonRow({
        uid,
        characterNum: characterNum!,
        weaponTypeId: weaponTypeId!,
        matches,
        playerTierKey,
      })
      if (comparison) comparisonRows.push(comparison)
    }
  }

  return comparisonRows
}

export function pickRepresentativeByRole(
  rows: ReadonlyArray<WeaponGroupComparisonRow>,
  buildExplanation: (row: WeaponGroupComparisonRow) => ReturnType<typeof buildWeaponGroupGradeExplanation> | null,
) {
  const roles = [
    '평타 딜러',
    '스증 딜러',
    '암살자',
    '평타 브루저',
    '스증 브루저',
    '탱커',
    'utility support',
    'healer support',
  ]
  const result: Record<string, unknown> = {}
  for (const roleLabel of roles) {
    let candidates = rows
    if (roleLabel === 'utility support') {
      candidates = rows.filter(
        (row) =>
          row.role === '서포터' &&
          resolveSupportSubtype(row.characterNum, row.weaponTypeId, '서포터') === 'utility',
      )
    } else if (roleLabel === 'healer support') {
      candidates = rows.filter(
        (row) =>
          row.role === '서포터' &&
          resolveSupportSubtype(row.characterNum, row.weaponTypeId, '서포터') === 'healer',
      )
    } else {
      candidates = rows.filter((row) => row.role === roleLabel)
    }
    const applied = candidates.filter((row) => row.combatApplied)
    const pick = (applied[0] ?? candidates[0]) ?? null
    if (!pick) {
      result[roleLabel] = { status: 'no-data' }
      continue
    }
    const explanation = buildExplanation(pick)
    const metrics = explanation?.roleScore.metrics ?? []
    const sorted = [...metrics].sort(
      (a, b) => (b.weightedContribution ?? 0) - (a.weightedContribution ?? 0),
    )
    result[roleLabel] = {
      status: pick.combatApplied ? 'combat-applied' : 'legacy-or-unsupported',
      anonymousProfileId: pick.anonymousProfileId,
      exactKey: pick.exactKey,
      matchCount: pick.matchCount,
      combatMode: pick.combatMode,
      highestContribution: sorted[0] ?? null,
      lowestContribution: sorted[sorted.length - 1] ?? null,
      explanation,
    }
  }
  return result
}

export function formatRolloutAuditReport(summary: RolloutAuditSummary): string {
  return [
    '=== ERCraft Grade Rollout Audit (39.11K) ===',
    `generatedAt: ${summary.generatedAt}`,
    '',
    `appliedGroups=${summary.appliedGroupCount} legacyGroups=${summary.legacyGroupCount}`,
    `meanDelta=${summary.meanScoreDelta?.toFixed(3) ?? 'null'}`,
    `medianDelta=${summary.medianScoreDelta?.toFixed(3) ?? 'null'}`,
    `meanAbsDelta=${summary.meanAbsScoreDelta?.toFixed(3) ?? 'null'}`,
    `p90AbsDelta=${summary.p90AbsScoreDelta?.toFixed(3) ?? 'null'}`,
    `p95AbsDelta=${summary.p95AbsScoreDelta?.toFixed(3) ?? 'null'}`,
    `maxIncrease=${summary.maxIncrease?.toFixed(3) ?? 'null'}`,
    `maxDecrease=${summary.maxDecrease?.toFixed(3) ?? 'null'}`,
    `sameGradeRate=${summary.sameGradeRate != null ? (summary.sameGradeRate * 100).toFixed(1) + '%' : 'null'}`,
    `oneStepRate=${summary.oneStepChangeRate != null ? (summary.oneStepChangeRate * 100).toFixed(1) + '%' : 'null'}`,
    `twoPlusRate=${summary.twoPlusStepChangeRate != null ? (summary.twoPlusStepChangeRate * 100).toFixed(1) + '%' : 'null'}`,
    `coarseRate=${summary.coarseBucketChangeRate != null ? (summary.coarseBucketChangeRate * 100).toFixed(1) + '%' : 'null'}`,
    '',
  ].join('\n')
}
