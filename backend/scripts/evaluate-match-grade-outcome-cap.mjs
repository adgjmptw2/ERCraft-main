#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  CHARACTER_GRADE_BENCHMARK_VERSION,
  FINE_GRADE_CUTS,
  MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE,
  MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE,
  MATCH_GRADE_S_ROLE_SCORE_GATE,
  OUTCOME_SCORE_WEIGHT,
  ROLE_SCORE_WEIGHT,
} from '../dist/services/characterPerformanceGrade/config.js'
import { computeMatchPerformanceGrade } from '../dist/services/characterPerformanceGrade/compute.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { normalizeRankTier } from '../dist/utils/rankTier.js'
import {
  evaluateOutcomeCapCandidate,
  isOutcomeCapEvaluationMode,
} from '../dist/analysis/shadow/matchGradeOutcomeCap.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const repoRoot = join(backendRoot, '..')
const outputDir = join(repoRoot, 'reports', 'match-grade-outcome-cap')
const outputJson = join(outputDir, 'evaluation-report.json')
const outputTxt = join(outputDir, 'evaluation-report.txt')

const prisma = new PrismaClient()
const CANDIDATES = ['A', 'B', 'C']
const GATE_MODES = ['production-gate', 'v2-placement-guard']
const GRADE_ORDER = ['S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-']
const GRADE_RANK = Object.fromEntries(GRADE_ORDER.map((grade, index) => [grade, GRADE_ORDER.length - index]))
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

