import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { uidToUserNum } from '../../src/external/bserMapper.ts'

const prisma = new PrismaClient()
const states = await prisma.playerSeasonBackfillState.findMany({
  where: { apiSeasonId: 39 },
  select: { uid: true, status: true, collectedGames: true },
  orderBy: { collectedGames: 'desc' },
  take: 100,
})
const aggregates = await prisma.seasonAggregateCache.findMany({
  where: { apiSeasonId: 39 },
  select: { uid: true, cacheStatus: true },
  take: 100,
})
const knownNums = [1464399340, 2036455880, 239272700, 1031595008, 1950017233, 1344015992, 696720285]
for (const n of knownNums) {
  const inBackfill = states.filter((s) => uidToUserNum(s.uid) === n)
  const inAgg = aggregates.filter((s) => uidToUserNum(s.uid) === n)
  if (inBackfill.length || inAgg.length) {
    console.log(JSON.stringify({ userNum: n, backfill: inBackfill, agg: inAgg }))
  }
}
console.log('backfill total', states.length, 'aggregate total', aggregates.length)
await prisma.$disconnect()
