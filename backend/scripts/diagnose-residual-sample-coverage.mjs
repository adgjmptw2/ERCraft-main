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
const outputJson = join(outputDir, 'sample-coverage-diagnosis.json')
const outputText = join(outputDir, 'sample-coverage-diagnosis.txt')

const prisma = new PrismaClient()

const MIN_EXACT_KEY_SAMPLE = 30

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

function isFinitePositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
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

function quantile(sortedValues, p) {
  if (sortedValues.length === 0) return null
  const idx = (sortedValues.length - 1) * p
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sortedValues[lower]
  const weight = idx - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

function histogram(values) {
  const buckets = [
    { label: '0', min: 0, max: 0 },
    { label: '1-4', min: 1, max: 4 },
    { label: '5-9', min: 5, max: 9 },
    { label: '10-29', min: 10, max: 29 },
    { label: '30-49', min: 30, max: 49 },
    { label: '50-99', min: 50, max: 99 },
    { label: '100+', min: 100, max: Number.POSITIVE_INFINITY },
  ]
  return buckets.map((bucket) => ({
    bucket: bucket.label,
    keyCount: values.filter((value) => value >= bucket.min && value <= bucket.max).length,
  }))
}

function buildExactKey(parts) {
  return [
    `season:${parts.season}`,
    `mode:${parts.mode}`,
    `tier:${parts.tier}`,
    `character:${parts.characterNum}`,
    `weapon:${parts.weaponTypeId}`,
    `role:${parts.role}`,
    `place:${parts.placeBucket}`,
    `duration:${parts.durationBucket}`,
  ].join('|')
}

function increment(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by)
}

function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 10000) / 100 : 0
}

