#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildRoleMetricBaselineDocument,
  loadRoleMetricBaselineDocument,
  toBaselineRow,
} from '../dist/audit/roleMetricBaselineBuilder.js'
import {
  buildShadowReport,
  formatShadowReportText,
} from '../dist/audit/roleMetricShadow.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputDir = join(backendRoot, 'tmp', 'role-metric-shadow')

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: {
      roleMetricsVersion: 1,
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    },
    select: {
      gameId: true,
      uid: true,
      characterNum: true,
      bestWeapon: true,
      rpAfter: true,
      displaySeasonId: true,
      playedAt: true,
      deaths: true,
      damageFromPlayer: true,
      protectAbsorb: true,
      shieldDamageOffsetFromPlayer: true,
      teamRecover: true,
      ccTimeToPlayer: true,
      viewContribution: true,
      monsterKill: true,
      victory: true,
      placement: true,
      roleMetricsVersion: true,
      kills: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      rawJson: true,
    },
  })

  const baselineRows = rows
    .map((row) => toBaselineRow(row))
    .filter((row) => row != null)

  let document
  try {
    document = loadRoleMetricBaselineDocument()
  } catch {
    document = buildRoleMetricBaselineDocument(baselineRows, CURRENT_DISPLAY_SEASON)
  }

  const profileGroups = new Map()
  for (const row of rows) {
    const bucket = profileGroups.get(row.uid) ?? []
    bucket.push(row)
    profileGroups.set(row.uid, bucket)
  }

  const largestProfile = [...profileGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0]
  const playerRows = largestProfile?.[1] ?? rows
  const playerTier = getRankTierFromRp(playerRows[0]?.rpAfter ?? null, null, CURRENT_DISPLAY_SEASON)
  const playerTierKey = rankTierToGradeBaselineKey(playerTier)

  const characterMap = new Map()
  for (const row of playerRows) {
    const existing = characterMap.get(row.characterNum)
    if (!existing) {
      characterMap.set(row.characterNum, {
        characterNum: row.characterNum,
        games: 0,
        wins: 0,
        winRate: 0,
        avgRank: 0,
        kills: 0,
        assists: 0,
        deaths: 0,
        kda: 0,
        avgTeamKills: 0,
        avgKills: 0,
        avgDamage: 0,
        gradeLabel: null,
      })
    }
    const stat = characterMap.get(row.characterNum)
    stat.games += 1
    if (row.victory) stat.wins += 1
  }
  for (const stat of characterMap.values()) {
    stat.winRate = stat.games > 0 ? (stat.wins / stat.games) * 100 : 0
  }

  const report = buildShadowReport({
    baselineRows,
    document,
    playerRows,
    characterStats: [...characterMap.values()],
    playerTier,
    playerTierKey: playerTierKey ?? 'meteorite_plus',
  })

  await mkdir(outputDir, { recursive: true })
  const files = {
    baselineSummary: join(outputDir, 'baseline-summary.json'),
    normalizationComparison: join(outputDir, 'normalization-comparison.json'),
    tankerShadowResults: join(outputDir, 'tanker-shadow-results.json'),
    supporterShadowResults: join(outputDir, 'supporter-shadow-results.json'),
    gradeChangeSummary: join(outputDir, 'grade-change-summary.json'),
    shadowReport: join(outputDir, 'shadow-report.txt'),
  }

  await writeFile(files.baselineSummary, `${JSON.stringify(report.baselineSummary, null, 2)}\n`)
  await writeFile(
    files.normalizationComparison,
    `${JSON.stringify(
      {
        comparisons: report.normalizationComparison,
        recommended: report.recommendedNormalization,
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    files.tankerShadowResults,
    `${JSON.stringify(report.tankerShadow, null, 2)}\n`,
  )
  await writeFile(
    files.supporterShadowResults,
    `${JSON.stringify(report.supporterShadow, null, 2)}\n`,
  )
  await writeFile(
    files.gradeChangeSummary,
    `${JSON.stringify(
      {
        recovery: report.recoveryComparison,
        tanker: report.tankerShadow,
        supporter: report.supporterShadow,
        stability: report.stability,
        outcomeControlled: report.outcomeControlled,
        profileSpotlight: report.profileSpotlight,
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(files.shadowReport, `${formatShadowReportText(report)}\n`)

  console.log(
    JSON.stringify(
      {
        baselineRows: baselineRows.length,
        profileRows: playerRows.length,
        ...files,
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
