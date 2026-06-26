import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatComboDisplayName } from '../utils/comboDisplayName.js'
import { CURRENT_DISPLAY_SEASON } from '../utils/seasonRankTierLadder.js'
import { lookupCharacterWeaponRole } from '../services/characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../services/characterPerformanceGrade/tierKey.js'
import { getRankTierFromRp } from '../utils/rankTier.js'
import {
  resolveEffectiveReadiness,
  type EffectiveReadinessLevel,
} from './roleMetricCalibration.js'
import { isHealerSupportCombo } from '../services/characterPerformanceGrade/supportSubtype.js'
import {
  computeMetricP90,
  computeTankingEfficiencyValue,
  resolveLiveMetricEligibility,
  runMetricBootstrap,
  runTrainValidationStability,
  type BootstrapResult,
  type LiveEligibilityFlags,
  type TrainValidationResult,
} from './roleMetricStability.js'

export const ROLE_METRIC_BASELINE_VERSION = 1
export const CONTINUOUS_BASELINE_METRICS = [
  'damageFromPlayer',
  'ccTimeToPlayer',
  'viewContribution',
  'monsterKill',
] as const

export const ZERO_HEAVY_BASELINE_METRICS = [
  'teamRecover',
  'shieldDamageOffsetFromPlayer',
] as const

export const DIAGNOSTIC_BASELINE_METRICS = ['protectAbsorb'] as const

export const SHADOW_BASELINE_METRICS = [
  ...CONTINUOUS_BASELINE_METRICS,
  ...ZERO_HEAVY_BASELINE_METRICS,
] as const

export type ShadowBaselineMetricName = (typeof SHADOW_BASELINE_METRICS)[number]
export type BaselineMetricName =
  | ShadowBaselineMetricName
  | (typeof DIAGNOSTIC_BASELINE_METRICS)[number]

export interface RoleMetricBaselineStat {
  totalCount: number
  nonNullCount: number
  zeroCount: number
  positiveCount: number
  mean: number | null
  median: number | null
  p10: number | null
  p25: number | null
  p75: number | null
  p90: number | null
  p95: number | null
  standardDeviation: number | null
  p95WinsorizedMean: number | null
  readiness: EffectiveReadinessLevel
}

export interface RoleMetricDerivedBaselineStat extends RoleMetricBaselineStat {
  bootstrap: BootstrapResult
  trainValidation: TrainValidationResult
}

export interface RoleMetricComboBaseline {
  rankTierKey: string
  characterNum: number
  weaponTypeId: number
  role: string | null
  label: string
  metrics: Record<BaselineMetricName, RoleMetricBaselineStat>
  derivedMetrics: {
    tankingEfficiency: RoleMetricDerivedBaselineStat
  }
  liveEligibility: LiveEligibilityFlags
}

export interface RoleMetricBaselineDocument {
  version: number
  generatedAt: string
  seasonId: number
  rowCount: number
  playedAtFrom: string | null
  playedAtTo: string | null
  filters: {
    gameMode: 'rank'
    roleMetricsVersion: 1
  }
  combinations: Record<string, RoleMetricComboBaseline>
}

export interface RoleMetricBaselineRow {
  gameId: string
  uid: string
  rankTierKey: string
  characterNum: number
  weaponTypeId: number
  role: string | null
  playedAt: string
  deaths: number | null
  damageFromPlayer: number | null
  protectAbsorb: number | null
  shieldDamageOffsetFromPlayer: number | null
  teamRecover: number | null
  ccTimeToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
  victory: boolean | null
  placement: number | null
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0] ?? null
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower] ?? null
  const weight = index - lower
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight
}

function stdDev(values: number[]): number | null {
  if (values.length === 0) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function p95WinsorizedMean(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const cap = percentile(sorted, 0.95)
  if (cap == null) return null
  const winsorized = values.map((value) => Math.min(value, cap))
  return winsorized.reduce((sum, value) => sum + value, 0) / winsorized.length
}

function resolveContinuousReadiness(totalN: number): EffectiveReadinessLevel {
  if (totalN < 30) return 'unusable'
  if (totalN < 100) return 'experimental'
  if (totalN < 300) return 'provisional'
  return 'ready'
}

function resolveZeroHeavyReadiness(totalN: number, positiveN: number): EffectiveReadinessLevel {
  return resolveEffectiveReadiness(totalN, positiveN)
}

export function computeBaselineMetricStat(
  values: ReadonlyArray<number | null>,
  metric: BaselineMetricName,
): RoleMetricBaselineStat {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value))
  const totalCount = values.length
  const nonNullCount = finite.length
  const zeroCount = finite.filter((value) => value === 0).length
  const positiveValues = finite.filter((value) => value > 0)
  const positiveCount = positiveValues.length
  const sorted = [...finite].sort((a, b) => a - b)
  const mean = nonNullCount > 0 ? finite.reduce((sum, value) => sum + value, 0) / nonNullCount : null
  const readiness = (CONTINUOUS_BASELINE_METRICS as readonly string[]).includes(metric)
    ? resolveContinuousReadiness(nonNullCount)
    : resolveZeroHeavyReadiness(nonNullCount, positiveCount)

  return {
    totalCount,
    nonNullCount,
    zeroCount,
    positiveCount,
    mean,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    standardDeviation: stdDev(finite),
    p95WinsorizedMean: p95WinsorizedMean(finite),
    readiness,
  }
}

