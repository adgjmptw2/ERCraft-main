#!/usr/bin/env node
import 'dotenv/config'

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { computeMatchGradeV3 } from '../dist/services/roleScore/roleScoreV3.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const repoRoot = join(backendRoot, '..')
const artifactPath = join(
  backendRoot,
  'src',
  'data',
  'aggregateGrade',
  'aggregate-grade-calibration.v1.json',
)
const reportDir = join(repoRoot, 'reports', 'aggregate-grade-calibration')
const reportJsonPath = join(reportDir, 'evaluation-report.json')
const reportTxtPath = join(reportDir, 'evaluation-report.txt')

const prisma = new PrismaClient()

const VERSION = 'aggregate-grade-calibration.v1'
const CHARACTER_VERSION = 'character-aggregate-grade.v4'
const OVERALL_VERSION = 'overall-aggregate-grade.v4'
const SHRINK_VERSION = 'aggregate-shrink-k1.v1'
const DEFAULT_K = 1
const K_VALUES = [1, 5, 8]
const MIN_CHARACTER_GAMES = 5

const GRADE_QUANTILES = [
  ['S+', 0.98],
  ['S', 0.94],
  ['S-', 0.9],
  ['A+', 0.82],
  ['A', 0.72],
  ['A-', 0.6],
  ['B+', 0.48],
  ['B', 0.34],
  ['B-', 0.22],
  ['C+', 0.14],
  ['C', 0.08],
  ['C-', 0.04],
  ['D+', 0.02],
  ['D', 0.01],
]

function round(value, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value))
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

function stddev(values) {
  const mean = average(values)
  if (mean == null) return null
  const variance = average(values.map((value) => (value - mean) ** 2))
  return variance == null ? null : Math.sqrt(variance)
}

function quantile(values, q) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1]
  if (next == null) return sorted[base]
  return sorted[base] + rest * (next - sorted[base])
}

function buildCuts(values) {
  return GRADE_QUANTILES.map(([grade, q]) => ({ grade, min: round(quantile(values, q) ?? 65, 2) })).concat([
    { grade: 'D-', min: -1_000_000 },
  ])
}

function gradeFromCuts(score, cuts) {
  for (const cut of cuts) {
    if (score >= cut.min) return cut.grade
  }
  return 'D-'
}

function bucketGames(n) {
  if (n < 5) return '1-4'
  if (n < 10) return '5-9'
  if (n < 20) return '10-19'
  if (n < 30) return '20-29'
  return '30+'
}

function adjustScore(rawScore, sampleSize, priorMean, k) {
  const weight = sampleSize / (sampleSize + k)
  return priorMean + weight * (rawScore - priorMean)
}

function summarizeRows(rows, cuts) {
  const grades = {}
  for (const row of rows) {
    const grade = gradeFromCuts(row.adjustedScore, cuts)
    grades[grade] = (grades[grade] ?? 0) + 1
  }
  const count = rows.length
  const sOrAbove = rows.filter((row) => gradeFromCuts(row.adjustedScore, cuts).startsWith('S')).length
  const aOrAbove = rows.filter((row) => {
    const grade = gradeFromCuts(row.adjustedScore, cuts)
    return grade.startsWith('S') || grade.startsWith('A')
  }).length
  return {
    count,
    rawMean: round(average(rows.map((row) => row.rawScore)) ?? 0),
    adjustedMean: round(average(rows.map((row) => row.adjustedScore)) ?? 0),
    gradeDistribution: grades,
    sOrAboveRate: count > 0 ? round(sOrAbove / count) : 0,
    aOrAboveRate: count > 0 ? round(aOrAbove / count) : 0,
  }
}

function rowsByBucket(rows, cuts) {
  const result = {}
  for (const bucket of ['1-4', '5-9', '10-19', '20-29', '30+']) {
    result[bucket] = summarizeRows(rows.filter((row) => bucketGames(row.matchCount) === bucket), cuts)
  }
  return result
}

