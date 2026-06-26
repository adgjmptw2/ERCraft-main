import type {
  OverallGradeV2Contract,
  ProductionAnalysisAxesContract,
  ProductionAnalysisAxisContract,
  ProductionAnalysisAxisRowContract,
  SeasonCharacterAggregateContract,
} from '../../contracts/player.js'
import type { RankTier } from '../../utils/rankTier.js'
import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import { isGradeSupportedMode } from '../../types/matchesMode.js'
import {
  CHARACTER_GRADE_METRIC_PRESET_VERSION,
  type CharacterGradeRole,
} from '../characterPerformanceGrade/config.js'
import { computeMatchPerformanceGrade } from '../characterPerformanceGrade/compute.js'
import {
  ROBUST_AGGREGATE_HIGH_TAIL_WEIGHT,
  ROBUST_AGGREGATE_LOW_TAIL_WEIGHT,
  ROBUST_AGGREGATE_MIN_SAMPLE,
} from '../aggregateGrade.js'

export const PRODUCTION_ANALYSIS_AXES_VERSION = 'production-analysis-axes.v1.1'
export const PRODUCTION_ANALYSIS_REFERENCE_SCORE = 65 as const

const AXIS_ORDER: ProductionAnalysisAxisContract[] = [
  'survival',
  'combat',
  'macro',
  'support',
  'finish',
  'consistency',
]

const AXIS_LABELS: Record<ProductionAnalysisAxisContract, string> = {
  survival: '생존',
  combat: '교전',
  macro: '운영',
  support: '지원',
  finish: '마무리',
  consistency: '일관성',
}

const AXIS_DESCRIPTIONS: Record<ProductionAnalysisAxisContract, string> = {
  survival: 'production 생존 지표 기준입니다.',
  combat: 'production 피해와 교전 기여 지표를 기존 가중치로 합산합니다.',
  macro: 'production 야생동물/운영 지표 기준입니다.',
  support: 'production 시야 지표 기준입니다.',
  finish: 'production 경기 결과 성과 기준입니다.',
  consistency: 'production 경기점수 안정성 기준입니다.',
}

const METRIC_LABELS: Record<string, string> = {
  damage: '피해',
  combatContribution: '교전 기여',
  survival: '생존',
  vision: '시야',
  monster: '야생동물',
  matchGradeOutcomeScore: '경기 결과',
  matchGradeScore: '경기 성과',
  consistency: '경기점수 안정성',
}

type EvidenceMetric =
  | 'damage'
  | 'combatContribution'
  | 'survival'
  | 'vision'
  | 'monster'

type MatchEvidence = NonNullable<
  ReturnType<typeof computeMatchPerformanceGrade>['matchGradeMetricEvidence']
>[number]

interface ScoredMatch {
  row: PlayerMatchRow
  score: number
  role: CharacterGradeRole | null
  evidence: MatchEvidence[]
  outcomeScore: number | null
  outcomeSource: 'matchGradeOutcomeScore' | 'matchGradeScore'
}

interface WeightedMatch extends ScoredMatch {
  weight: number
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 10 ** digits) / 10 ** digits
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function weightedAverage(entries: ReadonlyArray<{ value: number | null; weight: number }>): number | null {
  let weighted = 0
  let total = 0
  for (const entry of entries) {
    if (!finite(entry.value) || !Number.isFinite(entry.weight) || entry.weight <= 0) continue
    weighted += entry.value * entry.weight
    total += entry.weight
  }
  return total > 0 ? weighted / total : null
}

export function computeProductionConsistencyScore(scores: ReadonlyArray<number>): number | null {
  const values = scores.filter(finite)
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  const stdDev = Math.sqrt(variance)
  return round(clampScore(100 - stdDev * 2), 2)
}

function scoreRows(
  rows: ReadonlyArray<PlayerMatchRow>,
  params: { playerTier: RankTier | null; displaySeasonId: number },
): ScoredMatch[] {
  const result: ScoredMatch[] = []
  for (const row of rows) {
    if (!isGradeSupportedMode(row.gameMode)) continue
    const grade = computeMatchPerformanceGrade({
      row,
      playerTier: params.playerTier,
      displaySeasonId: row.displaySeasonId ?? params.displaySeasonId,
    })
    if (!finite(grade.matchGradeScore)) continue
    result.push({
      row,
      score: grade.matchGradeScore,
      role: grade.matchGradeRole ?? null,
      evidence: grade.matchGradeMetricEvidence ?? [],
      outcomeScore:
        finite(grade.matchGradeOutcomeScore)
          ? grade.matchGradeOutcomeScore
          : grade.matchGradeScore,
      outcomeSource: finite(grade.matchGradeOutcomeScore)
        ? 'matchGradeOutcomeScore'
        : 'matchGradeScore',
    })
  }
  return result
}

