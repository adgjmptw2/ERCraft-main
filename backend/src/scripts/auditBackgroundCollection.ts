import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { buildCollectorAuditReport } from '../analysis/roleTimeCurve/collectorAudit.js'
import {
  formatRoleTimeCurveMarkdown,
  type DataAuditReport,
  type RoleTimeCurveCandidate,
} from '../analysis/roleTimeCurve/roleTimeCurve.js'

const REPORT_DIR = path.resolve(process.cwd(), '..', 'reports', 'role-time-curve')
const DATA_DIR = path.resolve(process.cwd(), 'src', 'data', 'roleTimeCurve')

async function fileContains(relativePath: string, pattern: RegExp): Promise<boolean> {
  try {
    const text = await readFile(path.resolve(process.cwd(), relativePath), 'utf8')
    return pattern.test(text)
  } catch {
    return false
  }
}

export async function auditBackgroundCollection(): Promise<{
  reportPath: string
  candidatePlayers: number
  automaticJobExists: boolean
  externalApiCalls: 0
  dbWrites: 0
}> {
  const prisma = new PrismaClient()
  try {
    const [playerMatchRows, nicknameBindings, hasBackfillWorker, hasInternalChunkTimer, hasRefreshOnlyExternalFetch] =
      await Promise.all([
        prisma.playerMatch.findMany({
          select: { uid: true, playedAt: true },
          orderBy: { playedAt: 'desc' },
        }),
        prisma.profileNicknameBinding.findMany({
          select: { canonicalUid: true },
        }),
        fileContains('src/cache/playerMatchBackfill.ts', /backfillPlayerRankSeason|continuePlayerRankSeasonBackfill/),
        fileContains('src/cache/playerMatchBackfill.ts', /setTimeout|scheduleInternalBackfillChunk/),
        fileContains('src/routes/players.ts', /refresh(?:=|Query)|refresh\s*\?\?|upsertFreshPlayerMatches/),
      ])

    const report = buildCollectorAuditReport({
      playerMatchRows,
      nicknameBindings,
      routeCodeFindings: {
        hasBackfillWorker,
        hasInternalChunkTimer,
        hasRefreshOnlyExternalFetch,
      },
    })

    await mkdir(REPORT_DIR, { recursive: true })
    const reportPath = path.join(REPORT_DIR, 'collector-audit.dry-run.json')
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await maybeRefreshMarkdownReport(report)

    return {
      reportPath,
      candidatePlayers: report.candidatePlayers,
      automaticJobExists: report.automaticJobExists,
      externalApiCalls: report.externalApiCalls,
      dbWrites: report.dbWrites,
    }
  } finally {
    await prisma.$disconnect()
  }
}

async function maybeRefreshMarkdownReport(collector: Awaited<ReturnType<typeof buildCollectorAuditReport>>): Promise<void> {
  const auditPath = path.join(REPORT_DIR, 'data-audit.json')
  const candidatePath = path.join(DATA_DIR, 'role-time-curve.v1.candidate.json')
  const markdownPath = path.join(REPORT_DIR, 'role-time-curve.v1.candidate.md')
  try {
    const [auditText, candidateText] = await Promise.all([
      readFile(auditPath, 'utf8'),
      readFile(candidatePath, 'utf8'),
    ])
    const audit = JSON.parse(auditText) as DataAuditReport
    const candidate = JSON.parse(candidateText) as RoleTimeCurveCandidate
    await writeFile(markdownPath, formatRoleTimeCurveMarkdown({ audit, candidate, collector }), 'utf8')
  } catch {
    // The dry-run audit is valid on its own. The combined Markdown report is refreshed when candidate files exist.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await auditBackgroundCollection()
  console.log(JSON.stringify(result, null, 2))
}
