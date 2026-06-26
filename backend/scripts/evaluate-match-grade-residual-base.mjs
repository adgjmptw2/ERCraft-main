#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  CHARACTER_GRADE_BENCHMARK_VERSION,
  OUTCOME_SCORE_WEIGHT,
  ROLE_SCORE_WEIGHT,
} from '../dist/services/characterPerformanceGrade/config.js'
import { computeMatchPerformanceGrade } from '../dist/services/characterPerformanceGrade/compute.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { normalizeRankTier } from '../dist/utils/rankTier.js'
import { evaluateOutcomeCapCandidate } from '../dist/analysis/shadow/matchGradeOutcomeCap.js'
import {
  evaluateResidualBaseCandidate,
} from '../dist/analysis/shadow/matchGradeResidualBase.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const repoRoot = join(backendRoot, '..')
const residualBaselinePath = join(
  backendRoot,
  'src',
  'data',
  'teamLuckResidual',
  'team-luck-residual-baselines.shadow.v1.json',
)
const outputDir = join(repoRoot, 'reports', 'match-grade-residual-base')
const outputJson = join(outputDir, 'evaluation-report.json')
const outputTxt = join(outputDir, 'evaluation-report.txt')

const prisma = new PrismaClient()
const RESIDUAL_CANDIDATES = ['R8', 'R10', 'R12']
const RESIDUAL_GATE_MODES = ['production-gate', 'residual-gate']
const VARIANT_ORDER = ['production', 'A:v2-placement-guard', 'R8:residual-gate', 'R10:residual-gate', 'R12:residual-gate']
const GRADE_ORDER = ['S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-']
const GRADE_RANK = Object.fromEntries(GRADE_ORDER.map((grade, index) => [grade, GRADE_ORDER.length - index]))
const SAFE_MINIMUM_SCALE = 1
const ROLE_BINS = [
  { key: '0-39', min: 0, max: 39.999999 },
  { key: '40-49', min: 40, max: 49.999999 },
  { key: '50-59', min: 50, max: 59.999999 },
  { key: '60-69', min: 60, max: 69.999999 },
  { key: '70-79', min: 70, max: 79.999999 },
  { key: '80-89', min: 80, max: 89.999999 },
  { key: '90-100', min: 90, max: 100 },
]

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
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
    p75: round(percentile(clean, 0.75)),
    p90: round(percentile(clean, 0.9)),
  }
}

function medianAbsoluteDeviation(values, median) {
  const deviations = values.map((value) => Math.abs(value - median)).sort((a, b) => a - b)
  return percentile(deviations, 0.5)
}

function robustScaleStats(values) {
  const clean = values.filter((value) => value != null && Number.isFinite(value)).sort((a, b) => a - b)
  if (clean.length < 2) {
    return { median: null, mad: null, iqr: null, scale: null, scaleSource: 'unavailable', safeMinimum: SAFE_MINIMUM_SCALE }
  }
  const median = percentile(clean, 0.5)
  const mad = medianAbsoluteDeviation(clean, median)
  const p25 = percentile(clean, 0.25)
  const p75 = percentile(clean, 0.75)
  const iqr = p75 - p25
  const madScale = mad > 0 ? 1.4826 * mad : null
  const iqrScale = iqr > 0 ? iqr / 1.349 : null
  const selected = madScale ?? iqrScale
  return {
    median: round(median),
    mad: round(mad),
    iqr: round(iqr),
    scale: selected == null ? null : round(Math.max(selected, SAFE_MINIMUM_SCALE)),
    scaleSource: madScale != null ? 'mad' : iqrScale != null ? 'iqr' : 'unavailable',
    safeMinimum: SAFE_MINIMUM_SCALE,
  }
}

function placementBucket(placement) {
  if (!Number.isFinite(placement) || placement <= 0) return 'unknown-place'
  if (placement === 1) return 'place-1'
  if (placement <= 3) return 'place-2-3'
  if (placement <= 6) return 'place-4-6'
  return 'place-7-plus'
}

