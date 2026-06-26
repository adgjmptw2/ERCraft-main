import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import { isPrismaPlayerMatchReady } from '../../cache/playerMatchStore.js'
import { PLAYER_ANALYSIS_BENCHMARK_VERSION } from '../playerCharacterSnapshot/config.js'
import { buildSourceFingerprint } from '../playerCharacterSnapshot/fingerprint.js'
import { filterRowsForShadowBenchmark } from '../playerCharacterSnapshot/matchFilter.js'
import { playedAtMs } from '../playerCharacterSnapshot/fingerprint.js'
import { percentileRankMidrank } from '../playerCharacterSnapshot/percentile.js'
import {
  aggregateScopedRowMetrics,
  buildRadarAxes,
  formatMetricValue,
  sortRowsByRecency,
} from './aggregate.js'
import {
  buildMetricComparison,
  resolveCharacterComparison,
  resolveOverallComparison,
} from './benchmark.js'
import { resolveFormalGrade, resolveCohortConfidence } from './gradePolicy.js'
import { applyReliabilityShrink, resolveAnalysisConfidence } from './reliability.js'
import { loadAnalysisCohortBundle } from '../playerRoleSnapshot/sync.js'
import { buildCohortAxisMedians } from '../playerRoleSnapshot/cohort.js'
import type {
  PlayerAnalysisCharacterRow,
  PlayerAnalysisMetricCard,
  PlayerAnalysisOverallRow,
  PlayerAnalysisRecent20Row,
  PlayerAnalysisResponse,
  PlayerAnalysisScope,
  PlayerAnalysisScopeRow,
  PlayerAnalysisTotals,
  ComparisonScope,
  ComparisonWindow,
  ScopedRowMetrics,
} from './types.js'
import type { ComparisonContext } from './benchmark.js'

const METRIC_CARD_DEFS: Array<{ key: string; label: string }> = [
  { key: 'overallScore', label: '종합 점수' },
  { key: 'averagePlacement', label: '평균 순위' },
  { key: 'winRate', label: '승률' },
  { key: 'top3Rate', label: 'TOP3 비율' },
  { key: 'damagePerMinute', label: '피해량/분' },
  { key: 'visionPerMinute', label: '시야/분' },
  { key: 'teamKillParticipation', label: 'TK 관여율' },
  { key: 'averageKills', label: '평균 킬' },
  { key: 'averageAssists', label: '평균 어시스트' },
  { key: 'averageDeaths', label: '평균 데스' },
  { key: 'averageSurvivalTime', label: '평균 생존시간' },
  { key: 'consistencyScore', label: '일관성' },
]

const TOP_CHARACTER_LIMIT = 3

function sanitizeMetric(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value
}

function readMetric(metrics: ScopedRowMetrics, key: string): number | null {
  const record = metrics as unknown as Record<string, number | null>
  return sanitizeMetric(record[key])
}

function buildMetricCards(params: {
  metrics: ScopedRowMetrics
  comparison: ComparisonContext
  cohortMetricValues: Map<string, number[]>
  games: number
  cohortMean: number | null
}): PlayerAnalysisMetricCard[] {
  const playerConfidence = resolveAnalysisConfidence(params.games)
  const cards: PlayerAnalysisMetricCard[] = []

  for (const def of METRIC_CARD_DEFS) {
    if (def.key === 'damageShare') continue
    const raw = readMetric(params.metrics, def.key)
    const cohortValues = params.cohortMetricValues.get(def.key) ?? []
    const comparison = buildMetricComparison({
      metricKey: def.key,
      playerValue: raw,
      cohortValues,
      comparison: params.comparison,
      playerConfidence,
    })
    let displayValue = formatMetricValue(def.key, raw)
    let value = raw
    if (def.key === 'overallScore' && raw != null && playerConfidence === 'provisional') {
      const adjusted = applyReliabilityShrink({
        playerScore: raw,
        cohortMean: params.cohortMean,
        games: params.games,
      })
      if (adjusted != null) {
        value = adjusted
        displayValue = adjusted.toFixed(1)
      }
    }
    cards.push({
      key: def.key,
      label: def.label,
      value,
      displayValue,
      percentileLabel: comparison.label,
      percentileDisplay: comparison.percentileDisplay,
      comparisonLabel: params.comparison.displayLabel,
      samplePlayers:
        params.comparison.samplePlayers > 0 ? params.comparison.samplePlayers : null,
      unavailable: raw == null,
      percentile: comparison.percentile,
      grade: comparison.grade,
    })
  }
  return cards
}

