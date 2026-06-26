#!/usr/bin/env node
import 'dotenv/config'

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { runPlayerCharacterShadowAudit } from '../dist/services/playerCharacterSnapshot/audit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPORT_PATH = path.join(__dirname, '../reports/player-character-shadow-39.40.json')

function readStringArg(name, fallback) {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : fallback
}

function readNumberArg(name, fallback) {
  const raw = readStringArg(name, null)
  if (raw == null) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

const displaySeasonId = readNumberArg('season', 11)
const benchmarkScope = readStringArg('scope', 'rank')
const validateParticipants = process.argv.includes('--validate-participants')

const prisma = new PrismaClient()

try {
  const seasonRow = await prisma.playerMatch.findFirst({
    where: { displaySeasonId },
    select: { apiSeasonId: true, displaySeasonId: true },
    orderBy: { playedAt: 'desc' },
  })
  if (!seasonRow) {
    throw new Error(`No PlayerMatch rows found for display season ${displaySeasonId}`)
  }

  console.error(
    `[39.40] building player-character shadow audit season=${displaySeasonId} api=${seasonRow.apiSeasonId} scope=${benchmarkScope}`,
  )

  const report = await runPlayerCharacterShadowAudit(prisma, {
    displaySeasonId: seasonRow.displaySeasonId,
    apiSeasonId: seasonRow.apiSeasonId,
    benchmarkScope,
    validateParticipants,
  })

  mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.error(`[39.40] wrote ${REPORT_PATH}`)
  console.error(
    `[39.40] users=${report.uniqueUsers} snapshots=${report.snapshotCount} created=${report.buildStats.created} updated=${report.buildStats.updated} reused=${report.buildStats.reused}`,
  )
} finally {
  await prisma.$disconnect()
}
