import { createHash } from 'node:crypto'

import { lookupCharacterWeaponRole } from '../../services/characterPerformanceGrade/baselineStore.js'
import { scoreToFineGrade, type CharacterFineGrade, type CharacterGradeRole } from '../../services/characterPerformanceGrade/config.js'
import { clamp } from '../../services/characterPerformanceGrade/metrics.js'
import { rankTierToGradeBaselineKey } from '../../services/characterPerformanceGrade/tierKey.js'
import {
  computeMatchGradeV3,
  roleScoreV3PlacementAdjustment,
  type RoleScoreV3Input,
} from '../../services/roleScore/roleScoreV3.js'
import { TEAM_LUCK_ROLE_SCORE_WEIGHTS } from '../../services/roleScore/teamLuckRoleScore.js'
import { getRankTierFromRp } from '../../utils/rankTier.js'
import {
  computeShadowExpectedDamage,
  normalizeDamageScore,
  resolveProductionDamageBaseline,
  resolveProductionDamageDurationMultiplier,
  type DamageShadowPlayerMatchRow,
} from './damageShadowEvaluator.js'
import { interpolateCurve, toCurveRole, type RoleTimeCurveRole } from './roleTimeCurve.js'

export const ROLE_TIME_CURVE_V12_VERSION = 'role-time-curve.v1.2'
export const DAMAGE_SHADOW_COMPARISON_V12_VERSION = 'damage-shadow-comparison.v1.2'

const ANCHORS = [10, 15, 20, 25] as const
const ROLES = ['평타 딜러', '스증 딜러', '암살자', '브루저', '탱커', '유틸 서포터'] as const
const ANCHOR_SHRINK_K = 409

type ModelId = 'M0' | 'M1_GLOBAL_EQUAL_ROLE' | 'M2_ROLE_RESIDUAL_CLAMP_10' | 'M2_ROLE_RESIDUAL_CLAMP_15'

interface PreparedRow {
  uidHash: string
  gameIdHash: string
  gameId: string
  split: 'train' | 'calibration' | 'final'
  tierKey: string
  role: CharacterGradeRole
  curveRole: RoleTimeCurveRole
  characterNum: number
  weaponTypeId: number
  placement: number
  victory: boolean
  durationSeconds: number
  durationMinutes: number
  actualDamage: number
  baseDamage: number
  oldMultiplier: number
  oldExpectedDamage: number
  oldDamageRatio: number
  oldDamageScore: number
  oldMatchScore: number
  oldMatchGrade: CharacterFineGrade
  oldRoleScore: number
  oldPlacementAdjustment: number
  metricScores: Record<string, number>
}

interface ShapePoint {
  minute: number
  value: number
  sampleCount: number
}

interface ModelShape {
  id: ModelId
  points: Record<RoleTimeCurveRole, ShapePoint[]>
}

interface EvaluationRow {
  model: ModelId
  role: CharacterGradeRole
  curveRole: RoleTimeCurveRole
  tierKey: string
  durationBucket: string
  placement: number
  victory: boolean
  oldDamageRatio: number
  shadowDamageRatio: number
  oldDamageScore: number
  shadowDamageScore: number
  oldMatchScore: number
  shadowMatchScore: number
  oldMatchGrade: CharacterFineGrade
  shadowMatchGrade: CharacterFineGrade
  matchScoreDelta: number
  gradeStepDelta: number
  fallbackUsed: boolean
}

export interface RoleTimeCurveCandidateV12 {
  version: typeof ROLE_TIME_CURVE_V12_VERSION
  status: 'candidate'
  runtimeApplied: false
  generatedAt: string
  source: 'PlayerMatch'
  models: Record<string, { description: string; points: Record<string, ShapePoint[]> }>
  anchorsMinutes: readonly number[]
  anchorShrinkK: number
  policies: {
    under8: 'production-duration-multiplier'
    eightToTen: 'smooth-blend-production-to-shadow'
    tenToTwentyFive: 'shadow-model'
    twentyFivePlus: 'production-duration-multiplier'
  }
}

export interface BiasDecompositionV12 {
  generatedAt: string
  splitCounts: Record<string, number>
  leakageGameIds: number
  oldRatioByRole: Record<string, RatioSummary>
  v11RatioByRole: Record<string, RatioSummary>
  decomposition: Record<string, string>
  commonDurationDistribution: Record<string, number>
}

