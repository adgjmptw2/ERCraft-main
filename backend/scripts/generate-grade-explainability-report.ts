import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

import {
  buildGradeDistributionSummary,
  buildGradeExplainabilityReport,
} from '../src/audit/gradeExplainabilityReport.js'

type OutputFormat = 'txt' | 'json' | 'both'

interface CliOptions {
  nickname?: string
  userNum?: number
  season: number
  mode: string
  format: OutputFormat
  output: string
  includeUngraded: boolean
  includeMatchSamples: boolean
  matchSampleCount: number
  pretty: boolean
  distribution: boolean
}

function readArgValue(args: string[], index: number, name: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}`)
  }
  return value
}

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  return value !== 'false' && value !== '0' && value !== 'no'
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    season: 11,
    mode: 'rank',
    format: 'both',
    output: resolve(process.cwd(), '..', 'reports', 'grade-explainability'),
    includeUngraded: true,
    includeMatchSamples: false,
    matchSampleCount: 5,
    pretty: true,
    distribution: false,
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    switch (arg) {
      case '--nickname':
        options.nickname = readArgValue(args, i, arg)
        i += 1
        break
      case '--user-num':
      case '--userNum':
        options.userNum = Number(readArgValue(args, i, arg))
        i += 1
        break
      case '--season':
        options.season = Number(readArgValue(args, i, arg))
        i += 1
        break
      case '--mode':
        options.mode = readArgValue(args, i, arg)
        i += 1
        break
      case '--format':
        options.format = readArgValue(args, i, arg) as OutputFormat
        i += 1
        break
      case '--output':
        options.output = resolve(readArgValue(args, i, arg))
        i += 1
        break
      case '--include-ungraded':
        options.includeUngraded = parseBooleanFlag(args[i + 1]?.startsWith('--') ? undefined : args[i + 1], true)
        if (args[i + 1] && !args[i + 1].startsWith('--')) i += 1
        break
      case '--include-match-samples':
        options.includeMatchSamples = parseBooleanFlag(args[i + 1]?.startsWith('--') ? undefined : args[i + 1], true)
        if (args[i + 1] && !args[i + 1].startsWith('--')) i += 1
        break
      case '--match-sample-count':
        options.matchSampleCount = Number(readArgValue(args, i, arg))
        i += 1
        break
      case '--pretty':
        options.pretty = parseBooleanFlag(args[i + 1]?.startsWith('--') ? undefined : args[i + 1], true)
        if (args[i + 1] && !args[i + 1].startsWith('--')) i += 1
        break
      case '--distribution':
        options.distribution = true
        break
      default:
        throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (!options.distribution && !options.nickname && options.userNum == null) {
    throw new Error('Provide --nickname, --user-num, or --distribution')
  }
  if (options.format !== 'txt' && options.format !== 'json' && options.format !== 'both') {
    throw new Error('--format must be txt, json, or both')
  }
  if (!Number.isInteger(options.season) || options.season <= 0) {
    throw new Error('--season must be a positive integer')
  }
  if (options.userNum != null && (!Number.isInteger(options.userNum) || options.userNum <= 0)) {
    throw new Error('--user-num must be a positive integer')
  }
  if (!Number.isInteger(options.matchSampleCount) || options.matchSampleCount < 0) {
    throw new Error('--match-sample-count must be a non-negative integer')
  }
  return options
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[\\/:*?"<>|]/g, '-')
}

async function writeOutputs(params: {
  outputDir: string
  baseName: string
  format: OutputFormat
  json: unknown
  text: string
  pretty: boolean
}): Promise<string[]> {
  await mkdir(params.outputDir, { recursive: true })
  const written: string[] = []
  if (params.format === 'json' || params.format === 'both') {
    const file = join(params.outputDir, `${params.baseName}.json`)
    await writeFile(
      file,
      `${JSON.stringify(params.json, null, params.pretty ? 2 : 0)}\n`,
      'utf8',
    )
    written.push(file)
  }
  if (params.format === 'txt' || params.format === 'both') {
    const file = join(params.outputDir, `${params.baseName}.txt`)
    await writeFile(file, params.text, 'utf8')
    written.push(file)
  }
  return written
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const prisma = new PrismaClient()
  try {
    if (options.distribution) {
      const { report, text } = await buildGradeDistributionSummary(prisma)
      const written = await writeOutputs({
        outputDir: options.output,
        baseName: 'grade-distribution-summary',
        format: options.format,
        json: report,
        text,
        pretty: options.pretty,
      })
      console.log(written.join('\n'))
      return
    }

    const { report, text } = await buildGradeExplainabilityReport(prisma, {
      nickname: options.nickname,
      userNum: options.userNum,
      season: options.season,
      mode: options.mode,
      includeUngraded: options.includeUngraded,
      includeMatchSamples: options.includeMatchSamples,
      matchSampleCount: options.matchSampleCount,
    })
    const label = options.nickname ?? String(options.userNum ?? report.player.canonicalUserNum)
    const baseName = `${slugify(label)}-season${options.season}-${options.mode}`
    const written = await writeOutputs({
      outputDir: options.output,
      baseName,
      format: options.format,
      json: report,
      text,
      pretty: options.pretty,
    })
    console.log(written.join('\n'))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
