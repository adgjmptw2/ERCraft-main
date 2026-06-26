#!/usr/bin/env node
import 'dotenv/config'

import { PrismaClient } from '@prisma/client'

import { PLAYER_ANALYSIS_BENCHMARK_VERSION } from '../dist/services/playerCharacterSnapshot/config.js'
import { runPlayerCharacterShadowAudit } from '../dist/services/playerCharacterSnapshot/audit.js'
import { syncSeasonRoleSnapshots } from '../dist/services/playerRoleSnapshot/sync.js'

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
const window = readStringArg('window', 'season')
const userLimit = readNumberArg('limit', 0)

if (benchmarkScope !== 'rank') {
  console.error('[benchmark:player-role] only scope=rank is supported for analysis backfill')
  process.exit(1)
}

if (window !== 'season' && window !== 'recent20') {
  console.error('[benchmark:player-role] window must be season or recent20')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const seasonRow = await prisma.playerMatch.findFirst({
    where: { displaySeasonId, gameMode: 'rank' },
    select: { apiSeasonId: true, displaySeasonId: true },
    orderBy: { playedAt: 'desc' },
  })
  if (!seasonRow) {
    throw new Error(`No rank PlayerMatch rows for display season ${displaySeasonId}`)
  }

  console.error(
    `[benchmark:player-role] season=${displaySeasonId} api=${seasonRow.apiSeasonId} scope=${benchmarkScope} window=${window}`,
  )

  const charReport = await runPlayerCharacterShadowAudit(prisma, {
    displaySeasonId: seasonRow.displaySeasonId,
    apiSeasonId: seasonRow.apiSeasonId,
    benchmarkScope,
    validateParticipants: false,
  })

  const syncedUsers = await syncSeasonRoleSnapshots(prisma, {
    displaySeasonId: seasonRow.displaySeasonId,
    apiSeasonId: seasonRow.apiSeasonId,
    benchmarkScope,
    limit: userLimit > 0 ? userLimit : undefined,
  })

  const roleRows = await prisma.playerRolePerformanceSnapshot.groupBy({
    by: ['primaryRole', 'tierBand'],
    where: {
      displaySeasonId,
      benchmarkScope,
      rowType: window,
      benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
    },
    _count: true,
  })

  const totalRoleSnapshots = await prisma.playerRolePerformanceSnapshot.count({
    where: {
      displaySeasonId,
      benchmarkScope,
      rowType: window,
      benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
    },
  })

  const summary = {
    displaySeasonId,
    apiSeasonId: seasonRow.apiSeasonId,
    benchmarkScope,
    window,
    benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
    syncedUsers,
    characterSnapshots: charReport.snapshotCount,
    characterCreated: charReport.buildStats.created,
    characterUpdated: charReport.buildStats.updated,
    characterReused: charReport.buildStats.reused,
    roleSnapshots: totalRoleSnapshots,
    roleCohorts: roleRows.map((row) => ({
      primaryRole: row.primaryRole,
      tierBand: row.tierBand,
      count: row._count,
    })),
  }

  console.log(JSON.stringify(summary, null, 2))
} finally {
  await prisma.$disconnect()
}