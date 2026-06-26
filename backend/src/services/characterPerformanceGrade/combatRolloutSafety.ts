import type { RolloutAuditSummary } from '../../audit/gradeExplanationTypes.js'
import { summarizeGradeChanges } from '../../audit/roleMetricShadow.js'
import type { CharacterFineGrade } from './config.js'

export const COMBAT_ROLLOUT_SAFETY_CONFIG = {
  maxMeanAbsScoreDelta: 5,
  maxAbsScoreDelta: 10,
  maxCoarseBucketChangeRate: 0.1,
  maxTwoPlusStepChangeRate: 0.05,
  minGroupCountForAutoReview: 10,
} as const

export type CombatRolloutSafetyReason =
  | 'mean-delta-exceeded'
  | 'max-delta-exceeded'
  | 'coarse-change-rate-exceeded'
  | 'two-plus-step-rate-exceeded'
  | 'review-needed-small-sample-coarse-change'

export interface ExactKeyRolloutSafetyInput {
  groupCount: number
  meanScoreDelta: number | null
  meanAbsScoreDelta: number | null
  maxAbsScoreDelta: number | null
  coarseBucketChangeRate: number | null
  twoPlusStepChangeRate: number | null
  coarseChangeCount?: number
}

export interface ExactKeyRolloutSafetyResult {
  blocklistPass: boolean
  reviewNeeded: boolean
  reasons: CombatRolloutSafetyReason[]
}

export function evaluateExactKeyRolloutSafety(
  input: ExactKeyRolloutSafetyInput,
): ExactKeyRolloutSafetyResult {
  const reasons: CombatRolloutSafetyReason[] = []
  const meanAbs = input.meanAbsScoreDelta ?? Math.abs(input.meanScoreDelta ?? 0)
  const config = COMBAT_ROLLOUT_SAFETY_CONFIG

  if (meanAbs > config.maxMeanAbsScoreDelta) {
    reasons.push('mean-delta-exceeded')
  }
  if ((input.maxAbsScoreDelta ?? 0) > config.maxAbsScoreDelta) {
    reasons.push('max-delta-exceeded')
  }
  if ((input.coarseBucketChangeRate ?? 0) > config.maxCoarseBucketChangeRate) {
    reasons.push('coarse-change-rate-exceeded')
  }
  if ((input.twoPlusStepChangeRate ?? 0) > config.maxTwoPlusStepChangeRate) {
    reasons.push('two-plus-step-rate-exceeded')
  }

  const reviewNeeded =
    input.groupCount < config.minGroupCountForAutoReview &&
    (input.coarseChangeCount ?? 0) > 0
  if (reviewNeeded) {
    reasons.push('review-needed-small-sample-coarse-change')
  }

  const blocklistPass = reasons.length === 0
  return { blocklistPass, reviewNeeded, reasons }
}

export function summarizeExactKeyRolloutSafety(
  pairs: ReadonlyArray<{
    before: number | null
    after: number | null
    beforeGrade: CharacterFineGrade | null
    afterGrade: CharacterFineGrade | null
    coarseChanged?: boolean
  }>,
): ExactKeyRolloutSafetyInput & ExactKeyRolloutSafetyResult & RolloutAuditSummary {
  const summary = summarizeGradeChanges(pairs)
  const coarseChangeCount = pairs.filter((pair) => pair.coarseChanged).length
  const safety = evaluateExactKeyRolloutSafety({
    groupCount: pairs.length,
    meanScoreDelta: summary.meanScoreDelta,
    meanAbsScoreDelta: summary.meanAbsScoreDelta,
    maxAbsScoreDelta: summary.maxScoreDelta,
    coarseBucketChangeRate: summary.coarseBucketChangeRate,
    twoPlusStepChangeRate: summary.twoPlusStepChangeRate,
    coarseChangeCount,
  })
  return {
    generatedAt: new Date().toISOString(),
    appliedGroupCount: 0,
    legacyGroupCount: 0,
    meanScoreDelta: summary.meanScoreDelta,
    medianScoreDelta: summary.medianScoreDelta,
    meanAbsScoreDelta: summary.meanAbsScoreDelta,
    p90AbsScoreDelta: null,
    p95AbsScoreDelta: null,
    maxIncrease: null,
    maxDecrease: null,
    maxAbsScoreDelta: summary.maxScoreDelta,
    sameGradeRate: null,
    oneStepChangeRate: summary.oneStepChangeRate,
    twoPlusStepChangeRate: summary.twoPlusStepChangeRate,
    coarseBucketChangeRate: summary.coarseBucketChangeRate,
    groupCount: pairs.length,
    coarseChangeCount,
    ...safety,
  }
}

export function shouldBlockExactKeyFromRolloutSafety(
  input: ExactKeyRolloutSafetyInput & { coarseChangeCount?: number },
): boolean {
  return !evaluateExactKeyRolloutSafety(input).blocklistPass
}
