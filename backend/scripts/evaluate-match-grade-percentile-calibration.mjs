#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { CHARACTER_GRADE_BENCHMARK_VERSION } from '../dist/services/characterPerformanceGrade/config.js'
import { computeMatchPerformanceGrade } from '../dist/services/characterPerformanceGrade/compute.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { normalizeRankTier } from '../dist/utils/rankTier.js'
import { evaluateOutcomeCapCandidate } from '../dist/analysis/shadow/matchGradeOutcomeCap.js'
import { evaluateResidualBaseCandidate } from '../dist/analysis/shadow/matchGradeResidualBase.js'
import {
  computePercentileBaseScore,
  empiricalPercentileMidrank,
  evaluatePercentileCalibrationCandidate,
  gateThresholdFromProductionRatio,
  quantileInterpolated,
} from '../dist/analysis/shadow/matchGradePercentileCalibration.js'

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
const outputDir = join(repoRoot, 'reports', 'match-grade-percentile-calibration')
const outputJson = join(outputDir, 'evaluation-report.json')
const outputTxt = join(outputDir, 'evaluation-report.txt')

const prisma = new PrismaClient()
const GRADE_ORDER = ['S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-']
const GRADE_RANK = Object.fromEntries(GRADE_ORDER.map((grade, index) => [grade, GRADE_ORDER.length - index]))
const PERCENTILE_CANDIDATES = ['P0', 'P4', 'P6']
const VARIANT_ORDER = ['production', 'A:v2-placement-guard', 'R12:residual-gate', 'P0', 'P4', 'P6']
const TARGET_QUANTILES = [0.01, 0.05, 0.1, 0.25, 0.5, 0.7, 0.8, 0.84, 0.88, 0.9, 0.95, 0.99]
const SAFE_MINIMUM_SCALE = 1

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function ratio(rows, predicate) {
  return rows.length > 0 ? round(rows.filter(predicate).length / rows.length) : 0
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
      p95: null,
    }
  }
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / clean.length
  return {
    count: clean.length,
    mean: round(mean),
    median: round(quantileInterpolated(clean, 0.5)),
    standardDeviation: round(Math.sqrt(variance)),
    p10: round(quantileInterpolated(clean, 0.1)),
    p25: round(quantileInterpolated(clean, 0.25)),
    p75: round(quantileInterpolated(clean, 0.75)),
    p90: round(quantileInterpolated(clean, 0.9)),
    p95: round(quantileInterpolated(clean, 0.95)),
  }
}

function medianAbsoluteDeviation(values, median) {
  const deviations = values.map((value) => Math.abs(value - median)).sort((a, b) => a - b)
  return quantileInterpolated(deviations, 0.5)
}

function robustScaleStats(values) {
  const clean = values.filter((value) => value != null && Number.isFinite(value)).sort((a, b) => a - b)
  if (clean.length < 2) {
    return { median: null, mad: null, iqr: null, scale: null, scaleSource: 'unavailable', safeMinimum: SAFE_MINIMUM_SCALE }
  }
  const median = quantileInterpolated(clean, 0.5)
  const mad = medianAbsoluteDeviation(clean, median)
  const p25 = quantileInterpolated(clean, 0.25)
  const p75 = quantileInterpolated(clean, 0.75)
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

function gradeAtLeast(grade, threshold) {
  return (GRADE_RANK[grade] ?? 0) >= (GRADE_RANK[threshold] ?? Number.POSITIVE_INFINITY)
}

function gradeAtMost(grade, threshold) {
  return (GRADE_RANK[grade] ?? Number.POSITIVE_INFINITY) <= (GRADE_RANK[threshold] ?? 0)
}

function gradeStepDistance(a, b) {
  const left = GRADE_ORDER.indexOf(a)
  const right = GRADE_ORDER.indexOf(b)
  if (left < 0 || right < 0) return null
  return Math.abs(left - right)
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

function groupDistribution(rows, readKey, readScore, readGrade) {
  const groups = new Map()
  for (const row of rows) {
    const key = readKey(row) ?? 'unknown'
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([key, group]) => [
        key,
        {
          rowCount: group.length,
          score: valuesStats(group.map(readScore)),
          gradeDistribution: gradeDistribution(group, readGrade),
          sPlusRatio: ratio(group, (row) => readGrade(row) === 'S+'),
          sOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'S')),
          sFamilyOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'S-')),
          aOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'A-')),
          residualPercentile: valuesStats(group.map((row) => row.residualPercentile)),
        },
      ]),
  )
}