export interface DamageShadowComparisonV12 {
  version: typeof DAMAGE_SHADOW_COMPARISON_V12_VERSION
  generatedAt: string
  sample: {
    totalRows: number
    preparedRows: number
    finalRows: number
    skipped: Record<string, number>
  }
  models: Record<ModelId, ModelSummary>
  byRole: Record<ModelId, Record<string, GroupSummary>>
  byDuration: Record<ModelId, Record<string, GroupSummary>>
  byMinute20to25: Record<ModelId, Record<string, GroupSummary>>
  notes: string[]
}

export interface BootstrapStabilityV12 {
  generatedAt: string
  iterations: number
  randomDropRate: number
  roleMedianDeltas: Record<string, { meanAbsDelta: number; maxAbsDelta: number }>
  topFivePlayerRemoval: Record<string, { meanDelta: number; maxAbsDelta: number }>
}

interface RatioSummary {
  sampleCount: number
  median: number
  p10: number
  p90: number
}

interface GroupSummary {
  sampleCount: number
  oldRatio: RatioSummary
  shadowRatio: RatioSummary
  damageScoreMeanDelta: number
  matchScoreMeanDelta: number
  gradeUp: number
  gradeSame: number
  gradeDown: number
  onePlusGradeStepChanges: number
  fallbackCount: number
}

interface ModelSummary extends GroupSummary {
  description: string
}

function round(value: number, digits = 4): number {
  return Math.round(value * 10 ** digits) / 10 ** digits
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function splitForGameId(gameId: string): PreparedRow['split'] {
  const prefix = createHash('sha256').update(gameId).digest('hex').slice(0, 8)
  const value = Number.parseInt(prefix, 16) / 0xffffffff
  if (value < 0.6) return 'train'
  if (value < 0.8) return 'calibration'
  return 'final'
}

function quantile(values: readonly number[], q: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo] ?? 0
  const t = pos - lo
  return (sorted[lo] ?? 0) * (1 - t) + (sorted[hi] ?? 0) * t
}

function winsorizedMean(values: readonly number[], p = 0.95): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (finite.length === 0) return null
  const cap = quantile(finite, p)
  return finite.reduce((sum, value) => sum + Math.min(value, cap), 0) / finite.length
}

function ratioSummary(values: readonly number[]): RatioSummary {
  const finite = values.filter(Number.isFinite)
  return {
    sampleCount: finite.length,
    median: round(quantile(finite, 0.5)),
    p10: round(quantile(finite, 0.1)),
    p90: round(quantile(finite, 0.9)),
  }
}

function nearestAnchor(minute: number): number | null {
  if (minute < 10 || minute >= 25) return null
  return ANCHORS.reduce((best, anchor) => (Math.abs(minute - anchor) < Math.abs(minute - best) ? anchor : best), 10)
}

function durationBucket(minute: number): string {
  if (minute < 8) return 'under-8'
  if (minute < 10) return '8-10'
  if (minute < 15) return '10-15'
  if (minute < 20) return '15-20'
  if (minute < 25) return '20-25'
  return '25-plus'
}

function minute20to25(minute: number): string {
  if (minute < 20 || minute >= 25) return 'outside-20-25'
  return `${Math.floor(minute)}-${Math.floor(minute) + 1}`
}

function gradeStep(grade: CharacterFineGrade): number {
  return ['D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S-', 'S', 'S+'].indexOf(grade)
}

function weightedMean(scores: Array<{ score: number; weight: number }>): number | null {
  let sum = 0
  let weight = 0
  for (const entry of scores) {
    if (!Number.isFinite(entry.score) || !Number.isFinite(entry.weight) || entry.weight <= 0) continue
    sum += entry.score * entry.weight
    weight += entry.weight
  }
  return weight > 0 ? round(sum / weight, 4) : null
}

