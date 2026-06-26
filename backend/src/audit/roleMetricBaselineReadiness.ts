import { lookupCharacterWeaponRole } from '../services/characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../services/characterPerformanceGrade/tierKey.js'
import { getRankTierFromRp } from '../utils/rankTier.js'
import { formatComboDisplayName } from '../utils/comboDisplayName.js'

export const ROLE_METRIC_FIELD_NAMES = [
  'damageFromPlayer',
  'protectAbsorb',
  'shieldDamageOffsetFromPlayer',
  'teamRecover',
  'ccTimeToPlayer',
  'viewContribution',
  'monsterKill',
] as const

export type RoleMetricFieldName = (typeof ROLE_METRIC_FIELD_NAMES)[number]

export type ReadinessLevel = 'unusable' | 'experimental' | 'provisional' | 'ready'

export interface RoleMetricRowSnapshot {
  gameId: string
  rankTierKey: string
  characterNum: number
  weaponTypeId: number
  role: string | null
  damageFromPlayer: number | null
  protectAbsorb: number | null
  shieldDamageOffsetFromPlayer: number | null
  teamRecover: number | null
  ccTimeToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
  deaths: number | null
  rpAfter: number | null
  displaySeasonId: number
}

export interface MetricDistribution {
  totalCount: number
  nonNullCount: number
  nonZeroCount: number
  presenceRate: number
  zeroRate: number
  mean: number | null
  median: number | null
  stdDev: number | null
  p10: number | null
  p25: number | null
  p50: number | null
  p75: number | null
  p90: number | null
  p95: number | null
  min: number | null
  max: number | null
  outlierCount: number
  nonZeroMean: number | null
  nonZeroMedian: number | null
  readiness: ReadinessLevel
}

export interface GroupMetricReport {
  groupKey: string
  groupLabel: string
  metrics: Record<RoleMetricFieldName, MetricDistribution>
}

export interface CorrelationReport {
  pearson: number | null
  sampleCount: number
  interpretation: string
}

export interface BaselineReadinessReport {
  generatedAt: string
  totalRows: number
  versionedRows: number
  comboGroups: GroupMetricReport[]
  roleTierGroups: GroupMetricReport[]
  tierGroups: GroupMetricReport[]
  correlations: {
    protectAbsorb_vs_shieldDamageOffsetFromPlayer: CorrelationReport
    damageFromPlayer_vs_deaths: CorrelationReport
    teamRecover_nonSupporterRate: number | null
  }
  qualityNotes: string[]
}

const COMBO_THRESHOLDS = [
  { min: 300, level: 'ready' as const },
  { min: 100, level: 'provisional' as const },
  { min: 30, level: 'experimental' as const },
  { min: 0, level: 'unusable' as const },
]

const ROLE_TIER_THRESHOLDS = [
  { min: 1000, level: 'ready' as const },
  { min: 500, level: 'provisional' as const },
  { min: 200, level: 'experimental' as const },
  { min: 0, level: 'unusable' as const },
]

function resolveReadiness(count: number, thresholds: Array<{ min: number; level: ReadinessLevel }>): ReadinessLevel {
  for (const entry of thresholds) {
    if (count >= entry.min) return entry.level
  }
  return 'unusable'
}

function readMetricValue(row: RoleMetricRowSnapshot, field: RoleMetricFieldName): number | null {
  return row[field]
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0] ?? null
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower] ?? null
  const weight = index - lower
  const low = sorted[lower] ?? 0
  const high = sorted[upper] ?? low
  return low * (1 - weight) + high * weight
}

function stdDev(values: number[]): number | null {
  if (values.length === 0) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function countIqrOutliers(values: number[]): number {
  if (values.length < 4) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = percentile(sorted, 0.25) ?? 0
  const q3 = percentile(sorted, 0.75) ?? 0
  const iqr = q3 - q1
  if (iqr <= 0) return 0
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  return values.filter((value) => value < lower || value > upper).length
}

export function computeMetricDistribution(
  rows: ReadonlyArray<RoleMetricRowSnapshot>,
  field: RoleMetricFieldName,
  readinessThresholds: Array<{ min: number; level: ReadinessLevel }>,
): MetricDistribution {
  const totalCount = rows.length
  const values = rows
    .map((row) => readMetricValue(row, field))
    .filter((value): value is number => value != null && Number.isFinite(value))
  const nonNullCount = values.length
  const nonZeroValues = values.filter((value) => value !== 0)
  const nonZeroCount = nonZeroValues.length
  const sorted = [...values].sort((a, b) => a - b)
  const mean = nonNullCount > 0 ? values.reduce((sum, value) => sum + value, 0) / nonNullCount : null

  return {
    totalCount,
    nonNullCount,
    nonZeroCount,
    presenceRate: totalCount > 0 ? nonNullCount / totalCount : 0,
    zeroRate: nonNullCount > 0 ? (nonNullCount - nonZeroCount) / nonNullCount : 0,
    mean,
    median: percentile(sorted, 0.5),
    stdDev: stdDev(values),
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    outlierCount: countIqrOutliers(values),
    nonZeroMean:
      nonZeroCount > 0
        ? nonZeroValues.reduce((sum, value) => sum + value, 0) / nonZeroCount
        : null,
    nonZeroMedian: percentile([...nonZeroValues].sort((a, b) => a - b), 0.5),
    readiness: resolveReadiness(nonNullCount, readinessThresholds),
  }
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length
  let numerator = 0
  let denomX = 0
  let denomY = 0
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i]! - meanX
    const dy = ys[i]! - meanY
    numerator += dx * dy
    denomX += dx * dx
    denomY += dy * dy
  }
  if (denomX === 0 || denomY === 0) return null
  return numerator / Math.sqrt(denomX * denomY)
}

