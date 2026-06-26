#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { ROLE_PRESET_WEIGHTS } from '../dist/services/characterPerformanceGrade/config.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import {
  analyzeTeamKillMeaning,
  computeCombatContributionRatio,
  computeTeamLuckRoleScore as computeShadowRoleScore,
  deathsPer10m,
  durationBucket,
  perMinute,
  placementBucket,
  TEAM_LUCK_ROLE_SCORE_VERSION,
  TEAM_LUCK_ROLE_SCORE_WEIGHTS,
} from '../dist/services/roleScore/teamLuckRoleScore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..', '..')
const outputDir = join(rootDir, 'reports', 'team-luck-role-score-shadow')
const prisma = new PrismaClient()

function round(value, digits = 6) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function mean(values) {
  const finite = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (finite.length === 0) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function std(values) {
  const avg = mean(values)
  if (avg == null) return null
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length)
}

function quantile(values, p) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const w = idx - lo
  return sorted[lo] * (1 - w) + sorted[hi] * w
}

function correlation(xs, ys) {
  const pairs = []
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index]
    const y = ys[index]
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y])
  }
  if (pairs.length < 2) return null
  const xMean = mean(pairs.map(([x]) => x))
  const yMean = mean(pairs.map(([, y]) => y))
  let numerator = 0
  let xDen = 0
  let yDen = 0
  for (const [x, y] of pairs) {
    numerator += (x - xMean) * (y - yMean)
    xDen += (x - xMean) ** 2
    yDen += (y - yMean) ** 2
  }
  const den = Math.sqrt(xDen * yDen)
  return den > 0 ? numerator / den : null
}

function bucket(values, keyFn) {
  const map = new Map()
  for (const value of values) {
    const key = keyFn(value)
    const arr = map.get(key) ?? []
    arr.push(value)
    map.set(key, arr)
  }
  return map
}

function summarize(values) {
  const finite = values.filter((value) => Number.isFinite(value))
  return {
    count: finite.length,
    mean: round(mean(finite)),
    std: round(std(finite)),
    p10: round(quantile(finite, 0.1)),
    p50: round(quantile(finite, 0.5)),
    p90: round(quantile(finite, 0.9)),
  }
}

function metricInput(row, role) {
  return {
    role,
    damageToPlayer: row.damageToPlayer,
    damageToPlayerPerMinute: perMinute(row.damageToPlayer, row.gameDuration),
    combatContribution: computeCombatContributionRatio({
      playerKill: row.kills,
      playerAssistant: row.assists,
      teamKill: row.teamKills,
    }),
    deathsPer10m: deathsPer10m(row.deaths, row.gameDuration),
    visionScore: row.viewContribution,
    visionScorePerMinute: perMinute(row.viewContribution, row.gameDuration),
    monsterKill: row.monsterKill,
    monsterKillPerMinute: perMinute(row.monsterKill, row.gameDuration),
  }
}

function averageBaseline(rows) {
  return {
    damageToPlayer: mean(rows.map((row) => row.input.damageToPlayer)),
    damageToPlayerPerMinute: mean(rows.map((row) => row.input.damageToPlayerPerMinute)),
    combatContribution: mean(rows.map((row) => row.input.combatContribution)),
    deathsPer10m: mean(rows.map((row) => row.input.deathsPer10m)),
    visionScore: mean(rows.map((row) => row.input.visionScore)),
    visionScorePerMinute: mean(rows.map((row) => row.input.visionScorePerMinute)),
    monsterKill: mean(rows.map((row) => row.input.monsterKill)),
    monsterKillPerMinute: mean(rows.map((row) => row.input.monsterKillPerMinute)),
  }
}

function oldRoleScoreApprox(row, baseline) {
  const weights = ROLE_PRESET_WEIGHTS[row.role]
  if (!weights) return null
  const values = [
    [row.input.damageToPlayer, baseline.damageToPlayer, weights.damageToPlayer, true],
    [row.source.kills, mean(row.groupRows.map((item) => item.source.kills)), weights.playerKill, true],
    [row.source.assists, mean(row.groupRows.map((item) => item.source.assists)), weights.playerAssistant, true],
    [row.source.teamKills, mean(row.groupRows.map((item) => item.source.teamKills)), weights.teamKill, true],
    [row.input.deathsPer10m, baseline.deathsPer10m, weights.survival, false],
    [row.input.visionScore, baseline.visionScore, weights.viewContribution, true],
    [row.input.monsterKill, baseline.monsterKill, weights.monsterKill, true],
  ]
  let totalWeight = 0
  let weighted = 0
  for (const [actual, expected, weight, higherBetter] of values) {
    if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(expected) < 1e-6) continue
    const relative = higherBetter ? (actual - expected) / Math.abs(expected) : (expected - actual) / Math.abs(expected)
    weighted += Math.max(20, Math.min(100, 65 + relative * 45)) * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? weighted / totalWeight : null
}