export function buildComboKey(
  rankTierKey: string,
  characterNum: number,
  weaponTypeId: number,
): string {
  return `${rankTierKey}|${characterNum}:${weaponTypeId}`
}

export function resolveRankTierKey(rpAfter: number | null, displaySeasonId: number): string {
  if (rpAfter == null) return 'unranked'
  const tier = getRankTierFromRp(rpAfter, null, displaySeasonId)
  return rankTierToGradeBaselineKey(tier) ?? 'unranked'
}

export function toBaselineRow(row: {
  gameId: string
  uid: string
  characterNum: number
  bestWeapon: number | null
  rpAfter: number | null
  displaySeasonId: number
  playedAt: Date
  deaths: number | null
  damageFromPlayer: number | null
  protectAbsorb: number | null
  shieldDamageOffsetFromPlayer: number | null
  teamRecover: number | null
  ccTimeToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
  victory: boolean | null
  placement: number | null
}): RoleMetricBaselineRow | null {
  if (row.bestWeapon == null || row.bestWeapon <= 0) return null
  const rankTierKey = resolveRankTierKey(row.rpAfter, row.displaySeasonId)
  if (rankTierKey === 'unranked') return null
  return {
    gameId: row.gameId,
    uid: row.uid,
    rankTierKey,
    characterNum: row.characterNum,
    weaponTypeId: row.bestWeapon,
    role: lookupCharacterWeaponRole(row.characterNum, row.bestWeapon),
    playedAt: row.playedAt.toISOString(),
    deaths: row.deaths,
    damageFromPlayer: row.damageFromPlayer,
    protectAbsorb: row.protectAbsorb,
    shieldDamageOffsetFromPlayer: row.shieldDamageOffsetFromPlayer,
    teamRecover: row.teamRecover,
    ccTimeToPlayer: row.ccTimeToPlayer,
    viewContribution: row.viewContribution,
    monsterKill: row.monsterKill,
    victory: row.victory,
    placement: row.placement,
  }
}

function splitTrainValidationRows(rows: ReadonlyArray<RoleMetricBaselineRow>): {
  train: RoleMetricBaselineRow[]
  validation: RoleMetricBaselineRow[]
} {
  const sorted = [...rows].sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt))
  const splitIndex = Math.floor(sorted.length * 0.7)
  return {
    train: sorted.slice(0, splitIndex),
    validation: sorted.slice(splitIndex),
  }
}

function extractMetricValues(
  rows: ReadonlyArray<RoleMetricBaselineRow>,
  metric: BaselineMetricName | 'tankingEfficiency',
): number[] {
  if (metric === 'tankingEfficiency') {
    return rows.flatMap((row) => {
      const value = computeTankingEfficiencyValue(row.damageFromPlayer, row.deaths)
      return value == null ? [] : [value]
    })
  }
  return rows.flatMap((row) => {
    const value = row[metric]
    return value != null && Number.isFinite(value) ? [value] : []
  })
}

function computeStatFromValues(
  values: number[],
  zeroHeavy: boolean,
): RoleMetricBaselineStat {
  const nonNullCount = values.length
  const zeroCount = values.filter((value) => value === 0).length
  const positiveCount = values.filter((value) => value > 0).length
  const sorted = [...values].sort((a, b) => a - b)
  const mean = nonNullCount > 0 ? values.reduce((sum, value) => sum + value, 0) / nonNullCount : null
  const readiness = zeroHeavy
    ? resolveZeroHeavyReadiness(nonNullCount, positiveCount)
    : resolveContinuousReadiness(nonNullCount)
  return {
    totalCount: nonNullCount,
    nonNullCount,
    zeroCount,
    positiveCount,
    mean,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    standardDeviation: stdDev(values),
    p95WinsorizedMean: p95WinsorizedMean(values),
    readiness,
  }
}

function buildDerivedMetricStat(
  comboRows: ReadonlyArray<RoleMetricBaselineRow>,
  metric: BaselineMetricName | 'tankingEfficiency',
  zeroHeavy: boolean,
): RoleMetricDerivedBaselineStat {
  const values = extractMetricValues(comboRows, metric)
  const stat = computeStatFromValues(values, zeroHeavy)
  const { train, validation } = splitTrainValidationRows(comboRows)
  const bootstrap = runMetricBootstrap(values, stat.readiness, {
    zeroHeavy,
    positiveCount: stat.positiveCount,
  })
  const trainValidation = runTrainValidationStability(
    extractMetricValues(train, metric),
    extractMetricValues(validation, metric),
  )
  return {
    ...stat,
    bootstrap,
    trainValidation,
  }
}

