import { CURRENT_DISPLAY_SEASON } from '../utils/seasonRankTierLadder.js'
import { formatComboDisplayName } from '../utils/comboDisplayName.js'
import { lookupCharacterWeaponRole } from '../services/characterPerformanceGrade/baselineStore.js'
import { ROLE_PRESET_WEIGHTS } from '../services/characterPerformanceGrade/config.js'
import {
  ROLE_METRIC_FIELD_NAMES,
  type RoleMetricFieldName,
  type RoleMetricRowSnapshot,
  toRowSnapshot,
} from './roleMetricBaselineReadiness.js'

export { CURRENT_DISPLAY_SEASON, toRowSnapshot }
export type { RoleMetricRowSnapshot }

export interface CalibrationRow extends RoleMetricRowSnapshot {
  uidHash: string
  gameDuration: number | null
  victory: boolean | null
  placement: number | null
  assists: number | null
  kills: number | null
  damageToPlayerDealt: number | null
  teamKills: number | null
  playedAt: string
}

export type EffectiveReadinessLevel = 'unusable' | 'experimental' | 'provisional' | 'ready'

export interface MetricEffectiveStats {
  totalCount: number
  nonNullCount: number
  zeroCount: number
  positiveCount: number
  zeroRate: number
  positiveRate: number
  mean: number | null
  median: number | null
  positiveMean: number | null
  positiveMedian: number | null
  p75: number | null
  p90: number | null
  p95: number | null
  outlierCount: number
  readiness: EffectiveReadinessLevel
  zeroIsNormal: boolean
}

export interface SampleBalanceReport {
  generatedAt: string
  totalRows: number
  currentSeasonRows: number
  dakBaselineNote: string
  tierDistribution: Record<string, number>
  roleDistribution: Record<string, number>
  characterDistribution: Record<string, number>
  weaponDistribution: Record<string, number>
  seasonDistribution: Record<string, number>
  monthDistribution: Record<string, number>
  comboCounts: Array<{ comboKey: string; label: string; count: number; role: string | null }>
  topCombosShare: number
  uidConcentration: {
    uniqueUidHashes: number
    top1Share: number
    top5Share: number
    top10Share: number
  }
  backfillBiasNote: string
}

export interface ProtectAbsorbAnalysis {
  sampleCount: number
  exactMatchCount: number
  exactMatchRate: number
  pearson: number | null
  diffMean: number | null
  diffMedian: number | null
  protectOnlyNonZero: number
  shieldOnlyNonZero: number
  bothNonZero: number
  recommendation: string
}

export interface PerMinuteAnalysis {
  available: boolean
  fieldUsed: string | null
  note: string
  sampleCount: number
  metrics: Record<string, { mean: number | null; median: number | null }>
}

export interface FormulaComparisonEntry {
  formulaId: string
  label: string
  avgScore: number | null
  winRateCorrelation: number | null
  placementCorrelation: number | null
  sampleCount: number
}

export interface CharacterMetricSummary {
  characterNum: number
  weaponTypeId: number
  label: string
  sampleCount: number
  zeroRate: number
  positiveMean: number | null
  positiveMedian: number | null
  readiness: EffectiveReadinessLevel
}