function durationBucket(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'unknown-duration'
  const minutes = seconds / 60
  if (minutes < 15) return 'duration-lt-15m'
  if (minutes < 20) return 'duration-15-20m'
  if (minutes < 25) return 'duration-20-25m'
  if (minutes < 30) return 'duration-25-30m'
  return 'duration-30m-plus'
}

function exactKey(params) {
  return [
    `season:${params.season}`,
    `mode:${params.mode}`,
    `place:${params.placementBucket}`,
    `duration:${params.durationBucket}`,
    `role:${params.role}`,
    `tier:${params.tier}`,
    `character:${params.characterNum}`,
    `weapon:${params.weaponTypeId}`,
  ].join('|')
}

function confidenceForFallback(level) {
  if (level === 'L0') return 'high'
  if (level === 'L1' || level === 'L2') return 'medium'
  return 'low'
}

function gradeDistribution(rows, readGrade) {
  const counts = Object.fromEntries(GRADE_ORDER.map((grade) => [grade, 0]))
  for (const row of rows) {
    const grade = readGrade(row)
    if (grade in counts) counts[grade] += 1
  }
  return Object.fromEntries(
    GRADE_ORDER.map((grade) => [
      grade,
      { count: counts[grade], ratio: rows.length > 0 ? round(counts[grade] / rows.length) : 0 },
    ]),
  )
}

function gradeAtLeast(grade, threshold) {
  return (GRADE_RANK[grade] ?? 0) >= (GRADE_RANK[threshold] ?? Number.POSITIVE_INFINITY)
}

function gradeAtMost(grade, threshold) {
  return (GRADE_RANK[grade] ?? Number.POSITIVE_INFINITY) <= (GRADE_RANK[threshold] ?? 0)
}

function pearson(xs, ys) {
  const pairs = xs.map((x, index) => [x, ys[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (pairs.length < 2) return null
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length
  let numerator = 0
  let denomX = 0
  let denomY = 0
  for (const [x, y] of pairs) {
    numerator += (x - meanX) * (y - meanY)
    denomX += (x - meanX) ** 2
    denomY += (y - meanY) ** 2
  }
  const denominator = Math.sqrt(denomX * denomY)
  return denominator > 0 ? round(numerator / denominator) : null
}

function currentReadScore(row) {
  return row.currentScore
}

function currentReadGrade(row) {
  return row.currentGrade
}

function variantReaders(key) {
  return {
    readScore: (row) => row.variants[key].score,
    readGrade: (row) => row.variants[key].grade,
  }
}

function summarizeVariant(rows, readScore, readGrade, currentGap) {
  const placement = placementSummary(rows, readScore, readGrade)
  return {
    overall: {
      rowCount: rows.length,
      score: valuesStats(rows.map(readScore)),
      gradeDistribution: gradeDistribution(rows, readGrade),
      sOrSPlusRatio: ratio(rows, (row) => ['S', 'S+'].includes(readGrade(row))),
      aOrAboveRatio: ratio(rows, (row) => gradeAtLeast(readGrade(row), 'A-')),
    },
    placement,
    firstMinusEighthGapReductionFromCurrent:
      currentGap != null && placement.firstMinusEighthAverage != null
        ? round((currentGap - placement.firstMinusEighthAverage) / currentGap)
        : null,
    correlations: {
      placement: placement.scorePlacementCorrelation,
      roleScore: pearson(rows.map((row) => row.roleScore), rows.map(readScore)),
      roleResidual: pearson(rows.map((row) => row.roleResidual), rows.map(readScore)),
      robustZ: pearson(rows.map((row) => row.robustZ), rows.map(readScore)),
    },
    specialComparisons: specialComparisons(rows, readScore, readGrade),
    fallbackLevel: groupDistribution(rows, (row) => row.fallbackLevel, readScore, readGrade),
    confidence: groupDistribution(rows, (row) => row.confidence, readScore, readGrade),
  }
}

function ratio(rows, predicate) {
  return rows.length > 0 ? round(rows.filter(predicate).length / rows.length) : 0
}

function placementSummary(rows, readScore, readGrade) {
  const byPlacement = {}
  for (let placement = 1; placement <= 8; placement += 1) {
    const group = rows.filter((row) => row.placement === placement)
    byPlacement[String(placement)] = {
      rowCount: group.length,
      averageScore: valuesStats(group.map(readScore)).mean,
      medianScore: valuesStats(group.map(readScore)).median,
      averageRoleScore: valuesStats(group.map((row) => row.roleScore)).mean,
      averageRoleResidual: valuesStats(group.map((row) => row.roleResidual)).mean,
      averageRobustZ: valuesStats(group.map((row) => row.robustZ)).mean,
      gradeDistribution: gradeDistribution(group, readGrade),
      sOrSPlusRatio: ratio(group, (row) => ['S', 'S+'].includes(readGrade(row))),
      aOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'A-')),
      cOrBelowRatio: ratio(group, (row) => gradeAtMost(readGrade(row), 'C+')),
    }
  }
  const firstMean = byPlacement['1'].averageScore
  const eighthMean = byPlacement['8'].averageScore
  return {
    byPlacement,
    firstMinusEighthAverage: firstMean != null && eighthMean != null ? round(firstMean - eighthMean) : null,
    scorePlacementCorrelation: pearson(rows.map((row) => row.placement), rows.map(readScore)),
  }
}

function groupDistribution(rows, readKey, readScore, readGrade) {
  const groups = new Map()
  for (const row of rows) {
    const key = readKey(row) ?? 'unknown'
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([key, group]) => [
    key,
    {
      rowCount: group.length,
      averageRoleResidual: valuesStats(group.map((row) => row.roleResidual)).mean,
      averageRobustZ: valuesStats(group.map((row) => row.robustZ)).mean,
      averageScore: valuesStats(group.map(readScore)).mean,
      gradeDistribution: gradeDistribution(group, readGrade),
      sOrSPlusRatio: ratio(group, (row) => ['S', 'S+'].includes(readGrade(row))),
      aOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'A-')),
      cOrBelowRatio: ratio(group, (row) => gradeAtMost(readGrade(row), 'C+')),
    },
  ]))
}

