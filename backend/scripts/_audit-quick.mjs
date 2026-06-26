import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BSER_COBALT = 6
const UIDS = process.argv.slice(2).length ? process.argv.slice(2) : ['1009897353', '460448438']
const prisma = new PrismaClient()

function readRawUid(rawJson) {
  if (!rawJson || typeof rawJson !== 'object') return null
  const r = rawJson
  if (typeof r.uid === 'string' && r.uid.trim()) return r.uid.trim()
  if (typeof r.userId === 'string' && r.userId.trim()) return r.userId.trim()
  if (typeof r.userNum === 'number' && Number.isFinite(r.userNum)) return String(r.userNum)
  return null
}

function isCobalt(row) {
  return row.gameMode === 'cobalt' || row.matchingMode === BSER_COBALT
}

async function auditUid(requestedUid) {
  const rows = await prisma.playerMatch.findMany({
    where: { uid: requestedUid },
    orderBy: { playedAt: 'desc' },
    select: {
      uid: true,
      gameId: true,
      matchingMode: true,
      gameMode: true,
      characterNum: true,
      kills: true,
      deaths: true,
      assists: true,
      damageToPlayer: true,
      createdAt: true,
      updatedAt: true,
      rawJson: true,
      apiSeasonId: true,
      displaySeasonId: true,
    },
  })
  const cobaltRows = rows.filter(isCobalt)
  const currentSeasonCobalt = cobaltRows.filter((r) => r.displaySeasonId === 11)
  const audited = []
  for (const row of currentSeasonCobalt) {
    const sourceParticipantUid = readRawUid(row.rawJson)
    audited.push({
      requestedUid,
      playerMatchOwnerUid: row.uid,
      sourceParticipantUid,
      gameId: row.gameId,
      matchingMode: row.matchingMode,
      characterNum: row.characterNum,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      damage: row.damageToPlayer,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })
  }
  const wrongSource = audited.filter((r) => r.sourceParticipantUid && r.sourceParticipantUid !== requestedUid)
  return { requestedUid, total: rows.length, cobaltTotal: cobaltRows.length, currentSeasonCobalt: currentSeasonCobalt.length, audited, wrongSource }
}

async function main() {
  const reports = []
  for (const uid of UIDS) reports.push(await auditUid(uid))
  const sharedGameIds = new Set(reports[0]?.audited.map((r) => r.gameId) ?? [])
  const bGames = new Set(reports[1]?.audited.map((r) => r.gameId) ?? [])
  const shared = [...sharedGameIds].filter((g) => bGames.has(g))
  console.log(JSON.stringify({ reports: reports.map((r) => ({ uid: r.requestedUid, currentSeasonCobalt: r.currentSeasonCobalt, wrongSource: r.wrongSource.length, samples: r.wrongSource.slice(0, 5) })), sharedGameIds: shared.length, sharedSample: shared.slice(0, 10) }, null, 2))
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })