#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildCombatParticipationReport,
  formatCombatParticipationReportText,
  verifyLiveGradesUnchanged,
} from '../dist/audit/combatParticipationShadow.js'
import { loadCombatParticipationBaselineDocument } from '../dist/audit/combatParticipationBaselineBuilder.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputDir = join(backendRoot, 'tmp', 'combat-participation')

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: {
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
      kills: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      victory: true,
      placement: true,
      roleMetricsVersion: true,
      viewContribution: true,
      monsterKill: true,
      damageFromPlayer: true,
      shieldDamageOffsetFromPlayer: true,
      teamRecover: true,
      ccTimeToPlayer: true,
      deaths: true,
      rawJson: true,
    },
  })

  const document = loadCombatParticipationBaselineDocument()
  const playerTier = getRankTierFromRp(rows[0]?.rpAfter ?? null, null, CURRENT_DISPLAY_SEASON)
  const playerTierKey = rankTierToGradeBaselineKey(playerTier) ?? 'meteorite_plus'

  const characterMap = new Map()
  for (const row of rows) {
    const stat = characterMap.get(row.characterNum) ?? {
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
    }
    stat.games += 1
    if (row.victory) stat.wins += 1
    characterMap.set(row.characterNum, stat)
  }
  for (const stat of characterMap.values()) {
    stat.winRate = stat.games > 0 ? (stat.wins / stat.games) * 100 : 0
  }

  const report = buildCombatParticipationReport({
    rows,
    participationDocument: document,
    playerTierKey,
  })

  const liveUnchanged = verifyLiveGradesUnchanged({
    rows,
    characterStats: [...characterMap.values()],
    playerTier,
  })

  await mkdir(outputDir, { recursive: true })
  const files = {
    fieldSemantics: join(outputDir, 'field-semantics.json'),
    distribution: join(outputDir, 'distribution.json'),
    correlation: join(outputDir, 'correlation.json'),
    shadowResults: join(outputDir, 'shadow-results.json'),
    report: join(outputDir, 'report.txt'),
  }

  await writeFile(files.fieldSemantics, `${JSON.stringify(report.fieldSemantics, null, 2)}\n`)
  await writeFile(files.distribution, `${JSON.stringify(report.distribution, null, 2)}\n`)
  await writeFile(files.correlation, `${JSON.stringify(report.correlation, null, 2)}\n`)
  await writeFile(files.shadowResults, `${JSON.stringify(report.shadowResults, null, 2)}\n`)
  await writeFile(files.report, formatCombatParticipationReportText(report))

  console.log(
    JSON.stringify(
      {
        participantRows: rows.length,
        roleMetricsVersion1Rows: rows.filter((row) => row.roleMetricsVersion === 1).length,
        rawJsonNonNullRows: rows.filter((row) => row.rawJson != null).length,
        liveGradesUnchanged: liveUnchanged,
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
