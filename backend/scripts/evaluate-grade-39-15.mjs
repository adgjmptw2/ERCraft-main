#!/usr/bin/env node
import 'dotenv/config'

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PrismaClient } from '@prisma/client'

import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { scoreToFineGrade } from '../dist/services/characterPerformanceGrade/config.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import {
  aggregateGlobalPriorMean,
  applyAggregateSampleAdjustment,
  characterPriorMeanFromRoles,
  scoreToAggregateGrade,
} from '../dist/services/aggregateGrade.js'
import {
  computeMatchGradeV3,
  roleScoreV3BasePlacementAdjustment,
} from '../dist/services/roleScore/roleScoreV3.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'

const prisma = new PrismaClient()

const repoRoot = join(import.meta.dirname, '..', '..')
const reportDir = join(repoRoot, 'reports', 'grade-39-15')
const reportJsonPath = join(reportDir, 'evaluation-report.json')
const reportTxtPath = join(reportDir, 'evaluation-report.txt')

const TARGET_NICKNAME = '찬형'
const TARGET_CHARACTERS = new Map([
  [5, '자히르'],
  [29, '레온'],
  [77, '유민'],
  [32, '윌리엄'],
])

const GRADE_ORDER = [
  'S+',
  'S',
  'S-',
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
]

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function mean(values) {
  const finite = values.filter((value) => Number.isFinite(value))
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

function corr(xs, ys) {
  const pairs = xs
    .map((x, i) => [x, ys[i]])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (pairs.length < 2) return null
  const mx = mean(pairs.map(([x]) => x))
  const my = mean(pairs.map(([, y]) => y))
  if (mx == null || my == null) return null
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0)
  const dx = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - mx) ** 2, 0))
  const dy = Math.sqrt(pairs.reduce((sum, [, y]) => sum + (y - my) ** 2, 0))
  return dx > 0 && dy > 0 ? numerator / (dx * dy) : null
}

function gradeCounts(rows, pickGrade) {
  const counts = Object.fromEntries(GRADE_ORDER.map((grade) => [grade, 0]))
  for (const row of rows) {
    const grade = pickGrade(row)
    if (grade) counts[grade] = (counts[grade] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0))
}

function isS(grade) {
  return typeof grade === 'string' && grade.startsWith('S')
}

function isAOrAbove(grade) {
  return typeof grade === 'string' && (grade.startsWith('S') || grade.startsWith('A'))
}

function gradeRates(rows, pickGrade) {
  const total = rows.length
  if (total === 0) return { sPlusRate: 0, sOrAboveRate: 0, aOrAboveRate: 0 }
  return {
    sPlusRate: round(rows.filter((row) => pickGrade(row) === 'S+').length / total),
    sOrAboveRate: round(rows.filter((row) => isS(pickGrade(row))).length / total),
    aOrAboveRate: round(rows.filter((row) => isAOrAbove(pickGrade(row))).length / total),
  }
}

function summarizeMatchRows(rows, gradeKey, scoreKey) {
  return {
    total: rows.length,
    averageScore: round(mean(rows.map((row) => row[scoreKey])) ?? 0),
    gradeDistribution: gradeCounts(rows, (row) => row[gradeKey]),
    ...gradeRates(rows, (row) => row[gradeKey]),
  }
}

function summarizeBy(rows, keys, makeSummary) {
  const result = {}
  for (const key of keys) {
    const bucketRows = rows.filter((row) => String(row.__bucket) === String(key))
    result[key] = makeSummary(bucketRows)
  }
  return result
}

function roleScoreBucket(value) {
  if (value < 50) return '0-49'
  if (value < 60) return '50-59'
  if (value < 70) return '60-69'
  if (value < 80) return '70-79'
  if (value < 90) return '80-89'
  return '90+'
}

function sampleBucket(n) {
  if (n < 10) return '5-9'
  if (n < 20) return '10-19'
  if (n < 30) return '20-29'
  return '30+'
}

function aggregateRows(groups, scope) {
  const rows = []
  const globalPrior = aggregateGlobalPriorMean()
  for (const group of groups.values()) {
    if (scope === 'character' && group.length < 5) continue
    const rawScore = mean(group.map((row) => row.v2Score))
    if (rawScore == null) continue
    const priorMean =
      scope === 'character'
        ? characterPriorMeanFromRoles(group.map((row) => ({ role: row.role, weight: 1 })))
        : globalPrior
    const adjustedScore = applyAggregateSampleAdjustment({
      rawScore,
      sampleSize: group.length,
      priorMean,
    })
    rows.push({
      uid: group[0].uid,
      characterNum: group[0].characterNum,
      characterName: group[0].characterName,
      primaryRole: group[0].role,
      matchCount: group.length,
      minScore: Math.min(...group.map((row) => row.v2Score)),
      maxScore: Math.max(...group.map((row) => row.v2Score)),
      rawScore,
      priorMean,
      adjustedScore,
      beforeGrade: scoreToAggregateGrade(adjustedScore, scope),
      afterGrade: scoreToFineGrade(adjustedScore),
      scoreInConstituentRange:
        rawScore >= Math.min(...group.map((row) => row.v2Score)) &&
        rawScore <= Math.max(...group.map((row) => row.v2Score)),
    })
  }
  return rows
}