export function buildGroupMetricReport(
  groupKey: string,
  groupLabel: string,
  rows: ReadonlyArray<RoleMetricRowSnapshot>,
  readinessThresholds: Array<{ min: number; level: ReadinessLevel }>,
): GroupMetricReport {
  const metrics = {} as Record<RoleMetricFieldName, MetricDistribution>
  for (const field of ROLE_METRIC_FIELD_NAMES) {
    metrics[field] = computeMetricDistribution(rows, field, readinessThresholds)
  }
  return { groupKey, groupLabel, metrics }
}

function resolveRankTierKeyFromRow(rpAfter: number | null, displaySeasonId: number): string {
  if (rpAfter == null) return 'unranked'
  const tier = getRankTierFromRp(rpAfter, null, displaySeasonId)
  return rankTierToGradeBaselineKey(tier) ?? 'unranked'
}

export function resolveRowRankTierKey(row: RoleMetricRowSnapshot): string {
  return resolveRankTierKeyFromRow(row.rpAfter, row.displaySeasonId)
}

export function toRowSnapshot(row: {
  gameId: string
  characterNum: number
  bestWeapon: number | null
  rpAfter: number | null
  displaySeasonId: number
  deaths: number | null
  damageFromPlayer: number | null
  protectAbsorb: number | null
  shieldDamageOffsetFromPlayer: number | null
  teamRecover: number | null
  ccTimeToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
}): RoleMetricRowSnapshot {
  const weaponTypeId = row.bestWeapon ?? 0
  const rankTierKey = resolveRankTierKeyFromRow(row.rpAfter, row.displaySeasonId)
  return {
    gameId: row.gameId,
    rankTierKey,
    characterNum: row.characterNum,
    weaponTypeId,
    role: lookupCharacterWeaponRole(row.characterNum, weaponTypeId),
    damageFromPlayer: row.damageFromPlayer,
    protectAbsorb: row.protectAbsorb,
    shieldDamageOffsetFromPlayer: row.shieldDamageOffsetFromPlayer,
    teamRecover: row.teamRecover,
    ccTimeToPlayer: row.ccTimeToPlayer,
    viewContribution: row.viewContribution,
    monsterKill: row.monsterKill,
    deaths: row.deaths,
    rpAfter: row.rpAfter,
    displaySeasonId: row.displaySeasonId,
  }
}

