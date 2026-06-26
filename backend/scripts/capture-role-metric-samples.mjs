#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { BserClient } from '../dist/external/bserClient.js'
import {
  CaptureAliasRegistry,
  buildCaptureFieldInventory,
  buildCaptureTargets,
  buildCaptureTextReport,
  buildRoleComparison,
  collectResponseShape,
  dedupePlannedSamples,
  parseCaptureCliArgs,
  pickParticipantRow,
  redactCaptureRecord,
} from '../dist/audit/roleMetricCapture.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputRoot = join(backendRoot, 'tmp', 'role-metric-capture')
const rawDir = join(outputRoot, 'raw-redacted')

const prisma = new PrismaClient()

async function findRecentGameIds(
  characterNum,
  weaponTypeId,
  limit,
) {
  const rows = await prisma.playerMatch.findMany({
    where: {
      characterNum,
      bestWeapon: weaponTypeId,
      gameMode: 'rank',
    },
    orderBy: { playedAt: 'desc' },
    take: Math.max(limit * 4, limit),
    select: {
      gameId: true,
      uid: true,
      characterNum: true,
      bestWeapon: true,
    },
  })

  const unique = []
  const seen = new Set()
  for (const row of rows) {
    if (seen.has(row.gameId)) continue
    seen.add(row.gameId)
    unique.push({
      gameId: row.gameId,
      uid: row.uid,
      characterNum: row.characterNum,
      weaponTypeId: row.bestWeapon ?? weaponTypeId,
    })
    if (unique.length >= limit) break
  }
  return unique
}

async function writeOutputs(payload) {
  await mkdir(rawDir, { recursive: true })
  const inventoryPath = join(outputRoot, 'field-inventory.json')
  const reportPath = join(outputRoot, 'field-report.txt')
  const comparisonPath = join(outputRoot, 'role-comparison.json')
  const samplesPath = join(outputRoot, 'samples.redacted.json')

  await writeFile(inventoryPath, `${JSON.stringify(payload.inventory, null, 2)}\n`, 'utf8')
  await writeFile(reportPath, `${payload.report}\n`, 'utf8')
  await writeFile(comparisonPath, `${JSON.stringify(payload.roleComparison, null, 2)}\n`, 'utf8')
  await writeFile(samplesPath, `${JSON.stringify(payload.samples, null, 2)}\n`, 'utf8')

  return { inventoryPath, reportPath, comparisonPath, samplesPath }
}