function formatTextReport(report) {
  const lines = []
  lines.push('team-luck-residual sample coverage diagnosis')
  lines.push(`generatedAt: ${report.generatedAt}`)
  lines.push(`scope: ${report.scope.mode} / displaySeasonId=${report.scope.displaySeasonId}`)
  lines.push(`rows: ${report.summary.totalRows}`)
  lines.push(`candidateRows: ${report.summary.candidateRows}`)
  lines.push(`gradedRowsForResidualL0: ${report.summary.gradedRowsForResidualL0}`)
  lines.push(`ungradedRowsForResidualL0: ${report.summary.ungradedRowsForResidualL0}`)
  lines.push('')
  lines.push('ungraded categories:')
  for (const category of report.ungradedCategories) {
    lines.push(
      `- ${category.category}: ${category.count} (${category.ratioOfUngraded}%)`,
    )
  }
  lines.push(`- sum: ${report.ungradedCategoryRatioSum}%`)
  lines.push('')
  lines.push('exact key sample count quantiles:')
  for (const [key, value] of Object.entries(report.exactKeySampleDistribution.quantiles)) {
    lines.push(`- ${key}: ${value}`)
  }
  lines.push('')
  lines.push('exact key sample count histogram:')
  for (const row of report.exactKeySampleDistribution.histogram) {
    lines.push(`- ${row.bucket}: ${row.keyCount}`)
  }
  lines.push('')
  lines.push('top missing metric fields:')
  for (const row of report.topMissingMetricFields) {
    lines.push(`- ${row.field}: ${row.count}`)
  }
  lines.push('')
  lines.push('notes:')
  for (const note of report.notes) {
    lines.push(`- ${note}`)
  }
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
    orderBy: {
      playedAt: 'desc',
    },
  })

  const inspected = []
  const exactCounts = new Map()
  const missingFieldCounts = new Map()

  for (const row of rows) {
    const missingFields = missingMetricFields(row)
    for (const field of missingFields) increment(missingFieldCounts, field)

    const tier = normalizeRankTier({
      rp: row.rpAfter,
      displaySeason: row.displaySeasonId,
    })
    const tierKey = rankTierToGradeBaselineKey(tier)
    const weaponTypeId = row.bestWeapon ?? null
    const role =
      weaponTypeId != null && weaponTypeId > 0
        ? lookupCharacterWeaponRole(row.characterNum, weaponTypeId)
        : null
    const exactBaseline =
      tierKey && weaponTypeId != null && weaponTypeId > 0
        ? lookupBaselineMetricsAtTier(tierKey, row.characterNum, weaponTypeId)
        : null
    const grade = computeMatchPerformanceGrade({
      row,
      playerTier: tier,
      displaySeasonId: row.displaySeasonId,
    })

    const key =
      tierKey && role && weaponTypeId != null && weaponTypeId > 0
        ? buildExactKey({
            season: row.displaySeasonId,
            mode: row.gameMode,
            tier: tierKey,
            characterNum: row.characterNum,
            weaponTypeId,
            role,
            placeBucket: placementBucket(row.placement),
            durationBucket: durationBucket(row.gameDuration),
          })
        : null

    if (missingFields.length === 0 && key && exactBaseline) {
      increment(exactCounts, key)
    }

    inspected.push({
      missingFields,
      tierKey,
      role,
      exactBaselineExists: exactBaseline != null,
      exactKey: key,
      roleScoreAvailable: grade.matchGradeRoleScore != null,
    })
  }

  const categorized = inspected.map((row) => {
    if (row.missingFields.length > 0) return 'missing-metric'
    if (!row.tierKey || !row.role || !row.exactBaselineExists || !row.exactKey) {
      return 'unsupported-combination'
    }
    const count = exactCounts.get(row.exactKey) ?? 0
    if (count < MIN_EXACT_KEY_SAMPLE) return 'below-min-sample'
    if (!row.roleScoreAvailable) return 'other'
    return 'graded'
  })

  const categoryCounts = new Map()
  for (const category of categorized) increment(categoryCounts, category)

  const keyCounts = [...exactCounts.values()].sort((a, b) => a - b)
  const ungradedCategories = [
    ['metric 자체가 누락된 행', 'missing-metric'],
    ['최소 경기 수 미달로 제외된 행', 'below-min-sample'],
    ['exact key 조합 baseline 없음', 'unsupported-combination'],
    ['기타/미분류', 'other'],
  ].map(([label, key]) => {
    const count = categoryCounts.get(key) ?? 0
    const ungradedTotal = rows.length - (categoryCounts.get('graded') ?? 0)
    return {
      category: key,
      label,
      count,
      ratioOfUngraded: percent(count, ungradedTotal),
      ratioOfAllRows: percent(count, rows.length),
    }
  })
  const ungradedTotal = rows.length - (categoryCounts.get('graded') ?? 0)
  const ungradedRatioSum = ungradedCategories.reduce(
    (sum, category) => sum + category.ratioOfUngraded,
    0,
  )

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      sourceTable: 'player_matches',
      mode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      minimumExactKeySample: MIN_EXACT_KEY_SAMPLE,
    },
    keyDefinition: {
      exactKey:
        'season + mode + tier + characterNum + weaponTypeId + role + placementBucket + durationBucket',
      placementBuckets: ['place-1', 'place-2-3', 'place-4-6', 'place-7-plus'],
      durationBuckets: [
        'duration-lt-15m',
        'duration-15-20m',
        'duration-20-25m',
        'duration-25-30m',
        'duration-30m-plus',
      ],
    },
    requiredMetricFields: REQUIRED_METRIC_FIELDS,
    summary: {
      totalRows: rows.length,
      candidateRows: rows.length - (categoryCounts.get('missing-metric') ?? 0),
      exactKeyCount: exactCounts.size,
      gradedRowsForResidualL0: categoryCounts.get('graded') ?? 0,
      ungradedRowsForResidualL0: ungradedTotal,
    },
    exactKeySampleDistribution: {
      keyCount: keyCounts.length,
      min: keyCounts[0] ?? null,
      max: keyCounts.at(-1) ?? null,
      quantiles: {
        p0: keyCounts[0] ?? null,
        p10: quantile(keyCounts, 0.1),
        p25: quantile(keyCounts, 0.25),
        p50: quantile(keyCounts, 0.5),
        p75: quantile(keyCounts, 0.75),
        p90: quantile(keyCounts, 0.9),
        p95: quantile(keyCounts, 0.95),
        p99: quantile(keyCounts, 0.99),
        p100: keyCounts.at(-1) ?? null,
      },
      histogram: histogram(keyCounts),
    },
    ungradedCategories,
    ungradedCategoryRatioSum: Math.round(ungradedRatioSum * 100) / 100,
    topMissingMetricFields: [...missingFieldCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([field, count]) => ({ field, count, ratioOfAllRows: percent(count, rows.length) })),
    notes: [
      'This diagnostic is isolated from runtime paths and does not write to production baseline outputs.',
      'No uid, nickname, or gameId values are selected or emitted.',
      'below-min-sample is evaluated against the residual L0 exact key threshold, not production grade fallback behavior.',
      'unsupported-combination means the current fixed-v1 exact tier+character+weapon baseline or role mapping was not found.',
    ],
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(outputText, formatTextReport(report))

  console.log(
    JSON.stringify(
      {
        files: {
          json: outputJson,
          text: outputText,
        },
        summary: report.summary,
        exactKeySampleDistribution: report.exactKeySampleDistribution,
        ungradedCategories: report.ungradedCategories,
        ungradedCategoryRatioSum: report.ungradedCategoryRatioSum,
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
