import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const targetLevel = 198
const apiSeasonId = 39

try {
  const rows = await prisma.playerMatch.findMany({
    where: { apiSeasonId, gameMode: 'rank', accountLevel: targetLevel },
    select: { uid: true, accountLevel: true },
    distinct: ['uid'],
    take: 20,
  })
  console.log('uids with account level 198', rows)

  for (const row of rows) {
    const count = await prisma.playerMatch.count({
      where: { uid: row.uid, apiSeasonId, gameMode: 'rank' },
    })
    const seasons = await prisma.playerSeasonsCache.findUnique({
      where: { id: `${row.uid}:1:11` },
    })
    console.log(row.uid, 'pm', count, 'seasons', seasons != null)
  }
} finally {
  await prisma.$disconnect()
}
