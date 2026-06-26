import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
try {
  const scope = 'rank'
  const season = 11
  for (const window of ['season', 'recent20']) {
    const total = await prisma.playerRolePerformanceSnapshot.count({
      where: { displaySeasonId: season, benchmarkScope: scope, rowType: window },
    })
    const roles = await prisma.playerRolePerformanceSnapshot.groupBy({
      by: ['primaryRole'],
      where: { displaySeasonId: season, benchmarkScope: scope, rowType: window },
      _count: { canonicalUid: true },
    })
    console.log('window', window, 'snapshots', total, 'roles', roles.length)
  }
} finally {
  await prisma.$disconnect()
}