import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildRoleTimeCurveV12Artifacts,
  formatRoleTimeCurveV12Markdown,
} from '../analysis/roleTimeCurve/roleTimeCurveV12.js'
import type { DamageShadowPlayerMatchRow } from '../analysis/roleTimeCurve/damageShadowEvaluator.js'

const REPORT_DIR = path.resolve(process.cwd(), '..', 'reports', 'role-time-curve')
const DATA_DIR = path.resolve(process.cwd(), 'src', 'data', 'roleTimeCurve')

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

export async function generateRoleTimeCurveV12Shadow(): Promise<{
  candidatePath: string
  biasPath: string
  comparisonPath: string
  markdownPath: string
  bootstrapPath: string
}> {
  const prisma = new PrismaClient()
  try {
    const rows = await readRows(prisma)
    const artifacts = buildRoleTimeCurveV12Artifacts(rows)
    await mkdir(REPORT_DIR, { recursive: true })
    await mkdir(DATA_DIR, { recursive: true })

    const candidatePath = path.join(DATA_DIR, 'role-time-curve.v1.2.candidate.json')
    const biasPath = path.join(REPORT_DIR, 'bias-decomposition.v1.2.json')
    const comparisonPath = path.join(REPORT_DIR, 'damage-shadow-comparison.v1.2.json')
    const markdownPath = path.join(REPORT_DIR, 'damage-shadow-comparison.v1.2.md')
    const bootstrapPath = path.join(REPORT_DIR, 'bootstrap-stability.v1.2.json')

    await writeJson(candidatePath, artifacts.candidate)
    await writeJson(biasPath, artifacts.bias)
    await writeJson(comparisonPath, artifacts.comparison)
    await writeJson(bootstrapPath, artifacts.bootstrap)
    await writeFile(markdownPath, formatRoleTimeCurveV12Markdown(artifacts.comparison), 'utf8')

    return { candidatePath, biasPath, comparisonPath, markdownPath, bootstrapPath }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await generateRoleTimeCurveV12Shadow()
  console.log(JSON.stringify(result, null, 2))
}