function prepareRows(rows: readonly DamageShadowPlayerMatchRow[]): { rows: PreparedRow[]; skipped: Record<string, number> } {
  const prepared: PreparedRow[] = []
  const skipped: Record<string, number> = {}
  const addSkip = (key: string) => {
    skipped[key] = (skipped[key] ?? 0) + 1
  }

  for (const row of rows) {
    if (row.gameMode !== 'rank') {
      addSkip('non-rank')
      continue
    }
    if (row.bestWeapon == null || row.bestWeapon <= 0) {
      addSkip('missing-weapon')
      continue
    }
    if (row.gameDuration == null || row.gameDuration <= 0 || row.damageToPlayer == null) {
      addSkip('missing-duration-or-damage')
      continue
    }
    const tier = rankTierToGradeBaselineKey(getRankTierFromRp(row.rpAfter ?? 0, null, row.displaySeasonId))
    const role = lookupCharacterWeaponRole(row.characterNum, row.bestWeapon)
    if (!tier || !role) {
      addSkip('missing-tier-or-role')
      continue
    }
    const input: RoleScoreV3Input = {
      tierKey: tier,
      characterNum: row.characterNum,
      weaponTypeId: row.bestWeapon,
      role,
      placement: row.placement,
      durationSeconds: row.gameDuration,
      damageToPlayer: row.damageToPlayer,
      kills: row.kills,
      assists: row.assists,
      teamKills: row.teamKills,
      deaths: row.deaths,
      visionScore: row.viewContribution,
      monsterKill: row.monsterKill,
    }
    const baseline = resolveProductionDamageBaseline(input)
    const old = computeMatchGradeV3(input)
    const oldDamage = old?.roleScoreDetail.metricDetails.find((entry) => entry.metric === 'damage')
    if (!baseline.metrics || !old || !oldDamage || row.placement == null || row.placement <= 0) {
      addSkip('unscored')
      continue
    }
    const duration = row.gameDuration / 60
    prepared.push({
      uidHash: hash(row.uid),
      gameIdHash: hash(row.gameId),
      gameId: row.gameId,
      split: splitForGameId(row.gameId),
      tierKey: tier,
      role,
      curveRole: toCurveRole(role),
      characterNum: row.characterNum,
      weaponTypeId: row.bestWeapon,
      placement: row.placement,
      victory: row.victory === true,
      durationSeconds: row.gameDuration,
      durationMinutes: duration,
      actualDamage: row.damageToPlayer,
      baseDamage: baseline.metrics.averageDamageToPlayer,
      oldMultiplier: resolveProductionDamageDurationMultiplier(role, row.gameDuration).multiplier,
      oldExpectedDamage: oldDamage.expected,
      oldDamageRatio: row.damageToPlayer / oldDamage.expected,
      oldDamageScore: oldDamage.score,
      oldMatchScore: old.score,
      oldMatchGrade: old.grade,
      oldRoleScore: old.roleScore,
      oldPlacementAdjustment: old.placementAdjustment,
      metricScores: Object.fromEntries(old.roleScoreDetail.metricDetails.map((entry) => [entry.metric, entry.score])),
    })
  }

  return { rows: prepared, skipped }
}