function placementSummary(rows, readScore, readGrade) {
  const byPlacement = {}
  for (let placement = 1; placement <= 8; placement += 1) {
    const group = rows.filter((row) => row.placement === placement)
    byPlacement[String(placement)] = {
      rowCount: group.length,
      score: valuesStats(group.map(readScore)),
      gradeDistribution: gradeDistribution(group, readGrade),
      sPlusRatio: ratio(group, (row) => readGrade(row) === 'S+'),
      sOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'S')),
      aOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'A-')),
      cOrBelowRatio: ratio(group, (row) => gradeAtMost(readGrade(row), 'C+')),
    }
  }
  const firstMean = byPlacement['1'].score.mean
  const eighthMean = byPlacement['8'].score.mean
  return {
    byPlacement,
    firstMinusEighthAverage: firstMean != null && eighthMean != null ? round(firstMean - eighthMean) : null,
    scorePlacementCorrelation: pearson(rows.map((row) => row.placement), rows.map(readScore)),
  }
}

function summarizeGroup(group, readScore, readGrade) {
  return {
    rowCount: group.length,
    score: valuesStats(group.map(readScore)),
    residualPercentile: valuesStats(group.map((row) => row.residualPercentile)),
    gradeDistribution: gradeDistribution(group, readGrade),
    sPlusRatio: ratio(group, (row) => readGrade(row) === 'S+'),
    sOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'S')),
    sFamilyOrAboveRatio: ratio(group, (row) => gradeAtLeast(readGrade(row), 'S-')),
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

function samePercentileBucketGap(rows, readScore) {
  const buckets = []
  for (let bucket = 0; bucket < 10; bucket += 1) {
    const min = bucket / 10
    const max = (bucket + 1) / 10
    const group = rows.filter((row) =>
      bucket === 9
        ? row.residualPercentile >= min && row.residualPercentile <= max
        : row.residualPercentile >= min && row.residualPercentile < max,
    )
    const first = group.filter((row) => row.placement === 1)
    const eighth = group.filter((row) => row.placement === 8)
    const firstMean = valuesStats(first.map(readScore)).mean
    const eighthMean = valuesStats(eighth.map(readScore)).mean
    buckets.push({
      bucket: `${Math.round(min * 100)}-${Math.round(max * 100)}`,
      firstRows: first.length,
      eighthRows: eighth.length,
      firstMinusEighthAverage: firstMean != null && eighthMean != null ? round(firstMean - eighthMean) : null,
    })
  }
  const gaps = buckets.map((row) => row.firstMinusEighthAverage).filter((value) => value != null)
  return {
    buckets,
    meanAbsoluteGap: valuesStats(gaps.map((value) => Math.abs(value))).mean,
    maxAbsoluteGap: gaps.length > 0 ? round(Math.max(...gaps.map((value) => Math.abs(value)))) : null,
  }
}

