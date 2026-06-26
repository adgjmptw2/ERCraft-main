import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { PrismaClient } from '@prisma/client'

import type { RoleTimePlayerMatchRow } from '../analysis/roleTimeCurve/roleTimeCurve.js'
import {
  auditDurationMeaning,
  auditMissingBias,
  buildHoldoutValidation,
  buildRoleTimeCurveCandidateV11,
  formatV11Markdown,
} from '../analysis/roleTimeCurve/roleTimeCurveV11.js'

const REPORT_DIR = path.resolve(process.cwd(), '..', 'reports', 'role-time-curve')
const DATA_DIR = path.resolve(process.cwd(), 'src', 'data', 'roleTimeCurve')

async function readRows(prisma: PrismaClient): Promise<RoleTimePlayerMatchRow[]> {
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

export async function generateRoleTimeCurveCandidateV11(): Promise<{
  candidatePath: string
  markdownPath: string
  durationAuditPath: string
  missingBiasPath: string
  holdoutPath: string
  rankRows: number
  anchorShrinkK: number
}> {
  const prisma = new PrismaClient()
  try {
    const rows = await readRows(prisma)
    const generatedAt = new Date().toISOString()
    const candidate = buildRoleTimeCurveCandidateV11(rows, { generatedAt })
    const durationAudit = auditDurationMeaning(rows, generatedAt)
    const missingBias = auditMissingBias(rows, generatedAt)
    const holdout = buildHoldoutValidation(rows, generatedAt)

    await mkdir(REPORT_DIR, { recursive: true })
    await mkdir(DATA_DIR, { recursive: true })

    const candidatePath = path.join(DATA_DIR, 'role-time-curve.v1.1.candidate.json')
    const markdownPath = path.join(REPORT_DIR, 'role-time-curve.v1.1.candidate.md')
    const durationAuditPath = path.join(REPORT_DIR, 'duration-meaning-audit.v1.1.json')
    const missingBiasPath = path.join(REPORT_DIR, 'missing-bias-audit.v1.1.json')
    const holdoutPath = path.join(REPORT_DIR, 'holdout-validation.v1.1.json')

    await writeJson(candidatePath, candidate)
    await writeJson(durationAuditPath, durationAudit)
    await writeJson(missingBiasPath, missingBias)
    await writeJson(holdoutPath, holdout)
    await writeFile(markdownPath, formatV11Markdown({ candidate, durationAudit, missingBias, holdout }), 'utf8')

    return {
      candidatePath,
      markdownPath,
      durationAuditPath,
      missingBiasPath,
      holdoutPath,
      rankRows: rows.filter((row) => row.gameMode === 'rank').length,
      anchorShrinkK: candidate.anchorShrinkK,
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await generateRoleTimeCurveCandidateV11()
  console.log(JSON.stringify(result, null, 2))
}

