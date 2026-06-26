import 'dotenv/config'

import { writeFile } from 'node:fs/promises'

import { PrismaClient } from '@prisma/client'

import { auditUnknownRoleRows } from '../dist/services/characterPerformanceGrade/unknownRoleAudit.js'
import { backfillUnknownWeaponRows } from '../dist/services/characterPerformanceGrade/unknownWeaponBackfill.js'
import { saveUnknownCohortCutoff } from '../dist/services/characterPerformanceGrade/unknownCohortCutoff.js'

function readFlag(name) {
  return process.argv.includes(`--${name}`)
}

function readNumberArg(name, fallback) {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  if (!arg) return fallback
  const parsed = Number(arg.slice(prefix.length))
  return Number.isFinite(parsed) ? parsed : fallback
}

function readStringArg(name) {
  const prefix = `--${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : undefined
}

const command = process.argv[2] ?? 'audit'
const prisma = new PrismaClient()

try {
  if (command === 'audit') {
    const report = await auditUnknownRoleRows(prisma)
    const outputPath = readStringArg('output')
    const json = JSON.stringify(report, null, 2)
    if (readFlag('save-cohort-cutoff')) {
      const cutoffAt = new Date().toISOString()
      await saveUnknownCohortCutoff({
        cutoffAt,
        rankPlayerMatches: report.rankPlayerMatches,
        unknownCount: report.unknownCount,
        unknownRatePercent: report.unknownRatePercent,
      })
      console.error(`saved cohort cutoff at ${cutoffAt}`)
    }
    if (outputPath) {
      await writeFile(outputPath, json, 'utf8')
      console.error(`wrote ${outputPath}`)
    } else {
      process.stdout.write(`${json}\n`)
    }
  } else if (command === 'backfill') {
    const result = await backfillUnknownWeaponRows(prisma, {
      dryRun: readFlag('dry-run'),
      maxRows: readNumberArg('max-rows', 1000),
      batchSize: readNumberArg('batch-size', 100),
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    throw new Error(`Unknown command: ${command}`)
  }
} finally {
  await prisma.$disconnect()
}
