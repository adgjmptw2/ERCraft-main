#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildCalibrationReport,
  formatCalibrationReportText,
  toCalibrationRow,
} from '../dist/audit/roleMetricCalibration.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputDir = join(backendRoot, 'tmp', 'role-metric-calibration')

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
      deaths: true,
      kills: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      victory: true,
      placement: true,
      gameDuration: true,
      playedAt: true,
      damageFromPlayer: true,
      protectAbsorb: true,
      shieldDamageOffsetFromPlayer: true,
      teamRecover: true,
      ccTimeToPlayer: true,
      viewContribution: true,
      monsterKill: true,
    },
  })

  const calibrationRows = rows.map((row) => toCalibrationRow(row))
  const report = buildCalibrationReport(calibrationRows)

  await mkdir(outputDir, { recursive: true })

  const paths = {
    sampleBalance: join(outputDir, 'sample-balance.json'),
    metricReadiness: join(outputDir, 'metric-readiness.json'),
    tankerCandidates: join(outputDir, 'tanker-candidates.json'),
    supporterCandidates: join(outputDir, 'supporter-candidates.json'),
    calibrationReport: join(outputDir, 'calibration-report.txt'),
  }

  await writeFile(paths.sampleBalance, `${JSON.stringify(report.sampleBalance, null, 2)}\n`, 'utf8')
  await writeFile(
    paths.metricReadiness,
    `${JSON.stringify(report.metricReadiness, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    paths.tankerCandidates,
    `${JSON.stringify(report.tankerCandidates, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    paths.supporterCandidates,
    `${JSON.stringify(report.supporterCandidates, null, 2)}\n`,
    'utf8',
  )
  await writeFile(paths.calibrationReport, `${formatCalibrationReportText(report)}\n`, 'utf8')

  console.log(`calibration rows: ${calibrationRows.length}`)
  console.log(JSON.stringify(paths, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
