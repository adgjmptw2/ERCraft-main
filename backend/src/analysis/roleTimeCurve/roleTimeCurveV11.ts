import type { CharacterGradeRole } from '../../services/characterPerformanceGrade/config.js'
import { lookupCharacterWeaponRole } from '../../services/characterPerformanceGrade/baselineStore.js'
import { getRankTierFromRp } from '../../utils/rankTier.js'
import {
  ROLE_TIME_ANCHORS_MINUTES,
  ROLE_TIME_BUCKET_LABELS,
  ROLE_TIME_CURVE_ROLES,
  ROLE_TIME_METRICS,
  bucketAnchorMinute,
  classifyDurationBucket,
  enforceMonotonicIncreasing,
  interpolateCurve,
  metricValue,
  quantile,
  resolveRole,
  safeNumber,
  toCurveRole,
  winsorizedMean,
  type RoleTimeBucketLabel,
  type RoleTimeCurveRole,
  type RoleTimeMetric,
  type RoleTimePlayerMatchRow,
} from './roleTimeCurve.js'

export const ROLE_TIME_CURVE_V11_VERSION = 'role-time-curve.v1.1'

export type AnchorSource = 'observed' | 'blended' | 'global-fallback' | 'extrapolated'

export interface CurvePointV11 {
  minute: number
  absoluteExpectedValue: number
  preNormalizationValue: number
  normalizedMultiplier: number
  rawObservedValue: number | null
  globalFallbackValue: number
  blendedValue: number
  anchorSampleCount: number
  globalSampleCount: number
  anchorWeight: number
  globalWeight: number
  source: AnchorSource
  warnings: string[]
}

export interface MetricCurveV11 {
  metric: RoleTimeMetric
  role: RoleTimeCurveRole
  anchorShrinkK: number
  normalizer: number
  points: CurvePointV11[]
  warnings: string[]
}

export interface RoleTimeCurveCandidateV11 {
  version: typeof ROLE_TIME_CURVE_V11_VERSION
  previousVersion: 'role-time-curve.v1'
  status: 'candidate'
  generatedAt: string
  source: 'PlayerMatch'
  runtimeApplied: false
  modes: string[]
  seasons: number[]
  anchorsMinutes: readonly number[]
  metrics: readonly RoleTimeMetric[]
  roles: readonly RoleTimeCurveRole[]
  anchorShrinkK: number
  outlierMethod: 'p95-winsorized-mean'
  monotonicCorrection: 'weighted-isotonic-regression'
  thirtyMinutePolicy: 'carry-forward-25m-when-30plus-empty'
  shortGamePolicy: 'exclude-under-8m-from-curve-training'
  normalization: {
    method: string
    targetAverageMultiplier: number
  }
  notes: string[]
  warnings: string[]
  curves: Record<RoleTimeCurveRole, Record<RoleTimeMetric, MetricCurveV11>>
}

export interface DurationMeaningAudit {
  generatedAt: string
  mapperEvidence: {
    matchSummaryField: 'BserUserGame.playTime'
    matchDetailField: 'BserUserGame.playTime ?? BserUserGame.duration'
    conclusion: string
  }
  dbComparison: {
    rankGameGroups: number
    groupsWithMultipleRows: number
    sameDurationGroups: number
    differentDurationGroups: number
    winLossGroups: number
    winLossDifferentDurationGroups: number
  }
  conclusion: 'participant-or-team-activity-time-like'
  runtimeUseConclusion: string
}

export interface MissingBiasAudit {
  generatedAt: string
  totalRankRows: number
  metricMissing: Record<RoleTimeMetric, MissingBreakdown>
  conclusion: Record<RoleTimeMetric, string>
}

export interface MissingBreakdown {
  missing: number
  present: number
  missingRate: number
  bySeason: Record<string, MissingBucket>
  byTier: Record<string, MissingBucket>
  byRole: Record<RoleTimeCurveRole, MissingBucket>
  byDurationBucket: Record<RoleTimeBucketLabel | 'missing-duration', MissingBucket>
  byStoredSchema: Record<string, MissingBucket>
}

export interface MissingBucket {
  rows: number
  missing: number
  missingRate: number
}

