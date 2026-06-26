#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { computeMatchPerformanceGrade } from '../dist/services/characterPerformanceGrade/compute.js'
import {
  lookupBaselineMetricsAtTier,
  lookupCharacterWeaponRole,
} from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { normalizeRankTier } from '../dist/utils/rankTier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const repoRoot = join(backendRoot, '..')
const outputDir = join(repoRoot, 'reports', 'team-luck-residual')
const outputJson = join(outputDir, 'evaluation-report.json')
const outputText = join(outputDir, 'evaluation-report.txt')

const prisma = new PrismaClient()

const BASELINE_VERSION = 'team-luck-residual-baselines.shadow.v1'
const MIN_SAMPLE_COUNT = 30
const SHRINKAGE_K = 30
const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4']

const REQUIRED_METRIC_FIELDS = [
  'rpAfter',
  'placement',
  'kills',
  'deaths',
  'assists',
  'teamKills',
  'damageToPlayer',
  'gameDuration',
  'bestWeapon',
]

const METRIC_NAMES = [
  'damageToPlayerPerMinute',
  'killsPerMinute',
  'assistsPerMinute',
  'teamKillsPerMinute',
  'deathsPerMinute',
  'viewContributionPerMinute',
  'monsterKillPerMinute',
  'damageFromPlayerPerMinute',
  'shieldDamageOffsetFromPlayerPerMinute',
  'teamRecoverPerMinute',
  'rolePerformanceScore',
]

function isFinitePositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function placementBucket(placement) {
  if (!isFiniteNumber(placement) || placement <= 0) return 'unknown-place'
  if (placement === 1) return 'place-1'
  if (placement <= 3) return 'place-2-3'
  if (placement <= 6) return 'place-4-6'
  return 'place-7-plus'
}

function durationBucket(seconds) {
  if (!isFinitePositiveNumber(seconds)) return 'unknown-duration'
  const minutes = seconds / 60
  if (minutes < 15) return 'duration-lt-15m'
  if (minutes < 20) return 'duration-15-20m'
  if (minutes < 25) return 'duration-20-25m'
  if (minutes < 30) return 'duration-25-30m'
  return 'duration-30m-plus'
}

function missingMetricFields(row) {
  const missing = []
  for (const field of REQUIRED_METRIC_FIELDS) {
    const value = row[field]
    if (value === null || value === undefined) {
      missing.push(field)
      continue
    }
    if (field === 'rpAfter' || field === 'gameDuration' || field === 'bestWeapon') {
      if (!isFinitePositiveNumber(value)) missing.push(field)
    } else if (!isFiniteNumber(value)) {
      missing.push(field)
    }
  }
  return missing
}

function metricPerMinute(value, minutes) {
  return isFiniteNumber(value) && minutes > 0 ? value / minutes : null
}

function keyString(parts) {
  return parts.filter((part) => part != null).join('|')
}

function levelKey(level, row) {
  const base = [
    `season:${row.displaySeasonId}`,
    `mode:${row.gameMode}`,
    `place:${row.placeBucket}`,
    `duration:${row.durationBucket}`,
  ]
  if (level === 'L4') return keyString(base)
  if (level === 'L3') return keyString([...base, `role:${row.role}`])
  if (level === 'L2') return keyString([...base, `role:${row.role}`, `tier:${row.tierKey}`])
  if (level === 'L1') {
    return keyString([
      ...base,
      `role:${row.role}`,
      `tier:${row.tierKey}`,
      `character:${row.characterNum}`,
    ])
  }
  return keyString([
    ...base,
    `role:${row.role}`,
    `tier:${row.tierKey}`,
    `character:${row.characterNum}`,
    `weapon:${row.weaponTypeId}`,
  ])
}

function createAccumulator() {
  return {
    count: 0,
    sums: Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])),
    counts: Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])),
  }
}

function cloneAccumulator(acc) {
  return {
    count: acc.count,
    sums: { ...acc.sums },
    counts: { ...acc.counts },
  }
}

