#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
const outputPath = join(outputDir, 'team-luck-residual-baselines.v3.json')
const v1Path = join(outputDir, 'team-luck-residual-baselines.shadow.v1.json')

const prisma = new PrismaClient()

const BASELINE_VERSION = 'team-luck-residual-baselines.v3'
const MIN_SAMPLE_COUNT = 30
// Tuning point: k is fixed at 30 only to match the initial threshold; this is not empirically justified.
const SHRINKAGE_K = 30

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

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFinitePositiveNumber(value) {
  return isFiniteNumber(value) && value > 0
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
    if (value == null) {
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
  return parts.join('|')
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
  return Object.fromEntries(
    METRIC_NAMES.map((name) => [
      name,
      acc.counts[name] > 0 ? round(acc.sums[name] / acc.counts[name]) : null,
    ]),
  )
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

function levelObject(map) {
  return Object.fromEntries(
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, acc]) => [
        key,
        {
          sampleCount: acc.count,
          means: meanMetrics(acc),
        },
      ]),
  )
}

function pickFallbackLevel(levelCounts) {
  for (const level of ['L0', 'L1', 'L2', 'L3', 'L4']) {
    if ((levelCounts[level] ?? 0) >= MIN_SAMPLE_COUNT) return level
  }
  return 'L4'
}

function confidenceFor(fallbackLevel, levelCounts) {
  if (fallbackLevel === 'L0') return 'high'
  if (fallbackLevel === 'L1' || fallbackLevel === 'L2') return 'medium'
  if (fallbackLevel === 'L4' && (levelCounts.L4 ?? 0) < 10) return 'low'
  return 'low'
}

function quantile(sortedValues, p) {
  if (sortedValues.length === 0) return null
  const index = (sortedValues.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sortedValues[lower]
  const weight = index - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

async function main() {
  const v1 = JSON.parse(await readFile(v1Path, 'utf8'))
  const rows = await prisma.playerMatch.findMany({
    where: {
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    },
    select: {
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
  const skipped = {
    missingMetric: 0,
    unsupportedCombination: 0,
    missingRoleScore: 0,
  }

  for (const row of rows) {
    if (missingMetricFields(row).length > 0) {
      skipped.missingMetric += 1
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
      skipped.unsupportedCombination += 1
      continue
    }

    const grade = computeMatchPerformanceGrade({
      row,
      playerTier: tier,
      displaySeasonId: row.displaySeasonId,
    })
    if (grade.matchGradeRoleScore == null) {
      skipped.missingRoleScore += 1
      continue
    }
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
        rolePerformanceScore: grade.matchGradeRoleScore,
      },
    })
  }

  const grouped = buildGroups(eligibleRows)
  const exactRowsByKey = new Map()
  for (const row of eligibleRows) {
    const key = levelKey('L0', row)
    if (!exactRowsByKey.has(key)) exactRowsByKey.set(key, row)
  }

  const fallbackLevelCounts = { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 }
  const confidenceCounts = { high: 0, medium: 0, low: 0 }
  const residuals = []
  for (const row of exactRowsByKey.values()) {
    const counts = Object.fromEntries(
      ['L0', 'L1', 'L2', 'L3', 'L4'].map((level) => [
        level,
        grouped[level].get(levelKey(level, row))?.count ?? 0,
      ]),
    )
    const fallbackLevel = pickFallbackLevel(counts)
    fallbackLevelCounts[fallbackLevel] += 1
    confidenceCounts[confidenceFor(fallbackLevel, counts)] += 1
  }
  for (const row of eligibleRows) {
    const exact = grouped.L0.get(levelKey('L0', row))
    const expected = exact?.counts.rolePerformanceScore > 0
      ? exact.sums.rolePerformanceScore / exact.counts.rolePerformanceScore
      : null
    const actual = row.metrics.rolePerformanceScore
    if (expected != null && Number.isFinite(expected) && actual != null && Number.isFinite(actual)) {
      residuals.push(actual - expected)
    }
  }
  residuals.sort((a, b) => a - b)
  const weatherThresholds = {
    p10: round(quantile(residuals, 0.1)),
    p30: round(quantile(residuals, 0.3)),
    p70: round(quantile(residuals, 0.7)),
    p90: round(quantile(residuals, 0.9)),
  }

  const document = {
    schemaVersion: 2,
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
      weatherThresholds,
      weatherThresholdVersion: 'team-luck-residual-weather.v2',
      note:
        'Runtime-capable residual baseline. Stores L0-L4 level means so unseen exact keys can back off without DB calibration.',
    },
    levelDefinitions: {
      L0: 'season+mode+tier+characterNum+weaponTypeId+role+placementBucket+durationBucket',
      L1: 'season+mode+tier+characterNum+role+placementBucket+durationBucket',
      L2: 'season+mode+tier+role+placementBucket+durationBucket',
      L3: 'season+mode+role+placementBucket+durationBucket',
      L4: 'season+mode+placementBucket+durationBucket',
    },
    metricNames: METRIC_NAMES,
    levels: Object.fromEntries(
      ['L0', 'L1', 'L2', 'L3', 'L4'].map((level) => [level, levelObject(grouped[level])]),
    ),
    validation: {
      eligibleRows: eligibleRows.length,
      exactKeyCount: exactRowsByKey.size,
      levelKeyCounts: Object.fromEntries(
        ['L0', 'L1', 'L2', 'L3', 'L4'].map((level) => [level, grouped[level].size]),
      ),
      fallbackLevelCounts,
      confidenceCounts,
      skipped,
      weatherResidualRows: residuals.length,
    },
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    output: outputPath,
    baselineVersion: document.baselineVersion,
    validation: document.validation,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
