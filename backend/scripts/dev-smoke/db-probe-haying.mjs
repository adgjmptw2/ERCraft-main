import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const nickname = '하잉'

try {
  const statsRows = await prisma.seasonStatsCache.findMany({
    where: { id: { endsWith: ':39' } },
    select: { id: true, data: true },
    take: 500,
  })
  const hayingStats = statsRows.filter((row) => JSON.stringify(row.data).includes(nickname))
  console.log('haying season stats ids', hayingStats.map((r) => r.id))

  const participants = await prisma.matchParticipant.findMany({
    where: { nickname },
    select: { uid: true },
    distinct: ['uid'],
    take: 10,
  })
  console.log('participant uids', participants)

  for (const row of participants) {
    if (!row.uid) continue
    const count = await prisma.playerMatch.count({
      where: { uid: row.uid, apiSeasonId: 39, gameMode: 'rank' },
    })
    const statsId = `${row.uid}:39`
    const stats = await prisma.seasonStatsCache.findUnique({ where: { id: statsId } })
    console.log('uid', row.uid, 'pm', count, 'statsCached', stats != null)
  }

  const backfills = await prisma.playerSeasonBackfillState.findMany({
    where: { apiSeasonId: 39, status: 'complete', collectedGames: 7 },
    select: { uid: true, collectedGames: true },
    take: 10,
  })
  console.log('backfill complete 7 games', backfills)

  const seasons = await prisma.playerSeasonsCache.findMany({
    where: { id: { endsWith: ':1:11' } },
    select: { id: true },
    take: 20,
  })
  console.log('seasons 1:11 caches', seasons.map((s) => s.id))
} finally {
  await prisma.$disconnect()
}
