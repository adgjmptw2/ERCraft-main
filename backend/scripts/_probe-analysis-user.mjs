import { PrismaClient } from '@prisma/client'
import { buildPlayerAnalysisResponse } from '../src/services/playerAnalysis/builder.ts'

const prisma = new PrismaClient()
const nick = process.argv[2] ?? '마인'

const binding = await prisma.profileNicknameBinding.findFirst({ where: { nickname: nick }, select: { canonicalUid: true } })
if (!binding) { console.log('no binding'); process.exit(1) }
const uid = binding.canonicalUid
const resp = await buildPlayerAnalysisResponse(prisma, {
  canonicalUid: uid,
  nickname: nick,
  displaySeasonId: 11,
  apiSeasonId: 39,
  scope: 'all',
})
const overall = resp?.rows.find((r) => r.type === 'overall')
console.log('overall', {
  role: overall?.primaryRole,
  tier: overall?.comparison.tierBand,
  n: overall?.comparison.samplePlayers,
  type: overall?.comparison.comparisonType,
  matched: overall?.comparison.comparisonMatched,
  gradeDisplay: overall?.gradeDisplay,
})

const role = overall?.primaryRole
const tier = overall?.comparison.tierBand
const version = 'player-analysis-benchmark.v2'
const cohort = await prisma.playerRolePerformanceSnapshot.findMany({
  where: {
    displaySeasonId: 11,
    benchmarkScope: 'all',
    rowType: 'season',
    benchmarkVersion: version,
    primaryRole: role ?? undefined,
    tierBand: tier ?? undefined,
  },
  select: { canonicalUid: true },
})
console.log('direct cohort count', cohort.length, 'unique', new Set(cohort.map((r) => r.canonicalUid)).size)

await prisma.$disconnect()