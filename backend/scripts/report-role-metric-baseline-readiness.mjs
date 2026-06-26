#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildBaselineReadinessReport,
  formatBaselineReadinessText,
  toRowSnapshot,
} from '../dist/audit/roleMetricBaselineReadiness.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputDir = join(backendRoot, 'tmp')

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: {
      roleMetricsVersion: 1,
      gameMode: 'rank',
    },
    select: {
      gameId: true,
      characterNum: true,
      bestWeapon: true,
      rpAfter: true,
      displaySeasonId: true,
      deaths: true,
      damageFromPlayer: true,
      protectAbsorb: true,
      shieldDamageOffsetFromPlayer: true,
      teamRecover: true,
      ccTimeToPlayer: true,
      viewContribution: true,
      monsterKill: true,
    },
  })

  const snapshots = rows.map((row) => toRowSnapshot(row))
  const report = buildBaselineReadinessReport(snapshots)
  const text = formatBaselineReadinessText(report)

  await mkdir(outputDir, { recursive: true })
  const jsonPath = join(outputDir, 'role-metric-baseline-readiness.json')
  const txtPath = join(outputDir, 'role-metric-baseline-readiness.txt')
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(txtPath, `${text}\n`, 'utf8')

  console.log(`versioned rows: ${report.versionedRows}`)
  console.log(JSON.stringify({ jsonPath, txtPath }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
