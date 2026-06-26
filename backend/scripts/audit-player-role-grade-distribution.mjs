import { PrismaClient } from '@prisma/client'
import { assignShadowGradeFromPercentile } from '../src/services/playerCharacterSnapshot/gradeDistribution.js'
import { percentileRankMidrank } from '../src/services/playerCharacterSnapshot/percentile.js'
import { resolveFormalGrade } from '../src/services/playerAnalysis/gradePolicy.js'
import { buildRoleCohortMaps, loadRoleCohortRows } from '../src/services/playerRoleSnapshot/cohort.js'
import { PLAYER_ANALYSIS_BENCHMARK_VERSION } from '../src/services/playerCharacterSnapshot/config.js'

const prisma = new PrismaClient()
const version = PLAYER_ANALYSIS_BENCHMARK_VERSION
const seasonId = 11

for (const window of ['season', 'recent20']) {
  const rows = await loadRoleCohortRows(prisma, {
    displaySeasonId: seasonId,
    benchmarkScope: 'all',
    window,
    benchmarkVersion: version,
  })
  const maps = buildRoleCohortMaps(rows)
  const samples = [...maps.byRoleTier.entries()]
    .map(([key, values]) => ({ key, n: values.length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
  console.log(`\n[role ${window}] top cohorts`)
  for (const sample of samples) {
    const values = maps.byRoleTier.get(sample.key) ?? []
    const grades = {}
    for (const value of values) {
      const p = percentileRankMidrank(values, value)
      const g = resolveFormalGrade({ percentile: p, samplePlayers: values.length, playerConfidence: 'official', comparisonMatched: true })
      const label = g.gradeDisplay ?? g.grade ?? 'none'
      grades[label] = (grades[label] ?? 0) + 1
    }
    console.log({ cohort: sample.key, n: sample.n, grades })
  }
}

await prisma.$disconnect()