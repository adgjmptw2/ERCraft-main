import { createHash } from 'node:crypto'

import type { CharacterGradeRole } from '../../services/characterPerformanceGrade/config.js'
import { lookupCharacterWeaponRole } from '../../services/characterPerformanceGrade/baselineStore.js'
import { getRankTierFromRp } from '../../utils/rankTier.js'

export const ROLE_TIME_CURVE_VERSION = 'role-time-curve.v1'
export const ROLE_TIME_CURVE_STATUS = 'candidate'
export const ROLE_TIME_ANCHORS_MINUTES = [0, 5, 10, 15, 20, 25, 30] as const
export const ROLE_TIME_BUCKET_LABELS = [
  '0-5',
  '5-10',
  '10-15',
  '15-20',
  '20-25',
  '25-30',
  '30+',
] as const

export const ROLE_TIME_CURVE_ROLES = [
  '평타 딜러',
  '스증 딜러',
  '암살자',
  '브루저',
  '탱커',
  '유틸 서포터',
  'unknown',
] as const

export const ROLE_TIME_METRICS = [
  'damageToPlayer',
  'viewContribution',
  'monsterKill',
] as const

export type RoleTimeCurveRole = (typeof ROLE_TIME_CURVE_ROLES)[number]
export type RoleTimeMetric = (typeof ROLE_TIME_METRICS)[number]
export type RoleTimeBucketLabel = (typeof ROLE_TIME_BUCKET_LABELS)[number]

export interface RoleTimePlayerMatchRow {
  uid: string
  gameId: string
  apiSeasonId: number
  displaySeasonId: number
  gameMode: string
  playedAt: Date
  characterNum: number
  bestWeapon: number | null
  placement: number | null
  deaths: number | null
  victory: boolean | null
  rpAfter: number | null
  gameDuration: number | null
  damageToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
}

export interface CurvePoint {
  minute: number
  rawValue: number
  monotonicValue: number
  finalValue: number
  normalizedMultiplier: number
  sampleCount: number
  usedGlobalFallback: boolean
}

export interface MetricCurve {
  metric: RoleTimeMetric
  role: RoleTimeCurveRole
  roleSampleCount: number
  globalSampleCount: number
  roleWeight: number
  shrinkK: number
  normalizer: number
  points: CurvePoint[]
  warnings: string[]
}

export interface DataAuditReport {
  generatedAt: string
  source: 'PlayerMatch'
  readOnly: true
  rankFilter: { gameMode: 'rank' }
  totalRows: number
  rankRows: number
  countsByMode: Record<string, number>
  countsBySeason: Record<string, number>
  uniquePlayers: number
  uniqueMatches: number
  rankUniquePlayers: number
  rankUniqueMatches: number
  roleCounts: Record<RoleTimeCurveRole, number>
  durationBucketCounts: Record<RoleTimeBucketLabel, number>
  roleDurationBucketCounts: Record<RoleTimeCurveRole, Record<RoleTimeBucketLabel, number>>
  missingMetrics: Record<RoleTimeMetric | 'gameDuration' | 'bestWeapon', number>
  unclassifiedRoleCount: number
  playerConcentration: {
    topPlayers: Array<{ uidHash: string; rows: number; share: number }>
    top1Share: number
    top5Share: number
  }
  lowTierIronToPlatinum: {
    uniquePlayers: number
    rows: number
    uniqueMatches: number
    tierCounts: Record<string, number>
  }
  liveCollectedStatus: {
    tierCounts: Record<string, number>
    roleCounts: Record<RoleTimeCurveRole, number>
    tierRoleCounts: Record<string, Record<RoleTimeCurveRole, number>>
  }
  excludedRows: Record<string, number>
  deathDiagnostics: DeathDiagnostics
  survivalDiagnostics: SurvivalDiagnostics
}

export interface DeathDiagnostics {
  byDurationBucket: Record<
    RoleTimeBucketLabel,
    { rows: number; averageDeaths: number; zeroDeathRate: number; diedAtLeastOnceRate: number }
  >
  ratioRiskNote: string
}

