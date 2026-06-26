import { PrismaClient } from '@prisma/client'
import { loadAnalysisCohortBundle } from '../src/services/playerRoleSnapshot/sync.ts'
import { aggregateScopedRowMetrics, sortRowsByRecency } from '../src/services/playerAnalysis/aggregate.ts'
import { filterRowsForShadowBenchmark } from '../src/services/playerCharacterSnapshot/matchFilter.ts'
import { resolveOverallComparison } from '../src/services/playerAnalysis/benchmark.ts'
import { PLAYER_ANALYSIS_BENCHMARK_VERSION } from '../src/services/playerCharacterSnapshot/config.ts'

const prisma = new PrismaClient()
const uid = 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6'
const raw = await prisma.playerMatch.findMany({
  where: { uid, displaySeasonId: 11, apiSeasonId: 39, gameMode: { in: ['rank', 'normal'] } },
})
const filtered = filterRowsForShadowBenchmark({
  rows: raw,
  canonicalUid: uid,
  scope: 'all',
  displaySeasonId: 11,
  apiSeasonId: 39,
})
const all = sortRowsByRecency(filtered.rows)
const metrics = aggregateScopedRowMetrics({ rows: all, displaySeasonId: 11, apiSeasonId: 39 })
const bundle = await loadAnalysisCohortBundle(prisma, {
  displaySeasonId: 11,
  apiSeasonId: 39,
  benchmarkScope: 'all',
  window: 'season',
  syncRoleSnapshots: false,
})
const roleKey = `${metrics.primaryRole}:${metrics.tierBand}`
console.log({
  role: metrics.primaryRole,
  tier: metrics.tierBand,
  roleKey,
  poolSize: bundle.roleMaps.byRoleTier.get(roleKey)?.length ?? 0,
  roleRows: bundle.roleRows.length,
  unique: bundle.roleMaps.uniquePlayersByRoleTier.get(roleKey),
})
const cmp = resolveOverallComparison({
  role: metrics.primaryRole,
  tierBand: metrics.tierBand,
  comparisonScope: 'all',
  comparisonWindow: 'season',
  cohortByRoleTier: bundle.roleMaps.byRoleTier,
  uniquePlayersByRoleTier: bundle.roleMaps.uniquePlayersByRoleTier,
  benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
})
console.log('comparison', cmp)
await prisma.$disconnect()