export interface CalibrationReportBundle {
  generatedAt: string
  sampleBalance: SampleBalanceReport
  metricReadiness: {
    global: Record<RoleMetricFieldName, MetricEffectiveStats>
    byExactCombo: Array<{
      comboKey: string
      label: string
      role: string | null
      metrics: Record<RoleMetricFieldName, MetricEffectiveStats>
    }>
  }
  protectAbsorb: ProtectAbsorbAnalysis
  perMinute: PerMinuteAnalysis
  tankerCandidates: {
    comparisons: FormulaComparisonEntry[]
    comboCount: number
  }
  supporterCandidates: {
    comparisons: FormulaComparisonEntry[]
    teamRecoverByCharacter: CharacterMetricSummary[]
    ccTimeByCharacter: CharacterMetricSummary[]
  }
  dakCompatibility: {
    viewContribution: { compatible: boolean; note: string }
    monsterKill: { compatible: boolean; note: string }
  }
  outlierMitigation: Array<{
    method: string
    stdDev: number | null
    rankStability: number | null
  }>
  applicableCombos: string[]
  insufficientCombos: string[]
  recommendation39_11G: string[]
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

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null
  const meanX = xs.reduce((s, v) => s + v, 0) / xs.length
  const meanY = ys.reduce((s, v) => s + v, 0) / ys.length
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i += 1) {
    const vx = xs[i]! - meanX
    const vy = ys[i]! - meanY
    num += vx * vy
    dx += vx * vx
    dy += vy * vy
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
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
  return values.filter((v) => v < lower || v > upper).length
}

export function resolveEffectiveReadiness(totalN: number, positiveN: number): EffectiveReadinessLevel {
  if (totalN < 30 || positiveN < 10) return 'unusable'
  if (totalN < 100 || positiveN < 30) return 'experimental'
  if (totalN < 300 || positiveN < 100) return 'provisional'
  return 'ready'
}

const ZERO_NORMAL_FIELDS = new Set<RoleMetricFieldName>([
  'teamRecover',
  'protectAbsorb',
  'shieldDamageOffsetFromPlayer',
])

export function computeMetricEffectiveStats(
  rows: ReadonlyArray<CalibrationRow>,
  field: RoleMetricFieldName,
): MetricEffectiveStats {
  const values = rows
    .map((row) => row[field])
    .filter((v): v is number => v != null && Number.isFinite(v))
  const nonNullCount = values.length
  const zeroCount = values.filter((v) => v === 0).length
  const positiveValues = values.filter((v) => v > 0)
  const positiveCount = positiveValues.length
  const sorted = [...values].sort((a, b) => a - b)
  const mean = nonNullCount > 0 ? values.reduce((s, v) => s + v, 0) / nonNullCount : null

  return {
    totalCount: rows.length,
    nonNullCount,
    zeroCount,
    positiveCount,
    zeroRate: nonNullCount > 0 ? zeroCount / nonNullCount : 0,
    positiveRate: nonNullCount > 0 ? positiveCount / nonNullCount : 0,
    mean,
    median: percentile(sorted, 0.5),
    positiveMean:
      positiveCount > 0 ? positiveValues.reduce((s, v) => s + v, 0) / positiveCount : null,
    positiveMedian: percentile([...positiveValues].sort((a, b) => a - b), 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    outlierCount: countIqrOutliers(values),
    readiness: resolveEffectiveReadiness(rows.length, positiveCount),
    zeroIsNormal: ZERO_NORMAL_FIELDS.has(field),
  }
}

export function hashUid(uid: string): string {
  let hash = 0
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash << 5) - hash + uid.charCodeAt(i)
    hash |= 0
  }
  return `uid_${Math.abs(hash).toString(36)}`
}

function increment(map: Record<string, number>, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount
}