export interface SurvivalDiagnostics {
  byRole: Record<
    RoleTimeCurveRole,
    { rows: number; averageDurationMinutes: number; p25: number; p50: number; p75: number; victoryRate: number }
  >
  limitation: string
}

export interface RoleTimeCurveCandidate {
  version: typeof ROLE_TIME_CURVE_VERSION
  status: typeof ROLE_TIME_CURVE_STATUS
  generatedAt: string
  source: 'PlayerMatch'
  runtimeApplied: false
  modes: string[]
  seasons: number[]
  anchorsMinutes: readonly number[]
  metrics: readonly RoleTimeMetric[]
  roles: readonly RoleTimeCurveRole[]
  outlierMethod: 'p95-winsorized-mean'
  shrinkK: number
  normalization: {
    method: string
    targetAverageMultiplier: number
  }
  interpolation: 'linear'
  notes: string[]
  warnings: string[]
  curves: Record<RoleTimeCurveRole, Record<RoleTimeMetric, MetricCurve>>
}

interface MetricBucketSamples {
  valuesByBucket: Record<RoleTimeBucketLabel, number[]>
  roleSampleCount: number
}

export function toCurveRole(role: CharacterGradeRole | null): RoleTimeCurveRole {
  if (role === '평타 브루저' || role === '스증 브루저') return '브루저'
  if (role === '서포터') return '유틸 서포터'
  if (role === '평타 딜러' || role === '스증 딜러' || role === '암살자' || role === '탱커') return role
  return 'unknown'
}

export function classifyDurationBucket(durationSeconds: number | null | undefined): RoleTimeBucketLabel | null {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null
  const minutes = durationSeconds / 60
  if (minutes < 5) return '0-5'
  if (minutes < 10) return '5-10'
  if (minutes < 15) return '10-15'
  if (minutes < 20) return '15-20'
  if (minutes < 25) return '20-25'
  if (minutes < 30) return '25-30'
  return '30+'
}

export function bucketAnchorMinute(bucket: RoleTimeBucketLabel): number {
  switch (bucket) {
    case '0-5':
      return 5
    case '5-10':
      return 10
    case '10-15':
      return 15
    case '15-20':
      return 20
    case '20-25':
      return 25
    case '25-30':
      return 30
    case '30+':
      return 30
  }
}

export function interpolateCurve(points: ReadonlyArray<{ minute: number; value: number }>, minute: number): number {
  if (points.length === 0 || !Number.isFinite(minute)) return 0
  const sorted = [...points].sort((a, b) => a.minute - b.minute)
  if (minute <= sorted[0]!.minute) return sorted[0]!.value
  const last = sorted[sorted.length - 1]!
  if (minute >= last.minute) return last.value
  for (let index = 1; index < sorted.length; index += 1) {
    const right = sorted[index]!
    const left = sorted[index - 1]!
    if (minute <= right.minute) {
      const width = right.minute - left.minute
      if (width <= 0) return right.value
      const t = (minute - left.minute) / width
      return left.value + (right.value - left.value) * t
    }
  }
  return last.value
}

export function winsorizedMean(values: readonly number[], percentile = 0.95): number | null {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (finite.length === 0) return null
  const capIndex = Math.max(0, Math.min(finite.length - 1, Math.ceil(finite.length * percentile) - 1))
  const cap = finite[capIndex]!
  const sum = finite.reduce((acc, value) => acc + Math.min(value, cap), 0)
  return sum / finite.length
}

export function enforceMonotonicIncreasing(
  values: readonly number[],
  weights: readonly number[],
): number[] {
  interface Block {
    start: number
    end: number
    weight: number
    value: number
  }

  const blocks: Block[] = []
  for (let index = 0; index < values.length; index += 1) {
    const weight = Math.max(1, weights[index] ?? 1)
    const value = Number.isFinite(values[index]) ? values[index]! : 0
    blocks.push({ start: index, end: index, weight, value })
    while (blocks.length >= 2) {
      const right = blocks[blocks.length - 1]!
      const left = blocks[blocks.length - 2]!
      if (left.value <= right.value) break
      const mergedWeight = left.weight + right.weight
      const mergedValue = (left.value * left.weight + right.value * right.weight) / mergedWeight
      blocks.splice(blocks.length - 2, 2, {
        start: left.start,
        end: right.end,
        weight: mergedWeight,
        value: mergedValue,
      })
    }
  }

  const output = new Array<number>(values.length).fill(0)
  for (const block of blocks) {
    for (let index = block.start; index <= block.end; index += 1) {
      output[index] = block.value
    }
  }
  return output
}

