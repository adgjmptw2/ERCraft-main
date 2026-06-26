import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { refreshSeasonRecordTier } from '../dist/utils/seasonRecordTier.js'

const prisma = new PrismaClient()
const uid = 'xeq94mbuLV3JGdf4ShgPmWp0PHpUqGJOqTNJ6cqwc2hYHx4ny1BIguHP7qyppZKvOxG8yimO'
try {
  const rows = await prisma.playerSeasonsCache.findMany({
    where: { id: { startsWith: uid } },
    select: { id: true, data: true },
    take: 3,
  })
  for (const row of rows) {
    console.log('cacheId', row.id)
    const body = row.data
    for (const s of body.seasons.filter((x) => x.played)) {
      const ref = refreshSeasonRecordTier(s)
      console.log(
        ' S' + s.seasonNumber,
        'stored', s.rank.tier,
        'rankPos', s.rank.rank,
        'rp', s.rank.rp,
        '->ref', ref.rank.tier,
      )
    }
  }
} finally {
  await prisma.$disconnect()
}