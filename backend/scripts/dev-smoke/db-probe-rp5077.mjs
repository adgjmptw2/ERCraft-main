import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  const rows = await prisma.playerMatch.findMany({
    where: { apiSeasonId: 39, gameMode: 'rank', rpAfter: { gte: 5000, lte: 5100 } },
    select: { uid: true, rpAfter: true, accountLevel: true, characterName: true },
    orderBy: { playedAt: 'desc' },
    take: 30,
  })
  const byUid = new Map()
  for (const row of rows) {
    const bucket = byUid.get(row.uid) ?? []
    bucket.push(row)
    byUid.set(row.uid, bucket)
  }
  for (const [uid, matches] of byUid) {
    const count = await prisma.playerMatch.count({ where: { uid, apiSeasonId: 39, gameMode: 'rank' } })
    const seasons = await prisma.playerSeasonsCache.findUnique({ where: { id: `${uid}:1:11` } })
    console.log(uid, 'pm', count, 'rp', matches[0]?.rpAfter, 'lvl', matches[0]?.accountLevel, 'seasons', seasons != null)
  }
} finally {
  await prisma.$disconnect()
}
