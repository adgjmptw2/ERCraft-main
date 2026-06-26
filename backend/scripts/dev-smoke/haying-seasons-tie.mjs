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
})
const top = overlap.filter((o) => o._count.gameId >= 3)
let withSeasons = []
for (const o of top) {
  const s = await p.playerSeasonsCache.findUnique({ where: { id: `${o.uid}:1:11` } })
  if (s) withSeasons.push(o.uid.slice(0, 32))
}
console.log('uids overlap>=3', top.length, 'with seasons', withSeasons.length, withSeasons)
await p.$disconnect()