function round2(value) {
  return round(value, 2)
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
    return { count: 0, mean: null, median: null, standardDeviation: null, p10: null, p25: null, p75: null, p90: null }
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

function gradeDistribution(rows, readGrade) {
  const counts = Object.fromEntries(GRADE_ORDER.map((grade) => [grade, 0]))
  for (const row of rows) {
    const grade = readGrade(row)
    if (grade in counts) counts[grade] += 1
  }
  const total = rows.length
  return Object.fromEntries(
    GRADE_ORDER.map((grade) => [
      grade,
      {
        count: counts[grade],
        ratio: total > 0 ? round(counts[grade] / total) : 0,
      },
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

function roleBin(score) {
  return ROLE_BINS.find((bin) => score >= bin.min && score <= bin.max)?.key ?? 'out-of-range'
}

function summarizeScores(rows, readScore, readGrade, currentRows = rows) {
  const scores = rows.map(readScore)
  const currentScores = currentRows.map((row) => row.currentScore)
  const deltas = scores.map((score, index) =>
    score != null && currentScores[index] != null ? round(score - currentScores[index]) : null,
  )
  const absDeltas = deltas.map((value) => (value == null ? null : Math.abs(value)))
  const changed = rows.filter((row) => readGrade(row) !== row.currentGrade).length
  return {
    rowCount: rows.length,
    score: valuesStats(scores),
    gradeDistribution: gradeDistribution(rows, readGrade),
    changedFromCurrent: {
      count: changed,
      ratio: rows.length > 0 ? round(changed / rows.length) : 0,
    },
    scoreChangeFromCurrent: {
      meanAbsolute: valuesStats(absDeltas).mean,
      p90Absolute: valuesStats(absDeltas).p90,
      maxAbsolute: absDeltas.filter((value) => value != null).length > 0
        ? round(Math.max(...absDeltas.filter((value) => value != null)))
        : null,
    },
  }
}

function placementSummary(rows, readScore, readGrade) {
  const byPlacement = {}
  for (let placement = 1; placement <= 8; placement += 1) {
    const group = rows.filter((row) => row.placement === placement)
    const grades = group.map(readGrade)
    byPlacement[String(placement)] = {
      rowCount: group.length,
      averageRoleScore: valuesStats(group.map((row) => row.roleScore)).mean,
      averageFinalScore: valuesStats(group.map(readScore)).mean,
      medianFinalScore: valuesStats(group.map(readScore)).median,
      gradeDistribution: gradeDistribution(group, readGrade),
      sOrSPlusRatio: group.length > 0
        ? round(grades.filter((grade) => grade === 'S' || grade === 'S+').length / group.length)
        : 0,
      aOrAboveRatio: group.length > 0
        ? round(grades.filter((grade) => gradeAtLeast(grade, 'A-')).length / group.length)
        : 0,
      cOrBelowRatio: group.length > 0
        ? round(grades.filter((grade) => gradeAtMost(grade, 'C+')).length / group.length)
        : 0,
    }
  }
  const firstMean = byPlacement['1'].averageFinalScore
  const eighthMean = byPlacement['8'].averageFinalScore
  return {
    byPlacement,
    firstMinusEighthAverage: firstMean != null && eighthMean != null ? round(firstMean - eighthMean) : null,
    scorePlacementCorrelation: pearson(rows.map((row) => row.placement), rows.map(readScore)),
    scoreRoleCorrelation: pearson(rows.map((row) => row.roleScore), rows.map(readScore)),
  }
}

function roleBinSummary(rows, readScore, readGrade) {
  const result = {}
  for (const bin of ROLE_BINS) {
    const group = rows.filter((row) => roleBin(row.roleScore) === bin.key)
    const byPlacement = {}
    for (let placement = 1; placement <= 8; placement += 1) {
      const placed = group.filter((row) => row.placement === placement)
      byPlacement[String(placement)] = {
        rowCount: placed.length,
        averageFinalScore: valuesStats(placed.map(readScore)).mean,
        gradeDistribution: gradeDistribution(placed, readGrade),
      }
    }
    result[bin.key] = {
      rowCount: group.length,
      byPlacement,
      firstMinusEighthAverage:
        byPlacement['1'].averageFinalScore != null && byPlacement['8'].averageFinalScore != null
          ? round(byPlacement['1'].averageFinalScore - byPlacement['8'].averageFinalScore)
          : null,
      inversionRatio: inversionRatio(group, readScore),
    }
  }
  return result
}

function inversionRatio(rows, readScore) {
  let compared = 0
  let inversions = 0
  const sorted = [...rows].sort((a, b) => a.roleScore - b.roleScore)
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const lowerRole = sorted[i]
      const higherRole = sorted[j]
      if (higherRole.roleScore - lowerRole.roleScore < 10) continue
      if (lowerRole.placement >= higherRole.placement) continue
      compared += 1
      if ((readScore(lowerRole) ?? -Infinity) > (readScore(higherRole) ?? Infinity)) inversions += 1
    }
  }
  return {
    comparedPairs: compared,
    invertedPairs: inversions,
    ratio: compared > 0 ? round(inversions / compared) : null,
  }
}

function specialComparisons(rows, readScore, readGrade) {
  const roleScores = rows.map((row) => row.roleScore).sort((a, b) => a - b)
  const p30 = percentile(roleScores, 0.3)
  const p70 = percentile(roleScores, 0.7)
  const p90 = percentile(roleScores, 0.9)
  const p10 = percentile(roleScores, 0.1)
  const lowFirst = rows.filter((row) => row.placement === 1 && row.roleScore <= p30)
  const highEighth = rows.filter((row) => row.placement === 8 && row.roleScore >= p70)
  const high78 = rows.filter((row) => (row.placement === 7 || row.placement === 8) && row.roleScore >= p90)
  const low12 = rows.filter((row) => (row.placement === 1 || row.placement === 2) && row.roleScore <= p10)
  return {
    thresholds: { roleP10: round(p10), roleP30: round(p30), roleP70: round(p70), roleP90: round(p90) },
    lowRoleBottom30FirstPlace: summarizeGroupGrades(lowFirst, readScore, readGrade),
    highRoleTop30EighthPlace: summarizeGroupGrades(highEighth, readScore, readGrade),
    highRoleTop10SeventhEighth: summarizeGroupGrades(high78, readScore, readGrade),
    lowRoleBottom10FirstSecond: summarizeGroupGrades(low12, readScore, readGrade),
    role55FirstBeatsRole80Eighth: crossGroupGradeWinRatio(
      rows.filter((row) => row.placement === 1 && row.roleScore >= 50 && row.roleScore < 60),
      rows.filter((row) => row.placement === 8 && row.roleScore >= 80 && row.roleScore < 90),
      readGrade,
    ),
  }
}

function summarizeGroupGrades(group, readScore, readGrade) {
  return {
    rowCount: group.length,
    averageRoleScore: valuesStats(group.map((row) => row.roleScore)).mean,
    averageFinalScore: valuesStats(group.map(readScore)).mean,
    gradeDistribution: gradeDistribution(group, readGrade),
    sOrSPlusRatio: group.length > 0
      ? round(group.filter((row) => ['S', 'S+'].includes(readGrade(row))).length / group.length)
      : 0,
    aOrAboveRatio: group.length > 0
      ? round(group.filter((row) => gradeAtLeast(readGrade(row), 'A-')).length / group.length)
      : 0,
    cOrBelowRatio: group.length > 0
      ? round(group.filter((row) => gradeAtMost(readGrade(row), 'C+')).length / group.length)
      : 0,
  }
}

function crossGroupGradeWinRatio(left, right, readGrade) {
  let compared = 0
  let leftHigher = 0
  for (const a of left) {
    for (const b of right) {
      compared += 1
      if ((GRADE_RANK[readGrade(a)] ?? 0) > (GRADE_RANK[readGrade(b)] ?? 0)) {
        leftHigher += 1
      }
    }
  }
  return { comparedPairs: compared, leftHigherCount: leftHigher, ratio: compared > 0 ? round(leftHigher / compared) : null }
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

function buildVariantSummary(rows, key, currentGap) {
  const { readScore, readGrade } = variantReaders(key)
  const placement = placementSummary(rows, readScore, readGrade)
  return {
    overall: summarizeScores(rows, readScore, readGrade),
    placement,
    firstMinusEighthGapReductionFromCurrent:
      currentGap != null && placement.firstMinusEighthAverage != null
        ? round((currentGap - placement.firstMinusEighthAverage) / currentGap)
        : null,
    roleScoreBins: roleBinSummary(rows, readScore, readGrade),
    specialComparisons: specialComparisons(rows, readScore, readGrade),
  }
}

function recommend(report) {
  const rows = []
  for (const candidate of CANDIDATES) {
    const key = `${candidate}:v2-placement-guard`
    const summary = report.candidates[candidate]['v2-placement-guard']
    const currentChanged = summary.overall.changedFromCurrent.ratio
    const roleCorr = Math.abs(summary.placement.scoreRoleCorrelation ?? 0)
    const placeCorr = Math.abs(summary.placement.scorePlacementCorrelation ?? 0)
    const gapReduction = summary.firstMinusEighthGapReductionFromCurrent ?? 0
    const high8 = summary.specialComparisons.highRoleTop30EighthPlace
    const low1 = summary.specialComparisons.lowRoleBottom30FirstPlace
    const distributionPenalty = Math.max(
      ...Object.values(summary.overall.gradeDistribution).map((row) => row.ratio),
    )
    const score =
      gapReduction * 2 +
      Math.max(0, roleCorr - placeCorr) * 2 +
      (high8.aOrAboveRatio ?? 0) -
      (low1.sOrSPlusRatio ?? 0) -
      Math.abs(currentChanged - 0.45) -
      Math.max(0, distributionPenalty - 0.25)
    rows.push({ key, candidate, score: round(score), gapReduction, roleCorr, placeCorr, changedRatio: currentChanged })
  }
  rows.sort((a, b) => b.score - a.score)
  return {
    recommended: rows[0]?.candidate ?? null,
    gateMode: 'v2-placement-guard',
    ranking: rows,
    reason: 'Balances a clear placement-gap reduction with stronger role-score correlation while avoiding S/S+ for low-role-score high placements and for 7~8th placements.',
  }
}

function formatText(report) {
  const lines = []
  lines.push('match-grade-outcome-cap shadow evaluation')
  lines.push(`generatedAt: ${report.generatedAt}`)
  lines.push(`evaluatedRows: ${report.summary.evaluatedRows}`)
  lines.push('')
  lines.push('production formula:')
  lines.push(`- finalScore = outcomeScore * ${OUTCOME_SCORE_WEIGHT} + roleScore * ${ROLE_SCORE_WEIGHT}`)
  lines.push('- outcomeScore = weighted normalized winRate/top3Rate/averagePlace')
  lines.push('- roleScore = weighted normalized role metrics by role preset')
  lines.push(`- S gate roleScore >= ${MATCH_GRADE_S_ROLE_SCORE_GATE}`)
  lines.push(`- S+ gate roleScore >= ${MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE} and outcomeScore >= ${MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE}`)
  lines.push('')
  lines.push(`current firstMinusEighth: ${report.current.placement.firstMinusEighthAverage}`)
  for (const candidate of CANDIDATES) {
    const guarded = report.candidates[candidate]['v2-placement-guard']
    const preserved = report.candidates[candidate]['production-gate']
    lines.push(`candidate ${candidate} guarded firstMinusEighth=${guarded.placement.firstMinusEighthAverage}, gapReduction=${guarded.firstMinusEighthGapReductionFromCurrent}, changed=${guarded.overall.changedFromCurrent.ratio}`)
    lines.push(`candidate ${candidate} production-gate firstMinusEighth=${preserved.placement.firstMinusEighthAverage}, changed=${preserved.overall.changedFromCurrent.ratio}`)
  }
  lines.push('')
  lines.push(`recommendation: candidate ${report.recommendation.recommended} (${report.recommendation.gateMode})`)
  lines.push(report.recommendation.reason)
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
    missingGradeInput: 0,
    missingRoleScore: 0,
  }
  const evaluated = []

  for (const row of rows) {
    if (!isOutcomeCapEvaluationMode(row.gameMode)) {
      skipped.unsupportedMode += 1
      continue
    }
    if (!Number.isFinite(row.placement) || row.placement < 1 || row.placement > 8) {
      skipped.invalidPlacement += 1
      continue
    }
    const playerTier = normalizeRankTier({ rp: row.rpAfter, displaySeason: row.displaySeasonId })
    if (playerTier.tierId === 'unranked' || playerTier.tierId === 'api-fallback') {
      skipped.missingTier += 1
      continue
    }
    const production = computeMatchPerformanceGrade({
      row,
      playerTier,
      displaySeasonId: row.displaySeasonId,
    })
    if (production.matchGradeScore == null || production.matchGrade == null) {
      skipped.missingGradeInput += 1
      continue
    }
    if (production.matchGradeRoleScore == null) {
      skipped.missingRoleScore += 1
      continue
    }
    const variants = {}
    for (const candidate of CANDIDATES) {
      for (const gateMode of GATE_MODES) {
        const variant = evaluateOutcomeCapCandidate({
          candidate,
          input: {
            roleScore: production.matchGradeRoleScore,
            placement: row.placement,
            outcomeScore: production.matchGradeOutcomeScore,
          },
          gateMode,
        })
        if (variant) variants[`${candidate}:${gateMode}`] = variant
      }
    }
    evaluated.push({
      placement: row.placement,
      roleScore: production.matchGradeRoleScore,
      outcomeScore: production.matchGradeOutcomeScore,
      currentScore: production.matchGradeScore,
      currentGrade: production.matchGrade,
      variants,
    })
  }

  const currentPlacement = placementSummary(evaluated, currentReadScore, currentReadGrade)
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      mode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      selectedIdentifiers: [],
    },
    productionFormula: {
      finalScore: `outcomeScore * ${OUTCOME_SCORE_WEIGHT} + roleScore * ${ROLE_SCORE_WEIGHT}`,
      outcomeWeight: OUTCOME_SCORE_WEIGHT,
      roleWeight: ROLE_SCORE_WEIGHT,
      outcomeComponents: {
        winRate: 30,
        top3Rate: 30,
        averagePlace: 40,
      },
      roleScorePlacementIndependent: true,
      roleScorePlacementContamination: [
        'No direct placement, victory, top3, or RP delta field is used in matchGradeRoleScore.',
        'The survival role metric uses deaths, which can still correlate with final placement.',
        'Combat live/fallback rawScore paths can combine outcomeScore and roleScore, but exposed matchGradeRoleScore remains the roleScore component.',
      ],
      sGate: {
        sMinRoleScore: MATCH_GRADE_S_ROLE_SCORE_GATE,
        sPlusMinRoleScore: MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE,
        sPlusMinOutcomeScore: MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE,
      },
      gradeCuts: FINE_GRADE_CUTS,
      benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
    },
    summary: {
      sourceRows: rows.length,
      evaluatedRows: evaluated.length,
      skipped,
      roleScoreBounds: {
        min: Math.min(...evaluated.map((row) => row.roleScore)),
        max: Math.max(...evaluated.map((row) => row.roleScore)),
      },
    },
    current: {
      overall: summarizeScores(evaluated, currentReadScore, currentReadGrade),
      placement: currentPlacement,
      roleScoreBins: roleBinSummary(evaluated, currentReadScore, currentReadGrade),
      specialComparisons: specialComparisons(evaluated, currentReadScore, currentReadGrade),
    },
    candidates: Object.fromEntries(
      CANDIDATES.map((candidate) => [
        candidate,
        Object.fromEntries(
          GATE_MODES.map((gateMode) => [
            gateMode,
            buildVariantSummary(evaluated, `${candidate}:${gateMode}`, currentPlacement.firstMinusEighthAverage),
          ]),
        ),
      ]),
    ),
    notes: [
      'No production grade code, benchmark artifact, API contract, UI, DB, character grade, Overall Grade, or team-luck code is modified by this evaluation.',
      'No personal or match identifiers are selected or written to the report.',
      'Rows with missing placement or unsupported mode are skipped; missing values are not imputed as zero.',
      'Candidate recommendation uses v2-placement-guard, while production-gate variants are included for direct S/S+ gate comparison.',
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
    currentGap: report.current.placement.firstMinusEighthAverage,
    candidates: Object.fromEntries(CANDIDATES.map((candidate) => [
      candidate,
      {
        guardedGap: report.candidates[candidate]['v2-placement-guard'].placement.firstMinusEighthAverage,
        guardedChanged: report.candidates[candidate]['v2-placement-guard'].overall.changedFromCurrent.ratio,
        roleCorrelation: report.candidates[candidate]['v2-placement-guard'].placement.scoreRoleCorrelation,
        placementCorrelation: report.candidates[candidate]['v2-placement-guard'].placement.scorePlacementCorrelation,
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