export function analyzeSampleBalance(rows: ReadonlyArray<CalibrationRow>): SampleBalanceReport {
  const tierDistribution: Record<string, number> = {}
  const roleDistribution: Record<string, number> = {}
  const characterDistribution: Record<string, number> = {}
  const weaponDistribution: Record<string, number> = {}
  const seasonDistribution: Record<string, number> = {}
  const monthDistribution: Record<string, number> = {}
  const comboMap = new Map<string, { count: number; role: string | null; label: string }>()
  const uidCounts = new Map<string, number>()

  let currentSeasonRows = 0
  for (const row of rows) {
    if (row.displaySeasonId === CURRENT_DISPLAY_SEASON) currentSeasonRows += 1
    increment(tierDistribution, row.rankTierKey)
    increment(roleDistribution, row.role ?? 'unknown')
    increment(characterDistribution, String(row.characterNum))
    increment(weaponDistribution, String(row.weaponTypeId))
    increment(seasonDistribution, String(row.displaySeasonId))
    increment(monthDistribution, row.playedAt.slice(0, 7))

    const comboKey = `${row.rankTierKey}|${row.characterNum}:${row.weaponTypeId}`
    const existing = comboMap.get(comboKey)
    if (existing) existing.count += 1
    else {
      comboMap.set(comboKey, {
        count: 1,
        role: row.role,
        label: formatComboDisplayName(row.characterNum, row.weaponTypeId),
      })
    }
    uidCounts.set(row.uidHash, (uidCounts.get(row.uidHash) ?? 0) + 1)
  }

  const comboCounts = [...comboMap.entries()]
    .map(([comboKey, meta]) => ({ comboKey, label: meta.label, count: meta.count, role: meta.role }))
    .sort((a, b) => b.count - a.count)

  const sortedUid = [...uidCounts.values()].sort((a, b) => b - a)
  const total = rows.length
  const top1 = sortedUid[0] ?? 0
  const top5 = sortedUid.slice(0, 5).reduce((s, v) => s + v, 0)
  const top10 = sortedUid.slice(0, 10).reduce((s, v) => s + v, 0)
  const top3Combos = comboCounts.slice(0, 3).reduce((s, c) => s + c.count, 0)

  return {
    generatedAt: new Date().toISOString(),
    totalRows: total,
    currentSeasonRows,
    dakBaselineNote:
      'DAK.GG tier-baselines.v1.json은 periodDays=7 스냅샷이며, 역할 지표 DB 표본은 PlayerMatch playedAt·backfill 시점 기준으로 기간이 다를 수 있음',
    tierDistribution,
    roleDistribution,
    characterDistribution,
    weaponDistribution,
    seasonDistribution,
    monthDistribution,
    comboCounts,
    topCombosShare: total > 0 ? top3Combos / total : 0,
    uidConcentration: {
      uniqueUidHashes: uidCounts.size,
      top1Share: total > 0 ? top1 / total : 0,
      top5Share: total > 0 ? top5 / total : 0,
      top10Share: total > 0 ? top10 / total : 0,
    },
    backfillBiasNote:
      '초기 backfill은 최신순(recent) gameId 위주 — mithril_plus|19:6 등 특정 조합 과다, 다수 탱커·서포터 exact combo는 30 미만',
  }
}

export function analyzeProtectAbsorb(rows: ReadonlyArray<CalibrationRow>): ProtectAbsorbAnalysis {
  const pairs = rows.flatMap((row) => {
    if (row.protectAbsorb == null || row.shieldDamageOffsetFromPlayer == null) return []
    return [{ p: row.protectAbsorb, s: row.shieldDamageOffsetFromPlayer }]
  })
  const exactMatchCount = pairs.filter(({ p, s }) => p === s).length
  const diffs = pairs.map(({ p, s }) => p - s)
  const sortedDiffs = [...diffs].sort((a, b) => a - b)

  let protectOnly = 0
  let shieldOnly = 0
  let both = 0
  for (const row of rows) {
    const p = row.protectAbsorb ?? 0
    const s = row.shieldDamageOffsetFromPlayer ?? 0
    if (p > 0 && s > 0) both += 1
    else if (p > 0) protectOnly += 1
    else if (s > 0) shieldOnly += 1
  }

  return {
    sampleCount: pairs.length,
    exactMatchCount,
    exactMatchRate: pairs.length > 0 ? exactMatchCount / pairs.length : 0,
    pearson:
      pairs.length >= 2
        ? pearson(
            pairs.map(({ p }) => p),
            pairs.map(({ s }) => s),
          )
        : null,
    diffMean: diffs.length > 0 ? diffs.reduce((s, v) => s + v, 0) / diffs.length : null,
    diffMedian: percentile(sortedDiffs, 0.5),
    protectOnlyNonZero: protectOnly,
    shieldOnlyNonZero: shieldOnly,
    bothNonZero: both,
    recommendation:
      'protectAbsorb와 shieldDamageOffsetFromPlayer 동시 반영 금지 — 기본 후보는 shieldDamageOffsetFromPlayer, protectAbsorb는 진단용',
  }
}