export function buildBaselineReadinessReport(
  rows: ReadonlyArray<RoleMetricRowSnapshot>,
): BaselineReadinessReport {
  const comboMap = new Map<string, RoleMetricRowSnapshot[]>()
  const roleTierMap = new Map<string, RoleMetricRowSnapshot[]>()
  const tierMap = new Map<string, RoleMetricRowSnapshot[]>()

  for (const row of rows) {
    const comboKey = `${row.rankTierKey}|${row.characterNum}:${row.weaponTypeId}`
    const comboRows = comboMap.get(comboKey) ?? []
    comboRows.push(row)
    comboMap.set(comboKey, comboRows)

    const role = row.role ?? 'unknown'
    const roleTierKey = `${row.rankTierKey}|${role}`
    const roleTierRows = roleTierMap.get(roleTierKey) ?? []
    roleTierRows.push(row)
    roleTierMap.set(roleTierKey, roleTierRows)

    const tierRows = tierMap.get(row.rankTierKey) ?? []
    tierRows.push(row)
    tierMap.set(row.rankTierKey, tierRows)
  }

  const comboGroups = [...comboMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, groupRows]) => {
      const [tierKey, combo] = key.split('|')
      const [characterNum, weaponTypeId] = combo!.split(':').map(Number)
      return buildGroupMetricReport(
        key,
        `${tierKey} · ${formatComboDisplayName(characterNum!, weaponTypeId!)}`,
        groupRows,
        COMBO_THRESHOLDS,
      )
    })

  const roleTierGroups = [...roleTierMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, groupRows]) => buildGroupMetricReport(key, key, groupRows, ROLE_TIER_THRESHOLDS))

  const tierGroups = [...tierMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, groupRows]) =>
      buildGroupMetricReport(key, key, groupRows, ROLE_TIER_THRESHOLDS),
    )

  const protectPairs = rows.flatMap((row) => {
    if (row.protectAbsorb == null || row.shieldDamageOffsetFromPlayer == null) return []
    return [[row.protectAbsorb, row.shieldDamageOffsetFromPlayer] as const]
  })
  const deathPairs = rows.flatMap((row) => {
    if (row.damageFromPlayer == null || row.deaths == null) return []
    return [[row.damageFromPlayer, row.deaths] as const]
  })

  const teamRecoverNonSupport = rows.filter(
    (row) => row.teamRecover != null && row.teamRecover > 0 && row.role !== '서포터',
  )
  const teamRecoverNonZero = rows.filter((row) => row.teamRecover != null && row.teamRecover > 0)

  const qualityNotes: string[] = []
  if (protectPairs.length >= 10) {
    const corr =
      pearsonCorrelation(
        protectPairs.map(([a]) => a),
        protectPairs.map(([, b]) => b),
      ) ?? 0
    if (Math.abs(corr) >= 0.7) {
      qualityNotes.push('protectAbsorb와 shieldDamageOffsetFromPlayer 상관계수가 높음 — 중복 가능성 검토 필요')
    }
  }
  if (teamRecoverNonZero.length > 0) {
    qualityNotes.push(
      `teamRecover > 0 중 서포터 외 역할 비율: ${(teamRecoverNonSupport.length / teamRecoverNonZero.length).toFixed(3)}`,
    )
  }

  return {
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    versionedRows: rows.length,
    comboGroups,
    roleTierGroups,
    tierGroups,
    correlations: {
      protectAbsorb_vs_shieldDamageOffsetFromPlayer: {
        pearson:
          protectPairs.length >= 2
            ? pearsonCorrelation(
                protectPairs.map(([a]) => a),
                protectPairs.map(([, b]) => b),
              )
            : null,
        sampleCount: protectPairs.length,
        interpretation: '두 보호막 지표의 선형 상관 — 1에 가까울수록 중복 가능성',
      },
      damageFromPlayer_vs_deaths: {
        pearson:
          deathPairs.length >= 2
            ? pearsonCorrelation(
                deathPairs.map(([a]) => a),
                deathPairs.map(([, b]) => b),
              )
            : null,
        sampleCount: deathPairs.length,
        interpretation: '받은 피해와 데스 수 상관',
      },
      teamRecover_nonSupporterRate:
        teamRecoverNonZero.length > 0
          ? teamRecoverNonSupport.length / teamRecoverNonZero.length
          : null,
    },
    qualityNotes,
  }
}

export function formatBaselineReadinessText(report: BaselineReadinessReport): string {
  const lines: string[] = [
    '=== ERCraft Role Metric Baseline Readiness (39.11E) ===',
    `generatedAt: ${report.generatedAt}`,
    '',
    `versioned rows: ${report.versionedRows}`,
    '',
    '--- 정확 조합 (rankTier + character:weapon) 상위 ---',
  ]

  for (const group of report.comboGroups.slice(0, 20)) {
    lines.push(`[${group.groupLabel}] n=${group.metrics.damageFromPlayer.totalCount}`)
    for (const field of ROLE_METRIC_FIELD_NAMES) {
      const metric = group.metrics[field]
      lines.push(
        `  ${field}: nonNull=${metric.nonNullCount} readiness=${metric.readiness} mean=${metric.mean ?? 'null'} p50=${metric.p50 ?? 'null'} zeroRate=${metric.zeroRate.toFixed(3)}`,
      )
    }
  }

  lines.push('', '--- 상관성 ---')
  lines.push(
    `protectAbsorb vs shieldDamageOffsetFromPlayer: r=${report.correlations.protectAbsorb_vs_shieldDamageOffsetFromPlayer.pearson ?? 'null'} n=${report.correlations.protectAbsorb_vs_shieldDamageOffsetFromPlayer.sampleCount}`,
  )
  lines.push(
    `damageFromPlayer vs deaths: r=${report.correlations.damageFromPlayer_vs_deaths.pearson ?? 'null'} n=${report.correlations.damageFromPlayer_vs_deaths.sampleCount}`,
  )
  lines.push(
    `teamRecover non-supporter rate: ${report.correlations.teamRecover_nonSupporterRate ?? 'null'}`,
  )

  if (report.qualityNotes.length > 0) {
    lines.push('', '--- 품질 메모 ---')
    for (const note of report.qualityNotes) lines.push(`- ${note}`)
  }

  return lines.join('\n')
}
