import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const rows = await prisma.seasonStatsCache.findMany()
let deleted = 0

for (const row of rows) {
  const data = row.data
  if (Array.isArray(data) && data.length === 0) {
    await prisma.seasonStatsCache.delete({ where: { id: row.id } })
    deleted += 1
  }
}

console.log('deleted empty season_stats_cache rows:', deleted)
await prisma.$disconnect()
