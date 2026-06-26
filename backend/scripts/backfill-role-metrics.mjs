#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { BserClient } from '../dist/external/bserClient.js'
import {
  buildComboCountMap,
  buildRoleByComboMap,
  resolveComboKeyFromMatch,
  selectBalancedGamePlans,
} from '../dist/audit/roleMetricBalancedBackfill.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import {
  aliasGameIdForLog,
  buildRoleMetricsUpdatePayload,
  dedupeGamePlans,
  isGameAlreadyProcessed,
  mergeCheckpoint,
  parseBackfillCliArgs,
  pickParticipantForRow,
} from '../dist/audit/roleMetricsBackfill.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const checkpointPath = join(backendRoot, 'tmp', 'role-metrics-backfill-checkpoint.json')

const prisma = new PrismaClient()

async function loadCheckpoint() {
  try {
    const raw = await readFile(checkpointPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function saveCheckpoint(checkpoint) {
  await mkdir(dirname(checkpointPath), { recursive: true })
  checkpoint.updatedAt = new Date().toISOString()
  await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8')
}

async function loadComboPriorities() {
  const versionedRows = await prisma.playerMatch.findMany({
    where: {
      roleMetricsVersion: 1,
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      bestWeapon: { not: null },
    },
    select: {
      characterNum: true,
      bestWeapon: true,
      rpAfter: true,
      displaySeasonId: true,
    },
  })

  const comboCounts = new Map()
  const comboRoles = new Map()

  for (const row of versionedRows) {
    if (row.bestWeapon == null) continue
    const comboKey = resolveComboKeyFromMatch(
      row.rpAfter,
      row.displaySeasonId,
      row.characterNum,
      row.bestWeapon,
    )
    comboCounts.set(comboKey, (comboCounts.get(comboKey) ?? 0) + 1)
    if (!comboRoles.has(comboKey)) {
      comboRoles.set(comboKey, lookupCharacterWeaponRole(row.characterNum, row.bestWeapon))
    }
  }

  const inputs = [...comboCounts.entries()].map(([comboKey, sampleCount]) => ({
    comboKey,
    sampleCount,
    role: comboRoles.get(comboKey) ?? null,
  }))

  return {
    comboCounts: buildComboCountMap(inputs),
    roleByCombo: buildRoleByComboMap(inputs),
  }
}

async function findRecentGamePlans(options) {
  const where = {
    roleMetricsVersion: null,
    gameMode: 'rank',
    displaySeasonId: CURRENT_DISPLAY_SEASON,
    ...(options.characterNum != null ? { characterNum: options.characterNum } : {}),
    ...(options.weaponTypeId != null ? { bestWeapon: options.weaponTypeId } : {}),
  }

  const rows = await prisma.playerMatch.findMany({
    where,
    orderBy: { playedAt: 'desc' },
    select: { gameId: true },
    take: options.maxGames * 30,
  })

  const counts = new Map()
  for (const row of rows) {
    counts.set(row.gameId, (counts.get(row.gameId) ?? 0) + 1)
  }

  return dedupeGamePlans(
    [...counts.entries()].map(([gameId, rowCount]) => ({ gameId, rowCount })),
    options.maxGames,
  )
}

async function findBalancedGamePlans(options) {
  const where = {
    roleMetricsVersion: null,
    gameMode: 'rank',
    displaySeasonId: CURRENT_DISPLAY_SEASON,
    ...(options.characterNum != null ? { characterNum: options.characterNum } : {}),
    ...(options.weaponTypeId != null ? { bestWeapon: options.weaponTypeId } : {}),
  }

  const rows = await prisma.playerMatch.findMany({
    where,
    select: {
      gameId: true,
      characterNum: true,
      bestWeapon: true,
      rpAfter: true,
      displaySeasonId: true,
    },
    take: options.maxGames * 80,
  })

  const gameMap = new Map()
  for (const row of rows) {
    if (row.bestWeapon == null) continue
    const comboKey = resolveComboKeyFromMatch(
      row.rpAfter,
      row.displaySeasonId,
      row.characterNum,
      row.bestWeapon,
    )
    const existing = gameMap.get(row.gameId)
    if (existing) {
      existing.rowCount += 1
      existing.comboKeys.push(comboKey)
    } else {
      gameMap.set(row.gameId, {
        gameId: row.gameId,
        rowCount: 1,
        comboKeys: [comboKey],
      })
    }
  }

  const { comboCounts, roleByCombo } = await loadComboPriorities()
  const candidates = [...gameMap.values()]
  return selectBalancedGamePlans(candidates, comboCounts, roleByCombo, options.maxGames)
}

async function findPendingGamePlans(options) {
  if (options.strategy === 'balanced') {
    return findBalancedGamePlans(options)
  }
  return findRecentGamePlans(options)
}

async function main() {
  const options = parseBackfillCliArgs(process.argv.slice(2))
  const checkpoint = mergeCheckpoint(await loadCheckpoint(), options.resume)
  const plans = await findPendingGamePlans(options)

  const skippedProcessed = plans.filter((plan) => isGameAlreadyProcessed(plan.gameId, checkpoint))
  const pending = plans.filter((plan) => !isGameAlreadyProcessed(plan.gameId, checkpoint))

  console.log(`strategy: ${options.strategy}`)
  console.log(`season: S${CURRENT_DISPLAY_SEASON}`)
  console.log(`pending unique games: ${pending.length}`)
  console.log(`skipped by checkpoint: ${skippedProcessed.length}`)
  console.log(`dryRun: ${options.dryRun}`)

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          strategy: options.strategy,
          pendingGameCount: pending.length,
          estimatedRowUpdates: pending.reduce((sum, plan) => sum + plan.rowCount, 0),
        },
        null,
        2,
      ),
    )
    return
  }

  const apiKey = process.env.BSER_API_KEY ?? ''
  if (!apiKey) {
    console.error('BSER_API_KEY missing — backfill aborted')
    process.exitCode = 1
    return
  }

  const bser = new BserClient(apiKey)
  let apiCallCount = 0
  let updatedRows = 0
  let logIndex = 0

  for (const plan of pending) {
    logIndex += 1
    const logAlias = aliasGameIdForLog(plan.gameId, logIndex)

    try {
      const games = await bser.getGame(plan.gameId)
      apiCallCount += 1

      const rows = await prisma.playerMatch.findMany({
        where: {
          gameId: plan.gameId,
          roleMetricsVersion: null,
        },
        select: {
          id: true,
          uid: true,
          characterNum: true,
          bestWeapon: true,
        },
      })

      let gameUpdated = 0
      for (const row of rows) {
        const participant = pickParticipantForRow(games, {
          uid: row.uid,
          characterNum: row.characterNum,
          weaponTypeId: row.bestWeapon,
        })
        if (!participant) continue

        const payload = buildRoleMetricsUpdatePayload(participant)
        if (!payload) continue

        await prisma.playerMatch.update({
          where: { id: row.id },
          data: payload,
        })
        gameUpdated += 1
        updatedRows += 1
      }

      checkpoint.processedGameIds.push(plan.gameId)
      console.log(`${logAlias} ok rows=${gameUpdated}`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      checkpoint.failedGameIds.push({ gameId: logAlias, reason })
      console.log(`${logAlias} failed: ${reason}`)
    }

    await saveCheckpoint(checkpoint)
  }

  console.log(`API calls: ${apiCallCount}`)
  console.log(`Updated PlayerMatch rows: ${updatedRows}`)
  console.log(`Processed games: ${checkpoint.processedGameIds.length}`)
  console.log(`Failed games: ${checkpoint.failedGameIds.length}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
