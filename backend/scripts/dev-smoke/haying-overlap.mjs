import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const nick = '하잉'
const parts = await p.matchParticipant.findMany({
  where: { nickname: nick },
  select: { gameId: true },
  distinct: ['gameId'],
})
const gids = parts.map((x) => x.gameId).filter(Boolean)
const pmGameCount = await p.playerMatch.count({ where: { gameId: { in: gids } } })
console.log('participant games', gids.length, 'in PM any mode', pmGameCount)

const overlap = await p.playerMatch.groupBy({
  by: ['uid'],
  where: { gameId: { in: gids }, gameMode: 'rank', apiSeasonId: 39 },
  _count: { gameId: true },
  orderBy: { _count: { gameId: 'desc' } },
  take: 10,
})
console.log('rank overlap', overlap)

for (const row of overlap.slice(0, 3)) {
  const total = await p.playerMatch.count({
    where: { uid: row.uid, apiSeasonId: 39, gameMode: 'rank' },
  })
  const seasons = await p.playerSeasonsCache.findUnique({ where: { id: `${row.uid}:1:11` } })
  console.log(row.uid.slice(0, 32), 'overlap', row._count.gameId, 'totalPm', total, 'seasons', seasons != null)
}

await p.$disconnect()