function addToAccumulator(acc, row, direction = 1) {
  acc.count += direction
  for (const name of METRIC_NAMES) {
    const value = row.metrics[name]
    if (value == null || !Number.isFinite(value)) continue
    acc.sums[name] += value * direction
    acc.counts[name] += direction
  }
}

function meanMetrics(acc) {
  const result = {}
  for (const name of METRIC_NAMES) {
    result[name] = acc.counts[name] > 0 ? acc.sums[name] / acc.counts[name] : null
  }
  return result
}

function buildGroups(rows) {
  const levels = {
    L0: new Map(),
    L1: new Map(),
    L2: new Map(),
    L3: new Map(),
    L4: new Map(),
  }
  for (const row of rows) {
    for (const level of LEVELS) {
      const key = levelKey(level, row)
      const group = levels[level].get(key) ?? createAccumulator()
      addToAccumulator(group, row)
      levels[level].set(key, group)
    }
  }
  return levels
}

function accumulatorWithExcluded(grouped, level, row, excludedRows) {
  const key = levelKey(level, row)
  const original = grouped[level].get(key) ?? createAccumulator()
  const adjusted = cloneAccumulator(original)
  for (const excluded of excludedRows) {
    if (levelKey(level, excluded) === key) addToAccumulator(adjusted, excluded, -1)
  }
  adjusted.count = Math.max(0, adjusted.count)
  for (const name of METRIC_NAMES) {
    adjusted.counts[name] = Math.max(0, adjusted.counts[name])
    if (adjusted.counts[name] === 0) adjusted.sums[name] = 0
  }
  return adjusted
}

function pickFallbackLevel(levelCounts, startLevel = 'L0') {
  const startIndex = LEVELS.indexOf(startLevel)
  for (const level of LEVELS.slice(startIndex)) {
    if ((levelCounts[level] ?? 0) >= MIN_SAMPLE_COUNT) return level
  }
  return 'L4'
}

function shrinkMetric(levelValue, parentValue, n) {
  if (n <= 0) return parentValue
  if (levelValue == null) return parentValue
  if (parentValue == null) return levelValue
  return (n / (n + SHRINKAGE_K)) * levelValue + (SHRINKAGE_K / (n + SHRINKAGE_K)) * parentValue
}

function resolveExpectedMetrics(row, grouped, excludedRows = [], startLevel = 'L0') {
  const means = {}
  const counts = {}
  for (const level of LEVELS) {
    const group =
      excludedRows.length > 0
        ? accumulatorWithExcluded(grouped, level, row, excludedRows)
        : grouped[level].get(levelKey(level, row)) ?? createAccumulator()
    means[level] = meanMetrics(group)
    counts[level] = group.count
  }

  const startIndex = LEVELS.indexOf(startLevel)
  const resolved = {}
  for (const metric of METRIC_NAMES) {
    let value = means.L4[metric]
    for (const level of ['L3', 'L2', 'L1', 'L0']) {
      if (LEVELS.indexOf(level) < startIndex) continue
      const n = counts[level] ?? 0
      value =
        n >= MIN_SAMPLE_COUNT
          ? means[level][metric]
          : shrinkMetric(means[level][metric], value, n)
    }
    resolved[metric] = round(value)
  }

  return {
    expected: resolved,
    levelSampleCounts: counts,
    fallbackLevel: pickFallbackLevel(counts, startLevel),
  }
}

function valuesStats(values) {
  const clean = values.filter((value) => value != null && Number.isFinite(value)).sort((a, b) => a - b)
  if (clean.length === 0) {
    return {
      count: 0,
      mean: null,
      median: null,
      standardDeviation: null,
      p10: null,
      p25: null,
      p30: null,
      p70: null,
      p75: null,
      p90: null,
    }
  }
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / clean.length
  return {
    count: clean.length,
    mean: round(mean),
    median: round(percentile(clean, 0.5)),
    standardDeviation: round(Math.sqrt(variance)),
    p10: round(percentile(clean, 0.1)),
    p25: round(percentile(clean, 0.25)),
    p30: round(percentile(clean, 0.3)),
    p70: round(percentile(clean, 0.7)),
    p75: round(percentile(clean, 0.75)),
    p90: round(percentile(clean, 0.9)),
  }
}

