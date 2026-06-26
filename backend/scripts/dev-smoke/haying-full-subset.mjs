import { PrismaClient } from '@prisma/client'
import { uidToUserNum } from '../../src/external/bserMapper.js'

const p = new PrismaClient()
const nick = '하잉'
const gids = (
  await p.matchParticipant.findMany({
    where: { nickname: nick },
    distinct: ['gameId'],
    select: { gameId: true },
    take: 32,
  })
).map((x) => x.gameId)
const gidSet = new Set(gids)

const pmByUid = await p.playerMatch.groupBy({
  by: ['uid'],
  where: { apiSeasonId: 39, gameMode: 'rank' },
  _count: { gameId: true },
})

const fullSubset = []
for (const row of pmByUid) {
  if (row._count.gameId !== 7) continue
  const games = await p.playerMatch.findMany({
    where: { uid: row.uid, apiSeasonId: 39, gameMode: 'rank' },
    select: { gameId: true },
  })
  const allIn = games.every((g) => gidSet.has(g.gameId))
  if (!allIn) continue
  const overlap = games.filter((g) => gidSet.has(g.gameId)).length
  const seasons = await p.playerSeasonsCache.findUnique({ where: { id: `${row.uid}:1:11` } })
  fullSubset.push({
    uid: row.uid.slice(0, 36),
    userNum: uidToUserNum(row.uid),
    overlap,
    seasons: seasons != null,
  })
}
console.log('full PM subset of participant gids', fullSubset.length, fullSubset.slice(0, 10))
await p.$disconnect()
