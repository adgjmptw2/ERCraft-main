import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PrismaClient } from '@prisma/client'

import {
  computeMatchPerformanceGrade,
  playerMatchRowToGradeInput,
} from '../dist/services/characterPerformanceGrade/compute.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { normalizeRankTier } from '../dist/utils/rankTier.js'
import { resolveResidualRoleBaseline } from '../dist/services/teamLuckResidualBaseline.js'
import {
  computePercentileBaseScore,
  empiricalPercentileMidrank,
  evaluatePercentileCalibrationCandidate,
} from '../dist/analysis/shadow/matchGradePercentileCalibration.js'
import {
  computeAdjustedContributionV3,
  computeMatchGradeV3,
  roleScoreV3PlacementAdjustment,
} from '../dist/services/roleScore/roleScoreV3.js'
import {
  computeCombatContributionRatio,
  computeTeamLuckRoleScore,
  deathsPer10m,
  perMinute,
} from '../dist/services/roleScore/teamLuckRoleScore.js'
import { resolveTeamLuckRoleScoreBaseline } from '../dist/services/roleScore/teamLuckRoleScoreBaseline.js'

const prisma = new PrismaClient()
const CURRENT_DISPLAY_SEASON = 11
const outDir = join('..', 'reports', 'grade-v3-direct')
const calibration = JSON.parse(
  readFileSync('./src/data/matchGradePercentileCalibration/match-grade-percentile-calibration.v2.json', 'utf8'),
)

function round(value, digits = 4) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 10 ** digits) / 10 ** digits
    : value
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function std(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length)
}

function corr(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (pairs.length < 3) return null
  const xMean = mean(pairs.map(([x]) => x))
  const yMean = mean(pairs.map(([, y]) => y))
  let num = 0
  let xDen = 0
  let yDen = 0
  for (const [x, y] of pairs) {
    num += (x - xMean) * (y - yMean)
    xDen += (x - xMean) ** 2
    yDen += (y - yMean) ** 2
  }
  return xDen > 0 && yDen > 0 ? num / Math.sqrt(xDen * yDen) : null
}

function summarizeScores(rows, selector) {
  const values = rows.map(selector).filter((value) => Number.isFinite(value))
  return {
    count: values.length,
    mean: round(mean(values)),
    std: round(std(values)),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
  }
}

function gradeBucket(grade) {
  if (grade == null) return 'missing'
  return grade
}

