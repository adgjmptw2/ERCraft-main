import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const version = 'player-analysis-benchmark.v2'

const counts = await prisma.playerRolePerformanceSnapshot.groupBy({
  by: ['benchmarkScope', 'rowType'],
  where: { benchmarkVersion: version, displaySeasonId: 11 },
  _count: true,
})
console.log('role snapshot counts', counts)

const roleGroups = await prisma.$queryRaw`
  SELECT primary_role, tier_band, COUNT(*) as cnt
  FROM player_role_performance_snapshots
  WHERE benchmark_version = ${version}
    AND display_season_id = 11
    AND benchmark_scope = 'all'
    AND row_type = 'season'
  GROUP BY primary_role, tier_band
  ORDER BY cnt DESC
  LIMIT 10
`
console.log('top role cohorts (all/season)', roleGroups)

await prisma.$disconnect()