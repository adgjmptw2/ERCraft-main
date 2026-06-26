import 'dotenv/config'

import { PrismaClient } from '@prisma/client'

import { BserClient } from '../external/bserClient.js'
import { config as appConfig } from '../config/env.js'
import { readCollectorStatus } from './status.js'
import { loadCollectorConfig } from './config.js'
import { seedCollectorQueuesFromDb, reconcileLowTierCollectorUsers } from './queue.js'
import { seedIdentityQueueFromParticipants } from './identityQueue.js'
import { compactIdentityQueue } from './identityCompaction.js'
import { runDrainUntil } from './drainUntil.js'
import { CollectorRunner } from './runner.js'

function readStringArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : undefined
}

function readFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function readNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  if (!arg) return fallback
  const parsed = Number(arg.slice(prefix.length))
  return Number.isFinite(parsed) ? parsed : fallback
}

function readOptionalNumberArg(name: string): number | undefined {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  if (!arg) return undefined
  const parsed = Number(arg.slice(prefix.length))
  return Number.isFinite(parsed) ? parsed : undefined
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'status'
  const prisma = new PrismaClient()
  const collectorConfig = loadCollectorConfig()
  try {
    if (command === 'status') {
      const status = await readCollectorStatus(prisma, collectorConfig)
      console.log(JSON.stringify(status, null, 2))
      return
    }

    if (command === 'seed') {
      const limit = readNumberArg('limit', 500)
      const result = await seedCollectorQueuesFromDb(prisma, limit)
      const reconcile = await reconcileLowTierCollectorUsers(prisma, limit)
      console.log(JSON.stringify({ ...result, reconcile }, null, 2))
      return
    }

    if (command === 'user:refresh-priority') {
      const { refreshUserQueuePriorities, releaseStaleCollectorLeases } = await import('./queue.js')
      const stale = await releaseStaleCollectorLeases(prisma)
      const updated = await refreshUserQueuePriorities(
        prisma,
        readNumberArg('limit', collectorConfig.priorityRefreshBatchSize),
      )
      console.log(JSON.stringify({ stale, updated }, null, 2))
      return
    }

    if (command === 'identity:seed') {
      const result = await seedIdentityQueueFromParticipants(
        prisma,
        collectorConfig,
        readNumberArg('limit', 500),
      )
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (command === 'identity:compact') {
      const result = await compactIdentityQueue(prisma, collectorConfig, {
        dryRun: readFlag('dry-run'),
        maxRows: readNumberArg('max-rows', collectorConfig.identityCompactionBatchSize),
      })
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (command === 'identity:once') {
      if (!appConfig.bserApiKey && !readFlag('dry-run')) {
        throw new Error('BSER_API_KEY missing — collector identity run aborted')
      }
      const bser = new BserClient(appConfig.bserApiKey)
      const runner = new CollectorRunner(prisma, bser, {
        ...collectorConfig,
        identityEnabled: true,
      })
      const result = await runner.runOnce({
        dryRun: readFlag('dry-run'),
        maxRequests: readNumberArg('max-requests', 50),
        seedLimit: readNumberArg('seed-limit', 500),
        mode: readStringArg('mode'),
      })
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (command === 'drain-until') {
      if (!appConfig.bserApiKey && !readFlag('dry-run')) {
        throw new Error('BSER_API_KEY missing — collector drain-until aborted')
      }
      const bser = new BserClient(appConfig.bserApiKey)
      const result = await runDrainUntil(prisma, bser, collectorConfig, {
        targetPending: readNumberArg('target-pending', 7000),
        chunkRequests: readNumberArg('chunk-requests', 500),
        maxTotalRequests: readNumberArg('max-total-requests', 12000),
        dryRun: readFlag('dry-run'),
      })
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (command === 'once' || command === 'worker') {
      if (!appConfig.bserApiKey && !readFlag('dry-run')) {
        throw new Error('BSER_API_KEY missing — collector real run aborted')
      }
      const bser = new BserClient(appConfig.bserApiKey)
      const runner = new CollectorRunner(prisma, bser, collectorConfig)
      const result = await runner.runOnce({
        dryRun: readFlag('dry-run'),
        maxRequests: readNumberArg('max-requests', command === 'worker' ? 200 : 50),
        seedLimit: readOptionalNumberArg('seed-limit'),
        mode: readStringArg('mode'),
      })
      console.log(JSON.stringify(result, null, 2))
      return
    }

    throw new Error(`Unknown collector command: ${command}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(JSON.stringify({ error: message }, null, 2))
  process.exitCode = 1
})