export function applyRoleGlobalShrinkage(params: {
  roleCurve: readonly number[]
  globalCurve: readonly number[]
  roleSampleCount: number
  shrinkK: number
}): { values: number[]; roleWeight: number; usedGlobalFallback: boolean } {
  const shrinkK = Math.max(1, params.shrinkK)
  const roleSampleCount = Math.max(0, params.roleSampleCount)
  const roleWeight = roleSampleCount / (roleSampleCount + shrinkK)
  const usedGlobalFallback = roleSampleCount === 0
  const values = params.globalCurve.map((globalValue, index) => {
    const roleValue = params.roleCurve[index]
    if (roleValue == null || !Number.isFinite(roleValue)) return globalValue
    return roleValue * roleWeight + globalValue * (1 - roleWeight)
  })
  return { values, roleWeight, usedGlobalFallback }
}

export function safeNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

export function hashUid(uid: string): string {
  return `uid_${createHash('sha256').update(uid).digest('hex').slice(0, 10)}`
}

function emptyBucketRecord<T>(create: () => T): Record<RoleTimeBucketLabel, T> {
  return {
    '0-5': create(),
    '5-10': create(),
    '10-15': create(),
    '15-20': create(),
    '20-25': create(),
    '25-30': create(),
    '30+': create(),
  }
}

function emptyRoleRecord<T>(create: () => T): Record<RoleTimeCurveRole, T> {
  return {
    '평타 딜러': create(),
    '스증 딜러': create(),
    암살자: create(),
    브루저: create(),
    탱커: create(),
    '유틸 서포터': create(),
    unknown: create(),
  }
}

function emptyMetricRecord<T>(create: () => T): Record<RoleTimeMetric, T> {
  return {
    damageToPlayer: create(),
    viewContribution: create(),
    monsterKill: create(),
  }
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount
}

export function resolveRole(row: RoleTimePlayerMatchRow): RoleTimeCurveRole {
  const role = row.bestWeapon != null && row.bestWeapon > 0 ? lookupCharacterWeaponRole(row.characterNum, row.bestWeapon) : null
  return toCurveRole(role)
}