function summarizeAggregate(rows) {
  const changed = rows.filter((row) => row.beforeGrade !== row.afterGrade).length
  return {
    total: rows.length,
    before: {
      gradeDistribution: gradeCounts(rows, (row) => row.beforeGrade),
      ...gradeRates(rows, (row) => row.beforeGrade),
    },
    after: {
      gradeDistribution: gradeCounts(rows, (row) => row.afterGrade),
      ...gradeRates(rows, (row) => row.afterGrade),
    },
    gradeChangeRate: rows.length > 0 ? round(changed / rows.length) : 0,
    adjustedMatchesSharedFineCuts: rows.every(
      (row) => row.afterGrade === scoreToFineGrade(row.adjustedScore),
    ),
    rawScoreWithinConstituentRange: rows.every((row) => row.scoreInConstituentRange),
  }
}

function byAggregateBucket(rows) {
  const buckets = ['5-9', '10-19', '20-29', '30+']
  return Object.fromEntries(
    buckets.map((bucket) => {
      const bucketRows = rows.filter((row) => sampleBucket(row.matchCount) === bucket)
      return [bucket, summarizeAggregate(bucketRows)]
    }),
  )
}

function byAggregateRole(rows) {
  const roles = [...new Set(rows.map((row) => row.primaryRole).filter(Boolean))].sort()
  return Object.fromEntries(
    roles.map((role) => [role, summarizeAggregate(rows.filter((row) => row.primaryRole === role))]),
  )
}

