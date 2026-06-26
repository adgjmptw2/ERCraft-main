#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildCombatParticipationBaselineDocument,
  toCombatParticipationRow,
} from '../dist/audit/combatParticipationBaselineBuilder.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputPath = join(
  backendRoot,
  'src',
  'data',
  'characterGrade',
  'combat-participation-baselines.v1.json',
)

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
    },
  })

  const baselineRows = rows
    .map((row) => toCombatParticipationRow(row))
    .filter((row) => row != null)

  const document = buildCombatParticipationBaselineDocument(baselineRows, CURRENT_DISPLAY_SEASON)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        outputPath,
        participantRowCount: document.participantRowCount,
        uniqueGameCount: document.uniqueGameCount,
        uniqueUserCount: document.uniqueUserCount,
        exactCombinationCount: document.exactCombinationCount,
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