function specialComparisons(rows, readScore, readGrade) {
  const residuals = rows.map((row) => row.roleResidual).sort((a, b) => a - b)
  const p10 = percentile(residuals, 0.1)
  const p30 = percentile(residuals, 0.3)
  const p70 = percentile(residuals, 0.7)
  const p90 = percentile(residuals, 0.9)
  return {
    thresholds: { residualP10: round(p10), residualP30: round(p30), residualP70: round(p70), residualP90: round(p90) },
    lowResidualBottom30FirstPlace: summarizeGroup(rows.filter((row) => row.placement === 1 && row.roleResidual <= p30), readScore, readGrade),
    highResidualTop30EighthPlace: summarizeGroup(rows.filter((row) => row.placement === 8 && row.roleResidual >= p70), readScore, readGrade),
    highResidualTop10SeventhEighth: summarizeGroup(rows.filter((row) => (row.placement === 7 || row.placement === 8) && row.roleResidual >= p90), readScore, readGrade),
    lowResidualBottom10FirstSecond: summarizeGroup(rows.filter((row) => (row.placement === 1 || row.placement === 2) && row.roleResidual <= p10), readScore, readGrade),
    lowFirstBeatsHighEighth: crossGroupWinRatio(
      rows.filter((row) => row.placement === 1 && row.roleResidual <= p30),
      rows.filter((row) => row.placement === 8 && row.roleResidual >= p70),
      readGrade,
    ),
  }
}

function summarizeGroup(group, readScore, readGrade) {
  return {
    rowCount: group.length,
    averageResidual: valuesStats(group.map((row) => row.roleResidual)).mean,
    averageRobustZ: valuesStats(group.map((row) => row.robustZ)).mean,
    averageScore: valuesStats(group.map(readScore)).mean,
    gradeDistribution: gradeDistribution(group, readGrade),
    sOrSPlusRatio: ratio(group, (row) => ['S', 'S+'].includes(readGrade(row))),
    aOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'A-')),
    cOrBelowRatio: ratio(group, (row) => gradeAtMost(readGrade(row), 'C+')),
  }
}

