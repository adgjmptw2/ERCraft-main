#!/usr/bin/env node
import 'dotenv/config'

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PrismaClient } from '@prisma/client'

import {
  aggregateGlobalPriorMean,
  applyAggregateSampleAdjustment,
  characterPriorMeanFromRoles,
} from '../dist/services/aggregateGrade.js'
import { buildCurrentSeasonCharacterStatsFromVerifiedSources } from '../dist/cache/currentSeasonCharacterStats.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import {
  CHARACTER_GRADE_BENCHMARK_VERSION,
  CHARACTER_GRADE_METRIC_PRESET_VERSION,
  scoreToFineGrade,
} from '../dist/services/characterPerformanceGrade/config.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { computeMatchGradeV3 } from '../dist/services/roleScore/roleScoreV3.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'
import { resolveProfileIdentity } from '../dist/utils/resolvedProfileIdentity.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'

const prisma = new PrismaClient()

const repoRoot = join(import.meta.dirname, '..', '..')
const reportDir = join(repoRoot, 'reports', 'grade-39-16')
const reportJsonPath = join(reportDir, 'evaluation-report.json')
const reportTxtPath = join(reportDir, 'evaluation-report.txt')

const TARGET_NICKNAME = '찬형'
const CURRENT_API_SEASON_ID = 39
const TARGET_CHARACTERS = new Map([
  [5, '자히르'],
  [29, '레온'],
  [77, '유민'],
  [32, '윌리엄'],
])

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function mean(values) {
  const finite = values.filter((value) => Number.isFinite(value))
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

function aggregate(group, scope, k) {
  const rawScore = mean(group.map((row) => row.score))
  if (rawScore == null) return null
  const priorMean =
    scope === 'character'
      ? characterPriorMeanFromRoles(group.map((row) => ({ role: row.role, weight: 1 })))
      : aggregateGlobalPriorMean()
  const adjustedScore = applyAggregateSampleAdjustment({
    rawScore,
    sampleSize: group.length,
    priorMean,
    k,
  })

  return {
    matchCount: group.length,
    rawScore: round(rawScore, 2),
    priorMean: round(priorMean, 2),
    adjustedScore: round(adjustedScore, 2),
    grade: scoreToFineGrade(adjustedScore),
  }
}

function groupBy(rows, keyFn) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return groups
}

