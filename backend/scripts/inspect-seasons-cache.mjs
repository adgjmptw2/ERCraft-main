import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const count = await prisma.playerSeasonsCache.count()
const statsCount = await prisma.seasonStatsCache.count()
console.log('player_seasons_cache rows:', count)
console.log('season_stats_cache rows:', statsCount)

for (const row of await prisma.seasonStatsCache.findMany({ take: 3 })) {
  const data = row.data
  const len = Array.isArray(data) ? data.length : 0
  console.log('stats id:', row.id, 'rows:', len, 'expires:', row.expiresAt)
}

await prisma.$disconnect()