function crossGroupWinRatio(left, right, readGrade) {
  let compared = 0
  let leftHigher = 0
  for (const a of left) {
    for (const b of right) {
      compared += 1
      if ((GRADE_RANK[readGrade(a)] ?? 0) > (GRADE_RANK[readGrade(b)] ?? 0)) leftHigher += 1
    }
  }
  return { comparedPairs: compared, leftHigherCount: leftHigher, ratio: compared > 0 ? round(leftHigher / compared) : null }
}

function recommend(report) {
  const candidates = RESIDUAL_CANDIDATES.map((candidate) => {
    const key = `${candidate}:residual-gate`
    const summary = report.variants[key]
    const gapReduction = summary.firstMinusEighthGapReductionFromCurrent ?? 0
    const firstAverage = summary.placement.byPlacement['1'].averageScore
    const ss = summary.overall.sOrSPlusRatio
    const residualCorr = Math.abs(summary.correlations.roleResidual ?? 0)
    const placementCorr = Math.abs(summary.correlations.placement ?? 0)
    const lowFirstS = summary.specialComparisons.lowResidualBottom30FirstPlace.sOrSPlusRatio
    const high78C = summary.specialComparisons.highResidualTop10SeventhEighth.cOrBelowRatio
    const largestGradeRatio = Math.max(
      ...Object.values(summary.overall.gradeDistribution).map((row) => row.ratio),
    )
    const passes =
      gapReduction >= 0.3 &&
      firstAverage < 90 &&
      ss >= 0.1 &&
      ss <= 0.16 &&
      lowFirstS === 0 &&
      high78C < 0.5 &&
      residualCorr > placementCorr &&
      largestGradeRatio < 0.25
    return {
      candidate,
      key,
      passes,
      gapReduction,
      firstAverage,
      sOrSPlusRatio: ss,
      residualCorr,
      placementCorr,
      lowFirstS,
      high78C,
      largestGradeRatio,
    }
  })
  const passing = candidates.filter((row) => row.passes)
  return {
    recommended: passing[0]?.candidate ?? null,
    gateMode: 'residual-gate',
    candidates,
    reason:
      passing.length > 0
        ? 'First passing candidate by the ordered R8/R10/R12 sweep.'
        : 'No candidate satisfies all selection gates simultaneously.',
  }
}

function formatText(report) {
  const lines = []
  lines.push('match-grade-residual-base shadow evaluation')
  lines.push(`generatedAt: ${report.generatedAt}`)
  lines.push(`evaluatedRows: ${report.summary.evaluatedRows}`)
  lines.push(`gradeCenter: ${report.robust.gradeCenter}`)
  lines.push(`residualMedian: ${report.robust.residual.median}`)
  lines.push(`MAD: ${report.robust.residual.mad}`)
  lines.push(`IQR: ${report.robust.residual.iqr}`)
  lines.push(`scale: ${report.robust.residual.scale} (${report.robust.residual.scaleSource})`)
  lines.push(`robustZ p70: ${report.robust.robustZThresholds.robustZP70}`)
  lines.push(`robustZ p95: ${report.robust.robustZThresholds.robustZP95}`)
  lines.push('')
  for (const key of VARIANT_ORDER) {
    const summary = report.variants[key]
    lines.push(`${key}: mean=${summary.overall.score.mean}, gap=${summary.placement.firstMinusEighthAverage}, S/S+=${summary.overall.sOrSPlusRatio}, A+=${summary.overall.aOrAboveRatio}, placeCorr=${summary.correlations.placement}, residualCorr=${summary.correlations.roleResidual}`)
  }
  lines.push('')
  lines.push(`recommendation: ${report.recommendation.recommended ?? 'none'}`)
  lines.push(report.recommendation.reason)
  lines.push('')
  return `${lines.join('\n')}\n`
}

async function loadResidualBaseline() {
  const raw = JSON.parse(await readFile(residualBaselinePath, 'utf8'))
  return {
    version: raw.baselineVersion,
    records: new Map(raw.records.map((record) => [record.exactKey, record])),
  }
}

