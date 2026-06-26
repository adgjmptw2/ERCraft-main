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
const outputDir = join(backendRoot, 'src', 'data', 'teamLuckResidual')
const outputPath = join(outputDir, 'team-luck-residual-baselines.shadow.v1.json')

const prisma = new PrismaClient()

const BASELINE_VERSION = 'team-luck-residual-baselines.shadow.v1'
const MIN_SAMPLE_COUNT = 30
// Tuning point: k is fixed at 30 only to match the initial threshold; this is not empirically justified.
const SHRINKAGE_K = 30

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

function exactKeyParts(row) {
  return {
    season: row.displaySeasonId,
    mode: row.gameMode,
    tier: row.tierKey,
    characterNum: row.characterNum,
    weaponTypeId: row.weaponTypeId,
    role: row.role,
    placementBucket: row.placeBucket,
    durationBucket: row.durationBucket,
  }
}

function createAccumulator() {
  return {
    count: 0,
    sums: Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])),
    counts: Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])),
  }
}

function addToAccumulator(acc, row) {
  acc.count += 1
  for (const name of METRIC_NAMES) {
    const value = row.metrics[name]
    if (value == null || !Number.isFinite(value)) continue
    acc.sums[name] += value
    acc.counts[name] += 1
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
    for (const level of Object.keys(levels)) {
      const key = levelKey(level, row)
      const group = levels[level].get(key) ?? createAccumulator()
      addToAccumulator(group, row)
      levels[level].set(key, group)
    }
  }
  return levels
}

function pickFallbackLevel(levelCounts) {
  for (const level of ['L0', 'L1', 'L2', 'L3', 'L4']) {
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

function resolveExpectedMetrics(row, grouped) {
  const means = {}
  const counts = {}
  for (const level of ['L0', 'L1', 'L2', 'L3', 'L4']) {
    const group = grouped[level].get(levelKey(level, row)) ?? createAccumulator()
    means[level] = meanMetrics(group)
    counts[level] = group.count
  }

  const resolved = {}
  for (const metric of METRIC_NAMES) {
    let value = means.L4[metric]
    if (counts.L4 > 0 && counts.L4 < MIN_SAMPLE_COUNT) {
      value = means.L4[metric]
    }
    for (const level of ['L3', 'L2', 'L1', 'L0']) {
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
  }
}

function confidenceFor(levelCounts, fallbackLevel) {
  if (fallbackLevel === 'L4' && (levelCounts.L4 ?? 0) < 10) return 'low'
  return (levelCounts.L0 ?? 0) >= MIN_SAMPLE_COUNT ? 'high' : 'shrunk'
}

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: {
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    },
    select: {
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
      displaySeasonId: row.displaySeasonId,
      gameMode: row.gameMode,
      tierKey,
      characterNum: row.characterNum,
      weaponTypeId,
      role,
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
  const exactRowsByKey = new Map()
  for (const row of eligibleRows) {
    const key = levelKey('L0', row)
    if (!exactRowsByKey.has(key)) exactRowsByKey.set(key, row)
  }

  const records = []
  const fallbackLevelCounts = { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 }
  const confidenceCounts = { high: 0, shrunk: 0, low: 0 }
  let rescuedBelowMinExactKeys = 0

  for (const row of [...exactRowsByKey.values()].sort((a, b) =>
    levelKey('L0', a).localeCompare(levelKey('L0', b)),
  )) {
    const { expected, levelSampleCounts } = resolveExpectedMetrics(row, grouped)
    const fallbackLevel = pickFallbackLevel(levelSampleCounts)
    const confidence = confidenceFor(levelSampleCounts, fallbackLevel)
    fallbackLevelCounts[fallbackLevel] += 1
    confidenceCounts[confidence] += 1
    if (levelSampleCounts.L0 < MIN_SAMPLE_COUNT && levelSampleCounts[fallbackLevel] >= MIN_SAMPLE_COUNT) {
      rescuedBelowMinExactKeys += 1
    }

    const parentLevel =
      fallbackLevel === 'L0'
        ? 'L1'
        : fallbackLevel === 'L1'
          ? 'L2'
          : fallbackLevel === 'L2'
            ? 'L3'
            : fallbackLevel === 'L3'
              ? 'L4'
              : null

    records.push({
      exactKey: levelKey('L0', row),
      key: exactKeyParts(row),
      fallbackLevel,
      sampleCount: levelSampleCounts[fallbackLevel] ?? 0,
      parentSampleCount: parentLevel ? levelSampleCounts[parentLevel] ?? 0 : 0,
      exactSampleCount: levelSampleCounts.L0 ?? 0,
      levelSampleCounts,
      confidence,
      expected,
    })
  }

  const document = {
    schemaVersion: 1,
    baselineVersion: BASELINE_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      mode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      selectedIdentifiers: [],
    },
    config: {
      minimumSampleCount: MIN_SAMPLE_COUNT,
      shrinkageK: SHRINKAGE_K,
      primaryResidualMetric: 'damageToPlayerPerMinute',
      note:
        'Shadow-only residual baseline. gameDuration-missing rows are skipped; no imputation or runtime wiring.',
    },
    levelDefinitions: {
      L0: 'season+mode+tier+characterNum+weaponTypeId+role+placementBucket+durationBucket',
      L1: 'season+mode+tier+characterNum+role+placementBucket+durationBucket',
      L2: 'season+mode+tier+role+placementBucket+durationBucket',
      L3: 'season+mode+role+placementBucket+durationBucket',
      L4: 'season+mode+placementBucket+durationBucket',
    },
    metricNames: METRIC_NAMES,
    records,
    validation: {
      exactKeyCount: records.length,
      fallbackLevelCounts,
      confidenceCounts,
      rescuedBelowMinExactKeys,
      skipped: {
        missingMetric: skippedMissingMetric,
        unsupportedCombination: skippedUnsupportedCombination,
      },
    },
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`)

  console.log(
    JSON.stringify(
      {
        output: outputPath,
        exactKeyCount: document.validation.exactKeyCount,
        fallbackLevelCounts,
        confidenceCounts,
        rescuedBelowMinExactKeys,
        skipped: document.validation.skipped,
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
