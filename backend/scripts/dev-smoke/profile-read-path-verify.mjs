import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const nicks = ['하잉', '연서', '절단마술사']

for (const nick of nicks) {
  const parts = await prisma.matchParticipant.findMany({
    where: { nickname: nick },
    distinct: ['uid'],
    select: { uid: true },
  })
  const uids = parts.map((row) => row.uid)
  const rows = await prisma.playerMatch.findMany({
    where: { uid: { in: uids }, apiSeasonId: 39, gameMode: 'rank' },
    select: { uid: true, gameId: true },
  })
  const raw = rows.length
  const distinct = new Set(rows.map((row) => row.gameId)).size
  const byUid = Object.fromEntries(uids.map((uid) => [uid, rows.filter((row) => row.uid === uid).length]))
  console.log(JSON.stringify({ nick, uids, byUid, raw, distinct, duplicates: raw - distinct }))
}

await prisma.$disconnect()
