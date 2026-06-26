import shadowArtifact from '../data/overallGrade/player-season-benchmark.shadow.v1.json' with { type: 'json' }
import type { CharacterFineGrade, CharacterGradeRole, SeasonCharacterAggregateContract } from '../contracts/player.js'
import type { PlayerMatchRow } from '../utils/playerMatchDedup.js'
import type { RankTier } from '../utils/rankTier.js'
import { isGradeSupportedMode } from '../types/matchesMode.js'
import {
  computeOverallAggregateGradeV2,
  OVERALL_AGGREGATE_GRADE_VERSION,
  type AggregateMatchScoreEntry,
} from './aggregateGrade.js'
import { lookupCharacterWeaponRole } from './characterPerformanceGrade/baselineStore.js'
import {
  computeMatchPerformanceGrade,
  playerMatchRowToGradeInput,
} from './characterPerformanceGrade/compute.js'
import { AGGREGATE_GRADE_RUNTIME_VERSION } from './gradeRuntimeConfig.js'

export const OVERALL_GRADE_VERSION = 'overall-grade-v2-hybrid.v1'

export type OverallGradeSource =
  | 'overall-v2-hybrid'
  | 'character-grade-weighted-average-fallback'
  | 'overall-aggregate-grade-v2'
  | 'overall-aggregate-grade-v3'
  | 'overall-aggregate-grade-v4'

export type OverallConfidenceLabel = 'high' | 'medium' | 'low' | 'insufficient'
export type OverallGrade = CharacterFineGrade

export interface OverallGradeV2Result {
  overallGradeVersion: typeof OVERALL_GRADE_VERSION | typeof OVERALL_AGGREGATE_GRADE_VERSION
  overallPerformanceScore: number | null
  overallGrade: OverallGrade | null
  overallScoreSource: OverallGradeSource
  basePerformanceScore: number | null
  outcomePerformanceScore: number | null
  consistencyScore: number | null
  outcomeModifier: number
  consistencyModifier: number
  totalModifier: number
  overallConfidence: number
  overallConfidenceLabel: OverallConfidenceLabel
  weightedMatchCount: number
  gradedCharacterCount: number
  sourceFingerprint?: string
  computedAt?: string
}

interface ShadowRow {
  canonicalUserNum: string
  matchMode: string
  outcomePerformanceScore: number | null
  consistencyScore: number | null
  confidence: number
  confidenceLabel: OverallConfidenceLabel
  completeness?: {
    outcome?: boolean
    consistency?: boolean
    metricCoverage?: number
  }
}