function countBy(rows, selector) {
  const out = {}
  for (const row of rows) {
    const key = selector(row)
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

function isSOrAbove(grade) {
  return grade === 'S+' || grade === 'S' || grade === 'S-'
}

function isAOrAbove(grade) {
  return isSOrAbove(grade) || grade === 'A+' || grade === 'A' || grade === 'A-'
}

function isBOrBelow(grade) {
  return ['B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'].includes(grade)
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

function v2P4(row, tier) {
  const tierKey = rankTierToGradeBaselineKey(tier)
  const input = playerMatchRowToGradeInput(row)
  const role = input?.weaponTypeId ? lookupCharacterWeaponRole(row.characterNum, input.weaponTypeId) : null
  if (!tierKey || !input || !role) return { p4: null }
  const roleBaseline = resolveTeamLuckRoleScoreBaseline({
    role,
    durationSeconds: row.gameDuration ?? null,
  })
  if (!roleBaseline.baseline) return { p4: null }
  const roleScoreResult = computeTeamLuckRoleScore(
    {
      role,
      damageToPlayer: row.damageToPlayer ?? null,
      damageToPlayerPerMinute: perMinute(row.damageToPlayer ?? null, row.gameDuration ?? null),
      combatContribution: computeCombatContributionRatio({
        playerKill: row.kills ?? null,
        playerAssistant: row.assists ?? null,
        teamKill: row.teamKills ?? null,
      }),
      deathsPer10m: deathsPer10m(row.deaths ?? null, row.gameDuration ?? null),
      visionScore: row.viewContribution ?? null,
      visionScorePerMinute: perMinute(row.viewContribution ?? null, row.gameDuration ?? null),
      monsterKill: row.monsterKill ?? null,
      monsterKillPerMinute: perMinute(row.monsterKill ?? null, row.gameDuration ?? null),
    },
    roleBaseline.baseline,
  )
  if (roleScoreResult.score == null) return { p4: null }
  const baseline = resolveResidualRoleBaseline({
    season: row.displaySeasonId,
    mode: 'rank',
    tier: tierKey,
    characterNum: row.characterNum,
    weaponTypeId: input.weaponTypeId,
    role,
    placement: row.placement,
    durationSeconds: row.gameDuration,
  })
  if (baseline.expectedRolePerformanceScore == null) return { p4: null }
  const residual = roleScoreResult.score - baseline.expectedRolePerformanceScore
  const percentile = empiricalPercentileMidrank(calibration.residualCdf.sortedResiduals, residual)
  const baseScore =
    percentile == null
      ? null
      : computePercentileBaseScore({
          targetProductionScores: calibration.productionTargetDistribution.sortedScores,
          residualPercentile: percentile,
        })
  const p4 =
    percentile != null && baseScore != null
      ? evaluatePercentileCalibrationCandidate({
          candidate: 'P4',
          input: {
            residualPercentile: percentile,
            baseScore,
            placement: row.placement ?? 0,
          },
          thresholds: calibration.gates,
        })
      : null
  return {
    p4,
    role,
    roleScore: roleScoreResult.score,
    residual,
    expected: baseline.expectedRolePerformanceScore,
    fallbackLevel: baseline.fallbackLevel,
    sampleCount: baseline.sampleCount,
  }
}

function v3Direct(row, tier) {
  const tierKey = rankTierToGradeBaselineKey(tier)
  const input = playerMatchRowToGradeInput(row)
  const role = input?.weaponTypeId ? lookupCharacterWeaponRole(row.characterNum, input.weaponTypeId) : null
  if (!tierKey || !input || !role) return null
  const result = computeMatchGradeV3({
    tierKey,
    characterNum: row.characterNum,
    weaponTypeId: input.weaponTypeId,
    role,
    placement: row.placement,
    durationSeconds: row.gameDuration,
    damageToPlayer: input.damageToPlayer,
    kills: input.kills,
    assists: input.assists,
    teamKills: input.teamKills,
    deaths: input.deaths,
    visionScore: input.visionScore,
    monsterKill: input.animalKills,
  })
  return result ? { ...result, role } : null
}

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: { gameMode: 'rank', displaySeasonId: CURRENT_DISPLAY_SEASON },
    orderBy: { playedAt: 'asc' },
  })
  const seen = new Set()
  const deduped = rows.filter((row) => {
    const key = [
      row.gameId,
      row.characterNum,
      row.bestWeapon,
      row.placement,
      row.kills,
      row.deaths,
      row.assists,
      row.teamKills,
      row.damageToPlayer,
      row.rpAfter,
    ].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const evaluated = []
  for (const row of deduped) {
    if (!row.rpAfter) continue
    const tier = normalizeRankTier({ rp: row.rpAfter, displaySeason: row.displaySeasonId })
    const v2 = v2P4(row, tier)
    const v3 = v3Direct(row, tier)
    const production = computeMatchPerformanceGrade({ row, playerTier: tier, displaySeasonId: row.displaySeasonId })
    if (!v2.p4 || !v3) continue
    evaluated.push({
      gameId: row.gameId,
      characterNum: row.characterNum,
      weaponTypeId: row.bestWeapon,
      placement: row.placement,
      durationSeconds: row.gameDuration,
      durationBucket: durationBucket(row.gameDuration),
      role: v3.role,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      damageToPlayer: row.damageToPlayer,
      v2RoleScore: v2.roleScore,
      v2Score: v2.p4.score,
      v2Grade: v2.p4.grade,
      v3RoleScore: v3.roleScore,
      v3PlacementAdjustment: v3.placementAdjustment,
      v3Score: v3.score,
      v3Grade: v3.grade,
      productionScore: production.matchGradeScore,
      productionGrade: production.matchGrade,
      v3MetricDetails: v3.roleScoreDetail.metricDetails,
      v3BaselineLevel: v3.roleScoreDetail.baselineLevel,
      v3DurationBucket: v3.roleScoreDetail.durationBucket,
      v3MissingMetrics: v3.roleScoreDetail.missingMetrics,
    })
  }

  const roleMeans = Object.fromEntries(
    Object.entries(
      evaluated.reduce((acc, row) => {
        acc[row.role] ??= []
        acc[row.role].push(row.v3RoleScore)
        return acc
      }, {}),
    ).map(([role, values]) => [role, round(mean(values))]),
  )
  const roleSShare = Object.fromEntries(
    Object.entries(
      evaluated.reduce((acc, row) => {
        acc[row.role] ??= { total: 0, s: 0 }
        acc[row.role].total += 1
        if (isSOrAbove(row.v3Grade)) acc[row.role].s += 1
        return acc
      }, {}),
    ).map(([role, value]) => [role, round(value.s / value.total)]),
  )
  const durationSShare = Object.fromEntries(
    Object.entries(
      evaluated.reduce((acc, row) => {
        acc[row.durationBucket] ??= { total: 0, s: 0 }
        acc[row.durationBucket].total += 1
        if (isSOrAbove(row.v3Grade)) acc[row.durationBucket].s += 1
        return acc
      }, {}),
    ).map(([bucket, value]) => [bucket, round(value.s / value.total)]),
  )
  const byPlacementTeamFlowProxy = Object.fromEntries(
    Object.entries(
      evaluated.reduce((acc, row) => {
        acc[row.placement] ??= []
        acc[row.placement].push(row.v3RoleScore - row.v3PlacementAdjustment)
        return acc
      }, {}),
    ).map(([placement, values]) => [placement, round(mean(values))]),
  )
  const placementValues = Object.values(byPlacementTeamFlowProxy)
  const roleMeanValues = Object.values(roleMeans)
  const sShares = Object.values(roleSShare)
  const overallSShare = evaluated.filter((row) => isSOrAbove(row.v3Grade)).length / evaluated.length
  const shortSShare = durationSShare['duration-lt-15m'] ?? 0
  const highFirstRows = evaluated.filter((row) => row.placement === 1 && row.v3RoleScore >= 80)
  const lowFirstRows = evaluated.filter((row) => row.placement === 1 && row.v3RoleScore < 65)

  const reported = evaluated.find((row) => row.gameId === '61802623' && row.characterNum === 60)
  const v2DurationCorrelation = Math.abs(
    corr(evaluated.map((row) => row.v2RoleScore), evaluated.map((row) => row.durationSeconds)) ?? 0,
  )
  const v3DurationCorrelation = Math.abs(
    corr(evaluated.map((row) => row.v3RoleScore), evaluated.map((row) => row.durationSeconds)) ?? 0,
  )
  const acceptance = {
    roleScoreDurationCorrelationNotGreatlyIncreased: v3DurationCorrelation <= v2DurationCorrelation + 0.2,
    teamFlowPlacementGapNotExcessive: Math.max(...placementValues) - Math.min(...placementValues) <= 20,
    roleAverageGapNotExcessive: Math.max(...roleMeanValues) - Math.min(...roleMeanValues) <= 18,
    roleSShareNotConcentrated: Math.max(...sShares) <= Math.max(0.35, overallSShare * 2.5),
    shortMatchSShareNotAbnormal: shortSShare <= overallSShare * 1.75 + 0.03,
    highRoleFirstNotOverLowered: highFirstRows.filter((row) => isBOrBelow(row.v3Grade)).length / Math.max(highFirstRows.length, 1) <= 0.15,
    lowRoleFirstNotAutoHigh: lowFirstRows.filter((row) => isAOrAbove(row.v3Grade)).length / Math.max(lowFirstRows.length, 1) <= 0.15,
    reportedMatchImproves: reported ? !isBOrBelow(reported.v3Grade) : false,
  }
  const accepted = Object.values(acceptance).every(Boolean)

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      rows: rows.length,
      dedupedRows: deduped.length,
      evaluatedRows: evaluated.length,
      selectedIdentifiers: [],
    },
    versions: {
      v2: {
        roleScoreVersion: 'role-score.v2',
        matchGradeVersion: 'match-grade-p4-percentile.v2',
        residualBaselineVersion: 'team-luck-residual-baselines.v3',
      },
      v3: {
        roleScoreVersion: 'role-score.v3',
        matchGradeVersion: 'match-grade-direct.v1',
        fallbackBaselineVersion: 'role-score-fallback-baselines.v1',
        durationAdjustmentVersion: 'role-score-duration-adjustments.v1',
        teamFlowEffectVersion: 'team-flow-role-placement-effects.v1',
      },
    },
    overall: {
      v2: summarizeScores(evaluated, (row) => row.v2Score),
      v3: summarizeScores(evaluated, (row) => row.v3Score),
      gradeDistributionV2: countBy(evaluated, (row) => gradeBucket(row.v2Grade)),
      gradeDistributionV3: countBy(evaluated, (row) => gradeBucket(row.v3Grade)),
      sOrAboveV2: round(evaluated.filter((row) => isSOrAbove(row.v2Grade)).length / evaluated.length),
      sOrAboveV3: round(overallSShare),
      aOrAboveV2: round(evaluated.filter((row) => isAOrAbove(row.v2Grade)).length / evaluated.length),
      aOrAboveV3: round(evaluated.filter((row) => isAOrAbove(row.v3Grade)).length / evaluated.length),
      changedGradeRatio: round(evaluated.filter((row) => row.v2Grade !== row.v3Grade).length / evaluated.length),
      averageScoreDelta: round(mean(evaluated.map((row) => row.v3Score - row.v2Score))),
    },
    correlations: {
      v2RoleScoreDuration: round(corr(evaluated.map((row) => row.v2RoleScore), evaluated.map((row) => row.durationSeconds))),
      v3RoleScoreDuration: round(corr(evaluated.map((row) => row.v3RoleScore), evaluated.map((row) => row.durationSeconds))),
      v2ScorePlacement: round(corr(evaluated.map((row) => row.v2Score), evaluated.map((row) => row.placement))),
      v3ScorePlacement: round(corr(evaluated.map((row) => row.v3Score), evaluated.map((row) => row.placement))),
    },
    byPlacement: Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8].map((placement) => {
        const rows = evaluated.filter((row) => row.placement === placement)
        return [
          placement,
          {
            count: rows.length,
            v2Mean: round(mean(rows.map((row) => row.v2Score))),
            v3Mean: round(mean(rows.map((row) => row.v3Score))),
            v3RoleMean: round(mean(rows.map((row) => row.v3RoleScore))),
            v3GradeDistribution: countBy(rows, (row) => row.v3Grade),
            teamFlowProxyMean: byPlacementTeamFlowProxy[placement],
          },
        ]
      }),
    ),
    roleMeans,
    roleSShare,
    durationSShare,
    acceptance,
    accepted,
    reportedMatch61802623: reported
      ? {
          v2RoleScore: round(reported.v2RoleScore),
          v2FinalScore: reported.v2Score,
          v2Grade: reported.v2Grade,
          v3RoleScore: reported.v3RoleScore,
          v3PlacementAdjustment: reported.v3PlacementAdjustment,
          v3FinalScore: reported.v3Score,
          v3Grade: reported.v3Grade,
          metricDetails: reported.v3MetricDetails,
          baselineLevel: reported.v3BaselineLevel,
          durationBucket: reported.v3DurationBucket,
          missingMetrics: reported.v3MissingMetrics,
          reason:
            'v3 removes exact residual percentile lowering and scores direct DAK.GG role performance plus bounded placement adjustment.',
        }
      : null,
  }

  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'evaluation-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  const lines = [
    '# role-score.v3 direct evaluation',
    '',
    `accepted: ${report.accepted}`,
    `rows: ${report.source.evaluatedRows}`,
    `v2 mean: ${report.overall.v2.mean}, v3 mean: ${report.overall.v3.mean}`,
    `v2 S>=: ${report.overall.sOrAboveV2}, v3 S>=: ${report.overall.sOrAboveV3}`,
    `changed grade ratio: ${report.overall.changedGradeRatio}`,
    `roleScore-duration corr v2/v3: ${report.correlations.v2RoleScoreDuration} / ${report.correlations.v3RoleScoreDuration}`,
    '',
    '## acceptance',
    ...Object.entries(report.acceptance).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## #61802623',
    JSON.stringify(report.reportedMatch61802623, null, 2),
  ]
  await writeFile(join(outDir, 'evaluation-report.txt'), `${lines.join('\n')}\n`)
  console.log(JSON.stringify({
    accepted: report.accepted,
    evaluatedRows: report.source.evaluatedRows,
    overall: report.overall,
    correlations: report.correlations,
    acceptance: report.acceptance,
    reportedMatch61802623: report.reportedMatch61802623,
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
