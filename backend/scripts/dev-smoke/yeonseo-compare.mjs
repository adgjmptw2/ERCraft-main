import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const uids = [
  'kqgPzdkKsGKdfj_AIi5_qOm2ufnZQ1vbymoEVup5Peky-c_vwa98P6Wu',
  'wGaJTjlJjK72C5BiLaqfzZ11UZWCr0Vt98Rpswfe6LoyoQhztmtLdhXp',
  'Mx-ribZSt-pYbfs3p-QnlbxTcYDkv72HyuXaXNiJz--93a1OmyuJPEAo',
]
for (const uid of uids) {
  const g = await p.playerMatch.findMany({
    where: { uid, apiSeasonId: 39, gameMode: 'rank' },
    select: { gameId: true },
    orderBy: { gameId: 'asc' },
    take: 3,
  })
  const c = await p.playerMatch.count({ where: { uid, apiSeasonId: 39, gameMode: 'rank' } })
  console.log(uid.slice(0, 20), c, g.map((x) => x.gameId).join(','))
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
console.log('kqg vs wGa shared', b.filter((x) => setA.has(x.gameId)).length)
await p.$disconnect()
