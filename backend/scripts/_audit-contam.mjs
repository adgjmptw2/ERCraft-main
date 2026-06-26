import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const MINE_UID = 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6'
const HAYING_UID = '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY'
const MINE_USERNUM = 1009897353
const HAYING_USERNUM = 460448438
const BSER_COBALT = 6
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

async function loadCobaltRows(uid) {
  return prisma.playerMatch.findMany({
    where: { uid, OR: [{ gameMode: 'cobalt' }, { matchingMode: BSER_COBALT }] },
    orderBy: { playedAt: 'desc' },
    select: {
      uid: true, gameId: true, matchingMode: true, gameMode: true,
      characterNum: true, kills: true, deaths: true, assists: true, damageToPlayer: true,
      createdAt: true, updatedAt: true, rawJson: true, displaySeasonId: true,
    },
  })
}

async function participantForGame(gameId, uid) {
  return prisma.matchParticipant.findFirst({
    where: { gameId, uid },
    select: { uid: true, nickname: true, characterNum: true, kills: true, deaths: true, assists: true, damageToPlayer: true },
  })
}

async function main() {
  const [mineRows, hayingRows] = await Promise.all([loadCobaltRows(MINE_UID), loadCobaltRows(HAYING_UID)])
  const auditRow = async (requestedUid, row) => {
    const sourceParticipantUid = readRawUid(row.rawJson)
    const mineP = await participantForGame(row.gameId, MINE_UID)
    const hayingP = await participantForGame(row.gameId, HAYING_UID)
    const expected = requestedUid === MINE_UID ? mineP : hayingP
    const other = requestedUid === MINE_UID ? hayingP : mineP
    const matchesExpected = expected && row.characterNum === expected.characterNum && row.kills === expected.kills
    const matchesOther = other && row.characterNum === other.characterNum && row.kills === other.kills
    return {
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
      expectedParticipant: expected,
      otherParticipant: other,
      contaminated: Boolean(other && matchesOther && !matchesExpected),
      sourceMismatch: Boolean(sourceParticipantUid && sourceParticipantUid !== requestedUid),
    }
  }
  const mineAudited = []
  for (const row of mineRows) mineAudited.push(await auditRow(MINE_UID, row))
  const hayingAudited = []
  for (const row of hayingRows) hayingAudited.push(await auditRow(HAYING_UID, row))

  const shared = mineRows.map((r) => r.gameId).filter((g) => hayingRows.some((h) => h.gameId === g))
  const contaminatedMine = mineAudited.filter((r) => r.contaminated || r.sourceMismatch)
  const contaminatedHaying = hayingAudited.filter((r) => r.contaminated || r.sourceMismatch)

  console.log(JSON.stringify({
    mineCobaltTotal: mineRows.length,
    hayingCobaltTotal: hayingRows.length,
    sharedGameIds: shared.length,
    shared,
    contaminatedMine: contaminatedMine.length,
    contaminatedHaying: contaminatedHaying.length,
    samples: [...contaminatedMine, ...contaminatedHaying].slice(0, 8),
  }, null, 2))
  await prisma.$disconnect()
}
main()