async function main() {
  const dbRows = await prisma.playerMatch.findMany({
    where: {
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    },
    orderBy: [{ uid: 'asc' }, { playedAt: 'asc' }],
  })

  const matchRows = []
  for (const row of dbRows) {
    if (row.bestWeapon == null || row.bestWeapon <= 0) continue
    const role = lookupCharacterWeaponRole(row.characterNum, row.bestWeapon)
    if (!role) continue
    const tier = getRankTierFromRp(row.rpAfter ?? 0, null, CURRENT_DISPLAY_SEASON)
    const tierKey = rankTierToGradeBaselineKey(tier) ?? 'meteorite_plus'
    const current = computeMatchGradeV3({
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
    if (!current || row.placement == null) continue
    const baseAdjustment = roleScoreV3BasePlacementAdjustment(row.placement)
    if (baseAdjustment == null) continue
    const v1Score = round(clamp(current.roleScore + baseAdjustment, 0, 100), 2)
    matchRows.push({
      uid: row.uid,
      characterNum: row.characterNum,
      characterName: row.characterName,
      role,
      placement: row.placement,
      roleScore: current.roleScore,
      v1Adjustment: baseAdjustment,
      v2Adjustment: current.placementAdjustment,
      v1Score,
      v2Score: current.score,
      v1Grade: scoreToFineGrade(v1Score),
      v2Grade: current.grade,
    })
  }

  const characterGroups = new Map()
  const overallGroups = new Map()
  for (const row of matchRows) {
    const characterKey = `${row.uid}:${row.characterNum}`
    if (!characterGroups.has(characterKey)) characterGroups.set(characterKey, [])
    characterGroups.get(characterKey).push(row)
    if (!overallGroups.has(row.uid)) overallGroups.set(row.uid, [])
    overallGroups.get(row.uid).push(row)
  }

  const characterRows = aggregateRows(characterGroups, 'character')
  const overallRows = aggregateRows(overallGroups, 'overall')
  const changedMatches = matchRows.filter((row) => row.v1Grade !== row.v2Grade).length

  const placementSummary = Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8].map((placement) => {
      const rows = matchRows.filter((row) => row.placement === placement)
      return [
        placement,
        {
          count: rows.length,
          averageRoleScore: round(mean(rows.map((row) => row.roleScore)) ?? 0),
          averagePlacementAdjustment: round(mean(rows.map((row) => row.v2Adjustment)) ?? 0),
          averageFinalScore: round(mean(rows.map((row) => row.v2Score)) ?? 0),
          ...gradeRates(rows, (row) => row.v2Grade),
        },
      ]
    }),
  )

  const roleScoreBucketSummary = Object.fromEntries(
    ['0-49', '50-59', '60-69', '70-79', '80-89', '90+'].map((bucket) => {
      const rows = matchRows.filter((row) => roleScoreBucket(row.roleScore) === bucket)
      return [
        bucket,
        {
          count: rows.length,
          byPlacement: Object.fromEntries(
            [1, 2, 3, 4, 5, 6, 7, 8].map((placement) => {
              const placementRows = rows.filter((row) => row.placement === placement)
              return [placement, summarizeMatchRows(placementRows, 'v2Grade', 'v2Score')]
            }),
          ),
        },
      ]
    }),
  )

  const targetBinding = await prisma.profileNicknameBinding.findUnique({
    where: { normalizedNickname: TARGET_NICKNAME.toLowerCase() },
  })
  const targetUid = targetBinding?.canonicalUid ?? null
  const targetMatches = targetUid ? matchRows.filter((row) => row.uid === targetUid) : []
  const targetOverall = targetUid ? overallRows.find((row) => row.uid === targetUid) ?? null : null
  const targetCharacters = Object.fromEntries(
    [...TARGET_CHARACTERS.entries()].map(([characterNum, label]) => {
      const row =
        targetUid != null
          ? characterRows.find((entry) => entry.uid === targetUid && entry.characterNum === characterNum) ?? null
          : null
      return [
        label,
        row
          ? {
              matchCount: row.matchCount,
              minScore: round(row.minScore, 2),
              averageScore: round(row.rawScore, 2),
              maxScore: round(row.maxScore, 2),
              rawScore: round(row.rawScore, 2),
              priorMean: round(row.priorMean, 2),
              adjustedScore: round(row.adjustedScore, 2),
              sharedFineGrade: row.afterGrade,
              diagnosticAggregateGrade: row.beforeGrade,
            }
          : null,
      ]
    }),
  )

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      sourceRows: dbRows.length,
      evaluatedMatchRows: matchRows.length,
      matchGradeBeforeVersion: 'match-grade-direct.v1',
      matchGradeAfterVersion: 'match-grade-direct.v2',
      aggregateBeforeLetterGradeCuts: 'aggregate-grade-calibration.v1 diagnostic percentile cuts',
      aggregateAfterLetterGradeCuts: 'aggregate-grade-shared-fine-cuts.v1',
      aggregateCalibrationUsage: 'diagnostic-priors-and-distribution-report-only',
    },
    matchGrades: {
      before: summarizeMatchRows(matchRows, 'v1Grade', 'v1Score'),
      after: summarizeMatchRows(matchRows, 'v2Grade', 'v2Score'),
      gradeChangeRate: matchRows.length > 0 ? round(changedMatches / matchRows.length) : 0,
      averageScoreDelta: round(mean(matchRows.map((row) => row.v2Score - row.v1Score)) ?? 0),
      correlations: {
        placementVsRoleScore: round(corr(matchRows.map((row) => row.placement), matchRows.map((row) => row.roleScore)) ?? 0),
        placementVsV1Score: round(corr(matchRows.map((row) => row.placement), matchRows.map((row) => row.v1Score)) ?? 0),
        placementVsV2Score: round(corr(matchRows.map((row) => row.placement), matchRows.map((row) => row.v2Score)) ?? 0),
      },
      byPlacement: placementSummary,
      byRoleScoreBucket: roleScoreBucketSummary,
    },
    aggregateGrades: {
      character: {
        summary: summarizeAggregate(characterRows),
        bySampleBucket: byAggregateBucket(characterRows),
        byRole: byAggregateRole(characterRows),
      },
      overall: {
        summary: summarizeAggregate(overallRows),
        bySampleBucket: byAggregateBucket(overallRows),
      },
    },
    targetProfile: {
      nickname: TARGET_NICKNAME,
      found: targetUid != null,
      matchFineGradeDistribution: gradeCounts(targetMatches, (row) => row.v2Grade),
      overall: targetOverall
        ? {
            rawScore: round(targetOverall.rawScore, 2),
            priorMean: round(targetOverall.priorMean, 2),
            adjustedScore: round(targetOverall.adjustedScore, 2),
            sharedFineGrade: targetOverall.afterGrade,
            diagnosticAggregateGrade: targetOverall.beforeGrade,
          }
        : null,
      characters: targetCharacters,
    },
  }

  await mkdir(reportDir, { recursive: true })
  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(
    reportTxtPath,
    [
      '# 39.15 grade evaluation',
      '',
      `evaluatedMatchRows: ${report.metadata.evaluatedMatchRows}`,
      `match before S/S+/A rates: ${JSON.stringify(report.matchGrades.before)}`,
      `match after S/S+/A rates: ${JSON.stringify(report.matchGrades.after)}`,
      `match gradeChangeRate: ${report.matchGrades.gradeChangeRate}`,
      `match averageScoreDelta: ${report.matchGrades.averageScoreDelta}`,
      '',
      '## Placement summary',
      JSON.stringify(report.matchGrades.byPlacement, null, 2),
      '',
      '## Aggregate character summary',
      JSON.stringify(report.aggregateGrades.character.summary, null, 2),
      '',
      '## Aggregate overall summary',
      JSON.stringify(report.aggregateGrades.overall.summary, null, 2),
      '',
      '## Target profile',
      JSON.stringify(report.targetProfile, null, 2),
    ].join('\n'),
  )

  console.log(JSON.stringify({
    reportJsonPath,
    evaluatedMatchRows: report.metadata.evaluatedMatchRows,
    matchBefore: report.matchGrades.before,
    matchAfter: report.matchGrades.after,
    aggregateCharacter: report.aggregateGrades.character.summary,
    aggregateOverall: report.aggregateGrades.overall.summary,
    targetProfile: report.targetProfile,
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
