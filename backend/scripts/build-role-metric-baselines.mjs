#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildRoleMetricBaselineDocument,
  toBaselineRow,
} from '../dist/audit/roleMetricBaselineBuilder.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputPath = join(
  backendRoot,
  'src',
  'data',
  'characterGrade',
  'role-metric-baselines.v1.json',
)

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
    },
  })

  const baselineRows = rows
    .map((row) => toBaselineRow(row))
    .filter((row) => row != null)

  const document = buildRoleMetricBaselineDocument(baselineRows, CURRENT_DISPLAY_SEASON)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')

  const liveEligible = Object.values(document.combinations).filter(
    (combo) =>
      combo.liveEligibility.tankingEfficiency ||
      combo.liveEligibility.teamRecover ||
      combo.liveEligibility.shieldDamageOffsetFromPlayer,
  )

  console.log(
    JSON.stringify(
      {
        outputPath,
        rowCount: document.rowCount,
        comboCount: Object.keys(document.combinations).length,
        liveEligibleCombos: liveEligible.length,
        tankLive: liveEligible.filter((combo) => combo.liveEligibility.tankingEfficiency).length,
        supportLive: liveEligible.filter((combo) => combo.liveEligibility.teamRecover).length,
        playedAtFrom: document.playedAtFrom,
        playedAtTo: document.playedAtTo,
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