function applyCharacterMatchWeights(matches: ReadonlyArray<ScoredMatch>): WeightedMatch[] {
  if (matches.length < ROBUST_AGGREGATE_MIN_SAMPLE) {
    return matches.map((match) => ({ ...match, weight: 1 }))
  }
  const sorted = matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) => (a.match.score === b.match.score ? a.index - b.index : a.match.score - b.match.score))
  const tailCount = Math.ceil(sorted.length * 0.1)
  const weights = new Map<number, number>()
  sorted.forEach((entry, index) => {
    const weight =
      index < tailCount
        ? ROBUST_AGGREGATE_LOW_TAIL_WEIGHT
        : index >= sorted.length - tailCount
          ? ROBUST_AGGREGATE_HIGH_TAIL_WEIGHT
          : 1
    weights.set(entry.index, weight)
  })
  return matches.map((match, index) => ({ ...match, weight: weights.get(index) ?? 1 }))
}

function applyOverallMatchWeights(matches: ReadonlyArray<ScoredMatch>): WeightedMatch[] {
  return matches.map((match) => ({ ...match, weight: 1 }))
}

function componentFromEvidence(
  matches: ReadonlyArray<WeightedMatch>,
  metric: EvidenceMetric,
): ProductionAnalysisAxisRowContract['components'][number] | null {
  const componentRows = matches.flatMap((match) => {
    const evidence = match.evidence.find((entry) => entry.metric === metric)
    if (!evidence || !finite(evidence.adjustedMetricScore)) return []
    return [{
      score: evidence.adjustedMetricScore,
      actualValue: evidence.actualValue,
      expectedValue: evidence.expectedValue,
      ratio: evidence.ratio,
      metricWeight: evidence.weight,
      matchWeight: match.weight,
    }]
  })
  if (componentRows.length === 0) return null
  const score = weightedAverage(
    componentRows.map((row) => ({ value: row.score, weight: row.matchWeight })),
  )
  const actualValue = weightedAverage(
    componentRows.map((row) => ({ value: row.actualValue, weight: row.matchWeight })),
  )
  const expectedValue = weightedAverage(
    componentRows.map((row) => ({ value: row.expectedValue, weight: row.matchWeight })),
  )
  const ratio = weightedAverage(
    componentRows.map((row) => ({ value: row.ratio, weight: row.matchWeight })),
  )
  const metricWeight = weightedAverage(
    componentRows.map((row) => ({ value: row.metricWeight, weight: row.matchWeight })),
  )
  return {
    metric,
    label: METRIC_LABELS[metric],
    score: round(score),
    weight: round(metricWeight),
    contribution: null,
    actualValue: round(actualValue, 4),
    expectedValue: round(expectedValue, 4),
    ratio: round(ratio, 4),
  }
}

function statusFor(sampleCount: number, totalCount: number): ProductionAnalysisAxisRowContract['status'] {
  if (sampleCount <= 0) return 'unavailable'
  return sampleCount >= totalCount ? 'ready' : 'partial'
}

function evidenceAxis(
  axis: ProductionAnalysisAxisContract,
  matches: ReadonlyArray<WeightedMatch>,
  metrics: EvidenceMetric[],
): ProductionAnalysisAxisRowContract {
  const components = metrics.flatMap((metric) => {
    const component = componentFromEvidence(matches, metric)
    return component ? [component] : []
  })
  const totalProductionWeight = components.reduce((sum, row) => sum + (row.weight ?? 0), 0)
  const score =
    totalProductionWeight > 0
      ? components.reduce((sum, row) => sum + (row.score ?? 0) * ((row.weight ?? 0) / totalProductionWeight), 0)
      : null
  const withContribution = components.map((row) => ({
    ...row,
    contribution:
      score == null || totalProductionWeight <= 0 || row.score == null || row.weight == null
        ? null
        : round(row.score * (row.weight / totalProductionWeight)),
  }))
  const sampleCount = matches.filter((match) =>
    metrics.some((metric) => match.evidence.some((entry) => entry.metric === metric && finite(entry.adjustedMetricScore))),
  ).length
  return {
    axis,
    label: AXIS_LABELS[axis],
    score: round(score),
    referenceScore: PRODUCTION_ANALYSIS_REFERENCE_SCORE,
    status: statusFor(sampleCount, matches.length),
    sampleCount,
    components: withContribution,
    description: AXIS_DESCRIPTIONS[axis],
  }
}

function finishAxis(matches: ReadonlyArray<WeightedMatch>): ProductionAnalysisAxisRowContract {
  const scored = matches.filter((match) => finite(match.outcomeScore))
  const values = scored.map((match) => ({ value: match.outcomeScore, weight: match.weight }))
  const score = weightedAverage(values)
  const hasOutcome = scored.some((match) => match.outcomeSource === 'matchGradeOutcomeScore')
  const sourceMetric = hasOutcome ? 'matchGradeOutcomeScore' : 'matchGradeScore'
  return {
    axis: 'finish',
    label: AXIS_LABELS.finish,
    score: round(score),
    referenceScore: PRODUCTION_ANALYSIS_REFERENCE_SCORE,
    status: statusFor(values.length, matches.length),
    sampleCount: values.length,
    components: values.length > 0 ? [{
      metric: sourceMetric,
      label: METRIC_LABELS[sourceMetric],
      score: round(score),
      weight: 100,
      contribution: round(score),
      actualValue: null,
      expectedValue: null,
      ratio: null,
    }] : [],
    description: AXIS_DESCRIPTIONS.finish,
  }
}

