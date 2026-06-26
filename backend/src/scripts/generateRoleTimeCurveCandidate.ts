import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildDataAudit,
  buildRoleTimeCurveCandidate,
  formatRoleTimeCurveMarkdown,
  type RoleTimePlayerMatchRow,
} from '../analysis/roleTimeCurve/roleTimeCurve.js'

const REPORT_DIR = path.resolve(process.cwd(), '..', 'reports', 'role-time-curve')
const DATA_DIR = path.resolve(process.cwd(), 'src', 'data', 'roleTimeCurve')

function toSerializable(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function readPlayerMatchRows(prisma: PrismaClient): Promise<RoleTimePlayerMatchRow[]> {
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

export async function generateRoleTimeCurveCandidate(): Promise<{
  auditPath: string
  candidatePath: string
  markdownPath: string
  rankRows: number
  shrinkK: number
}> {
  const prisma = new PrismaClient()
  try {
    const rows = await readPlayerMatchRows(prisma)
    const audit = buildDataAudit(rows)
    const candidate = buildRoleTimeCurveCandidate(rows)

    await mkdir(REPORT_DIR, { recursive: true })
    await mkdir(DATA_DIR, { recursive: true })

    const auditPath = path.join(REPORT_DIR, 'data-audit.json')
    const candidatePath = path.join(DATA_DIR, 'role-time-curve.v1.candidate.json')
    const markdownPath = path.join(REPORT_DIR, 'role-time-curve.v1.candidate.md')

    await writeFile(auditPath, toSerializable(audit), 'utf8')
    await writeFile(candidatePath, toSerializable(candidate), 'utf8')
    await writeFile(markdownPath, formatRoleTimeCurveMarkdown({ audit, candidate }), 'utf8')

    return {
      auditPath,
      candidatePath,
      markdownPath,
      rankRows: audit.rankRows,
      shrinkK: candidate.shrinkK,
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await generateRoleTimeCurveCandidate()
  console.log(JSON.stringify(result, null, 2))
}