async function main() {
  const options = parseCaptureCliArgs(process.argv.slice(2))

  if (options.regenerateReport) {
    const samplesPath = join(outputRoot, 'samples.redacted.json')
    const payload = JSON.parse(await readFile(samplesPath, 'utf8'))
    const captureSamples = payload.samples ?? []
    const inventoryFields = buildCaptureFieldInventory(captureSamples)
    const roleComparison = buildRoleComparison(captureSamples)
    const sampleCounts = {}
    for (const sample of captureSamples) {
      sampleCounts[sample.comboLabel] = (sampleCounts[sample.comboLabel] ?? 0) + 1
    }
    const generatedAt = new Date().toISOString()
    const report = buildCaptureTextReport({
      generatedAt,
      apiCallCount: 0,
      capturedMatchCount: captureSamples.length,
      sampleCounts,
      failures: [{ reason: 'regenerate-report', detail: 'rebuilt from samples.redacted.json' }],
      inventory: inventoryFields,
      apiKeyPresent: Boolean(process.env.BSER_API_KEY),
      dryRun: false,
      responseShape: [],
    })
    const paths = await writeOutputs({
      inventory: {
        generatedAt,
        apiCallCount: 0,
        capturedMatchCount: captureSamples.length,
        sampleCounts,
        fields: inventoryFields,
        regenerated: true,
      },
      report,
      roleComparison,
      samples: payload,
    })
    console.log(`Regenerated report from ${captureSamples.length} samples`)
    console.log(JSON.stringify(paths, null, 2))
    return
  }

  const targets = buildCaptureTargets()
  const failures = []
  const sampleCounts = {}
  const planned = []

  if (options.gameIdOverride) {
    const row = await prisma.playerMatch.findFirst({
      where: { gameId: options.gameIdOverride },
      orderBy: { playedAt: 'desc' },
      select: {
        gameId: true,
        uid: true,
        characterNum: true,
        bestWeapon: true,
      },
    })
    if (!row) {
      failures.push({ reason: 'game-id-not-in-db', detail: options.gameIdOverride })
    } else {
      const target = targets.find(
        (entry) =>
          entry.characterNum === row.characterNum && entry.weaponTypeId === (row.bestWeapon ?? 0),
      ) ?? {
        characterNum: row.characterNum,
        weaponTypeId: row.bestWeapon ?? 0,
        label: `${row.characterNum}:${row.bestWeapon ?? 'null'}`,
        roleGroup: 'other',
      }
      planned.push({
        ...target,
        gameId: row.gameId,
        uid: row.uid,
      })
      sampleCounts[`${target.label} (${target.characterNum}:${target.weaponTypeId})`] = 1
    }
  } else {
    for (const target of targets) {
      const key = `${target.label} (${target.characterNum}:${target.weaponTypeId})`
      const candidates = await findRecentGameIds(
        target.characterNum,
        target.weaponTypeId,
        options.maxPerCombination,
      )
      sampleCounts[key] = candidates.length
      if (candidates.length === 0) {
        failures.push({
          reason: 'no-db-sample',
          detail: key,
        })
        continue
      }
      for (const candidate of candidates) {
        planned.push({
          ...target,
          gameId: candidate.gameId,
          uid: candidate.uid,
        })
      }
    }
  }

  const { selected, skipped } = dedupePlannedSamples(planned, options.maxGames)
  for (const entry of skipped) {
    failures.push({ reason: entry.reason, detail: entry.gameId })
  }

  const uniqueGameIds = [...new Set(selected.map((row) => row.gameId))]
  const generatedAt = new Date().toISOString()

  if (options.dryRun) {
    const report = buildCaptureTextReport({
      generatedAt,
      apiCallCount: 0,
      capturedMatchCount: 0,
      sampleCounts,
      failures: [
        ...failures,
        { reason: 'dry-run', detail: `planned unique games: ${uniqueGameIds.length}` },
      ],
      inventory: [],
      apiKeyPresent: Boolean(process.env.BSER_API_KEY),
      dryRun: true,
      responseShape: [],
    })
    const paths = await writeOutputs({
      inventory: { generatedAt, fields: [], plannedGameCount: uniqueGameIds.length, dryRun: true },
      report,
      roleComparison: {},
      samples: { generatedAt, samples: [], planned: selected.map((row) => ({
        comboLabel: row.label,
        characterNum: row.characterNum,
        weaponTypeId: row.weaponTypeId,
        roleGroup: row.roleGroup,
        gameId: '[redacted-plan]',
      })) },
    })
    console.log(`Dry run — planned ${uniqueGameIds.length} unique game fetches`)
    console.log(JSON.stringify(paths, null, 2))
    return
  }

  const apiKey = process.env.BSER_API_KEY ?? ''
  if (!apiKey) {
    failures.push({ reason: 'missing-api-key', detail: 'BSER_API_KEY' })
    const report = buildCaptureTextReport({
      generatedAt,
      apiCallCount: 0,
      capturedMatchCount: 0,
      sampleCounts,
      failures,
      inventory: [],
      apiKeyPresent: false,
      dryRun: false,
      responseShape: [],
    })
    const paths = await writeOutputs({
      inventory: { generatedAt, fields: [], error: 'missing-api-key' },
      report,
      roleComparison: {},
      samples: { generatedAt, samples: [] },
    })
    console.log('BSER_API_KEY missing — report written without API calls')
    console.log(JSON.stringify(paths, null, 2))
    return
  }

  const bser = new BserClient(apiKey)
  const registry = new CaptureAliasRegistry()
  const gameCache = new Map()
  let apiCallCount = 0
  const captureSamples = []
  let responseShape = []

  await mkdir(rawDir, { recursive: true })

  for (const gameId of uniqueGameIds) {
    try {
      const games = await bser.getGame(gameId)
      apiCallCount += 1
      gameCache.set(gameId, games)
      if (responseShape.length === 0 && games.length > 0) {
        responseShape = collectResponseShape(games)
      }
    } catch (error) {
      failures.push({
        reason: 'api-fetch-failed',
        detail: `${gameId}: ${error instanceof Error ? error.message : String(error)}`,
      })
      gameCache.set(gameId, null)
    }
  }

  for (const plan of selected) {
    const games = gameCache.get(plan.gameId)
    if (!games) continue
    const row = pickParticipantRow(games, {
      characterNum: plan.characterNum,
      weaponTypeId: plan.weaponTypeId,
      uid: plan.uid,
    })
    if (!row) {
      failures.push({
        reason: 'participant-not-found',
        detail: `${plan.label} @ ${plan.gameId}`,
      })
      continue
    }

    const sampleGameAlias = registry.aliasGameId(plan.gameId)
    const sampleUserAlias = registry.aliasUserNum(
      typeof row.userNum === 'number' || typeof row.userNum === 'string' ? row.userNum : null,
    )
    const redacted = redactCaptureRecord(
      {
        ...row,
        gameId: sampleGameAlias,
        userNum: sampleUserAlias,
        nickname: '[redacted]',
      },
      registry,
    )

    captureSamples.push({
      sampleGameAlias,
      sampleUserAlias,
      characterNum: plan.characterNum,
      weaponTypeId: plan.weaponTypeId,
      roleGroup: plan.roleGroup,
      comboLabel: plan.label,
      payload: redacted,
    })

    const rawPath = join(rawDir, `${sampleGameAlias}.json`)
    await writeFile(rawPath, `${JSON.stringify(redacted, null, 2)}\n`, 'utf8')
  }

  const inventoryFields = buildCaptureFieldInventory(captureSamples)
  const roleComparison = buildRoleComparison(captureSamples)
  const report = buildCaptureTextReport({
    generatedAt,
    apiCallCount,
    capturedMatchCount: captureSamples.length,
    sampleCounts,
    failures,
    inventory: inventoryFields,
    apiKeyPresent: true,
    dryRun: false,
    responseShape,
  })

  const paths = await writeOutputs({
    inventory: {
      generatedAt,
      apiCallCount,
      capturedMatchCount: captureSamples.length,
      sampleCounts,
      fields: inventoryFields,
    },
    report,
    roleComparison,
    samples: {
      generatedAt,
      sampleCount: captureSamples.length,
      samples: captureSamples.map((sample) => ({
        sampleGameAlias: sample.sampleGameAlias,
        sampleUserAlias: sample.sampleUserAlias,
        characterNum: sample.characterNum,
        weaponTypeId: sample.weaponTypeId,
        roleGroup: sample.roleGroup,
        comboLabel: sample.comboLabel,
        payload: sample.payload,
      })),
    },
  })

  console.log(`API calls: ${apiCallCount}`)
  console.log(`Captured samples: ${captureSamples.length}`)
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