export function quantile(values: readonly number[], q: number): number {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (finite.length === 0) return 0
  const pos = (finite.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const left = finite[base]!
  const right = finite[base + 1]
  return right == null ? left : left + rest * (right - left)
}

function median(values: readonly number[]): number {
  return quantile(values, 0.5)
}

function rankTierKey(row: RoleTimePlayerMatchRow): string {
  if (row.rpAfter == null || !Number.isFinite(row.rpAfter)) return 'unknown'
  return getRankTierFromRp(row.rpAfter, null, row.displaySeasonId).tierNameKo
}

function isIronToPlatinumTier(tierNameKo: string): boolean {
  return ['아이언', '브론즈', '실버', '골드', '플래티넘'].includes(tierNameKo)
}

export function metricValue(row: RoleTimePlayerMatchRow, metric: RoleTimeMetric): number | null {
  const value = row[metric]
  if (value == null || !Number.isFinite(value)) return null
  return value
}

function metricLabel(metric: RoleTimeMetric): string {
  switch (metric) {
    case 'damageToPlayer':
      return '플레이어 피해'
    case 'viewContribution':
      return '시야'
    case 'monsterKill':
      return '야생동물'
  }
}

export function buildDataAudit(rows: readonly RoleTimePlayerMatchRow[]): DataAuditReport {
  const rankRows = rows.filter((row) => row.gameMode === 'rank')
  const countsByMode: Record<string, number> = {}
  const countsBySeason: Record<string, number> = {}
  const roleCounts = emptyRoleRecord(() => 0)
  const durationBucketCounts = emptyBucketRecord(() => 0)
  const roleDurationBucketCounts = emptyRoleRecord(() => emptyBucketRecord(() => 0))
  const missingMetrics: Record<RoleTimeMetric | 'gameDuration' | 'bestWeapon', number> = {
    damageToPlayer: 0,
    viewContribution: 0,
    monsterKill: 0,
    gameDuration: 0,
    bestWeapon: 0,
  }
  const rowsByUid = new Map<string, number>()
  const lowTierPlayers = new Set<string>()
  const lowTierMatches = new Set<string>()
  const lowTierCounts: Record<string, number> = {}
  const liveTierCounts: Record<string, number> = {}
  const liveRoleCounts = emptyRoleRecord(() => 0)
  const tierRoleCounts: Record<string, Record<RoleTimeCurveRole, number>> = {}

  for (const row of rows) {
    increment(countsByMode, row.gameMode)
    increment(countsBySeason, String(row.displaySeasonId))
  }

  for (const row of rankRows) {
    const role = resolveRole(row)
    const bucket = classifyDurationBucket(row.gameDuration)
    const tier = rankTierKey(row)
    roleCounts[role] += 1
    liveRoleCounts[role] += 1
    increment(liveTierCounts, tier)
    if (!tierRoleCounts[tier]) tierRoleCounts[tier] = emptyRoleRecord(() => 0)
    tierRoleCounts[tier]![role] += 1
    rowsByUid.set(row.uid, (rowsByUid.get(row.uid) ?? 0) + 1)
    if (bucket) {
      durationBucketCounts[bucket] += 1
      roleDurationBucketCounts[role][bucket] += 1
    }
    if (row.gameDuration == null || !Number.isFinite(row.gameDuration)) missingMetrics.gameDuration += 1
    if (row.bestWeapon == null || row.bestWeapon <= 0) missingMetrics.bestWeapon += 1
    for (const metric of ROLE_TIME_METRICS) {
      if (metricValue(row, metric) == null) missingMetrics[metric] += 1
    }
    if (isIronToPlatinumTier(tier)) {
      lowTierPlayers.add(row.uid)
      lowTierMatches.add(row.gameId)
      increment(lowTierCounts, tier)
    }
  }

  const topPlayers = [...rowsByUid.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([uid, count]) => ({
      uidHash: hashUid(uid),
      rows: count,
      share: rankRows.length > 0 ? count / rankRows.length : 0,
    }))

  return {
    generatedAt: new Date().toISOString(),
    source: 'PlayerMatch',
    readOnly: true,
    rankFilter: { gameMode: 'rank' },
    totalRows: rows.length,
    rankRows: rankRows.length,
    countsByMode,
    countsBySeason,
    uniquePlayers: new Set(rows.map((row) => row.uid)).size,
    uniqueMatches: new Set(rows.map((row) => row.gameId)).size,
    rankUniquePlayers: new Set(rankRows.map((row) => row.uid)).size,
    rankUniqueMatches: new Set(rankRows.map((row) => row.gameId)).size,
    roleCounts,
    durationBucketCounts,
    roleDurationBucketCounts,
    missingMetrics,
    unclassifiedRoleCount: roleCounts.unknown,
    playerConcentration: {
      topPlayers,
      top1Share: topPlayers[0]?.share ?? 0,
      top5Share: topPlayers.slice(0, 5).reduce((sum, player) => sum + player.share, 0),
    },
    lowTierIronToPlatinum: {
      uniquePlayers: lowTierPlayers.size,
      rows: Object.values(lowTierCounts).reduce((sum, count) => sum + count, 0),
      uniqueMatches: lowTierMatches.size,
      tierCounts: lowTierCounts,
    },
    liveCollectedStatus: {
      tierCounts: liveTierCounts,
      roleCounts: liveRoleCounts,
      tierRoleCounts,
    },
    excludedRows: {
      nonRank: rows.length - rankRows.length,
      missingDuration: missingMetrics.gameDuration,
      missingAllCurveMetrics: rankRows.filter((row) => ROLE_TIME_METRICS.every((metric) => metricValue(row, metric) == null)).length,
      unknownRole: roleCounts.unknown,
    },
    deathDiagnostics: buildDeathDiagnostics(rankRows),
    survivalDiagnostics: buildSurvivalDiagnostics(rankRows),
  }
}

export function chooseShrinkK(rankRows: readonly RoleTimePlayerMatchRow[]): number {
  const counts = Object.values(buildDataAudit(rankRows).roleCounts).filter((count) => count > 0)
  const med = median(counts)
  return Math.max(30, Math.round(med || 30))
}

function buildMetricSamples(rows: readonly RoleTimePlayerMatchRow[]): {
  global: Record<RoleTimeMetric, MetricBucketSamples>
  byRole: Record<RoleTimeCurveRole, Record<RoleTimeMetric, MetricBucketSamples>>
} {
  const makeSamples = (): MetricBucketSamples => ({
    valuesByBucket: emptyBucketRecord(() => []),
    roleSampleCount: 0,
  })
  const global = emptyMetricRecord(makeSamples)
  const byRole = emptyRoleRecord(() => emptyMetricRecord(makeSamples))

  for (const row of rows) {
    if (row.gameMode !== 'rank') continue
    const bucket = classifyDurationBucket(row.gameDuration)
    if (!bucket) continue
    const role = resolveRole(row)
    for (const metric of ROLE_TIME_METRICS) {
      const value = metricValue(row, metric)
      if (value == null || value < 0) continue
      global[metric].valuesByBucket[bucket].push(value)
      global[metric].roleSampleCount += 1
      byRole[role][metric].valuesByBucket[bucket].push(value)
      byRole[role][metric].roleSampleCount += 1
    }
  }

  return { global, byRole }
}

function rawBucketCurve(samples: MetricBucketSamples): { rawValues: number[]; counts: number[] } {
  const bucketsForMinute = (minute: number): RoleTimeBucketLabel[] => {
    if (minute === 30) return ['25-30', '30+']
    const bucket = ROLE_TIME_BUCKET_LABELS.find((candidate) => bucketAnchorMinute(candidate) === minute)
    return bucket ? [bucket] : []
  }
  const rawValues = ROLE_TIME_ANCHORS_MINUTES.map((minute) => {
    if (minute === 0) return 0
    const values = bucketsForMinute(minute).flatMap((bucket) => samples.valuesByBucket[bucket])
    const mean = winsorizedMean(values)
    return mean ?? 0
  })
  const counts = ROLE_TIME_ANCHORS_MINUTES.map((minute) => {
    if (minute === 0) return 1
    return bucketsForMinute(minute).reduce((sum, bucket) => sum + samples.valuesByBucket[bucket].length, 0)
  })
  return { rawValues, counts }
}

function normalizerForCurve(params: {
  rows: readonly RoleTimePlayerMatchRow[]
  role: RoleTimeCurveRole
  metric: RoleTimeMetric
  values: readonly number[]
  allowAllRoles: boolean
}): number {
  const points = ROLE_TIME_ANCHORS_MINUTES.map((minute, index) => ({ minute, value: params.values[index] ?? 0 }))
  const expectedValues: number[] = []
  for (const row of params.rows) {
    if (row.gameMode !== 'rank' || row.gameDuration == null || row.gameDuration <= 0) continue
    if (!params.allowAllRoles && resolveRole(row) !== params.role) continue
    const value = metricValue(row, params.metric)
    if (value == null) continue
    expectedValues.push(interpolateCurve(points, row.gameDuration / 60))
  }
  const meanExpected =
    expectedValues.length > 0
      ? expectedValues.reduce((sum, value) => sum + Math.max(0, value), 0) / expectedValues.length
      : 0
  return meanExpected > 0 ? meanExpected : Math.max(1, params.values[params.values.length - 1] ?? 1)
}

export function buildRoleTimeCurveCandidate(
  rows: readonly RoleTimePlayerMatchRow[],
  options?: { generatedAt?: string; shrinkK?: number },
): RoleTimeCurveCandidate {
  const rankRows = rows.filter((row) => row.gameMode === 'rank')
  const samples = buildMetricSamples(rankRows)
  const shrinkK = options?.shrinkK ?? chooseShrinkK(rankRows)
  const curves = emptyRoleRecord(() => emptyMetricRecord(() => null as unknown as MetricCurve))
  const warnings: string[] = []

  for (const metric of ROLE_TIME_METRICS) {
    const globalRaw = rawBucketCurve(samples.global[metric])
    const globalMonotonic = enforceMonotonicIncreasing(globalRaw.rawValues, globalRaw.counts)

    for (const role of ROLE_TIME_CURVE_ROLES) {
      const roleSamples = samples.byRole[role][metric]
      const roleRaw = rawBucketCurve(roleSamples)
      const roleMonotonic = enforceMonotonicIncreasing(roleRaw.rawValues, roleRaw.counts)
      const shrunk = applyRoleGlobalShrinkage({
        roleCurve: roleMonotonic,
        globalCurve: globalMonotonic,
        roleSampleCount: roleSamples.roleSampleCount,
        shrinkK,
      })
      const normalizer = normalizerForCurve({
        rows: rankRows,
        role,
        metric,
        values: shrunk.values,
        allowAllRoles: shrunk.usedGlobalFallback,
      })
      const metricWarnings: string[] = []
      if (shrunk.usedGlobalFallback) metricWarnings.push('role sample is 0; global curve used')
      if (roleSamples.roleSampleCount < shrinkK) metricWarnings.push('role curve is strongly shrunk toward global')
      const points: CurvePoint[] = ROLE_TIME_ANCHORS_MINUTES.map((minute, index) => {
        const finalValue = safeNumber(shrunk.values[index] ?? 0)
        return {
          minute,
          rawValue: safeNumber(roleRaw.rawValues[index] ?? 0),
          monotonicValue: safeNumber(roleMonotonic[index] ?? 0),
          finalValue,
          normalizedMultiplier: normalizer > 0 ? finalValue / normalizer : 0,
          sampleCount: roleRaw.counts[index] ?? 0,
          usedGlobalFallback: shrunk.usedGlobalFallback,
        }
      })
      curves[role][metric] = {
        metric,
        role,
        roleSampleCount: roleSamples.roleSampleCount,
        globalSampleCount: samples.global[metric].roleSampleCount,
        roleWeight: shrunk.roleWeight,
        shrinkK,
        normalizer,
        points,
        warnings: metricWarnings,
      }
    }
  }

  if (rankRows.length < 500) {
    warnings.push('rank PlayerMatch sample is small; candidate should not replace runtime scoring yet')
  }
  if (rankRows.some((row) => row.gameDuration == null)) {
    warnings.push('some rows lack gameDuration and are excluded from duration-bucket curves')
  }

  return {
    version: ROLE_TIME_CURVE_VERSION,
    status: ROLE_TIME_CURVE_STATUS,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    source: 'PlayerMatch',
    runtimeApplied: false,
    modes: ['rank'],
    seasons: [...new Set(rankRows.map((row) => row.displaySeasonId))].sort((a, b) => a - b),
    anchorsMinutes: ROLE_TIME_ANCHORS_MINUTES,
    metrics: ROLE_TIME_METRICS,
    roles: ROLE_TIME_CURVE_ROLES,
    outlierMethod: 'p95-winsorized-mean',
    shrinkK,
    normalization: {
      method: 'curve values divided by the role/metric average expected value over actual match durations',
      targetAverageMultiplier: 1,
    },
    interpolation: 'linear',
    notes: [
      'Candidate artifact only; no runtime scoring path imports this file.',
      'PlayerMatch stores final cumulative match values, so this is an expected cumulative curve by match end activity time, not a mid-match event log.',
      '18-minute wins use the 18-minute interpolated expected value; match duration is not normalized to 100%.',
      `Metrics: ${ROLE_TIME_METRICS.map(metricLabel).join(', ')}.`,
    ],
    warnings,
    curves,
  }
}

function buildDeathDiagnostics(rows: readonly RoleTimePlayerMatchRow[]): DeathDiagnostics {
  const byDurationBucket = emptyBucketRecord(() => ({
    rows: 0,
    averageDeaths: 0,
    zeroDeathRate: 0,
    diedAtLeastOnceRate: 0,
  }))
  const deathsByBucket = emptyBucketRecord(() => [] as number[])
  for (const row of rows) {
    const bucket = classifyDurationBucket(row.gameDuration)
    if (!bucket || row.deaths == null || !Number.isFinite(row.deaths)) continue
    deathsByBucket[bucket].push(row.deaths)
  }
  for (const bucket of ROLE_TIME_BUCKET_LABELS) {
    const values = deathsByBucket[bucket]
    const rowsCount = values.length
    byDurationBucket[bucket] = {
      rows: rowsCount,
      averageDeaths: rowsCount > 0 ? values.reduce((sum, value) => sum + value, 0) / rowsCount : 0,
      zeroDeathRate: rowsCount > 0 ? values.filter((value) => value === 0).length / rowsCount : 0,
      diedAtLeastOnceRate: rowsCount > 0 ? values.filter((value) => value >= 1).length / rowsCount : 0,
    }
  }
  return {
    byDurationBucket,
    ratioRiskNote: 'Deaths have many 0 values; death ratio scoring can explode or collapse without additive smoothing and is diagnostic-only in this step.',
  }
}

function buildSurvivalDiagnostics(rows: readonly RoleTimePlayerMatchRow[]): SurvivalDiagnostics {
  const durationsByRole = emptyRoleRecord(() => [] as number[])
  const victoriesByRole = emptyRoleRecord(() => 0)
  for (const row of rows) {
    if (row.gameDuration == null || row.gameDuration <= 0) continue
    const role = resolveRole(row)
    durationsByRole[role].push(row.gameDuration / 60)
    if (row.victory) victoriesByRole[role] += 1
  }

  const byRole = emptyRoleRecord(() => ({
    rows: 0,
    averageDurationMinutes: 0,
    p25: 0,
    p50: 0,
    p75: 0,
    victoryRate: 0,
  }))
  for (const role of ROLE_TIME_CURVE_ROLES) {
    const values = durationsByRole[role]
    const rowsCount = values.length
    byRole[role] = {
      rows: rowsCount,
      averageDurationMinutes: rowsCount > 0 ? values.reduce((sum, value) => sum + value, 0) / rowsCount : 0,
      p25: quantile(values, 0.25),
      p50: quantile(values, 0.5),
      p75: quantile(values, 0.75),
      victoryRate: rowsCount > 0 ? victoriesByRole[role] / rowsCount : 0,
    }
  }
  return {
    byRole,
    limitation: 'PlayerMatch has final placement/victory/duration, but no death timestamp or alive-time event log; early elimination vs win survival cannot be modeled without self-reference in this candidate.',
  }
}

export function formatRoleTimeCurveMarkdown(params: {
  audit: DataAuditReport
  candidate: RoleTimeCurveCandidate
  collector?: CollectorAuditReport
}): string {
  const { audit, candidate, collector } = params
  const lines: string[] = []
  lines.push('# 39.18 Role Time Curve Candidate')
  lines.push('')
  lines.push(`Generated: ${candidate.generatedAt}`)
  lines.push('')
  lines.push('## Scope')
  lines.push('- Source: local PlayerMatch DB only.')
  lines.push('- Status: candidate; runtimeApplied=false.')
  lines.push('- Production match/character/overall/team-luck scoring paths are not changed.')
  lines.push('- External API calls, DAK.GG crawling, scheduler activation, and DB writes are not part of this generator.')
  lines.push('')
  lines.push('## Data Audit')
  lines.push(`- Total rows: ${audit.totalRows}`)
  lines.push(`- Rank rows: ${audit.rankRows}`)
  lines.push(`- Unique rank players: ${audit.rankUniquePlayers}`)
  lines.push(`- Unique rank matches: ${audit.rankUniqueMatches}`)
  lines.push(`- Mode counts: ${JSON.stringify(audit.countsByMode)}`)
  lines.push(`- Season counts: ${JSON.stringify(audit.countsBySeason)}`)
  lines.push(`- Iron~Platinum players: ${audit.lowTierIronToPlatinum.uniquePlayers}`)
  lines.push(`- Iron~Platinum rows: ${audit.lowTierIronToPlatinum.rows}`)
  lines.push('')
  lines.push('## Live Collected Status (Local DB)')
  lines.push(`- Tier counts: ${JSON.stringify(audit.liveCollectedStatus.tierCounts)}`)
  lines.push(`- Role counts: ${JSON.stringify(audit.liveCollectedStatus.roleCounts)}`)
  lines.push('')
  lines.push('## Duration Buckets')
  for (const bucket of ROLE_TIME_BUCKET_LABELS) {
    lines.push(`- ${bucket}: ${audit.durationBucketCounts[bucket]}`)
  }
  lines.push('')
  lines.push('## Missing Metrics')
  for (const [key, value] of Object.entries(audit.missingMetrics)) {
    lines.push(`- ${key}: ${value}`)
  }
  lines.push('')
  lines.push('## Curve Settings')
  lines.push(`- Anchors: ${candidate.anchorsMinutes.join(', ')} minutes`)
  lines.push(`- Outlier method: ${candidate.outlierMethod}`)
  lines.push(`- Monotonic correction: weighted isotonic regression (pool adjacent violators).`)
  lines.push(`- shrinkK: ${candidate.shrinkK}`)
  lines.push(`- Interpolation: ${candidate.interpolation}`)
  lines.push('')
  lines.push('## Candidate Curves')
  for (const role of ROLE_TIME_CURVE_ROLES) {
    lines.push(`### ${role}`)
    for (const metric of ROLE_TIME_METRICS) {
      const curve = candidate.curves[role][metric]
      const values = curve.points.map((point) => `${point.minute}m=${point.finalValue.toFixed(2)} (${point.sampleCount})`)
      lines.push(`- ${metric}: ${values.join(', ')}; roleWeight=${curve.roleWeight.toFixed(3)}`)
    }
  }
  lines.push('')
  lines.push('## Death Diagnostics')
  for (const bucket of ROLE_TIME_BUCKET_LABELS) {
    const row = audit.deathDiagnostics.byDurationBucket[bucket]
    lines.push(`- ${bucket}: rows=${row.rows}, avgDeaths=${row.averageDeaths.toFixed(2)}, zeroDeathRate=${(row.zeroDeathRate * 100).toFixed(1)}%, diedRate=${(row.diedAtLeastOnceRate * 100).toFixed(1)}%`)
  }
  lines.push(`- Note: ${audit.deathDiagnostics.ratioRiskNote}`)
  lines.push('')
  lines.push('## Survival Diagnostics')
  for (const role of ROLE_TIME_CURVE_ROLES) {
    const row = audit.survivalDiagnostics.byRole[role]
    lines.push(`- ${role}: rows=${row.rows}, avg=${row.averageDurationMinutes.toFixed(2)}m, p50=${row.p50.toFixed(2)}m, victoryRate=${(row.victoryRate * 100).toFixed(1)}%`)
  }
  lines.push(`- Limitation: ${audit.survivalDiagnostics.limitation}`)
  if (collector) {
    lines.push('')
    lines.push('## Collector Audit Dry Run')
    lines.push(`- Automatic job exists: ${collector.automaticJobExists}`)
    lines.push(`- Candidate DB players: ${collector.candidatePlayers}`)
    lines.push(`- Incremental collection possible: ${collector.incrementalCollectionPossible}`)
    lines.push(`- Existing-player loop limitation: ${collector.limitations.join(' ')}`)
  }
  return `${lines.join('\n')}\n`
}

export interface CollectorAuditReport {
  generatedAt: string
  readOnly: true
  externalApiCalls: 0
  dbWrites: 0
  automaticJobExists: boolean
  automaticJobSummary: string
  candidatePlayers: number
  playerMatchRows: number
  playersWithNicknameBinding: number
  latestSavedMatchAt: string | null
  incrementalCollectionPossible: boolean
  estimatedDailyApiCalls: Record<'50' | '100' | '500', { minimumUserGamesCalls: number; conservativeTwoPageCalls: number }>
  limitations: string[]
}