function consistencyAxis(matches: ReadonlyArray<WeightedMatch>): ProductionAnalysisAxisRowContract {
  const values = matches.map((match) => match.score).filter(finite)
  const score = computeProductionConsistencyScore(values)
  return {
    axis: 'consistency',
    label: AXIS_LABELS.consistency,
    score,
    referenceScore: PRODUCTION_ANALYSIS_REFERENCE_SCORE,
    status: score == null ? 'unavailable' : 'ready',
    sampleCount: values.length,
    components: score == null ? [] : [{
      metric: 'consistency',
      label: METRIC_LABELS.consistency,
      score,
      weight: 100,
      contribution: score,
      actualValue: round(weightedAverage(values.map((value) => ({ value, weight: 1 })))),
      expectedValue: PRODUCTION_ANALYSIS_REFERENCE_SCORE,
      ratio: null,
    }],
    description: AXIS_DESCRIPTIONS.consistency,
  }
}

function buildAxes(params: {
  matches: ReadonlyArray<WeightedMatch>
  scope: 'overall' | 'character'
  aggregationPolicy: string
}): ProductionAnalysisAxesContract {
  const axes = AXIS_ORDER.map((axis) => {
    switch (axis) {
      case 'survival':
        return evidenceAxis(axis, params.matches, ['survival'])
      case 'combat':
        return evidenceAxis(axis, params.matches, ['damage', 'combatContribution'])
      case 'macro':
        return evidenceAxis(axis, params.matches, ['monster'])
      case 'support':
        return evidenceAxis(axis, params.matches, ['vision'])
      case 'finish':
        return finishAxis(params.matches)
      case 'consistency':
        return consistencyAxis(params.matches)
    }
  })
  return {
    version: PRODUCTION_ANALYSIS_AXES_VERSION,
    metricPresetVersion: CHARACTER_GRADE_METRIC_PRESET_VERSION,
    scope: params.scope,
    sampleCount: params.matches.length,
    aggregationPolicy: params.aggregationPolicy,
    axes,
  }
}

export function buildProductionAnalysisAxesForRows(params: {
  rows: ReadonlyArray<PlayerMatchRow>
  playerTier: RankTier | null
  displaySeasonId: number
  scope: 'overall' | 'character'
}): ProductionAnalysisAxesContract {
  const scored = scoreRows(params.rows, {
    playerTier: params.playerTier,
    displaySeasonId: params.displaySeasonId,
  })
  const weighted =
    params.scope === 'character'
      ? applyCharacterMatchWeights(scored)
      : applyOverallMatchWeights(scored)
  const aggregationPolicy =
    params.scope === 'character' && scored.length >= ROBUST_AGGREGATE_MIN_SAMPLE
      ? 'production-character-robust-weighted-10pct'
      : params.scope === 'character'
        ? 'production-character-plain-mean'
        : 'production-overall-direct-match-mean'
  return buildAxes({ matches: weighted, scope: params.scope, aggregationPolicy })
}

export function attachProductionAnalysisAxes(params: {
  rows: ReadonlyArray<PlayerMatchRow>
  characterStats: ReadonlyArray<SeasonCharacterAggregateContract>
  overallGradeV2: OverallGradeV2Contract | null
  playerTier: RankTier | null
  displaySeasonId: number
}): {
  characterStats: SeasonCharacterAggregateContract[]
  overallAnalysisAxes: ProductionAnalysisAxesContract | null
} {
  const rowsByCharacter = new Map<number, PlayerMatchRow[]>()
  for (const row of params.rows) {
    const bucket = rowsByCharacter.get(row.characterNum) ?? []
    bucket.push(row)
    rowsByCharacter.set(row.characterNum, bucket)
  }

  const characterStats = params.characterStats.map((row) => {
    const rows = rowsByCharacter.get(row.characterNum) ?? []
    if (rows.length === 0) return row
    return {
      ...row,
      analysisAxes: buildProductionAnalysisAxesForRows({
        rows,
        playerTier: params.playerTier,
        displaySeasonId: params.displaySeasonId,
        scope: 'character',
      }),
    }
  })

  const overallAnalysisAxes = params.rows.length > 0
    ? buildProductionAnalysisAxesForRows({
        rows: params.rows,
        playerTier: params.playerTier,
        displaySeasonId: params.displaySeasonId,
        scope: 'overall',
      })
    : null

  return {
    characterStats,
    overallAnalysisAxes,
  }
}
