import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { uidToUserNum } from '../../src/external/bserMapper.ts'

const prisma = new PrismaClient()
const known = [
  { nick: '하잉', uids: ['Agb5ReWV_bklDabn_oii5WbsUg6MKj5iLmdq', 'zVJ0XvwMunDcoISMjJUBH_FuG8HD5PQrkjZR'] },
  { nick: '연서', uids: ['HxJaKGSORZfNZU5FqFKt2PboISQWDpPOYlIF', 'sccVLO_h-HgIuMkN12JsSbqciw23MU7t5-vw'] },
  { nick: '절단마술사', uids: ['D1FkLlJMR6o4kliInI2YdKCBUBUexE5Y6fNo'] },
]

for (const { nick, uids } of known) {
  const gameIds = new Set<string>()
  for (const uid of uids) {
    const rows = await prisma.playerMatch.findMany({
      where: { uid, apiSeasonId: 39, gameMode: 'rank' },
      select: { gameId: true },
      take: 8,
    })
    for (const row of rows) gameIds.add(row.gameId)
  }
  const linked = gameIds.size
    ? await prisma.playerMatch.findMany({
        where: { apiSeasonId: 39, gameMode: 'rank', gameId: { in: [...gameIds] } },
        select: { uid: true, gameId: true },
      })
    : []
  const byUid = new Map<string, number>()
  for (const row of linked) {
    if (!row.uid) continue
    byUid.set(row.uid, (byUid.get(row.uid) ?? 0) + 1)
  }
  console.log(
    JSON.stringify({
      nick,
      seedGameIds: gameIds.size,
      linkedUids: [...byUid.entries()].map(([uid, count]) => ({
        uid: uid.slice(0, 20) + '…',
        userNum: uidToUserNum(uid),
        overlapGames: count,
      })),
    }),
  )
}

await prisma.$disconnect()