function commonDurationDistribution(rows: readonly PreparedRow[]): Record<number, number> {
  const counts: Record<number, number> = Object.fromEntries(ANCHORS.map((anchor) => [anchor, 0]))
  for (const row of rows) {
    const anchor = nearestAnchor(row.durationMinutes)
    if (anchor == null) continue
    counts[anchor] = (counts[anchor] ?? 0) + 1
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return Object.fromEntries(Object.entries(counts).map(([anchor, count]) => [Number(anchor), total > 0 ? count / total : 0.25]))
}

function normalizeShape(points: ShapePoint[], distribution: Record<number, number>): ShapePoint[] {
  const average = points.reduce((sum, point) => sum + point.value * (distribution[point.minute] ?? 0), 0)
  const divisor = average > 0 ? average : 1
  return points.map((point) => ({ ...point, value: round(point.value / divisor, 6) }))
}

function buildShapes(trainRows: readonly PreparedRow[]): { models: ModelShape[]; distribution: Record<number, number> } {
  const distribution = commonDurationDistribution(trainRows)
  const globalByAnchor = new Map<number, number[]>()
  const byRoleAnchor = new Map<string, number[]>()
  for (const row of trainRows) {
    const anchor = nearestAnchor(row.durationMinutes)
    if (anchor == null) continue
    const ratio = row.actualDamage / row.baseDamage
    globalByAnchor.set(anchor, [...(globalByAnchor.get(anchor) ?? []), ratio])
    byRoleAnchor.set(`${row.curveRole}:${anchor}`, [...(byRoleAnchor.get(`${row.curveRole}:${anchor}`) ?? []), ratio])
  }

  const globalObserved = ANCHORS.map((anchor) => ({
    minute: anchor,
    value: winsorizedMean(globalByAnchor.get(anchor) ?? []) ?? 1,
    sampleCount: globalByAnchor.get(anchor)?.length ?? 0,
  }))

  const roleShapes = new Map<RoleTimeCurveRole, ShapePoint[]>()
  for (const role of ROLES) {
    const raw = ANCHORS.map((anchor) => {
      const values = byRoleAnchor.get(`${role}:${anchor}`) ?? []
      return {
        minute: anchor,
        value: winsorizedMean(values) ?? globalObserved.find((point) => point.minute === anchor)?.value ?? 1,
        sampleCount: values.length,
      }
    })
    roleShapes.set(role, normalizeShape(raw, distribution))
  }

  const equalGlobal = normalizeShape(
    ANCHORS.map((anchor) => ({
      minute: anchor,
      value:
        ROLES.reduce((sum, role) => sum + (roleShapes.get(role)?.find((point) => point.minute === anchor)?.value ?? 1), 0) /
        ROLES.length,
      sampleCount: globalObserved.find((point) => point.minute === anchor)?.sampleCount ?? 0,
    })),
    distribution,
  )

  const m1Points = Object.fromEntries(ROLES.map((role) => [role, equalGlobal])) as Record<RoleTimeCurveRole, ShapePoint[]>
  const makeM2 = (clampRange: number): Record<RoleTimeCurveRole, ShapePoint[]> =>
    Object.fromEntries(
      ROLES.map((role) => {
        const points = ANCHORS.map((anchor) => {
          const rolePoint = roleShapes.get(role)?.find((point) => point.minute === anchor)
          const globalPoint = equalGlobal.find((point) => point.minute === anchor)
          const rawResidual = (rolePoint?.value ?? 1) / (globalPoint?.value ?? 1)
          const n = rolePoint?.sampleCount ?? 0
          const weight = n / (n + ANCHOR_SHRINK_K)
          const residual = 1 + (rawResidual - 1) * weight
          return {
            minute: anchor,
            value: round((globalPoint?.value ?? 1) * clamp(residual, 1 - clampRange, 1 + clampRange), 6),
            sampleCount: n,
          }
        })
        return [role, normalizeShape(points, distribution)]
      }),
    ) as Record<RoleTimeCurveRole, ShapePoint[]>

  return {
    distribution,
    models: [
      { id: 'M1_GLOBAL_EQUAL_ROLE', points: m1Points },
      { id: 'M2_ROLE_RESIDUAL_CLAMP_10', points: makeM2(0.1) },
      { id: 'M2_ROLE_RESIDUAL_CLAMP_15', points: makeM2(0.15) },
    ],
  }
}

function modelMultiplier(row: PreparedRow, model: ModelShape): { multiplier: number; fallback: boolean } {
  const minute = row.durationMinutes
  if (model.id === 'M0' || minute < 8 || minute >= 25) return { multiplier: row.oldMultiplier, fallback: model.id !== 'M0' }
  const points = model.points[row.curveRole]?.map((point) => ({ minute: point.minute, value: point.value })) ?? []
  const shadow = interpolateCurve(points, clamp(minute, 10, 25))
  if (minute < 10) {
    const weight = (minute - 8) / 2
    return { multiplier: round(row.oldMultiplier * (1 - weight) + shadow * weight, 6), fallback: false }
  }
  return { multiplier: round(shadow, 6), fallback: false }
}

function evaluateModel(rows: readonly PreparedRow[], model: ModelShape): EvaluationRow[] {
  return rows.map((row) => {
    const resolved = modelMultiplier(row, model)
    const expected = model.id === 'M0' ? row.oldExpectedDamage : computeShadowExpectedDamage(row.baseDamage, resolved.multiplier)
    const shadowDamageScore = model.id === 'M0' ? row.oldDamageScore : normalizeDamageScore(row.actualDamage, expected)
    if (expected == null || shadowDamageScore == null) {
      throw new Error('invalid shadow damage score')
    }
    const weights = TEAM_LUCK_ROLE_SCORE_WEIGHTS[row.role]
    const roleScore =
      model.id === 'M0'
        ? row.oldRoleScore
        : weightedMean(
            Object.entries(row.metricScores).map(([metric, score]) => ({
              score: metric === 'damage' ? shadowDamageScore : score,
              weight: weights[metric as keyof typeof weights] ?? 0,
            })),
          )
    if (roleScore == null) throw new Error('invalid role score')
    const placementAdjustment =
      model.id === 'M0'
        ? row.oldPlacementAdjustment
        : roleScoreV3PlacementAdjustment({ placement: row.placement, roleScore })
    if (placementAdjustment == null) throw new Error('invalid placement adjustment')
    const score = round(clamp(roleScore + placementAdjustment, 0, 100), 2)
    const grade = scoreToFineGrade(score)
    return {
      model: model.id,
      role: row.role,
      curveRole: row.curveRole,
      tierKey: row.tierKey,
      durationBucket: durationBucket(row.durationMinutes),
      placement: row.placement,
      victory: row.victory,
      oldDamageRatio: row.oldDamageRatio,
      shadowDamageRatio: row.actualDamage / expected,
      oldDamageScore: row.oldDamageScore,
      shadowDamageScore,
      oldMatchScore: row.oldMatchScore,
      shadowMatchScore: score,
      oldMatchGrade: row.oldMatchGrade,
      shadowMatchGrade: grade,
      matchScoreDelta: round(score - row.oldMatchScore),
      gradeStepDelta: gradeStep(grade) - gradeStep(row.oldMatchGrade),
      fallbackUsed: resolved.fallback,
    }
  })
}

function groupSummary(rows: readonly EvaluationRow[]): GroupSummary {
  const up = rows.filter((row) => row.gradeStepDelta > 0).length
  const down = rows.filter((row) => row.gradeStepDelta < 0).length
  return {
    sampleCount: rows.length,
    oldRatio: ratioSummary(rows.map((row) => row.oldDamageRatio)),
    shadowRatio: ratioSummary(rows.map((row) => row.shadowDamageRatio)),
    damageScoreMeanDelta: round(rows.reduce((sum, row) => sum + (row.shadowDamageScore - row.oldDamageScore), 0) / Math.max(rows.length, 1)),
    matchScoreMeanDelta: round(rows.reduce((sum, row) => sum + row.matchScoreDelta, 0) / Math.max(rows.length, 1)),
    gradeUp: up,
    gradeSame: rows.length - up - down,
    gradeDown: down,
    onePlusGradeStepChanges: rows.filter((row) => Math.abs(row.gradeStepDelta) >= 1).length,
    fallbackCount: rows.filter((row) => row.fallbackUsed).length,
  }
}

function groupBy(rows: readonly EvaluationRow[], key: (row: EvaluationRow) => string): Record<string, GroupSummary> {
  const groups = new Map<string, EvaluationRow[]>()
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row])
  return Object.fromEntries([...groups.entries()].map(([name, entries]) => [name, groupSummary(entries)]))
}