function deltaStabilityStats(values, fallbackChanges, rowCount) {
  const clean = values.filter((value) => value != null && Number.isFinite(value))
  const abs = clean.map((value) => Math.abs(value)).sort((a, b) => a - b)
  const signed = valuesStats(clean)
  const squaredMean =
    clean.length > 0
      ? clean.reduce((sum, value) => sum + value ** 2, 0) / clean.length
      : null
  return {
    signed,
    meanAbsoluteDelta:
      abs.length > 0 ? round(abs.reduce((sum, value) => sum + value, 0) / abs.length) : null,
    medianAbsoluteDelta: valuesStats(abs).median,
    rmse: squaredMean == null ? null : round(Math.sqrt(squaredMean)),
    p90AbsoluteDelta: valuesStats(abs).p90,
    p95AbsoluteDelta: abs.length > 0 ? round(percentile(abs, 0.95)) : null,
    maxAbsoluteDelta: abs.length > 0 ? round(Math.max(...abs)) : null,
    fallbackLevelChangeRate: rowCount > 0 ? round(fallbackChanges / rowCount) : null,
  }
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null
  const idx = (sortedValues.length - 1) * p
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sortedValues[lower]
  const weight = idx - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

function increment(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by)
}

function groupBy(rows, readKey) {
  const result = new Map()
  for (const row of rows) {
    const key = readKey(row)
    const bucket = result.get(key) ?? []
    bucket.push(row)
    result.set(key, bucket)
  }
  return result
}

function distinctCount(rows, readKey) {
  return new Set(rows.map(readKey)).size
}

function residualsByMetric(row, expected) {
  const result = {}
  for (const metric of METRIC_NAMES) {
    const actual = row.metrics[metric]
    const exp = expected[metric]
    result[metric] = actual != null && exp != null ? round(actual - exp) : null
  }
  return result
}

function compactLevelStats(rows) {
  const byPlacement = {}
  for (let place = 1; place <= 8; place += 1) {
    const group = rows.filter((row) => row.placement === place)
    byPlacement[String(place)] = {
      rowCount: group.length,
      rolePerformanceResidual: valuesStats(group.map((row) => row.roleResidual)),
      rawDamageToPlayerPerMinute: valuesStats(
        group.map((row) => row.rawDamageToPlayerPerMinute),
      ),
    }
  }
  return byPlacement
}

function summarizeLevel(level, rows, baseFallbackLevelChanges, playerFallbackLevelChanges) {
  const matchOutFallbackChanges = baseFallbackLevelChanges.get(level) ?? 0
  const playerOutFallbackChanges = playerFallbackLevelChanges.get(level) ?? 0
  return {
    rowCount: rows.length,
    gameCount: distinctCount(rows, (row) => row.gameKey),
    rolePerformanceResidual: valuesStats(rows.map((row) => row.roleResidual)),
    leaveOneMatchOutDelta: valuesStats(rows.map((row) => row.matchOutRoleDelta)),
    leaveOnePlayerOutDelta: valuesStats(rows.map((row) => row.playerOutRoleDelta)),
    leaveOneMatchOutStability: deltaStabilityStats(
      rows.map((row) => row.matchOutRoleDelta),
      matchOutFallbackChanges,
      rows.length,
    ),
    leaveOnePlayerOutStability: deltaStabilityStats(
      rows.map((row) => row.playerOutRoleDelta),
      playerOutFallbackChanges,
      rows.length,
    ),
    fallbackLevelChanges: {
      leaveOneMatchOut: matchOutFallbackChanges,
      leaveOnePlayerOut: playerOutFallbackChanges,
    },
    placement: compactLevelStats(rows),
    thresholdBand28To32: {
      rowCount: rows.filter((row) => row.exactSampleCount >= 28 && row.exactSampleCount <= 32).length,
      rolePerformanceResidualDeltaFromParent: valuesStats(
        rows
          .filter((row) => row.exactSampleCount >= 28 && row.exactSampleCount <= 32)
          .map((row) => row.boundaryRoleDelta),
      ),
    },
  }
}