interface ShadowArtifact {
  rows: ShadowRow[]
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function scoreToOverallGrade(score: number | null): OverallGrade | null {
  if (score == null || !Number.isFinite(score)) return null
  if (score >= 88) return 'S'
  if (score >= 72) return 'A'
  if (score >= 56) return 'B'
  if (score >= 38) return 'C'
  return 'D'
}

export function resolveCharacterWeightedBaseScore(rows: ReadonlyArray<SeasonCharacterAggregateContract>): {
  baseScore: number | null
  weightedMatchCount: number
  gradedCharacterCount: number
} {
  let weightedScoreSum = 0
  let weightedMatchCount = 0
  let gradedCharacterCount = 0

  for (const row of rows) {
    if (row.gradeStatus !== 'ok') continue
    if (row.gradeScore == null || !Number.isFinite(row.gradeScore)) continue
    const weight =
      row.gradeSampleSize != null &&
      Number.isFinite(row.gradeSampleSize) &&
      row.gradeSampleSize > 0
        ? row.gradeSampleSize
        : row.games
    if (!Number.isFinite(weight) || weight <= 0) continue
    weightedScoreSum += row.gradeScore * weight
    weightedMatchCount += weight
    gradedCharacterCount += 1
  }

  return {
    baseScore: weightedMatchCount > 0 ? round(weightedScoreSum / weightedMatchCount) : null,
    weightedMatchCount,
    gradedCharacterCount,
  }
}

export function computeOverallGradeV2Hybrid(params: {
  baseScore: number | null
  weightedMatchCount: number
  gradedCharacterCount: number
  outcomePerformanceScore: number | null
  consistencyScore: number | null
  matchMode: string | null | undefined
  confidence: number | null
  confidenceLabel: OverallConfidenceLabel | null
  sourceFingerprint?: string
  computedAt?: Date
}): OverallGradeV2Result | null {
  const baseScore = params.baseScore
  if (baseScore == null || !Number.isFinite(baseScore)) return null

  const fallback = (reasonConfidence: OverallConfidenceLabel = params.confidenceLabel ?? 'insufficient'): OverallGradeV2Result => ({
    overallGradeVersion: OVERALL_GRADE_VERSION,
    overallPerformanceScore: round(baseScore),
    overallGrade: scoreToOverallGrade(baseScore),
    overallScoreSource: 'character-grade-weighted-average-fallback',
    basePerformanceScore: round(baseScore),
    outcomePerformanceScore: params.outcomePerformanceScore,
    consistencyScore: params.consistencyScore,
    outcomeModifier: 0,
    consistencyModifier: 0,
    totalModifier: 0,
    overallConfidence: params.confidence ?? 0,
    overallConfidenceLabel: reasonConfidence,
    weightedMatchCount: params.weightedMatchCount,
    gradedCharacterCount: params.gradedCharacterCount,
    sourceFingerprint: params.sourceFingerprint,
    computedAt: params.computedAt?.toISOString(),
  })

  if (!isGradeSupportedMode(params.matchMode)) return fallback('insufficient')
  if (params.weightedMatchCount < 20) return fallback('insufficient')
  if (
    params.outcomePerformanceScore == null ||
    !Number.isFinite(params.outcomePerformanceScore) ||
    params.consistencyScore == null ||
    !Number.isFinite(params.consistencyScore)
  ) {
    return fallback()
  }
  if (params.confidenceLabel === 'insufficient') return fallback('insufficient')

  const outcomeModifier = clamp((params.outcomePerformanceScore - 65) * 0.2, -4, 4)
  const consistencyModifier = clamp((params.consistencyScore - 65) * 0.1, -2, 2)
  const unclamped = clamp(baseScore + outcomeModifier + consistencyModifier, 0, 100)
  const finalScore = clamp(unclamped, baseScore - 6, baseScore + 6)
  const totalModifier = finalScore - baseScore

  return {
    overallGradeVersion: OVERALL_GRADE_VERSION,
    overallPerformanceScore: round(finalScore),
    overallGrade: scoreToOverallGrade(finalScore),
    overallScoreSource: 'overall-v2-hybrid',
    basePerformanceScore: round(baseScore),
    outcomePerformanceScore: round(params.outcomePerformanceScore),
    consistencyScore: round(params.consistencyScore),
    outcomeModifier: round(outcomeModifier),
    consistencyModifier: round(consistencyModifier),
    totalModifier: round(totalModifier),
    overallConfidence: params.confidence ?? 0,
    overallConfidenceLabel: params.confidenceLabel ?? 'low',
    weightedMatchCount: params.weightedMatchCount,
    gradedCharacterCount: params.gradedCharacterCount,
    sourceFingerprint: params.sourceFingerprint,
    computedAt: params.computedAt?.toISOString(),
  }
}

export function resolveOverallV2ShadowComponents(params: {
  canonicalUserNum: number
  matchMode?: string
}): {
  outcomePerformanceScore: number | null
  consistencyScore: number | null
  confidence: number | null
  confidenceLabel: OverallConfidenceLabel | null
} {
  const matchMode = params.matchMode ?? 'rank'
  if (!isGradeSupportedMode(matchMode)) {
    return {
      outcomePerformanceScore: null,
      consistencyScore: null,
      confidence: null,
      confidenceLabel: 'insufficient',
    }
  }
  const artifact = shadowArtifact as ShadowArtifact
  const row = artifact.rows.find(
    (entry) =>
      entry.canonicalUserNum === String(params.canonicalUserNum) &&
      entry.matchMode === matchMode,
  )
  if (!row) {
    return {
      outcomePerformanceScore: null,
      consistencyScore: null,
      confidence: null,
      confidenceLabel: 'insufficient',
    }
  }
  const complete = row.completeness?.outcome === true && row.completeness?.consistency === true
  return {
    outcomePerformanceScore: complete ? row.outcomePerformanceScore : null,
    consistencyScore: complete ? row.consistencyScore : null,
    confidence: row.confidence,
    confidenceLabel: row.confidenceLabel,
  }
}

export function computeOverallGradeV2ForCharacterStats(params: {
  canonicalUserNum: number
  matchMode?: string
  characterStats: ReadonlyArray<SeasonCharacterAggregateContract>
  rows?: ReadonlyArray<PlayerMatchRow>
  playerTier?: RankTier | null
  sourceFingerprint?: string
  computedAt?: Date
}): OverallGradeV2Result | null {
  if (
    (AGGREGATE_GRADE_RUNTIME_VERSION === 'v2-k5-calibrated' ||
      AGGREGATE_GRADE_RUNTIME_VERSION === 'v3-shared-fine-cuts' ||
      AGGREGATE_GRADE_RUNTIME_VERSION === 'v4-shared-fine-cuts-k1') &&
    params.rows
  ) {
    const entries: AggregateMatchScoreEntry[] = []
    for (const row of params.rows) {
      if (!isGradeSupportedMode(row.gameMode)) continue
      const input = playerMatchRowToGradeInput(row)
      const weaponTypeId = input?.weaponTypeId ?? null
      if (weaponTypeId == null || weaponTypeId <= 0) continue
      const role: CharacterGradeRole | null = lookupCharacterWeaponRole(row.characterNum, weaponTypeId)
      if (!role) continue
      const match = computeMatchPerformanceGrade({
        row,
        playerTier: params.playerTier ?? null,
        displaySeasonId: row.displaySeasonId,
      })
      if (match.matchGradeScore == null || !Number.isFinite(match.matchGradeScore)) continue
      entries.push({ score: match.matchGradeScore, role })
    }
    return computeOverallAggregateGradeV2({
      entries,
      gradedCharacterCount: params.characterStats.filter((row) => row.gradeStatus === 'ok').length,
      sourceFingerprint: params.sourceFingerprint,
      computedAt: params.computedAt,
    })
  }

  const base = resolveCharacterWeightedBaseScore(params.characterStats)
  const components = resolveOverallV2ShadowComponents({
    canonicalUserNum: params.canonicalUserNum,
    matchMode: params.matchMode,
  })
  return computeOverallGradeV2Hybrid({
    baseScore: base.baseScore,
    weightedMatchCount: base.weightedMatchCount,
    gradedCharacterCount: base.gradedCharacterCount,
    outcomePerformanceScore: components.outcomePerformanceScore,
    consistencyScore: components.consistencyScore,
    matchMode: params.matchMode ?? 'rank',
    confidence: components.confidence,
    confidenceLabel: components.confidenceLabel,
    sourceFingerprint: params.sourceFingerprint,
    computedAt: params.computedAt,
  })
}