function buildComboBaseline(comboKey: string, comboRows: RoleMetricBaselineRow[]): RoleMetricComboBaseline {
  const sample = comboRows[0]!
  const metrics = {} as Record<BaselineMetricName, RoleMetricBaselineStat>
  const allMetrics: BaselineMetricName[] = [
    ...SHADOW_BASELINE_METRICS,
    ...DIAGNOSTIC_BASELINE_METRICS,
  ]
  for (const metric of allMetrics) {
    metrics[metric] = computeBaselineMetricStat(
      comboRows.map((row) => row[metric]),
      metric,
    )
  }

  const tankingEfficiency = buildDerivedMetricStat(comboRows, 'tankingEfficiency', false)
  const shieldDerived = buildDerivedMetricStat(comboRows, 'shieldDamageOffsetFromPlayer', true)
  const teamRecoverDerived = buildDerivedMetricStat(comboRows, 'teamRecover', true)
  const ccDerived = buildDerivedMetricStat(comboRows, 'ccTimeToPlayer', false)

  const liveEligibility: LiveEligibilityFlags = {
    tankingEfficiency: resolveLiveMetricEligibility({
      readiness: tankingEfficiency.readiness,
      bootstrap: tankingEfficiency.bootstrap,
      trainValidation: tankingEfficiency.trainValidation,
      enableLive: true,
    }),
    shieldDamageOffsetFromPlayer: resolveLiveMetricEligibility({
      readiness: metrics.shieldDamageOffsetFromPlayer.readiness,
      bootstrap: shieldDerived.bootstrap,
      trainValidation: shieldDerived.trainValidation,
      enableLive: true,
    }),
    teamRecover: resolveLiveMetricEligibility({
      readiness: metrics.teamRecover.readiness,
      bootstrap: teamRecoverDerived.bootstrap,
      trainValidation: teamRecoverDerived.trainValidation,
      enableLive: isHealerSupportCombo(sample.characterNum, sample.weaponTypeId),
    }),
    ccTimeToPlayer: resolveLiveMetricEligibility({
      readiness: metrics.ccTimeToPlayer.readiness,
      bootstrap: ccDerived.bootstrap,
      trainValidation: ccDerived.trainValidation,
      enableLive: false,
    }),
  }

  return {
    rankTierKey: sample.rankTierKey,
    characterNum: sample.characterNum,
    weaponTypeId: sample.weaponTypeId,
    role: sample.role,
    label: formatComboDisplayName(sample.characterNum, sample.weaponTypeId),
    metrics,
    derivedMetrics: {
      tankingEfficiency,
    },
    liveEligibility,
  }
}

export function buildRoleMetricBaselineDocument(
  rows: ReadonlyArray<RoleMetricBaselineRow>,
  seasonId: number = CURRENT_DISPLAY_SEASON,
): RoleMetricBaselineDocument {
  const comboMap = new Map<string, RoleMetricBaselineRow[]>()
  for (const row of rows) {
    const key = buildComboKey(row.rankTierKey, row.characterNum, row.weaponTypeId)
    const bucket = comboMap.get(key) ?? []
    bucket.push(row)
    comboMap.set(key, bucket)
  }

  const combinations: Record<string, RoleMetricComboBaseline> = {}
  for (const [comboKey, comboRows] of comboMap) {
    combinations[comboKey] = buildComboBaseline(comboKey, comboRows)
  }

  const playedAtValues = rows.map((row) => Date.parse(row.playedAt)).filter(Number.isFinite)
  playedAtValues.sort((a, b) => a - b)

  return {
    version: ROLE_METRIC_BASELINE_VERSION,
    generatedAt: new Date().toISOString(),
    seasonId,
    rowCount: rows.length,
    playedAtFrom:
      playedAtValues.length > 0 ? new Date(playedAtValues[0]!).toISOString() : null,
    playedAtTo:
      playedAtValues.length > 0
        ? new Date(playedAtValues[playedAtValues.length - 1]!).toISOString()
        : null,
    filters: {
      gameMode: 'rank',
      roleMetricsVersion: 1,
    },
    combinations,
  }
}

export function isShadowReady(readiness: EffectiveReadinessLevel): boolean {
  return readiness === 'provisional' || readiness === 'ready'
}

export function hashUid(uid: string): string {
  return `uid_${createHash('sha256').update(uid).digest('hex').slice(0, 12)}`
}

const moduleDir = dirname(fileURLToPath(import.meta.url))

function resolveDefaultBaselinePath(): string {
  const candidates = [
    join(moduleDir, '..', 'data', 'characterGrade', 'role-metric-baselines.v1.json'),
    join(moduleDir, '..', '..', 'src', 'data', 'characterGrade', 'role-metric-baselines.v1.json'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]!
}

const defaultBaselinePath = resolveDefaultBaselinePath()

export function loadRoleMetricBaselineDocument(
  path: string = defaultBaselinePath,
): RoleMetricBaselineDocument {
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw) as RoleMetricBaselineDocument
}

export function lookupComboBaseline(
  document: RoleMetricBaselineDocument,
  rankTierKey: string,
  characterNum: number,
  weaponTypeId: number,
): RoleMetricComboBaseline | null {
  return document.combinations[buildComboKey(rankTierKey, characterNum, weaponTypeId)] ?? null
}
