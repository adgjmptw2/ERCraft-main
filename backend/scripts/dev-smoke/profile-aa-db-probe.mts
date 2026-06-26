import { PrismaClient } from '@prisma/client'
import { uidToUserNum } from '../../src/external/bserMapper.ts'

const prisma = new PrismaClient()
const API_SEASON = 39
const nicks = ['하잉', '연서', '절단마술사']

for (const nick of nicks) {
  const parts = await prisma.matchParticipant.findMany({
    where: { nickname: nick },
    distinct: ['uid'],
    select: { uid: true },
    take: 24,
  })
  const uids = [...new Set(parts.map((row) => row.uid).filter((uid): uid is string => Boolean(uid)))]
  let rows: Array<{ uid: string; gameId: string }> = []
  if (uids.length > 0) {
    rows = await prisma.playerMatch.findMany({
      where: { uid: { in: uids }, apiSeasonId: API_SEASON, gameMode: 'rank' },
      select: { uid: true, gameId: true },
    })
  }
  const byUid = Object.fromEntries(
    uids.map((uid) => [
      uid.slice(0, 12) + '…',
      { userNum: uidToUserNum(uid), count: rows.filter((row) => row.uid === uid).length },
    ]),
  )
  const distinct = new Set(rows.map((row) => row.gameId)).size
  console.log(
    JSON.stringify({
      nick,
      participantUids: uids.length,
      byUid,
      raw: rows.length,
      distinct,
      duplicates: rows.length - distinct,
    }),
  )
}

await prisma.$disconnect()
