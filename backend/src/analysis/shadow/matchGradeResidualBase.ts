import { scoreToFineGrade, type CharacterFineGrade } from '../../services/characterPerformanceGrade/config.js'
import {
  MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE,
  MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE,
  MATCH_GRADE_S_ROLE_SCORE_GATE,
} from '../../services/characterPerformanceGrade/config.js'
import { clamp } from '../../services/characterPerformanceGrade/metrics.js'
import { placementAdjustment } from './matchGradeOutcomeCap.js'

export type ResidualBaseCandidateId = 'R8' | 'R10' | 'R12'
export type ResidualGateMode = 'production-gate' | 'residual-gate'

export interface RobustScaleStats {
  median: number | null
  mad: number | null
  iqr: number | null
  scale: number | null
  scaleSource: 'mad' | 'iqr' | 'unavailable'
  safeMinimum: number
}

export interface ResidualGateThresholds {
  robustZP70: number
  robustZP95: number
}

export interface ResidualBaseInput {
  roleResidual: number
  productionRoleScore?: number | null
  productionOutcomeScore?: number | null
  placement: number
  robustStats: RobustScaleStats
  gradeCenter: number
}

export interface ResidualBaseResult {
  candidate: ResidualBaseCandidateId
  gateMode: ResidualGateMode
  robustZ: number
  score: number
  grade: CharacterFineGrade
  placementModifier: number
}

export const RESIDUAL_BASE_MULTIPLIER: Record<ResidualBaseCandidateId, number> = {
  R8: 8,
  R10: 10,
  R12: 12,
}

export const RESIDUAL_PLACEMENT_CANDIDATE = 'A'

export function computeRobustZ(input: {
  roleResidual: number
  stats: RobustScaleStats
}): number | null {
  const { roleResidual, stats } = input
  if (stats.median == null || stats.scale == null || stats.scale <= 0) return null
  if (!Number.isFinite(roleResidual)) return null
  return round6(clamp((roleResidual - stats.median) / stats.scale, -3, 3))
}

export function computeResidualBaseScore(params: {
  candidate: ResidualBaseCandidateId
  input: ResidualBaseInput
}): { score: number; robustZ: number; placementModifier: number } | null {
  const placementModifier = placementAdjustment(RESIDUAL_PLACEMENT_CANDIDATE, params.input.placement)
  const robustZ = computeRobustZ({
    roleResidual: params.input.roleResidual,
    stats: params.input.robustStats,
  })
  if (placementModifier == null || robustZ == null) return null

  return {
    robustZ,
    placementModifier,
    score: round2(
      clamp(
        params.input.gradeCenter +
          robustZ * RESIDUAL_BASE_MULTIPLIER[params.candidate] +
          placementModifier,
        0,
        100,
      ),
    ),
  }
}

export function gradeResidualBaseScore(params: {
  score: number
  robustZ: number
  placement: number
  productionRoleScore?: number | null
  productionOutcomeScore?: number | null
  thresholds: ResidualGateThresholds
  gateMode: ResidualGateMode
}): CharacterFineGrade {
  if (params.gateMode === 'production-gate') {
    let cappedScore = params.score
    const roleScore = params.productionRoleScore ?? null
    const outcomeScore = params.productionOutcomeScore ?? null
    if (
      cappedScore >= 95 &&
      (roleScore == null ||
        roleScore < MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE ||
        outcomeScore == null ||
        outcomeScore < MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE)
    ) {
      cappedScore = 94.99
    }
    if (cappedScore >= 84 && (roleScore == null || roleScore < MATCH_GRADE_S_ROLE_SCORE_GATE)) {
      cappedScore = 83.99
    }
    return scoreToFineGrade(cappedScore)
  }

  let cappedScore = params.score
  if (params.placement >= 7 && cappedScore >= 84) cappedScore = 83.99
  if (cappedScore >= 95 && (params.robustZ < params.thresholds.robustZP95 || params.placement > 3)) {
    cappedScore = 94.99
  }
  if (cappedScore >= 84 && params.robustZ < params.thresholds.robustZP70) {
    cappedScore = 83.99
  }
  return scoreToFineGrade(cappedScore)
}

export function evaluateResidualBaseCandidate(params: {
  candidate: ResidualBaseCandidateId
  input: ResidualBaseInput
  thresholds: ResidualGateThresholds
  gateMode: ResidualGateMode
}): ResidualBaseResult | null {
  const score = computeResidualBaseScore(params)
  if (!score) return null
  return {
    candidate: params.candidate,
    gateMode: params.gateMode,
    robustZ: score.robustZ,
    score: score.score,
    placementModifier: score.placementModifier,
    grade: gradeResidualBaseScore({
      score: score.score,
      robustZ: score.robustZ,
      placement: params.input.placement,
      productionRoleScore: params.input.productionRoleScore,
      productionOutcomeScore: params.input.productionOutcomeScore,
      thresholds: params.thresholds,
      gateMode: params.gateMode,
    }),
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
