import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildDamageShadowEvaluation,
  formatDamageShadowMarkdown,
  type DamageShadowPlayerMatchRow,
} from '../analysis/roleTimeCurve/damageShadowEvaluator.js'

const REPORT_DIR = path.resolve(process.cwd(), '..', 'reports', 'role-time-curve')

async function readRows(prisma: PrismaClient): Promise<DamageShadowPlayerMatchRow[]> {
  return prisma.playerMatch.findMany({
    select: {
      uid: true,
      gameId: true,
      apiSeasonId: true,
      displaySeasonId: true,
      gameMode: true,
      playedAt: true,
      characterNum: true,
      bestWeapon: true,
      placement: true,
      kills: true,
      assists: true,
      teamKills: true,
      deaths: true,
      victory: true,
      rpAfter: true,
      gameDuration: true,
      damageToPlayer: true,
      viewContribution: true,
      monsterKill: true,
    },
    orderBy: [{ playedAt: 'desc' }, { gameId: 'desc' }],
  })
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function evaluateDamageCurveShadow(): Promise<{
  reportPath: string
  markdownPath: string
  outliersPath: string
  evaluatedRows: number
}> {
  const prisma = new PrismaClient()
  try {
    const rows = await readRows(prisma)
    const { report, outliers } = buildDamageShadowEvaluation(rows)
    await mkdir(REPORT_DIR, { recursive: true })

    const reportPath = path.join(REPORT_DIR, 'damage-shadow-evaluation.v1.1.json')
    const markdownPath = path.join(REPORT_DIR, 'damage-shadow-evaluation.v1.1.md')
    const outliersPath = path.join(REPORT_DIR, 'damage-shadow-outliers.v1.1.json')

    await writeJson(reportPath, report)
    await writeFile(markdownPath, formatDamageShadowMarkdown(report), 'utf8')
    await writeJson(outliersPath, { generatedAt: report.generatedAt, outliers })

    return {
      reportPath,
      markdownPath,
      outliersPath,
      evaluatedRows: report.sample.evaluatedRows,
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await evaluateDamageCurveShadow()
  console.log(JSON.stringify(result, null, 2))
}