function modelDescription(id: ModelId): string {
  switch (id) {
    case 'M0':
      return 'production duration multiplier'
    case 'M1_GLOBAL_EQUAL_ROLE':
      return 'equal-role global duration shape'
    case 'M2_ROLE_RESIDUAL_CLAMP_10':
      return 'global shape times shrunk role residual clamped 0.90-1.10'
    case 'M2_ROLE_RESIDUAL_CLAMP_15':
      return 'global shape times shrunk role residual clamped 0.85-1.15'
  }
}

function leakageCount(rows: readonly PreparedRow[]): number {
  const seen = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = seen.get(row.gameId) ?? new Set<string>()
    set.add(row.split)
    seen.set(row.gameId, set)
  }
  return [...seen.values()].filter((set) => set.size > 1).length
}

function buildBias(prepared: readonly PreparedRow[], evaluations: readonly EvaluationRow[], generatedAt: string, distribution: Record<number, number>): BiasDecompositionV12 {
  const finalOld = evaluations.filter((row) => row.model === 'M0')
  const v11ByRole = groupBy(
    evaluations.filter((row) => row.model === 'M2_ROLE_RESIDUAL_CLAMP_10'),
    (row) => row.role,
  )
  const oldByRole = groupBy(finalOld, (row) => row.role)
  const decomposition: Record<string, string> = {}
  for (const role of Object.keys(oldByRole)) {
    const oldMedian = oldByRole[role]?.oldRatio.median ?? 0
    const v12Median = v11ByRole[role]?.shadowRatio.median ?? 0
    decomposition[role] =
      Math.abs(oldMedian - 1) > 0.04 && Math.abs(v12Median - oldMedian) < 0.03
        ? 'mostly-existing-baseline-or-role-mapping'
        : Math.abs(v12Median - oldMedian) >= 0.03
          ? 'duration-shape-contributes'
          : 'near-neutral'
  }
  return {
    generatedAt,
    splitCounts: Object.fromEntries(['train', 'calibration', 'final'].map((split) => [split, prepared.filter((row) => row.split === split).length])),
    leakageGameIds: leakageCount(prepared),
    oldRatioByRole: Object.fromEntries(Object.entries(oldByRole).map(([role, summary]) => [role, summary.oldRatio])),
    v11RatioByRole: Object.fromEntries(Object.entries(v11ByRole).map(([role, summary]) => [role, summary.shadowRatio])),
    decomposition,
    commonDurationDistribution: Object.fromEntries(Object.entries(distribution).map(([key, value]) => [key, round(value, 6)])),
  }
}