function rowsByRole(rows, cuts) {
  const result = {}
  const roles = [...new Set(rows.map((row) => row.primaryRole).filter(Boolean))].sort()
  for (const role of roles) {
    result[role] = summarizeRows(rows.filter((row) => row.primaryRole === role), cuts)
  }
  return result
}

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: {
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    },
    orderBy: [{ uid: 'asc' }, { characterNum: 'asc' }, { playedAt: 'asc' }],
  })

  const scoredRows = []
  for (const row of rows) {
    if (row.bestWeapon == null || row.bestWeapon <= 0) continue
    const role = lookupCharacterWeaponRole(row.characterNum, row.bestWeapon)
    if (!role) continue
    const tier = getRankTierFromRp(row.rpAfter ?? 0, null, CURRENT_DISPLAY_SEASON)
    const tierKey = rankTierToGradeBaselineKey(tier) ?? 'meteorite_plus'
    const result = computeMatchGradeV3({
      tierKey,
      characterNum: row.characterNum,
      weaponTypeId: row.bestWeapon,
      role,
      placement: row.placement,
      durationSeconds: row.gameDuration,
      kills: row.kills,
      assists: row.assists,
      deaths: row.deaths,
      teamKills: row.teamKills,
      damageToPlayer: row.damageToPlayer,
      visionScore: row.viewContribution,
      monsterKill: row.monsterKill,
    })
    if (!result) continue
    scoredRows.push({
      uid: row.uid,
      characterNum: row.characterNum,
      weaponTypeId: row.bestWeapon,
      role,
      score: result.score,
      roleScore: result.roleScore,
    })
  }

  const globalPrior = average(scoredRows.map((row) => row.score)) ?? 65
  const rolePriors = {}
  for (const role of [...new Set(scoredRows.map((row) => row.role))]) {
    const roleRows = scoredRows.filter((row) => row.role === role)
    rolePriors[role] = {
      sampleCount: roleRows.length,
      meanMatchScore: round(average(roleRows.map((row) => row.score)) ?? globalPrior),
      meanRoleScore: round(average(roleRows.map((row) => row.roleScore)) ?? globalPrior),
    }
  }

  const byCharacter = new Map()
  const byUser = new Map()
  for (const row of scoredRows) {
    const characterKey = `${row.uid}:${row.characterNum}`
    if (!byCharacter.has(characterKey)) byCharacter.set(characterKey, [])
    byCharacter.get(characterKey).push(row)
    if (!byUser.has(row.uid)) byUser.set(row.uid, [])
    byUser.get(row.uid).push(row)
  }

  function priorForCharacter(group) {
    let weighted = 0
    let total = 0
  for (const row of group) {
      weighted += rolePriors[row.role]?.meanMatchScore ?? globalPrior
      total += 1
    }
    return total > 0 ? weighted / total : globalPrior
  }

  const characterBaseRows = []
  for (const group of byCharacter.values()) {
    if (group.length < MIN_CHARACTER_GAMES) continue
    const rawScore = average(group.map((row) => row.score))
    if (rawScore == null) continue
    const roleCounts = new Map()
    for (const row of group) roleCounts.set(row.role, (roleCounts.get(row.role) ?? 0) + 1)
    const primaryRole = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    characterBaseRows.push({
      matchCount: group.length,
      rawScore,
      priorMean: priorForCharacter(group),
      primaryRole,
    })
  }

  const overallBaseRows = []
  for (const group of byUser.values()) {
    const rawScore = average(group.map((row) => row.score))
    if (rawScore == null) continue
    overallBaseRows.push({
      matchCount: group.length,
      rawScore,
      priorMean: globalPrior,
      primaryRole: null,
    })
  }

  const comparison = {}
  let characterCutsForDefault = []
  let overallCutsForDefault = []
  for (const k of K_VALUES) {
    const characterRows = characterBaseRows.map((row) => ({
      ...row,
      adjustedScore: adjustScore(row.rawScore, row.matchCount, row.priorMean, k),
    }))
    const overallRows = overallBaseRows.map((row) => ({
      ...row,
      adjustedScore: adjustScore(row.rawScore, row.matchCount, row.priorMean, k),
    }))
    const characterCuts = buildCuts(characterRows.map((row) => row.adjustedScore))
    const overallCuts = buildCuts(overallRows.map((row) => row.adjustedScore))
    if (k === DEFAULT_K) {
      characterCutsForDefault = characterCuts
      overallCutsForDefault = overallCuts
    }
    comparison[`k=${k}`] = {
      character: {
        summary: summarizeRows(characterRows, characterCuts),
        bySampleBucket: rowsByBucket(characterRows, characterCuts),
        byRole: rowsByRole(characterRows, characterCuts),
      },
      overall: {
        summary: summarizeRows(overallRows, overallCuts),
        bySampleBucket: rowsByBucket(overallRows, overallCuts),
      },
    }
  }

  const artifact = {
    schemaVersion: 1,
    version: VERSION,
    characterAggregateGradeVersion: CHARACTER_VERSION,
    overallAggregateGradeVersion: OVERALL_VERSION,
    generatedAt: new Date().toISOString(),
    inputVersions: {
      roleScoreVersion: 'role-score.v3',
      matchGradeVersion: 'match-grade-direct.v2',
    },
    config: {
      defaultShrinkK: DEFAULT_K,
      minCharacterGames: MIN_CHARACTER_GAMES,
      priorScope: 'broad-role-and-global-v3-match-score',
    },
    priors: {
      globalMatchScore: round(globalPrior),
      rolePriors,
    },
    characterCalibration: {
      cuts: characterCutsForDefault,
      metadata: {
        targetCount: characterBaseRows.length,
        mean: round(average(characterBaseRows.map((row) => adjustScore(row.rawScore, row.matchCount, row.priorMean, DEFAULT_K))) ?? 0),
        stddev: round(stddev(characterBaseRows.map((row) => adjustScore(row.rawScore, row.matchCount, row.priorMean, DEFAULT_K))) ?? 0),
        quantiles: Object.fromEntries([0.1, 0.25, 0.5, 0.75, 0.9].map((q) => [String(q), round(quantile(characterBaseRows.map((row) => adjustScore(row.rawScore, row.matchCount, row.priorMean, DEFAULT_K)), q) ?? 0)])),
      },
    },
    overallCalibration: {
      cuts: overallCutsForDefault,
      metadata: {
        targetCount: overallBaseRows.length,
        mean: round(average(overallBaseRows.map((row) => adjustScore(row.rawScore, row.matchCount, row.priorMean, DEFAULT_K))) ?? 0),
        stddev: round(stddev(overallBaseRows.map((row) => adjustScore(row.rawScore, row.matchCount, row.priorMean, DEFAULT_K))) ?? 0),
        quantiles: Object.fromEntries([0.1, 0.25, 0.5, 0.75, 0.9].map((q) => [String(q), round(quantile(overallBaseRows.map((row) => adjustScore(row.rawScore, row.matchCount, row.priorMean, DEFAULT_K)), q) ?? 0)])),
      },
    },
    metadata: {
      purpose: 'diagnostic-priors-and-distribution-report-only',
      gradeCutUsage: 'not-used-for-character-or-overall-letter-grades',
      productionLetterGradeCuts: 'aggregate-grade-shared-fine-cuts.v1',
      shrinkVersion: SHRINK_VERSION,
      sourceTable: 'player_matches',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      sourceRows: rows.length,
      scoredRows: scoredRows.length,
      characterAggregateRows: characterBaseRows.length,
      overallAggregateRows: overallBaseRows.length,
      sampleBuckets: comparison[`k=${DEFAULT_K}`].character.bySampleBucket,
    },
  }

  await mkdir(dirname(artifactPath), { recursive: true })
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`)
  await mkdir(reportDir, { recursive: true })
  await writeFile(reportJsonPath, `${JSON.stringify({ comparison, artifact: artifact.metadata }, null, 2)}\n`)
  await writeFile(
    reportTxtPath,
    [
      '# aggregate-grade-calibration.v1',
      '',
      `sourceRows: ${rows.length}`,
      `scoredRows: ${scoredRows.length}`,
      `characterAggregateRows: ${characterBaseRows.length}`,
      `overallAggregateRows: ${overallBaseRows.length}`,
      '',
      `## k=${DEFAULT_K} character sample buckets`,
      JSON.stringify(comparison[`k=${DEFAULT_K}`].character.bySampleBucket, null, 2),
      '',
      `## k=${DEFAULT_K} role buckets`,
      JSON.stringify(comparison[`k=${DEFAULT_K}`].character.byRole, null, 2),
    ].join('\n'),
  )

  console.log(JSON.stringify({
    artifactPath,
    reportJsonPath,
    sourceRows: rows.length,
    scoredRows: scoredRows.length,
    characterAggregateRows: characterBaseRows.length,
    overallAggregateRows: overallBaseRows.length,
    [`k${DEFAULT_K}`]: comparison[`k=${DEFAULT_K}`].character.summary,
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
