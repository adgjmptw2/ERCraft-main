import {
  MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE,
  MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE,
  MATCH_GRADE_S_ROLE_SCORE_GATE,
  scoreToFineGrade,
  type CharacterFineGrade,
} from '../../services/characterPerformanceGrade/config.js'
import { clamp } from '../../services/characterPerformanceGrade/metrics.js'

export type OutcomeCapCandidateId = 'A' | 'B' | 'C'
export type OutcomeCapGateMode = 'production-gate' | 'v2-placement-guard'

export interface OutcomeCapInput {
  roleScore: number
  placement: number
  outcomeScore?: number | null
}

export interface OutcomeCapResult {
  candidate: OutcomeCapCandidateId
  gateMode: OutcomeCapGateMode
  adjustment: number
  score: number
  grade: CharacterFineGrade
}

export function isOutcomeCapEvaluationMode(gameMode: string | null | undefined): boolean {
  return gameMode === 'rank'
}

export const OUTCOME_CAP_ADJUSTMENTS: Record<OutcomeCapCandidateId, Record<number, number>> = {
  A: {
    1: 6,
    2: 4.5,
    3: 3,
    4: 1,
    5: -1,
    6: -3,
    7: -4.5,
    8: -6,
  },
  B: {
    1: 8,
    2: 6,
    3: 4,
    4: 1.5,
    5: -1.5,
    6: -4,
    7: -6,
    8: -8,
  },
  C: {
    1: 10,
    2: 7.5,
    3: 5,
    4: 2,
    5: -2,
    6: -5,
    7: -7.5,
    8: -10,
  },
}

export function placementAdjustment(
  candidate: OutcomeCapCandidateId,
  placement: number,
): number | null {
  return OUTCOME_CAP_ADJUSTMENTS[candidate][placement] ?? null
}

export function computeOutcomeCapScore(
  candidate: OutcomeCapCandidateId,
  input: OutcomeCapInput,
): number | null {
  const adjustment = placementAdjustment(candidate, input.placement)
  if (adjustment == null || !Number.isFinite(input.roleScore)) return null
  return round2(clamp(input.roleScore + adjustment, 0, 100))
}

function productionGateCappedScore(params: {
  score: number
  roleScore: number
  outcomeScore?: number | null
}): number {
  let cappedScore = params.score
  const outcomeScore = params.outcomeScore ?? null

  if (
    cappedScore >= 95 &&
    (params.roleScore < MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE ||
      outcomeScore == null ||
      outcomeScore < MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE)
  ) {
    cappedScore = 94.99
  }

  if (cappedScore >= 84 && params.roleScore < MATCH_GRADE_S_ROLE_SCORE_GATE) {
    cappedScore = 83.99
  }

  return cappedScore
}

function v2PlacementGuardCappedScore(params: {
  score: number
  roleScore: number
  placement: number
}): number {
  let cappedScore = params.score

  if (
    cappedScore >= 95 &&
    (params.roleScore < MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE || params.placement > 3)
  ) {
    cappedScore = 94.99
  }

  if (params.placement >= 7 && cappedScore >= 72) {
    cappedScore = 71.99
  }

  if (cappedScore >= 84 && params.roleScore < MATCH_GRADE_S_ROLE_SCORE_GATE) {
    cappedScore = 83.99
  }

  return cappedScore
}

export function gradeOutcomeCapScore(params: {
  score: number
  roleScore: number
  placement: number
  outcomeScore?: number | null
  gateMode: OutcomeCapGateMode
}): CharacterFineGrade {
  const cappedScore =
    params.gateMode === 'production-gate'
      ? productionGateCappedScore(params)
      : v2PlacementGuardCappedScore(params)
  return scoreToFineGrade(cappedScore)
}

export function evaluateOutcomeCapCandidate(params: {
  candidate: OutcomeCapCandidateId
  input: OutcomeCapInput
  gateMode: OutcomeCapGateMode
}): OutcomeCapResult | null {
  const adjustment = placementAdjustment(params.candidate, params.input.placement)
  const score = computeOutcomeCapScore(params.candidate, params.input)
  if (adjustment == null || score == null) return null

  return {
    candidate: params.candidate,
    gateMode: params.gateMode,
    adjustment,
    score,
    grade: gradeOutcomeCapScore({
      score,
      roleScore: params.input.roleScore,
      placement: params.input.placement,
      outcomeScore: params.input.outcomeScore,
      gateMode: params.gateMode,
    }),
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