function buildBootstrap(prepared: readonly PreparedRow[], generatedAt: string): BootstrapStabilityV12 {
  const train = prepared.filter((row) => row.split === 'train')
  const fullShapes = buildShapes(train).models.find((model) => model.id === 'M2_ROLE_RESIDUAL_CLAMP_10')!
  const deltas: Record<string, number[]> = Object.fromEntries(ROLES.map((role) => [role, []]))
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const subset = train.filter((row) => Number.parseInt(hash(`${iteration}:${row.gameIdHash}:${row.uidHash}`).slice(0, 8), 16) / 0xffffffff >= 0.1)
    const shape = buildShapes(subset).models.find((model) => model.id === 'M2_ROLE_RESIDUAL_CLAMP_10')!
    for (const role of ROLES) {
      const full = fullShapes.points[role].map((point) => point.value)
      const next = shape.points[role].map((point) => point.value)
      deltas[role].push(Math.max(...full.map((value, index) => Math.abs(value - (next[index] ?? value)))))
    }
  }
  const topUsers = [...new Map(train.map((row) => [row.uidHash, 0]))]
    .map(([uid]) => ({ uid, count: train.filter((row) => row.uidHash === uid).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((row) => row.uid)
  const removed = buildShapes(train.filter((row) => !topUsers.includes(row.uidHash))).models.find((model) => model.id === 'M2_ROLE_RESIDUAL_CLAMP_10')!
  return {
    generatedAt,
    iterations: 10,
    randomDropRate: 0.1,
    roleMedianDeltas: Object.fromEntries(
      Object.entries(deltas).map(([role, values]) => [
        role,
        { meanAbsDelta: round(values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1), 6), maxAbsDelta: round(Math.max(...values), 6) },
      ]),
    ),
    topFivePlayerRemoval: Object.fromEntries(
      ROLES.map((role) => {
        const full = fullShapes.points[role].map((point) => point.value)
        const next = removed.points[role].map((point) => point.value)
        const diffs = full.map((value, index) => (next[index] ?? value) - value)
        return [role, { meanDelta: round(diffs.reduce((sum, value) => sum + value, 0) / diffs.length, 6), maxAbsDelta: round(Math.max(...diffs.map(Math.abs)), 6) }]
      }),
    ),
  }
}

export function buildRoleTimeCurveV12Artifacts(rows: readonly DamageShadowPlayerMatchRow[], generatedAt = new Date().toISOString()): {
  candidate: RoleTimeCurveCandidateV12
  bias: BiasDecompositionV12
  comparison: DamageShadowComparisonV12
  bootstrap: BootstrapStabilityV12
} {
  const prepared = prepareRows(rows)
  const train = prepared.rows.filter((row) => row.split === 'train')
  const finalRows = prepared.rows.filter((row) => row.split === 'final')
  const built = buildShapes(train)
  const m0: ModelShape = {
    id: 'M0',
    points: Object.fromEntries(ROLES.map((role) => [role, ANCHORS.map((minute) => ({ minute, value: 1, sampleCount: 0 }))])) as Record<RoleTimeCurveRole, ShapePoint[]>,
  }
  const models = [m0, ...built.models]
  const evaluations = models.flatMap((model) => evaluateModel(finalRows, model))
  const comparison: DamageShadowComparisonV12 = {
    version: DAMAGE_SHADOW_COMPARISON_V12_VERSION,
    generatedAt,
    sample: {
      totalRows: rows.length,
      preparedRows: prepared.rows.length,
      finalRows: finalRows.length,
      skipped: prepared.skipped,
    },
    models: Object.fromEntries(
      models.map((model) => {
        const modelRows = evaluations.filter((row) => row.model === model.id)
        return [model.id, { ...groupSummary(modelRows), description: modelDescription(model.id) }]
      }),
    ) as Record<ModelId, ModelSummary>,
    byRole: Object.fromEntries(models.map((model) => [model.id, groupBy(evaluations.filter((row) => row.model === model.id), (row) => row.role)])) as Record<ModelId, Record<string, GroupSummary>>,
    byDuration: Object.fromEntries(models.map((model) => [model.id, groupBy(evaluations.filter((row) => row.model === model.id), (row) => row.durationBucket)])) as Record<ModelId, Record<string, GroupSummary>>,
    byMinute20to25: Object.fromEntries(models.map((model) => [model.id, groupBy(evaluations.filter((row) => row.model === model.id), (row) => minute20to25(row.shadowDamageRatio && finalRows[0]?.durationMinutes ? 20 : 0))])) as Record<ModelId, Record<string, GroupSummary>>,
    notes: [
      'v1.2 is shadow-only and not imported by runtime scoring.',
      '25m+ rows use production duration multiplier fallback.',
      'M2 role residuals use anchor shrinkage and clamp; no role calibration constant is applied.',
    ],
  }
  // Rebuild 20-25 buckets from prepared rows to preserve duration labels in output.
  for (const model of models) {
    const modelRows = evaluations.filter((row) => row.model === model.id)
    const mapped = modelRows.map((row, index) => ({
      row,
      minute: finalRows[index % finalRows.length]?.durationMinutes ?? 0,
    }))
    comparison.byMinute20to25[model.id] = groupBy(
      mapped.map((entry) => ({ ...entry.row, durationBucket: minute20to25(entry.minute) })),
      (row) => row.durationBucket,
    )
  }

  const candidate: RoleTimeCurveCandidateV12 = {
    version: ROLE_TIME_CURVE_V12_VERSION,
    status: 'candidate',
    runtimeApplied: false,
    generatedAt,
    source: 'PlayerMatch',
    models: Object.fromEntries(
      built.models.map((model) => [
        model.id,
        {
          description: modelDescription(model.id),
          points: Object.fromEntries(Object.entries(model.points).map(([role, points]) => [role, points])),
        },
      ]),
    ),
    anchorsMinutes: ANCHORS,
    anchorShrinkK: ANCHOR_SHRINK_K,
    policies: {
      under8: 'production-duration-multiplier',
      eightToTen: 'smooth-blend-production-to-shadow',
      tenToTwentyFive: 'shadow-model',
      twentyFivePlus: 'production-duration-multiplier',
    },
  }

  return {
    candidate,
    bias: buildBias(prepared.rows, evaluations, generatedAt, built.distribution),
    comparison,
    bootstrap: buildBootstrap(prepared.rows, generatedAt),
  }
}

export function formatRoleTimeCurveV12Markdown(report: DamageShadowComparisonV12): string {
  const rows = Object.entries(report.models)
    .map(([id, summary]) => `| ${id} | ${summary.sampleCount} | ${summary.matchScoreMeanDelta} | ${summary.damageScoreMeanDelta} | ${summary.gradeUp}/${summary.gradeSame}/${summary.gradeDown} | ${summary.fallbackCount} |`)
    .join('\n')
  const roleRows = Object.entries(report.byRole.M2_ROLE_RESIDUAL_CLAMP_10 ?? {})
    .map(([role, summary]) => `| ${role} | ${summary.sampleCount} | ${summary.shadowRatio.median} | ${summary.matchScoreMeanDelta} | ${summary.gradeUp}/${summary.gradeSame}/${summary.gradeDown} |`)
    .join('\n')
  return `# Damage Shadow Comparison v1.2

- Generated: ${report.generatedAt}
- Runtime applied: false
- Final evaluation rows: ${report.sample.finalRows}

## Models

| Model | Rows | Match score delta | Damage score delta | Grade up/same/down | Fallback |
|---|---:|---:|---:|---:|---:|
${rows}

## M2 0.90-1.10 By Role

| Role | Rows | Shadow ratio p50 | Match score delta | Grade up/same/down |
|---|---:|---:|---:|---:|
${roleRows}

## Notes

${report.notes.map((note) => `- ${note}`).join('\n')}
`
}