function weatherLabel(value, thresholds) {
  if (value >= thresholds.p90) return '최상'
  if (value >= thresholds.p70) return '좋음'
  if (value > thresholds.p30) return '보통'
  if (value > thresholds.p10) return '나쁨'
  return '최악'
}

function formatText(report) {
  return [
    '# Team Luck Role Score Shadow',
    '',
    `version: ${report.version}`,
    `rows: ${report.rowCount}`,
    '',
    '## teamKill meaning',
    `same team uniform ratio: ${report.teamKillMeaning.sameTeamUniformRatio}`,
    `different team different ratio: ${report.teamKillMeaning.differentTeamDifferentRatio}`,
    `equals kill+assist ratio: ${report.teamKillMeaning.equalsKillAssistRatio}`,
    '',
    '## weights',
    ...Object.entries(report.weights).map(([role, weights]) => `- ${role}: ${JSON.stringify(weights)}`),
    '',
    '## score comparison',
    `old approx mean: ${report.scoreComparison.oldRoleScore.mean}`,
    `new shadow mean: ${report.scoreComparison.newRoleScore.mean}`,
    `changed over 5 points ratio: ${report.scoreComparison.changedOver5Ratio}`,
    `placement correlation old/new: ${report.scoreComparison.placementCorrelationOld} / ${report.scoreComparison.placementCorrelationNew}`,
    `duration correlation old/new: ${report.scoreComparison.durationCorrelationOld} / ${report.scoreComparison.durationCorrelationNew}`,
    '',
    '## team luck distribution',
    `thresholds: ${JSON.stringify(report.teamLuck.thresholds)}`,
    `labels: ${JSON.stringify(report.teamLuck.labelDistribution)}`,
    `1st-8th mean gap: ${report.teamLuck.firstEighthMeanGap}`,
    '',
  ].join('\n')
}

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: {
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      bestWeapon: { not: null },
      gameDuration: { not: null },
    },
    select: {
      gameId: true,
      uid: true,
      displaySeasonId: true,
      characterNum: true,
      bestWeapon: true,
      placement: true,
      kills: true,
      assists: true,
      deaths: true,
      teamKills: true,
      damageToPlayer: true,
      gameDuration: true,
      viewContribution: true,
      monsterKill: true,
    },
    take: 50000,
  })

  const participantRows = await prisma.matchParticipant.findMany({
    where: {
      gameId: { in: [...new Set(rows.map((row) => row.gameId))].slice(0, 5000) },
    },
    select: {
      gameId: true,
      teamNumber: true,
      teamKills: true,
      kills: true,
      assists: true,
      uid: true,
      characterNum: true,
      bestWeapon: true,
      placement: true,
      deaths: true,
      damageToPlayer: true,
    },
    take: 50000,
  })

  const prepared = rows
    .map((row) => {
      const role = lookupCharacterWeaponRole(row.characterNum, row.bestWeapon)
      if (!role) return null
      return {
        source: row,
        role,
        durationBucket: durationBucket(row.gameDuration),
        placementBucket: placementBucket(row.placement),
        input: metricInput(row, role),
      }
    })
    .filter(Boolean)

  const baselineGroups = bucket(prepared, (row) => `${row.role}|${row.durationBucket}`)
  const withGroup = prepared.map((row) => {
    const groupRows = baselineGroups.get(`${row.role}|${row.durationBucket}`) ?? []
    const baseline = averageBaseline(groupRows)
    const next = computeShadowRoleScore(row.input, baseline)
    const old = oldRoleScoreApprox({ ...row, groupRows }, baseline)
    return {
      ...row,
      baseline,
      oldRoleScore: old,
      newRoleScore: next.score,
      effectiveWeight: next.effectiveWeight,
      missingMetrics: next.missingMetrics,
    }
  })

  const scoreReady = withGroup.filter((row) => Number.isFinite(row.newRoleScore) && Number.isFinite(row.oldRoleScore))
  const thresholds = {
    p10: round(quantile(scoreReady.map((row) => row.newRoleScore - row.oldRoleScore), 0.1)),
    p30: round(quantile(scoreReady.map((row) => row.newRoleScore - row.oldRoleScore), 0.3)),
    p70: round(quantile(scoreReady.map((row) => row.newRoleScore - row.oldRoleScore), 0.7)),
    p90: round(quantile(scoreReady.map((row) => row.newRoleScore - row.oldRoleScore), 0.9)),
  }

  const residualGroups = bucket(scoreReady, (row) => `${row.role}|${row.placementBucket}|${row.durationBucket}`)
  const residualRows = scoreReady.map((row) => {
    const groupRows = residualGroups.get(`${row.role}|${row.placementBucket}|${row.durationBucket}`) ?? []
    const expected = mean(groupRows.map((item) => item.newRoleScore))
    return {
      ...row,
      residual: expected == null ? null : row.newRoleScore - expected,
    }
  }).filter((row) => Number.isFinite(row.residual))

  const residualThresholds = {
    p10: round(quantile(residualRows.map((row) => row.residual), 0.1)),
    p30: round(quantile(residualRows.map((row) => row.residual), 0.3)),
    p70: round(quantile(residualRows.map((row) => row.residual), 0.7)),
    p90: round(quantile(residualRows.map((row) => row.residual), 0.9)),
  }
  const labelDistribution = {}
  for (const row of residualRows) {
    const label = weatherLabel(row.residual, residualThresholds)
    labelDistribution[label] = (labelDistribution[label] ?? 0) + 1
  }

  const byPlacement = Object.fromEntries(
    [...bucket(residualRows, (row) => String(row.source.placement ?? 'unknown')).entries()]
      .map(([place, placeRows]) => [place, summarize(placeRows.map((row) => row.residual))]),
  )

  const shortRows = scoreReady.filter((row) => row.source.gameDuration < 15 * 60)
  const longRows = scoreReady.filter((row) => row.source.gameDuration >= 25 * 60)
  const roleDistribution = Object.fromEntries(
    [...bucket(scoreReady, (row) => row.role).entries()].map(([role, roleRows]) => [
      role,
      {
        old: summarize(roleRows.map((row) => row.oldRoleScore)),
        next: summarize(roleRows.map((row) => row.newRoleScore)),
      },
    ]),
  )

  const report = {
    version: TEAM_LUCK_ROLE_SCORE_VERSION,
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    evaluatedRowCount: scoreReady.length,
    participantRowCount: participantRows.length,
    productionChanged: false,
    weights: TEAM_LUCK_ROLE_SCORE_WEIGHTS,
    teamKillMeaning: analyzeTeamKillMeaning(participantRows.map((row) => ({
      gameId: row.gameId,
      teamNumber: row.teamNumber,
      teamKill: row.teamKills,
      playerKill: row.kills,
      playerAssistant: row.assists,
    }))),
    scoreComparison: {
      oldRoleScore: summarize(scoreReady.map((row) => row.oldRoleScore)),
      newRoleScore: summarize(scoreReady.map((row) => row.newRoleScore)),
      changedOver5Ratio: round(scoreReady.filter((row) => Math.abs(row.newRoleScore - row.oldRoleScore) >= 5).length / Math.max(scoreReady.length, 1)),
      placementCorrelationOld: round(correlation(scoreReady.map((row) => row.source.placement), scoreReady.map((row) => row.oldRoleScore))),
      placementCorrelationNew: round(correlation(scoreReady.map((row) => row.source.placement), scoreReady.map((row) => row.newRoleScore))),
      durationCorrelationOld: round(correlation(scoreReady.map((row) => row.source.gameDuration), scoreReady.map((row) => row.oldRoleScore))),
      durationCorrelationNew: round(correlation(scoreReady.map((row) => row.source.gameDuration), scoreReady.map((row) => row.newRoleScore))),
      rawTeamKillRemoved: true,
      deltaThresholds: thresholds,
    },
    roleDistribution,
    timeCheck: {
      shortGameCount: shortRows.length,
      longGameCount: longRows.length,
      shortSLikeRatio: round(shortRows.filter((row) => row.newRoleScore >= 84).length / Math.max(shortRows.length, 1)),
      longSLikeRatio: round(longRows.filter((row) => row.newRoleScore >= 84).length / Math.max(longRows.length, 1)),
    },
    teamLuck: {
      thresholds: residualThresholds,
      labelDistribution,
      byPlacement,
      firstEighthMeanGap:
        byPlacement['1']?.mean != null && byPlacement['8']?.mean != null
          ? round(byPlacement['1'].mean - byPlacement['8'].mean)
          : null,
      fallbackDistribution: {
        roleDuration: baselineGroups.size,
        rolePlacementDuration: residualGroups.size,
      },
    },
    notes: [
      'Shadow only: production match grade, character grade, Overall Grade, and team luck runtime are unchanged.',
      'CC time, damage taken, recover, and shield fields are not assigned operating weights in this candidate.',
      'Residual grouping keeps placementBucket and durationBucket.',
    ],
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, 'role-score-shadow-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(join(outputDir, 'role-score-shadow-report.txt'), formatText(report))
  console.log(JSON.stringify({
    outputDir,
    rows: report.rowCount,
    evaluated: report.evaluatedRowCount,
    sameTeamUniformRatio: report.teamKillMeaning.sameTeamUniformRatio,
    changedOver5Ratio: report.scoreComparison.changedOver5Ratio,
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