function specialComparisons(rows, readScore, readGrade, baseReaders = null) {
  const lowFirst = rows.filter((row) => row.placement === 1 && row.residualPercentile <= 0.3)
  const highEighth = rows.filter((row) => row.placement === 8 && row.residualPercentile >= 0.7)
  const result = {
    lowResidualBottom30FirstPlace: summarizeGroup(lowFirst, readScore, readGrade),
    highResidualTop30EighthPlace: summarizeGroup(highEighth, readScore, readGrade),
    highResidualTop10SeventhEighth: summarizeGroup(
      rows.filter((row) => (row.placement === 7 || row.placement === 8) && row.residualPercentile >= 0.9),
      readScore,
      readGrade,
    ),
    lowResidualBottom10FirstSecond: summarizeGroup(
      rows.filter((row) => (row.placement === 1 || row.placement === 2) && row.residualPercentile <= 0.1),
      readScore,
      readGrade,
    ),
    lowFirstBeatsHighEighth: crossGroupWinRatio(lowFirst, highEighth, readGrade),
    samePercentileBucketFirstEighthGap: samePercentileBucketGap(rows, readScore),
    placementAdjustmentGradeChange: null,
  }

  if (baseReaders) {
    let oneOrMore = 0
    let twoOrMore = 0
    let compared = 0
    for (const row of rows) {
      const distance = gradeStepDistance(readGrade(row), baseReaders.readGrade(row))
      if (distance == null) continue
      compared += 1
      if (distance >= 1) oneOrMore += 1
      if (distance >= 2) twoOrMore += 1
    }
    result.placementAdjustmentGradeChange = {
      comparedRows: compared,
      oneOrMoreStepRatio: compared > 0 ? round(oneOrMore / compared) : null,
      twoOrMoreStepRatio: compared > 0 ? round(twoOrMore / compared) : null,
    }
  }

  return result
}

function summarizeVariant(rows, readScore, readGrade, currentGap, baseReaders = null) {
  const placement = placementSummary(rows, readScore, readGrade)
  const absChanges = rows.map((row) => Math.abs(readScore(row) - row.currentScore))
  const changedGrades = rows.filter((row) => readGrade(row) !== row.currentGrade).length
  return {
    overall: {
      rowCount: rows.length,
      score: valuesStats(rows.map(readScore)),
      gradeDistribution: gradeDistribution(rows, readGrade),
      sPlusRatio: ratio(rows, (row) => readGrade(row) === 'S+'),
      sOrAboveRatio: ratio(rows, (row) => gradeAtLeast(readGrade(row), 'S')),
      sFamilyOrAboveRatio: ratio(rows, (row) => gradeAtLeast(readGrade(row), 'S-')),
      aOrAboveRatio: ratio(rows, (row) => gradeAtLeast(readGrade(row), 'A-')),
      changedFromProduction: {
        count: changedGrades,
        ratio: rows.length > 0 ? round(changedGrades / rows.length) : 0,
      },
      absoluteScoreChangeFromProduction: {
        mean: valuesStats(absChanges).mean,
        p90: round(quantileInterpolated(absChanges.sort((a, b) => a - b), 0.9)),
      },
    },
    placement,
    firstMinusEighthGapReductionFromProduction:
      currentGap != null && placement.firstMinusEighthAverage != null
        ? round((currentGap - placement.firstMinusEighthAverage) / currentGap)
        : null,
    correlations: {
      placement: placement.scorePlacementCorrelation,
      roleScore: pearson(rows.map((row) => row.roleScore), rows.map(readScore)),
      roleResidual: pearson(rows.map((row) => row.roleResidual), rows.map(readScore)),
      residualPercentile: pearson(rows.map((row) => row.residualPercentile), rows.map(readScore)),
    },
    specialComparisons: specialComparisons(rows, readScore, readGrade, baseReaders),
    fallbackLevel: groupDistribution(rows, (row) => row.fallbackLevel, readScore, readGrade),
    confidence: groupDistribution(rows, (row) => row.confidence, readScore, readGrade),
  }
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

function splitByPlayedAt(rows) {
  const groups = new Map()
  for (const row of rows) {
    const group = groups.get(row.internalContestId) ?? {
      internalContestId: row.internalContestId,
      playedAtMs: row.playedAt.getTime(),
      rows: [],
    }
    group.rows.push(row)
    if (row.playedAt.getTime() < group.playedAtMs) group.playedAtMs = row.playedAt.getTime()
    groups.set(row.internalContestId, group)
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    if (a.playedAtMs !== b.playedAtMs) return a.playedAtMs - b.playedAtMs
    return a.internalContestId.localeCompare(b.internalContestId)
  })
  const calibrationGroupCount = Math.max(1, Math.floor(sortedGroups.length * 0.8))
  const calibrationIds = new Set(sortedGroups.slice(0, calibrationGroupCount).map((group) => group.internalContestId))
  const calibration = []
  const holdout = []
  for (const row of rows) {
    if (calibrationIds.has(row.internalContestId)) calibration.push(row)
    else holdout.push(row)
  }
  const leakCount = [...groups.values()].filter((group) => {
    const splits = new Set(group.rows.map((row) => (calibrationIds.has(row.internalContestId) ? 'calibration' : 'holdout')))
    return splits.size > 1
  }).length

  return {
    strategy: 'playedAt ascending: oldest 80% contests calibration, newest 20% contests holdout',
    calibration,
    holdout,
    contestCounts: {
      total: sortedGroups.length,
      calibration: calibrationGroupCount,
      holdout: sortedGroups.length - calibrationGroupCount,
    },
    leakageContestCount: leakCount,
    playedAtRange: {
      calibrationFrom: calibration.length > 0 ? new Date(Math.min(...calibration.map((row) => row.playedAt.getTime()))).toISOString() : null,
      calibrationTo: calibration.length > 0 ? new Date(Math.max(...calibration.map((row) => row.playedAt.getTime()))).toISOString() : null,
      holdoutFrom: holdout.length > 0 ? new Date(Math.min(...holdout.map((row) => row.playedAt.getTime()))).toISOString() : null,
      holdoutTo: holdout.length > 0 ? new Date(Math.max(...holdout.map((row) => row.playedAt.getTime()))).toISOString() : null,
    },
  }
}