export function analyzePerMinute(rows: ReadonlyArray<CalibrationRow>): PerMinuteAnalysis {
  const withDuration = rows.filter((row) => row.gameDuration != null && row.gameDuration > 0)
  if (withDuration.length === 0) {
    return {
      available: false,
      fieldUsed: null,
      note: 'gameDuration 필드 없음 — survivalTime/playTime 별도 컬럼 없음, 분당 지표 불가',
      sampleCount: 0,
      metrics: {},
    }
  }

  const minutes = withDuration.map((row) => (row.gameDuration ?? 0) / 60)
  const calc = (field: keyof CalibrationRow) => {
    const values = withDuration
      .map((row, i) => {
        const raw = row[field]
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
        const min = minutes[i] ?? 0
        return min > 0 ? raw / min : null
      })
      .filter((v): v is number => v != null)
    const sorted = [...values].sort((a, b) => a - b)
    return {
      mean: values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null,
      median: percentile(sorted, 0.5),
    }
  }

  return {
    available: true,
    fieldUsed: 'gameDuration',
    note: 'PlayerMatch.gameDuration(초) 기준 분당 환산 — aliveTime/survivalTime 별도 필드 없음',
    sampleCount: withDuration.length,
    metrics: {
      damageFromPlayerPerMinute: calc('damageFromPlayer'),
      shieldDamageOffsetFromPlayerPerMinute: calc('shieldDamageOffsetFromPlayer'),
      teamRecoverPerMinute: calc('teamRecover'),
      ccTimeToPlayerPerMinute: calc('ccTimeToPlayer'),
    },
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function survivalProxy(row: CalibrationRow): number {
  const deaths = row.deaths ?? 0
  const placement = row.placement ?? 8
  return clamp01((1 / (1 + deaths)) * (1 / placement))
}

function baselineTankScore(row: CalibrationRow): number {
  const w = ROLE_PRESET_WEIGHTS['탱커']
  const total = Object.values(w).reduce((s, v) => s + v, 0)
  const parts = [
    (row.damageToPlayerDealt ?? 0) / 20000,
    (row.kills ?? 0) / 10,
    (row.teamKills ?? 0) / 20,
    (row.assists ?? 0) / 15,
    survivalProxy(row),
    (row.viewContribution ?? 0) / 50,
    (row.monsterKill ?? 0) / 50,
  ]
  const weights = [w.damageToPlayer, w.playerKill, w.teamKill, w.playerAssistant, w.survival, w.viewContribution, w.monsterKill]
  let sum = 0
  for (let i = 0; i < parts.length; i += 1) sum += clamp01(parts[i]!) * (weights[i]! / total)
  return sum
}

function baselineSupportScore(row: CalibrationRow): number {
  const w = ROLE_PRESET_WEIGHTS['서포터']
  const total = Object.values(w).reduce((s, v) => s + v, 0)
  const parts = [
    (row.damageToPlayerDealt ?? 0) / 20000,
    (row.kills ?? 0) / 10,
    (row.teamKills ?? 0) / 20,
    (row.assists ?? 0) / 15,
    survivalProxy(row),
    (row.viewContribution ?? 0) / 50,
    (row.monsterKill ?? 0) / 50,
  ]
  const weights = [w.damageToPlayer, w.playerKill, w.teamKill, w.playerAssistant, w.survival, w.viewContribution, w.monsterKill]
  let sum = 0
  for (let i = 0; i < parts.length; i += 1) sum += clamp01(parts[i]!) * (weights[i]! / total)
  return sum
}

function compareFormulas(
  rows: ReadonlyArray<CalibrationRow>,
  formulas: Array<{ id: string; label: string; score: (row: CalibrationRow) => number }>,
): FormulaComparisonEntry[] {
  if (rows.length < 10) {
    return formulas.map((f) => ({
      formulaId: f.id,
      label: f.label,
      avgScore: null,
      winRateCorrelation: null,
      placementCorrelation: null,
      sampleCount: rows.length,
    }))
  }

  const wins = rows.map((r) => (r.victory ? 1 : 0))
  const placements = rows.map((r) => r.placement ?? 8)

  return formulas.map((f) => {
    const scores = rows.map((r) => f.score(r))
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length
    return {
      formulaId: f.id,
      label: f.label,
      avgScore: avg,
      winRateCorrelation: pearson(scores, wins),
      placementCorrelation: pearson(scores, placements),
      sampleCount: rows.length,
    }
  })
}

export function compareTankerFormulas(rows: ReadonlyArray<CalibrationRow>): {
  comparisons: FormulaComparisonEntry[]
  comboCount: number
} {
  const tankRows = rows.filter((row) => row.role === '탱커')
  const comboMap = new Map<string, CalibrationRow[]>()
  for (const row of tankRows) {
    const key = `${row.rankTierKey}|${row.characterNum}:${row.weaponTypeId}`
    const group = comboMap.get(key) ?? []
    group.push(row)
    comboMap.set(key, group)
  }

  const allComparisons = new Map<string, { scores: number[]; wins: number[]; placements: number[] }>()
  const formulaDefs: Array<{
    id: string
    label: string
    score: (row: CalibrationRow) => number
  }> = [
    { id: 'baseline', label: '기존 대리지표(ROLE_PRESET_WEIGHTS)', score: baselineTankScore },
    {
      id: 't1_damageFromPlayer',
      label: 'T1 damageFromPlayer',
      score: (r) => clamp01((r.damageFromPlayer ?? 0) / 25000),
    },
    {
      id: 't2_shieldOffset',
      label: 'T2 shieldDamageOffsetFromPlayer',
      score: (r) => clamp01((r.shieldDamageOffsetFromPlayer ?? 0) / 15000),
    },
    {
      id: 't4_survivalAdjusted',
      label: 'T4 damageFromPlayer/(1+deaths)',
      score: (r) => clamp01((r.damageFromPlayer ?? 0) / (1 + (r.deaths ?? 0)) / 12000),
    },
  ]

  for (const def of formulaDefs) {
    allComparisons.set(def.id, { scores: [], wins: [], placements: [] })
  }

  for (const group of comboMap.values()) {
    if (group.length < 5) continue
    for (const def of formulaDefs) {
      const bucket = allComparisons.get(def.id)!
      for (const row of group) {
        bucket.scores.push(def.score(row))
        bucket.wins.push(row.victory ? 1 : 0)
        bucket.placements.push(row.placement ?? 8)
      }
    }
  }

  const comparisons = formulaDefs.map((def) => {
    const bucket = allComparisons.get(def.id)!
    const avg =
      bucket.scores.length > 0
        ? bucket.scores.reduce((s, v) => s + v, 0) / bucket.scores.length
        : null
    return {
      formulaId: def.id,
      label: def.label,
      avgScore: avg,
      winRateCorrelation: pearson(bucket.scores, bucket.wins),
      placementCorrelation: pearson(bucket.scores, bucket.placements),
      sampleCount: bucket.scores.length,
    }
  })

  return { comparisons, comboCount: comboMap.size }
}

export function compareSupporterFormulas(rows: ReadonlyArray<CalibrationRow>): {
  comparisons: FormulaComparisonEntry[]
  teamRecoverByCharacter: CharacterMetricSummary[]
  ccTimeByCharacter: CharacterMetricSummary[]
} {
  const supportRows = rows.filter((row) => row.role === '서포터')
  const comparisons = compareFormulas(supportRows, [
    { id: 'baseline', label: '기존 대리지표', score: baselineSupportScore },
    {
      id: 's1_teamRecover',
      label: 'S1 teamRecover',
      score: (r: CalibrationRow) => clamp01((r.teamRecover ?? 0) / 15000),
    },
    {
      id: 's2_teamRecover_cc',
      label: 'S2 teamRecover+ccTimeToPlayer',
      score: (r: CalibrationRow) =>
        clamp01((r.teamRecover ?? 0) / 15000) * 0.6 + clamp01((r.ccTimeToPlayer ?? 0) / 120) * 0.4,
    },
    {
      id: 's3_teamRecover_view',
      label: 'S3 teamRecover+viewContribution',
      score: (r: CalibrationRow) =>
        clamp01((r.teamRecover ?? 0) / 15000) * 0.7 + clamp01((r.viewContribution ?? 0) / 50) * 0.3,
    },
  ])

  const supportChars = [73, 69, 66, 51, 41, 62]
  const buildCharSummary = (
    characterNum: number,
    field: 'teamRecover' | 'ccTimeToPlayer',
  ): CharacterMetricSummary => {
    const charRows = supportRows.filter((r) => r.characterNum === characterNum)
    const weaponTypeId = charRows[0]?.weaponTypeId ?? 0
    const stats = computeMetricEffectiveStats(charRows, field)
    return {
      characterNum,
      weaponTypeId,
      label: formatComboDisplayName(characterNum, weaponTypeId),
      sampleCount: charRows.length,
      zeroRate: stats.zeroRate,
      positiveMean: stats.positiveMean,
      positiveMedian: stats.positiveMedian,
      readiness: stats.readiness,
    }
  }

  return {
    comparisons,
    teamRecoverByCharacter: supportChars.map((n) => buildCharSummary(n, 'teamRecover')),
    ccTimeByCharacter: supportChars.map((n) => buildCharSummary(n, 'ccTimeToPlayer')),
  }
}

export function compareOutlierMitigation(values: number[]): Array<{
  method: string
  stdDev: number | null
  rankStability: number | null
}> {
  if (values.length < 10) {
    return [
      { method: 'raw', stdDev: null, rankStability: null },
      { method: 'p95_winsor', stdDev: null, rankStability: null },
      { method: 'log1p', stdDev: null, rankStability: null },
      { method: 'median', stdDev: null, rankStability: null },
    ]
  }

  const p95 = percentile([...values].sort((a, b) => a - b), 0.95) ?? Math.max(...values)
  const winsorized = values.map((v) => Math.min(v, p95))
  const logValues = values.map((v) => Math.log1p(Math.max(0, v)))
  const median = percentile([...values].sort((a, b) => a - b), 0.5) ?? 0

  const std = (arr: number[]) => {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length
    return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
  }

  const rankCorr = (a: number[], b: number[]) => pearson(
    [...a].sort((x, y) => x - y).map((_, i) => i),
    [...b].sort((x, y) => x - y).map((_, i) => i),
  )

  const rawRanks = [...values].sort((a, b) => a - b)
  const winsorRanks = [...winsorized].sort((a, b) => a - b)

  return [
    { method: 'raw', stdDev: std(values), rankStability: 1 },
    { method: 'p95_winsor', stdDev: std(winsorized), rankStability: rankCorr(rawRanks, winsorRanks) },
    { method: 'log1p', stdDev: std(logValues), rankStability: rankCorr(rawRanks, [...logValues].sort((a, b) => a - b)) },
    { method: 'median', stdDev: std(values.map(() => median)), rankStability: rankCorr(rawRanks, values.map(() => median).sort((a, b) => a - b)) },
  ]
}

export function buildCalibrationReport(rows: ReadonlyArray<CalibrationRow>): CalibrationReportBundle {
  const sampleBalance = analyzeSampleBalance(rows)

  const global = {} as Record<RoleMetricFieldName, MetricEffectiveStats>
  for (const field of ROLE_METRIC_FIELD_NAMES) {
    global[field] = computeMetricEffectiveStats(rows, field)
  }

  const comboMap = new Map<string, CalibrationRow[]>()
  for (const row of rows) {
    const key = `${row.rankTierKey}|${row.characterNum}:${row.weaponTypeId}`
    const group = comboMap.get(key) ?? []
    group.push(row)
    comboMap.set(key, group)
  }

  const byExactCombo = [...comboMap.entries()].map(([comboKey, groupRows]) => {
    const metrics = {} as Record<RoleMetricFieldName, MetricEffectiveStats>
    for (const field of ROLE_METRIC_FIELD_NAMES) {
      metrics[field] = computeMetricEffectiveStats(groupRows, field)
    }
    const [tier, combo] = comboKey.split('|')
    const [characterNum, weaponTypeId] = combo!.split(':').map(Number)
    return {
      comboKey,
      label: `${tier} · ${formatComboDisplayName(characterNum!, weaponTypeId!)}`,
      role: lookupCharacterWeaponRole(characterNum!, weaponTypeId!),
      metrics,
    }
  })

  const tanker = compareTankerFormulas(rows)
  const supporter = compareSupporterFormulas(rows)
  const teamRecoverValues = rows
    .map((r) => r.teamRecover)
    .filter((v): v is number => v != null && v > 0)

  const applicableCombos: string[] = []
  const insufficientCombos: string[] = []
  for (const combo of byExactCombo) {
    const tankMetric = combo.metrics.shieldDamageOffsetFromPlayer
    const supportMetric = combo.metrics.teamRecover
    const role = combo.role
    let ready = false
    if (role === '탱커' && tankMetric.readiness !== 'unusable') ready = true
    if (role === '서포터' && supportMetric.readiness !== 'unusable') ready = true
    if (ready) applicableCombos.push(combo.comboKey)
    else insufficientCombos.push(combo.comboKey)
  }

  return {
    generatedAt: new Date().toISOString(),
    sampleBalance,
    metricReadiness: { global, byExactCombo },
    protectAbsorb: analyzeProtectAbsorb(rows),
    perMinute: analyzePerMinute(rows),
    tankerCandidates: tanker,
    supporterCandidates: supporter,
    dakCompatibility: {
      viewContribution: {
        compatible: true,
        note: 'DAK.GG averageViewContribution과 BSER viewContribution 모두 경기당 시야 기여 — 동일 필드, 기존 DAK 티어 baseline과 단위 호환',
      },
      monsterKill: {
        compatible: true,
        note: 'DAK.GG averageMonsterKill과 BSER monsterKill 모두 경기당 동물 처치 수 — character stats avg와 동일 단위',
      },
    },
    outlierMitigation: compareOutlierMitigation(teamRecoverValues),
    applicableCombos,
    insufficientCombos,
    recommendation39_11G: [
      '탱커: shieldDamageOffsetFromPlayer (exact combo baseline, T4 survival-adjusted 보조 검토)',
      '서포터: teamRecover (exact combo only, ccTimeToPlayer는 실험체별 exact combo)',
      'protectAbsorb는 진단용 유지, 점수 미반영',
      'viewContribution·monsterKill은 DAK.GG baseline 재사용 가능 — 39.11G에서 DB 필드로 보완',
      '이상치: p95 winsorization + 기존 robust normalization 조합 권장',
      '역할+티어 fallback은 teamRecover/shield/damageFromPlayer/ccTime에 사용하지 않음',
    ],
  }
}

export function formatCalibrationReportText(report: CalibrationReportBundle): string {
  const lines: string[] = [
    '=== ERCraft Role Metric Calibration (39.11F) ===',
    `generatedAt: ${report.generatedAt}`,
    '',
    '1. 기존 표본 편향',
    `   total rows: ${report.sampleBalance.totalRows}`,
    `   current season (S${CURRENT_DISPLAY_SEASON}): ${report.sampleBalance.currentSeasonRows}`,
    `   top3 combo share: ${(report.sampleBalance.topCombosShare * 100).toFixed(1)}%`,
    `   uid top1 share: ${(report.sampleBalance.uidConcentration.top1Share * 100).toFixed(1)}%`,
    `   ${report.sampleBalance.backfillBiasNote}`,
    `   ${report.sampleBalance.dakBaselineNote}`,
    '',
    '2. 지표별 0 비율과 양수 표본 (global)',
  ]

  for (const field of ROLE_METRIC_FIELD_NAMES) {
    const m = report.metricReadiness.global[field]
    lines.push(
      `   ${field}: zeroRate=${m.zeroRate.toFixed(3)} positive=${m.positiveCount} readiness=${m.readiness}`,
    )
  }

  lines.push('', '3. protectAbsorb 중복')
  lines.push(`   pearson=${report.protectAbsorb.pearson ?? 'null'} exactMatchRate=${report.protectAbsorb.exactMatchRate.toFixed(3)}`)
  lines.push(`   ${report.protectAbsorb.recommendation}`)

  lines.push('', '4. 분당 지표')
  lines.push(`   ${report.perMinute.note}`)

  lines.push('', '5. 탱커 후보 산식')
  for (const c of report.tankerCandidates.comparisons) {
    lines.push(`   ${c.label}: winCorr=${c.winRateCorrelation ?? 'null'} n=${c.sampleCount}`)
  }

  lines.push('', '6. 서포터 후보 산식')
  for (const c of report.supporterCandidates.comparisons) {
    lines.push(`   ${c.label}: winCorr=${c.winRateCorrelation ?? 'null'} n=${c.sampleCount}`)
  }

  lines.push('', '7. teamRecover 서포터 실험체')
  for (const c of report.supporterCandidates.teamRecoverByCharacter) {
    lines.push(`   ${c.label}: n=${c.sampleCount} zeroRate=${c.zeroRate.toFixed(2)} readiness=${c.readiness}`)
  }

  lines.push('', '8. DAK.GG 호환')
  lines.push(`   viewContribution: ${report.dakCompatibility.viewContribution.note}`)
  lines.push(`   monsterKill: ${report.dakCompatibility.monsterKill.note}`)

  lines.push('', '9. 이상치 완화')
  for (const o of report.outlierMitigation) {
    lines.push(`   ${o.method}: stdDev=${o.stdDev ?? 'null'} rankStability=${o.rankStability ?? 'null'}`)
  }

  lines.push('', '10. 적용 가능 exact combo', ...report.applicableCombos.slice(0, 15).map((k) => `   - ${k}`))
  lines.push('', '11. 표본 부족 (일부)', ...report.insufficientCombos.slice(0, 15).map((k) => `   - ${k}`))
  lines.push('', '12. 39.11G 권장', ...report.recommendation39_11G.map((r) => `   - ${r}`))

  return lines.join('\n')
}

export function toCalibrationRow(row: {
  gameId: string
  uid: string
  characterNum: number
  bestWeapon: number | null
  rpAfter: number | null
  displaySeasonId: number
  deaths: number | null
  kills: number | null
  assists: number | null
  teamKills: number | null
  damageToPlayer: number | null
  victory: boolean | null
  placement: number | null
  gameDuration: number | null
  playedAt: Date
  damageFromPlayer: number | null
  protectAbsorb: number | null
  shieldDamageOffsetFromPlayer: number | null
  teamRecover: number | null
  ccTimeToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
}): CalibrationRow {
  const snapshot = toRowSnapshot(row)
  return {
    ...snapshot,
    uidHash: hashUid(row.uid),
    gameDuration: row.gameDuration,
    victory: row.victory,
    placement: row.placement,
    assists: row.assists,
    kills: row.kills,
    damageToPlayerDealt: row.damageToPlayer,
    teamKills: row.teamKills,
    playedAt: row.playedAt.toISOString(),
  }
}