function buildRoleMetricValueMap(params: {
  roleKey: string | null
  roleMetricPools: Map<string, Map<string, number[]>>
  byRoleTier: Map<string, number[]>
}): Map<string, number[]> {
  const values = new Map<string, number[]>()
  for (const def of METRIC_CARD_DEFS) {
    values.set(
      def.key,
      params.roleKey != null ? params.roleMetricPools.get(def.key)?.get(params.roleKey) ?? [] : [],
    )
  }
  values.set(
    'overallScore',
    params.roleKey != null ? params.byRoleTier.get(params.roleKey) ?? [] : [],
  )
  return values
}

function buildScopeRow(params: {
  type: 'overall' | 'recent20' | 'character'
  label: string
  subtitle?: string
  characterNum?: number
  characterName?: string
  characterRank?: number | null
  isTopCharacter?: boolean
  lastPlayedAt?: string | null
  metrics: ScopedRowMetrics
  comparison: ComparisonContext
  cohortMetricValues: Map<string, number[]>
  cohortAxisMedians: Map<string, number>
  cohortMean: number | null
}): PlayerAnalysisScopeRow {
  const playerConfidence = resolveAnalysisConfidence(params.metrics.games)
  const cards = buildMetricCards({
    metrics: params.metrics,
    comparison: params.comparison,
    cohortMetricValues: params.cohortMetricValues,
    games: params.metrics.games,
    cohortMean: params.cohortMean,
  })

  const rawScore = params.metrics.overallScore
  const adjustedScore =
    playerConfidence === 'provisional'
      ? applyReliabilityShrink({
          playerScore: rawScore,
          cohortMean: params.cohortMean,
          games: params.metrics.games,
        })
      : rawScore

  const gradePool = params.cohortMetricValues.get('overallScore') ?? []
  const percentile =
    adjustedScore != null && gradePool.length > 0
      ? percentileRankMidrank(gradePool, adjustedScore)
      : null

  const gradeResolved = resolveFormalGrade({
    percentile,
    samplePlayers: params.comparison.samplePlayers,
    playerConfidence,
    comparisonMatched: params.comparison.comparisonMatched,
  })

  const base = {
    games: params.metrics.games,
    winRate: params.metrics.winRate,
    top3Rate: params.metrics.top3Rate,
    averagePlacement: params.metrics.averagePlacement,
    primaryRole: params.metrics.primaryRole,
    overallScore: playerConfidence === 'withheld' ? null : adjustedScore,
    grade: gradeResolved.grade,
    gradeDisplay: gradeResolved.gradeDisplay,
    percentile,
    percentileDisplay: gradeResolved.percentileDisplay,
    confidence: playerConfidence,
    playerConfidence,
    cohortConfidence: gradeResolved.cohortConfidence,
    metrics: cards,
    radarAxes: buildRadarAxes(params.metrics.analysisAxes, params.cohortAxisMedians),
    comparison: {
      comparisonType: params.comparison.comparisonType,
      comparisonScope: params.comparison.comparisonScope,
      comparisonWindow: params.comparison.comparisonWindow,
      samplePlayers: params.comparison.samplePlayers,
      tierBand: params.comparison.tierBand,
      role: params.comparison.role,
      characterNum: params.comparison.characterNum,
      benchmarkVersion: params.comparison.benchmarkVersion,
      displayLabel: params.comparison.displayLabel,
      comparisonMatched: params.comparison.comparisonMatched,
      comparisonUnavailableReason: params.comparison.comparisonUnavailableReason,
    },
  }

  if (params.type === 'overall') {
    return {
      type: 'overall',
      label: params.label,
      subtitle: params.subtitle ?? '현재 시즌 랭크 전체',
      ...base,
    } satisfies PlayerAnalysisOverallRow
  }
  if (params.type === 'recent20') {
    return {
      type: 'recent20',
      label: params.label,
      subtitle: params.subtitle ?? '최근 랭크 20경기',
      ...base,
    } satisfies PlayerAnalysisRecent20Row
  }
  return {
    type: 'character',
    characterNum: params.characterNum!,
    characterName: params.characterName ?? `캐릭터 ${params.characterNum}`,
    label: params.characterName ?? `캐릭터 ${params.characterNum}`,
    characterRank: params.characterRank ?? null,
    isTopCharacter: params.isTopCharacter ?? false,
    lastPlayedAt: params.lastPlayedAt ?? null,
    ...base,
  } satisfies PlayerAnalysisCharacterRow
}