async function main() {
  const binding = await prisma.profileNicknameBinding.findUnique({
    where: { normalizedNickname: TARGET_NICKNAME.toLowerCase() },
  })
  if (!binding?.canonicalUid || binding.canonicalUserNum == null) {
    throw new Error('target binding not found')
  }

  const identity = await resolveProfileIdentity(prisma, {
    nickname: TARGET_NICKNAME,
    lookupUid: binding.canonicalUid,
    apiSeasonId: CURRENT_API_SEASON_ID,
  })
  const pmStats = await buildCurrentSeasonCharacterStatsFromVerifiedSources(prisma, {
    uid: identity.owner.canonicalUid,
    playerMatchUids: identity.sources.playerMatchUids,
    apiSeasonId: CURRENT_API_SEASON_ID,
    displaySeasonId: CURRENT_DISPLAY_SEASON,
  })

  const matchRows = []
  const matchGradeSources = new Map()
  for (const row of pmStats.rows) {
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
    if (!current) continue
    const source = current.scoreSource ?? 'unknown'
    matchGradeSources.set(source, (matchGradeSources.get(source) ?? 0) + 1)
    matchRows.push({
      characterNum: row.characterNum,
      role,
      score: current.score,
    })
  }

  const characterGroups = groupBy(matchRows, (row) => String(row.characterNum))
  const targetCharacters = Object.fromEntries(
    [...TARGET_CHARACTERS.entries()].map(([characterNum, label]) => {
      const group = characterGroups.get(String(characterNum)) ?? []
      if (group.length < 5) return [label, null]
      const before = aggregate(group, 'character', 5)
      const after = aggregate(group, 'character', 1)
      return [
        label,
        {
          matchCount: group.length,
          rawScore: after?.rawScore ?? null,
          priorMean: after?.priorMean ?? null,
          k5AdjustedScore: before?.adjustedScore ?? null,
          k1AdjustedScore: after?.adjustedScore ?? null,
          beforeGrade: before?.grade ?? null,
          afterGrade: after?.grade ?? null,
        },
      ]
    }),
  )

  const overallBefore = aggregate(matchRows, 'overall', 5)
  const overallAfter = aggregate(matchRows, 'overall', 1)
  const snapshots = await prisma.characterGradeSnapshot.findMany({
    where: {
      canonicalUserNum: binding.canonicalUserNum,
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      matchMode: 'rank',
    },
    select: {
      metricPresetVersion: true,
      benchmarkVersion: true,
      status: true,
      computedAt: true,
      metadata: true,
    },
    orderBy: [{ computedAt: 'desc' }],
  })
  const currentSnapshot = snapshots.find(
    (snapshot) =>
      snapshot.metricPresetVersion === CHARACTER_GRADE_METRIC_PRESET_VERSION &&
      snapshot.benchmarkVersion === CHARACTER_GRADE_BENCHMARK_VERSION,
  )

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      apiSeasonId: CURRENT_API_SEASON_ID,
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      benchmarkVersion: CHARACTER_GRADE_BENCHMARK_VERSION,
      metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
      shrinkVersion: 'aggregate-shrink-k1.v1',
      outputPrivacy: 'uid, nickname, matchId, gameId omitted',
    },
    database: {
      rankRows: pmStats.rawMatchCount,
      deduplicatedRankRows: pmStats.deduplicatedMatchCount,
      sourceCount: pmStats.sourceCount,
      eligibleMatchRows: matchRows.length,
      matchGradeSources: Object.fromEntries(matchGradeSources),
      snapshotCount: snapshots.length,
      currentVersionSnapshotExists: Boolean(currentSnapshot),
      currentSnapshotOverallGradeV2: currentSnapshot?.metadata?.overallGradeV2 ?? null,
      snapshotVersions: snapshots.map((snapshot) => ({
        metricPresetVersion: snapshot.metricPresetVersion,
        benchmarkVersion: snapshot.benchmarkVersion,
        status: snapshot.status,
        computedAt: snapshot.computedAt.toISOString(),
      })),
    },
    overall: {
      eligibleMatchCount: matchRows.length,
      rawScore: overallAfter?.rawScore ?? null,
      priorMean: overallAfter?.priorMean ?? null,
      k5AdjustedScore: overallBefore?.adjustedScore ?? null,
      k1AdjustedScore: overallAfter?.adjustedScore ?? null,
      beforeGrade: overallBefore?.grade ?? null,
      afterGrade: overallAfter?.grade ?? null,
    },
    targetCharacters,
  }

  await mkdir(reportDir, { recursive: true })
  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(
    reportTxtPath,
    [
      '# grade-39-16 evaluation',
      '',
      `displaySeasonId: ${CURRENT_DISPLAY_SEASON}`,
      `benchmarkVersion: ${CHARACTER_GRADE_BENCHMARK_VERSION}`,
      `metricPresetVersion: ${CHARACTER_GRADE_METRIC_PRESET_VERSION}`,
      `eligibleMatchRows: ${report.database.eligibleMatchRows}`,
      `currentVersionSnapshotExists: ${report.database.currentVersionSnapshotExists}`,
      '',
      '## Overall',
      JSON.stringify(report.overall, null, 2),
      '',
      '## Target characters',
      JSON.stringify(report.targetCharacters, null, 2),
    ].join('\n'),
  )

  console.log(JSON.stringify({
    reportJsonPath,
    reportTxtPath,
    eligibleMatchRows: report.database.eligibleMatchRows,
    overall: report.overall,
    targetCharacters: report.targetCharacters,
    currentVersionSnapshotExists: report.database.currentVersionSnapshotExists,
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