function fallbackBoundarySummary(rows) {
  const summary = {}
  for (const level of LEVELS) {
    const group = rows.filter((row) => row.fallbackLevel === level)
    summary[level] = {
      rowCount: group.length,
      gameCount: distinctCount(group, (row) => row.gameKey),
      exactKeyCount: distinctCount(group, (row) => row.exactKey),
    }
  }
  return summary
}

function participantToEvaluationRow(row) {
  const detail = row.match
  if (!detail || detail.gameMode !== 'rank' || detail.displaySeasonId !== CURRENT_DISPLAY_SEASON) {
    return null
  }
  const source = {
    displaySeasonId: detail.displaySeasonId,
    gameMode: detail.gameMode,
    characterNum: row.characterNum,
    placement: row.placement,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    teamKills: row.teamKills,
    damageToPlayer: row.damageToPlayer,
    victory: row.placement === 1,
    rpAfter: row.rpAfter,
    gameDuration: detail.durationSeconds,
    bestWeapon: row.bestWeapon,
    roleMetricsVersion: null,
    viewContribution: null,
    monsterKill: null,
    damageFromPlayer: null,
    shieldDamageOffsetFromPlayer: null,
    teamRecover: null,
    rawJson: row.rawJson,
  }
  if (missingMetricFields(source).length > 0 || row.teamNumber == null) return null

  const tier = normalizeRankTier({
    rp: source.rpAfter,
    displaySeason: source.displaySeasonId,
  })
  const tierKey = rankTierToGradeBaselineKey(tier)
  const weaponTypeId = source.bestWeapon ?? null
  const role =
    tierKey && weaponTypeId != null && weaponTypeId > 0
      ? lookupCharacterWeaponRole(source.characterNum, weaponTypeId)
      : null
  const exactBaseline =
    tierKey && weaponTypeId != null && weaponTypeId > 0
      ? lookupBaselineMetricsAtTier(tierKey, source.characterNum, weaponTypeId)
      : null
  if (!tierKey || !role || !exactBaseline || weaponTypeId == null || weaponTypeId <= 0) return null

  const grade = computeMatchPerformanceGrade({
    row: source,
    playerTier: tier,
    displaySeasonId: source.displaySeasonId,
  })
  const minutes = source.gameDuration / 60
  return {
    gameKey: row.gameId,
    teamNumber: row.teamNumber,
    displaySeasonId: source.displaySeasonId,
    gameMode: source.gameMode,
    tierKey,
    characterNum: source.characterNum,
    weaponTypeId,
    role,
    placement: source.placement,
    placeBucket: placementBucket(source.placement),
    durationBucket: durationBucket(source.gameDuration),
    metrics: {
      damageToPlayerPerMinute: metricPerMinute(source.damageToPlayer, minutes),
      killsPerMinute: metricPerMinute(source.kills, minutes),
      assistsPerMinute: metricPerMinute(source.assists, minutes),
      teamKillsPerMinute: metricPerMinute(source.teamKills, minutes),
      deathsPerMinute: metricPerMinute(source.deaths, minutes),
      viewContributionPerMinute: metricPerMinute(source.viewContribution, minutes),
      monsterKillPerMinute: metricPerMinute(source.monsterKill, minutes),
      damageFromPlayerPerMinute: metricPerMinute(source.damageFromPlayer, minutes),
      shieldDamageOffsetFromPlayerPerMinute: metricPerMinute(
        source.shieldDamageOffsetFromPlayer,
        minutes,
      ),
      teamRecoverPerMinute: metricPerMinute(source.teamRecover, minutes),
      rolePerformanceScore: grade.matchGradeRoleScore ?? null,
    },
  }
}

