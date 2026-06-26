import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const uids = [
  'yNEAtPTYG93mN91JUbWiIuQk_Rx2WOyOKfnobLLQ_iM4A4lAhTCuy2VZZlANH3GOQd0v',
  'D1FkLlJMR6o4kliInI2YdKCBUBUexE5Y6fNoX5RphPshHtQWjZDtxNyXiZpVu-98eyjr',
  'ErpYxoXa2dzvqehKAzdePqZoP1dyA_TIu_BAEjPSDlxSxYQZVNW2lSOrADKAl-7M5d9I',
]
for (const uid of uids) {
  const games = await p.playerMatch.findMany({
    where: { uid, apiSeasonId: 39, gameMode: 'rank' },
    select: { gameId: true },
    orderBy: { gameId: 'asc' },
    take: 5,
  })
  console.log(uid.slice(0, 20), games.map((g) => g.gameId).join(','))
}
const a = await p.playerMatch.findMany({
  where: { uid: uids[0], apiSeasonId: 39, gameMode: 'rank' },
  select: { gameId: true },
})
const b = await p.playerMatch.findMany({
  where: { uid: uids[1], apiSeasonId: 39, gameMode: 'rank' },
  select: { gameId: true },
})
const setA = new Set(a.map((x) => x.gameId))
const shared = b.filter((x) => setA.has(x.gameId)).length
console.log('shared gameIds', shared, '/', a.length)
await p.$disconnect()