async function main() {
  const residualBaseline = await loadResidualBaseline()
  const rows = await prisma.playerMatch.findMany({
    where: { gameMode: 'rank', displaySeasonId: CURRENT_DISPLAY_SEASON },
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

  const skipped = {
    unsupportedMode: 0,
    invalidPlacement: 0,
    missingTier: 0,
    missingDuration: 0,
    missingRole: 0,
    missingResidualBaseline: 0,
    missingGradeInput: 0,
    missingRoleScore: 0,
    missingRobustScale: 0,
  }
  const evaluated = []

  for (const row of rows) {
    if (row.gameMode !== 'rank') {
      skipped.unsupportedMode += 1
      continue
    }
    if (!Number.isFinite(row.placement) || row.placement < 1 || row.placement > 8) {
      skipped.invalidPlacement += 1
      continue
    }
    if (!Number.isFinite(row.gameDuration) || row.gameDuration <= 0) {
      skipped.missingDuration += 1
      continue
    }
    const playerTier = normalizeRankTier({ rp: row.rpAfter, displaySeason: row.displaySeasonId })
    const tierKey = rankTierToGradeBaselineKey(playerTier)
    if (!tierKey) {
      skipped.missingTier += 1
      continue
    }
    const weaponTypeId = row.bestWeapon ?? null
    const role = weaponTypeId != null && weaponTypeId > 0 ? lookupCharacterWeaponRole(row.characterNum, weaponTypeId) : null
    if (!role || weaponTypeId == null || weaponTypeId <= 0) {
      skipped.missingRole += 1
      continue
    }
    const production = computeMatchPerformanceGrade({ row, playerTier, displaySeasonId: row.displaySeasonId })
    if (production.matchGrade == null || production.matchGradeScore == null) {
      skipped.missingGradeInput += 1
      continue
    }
    if (production.matchGradeRoleScore == null) {
      skipped.missingRoleScore += 1
      continue
    }
    const record = residualBaseline.records.get(
      exactKey({
        season: row.displaySeasonId,
        mode: row.gameMode,
        tier: tierKey,
        characterNum: row.characterNum,
        weaponTypeId,
        role,
        placementBucket: placementBucket(row.placement),
        durationBucket: durationBucket(row.gameDuration),
      }),
    )
    const expected = record?.expected?.rolePerformanceScore
    if (expected == null || !Number.isFinite(expected)) {
      skipped.missingResidualBaseline += 1
      continue
    }
    const yA = evaluateOutcomeCapCandidate({
      candidate: 'A',
      input: {
        roleScore: production.matchGradeRoleScore,
        placement: row.placement,
        outcomeScore: production.matchGradeOutcomeScore,
      },
      gateMode: 'v2-placement-guard',
    })
    evaluated.push({
      placement: row.placement,
      roleScore: production.matchGradeRoleScore,
      outcomeScore: production.matchGradeOutcomeScore,
      roleResidual: round(production.matchGradeRoleScore - expected),
      expectedRoleScore: expected,
      currentScore: production.matchGradeScore,
      currentGrade: production.matchGrade,
      fallbackLevel: record.fallbackLevel,
      sampleCount: record.sampleCount,
      confidence: confidenceForFallback(record.fallbackLevel),
      variants: {
        'A:v2-placement-guard': yA ? { score: yA.score, grade: yA.grade } : null,
      },
    })
  }

  const residualStats = robustScaleStats(evaluated.map((row) => row.roleResidual))
  if (residualStats.scale == null) {
    skipped.missingRobustScale = evaluated.length
  }
  const gradeCenter = valuesStats(evaluated.map((row) => row.currentScore)).median
  const withRobust = evaluated
    .map((row) => {
      if (residualStats.scale == null || residualStats.median == null || gradeCenter == null) return null
      const robustZ = Math.max(-3, Math.min(3, (row.roleResidual - residualStats.median) / residualStats.scale))
      return { ...row, robustZ: round(robustZ) }
    })
    .filter((row) => row != null)

  const sortedRobustZ = withRobust.map((row) => row.robustZ).sort((a, b) => a - b)
  const thresholds = {
    robustZP70: round(percentile(sortedRobustZ, 0.7)),
    robustZP95: round(percentile(sortedRobustZ, 0.95)),
  }

  for (const row of withRobust) {
    for (const candidate of RESIDUAL_CANDIDATES) {
      for (const gateMode of RESIDUAL_GATE_MODES) {
        const result = evaluateResidualBaseCandidate({
          candidate,
          input: {
            roleResidual: row.roleResidual,
            productionRoleScore: row.roleScore,
            productionOutcomeScore: row.outcomeScore,
            placement: row.placement,
            robustStats: residualStats,
            gradeCenter,
          },
          thresholds,
          gateMode,
        })
        row.variants[`${candidate}:${gateMode}`] = result ? { score: result.score, grade: result.grade } : null
      }
    }
  }

  const currentGap = placementSummary(withRobust, currentReadScore, currentReadGrade).firstMinusEighthAverage
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      mode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      selectedIdentifiers: [],
    },
    protectedPaths: {
      productionGradeModified: false,
      characterGradeModified: false,
      overallGradeModified: false,
      teamLuckModified: false,
      apiOrUiModified: false,
    },
    baseline: {
      residualBaselineVersion: residualBaseline.version,
      benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
      lookupCondition: 'season+mode+tier+characterNum+weaponTypeId+role+placementBucket+durationBucket',
    },
    productionFormula: {
      finalScore: `outcomeScore * ${OUTCOME_SCORE_WEIGHT} + roleScore * ${ROLE_SCORE_WEIGHT}`,
      roleScoreIndirectPlacementLinks: [
        'roleScore does not directly include placement, victory, top3, or RP delta.',
        'roleScore includes deaths/survival and combat metrics that correlate with placement.',
        'The residual baseline conditions on placement and duration, exposing the indirect placement-linked component.',
      ],
    },
    summary: {
      sourceRows: rows.length,
      evaluatedRows: withRobust.length,
      skipped,
    },
    robust: {
      residual: residualStats,
      gradeCenter,
      robustZ: valuesStats(withRobust.map((row) => row.robustZ)),
      robustZThresholds: thresholds,
      fallbackLevelResidualDistribution: groupDistribution(withRobust, (row) => row.fallbackLevel, (row) => row.roleResidual, () => 'B'),
    },
    variants: {
      production: summarizeVariant(withRobust, currentReadScore, currentReadGrade, currentGap),
      'A:v2-placement-guard': summarizeVariant(
        withRobust,
        variantReaders('A:v2-placement-guard').readScore,
        variantReaders('A:v2-placement-guard').readGrade,
        currentGap,
      ),
      ...Object.fromEntries(
        RESIDUAL_CANDIDATES.flatMap((candidate) =>
          RESIDUAL_GATE_MODES.map((gateMode) => {
            const key = `${candidate}:${gateMode}`
            const readers = variantReaders(key)
            return [key, summarizeVariant(withRobust, readers.readScore, readers.readGrade, currentGap)]
          }),
        ),
      ),
    },
    notes: [
      'No production grade, character grade, Overall Grade, team luck, API, UI, DB migration, or snapshot path was modified.',
      'No personal or match identifiers are selected or written to the report.',
      'Missing residual baseline or robust scale rows are skipped; missing values are not replaced with zero.',
      'The residual baseline artifact is read-only and reused as the expected roleScore source.',
    ],
  }
  report.recommendation = recommend(report)

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(outputTxt, formatText(report), 'utf8')
  console.log(JSON.stringify({
    files: { json: outputJson, text: outputTxt },
    evaluatedRows: report.summary.evaluatedRows,
    skipped: report.summary.skipped,
    robust: report.robust,
    variants: Object.fromEntries(VARIANT_ORDER.map((key) => [
      key,
      {
        mean: report.variants[key].overall.score.mean,
        gap: report.variants[key].placement.firstMinusEighthAverage,
        gapReduction: report.variants[key].firstMinusEighthGapReductionFromCurrent,
        sOrSPlus: report.variants[key].overall.sOrSPlusRatio,
        aOrAbove: report.variants[key].overall.aOrAboveRatio,
        placementCorrelation: report.variants[key].correlations.placement,
        residualCorrelation: report.variants[key].correlations.roleResidual,
      },
    ])),
    recommendation: report.recommendation,
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