function formatText(report) {
  const lines = []
  lines.push('team-luck-residual evaluation report')
  lines.push(`generatedAt: ${report.generatedAt}`)
  lines.push(`baselineVersion: ${report.baselineVersion}`)
  lines.push(`evaluatedRows: ${report.summary.evaluatedRows}`)
  lines.push(`evaluatedGames: ${report.summary.evaluatedGames}`)
  lines.push('')
  lines.push('fallback level row/game counts:')
  for (const level of LEVELS) {
    const row = report.fallbackBoundarySummary[level]
    lines.push(`- ${level}: rows=${row.rowCount}, games=${row.gameCount}, exactKeys=${row.exactKeyCount}`)
  }
  lines.push('')
  lines.push('focus levels:')
  for (const level of ['L2', 'L3']) {
    const stats = report.levels[level]
    lines.push(
      `- ${level}: residualMean=${stats.rolePerformanceResidual.mean}, residualMedian=${stats.rolePerformanceResidual.median}, matchOutDeltaMean=${stats.leaveOneMatchOutDelta.mean}, playerOutDeltaMean=${stats.leaveOnePlayerOutDelta.mean}`,
    )
  }
  lines.push('')
  lines.push(`fallback changes match-out: ${report.summary.fallbackLevelChanged.leaveOneMatchOut}`)
  lines.push(`fallback changes player-out: ${report.summary.fallbackLevelChanged.leaveOnePlayerOut}`)
  lines.push('')
  lines.push('rank residual means vs raw damage per minute means:')
  for (const [place, row] of Object.entries(report.rankPatternCheck.byPlacement)) {
    lines.push(
      `- ${place}: raw=${row.rawDamageToPlayerPerMinute.mean}, residual=${row.rolePerformanceResidual.mean}`,
    )
  }
  lines.push('')
  lines.push('notes:')
  for (const note of report.notes) lines.push(`- ${note}`)
  lines.push('')
  return `${lines.join('\n')}\n`
}

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: {
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    },
    select: {
      uid: true,
      gameId: true,
      apiSeasonId: true,
      displaySeasonId: true,
      gameMode: true,
      characterNum: true,
      placement: true,
      kills: true,
      deaths: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      victory: true,
      rpAfter: true,
      gameDuration: true,
      bestWeapon: true,
      roleMetricsVersion: true,
      viewContribution: true,
      monsterKill: true,
      damageFromPlayer: true,
      shieldDamageOffsetFromPlayer: true,
      teamRecover: true,
      rawJson: true,
    },
  })

  const eligibleRows = []
  let skippedMissingMetric = 0
  let skippedUnsupportedCombination = 0
  for (const row of rows) {
    if (missingMetricFields(row).length > 0) {
      skippedMissingMetric += 1
      continue
    }

    const tier = normalizeRankTier({
      rp: row.rpAfter,
      displaySeason: row.displaySeasonId,
    })
    const tierKey = rankTierToGradeBaselineKey(tier)
    const weaponTypeId = row.bestWeapon ?? null
    const role =
      tierKey && weaponTypeId != null && weaponTypeId > 0
        ? lookupCharacterWeaponRole(row.characterNum, weaponTypeId)
        : null
    const exactBaseline =
      tierKey && weaponTypeId != null && weaponTypeId > 0
        ? lookupBaselineMetricsAtTier(tierKey, row.characterNum, weaponTypeId)
        : null

    if (!tierKey || !role || !exactBaseline || weaponTypeId == null || weaponTypeId <= 0) {
      skippedUnsupportedCombination += 1
      continue
    }

    const grade = computeMatchPerformanceGrade({
      row,
      playerTier: tier,
      displaySeasonId: row.displaySeasonId,
    })
    const minutes = row.gameDuration / 60
    eligibleRows.push({
      playerKey: row.uid,
      gameKey: row.gameId,
      displaySeasonId: row.displaySeasonId,
      gameMode: row.gameMode,
      tierKey,
      characterNum: row.characterNum,
      weaponTypeId,
      role,
      placement: row.placement,
      placeBucket: placementBucket(row.placement),
      durationBucket: durationBucket(row.gameDuration),
      metrics: {
        damageToPlayerPerMinute: metricPerMinute(row.damageToPlayer, minutes),
        killsPerMinute: metricPerMinute(row.kills, minutes),
        assistsPerMinute: metricPerMinute(row.assists, minutes),
        teamKillsPerMinute: metricPerMinute(row.teamKills, minutes),
        deathsPerMinute: metricPerMinute(row.deaths, minutes),
        viewContributionPerMinute: metricPerMinute(row.viewContribution, minutes),
        monsterKillPerMinute: metricPerMinute(row.monsterKill, minutes),
        damageFromPlayerPerMinute: metricPerMinute(row.damageFromPlayer, minutes),
        shieldDamageOffsetFromPlayerPerMinute: metricPerMinute(
          row.shieldDamageOffsetFromPlayer,
          minutes,
        ),
        teamRecoverPerMinute: metricPerMinute(row.teamRecover, minutes),
        rolePerformanceScore: grade.matchGradeRoleScore ?? null,
      },
    })
  }

  const grouped = buildGroups(eligibleRows)
  const byGame = groupBy(eligibleRows, (row) => row.gameKey)
  const byPlayer = groupBy(eligibleRows, (row) => row.playerKey)

  const gameIds = [...byGame.keys()]
  const participantRows = await prisma.matchParticipant.findMany({
    where: {
      gameId: { in: gameIds },
    },
    select: {
      gameId: true,
      teamNumber: true,
      placement: true,
      characterNum: true,
      kills: true,
      deaths: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      rpAfter: true,
      bestWeapon: true,
      rawJson: true,
      match: {
        select: {
          displaySeasonId: true,
          gameMode: true,
          durationSeconds: true,
        },
      },
    },
  })

  const fallbackChangesMatch = new Map()
  const fallbackChangesPlayer = new Map()
  const evaluated = []

  for (const row of eligibleRows) {
    const full = resolveExpectedMetrics(row, grouped)
    const fullResiduals = residualsByMetric(row, full.expected)
    const fallbackLevel = full.fallbackLevel
    const exactSampleCount = full.levelSampleCounts.L0 ?? 0

    const gameRows = byGame.get(row.gameKey) ?? [row]
    const matchOut = resolveExpectedMetrics(row, grouped, gameRows)
    const matchOutResiduals = residualsByMetric(row, matchOut.expected)
    if (matchOut.fallbackLevel !== fallbackLevel) increment(fallbackChangesMatch, fallbackLevel)

    const playerRows = byPlayer.get(row.playerKey) ?? [row]
    const playerOut = resolveExpectedMetrics(row, grouped, playerRows)
    const playerOutResiduals = residualsByMetric(row, playerOut.expected)
    if (playerOut.fallbackLevel !== fallbackLevel) increment(fallbackChangesPlayer, fallbackLevel)

    const parentStart = fallbackLevel === 'L0' ? 'L1' : fallbackLevel
    const parentExpected = resolveExpectedMetrics(row, grouped, [], parentStart)
    const parentResiduals = residualsByMetric(row, parentExpected.expected)

    evaluated.push({
      gameKey: row.gameKey,
      playerKey: row.playerKey,
      exactKey: levelKey('L0', row),
      fallbackLevel,
      exactSampleCount,
      placement: row.placement,
      roleResidual: fullResiduals.rolePerformanceScore,
      rawDamageToPlayerPerMinute: row.metrics.damageToPlayerPerMinute,
      matchOutRoleDelta:
        matchOutResiduals.rolePerformanceScore != null && fullResiduals.rolePerformanceScore != null
          ? round(matchOutResiduals.rolePerformanceScore - fullResiduals.rolePerformanceScore)
          : null,
      playerOutRoleDelta:
        playerOutResiduals.rolePerformanceScore != null && fullResiduals.rolePerformanceScore != null
          ? round(playerOutResiduals.rolePerformanceScore - fullResiduals.rolePerformanceScore)
          : null,
      boundaryRoleDelta:
        parentResiduals.rolePerformanceScore != null && fullResiduals.rolePerformanceScore != null
          ? round(parentResiduals.rolePerformanceScore - fullResiduals.rolePerformanceScore)
          : null,
      residuals: fullResiduals,
    })
  }

  const levels = {}
  for (const level of LEVELS) {
    levels[level] = summarizeLevel(
      level,
      evaluated.filter((row) => row.fallbackLevel === level),
      fallbackChangesMatch,
      fallbackChangesPlayer,
    )
  }

  const teamLuckRows = []
  const participantResidualRows = participantRows
    .map(participantToEvaluationRow)
    .filter((row) => row != null)
    .map((row) => {
      const expected = resolveExpectedMetrics(row, grouped)
      const residuals = residualsByMetric(row, expected.expected)
      return {
        ...row,
        fallbackLevel: expected.fallbackLevel,
        roleResidual: residuals.rolePerformanceScore,
      }
    })

  for (const row of participantResidualRows) {
    if (row.teamNumber == null || row.roleResidual == null) continue
    const teammates = participantResidualRows.filter(
      (candidate) =>
        candidate.gameKey === row.gameKey &&
        candidate.teamNumber === row.teamNumber &&
        candidate !== row &&
        candidate.roleResidual != null,
    )
    if (teammates.length === 0) continue
    const teammateAverage =
      teammates.reduce((sum, teammate) => sum + teammate.roleResidual, 0) / teammates.length
    teamLuckRows.push({
      teammateCount: teammates.length,
      fallbackLevel: row.fallbackLevel,
      ownerResidual: round(row.roleResidual),
      teamLuck: round(teammateAverage),
      carryBurden: round(row.roleResidual - teammateAverage),
    })
  }

  const participantFallbackMeans = {}
  for (const level of LEVELS) {
    const group = participantResidualRows.filter((row) => row.fallbackLevel === level)
    participantFallbackMeans[level] = valuesStats(group.map((row) => row.roleResidual))
  }

  const byPlacement = {}
  for (let place = 1; place <= 8; place += 1) {
    const group = evaluated.filter((row) => row.placement === place)
    byPlacement[String(place)] = {
      rowCount: group.length,
      rawDamageToPlayerPerMinute: valuesStats(
        group.map((row) => row.rawDamageToPlayerPerMinute),
      ),
      rolePerformanceResidual: valuesStats(group.map((row) => row.roleResidual)),
    }
  }

  const report = {
    schemaVersion: 1,
    baselineVersion: BASELINE_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      mode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      selectedIdentifiers: [],
    },
    summary: {
      totalSourceRows: rows.length,
      evaluatedRows: evaluated.length,
      evaluatedGames: distinctCount(evaluated, (row) => row.gameKey),
      skipped: {
        missingMetric: skippedMissingMetric,
        unsupportedCombination: skippedUnsupportedCombination,
      },
      leaveOnePlayerOut: {
        applied: true,
        note: 'Applied by subtracting the evaluated player rows from raw accumulators; no full rebuild per row.',
      },
      fallbackLevelChanged: {
        leaveOneMatchOut: [...fallbackChangesMatch.values()].reduce((sum, value) => sum + value, 0),
        leaveOnePlayerOut: [...fallbackChangesPlayer.values()].reduce((sum, value) => sum + value, 0),
      },
    },
    fallbackBoundarySummary: fallbackBoundarySummary(evaluated),
    levels,
    focus: {
      L1ToL2: {
        note: 'Primary analysis boundary.',
        stats: levels.L2,
      },
      L2ToL3: {
        note: 'Secondary analysis boundary.',
        stats: levels.L3,
      },
      L0ToL1: {
        note: 'Only 16 final keys in the builder run; sample is too small for a statistical conclusion.',
        stats: levels.L1,
      },
      L3ToL4: {
        note: 'Final fallback safety check.',
        stats: levels.L4,
      },
    },
    teamResiduals: {
      sourceRows: participantResidualRows.length,
      availableRows: teamLuckRows.length,
      teammateCountDistribution: Object.fromEntries(
        [...groupBy(teamLuckRows, (row) => String(row.teammateCount)).entries()].map(
          ([key, rowsForKey]) => [key, rowsForKey.length],
        ),
      ),
      overallPersonalResidual: valuesStats(evaluated.map((row) => row.roleResidual)),
      selectedParticipantResidual: valuesStats(
        participantResidualRows.map((row) => row.roleResidual),
      ),
      readyTeamLuckResidualAverage: valuesStats(
        teamLuckRows.filter((row) => row.teammateCount >= 2).map((row) => row.teamLuck),
      ),
      partialTeamLuckResidualAverage: valuesStats(
        teamLuckRows.filter((row) => row.teammateCount === 1).map((row) => row.teamLuck),
      ),
      completeThreePersonTeamLuckResidualAverage: valuesStats(
        teamLuckRows.filter((row) => row.teammateCount === 2).map((row) => row.teamLuck),
      ),
      ownerResidualAverage: valuesStats(teamLuckRows.map((row) => row.ownerResidual)),
      participantFallbackMeans,
      teamLuckResidualAverage: valuesStats(teamLuckRows.map((row) => row.teamLuck)),
      carryBurdenResidual: valuesStats(teamLuckRows.map((row) => row.carryBurden)),
    },
    rankPatternCheck: {
      byPlacement,
      rawTopMinusBottom:
        byPlacement['1'].rawDamageToPlayerPerMinute.mean != null &&
        byPlacement['8'].rawDamageToPlayerPerMinute.mean != null
          ? round(
              byPlacement['1'].rawDamageToPlayerPerMinute.mean -
                byPlacement['8'].rawDamageToPlayerPerMinute.mean,
            )
          : null,
      residualTopMinusBottom:
        byPlacement['1'].rolePerformanceResidual.mean != null &&
        byPlacement['8'].rolePerformanceResidual.mean != null
          ? round(
              byPlacement['1'].rolePerformanceResidual.mean -
                byPlacement['8'].rolePerformanceResidual.mean,
            )
          : null,
    },
    notes: [
      'No production path or database write is used.',
      'The main score is rolePerformanceResidual only; per-minute metric residuals are diagnostic and are not combined.',
      'A composite residual score is intentionally omitted because this artifact has no variance/MAD/IQR scale information.',
      'Rows missing gameDuration or other required fields are skipped with no imputation.',
      'Weather-state distribution is omitted because the current UI weather categories are defined for displayed team score, not for residual categories.',
      'L0 is a stability/correctness check; L2 and L3 are the weighted analysis focus for this run.',
    ],
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(outputText, formatText(report))

  console.log(
    JSON.stringify(
      {
        files: {
          json: outputJson,
          text: outputText,
        },
        fallbackBoundarySummary: report.fallbackBoundarySummary,
        focus: {
          L2: {
            rowCount: report.levels.L2.rowCount,
            gameCount: report.levels.L2.gameCount,
            residual: report.levels.L2.rolePerformanceResidual,
            matchOutDelta: report.levels.L2.leaveOneMatchOutDelta,
            playerOutDelta: report.levels.L2.leaveOnePlayerOutDelta,
          },
          L3: {
            rowCount: report.levels.L3.rowCount,
            gameCount: report.levels.L3.gameCount,
            residual: report.levels.L3.rolePerformanceResidual,
            matchOutDelta: report.levels.L3.leaveOneMatchOutDelta,
            playerOutDelta: report.levels.L3.leaveOnePlayerOutDelta,
          },
        },
        fallbackLevelChanged: report.summary.fallbackLevelChanged,
        rankPatternCheck: {
          rawTopMinusBottom: report.rankPatternCheck.rawTopMinusBottom,
          residualTopMinusBottom: report.rankPatternCheck.residualTopMinusBottom,
        },
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
