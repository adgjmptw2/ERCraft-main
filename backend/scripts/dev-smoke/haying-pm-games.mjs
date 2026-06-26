import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const gids = (
  await p.matchParticipant.findMany({
    where: { nickname: '하잉' },
    distinct: ['gameId'],
    select: { gameId: true },
  })
).map((x) => x.gameId)

const overlap = await p.playerMatch.groupBy({
  by: ['uid'],
  where: { gameId: { in: gids }, gameMode: 'rank', apiSeasonId: 39 },
  _count: { gameId: true },
  orderBy: { _count: { gameId: 'desc' } },
  take: 5,
})

for (const row of overlap) {
  const allGames = await p.playerMatch.findMany({
    where: { uid: row.uid, apiSeasonId: 39, gameMode: 'rank' },
    select: { gameId: true },
    orderBy: { gameId: 'asc' },
  })
  console.log(row.uid.slice(0, 28), 'overlap', row._count.gameId, 'pm', allGames.length, 'games', allGames.map((g) => g.gameId).join(','))
}
await p.$disconnect()