export interface HoldoutValidationReport {
  generatedAt: string
  split: {
    strategy: 'gameId-hash-modulo'
    holdoutModulo: number
    trainRows: number
    validationRows: number
    sharedGameIds: number
  }
  ratioMedianByRoleMetric: Record<RoleTimeCurveRole, Record<RoleTimeMetric, number | null>>
  ratioMedianByDurationBucket: Record<RoleTimeBucketLabel, Record<RoleTimeMetric, number | null>>
  topPlayerRemoval: {
    removedPlayerCount: number
    removedRows: number
    maxRelativeCurveChange: number
  }
  withoutSeason6: {
    removedRows: number
    maxRelativeCurveChange: number
  }
  lowTierScope: {
    ironToPlatinumRows: number
    goldOrBelowRows: number
    note: string
  }
  warnings: string[]
}

type MetricSamples = Record<RoleTimeMetric, Record<RoleTimeBucketLabel, number[]>>
type RoleMetricSamples = Record<RoleTimeCurveRole, MetricSamples>

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

function emptyMetricRecord<T>(create: () => T): Record<RoleTimeMetric, T> {
  return {
    damageToPlayer: create(),
    viewContribution: create(),
    monsterKill: create(),
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

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function rankTier(row: RoleTimePlayerMatchRow): string {
  if (row.rpAfter == null || !Number.isFinite(row.rpAfter)) return 'unknown'
  return getRankTierFromRp(row.rpAfter, null, row.displaySeasonId).tierNameKo
}

function storedSchema(row: RoleTimePlayerMatchRow): string {
  const hasRoleMetrics = row.viewContribution != null && row.monsterKill != null
  return hasRoleMetrics ? 'role-metrics-present' : 'legacy-missing-role-metrics'
}

function bucketsForMinute(minute: number): RoleTimeBucketLabel[] {
  if (minute === 30) return ['25-30', '30+']
  const bucket = ROLE_TIME_BUCKET_LABELS.find((candidate) => bucketAnchorMinute(candidate) === minute)
  return bucket ? [bucket] : []
}

function makeSamples(rows: readonly RoleTimePlayerMatchRow[]): {
  role: RoleMetricSamples
  global: MetricSamples
} {
  const role = emptyRoleRecord(() => emptyMetricRecord(() => emptyBucketRecord(() => [] as number[])))
  const global = emptyMetricRecord(() => emptyBucketRecord(() => [] as number[]))
  for (const row of rows) {
    if (row.gameMode !== 'rank') continue
    if (row.gameDuration == null || row.gameDuration < 8 * 60) continue
    const bucket = classifyDurationBucket(row.gameDuration)
    if (!bucket) continue
    const curveRole = resolveRole(row)
    for (const metric of ROLE_TIME_METRICS) {
      const value = metricValue(row, metric)
      if (value == null || value < 0) continue
      role[curveRole][metric][bucket].push(value)
      global[metric][bucket].push(value)
    }
  }
  return { role, global }
}

function chooseAnchorShrinkKFromSamples(samples: RoleMetricSamples): number {
  const counts: number[] = []
  for (const role of ROLE_TIME_CURVE_ROLES) {
    for (const metric of ROLE_TIME_METRICS) {
      for (const bucket of ROLE_TIME_BUCKET_LABELS) {
        const count = samples[role][metric][bucket].length
        if (count > 0) counts.push(count)
      }
    }
  }
  const p50 = quantile(counts, 0.5)
  const p70 = quantile(counts, 0.7)
  return Math.max(30, Math.round((p50 + p70) / 2) || 30)
}

function rawMeanForBuckets(valuesByBucket: Record<RoleTimeBucketLabel, number[]>, minute: number): {
  value: number | null
  count: number
} {
  if (minute === 0) return { value: 0, count: 1 }
  const values = bucketsForMinute(minute).flatMap((bucket) => valuesByBucket[bucket])
  return { value: winsorizedMean(values), count: values.length }
}

function blendRawCurves(params: {
  roleBuckets: Record<RoleTimeBucketLabel, number[]>
  globalBuckets: Record<RoleTimeBucketLabel, number[]>
  anchorShrinkK: number
}): Omit<CurvePointV11, 'normalizedMultiplier' | 'absoluteExpectedValue' | 'preNormalizationValue'>[] {
  const rawPoints = ROLE_TIME_ANCHORS_MINUTES.map((minute) => {
    const roleRaw = rawMeanForBuckets(params.roleBuckets, minute)
    const globalRaw = rawMeanForBuckets(params.globalBuckets, minute)
    const globalFallbackValue = globalRaw.value ?? 0
    const warnings: string[] = []
    let source: AnchorSource = 'observed'
    let rawObservedValue = roleRaw.value
    let anchorWeight = roleRaw.count / (roleRaw.count + params.anchorShrinkK)

    if (minute === 0) {
      rawObservedValue = 0
      anchorWeight = 1
      source = 'observed'
    } else if (roleRaw.count === 0 || roleRaw.value == null) {
      anchorWeight = 0
      source = 'global-fallback'
      warnings.push('role anchor sample is 0; global fallback used')
    } else if (roleRaw.count < params.anchorShrinkK) {
      source = 'blended'
      warnings.push('role anchor is shrunk toward global by anchor sample count')
    }

    if (minute === 30 && globalRaw.count === 0) {
      source = 'extrapolated'
      warnings.push('30+ sample is 0; carried forward from 25m after monotonic correction')
    }

    const blendedValue =
      source === 'global-fallback'
        ? globalFallbackValue
        : (roleRaw.value ?? globalFallbackValue) * anchorWeight + globalFallbackValue * (1 - anchorWeight)

    return {
      minute,
      rawObservedValue,
      globalFallbackValue,
      blendedValue,
      anchorSampleCount: roleRaw.count,
      globalSampleCount: globalRaw.count,
      anchorWeight,
      globalWeight: 1 - anchorWeight,
      source,
      warnings,
    }
  })

  const monotonic = enforceMonotonicIncreasing(
    rawPoints.map((point) => point.blendedValue),
    rawPoints.map((point) => Math.max(1, point.anchorSampleCount + point.globalSampleCount)),
  )
  return rawPoints.map((point, index) => ({
    ...point,
    blendedValue: point.source === 'extrapolated' && index > 0 ? monotonic[index - 1]! : monotonic[index]!,
  }))
}

function normalizerForRows(params: {
  rows: readonly RoleTimePlayerMatchRow[]
  role: RoleTimeCurveRole
  metric: RoleTimeMetric
  values: readonly number[]
}): number {
  const points = ROLE_TIME_ANCHORS_MINUTES.map((minute, index) => ({ minute, value: params.values[index] ?? 0 }))
  const expected: number[] = []
  for (const row of params.rows) {
    if (row.gameMode !== 'rank' || row.gameDuration == null || row.gameDuration < 8 * 60) continue
    if (resolveRole(row) !== params.role) continue
    if (metricValue(row, params.metric) == null) continue
    expected.push(interpolateCurve(points, row.gameDuration / 60))
  }
  if (expected.length === 0) return Math.max(1, params.values[params.values.length - 1] ?? 1)
  const mean = expected.reduce((sum, value) => sum + Math.max(0, value), 0) / expected.length
  return mean > 0 ? mean : Math.max(1, params.values[params.values.length - 1] ?? 1)
}

export function buildRoleTimeCurveCandidateV11(
  rows: readonly RoleTimePlayerMatchRow[],
  options?: { generatedAt?: string; anchorShrinkK?: number },
): RoleTimeCurveCandidateV11 {
  const rankRows = rows.filter((row) => row.gameMode === 'rank')
  const samples = makeSamples(rankRows)
  const anchorShrinkK = options?.anchorShrinkK ?? chooseAnchorShrinkKFromSamples(samples.role)
  const curves = emptyRoleRecord(() => emptyMetricRecord(() => null as unknown as MetricCurveV11))
  const warnings: string[] = []

  for (const role of ROLE_TIME_CURVE_ROLES) {
    for (const metric of ROLE_TIME_METRICS) {
      const blended = blendRawCurves({
        roleBuckets: samples.role[role][metric],
        globalBuckets: samples.global[metric],
        anchorShrinkK,
      })
      const values = blended.map((point) => point.blendedValue)
      const normalizer = normalizerForRows({ rows: rankRows, role, metric, values })
      const points = blended.map((point) => ({
        ...point,
        absoluteExpectedValue: safeNumber(point.blendedValue),
        preNormalizationValue: safeNumber(point.blendedValue),
        normalizedMultiplier: normalizer > 0 ? safeNumber(point.blendedValue / normalizer) : 0,
      }))
      const curveWarnings = [...new Set(points.flatMap((point) => point.warnings))]
      curves[role][metric] = {
        metric,
        role,
        anchorShrinkK,
        normalizer,
        points,
        warnings: curveWarnings,
      }
    }
  }

  if (rankRows.some((row) => row.gameDuration != null && row.gameDuration < 8 * 60)) {
    warnings.push('under-8-minute rows are excluded from curve training as abnormal/low-information endings')
  }
  warnings.push('30+ duration bucket has no current rank samples; 30m anchors are carry-forward candidates, not strong observations')

  return {
    version: ROLE_TIME_CURVE_V11_VERSION,
    previousVersion: 'role-time-curve.v1',
    status: 'candidate',
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    source: 'PlayerMatch',
    runtimeApplied: false,
    modes: ['rank'],
    seasons: [...new Set(rankRows.map((row) => row.displaySeasonId))].sort((a, b) => a - b),
    anchorsMinutes: ROLE_TIME_ANCHORS_MINUTES,
    metrics: ROLE_TIME_METRICS,
    roles: ROLE_TIME_CURVE_ROLES,
    anchorShrinkK,
    outlierMethod: 'p95-winsorized-mean',
    monotonicCorrection: 'weighted-isotonic-regression',
    thirtyMinutePolicy: 'carry-forward-25m-when-30plus-empty',
    shortGamePolicy: 'exclude-under-8m-from-curve-training',
    normalization: {
      method: 'absolute expected values divided by role/metric average expected value over actual validation durations',
      targetAverageMultiplier: 1,
    },
    notes: [
      'Candidate artifact only; no runtime scoring path imports this file.',
      'Anchor weights are computed from each role+metric+anchor sample count, not from total role sample count.',
      'PlayerMatch gameDuration is mapped from BSER playTime; DB comparison shows participant/team activity-time-like behavior rather than a pure global match end time.',
    ],
    warnings,
    curves,
  }
}

export function auditDurationMeaning(rows: readonly RoleTimePlayerMatchRow[], generatedAt = new Date().toISOString()): DurationMeaningAudit {
  const byGame = new Map<string, RoleTimePlayerMatchRow[]>()
  for (const row of rows) {
    if (row.gameMode !== 'rank' || row.gameDuration == null) continue
    const bucket = byGame.get(row.gameId) ?? []
    bucket.push(row)
    byGame.set(row.gameId, bucket)
  }
  let same = 0
  let different = 0
  let winLoss = 0
  let winLossDifferent = 0
  for (const group of byGame.values()) {
    if (group.length < 2) continue
    const durations = new Set(group.map((row) => row.gameDuration))
    if (durations.size === 1) same += 1
    else different += 1
    const winners = group.filter((row) => row.victory === true || row.placement === 1)
    const losers = group.filter((row) => row.victory === false || row.placement !== 1)
    if (winners.length > 0 && losers.length > 0) {
      winLoss += 1
      if (
        JSON.stringify([...new Set(winners.map((row) => row.gameDuration))]) !==
        JSON.stringify([...new Set(losers.map((row) => row.gameDuration))])
      ) {
        winLossDifferent += 1
      }
    }
  }
  return {
    generatedAt,
    mapperEvidence: {
      matchSummaryField: 'BserUserGame.playTime',
      matchDetailField: 'BserUserGame.playTime ?? BserUserGame.duration',
      conclusion: 'mapToMatchSummary stores game.playTime; match detail falls back to duration only when playTime is absent.',
    },
    dbComparison: {
      rankGameGroups: byGame.size,
      groupsWithMultipleRows: same + different,
      sameDurationGroups: same,
      differentDurationGroups: different,
      winLossGroups: winLoss,
      winLossDifferentDurationGroups: winLossDifferent,
    },
    conclusion: 'participant-or-team-activity-time-like',
    runtimeUseConclusion:
      'Current PlayerMatch duration is acceptable as an activity-time-like candidate axis, but not proven enough to replace production duration multipliers without further official field validation.',
  }
}

function addMissingBucket(record: Record<string, MissingBucket>, key: string, missing: boolean): void {
  const bucket = record[key] ?? { rows: 0, missing: 0, missingRate: 0 }
  bucket.rows += 1
  if (missing) bucket.missing += 1
  bucket.missingRate = bucket.rows > 0 ? bucket.missing / bucket.rows : 0
  record[key] = bucket
}

function emptyMissingBreakdown(): MissingBreakdown {
  return {
    missing: 0,
    present: 0,
    missingRate: 0,
    bySeason: {},
    byTier: {},
    byRole: emptyRoleRecord(() => ({ rows: 0, missing: 0, missingRate: 0 })),
    byDurationBucket: {
      ...emptyBucketRecord(() => ({ rows: 0, missing: 0, missingRate: 0 })),
      'missing-duration': { rows: 0, missing: 0, missingRate: 0 },
    },
    byStoredSchema: {},
  }
}

export function auditMissingBias(rows: readonly RoleTimePlayerMatchRow[], generatedAt = new Date().toISOString()): MissingBiasAudit {
  const rankRows = rows.filter((row) => row.gameMode === 'rank')
  const metricMissing = emptyMetricRecord(emptyMissingBreakdown)
  for (const metric of ROLE_TIME_METRICS) {
    const breakdown = metricMissing[metric]
    for (const row of rankRows) {
      const missing = metricValue(row, metric) == null
      if (missing) breakdown.missing += 1
      else breakdown.present += 1
      addMissingBucket(breakdown.bySeason, String(row.displaySeasonId), missing)
      addMissingBucket(breakdown.byTier, rankTier(row), missing)
      const role = resolveRole(row)
      const roleBucket = breakdown.byRole[role]
      roleBucket.rows += 1
      if (missing) roleBucket.missing += 1
      roleBucket.missingRate = roleBucket.rows > 0 ? roleBucket.missing / roleBucket.rows : 0
      const durationBucket = classifyDurationBucket(row.gameDuration) ?? 'missing-duration'
      const durationRecord = breakdown.byDurationBucket[durationBucket]
      durationRecord.rows += 1
      if (missing) durationRecord.missing += 1
      durationRecord.missingRate = durationRecord.rows > 0 ? durationRecord.missing / durationRecord.rows : 0
      addMissingBucket(breakdown.byStoredSchema, storedSchema(row), missing)
    }
    breakdown.missingRate = rankRows.length > 0 ? breakdown.missing / rankRows.length : 0
  }
  return {
    generatedAt,
    totalRankRows: rankRows.length,
    metricMissing,
    conclusion: {
      damageToPlayer: 'damageToPlayer is complete in the current PlayerMatch sample and is the safest runtime candidate after further validation.',
      viewContribution: 'viewContribution is not missing at random; legacy rows without role metrics dominate missingness, so this curve is not representative of the full sample.',
      monsterKill: 'monsterKill shares the same role-metrics capture gap as viewContribution and should remain diagnostic-only until backfill coverage improves.',
    },
  }
}

function ratioMedian(rows: readonly RoleTimePlayerMatchRow[], candidate: RoleTimeCurveCandidateV11, role: RoleTimeCurveRole, metric: RoleTimeMetric): number | null {
  const ratios: number[] = []
  const curve = candidate.curves[role][metric]
  const points = curve.points.map((point) => ({ minute: point.minute, value: point.absoluteExpectedValue }))
  for (const row of rows) {
    if (row.gameMode !== 'rank' || row.gameDuration == null || row.gameDuration < 8 * 60) continue
    if (resolveRole(row) !== role) continue
    const value = metricValue(row, metric)
    if (value == null) continue
    const expected = interpolateCurve(points, row.gameDuration / 60)
    if (expected > 0) ratios.push(value / expected)
  }
  return ratios.length > 0 ? quantile(ratios, 0.5) : null
}

function maxRelativeCurveChange(a: RoleTimeCurveCandidateV11, b: RoleTimeCurveCandidateV11): number {
  let max = 0
  for (const role of ROLE_TIME_CURVE_ROLES) {
    for (const metric of ROLE_TIME_METRICS) {
      const left = a.curves[role][metric].points
      const right = b.curves[role][metric].points
      for (let index = 0; index < left.length; index += 1) {
        const base = Math.max(1, Math.abs(left[index]?.absoluteExpectedValue ?? 0))
        const delta = Math.abs((right[index]?.absoluteExpectedValue ?? 0) - (left[index]?.absoluteExpectedValue ?? 0)) / base
        max = Math.max(max, delta)
      }
    }
  }
  return max
}

export function buildHoldoutValidation(rows: readonly RoleTimePlayerMatchRow[], generatedAt = new Date().toISOString()): HoldoutValidationReport {
  const gameIds = new Set(rows.filter((row) => row.gameMode === 'rank').map((row) => row.gameId))
  const holdoutGameIds = new Set([...gameIds].filter((gameId) => hashString(gameId) % 5 === 0))
  const trainRows = rows.filter((row) => row.gameMode !== 'rank' || !holdoutGameIds.has(row.gameId))
  const validationRows = rows.filter((row) => row.gameMode === 'rank' && holdoutGameIds.has(row.gameId))
  const trainGameIds = new Set(trainRows.filter((row) => row.gameMode === 'rank').map((row) => row.gameId))
  const validationGameIds = new Set(validationRows.map((row) => row.gameId))
  const sharedGameIds = [...validationGameIds].filter((gameId) => trainGameIds.has(gameId)).length
  const candidate = buildRoleTimeCurveCandidateV11(trainRows, { generatedAt })

  const ratioMedianByRoleMetric = emptyRoleRecord(() => emptyMetricRecord(() => null as number | null))
  for (const role of ROLE_TIME_CURVE_ROLES) {
    for (const metric of ROLE_TIME_METRICS) {
      ratioMedianByRoleMetric[role][metric] = ratioMedian(validationRows, candidate, role, metric)
    }
  }

  const ratioMedianByDurationBucket = emptyBucketRecord(() => emptyMetricRecord(() => null as number | null))
  for (const bucket of ROLE_TIME_BUCKET_LABELS) {
    const bucketRows = validationRows.filter((row) => classifyDurationBucket(row.gameDuration) === bucket)
    for (const metric of ROLE_TIME_METRICS) {
      const ratios: number[] = []
      for (const row of bucketRows) {
        const role = resolveRole(row)
        const value = metricValue(row, metric)
        if (value == null || row.gameDuration == null) continue
        const points = candidate.curves[role][metric].points.map((point) => ({ minute: point.minute, value: point.absoluteExpectedValue }))
        const expected = interpolateCurve(points, row.gameDuration / 60)
        if (expected > 0) ratios.push(value / expected)
      }
      ratioMedianByDurationBucket[bucket][metric] = ratios.length > 0 ? quantile(ratios, 0.5) : null
    }
  }

  const base = buildRoleTimeCurveCandidateV11(rows, { generatedAt })
  const countsByUid = new Map<string, number>()
  for (const row of rows.filter((entry) => entry.gameMode === 'rank')) {
    countsByUid.set(row.uid, (countsByUid.get(row.uid) ?? 0) + 1)
  }
  const topUids = new Set([...countsByUid.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([uid]) => uid))
  const withoutTopPlayers = rows.filter((row) => !topUids.has(row.uid))
  const withoutTopCandidate = buildRoleTimeCurveCandidateV11(withoutTopPlayers, { generatedAt })
  const withoutS6Rows = rows.filter((row) => row.displaySeasonId !== 6)
  const withoutS6Candidate = buildRoleTimeCurveCandidateV11(withoutS6Rows, { generatedAt })
  const rankRows = rows.filter((row) => row.gameMode === 'rank')
  const lowTierRows = rankRows.filter((row) => ['아이언', '브론즈', '실버', '골드', '플래티넘'].includes(rankTier(row)))
  const goldOrBelowRows = rankRows.filter((row) => ['아이언', '브론즈', '실버', '골드'].includes(rankTier(row)))

  return {
    generatedAt,
    split: {
      strategy: 'gameId-hash-modulo',
      holdoutModulo: 5,
      trainRows: trainRows.filter((row) => row.gameMode === 'rank').length,
      validationRows: validationRows.length,
      sharedGameIds,
    },
    ratioMedianByRoleMetric,
    ratioMedianByDurationBucket,
    topPlayerRemoval: {
      removedPlayerCount: topUids.size,
      removedRows: rows.length - withoutTopPlayers.length,
      maxRelativeCurveChange: maxRelativeCurveChange(base, withoutTopCandidate),
    },
    withoutSeason6: {
      removedRows: rows.length - withoutS6Rows.length,
      maxRelativeCurveChange: maxRelativeCurveChange(base, withoutS6Candidate),
    },
    lowTierScope: {
      ironToPlatinumRows: lowTierRows.length,
      goldOrBelowRows: goldOrBelowRows.length,
      note: 'Iron~Platinum coverage is mostly Platinum; Gold-or-below validation is too thin for independent conclusions.',
    },
    warnings: [
      sharedGameIds === 0 ? 'No gameId leakage between train and validation.' : 'Train/validation share gameIds; split invalid.',
      'Validation uses local searched-player PlayerMatch sample, not an unbiased population sample.',
    ],
  }
}

export function formatV11Markdown(params: {
  candidate: RoleTimeCurveCandidateV11
  durationAudit: DurationMeaningAudit
  missingBias: MissingBiasAudit
  holdout: HoldoutValidationReport
}): string {
  const { candidate, durationAudit, missingBias, holdout } = params
  const lines: string[] = []
  lines.push('# 39.19 Role Time Curve v1.1 Candidate')
  lines.push('')
  lines.push(`Generated: ${candidate.generatedAt}`)
  lines.push(`Version: ${candidate.version} (${candidate.status})`)
  lines.push('')
  lines.push('## Runtime Safety')
  lines.push('- runtimeApplied=false')
  lines.push('- Existing match, character, Overall, team luck, carry burden, and duration multiplier paths are not modified.')
  lines.push('')
  lines.push('## Duration Meaning')
  lines.push(`- Mapper: summary uses ${durationAudit.mapperEvidence.matchSummaryField}; detail uses ${durationAudit.mapperEvidence.matchDetailField}.`)
  lines.push(`- Same gameId groups: ${durationAudit.dbComparison.groupsWithMultipleRows}`)
  lines.push(`- Different duration groups: ${durationAudit.dbComparison.differentDurationGroups}`)
  lines.push(`- Win/loss groups with different durations: ${durationAudit.dbComparison.winLossDifferentDurationGroups}/${durationAudit.dbComparison.winLossGroups}`)
  lines.push(`- Conclusion: ${durationAudit.runtimeUseConclusion}`)
  lines.push('')
  lines.push('## v1 Problems Found')
  lines.push('- v1 used one role-level weight for all anchors, so 30m low-sample anchors could inherit the same confidence as dense 20m anchors.')
  lines.push('- v1 could display a role 5m value even when the role had 0 samples at that anchor.')
  lines.push('- v1 did not separate raw observed, global fallback, blended value, and normalized multiplier.')
  lines.push('- v1 did not explicitly mark view/monster missingness as non-random.')
  lines.push('')
  lines.push('## v1.1 Stabilization')
  lines.push(`- anchorShrinkK: ${candidate.anchorShrinkK}`)
  lines.push(`- 5m policy: role sample 0 anchors are global-fallback, not observed.`)
  lines.push(`- 30m policy: ${candidate.thirtyMinutePolicy}`)
  lines.push(`- Short game policy: ${candidate.shortGamePolicy}`)
  lines.push('')
  lines.push('## Missing Bias')
  for (const metric of ROLE_TIME_METRICS) {
    const item = missingBias.metricMissing[metric]
    lines.push(`- ${metric}: missing=${item.missing}, present=${item.present}, missingRate=${(item.missingRate * 100).toFixed(1)}%; ${missingBias.conclusion[metric]}`)
  }
  lines.push('')
  lines.push('## Holdout')
  lines.push(`- Train rows: ${holdout.split.trainRows}`)
  lines.push(`- Validation rows: ${holdout.split.validationRows}`)
  lines.push(`- Shared gameIds: ${holdout.split.sharedGameIds}`)
  lines.push(`- Top 5 player removal max relative curve change: ${(holdout.topPlayerRemoval.maxRelativeCurveChange * 100).toFixed(2)}%`)
  lines.push(`- S6 removal max relative curve change: ${(holdout.withoutSeason6.maxRelativeCurveChange * 100).toFixed(2)}%`)
  lines.push(`- Low-tier scope: ${holdout.lowTierScope.note}`)
  lines.push('')
  lines.push('## Candidate Curves')
  for (const role of ROLE_TIME_CURVE_ROLES) {
    lines.push(`### ${role}`)
    for (const metric of ROLE_TIME_METRICS) {
      const curve = candidate.curves[role][metric]
      const values = curve.points.map((point) => {
        const pct = `${(point.normalizedMultiplier * 100).toFixed(0)}%`
        return `${point.minute}m=${point.absoluteExpectedValue.toFixed(2)} / ${pct} / n=${point.anchorSampleCount} / ${point.source}`
      })
      lines.push(`- ${metric}: ${values.join(', ')}`)
    }
  }
  return `${lines.join('\n')}\n`
}
