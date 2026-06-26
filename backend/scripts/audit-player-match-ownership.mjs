#!/usr/bin/env node
/**
 * 39.38D — PlayerMatch cobalt ownership audit for target users.
 * Usage: cd backend && npm run build && node scripts/audit-player-match-ownership.mjs
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const BSER_COBALT = 6
const TARGETS = [
  { label: 'mine', nickname: '마인', uid: 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6', userNum: 1009897353 },
  { label: 'haying', nickname: '하잉', uid: '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY', userNum: 460448438 },
]

const prisma = new PrismaClient()

function readRawParticipantUid(rawJson) {
  if (typeof rawJson !== 'object' || rawJson === null) return null
  if (typeof rawJson.uid === 'string' && rawJson.uid.trim()) return rawJson.uid.trim()
  if (typeof rawJson.userId === 'string' && rawJson.userId.trim()) return rawJson.userId.trim()
  if (typeof rawJson.userNum === 'number' && Number.isFinite(rawJson.userNum)) return String(rawJson.userNum)
  return null
}

function isCobalt(row) {
  return row.gameMode === 'cobalt' || row.matchingMode === BSER_COBALT
}

async function auditTarget(target, apiSeasonId) {
  const rows = await prisma.playerMatch.findMany({
    where: {
      uid: target.uid,
      apiSeasonId,
      OR: [{ gameMode: 'cobalt' }, { matchingMode: BSER_COBALT }],
    },
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
    },
  })

  const audited = rows.map((row) => {
    const sourceParticipantUid = readRawParticipantUid(row.rawJson)
    const otherUid = target.label === 'mine' ? TARGETS[1].uid : TARGETS[0].uid
    const contaminated =
      Boolean(sourceParticipantUid && sourceParticipantUid !== target.uid && sourceParticipantUid === otherUid) ||
      row.uid !== target.uid
    return {
      requestedUid: target.uid,
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
      contaminated,
    }
  })

  return {
    label: target.label,
    nickname: target.nickname,
    uid: target.uid,
    userNum: target.userNum,
    cobaltTotal: rows.length,
    ownerSourceMismatch: audited.filter((row) => row.contaminated).length,
    rows: audited,
    gameIds: new Set(rows.map((row) => row.gameId)),
  }
}

async function main() {
  const apiSeasonId = Number(process.env.AUDIT_API_SEASON_ID ?? 39)
  const reports = []
  for (const target of TARGETS) {
    reports.push(await auditTarget(target, apiSeasonId))
  }

  const mine = reports[0]
  const haying = reports[1]
  const sharedGameIds = [...mine.gameIds].filter((gameId) => haying.gameIds.has(gameId))
  const sharedBothRows = sharedGameIds.filter(
    (gameId) => mine.rows.some((row) => row.gameId === gameId) && haying.rows.some((row) => row.gameId === gameId),
  ).length
  const sharedSingleOwnerOnly = sharedGameIds.length - sharedBothRows

  const summary = {
    generatedAt: new Date().toISOString(),
    apiSeasonId,
    mineCobaltTotal: mine.cobaltTotal,
    hayingCobaltTotal: haying.cobaltTotal,
    mineOwnerSourceMismatch: mine.ownerSourceMismatch,
    hayingOwnerSourceMismatch: haying.ownerSourceMismatch,
    sharedGameIdCount: sharedGameIds.length,
    sharedGameIdBothOwnerRows: sharedBothRows,
    sharedGameIdSingleOwnerOnly: sharedSingleOwnerOnly,
    contaminatedRowCount: mine.ownerSourceMismatch + haying.ownerSourceMismatch,
    affectedUids: [mine.uid, haying.uid].filter((_, i) => (i === 0 ? mine.ownerSourceMismatch : haying.ownerSourceMismatch) > 0),
    affectedGameIds: [...new Set([...mine.rows, ...haying.rows].filter((row) => row.contaminated).map((row) => row.gameId))],
    mineRelatedContaminated: mine.ownerSourceMismatch,
    hayingRelatedContaminated: haying.ownerSourceMismatch,
    targets: reports,
    sharedGameIds,
  }

  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports')
  mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'player-match-ownership-audit-39.38D.json')
  writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8')
  console.log(JSON.stringify({
    outPath,
    mineCobaltTotal: summary.mineCobaltTotal,
    hayingCobaltTotal: summary.hayingCobaltTotal,
    sharedGameIdCount: summary.sharedGameIdCount,
    contaminatedRowCount: summary.contaminatedRowCount,
  }, null, 2))
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exitCode = 1
})