function productionRatios(rows) {
  return {
    sFamilyOrAbove: ratio(rows, (row) => gradeAtLeast(row.currentGrade, 'S-')),
    sOrAbove: ratio(rows, (row) => gradeAtLeast(row.currentGrade, 'S')),
    sPlus: ratio(rows, (row) => row.currentGrade === 'S+'),
  }
}

function buildTargetCurve(sortedProductionScores) {
  return Object.fromEntries(
    TARGET_QUANTILES.map((q) => [`p${String(Math.round(q * 100)).padStart(2, '0')}`, round(quantileInterpolated(sortedProductionScores, q))]),
  )
}

function recommend(report) {
  const production = report.variants.production
  const candidates = PERCENTILE_CANDIDATES.map((candidate) => {
    const summary = report.variants[candidate]
    const gapReduction = summary.firstMinusEighthGapReductionFromProduction ?? 0
    const sOrAbove = summary.overall.sOrAboveRatio
    const aOrAbove = summary.overall.aOrAboveRatio
    const placementCorr = Math.abs(summary.correlations.placement ?? 0)
    const productionPlacementCorr = Math.abs(production.correlations.placement ?? 0)
    const percentileCorr = Math.abs(summary.correlations.residualPercentile ?? 0)
    const lowFirstSFamily = summary.specialComparisons.lowResidualBottom30FirstPlace.sFamilyOrAboveRatio
    const highEighthC = summary.specialComparisons.highResidualTop30EighthPlace.cOrBelowRatio
    const sameBucketMaxGap = summary.specialComparisons.samePercentileBucketFirstEighthGap.maxAbsoluteGap
    const modifierSpread = candidate === 'P0' ? 0 : candidate === 'P4' ? 8 : 12
    const largestGradeRatio = Math.max(...Object.values(summary.overall.gradeDistribution).map((row) => row.ratio))
    const lowConfidence = summary.confidence.low
    const lowConfidenceSOrAbove = lowConfidence?.sOrAboveRatio ?? 0
    const passes =
      sOrAbove >= 0.09 &&
      sOrAbove <= 0.15 &&
      aOrAbove >= 0.27 &&
      aOrAbove <= 0.35 &&
      gapReduction >= 0.35 &&
      placementCorr < productionPlacementCorr &&
      percentileCorr > placementCorr &&
      lowFirstSFamily === 0 &&
      highEighthC < 0.5 &&
      (sameBucketMaxGap == null || sameBucketMaxGap <= modifierSpread + 2) &&
      largestGradeRatio < 0.25 &&
      lowConfidenceSOrAbove <= sOrAbove + 0.05
    return {
      candidate,
      passes,
      sOrAboveRatio: sOrAbove,
      aOrAboveRatio: aOrAbove,
      gapReduction,
      placementCorr,
      residualPercentileCorr: percentileCorr,
      lowFirstSFamily,
      highEighthC,
      sameBucketMaxGap,
      largestGradeRatio,
      lowConfidenceSOrAbove,
      distanceToProductionRarity: round(
        Math.abs(sOrAbove - production.overall.sOrAboveRatio) +
          Math.abs(aOrAbove - production.overall.aOrAboveRatio),
      ),
    }
  })
  const passing = candidates
    .filter((row) => row.passes)
    .sort((a, b) => a.distanceToProductionRarity - b.distanceToProductionRarity)
  return {
    recommended: passing[0]?.candidate ?? null,
    candidates,
    reason:
      passing.length > 0
        ? 'Selected among passing P0/P4/P6 candidates by closest production rarity profile.'
        : 'No percentile calibration candidate satisfies all promotion gates simultaneously.',
  }
}

function formatText(report) {
  const lines = []
  lines.push('match-grade-percentile-calibration shadow evaluation')
  lines.push(`generatedAt: ${report.generatedAt}`)
  lines.push(`calibrationRows: ${report.split.calibration.rows}`)
  lines.push(`holdoutRows: ${report.split.holdout.rows}`)
  lines.push(`splitLeakage: ${report.split.leakageContestCount}`)
  lines.push(`target p50/p90/p95: ${report.calibration.productionTargetCurve.p50} / ${report.calibration.productionTargetCurve.p90} / ${report.calibration.productionTargetCurve.p95}`)
  lines.push(`gates S-family/S/S+: ${report.calibration.residualPercentileGates.sFamily.thresholdPercentile} / ${report.calibration.residualPercentileGates.s.thresholdPercentile} / ${report.calibration.residualPercentileGates.sPlus.thresholdPercentile}`)
  lines.push('')
  for (const key of VARIANT_ORDER) {
    const summary = report.variants[key]
    lines.push(`${key}: mean=${summary.overall.score.mean}, gap=${summary.placement.firstMinusEighthAverage}, S+=${summary.overall.sPlusRatio}, S+S=${summary.overall.sOrAboveRatio}, S-family=${summary.overall.sFamilyOrAboveRatio}, A+=${summary.overall.aOrAboveRatio}, placeCorr=${summary.correlations.placement}, pctCorr=${summary.correlations.residualPercentile}`)
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
      gameId: true,
      playedAt: true,
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
    missingPercentileInput: 0,
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
    if (!yA) {
      skipped.missingGradeInput += 1
      continue
    }

    evaluated.push({
      internalContestId: row.gameId,
      playedAt: row.playedAt,
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
        'A:v2-placement-guard': { score: yA.score, grade: yA.grade },
      },
    })
  }

  const split = splitByPlayedAt(evaluated)
  const calibrationRows = split.calibration
  const holdoutRows = split.holdout
  const calibrationResiduals = calibrationRows.map((row) => row.roleResidual).sort((a, b) => a - b)
  const calibrationProductionScores = calibrationRows.map((row) => row.currentScore).sort((a, b) => a - b)
  const calibrationProductionRatios = productionRatios(calibrationRows)
  const percentileGates = {
    sFamily: {
      productionRatio: calibrationProductionRatios.sFamilyOrAbove,
      thresholdPercentile: gateThresholdFromProductionRatio(calibrationProductionRatios.sFamilyOrAbove),
    },
    s: {
      productionRatio: calibrationProductionRatios.sOrAbove,
      thresholdPercentile: gateThresholdFromProductionRatio(calibrationProductionRatios.sOrAbove),
    },
    sPlus: {
      productionRatio: calibrationProductionRatios.sPlus,
      thresholdPercentile: gateThresholdFromProductionRatio(calibrationProductionRatios.sPlus),
    },
  }
  for (const value of Object.values(percentileGates)) {
    value.residualCutoff = round(quantileInterpolated(calibrationResiduals, value.thresholdPercentile))
  }

  const residualStats = robustScaleStats(calibrationRows.map((row) => row.roleResidual))
  const gradeCenter = valuesStats(calibrationRows.map((row) => row.currentScore)).median
  const calibrationRobustRows = calibrationRows
    .map((row) => {
      if (residualStats.scale == null || residualStats.median == null) return null
      return round(Math.max(-3, Math.min(3, (row.roleResidual - residualStats.median) / residualStats.scale)))
    })
    .filter((value) => value != null)
    .sort((a, b) => a - b)
  const r12Thresholds = {
    robustZP70: round(quantileInterpolated(calibrationRobustRows, 0.7)),
    robustZP95: round(quantileInterpolated(calibrationRobustRows, 0.95)),
  }

  const holdout = []
  for (const row of holdoutRows) {
    const residualPercentile = empiricalPercentileMidrank(calibrationResiduals, row.roleResidual)
    const baseScore = residualPercentile == null
      ? null
      : computePercentileBaseScore({
          targetProductionScores: calibrationProductionScores,
          residualPercentile,
        })
    if (residualPercentile == null || baseScore == null) {
      skipped.missingPercentileInput += 1
      continue
    }
    const robustZ =
      residualStats.scale == null || residualStats.median == null
        ? null
        : round(Math.max(-3, Math.min(3, (row.roleResidual - residualStats.median) / residualStats.scale)))
    if (robustZ == null || gradeCenter == null) {
      skipped.missingRobustScale += 1
      continue
    }
    const next = {
      ...row,
      residualPercentile: round(residualPercentile),
      baseScore,
      robustZ,
    }

    const r12 = evaluateResidualBaseCandidate({
      candidate: 'R12',
      input: {
        roleResidual: next.roleResidual,
        productionRoleScore: next.roleScore,
        productionOutcomeScore: next.outcomeScore,
        placement: next.placement,
        robustStats: residualStats,
        gradeCenter,
      },
      thresholds: r12Thresholds,
      gateMode: 'residual-gate',
    })
    if (!r12) {
      skipped.missingRobustScale += 1
      continue
    }
    next.variants['R12:residual-gate'] = { score: r12.score, grade: r12.grade }

    for (const candidate of PERCENTILE_CANDIDATES) {
      const result = evaluatePercentileCalibrationCandidate({
        candidate,
        input: {
          residualPercentile: next.residualPercentile,
          baseScore: next.baseScore,
          placement: next.placement,
        },
        thresholds: {
          sFamily: percentileGates.sFamily.thresholdPercentile,
          s: percentileGates.s.thresholdPercentile,
          sPlus: percentileGates.sPlus.thresholdPercentile,
        },
      })
      if (!result) {
        skipped.missingPercentileInput += 1
        continue
      }
      next.variants[candidate] = {
        score: result.score,
        grade: result.grade,
        placementModifier: result.placementModifier,
      }
    }
    if (PERCENTILE_CANDIDATES.every((candidate) => next.variants[candidate])) holdout.push(next)
  }

  const currentGap = placementSummary(holdout, currentReadScore, currentReadGrade).firstMinusEighthAverage
  const p0Readers = variantReaders('P0')
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      mode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      personalOrContestIdentifiersWritten: false,
    },
    protectedPaths: {
      productionGradeModified: false,
      characterGradeModified: false,
      overallGradeModified: false,
      teamLuckModified: false,
      apiOrUiModified: false,
      dbMigrationModified: false,
    },
    baseline: {
      residualBaselineVersion: residualBaseline.version,
      benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
      lookupCondition: 'season+mode+tier+characterNum+weaponTypeId+role+placementBucket+durationBucket',
      artifactUsage: 'read-only',
    },
    split: {
      strategy: split.strategy,
      calibration: {
        rows: calibrationRows.length,
        contests: split.contestCounts.calibration,
        from: split.playedAtRange.calibrationFrom,
        to: split.playedAtRange.calibrationTo,
      },
      holdout: {
        rows: holdout.length,
        contests: split.contestCounts.holdout,
        from: split.playedAtRange.holdoutFrom,
        to: split.playedAtRange.holdoutTo,
      },
      leakageContestCount: split.leakageContestCount,
    },
    calibration: {
      residualCdfRows: calibrationResiduals.length,
      holdoutExcludedFromCdf: true,
      productionTargetCurve: buildTargetCurve(calibrationProductionScores),
      productionGradeRatios: calibrationProductionRatios,
      residualPercentileGates: percentileGates,
      r12ComparisonCalibration: {
        robustResidual: residualStats,
        gradeCenter,
        thresholds: r12Thresholds,
      },
    },
    summary: {
      sourceRows: rows.length,
      evaluatedRowsBeforeSplit: evaluated.length,
      holdoutEvaluatedRows: holdout.length,
      skipped,
    },
    variants: {
      production: summarizeVariant(holdout, currentReadScore, currentReadGrade, currentGap),
      'A:v2-placement-guard': summarizeVariant(
        holdout,
        variantReaders('A:v2-placement-guard').readScore,
        variantReaders('A:v2-placement-guard').readGrade,
        currentGap,
      ),
      'R12:residual-gate': summarizeVariant(
        holdout,
        variantReaders('R12:residual-gate').readScore,
        variantReaders('R12:residual-gate').readGrade,
        currentGap,
      ),
      P0: summarizeVariant(holdout, p0Readers.readScore, p0Readers.readGrade, currentGap),
      P4: summarizeVariant(
        holdout,
        variantReaders('P4').readScore,
        variantReaders('P4').readGrade,
        currentGap,
        p0Readers,
      ),
      P6: summarizeVariant(
        holdout,
        variantReaders('P6').readScore,
        variantReaders('P6').readGrade,
        currentGap,
        p0Readers,
      ),
    },
    notes: [
      'Shadow-only report. No production grade, character grade, Overall Grade, team luck, API, UI, DB migration, or snapshot path was modified.',
      'The residual baseline artifact is reused read-only. Missing values are skipped, never filled with zero.',
      'Calibration uses only the older 80 percent contest split; holdout rows are not included in the CDF or target curve.',
      'No personal or contest identifier values are written to this report.',
    ],
  }
  report.recommendation = recommend(report)

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(outputTxt, formatText(report), 'utf8')
  console.log(JSON.stringify({
    files: { json: outputJson, text: outputTxt },
    split: report.split,
    gates: report.calibration.residualPercentileGates,
    variants: Object.fromEntries(VARIANT_ORDER.map((key) => [
      key,
      {
        mean: report.variants[key].overall.score.mean,
        gap: report.variants[key].placement.firstMinusEighthAverage,
        gapReduction: report.variants[key].firstMinusEighthGapReductionFromProduction,
        sPlus: report.variants[key].overall.sPlusRatio,
        sOrAbove: report.variants[key].overall.sOrAboveRatio,
        sFamilyOrAbove: report.variants[key].overall.sFamilyOrAboveRatio,
        aOrAbove: report.variants[key].overall.aOrAboveRatio,
        placementCorrelation: report.variants[key].correlations.placement,
        percentileCorrelation: report.variants[key].correlations.residualPercentile,
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
