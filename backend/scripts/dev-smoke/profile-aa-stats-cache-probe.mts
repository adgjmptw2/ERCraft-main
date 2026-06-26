import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { uidToUserNum } from '../../src/external/bserMapper.ts'

const prisma = new PrismaClient()

for (const apiSeasonId of [20, 39]) {
  const caches = await prisma.seasonStatsCache.findMany({
    where: { id: { endsWith: `:${apiSeasonId}` } },
    select: { id: true, data: true },
    take: 500,
  })
  for (const nick of ['하잉', '연서', '절단마술사']) {
    const hits = caches.filter((row) => {
      const data = row.data
      if (!Array.isArray(data)) return false
      return data.some(
        (entry) =>
          typeof entry?.nickname === 'string' &&
          entry.nickname.trim().toLowerCase() === nick.toLowerCase(),
      )
    })
    if (hits.length > 0) {
      console.log(
        nick,
        'api',
        apiSeasonId,
        'hits',
        hits.map((h) => ({
          uid: h.id.split(':')[0]?.slice(0, 24) + '…',
          userNum: uidToUserNum(h.id.split(':')[0] ?? ''),
        })),
      )
    }
  }
}

await prisma.$disconnect()