function sortCharacterEntries(
  entries: Array<{ characterNum: number; charRows: PlayerMatchRow[]; games: number }>,
): Array<{ characterNum: number; charRows: PlayerMatchRow[]; games: number; lastPlayedAt: number }> {
  return entries
    .map((entry) => ({
      ...entry,
      lastPlayedAt: Math.max(...entry.charRows.map((row) => playedAtMs(row))),
    }))
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games
      if (b.lastPlayedAt !== a.lastPlayedAt) return b.lastPlayedAt - a.lastPlayedAt
      return a.characterNum - b.characterNum
    })
}

export async function buildPlayerAnalysisResponse(
  prisma: PrismaClient,
  params: {
    canonicalUid: string
    nickname: string
    displaySeasonId: number
    apiSeasonId: number
    scope: PlayerAnalysisScope
  },
): Promise<PlayerAnalysisResponse | null> {
  if (!isPrismaPlayerMatchReady(prisma)) return null

  const benchmarkScope: ComparisonScope = params.scope === 'all' ? 'all' : 'rank'
  const matchModes =
    benchmarkScope === 'all' ? (['rank', 'normal'] as const) : (['rank'] as const)

  const seasonWhere = {
    uid: params.canonicalUid,
    displaySeasonId: params.displaySeasonId,
    apiSeasonId: params.apiSeasonId,
  }

  const [rawRows, excludedNormal, excludedCobalt, excludedUnion] = await Promise.all([
    prisma.playerMatch.findMany({
      where: { ...seasonWhere, gameMode: { in: [...matchModes] } },
    }) as Promise<PlayerMatchRow[]>,
    prisma.playerMatch.count({
      where: { ...seasonWhere, gameMode: 'normal' },
    }),
    prisma.playerMatch.count({
      where: { ...seasonWhere, OR: [{ gameMode: 'cobalt' }, { matchingMode: 6 }] },
    }),
    prisma.playerMatch.count({
      where: { ...seasonWhere, OR: [{ gameMode: 'union' }, { matchingMode: 7 }] },
    }),
  ])

  const filtered = filterRowsForShadowBenchmark({
    rows: rawRows,
    canonicalUid: params.canonicalUid,
    scope: benchmarkScope,
    displaySeasonId: params.displaySeasonId,
    apiSeasonId: params.apiSeasonId,
  })

  const allRows = sortRowsByRecency(filtered.rows)
  const recentRows = allRows.slice(0, 20)
  const rankMatches = allRows.length

  const totals: PlayerAnalysisTotals = {
    eligibleMatches: allRows.length,
    includedRankMatches: rankMatches,
    rankMatches,
    normalMatches: 0,
    excludedNormal,
    excludedCobalt,
    excludedUnion,
    excludedDuplicate: filtered.stats.excludedDuplicateGameId,
    excludedOwnership: filtered.stats.excludedOwnershipMismatch,
  }

  const seasonCohort = await loadAnalysisCohortBundle(prisma, {
    displaySeasonId: params.displaySeasonId,
    apiSeasonId: params.apiSeasonId,
    benchmarkScope,
    window: 'season',
    syncRoleSnapshots: false,
  })

  const recentCohort = await loadAnalysisCohortBundle(prisma, {
    displaySeasonId: params.displaySeasonId,
    apiSeasonId: params.apiSeasonId,
    benchmarkScope,
    window: 'recent20',
    syncRoleSnapshots: false,
  })

  const overallMetrics = aggregateScopedRowMetrics({
    rows: allRows,
    displaySeasonId: params.displaySeasonId,
    apiSeasonId: params.apiSeasonId,
  })
  const recentMetrics = aggregateScopedRowMetrics({
    rows: recentRows,
    displaySeasonId: params.displaySeasonId,
    apiSeasonId: params.apiSeasonId,
  })

  const seasonWindow: ComparisonWindow = 'season'
  const recentWindow: ComparisonWindow = 'recent20'

  const overallRoleKey =
    overallMetrics.primaryRole != null
      ? `${overallMetrics.primaryRole}:${overallMetrics.tierBand}`
      : null
  const overallComparison = resolveOverallComparison({
    role: overallMetrics.primaryRole,
    tierBand: overallMetrics.tierBand,
    comparisonScope: benchmarkScope,
    comparisonWindow: seasonWindow,
    cohortByRoleTier: seasonCohort.roleMaps.byRoleTier,
    uniquePlayersByRoleTier: seasonCohort.roleMaps.uniquePlayersByRoleTier,
    benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
  })
  const overallCohortMean =
    overallRoleKey != null
      ? (seasonCohort.roleMaps.byRoleTier.get(overallRoleKey) ?? []).reduce(
          (sum, value, _, arr) => sum + value / arr.length,
          0,
        )
      : null

  const recentRoleKey =
    recentMetrics.primaryRole != null
      ? `${recentMetrics.primaryRole}:${recentMetrics.tierBand}`
      : null
  const recentComparison = resolveOverallComparison({
    role: recentMetrics.primaryRole,
    tierBand: recentMetrics.tierBand,
    comparisonScope: benchmarkScope,
    comparisonWindow: recentWindow,
    cohortByRoleTier: recentCohort.roleMaps.byRoleTier,
    uniquePlayersByRoleTier: recentCohort.roleMaps.uniquePlayersByRoleTier,
    benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
  })
  const recentCohortMean =
    recentRoleKey != null
      ? (recentCohort.roleMaps.byRoleTier.get(recentRoleKey) ?? []).reduce(
          (sum, value, _, arr) => sum + value / arr.length,
          0,
        )
      : null

  const rows: PlayerAnalysisScopeRow[] = [
    buildScopeRow({
      type: 'overall',
      label: '전체',
      metrics: overallMetrics,
      comparison: overallComparison,
      cohortMetricValues: buildRoleMetricValueMap({
        roleKey: overallRoleKey,
        roleMetricPools: seasonCohort.roleMaps.roleMetricPools,
        byRoleTier: seasonCohort.roleMaps.byRoleTier,
      }),
      cohortAxisMedians: overallRoleKey
        ? buildCohortAxisMedians(seasonCohort.roleMaps.roleAxisPools, overallRoleKey)
        : new Map(),
      cohortMean: Number.isFinite(overallCohortMean) ? overallCohortMean : null,
    }),
    buildScopeRow({
      type: 'recent20',
      label: '최근 20경기',
      metrics: recentMetrics,
      comparison: recentComparison,
      cohortMetricValues: buildRoleMetricValueMap({
        roleKey: recentRoleKey,
        roleMetricPools: recentCohort.roleMaps.roleMetricPools,
        byRoleTier: recentCohort.roleMaps.byRoleTier,
      }),
      cohortAxisMedians: recentRoleKey
        ? buildCohortAxisMedians(recentCohort.roleMaps.roleAxisPools, recentRoleKey)
        : new Map(),
      cohortMean: Number.isFinite(recentCohortMean) ? recentCohortMean : null,
    }),
  ]

  const byCharacter = new Map<number, PlayerMatchRow[]>()
  for (const row of allRows) {
    const bucket = byCharacter.get(row.characterNum) ?? []
    bucket.push(row)
    byCharacter.set(row.characterNum, bucket)
  }

  const sortedCharacters = sortCharacterEntries(
    [...byCharacter.entries()].map(([characterNum, charRows]) => ({
      characterNum,
      charRows,
      games: charRows.length,
    })),
  )

  const characterRows = sortedCharacters.map((entry, index) => {
    const metrics = aggregateScopedRowMetrics({
      rows: entry.charRows,
      displaySeasonId: params.displaySeasonId,
      apiSeasonId: params.apiSeasonId,
      characterNum: entry.characterNum,
    })
    const name =
      entry.charRows.find((row) => row.characterName)?.characterName ?? `캐릭터 ${entry.characterNum}`
    const comparison = resolveCharacterComparison({
      characterNum: entry.characterNum,
      characterName: name,
      tierBand: metrics.tierBand,
      role: metrics.primaryRole,
      comparisonScope: benchmarkScope,
      comparisonWindow: seasonWindow,
      cohortByCharacterTier: seasonCohort.characterMaps.byCharacterTier,
      cohortByRoleTier: seasonCohort.roleMaps.byRoleTier,
      uniquePlayersByRoleTier: seasonCohort.roleMaps.uniquePlayersByRoleTier,
      benchmarkVersion: PLAYER_ANALYSIS_BENCHMARK_VERSION,
    })
    const charKey = `${entry.characterNum}:${metrics.tierBand}`
    const cohortMetricValues = new Map<string, number[]>()
    for (const def of METRIC_CARD_DEFS) {
      cohortMetricValues.set(def.key, seasonCohort.characterMaps.metricPools.get(def.key)?.get(charKey) ?? [])
    }
    cohortMetricValues.set('overallScore', seasonCohort.characterMaps.byCharacterTier.get(charKey) ?? [])
    const charPool = seasonCohort.characterMaps.byCharacterTier.get(charKey) ?? []
    const charMean =
      charPool.length > 0 ? charPool.reduce((sum, value) => sum + value, 0) / charPool.length : null
    const rank = index + 1
    return buildScopeRow({
      type: 'character',
      label: name,
      characterNum: entry.characterNum,
      characterName: name,
      characterRank: rank,
      isTopCharacter: rank <= TOP_CHARACTER_LIMIT,
      lastPlayedAt: new Date(entry.lastPlayedAt).toISOString(),
      metrics,
      comparison,
      cohortMetricValues,
      cohortAxisMedians: overallRoleKey
        ? buildCohortAxisMedians(seasonCohort.roleMaps.roleAxisPools, overallRoleKey)
        : new Map(),
      cohortMean: Number.isFinite(charMean) ? charMean : null,
    })
  })

  rows.push(...characterRows)

  const fingerprint = buildSourceFingerprint(allRows.map((row) => row.gameId))

  return {
    owner: {
      canonicalUid: params.canonicalUid,
      nickname: params.nickname,
      seasonId: params.displaySeasonId,
    },
    scope: params.scope,
    sourceFingerprint: fingerprint,
    computedAt: new Date().toISOString(),
    totals,
    rows,
  }
}

export function analysisCacheKey(params: {
  canonicalUid: string
  seasonId: number
  scope: PlayerAnalysisScope
  fingerprint: string
}): string {
  return createHash('sha256')
    .update(
      [params.canonicalUid, params.seasonId, params.scope, params.fingerprint, PLAYER_ANALYSIS_BENCHMARK_VERSION].join(
        ':',
      ),
    )
    .digest('hex')
}
